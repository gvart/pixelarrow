// Sim save and load (src/war/sim/index.ts saveRoot, exportState, importState): the graph of the sim's state as the TS
// sim hands it to state.ts, built from the C++ state (each module adds its own saveRoot), and read back into a fresh sim.
#include "sim.h"

#include <cmath>

#include "bosses.h"
#include "roster.h"
#include "sim_data.h"
#include "state.h"
#include "state_util.h"

namespace sim {

using state::Graph;
using state::Obj;
using state::TA;
using state::Val;

namespace {

const char *shape_name(Shape s) { return s == Shape::Column ? "column" : s == Shape::Wedge ? "wedge" : s == Shape::Loose ? "loose" : "line"; }
Shape shape_of(const std::string &s) { return s == "column" ? Shape::Column : s == "wedge" ? Shape::Wedge : s == "loose" ? Shape::Loose : Shape::Line; }
const char *missile_name(Missile m) { return m == STONE ? "stone" : m == JAVELIN ? "javelin" : "arrow"; }
Missile missile_of(const std::string &s) { return s == "stone" ? STONE : s == "javelin" ? JAVELIN : ARROW; }

} // namespace

// ---- Variant <-> graph (event dictionaries, orders, persons and items through their dictionary forms) ----

Val state_of(Graph &g, const godot::Variant &v) {
	switch (v.get_type()) {
		case godot::Variant::NIL: return Val::null();
		case godot::Variant::BOOL: return Val(bool(v));
		case godot::Variant::INT: return Val(double(int64_t(v)));
		case godot::Variant::FLOAT: return Val(double(v));
		case godot::Variant::STRING:
		case godot::Variant::STRING_NAME: return Val(std::string(godot::String(v).utf8().get_data()));
		case godot::Variant::DICTIONARY: {
			const godot::Dictionary d = v;
			Obj *o = g.object();
			const godot::Array ks = d.keys();
			for (int64_t i = 0; i < ks.size(); i++) o->set(godot::String(ks[i]).utf8().get_data(), state_of(g, d[ks[i]]));
			return o;
		}
		default: {
			if (v.get_type() >= godot::Variant::ARRAY) {
				const godot::Array a = v;
				Obj *o = g.array();
				for (int64_t i = 0; i < a.size(); i++) o->push(state_of(g, a[i]));
				return o;
			}
			return Val();
		}
	}
}

godot::Variant variant_of(const Val &v) {
	switch (v.k) {
		case Val::Null:
		case Val::Undef: return godot::Variant();
		case Val::Bool: return v.b;
		case Val::Num: return v.n;
		case Val::Str:
		case Val::Ext: return godot::String::utf8(v.s.c_str());
		case Val::Ref: {
			const Obj *o = v.o;
			if (o->kind == 'o' || o->kind == 'c') {
				godot::Dictionary d;
				for (size_t i = 0; i < o->keys.size(); i++) d[godot::String::utf8(o->keys[i].c_str())] = variant_of(o->vals[i]);
				return d;
			}
			godot::Array a;
			for (const Val &x : o->vals) a.push_back(variant_of(x));
			return a;
		}
	}
	return godot::Variant();
}

// ---- shared shapes ----

Val save_item(Graph &g, const Item &it) { return state_of(g, item_full_to(it)); }
Item load_item(const Val &v) { return item_from(variant_of(v)); }

Val save_cost(Graph &g, const Cost &c) {
	Obj *o = g.object();
	for (const auto &[k, v] : c.kv) o->set(k.c_str(), Val(v));
	return o;
}
Cost load_cost(const Val &v) {
	Cost c;
	if (v.k == Val::Ref)
		for (size_t i = 0; i < v.o->keys.size(); i++) c.kv.emplace_back(v.o->keys[i], v.o->vals[i].n);
	return c;
}

Val save_lot(Graph &g, const Lot &l) {
	Obj *o = g.object();
	o->set("r", l.r).set("n", l.n).set("o", l.o);
	if (l.s) o->set("s", *l.s);
	return o;
}
Lot load_lot(const Obj *o) {
	Lot l;
	l.r = o->get("r").s;
	l.n = o->get("n").n;
	l.o = o->get("o").s;
	if (o->has("s")) l.s = o->get("s").n;
	return l;
}

Val save_hold(Graph &g, const Hold &h) {
	Obj *o = g.object(), *lots = g.array(), *items = g.array();
	for (const Lot &l : h.lots) lots->push(save_lot(g, l));
	for (const Item &it : h.items) items->push(save_item(g, it));
	o->set("lots", lots).set("items", items);
	return o;
}
Hold load_hold(const Val &v) {
	Hold h;
	for (const Val &l : v.o->get("lots").o->vals) h.lots.push_back(load_lot(l.o));
	for (const Val &it : v.o->get("items").o->vals) h.items.push_back(load_item(it));
	return h;
}
std::optional<Hold> load_opt_hold(const Val &v) { return v.k == Val::Ref ? std::optional<Hold>(load_hold(v)) : std::nullopt; }

// WarStats in the TS key order: the bake's, then work (civilians), knock (beasts) and breach (a breaching weapon)
Val save_stats(Graph &g, const WarStats &s) {
	Obj *o = g.object();
	o->set("maxHp", s.maxHp).set("dmg", s.dmg).set("reach", s.reach).set("atkTicks", s.atkTicks).set("rangedDmg", s.rangedDmg).set("range", s.range);
	o->set("ammo", s.ammo).set("shotTicks", s.shotTicks).set("shotSpeed", s.shotSpeed).set("missile", missile_name(s.missile)).set("accuracy", s.accuracy);
	o->set("armor", s.armor).set("block", s.block).set("ap", s.ap).set("speed", s.speed).set("bp", s.bp).set("ws", s.ws).set("flags", s.flags);
	if (s.work >= 0) o->set("work", s.work);
	if (s.hasKnock) o->set("knock", s.knock);
	if (s.breach >= 0) o->set("breach", s.breach);
	return o;
}
WarStats load_stats(const Obj *o) {
	WarStats s;
	s.maxHp = o->get("maxHp").n, s.dmg = o->get("dmg").n, s.reach = o->get("reach").n, s.atkTicks = o->get("atkTicks").i();
	s.rangedDmg = o->get("rangedDmg").n, s.range = o->get("range").n, s.ammo = o->get("ammo").n, s.shotTicks = o->get("shotTicks").i();
	s.shotSpeed = o->get("shotSpeed").n, s.missile = missile_of(o->get("missile").s), s.accuracy = o->get("accuracy").n;
	s.armor = o->get("armor").n, s.block = o->get("block").n, s.ap = o->get("ap").n, s.speed = o->get("speed").n, s.bp = o->get("bp").n;
	s.ws = o->get("ws").n, s.flags = o->get("flags").i();
	if (o->has("work")) s.work = o->get("work").n;
	if (o->has("knock")) s.knock = o->get("knock").n, s.hasKnock = true;
	if (o->has("breach")) s.breach = o->get("breach").n;
	return s;
}

// a person: one object per person id (the unit, the soul he waited as and the claim event share it)
Val Sim::savePerson(Graph &g, const WarPerson &p) {
	const std::string key = "person:" + p.id;
	if (Obj *o = g.named(key)) return o;
	const Val v = state_of(g, war_person_to(p));
	g.name(key, v.o);
	return v;
}

// ---- the sim's own state ----

godot::Dictionary canon_order(const Order &o);

// the order's own JSON object, or as the TS sim writes it (a squad's resume: resumeOf)
Val Sim::saveOrder(Graph &g, const Order &o) { return state_of(g, o.src.is_empty() ? canon_order(o) : o.src); }

Val Sim::saveRoot(Graph &g) {
	// shells first: squads and men are referenced from everywhere
	for (Squad *s : squads) g.keyed(s, 'o');
	for (Unit *u : units) g.keyed(static_cast<Worker *>(u), 'o');
	auto squadV = [&](const Squad *s) -> Val { return s ? Val(g.find(s)) : Val::null(); };
	auto unitV = [&](const Unit *u) -> Val { return u ? Val(g.find(static_cast<const Worker *>(u))) : Val::null(); };
	std::map<int64_t, Obj *> sts; // lookup only
	for (Squad *s : squads) {
		Obj *o = g.find(s);
		Obj *us = g.array();
		for (Unit *u : s->units) us->push(unitV(u));
		Obj *near = g.array();
		for (Squad *n : s->near) near->push(squadV(n));
		o->set("id", s->id).set("owner", s->owner).set("team", s->team).set("units", us).set("alive", s->alive).set("shape", shape_name(s->shape));
		o->set("offsets", g.nums(s->offsets)).set("ax", s->ax).set("ay", s->ay).set("cx", s->cx).set("cy", s->cy).set("facing", s->facing);
		o->set("speed", s->speed).set("ranged", s->ranged).set("side", s->side).set("ramp", s->ramp).set("path", g.nums(s->path)).set("pi", s->pi);
		o->set("order", s->order).set("target", s->target).set("repathAt", s->repathAt);
		if (s->goal) {
			Obj *gl = g.array();
			gl->push(s->goal->first).push(s->goal->second);
			o->set("goal", gl);
		} else o->set("goal", Val::null());
		o->set("near", near).set("sites", g.nums(s->sites)).set("node", s->node);
		o->set("fixed", s->fixed ? Val(g.nums(*s->fixed)) : Val::null()).set("col", s->col ? Val(g.nums(*s->col)) : Val::null());
		o->set("siege", s->siege);
		if (s->task) {
			Obj *k = g.object();
			k->set("kind", s->task->kind).set("b", s->task->b).set("e", s->task->e);
			o->set("task", k);
		} else o->set("task", Val::null());
		o->set("fire", s->fire).set("claimPt", s->claimPt).set("spare", s->spare).set("act", Val::strOrNull(s->act)).set("actWil", s->actWil);
		o->set("actReady", s->actReady).set("actUntil", s->actUntil).set("out", s->out).set("inn", s->inn).set("amx", s->amx).set("amy", s->amy);
		o->set("civ", s->civ).set("flee", s->flee).set("calm", s->calm).set("resume", s->resume ? saveOrder(g, *s->resume) : Val::null());
		o->set("cartDrop", s->cartDrop).set("atEase", s->atEase).set("work", s->work).set("fedUntil", s->fedUntil).set("fedInn", s->fedInn);
		o->set("fedMelee", s->fedMelee).set("fedMissile", s->fedMissile).set("fedAcc", s->fedAcc).set("fedHeal", s->fedHeal).set("dish", Val::strOrNull(s->dish));
		o->set("bandages", s->bandages).set("theriacUntil", s->theriacUntil);
		if (s->xfer) {
			const Xfer &x = *s->xfer;
			Obj *xo = g.object(), *ref = g.object();
			if (x.ref.building) ref->set("building", *x.ref.building);
			if (x.ref.cart) ref->set("cart", *x.ref.cart);
			if (x.ref.pile) ref->set("pile", *x.ref.pile);
			xo->set("ref", ref).set("dir", x.dir);
			if (x.res) xo->set("res", *x.res);
			xo->set("n", x.n);
			if (x.send) xo->set("send", true);
			o->set("xfer", xo);
		} else o->set("xfer", Val::null());
		o->set("escort", s->escort).set("laden", s->laden);
		if (s->salv) {
			Obj *sv = g.object();
			sv->set("pile", s->salv->pile).set("uid", s->salv->uid).set("t", s->salv->t);
			o->set("salv", sv);
		} else o->set("salv", Val::null());
		o->set("soul", s->soul).set("meek", s->meek).set("angry", s->angry);
	}
	for (Unit *u : units) {
		Obj *o = g.find(static_cast<Worker *>(u));
		Obj *&st = sts[u->stKey];
		if (!st) st = save_stats(g, u->st).o;
		o->set("id", u->id).set("squad", squadV(u->squad)).set("slot", u->slot).set("x", u->x).set("y", u->y).set("facing", u->facing);
		o->set("hp", u->hp).set("maxHp", u->maxHp).set("cls", u->cls).set("st", st).set("moving", u->moving).set("wp", u->wp).set("alive", u->alive);
		o->set("wounded", u->wounded).set("fighting", u->fighting).set("striking", u->striking).set("swingAt", u->swingAt).set("cd", u->cd);
		o->set("ammo", u->ammo).set("tgt", unitV(u->tgt)).set("vx", u->vx).set("vy", u->vy).set("spd", u->spd).set("stuck", u->stuck);
		o->set("wx", u->wx).set("wy", u->wy).set("own", g.nums(u->own)).set("oi", u->oi).set("ownReq", u->ownReq).set("crossing", u->crossing);
		o->set("settled", u->settled).set("settleD", u->settleD).set("best", u->best).set("stall", u->stall).set("ox", u->ox).set("oy", u->oy);
		o->set("want", u->want).set("toSlot", u->toSlot).set("job", Val::strOrNull(u->job)).set("carry", Val::strOrNull(u->carry)).set("load", u->load);
		o->set("wnode", u->wnode).set("wsite", u->wsite).set("wslot", u->wslot).set("wfor", u->wfor).set("working", u->working);
		o->set("wgx", u->wgx).set("wgy", u->wgy).set("wpath", g.nums(u->wpath)).set("wpi", u->wpi).set("wreq", u->wreq);
		o->set("doing", u->doing ? Val(u->doing) : Val::null()).set("person", u->person ? savePerson(g, *u->person) : Val::null());
		o->set("dealt", u->dealt).set("kills", u->kills).set("obj", u->obj).set("engaged", u->engaged).set("reported", u->reported);
		o->set("civ", Val::strOrNull(u->civ)).set("civT", u->civT).set("civAt", u->civAt).set("repaired", u->repaired).set("venomUntil", u->venomUntil);
		o->set("venom", u->venom).set("beast", u->beast).set("fieldR", u->fieldR).set("pack", u->pack ? save_hold(g, *u->pack) : Val::null());
		o->set("tag", u->tag).set("safeT", u->safeT).set("pin", u->pin).set("aloft", u->aloft).set("immune", u->immune).set("boss", u->boss);
		o->set("sat", u->sat).set("back", u->back).set("bx", u->bx).set("by", u->by);
		o->set("wrate", u->wrate ? Val(*u->wrate) : Val()).set("brate", u->brate ? Val(*u->brate) : Val()).set("gmul", u->gmul ? save_cost(g, *u->gmul) : Val());
		for (uint8_t k : u->keys) switch (Unit::Key(k)) {
				case Unit::K_MOB: o->set("mob", u->mob); break;
				case Unit::K_HERBS: o->set("herbs", u->herbs); break;
				case Unit::K_FLAX: o->set("flax", u->flax); break;
				case Unit::K_DASH: o->set("dash", u->dash); break;
				case Unit::K_DASHAT: o->set("dashAt", u->dashAt); break;
				case Unit::K_DASHTGT: o->set("dashTgt", u->dashTgt); break;
				case Unit::K_DASHHIT: o->set("dashHit", u->dashHit); break;
				case Unit::K_SLOWUNTIL: o->set("slowUntil", u->slowUntil); break;
				case Unit::K_DOWNAT: o->set("downAt", u->downAt ? Val(*u->downAt) : Val()); break;
				case Unit::K_DOWNQ: o->set("downQ", u->downQ ? Val(*u->downQ) : Val()); break;
				case Unit::K_UPAT: o->set("upAt", u->upAt ? Val(*u->upAt) : Val()); break;
				case Unit::K_BOSSHIT: o->set("bossHit", u->bossHit ? Val(g.strs(*u->bossHit)) : Val()); break;
			}
	}
	Obj *root = g.object();
	auto list = [&](auto &&items, auto &&f) {
		Obj *a = g.array();
		for (auto &&x : items) a->push(f(x));
		return a;
	};
	root->set("grid", saveGrid(g, *grid)).set("rng", g.rng(rng.state));
	root->set("squads", list(squads, squadV)).set("units", list(units, unitV));
	root->set("queue", list(queue, [&](const Order &o) { return saveOrder(g, o); }));
	root->set("pathQueue", list(pathQueue, squadV)).set("unitPathQueue", list(unitPathQueue, unitV));
	root->set("missiles", list(missiles, [&](const Flight &m) -> Val {
		Obj *o = g.object();
		o->set("at", m.at).set("by", unitV(m.by)).set("t", unitV(m.t)).set("raw", m.raw).set("ap", m.ap);
		if (m.aimed) m.b >= 0 ? o->set("b", m.b) : o->set("e", m.e);
		else if (m.fb >= 0) o->set("fb", m.fb);
		return o;
	}));
	root->set("shots", list(shots, [&](const Shot &sh) -> Val {
		Obj *o = g.object();
		o->set("x0", sh.x0).set("y0", sh.y0).set("x1", sh.x1).set("y1", sh.y1).set("t0", sh.t0).set("t1", sh.t1).set("z0", sh.z0).set("z1", sh.z1);
		o->set("by", sh.by).set("kind", missile_name(sh.kind));
		if (sh.fire) o->set("fire", true);
		return o;
	}));
	Obj *rq = g.make('s');
	for (Squad *s : reslotQueue) rq->push(squadV(s));
	root->set("reslotQueue", rq).set("tick", tick);
	Obj *lootO = g.object();
	for (const auto &[team, items] : loot) lootO->set(std::to_string(team).c_str(), list(items, [&](const Item &it) { return save_item(g, it); }));
	root->set("loot", lootO);
	root->set("log", list(evlog, [&](const godot::Dictionary &e) -> Val {
		// a soul's claim holds the claimer's whole record (the C++ log keeps his id, name, class and level)
		if (e.get("kind", "") == godot::String("soulClaimed")) {
			const int unit = int(e["unit"]);
			Obj *o = state_of(g, e).o;
			for (size_t i = 0; i < o->keys.size(); i++)
				if (o->keys[i] == "person" && unit >= 0 && unit < int(units.size()) && units[unit]->person) o->vals[i] = savePerson(g, *units[unit]->person);
			return o;
		}
		return state_of(g, e);
	}));
	root->set("civs", list(civs, unitV));
	Obj *dr = g.make('s');
	for (int t : dresser) dr->push(t);
	root->set("dresser", dr);
	root->set("souls", saveSouls(g)).set("crafting", crafting->save(g)).set("works", works->save(g, [&](const Worker *w) -> Val { return g.find(w); }));
	root->set("siege", siege->save(g)).set("mobs", mobs->save(g)).set("vision", vision.save(g, [&](const BuildingSnap &b) { return saveSnap(g, b); }));
	root->set("piles", savePiles(g)).set("towns", towns->save(g));
	root->set("bosses", bosses->save(g)).set("landmarks", saveLandmarks(g)).set("roam", roam->save(g)).set("secrets", saveSecrets(g));
	root->set("townLv", saveTownLv(g));
	Obj *bon = g.make('m');
	for (const auto &[team, b] : bonuses) {
		Obj *o = g.object();
		for (const std::string &k : b.keys) o->set(k.c_str(), k == "sight" ? Val::opt(b.sight) : Val::opt(b.repairCost));
		bon->put(team, o);
	}
	Obj *ll = g.make('m');
	for (const auto &[k, v] : labourLog) ll->put(k, v);
	root->set("bonuses", bon).set("labourLog", ll).set("slain", g.strs(slain));
	return root;
}

// ---- orders: the JSON object the order came as (the host's), or as the TS sim and bots write it ----

godot::Dictionary canon_order(const Order &o) {
	godot::Dictionary d;
	const godot::String k = godot::String::utf8(o.kind.c_str());
	d["kind"] = k;
	if (o.kind == "placeBuilding") {
		if (o.team) d["team"] = *o.team;
		d["type"] = godot::String::utf8(o.type.c_str());
		d["x"] = o.x;
		d["y"] = o.y;
		return d;
	}
	d["squad"] = o.squad;
	if (o.kind == "attack") d["target"] = o.target;
	else if (o.kind == "move") d["x"] = o.x, d["y"] = o.y;
	else if (o.kind == "buildSiege") d["type"] = godot::String::utf8(o.type.c_str()), d["x"] = o.x, d["y"] = o.y;
	else if (o.kind == "crew" || o.kind == "ignite") d["siege"] = o.siege.value_or(-1);
	else if (o.kind == "attackBuilding" || o.kind == "extinguish" || o.kind == "civWork") d["building"] = o.building;
	else if (o.kind == "raiseLadder") {
		godot::Array w;
		w.push_back(o.wallTile[0]);
		w.push_back(o.wallTile[1]);
		d["wallTile"] = w;
	} else if (o.kind == "fireArrows") d["on"] = o.on;
	else if (o.kind == "pushLadder") d["ladder"] = o.ladder;
	else if (o.kind == "escort") d["cart"] = o.cart.value_or(-1);
	else if (o.kind == "gather") {
		d["node"] = o.node;
		if (o.cart) d["cart"] = *o.cart;
	} else if (o.kind == "build") d["site"] = o.site;
	return d;
}

void Sim::order(const Order &o) {
	queue.push_back(o);
	if (queue.back().src.is_empty()) queue.back().src = canon_order(o);
}

// ---- the grid ----

Val Sim::saveGrid(Graph &g, const Grid &gr) {
	Obj *o = g.object(), *s = g.object();
	s->set("node", g.typed(TA::Int32, gr.node)).set("n", gr.n).set("bx", g.typed(TA::Int32, gr.bx)).set("by", g.typed(TA::Int32, gr.by));
	s->set("cx", g.typed(TA::Float32, gr.cx)).set("cy", g.typed(TA::Float32, gr.cy)).set("start", g.typed(TA::Int32, gr.start));
	s->set("adj", g.typed(TA::Int32, gr.adj)).set("adjCost", g.typed(TA::Float32, gr.adj_cost)).set("bw", gr.bw).set("bh", gr.bh);
	Obj *bn = g.array(), *links = g.array();
	for (const auto &b : gr.block_nodes) bn->push(g.typed(TA::Int32, b));
	for (const auto &l : gr.links) links->push(g.nums(l));
	s->set("blockNodes", bn).set("links", links).set("meanCost", g.nums(gr.mean_cost));
	o->set("w", gr.w).set("h", gr.h).set("cost", g.typed(TA::Float32, gr.cost)).set("height", g.typed(TA::Uint8, gr.height));
	o->set("ground", g.typed(TA::Uint8, gr.ground)).set("gate", g.typed(TA::Int8, gr.gate)).set("deck", g.typed(TA::Uint8, gr.deck));
	o->set("span", g.typed(TA::Uint8, gr.span)).set("plat", g.typed(TA::Int32, gr.plat)).set("trench", g.typed(TA::Uint8, gr.trench));
	o->set("engine", gr.engine).set("cart", gr.cart).set("cartMul", g.typed(TA::Float32, gr.cart_mul)).set("narrow", g.typed(TA::Uint8, gr.narrow));
	o->set("team", gr.team).set("dirty", g.nums(gr.dirty)).set("sectors", s);
	return o;
}

// ---- souls, piles, landmarks, hidden quests, town levels ----

Val Sim::saveSouls(Graph &g) {
	const SoulsRoot r = souls->save_root();
	Obj *o = g.object(), *list = g.array(), *fields = g.array(), *cells = g.make('m');
	for (const Soul &s : r.list) {
		Obj *x = g.object();
		x->set("id", s.id).set("x", s.x).set("y", s.y).set("cls", s.cls).set("level", s.level).set("site", s.site).set("until", s.until);
		x->set("prog", s.prog).set("team", s.team).set("contested", s.contested).set("at", s.at);
		if (s.person) {
			const auto it = namedSouls.find(s.person->id);
			if (it != namedSouls.end()) x->set("person", savePerson(g, it->second));
		}
		if (s.bar) x->set("bar", *s.bar).set("barUntil", s.barUntil ? Val(*s.barUntil) : Val());
		list->push(x);
	}
	for (const SoulSite &f : r.fields) {
		Obj *x = g.object();
		x->set("kind", f.kind).set("x", f.x).set("y", f.y);
		fields->push(x);
	}
	for (const auto &[k, c] : r.cells) {
		Obj *x = g.object(), *by = g.object();
		for (const auto &[cls, n] : c.by) by->set(cls.c_str(), n);
		x->set("n", c.n).set("x", c.x).set("y", c.y).set("by", by).set("site", c.site);
		cells->put(k, x);
	}
	o->set("list", list).set("next", r.next).set("fields", fields).set("cells", cells).set("rng", g.rng(r.rng.state));
	return o;
}

Val Sim::savePiles(Graph &g) {
	Obj *o = g.object(), *list = g.array();
	for (const Pile &p : piles->piles) {
		Obj *x = g.object();
		x->set("id", p.id).set("x", p.x).set("y", p.y).set("hold", save_hold(g, p.hold)).set("until", p.until).set("salv", p.salv).set("by", p.by);
		if (p.claim) {
			Obj *c = g.object();
			c->set("owner", p.claim->owner).set("name", p.claim->name).set("until", p.claim->until);
			x->set("claim", c);
		}
		list->push(x);
	}
	o->set("piles", list).set("nextId", piles->nextId);
	return o;
}

Val Sim::saveLandmarks(Graph &g) {
	const LandmarksRoot r = landmarks->save_root();
	Obj *o = g.object();
	o->set("captured", r.captured).set("restored", r.restored).set("holder", r.holder).set("men", r.men).set("foes", r.foes).set("state", r.state);
	return o;
}

Val Sim::saveSecrets(Graph &g) {
	const SecretsRoot r = secrets->save_root();
	Obj *o = g.object(), *saves = g.object();
	for (const auto &[key, e] : r.saves) {
		Obj *x = g.object(), *s = g.object(), *picks = g.object();
		for (const auto &[k, v] : e.save.picks) picks->set(k.c_str(), v);
		s->set("v", e.save.v).set("story", e.save.story).set("at", Val::opt(e.save.at)).set("n", e.save.n).set("picks", picks);
		if (e.save.done) s->set("done", true);
		x->set("save", s).set("team", e.team);
		saves->set(key.c_str(), x);
	}
	o->set("saves", saves).set("tick", r.tick);
	return o;
}

Val Sim::saveTownLv(Graph &g) {
	Obj *o = g.object(), *levels = g.make('m');
	for (const TownLevel &t : townLv->save_root()) {
		Obj *x = g.object();
		x->set("team", t.team).set("level", t.level).set("x", t.x).set("y", t.y).set("centre", t.centre).set("variety", t.variety).set("stone", t.stone);
		x->set("closed", t.closed).set("stoneWalls", t.stoneWalls);
		levels->put(t.centre, x);
	}
	o->set("levels", levels);
	return o;
}

Val Sim::saveSnap(Graph &g, const BuildingSnap &b) { return works->saveSnap(g, b); }

// exportState: the root of this sim encoded against the fresh sim's (its typed arrays the diffs' baseline)
std::string Sim::save(Sim *fresh) {
	Graph base, g;
	const Val b = fresh ? fresh->saveRoot(base) : Val();
	const Val root = saveRoot(g);
	return state::encode(root, b.k == Val::Ref ? b.o : nullptr, region.id, seed);
}

// ---- importState: a save decoded into this fresh sim, module by module (each module's loadRoot, and what the TS decode
// refills in place) ----

namespace {

const char *doing_of(const Val &v) {
	static const char *names[] = { "crew", "extinguish", "ignite", "push" };
	if (v.k != Val::Str) return nullptr;
	for (const char *n : names)
		if (v.s == n) return n;
	return nullptr;
}

void load_grid(Grid &gr, const Obj &o) {
	gr.w = o.get("w").i(), gr.h = o.get("h").i();
	o.get("cost").o->fill(gr.cost), o.get("height").o->fill(gr.height), o.get("ground").o->fill(gr.ground), o.get("gate").o->fill(gr.gate);
	o.get("deck").o->fill(gr.deck), o.get("span").o->fill(gr.span), o.get("plat").o->fill(gr.plat), o.get("trench").o->fill(gr.trench);
	gr.engine = o.get("engine").b, gr.cart = o.get("cart").b;
	o.get("cartMul").o->fill(gr.cart_mul), o.get("narrow").o->fill(gr.narrow);
	gr.team = o.get("team").i(), gr.dirty = load_nums<int>(o.get("dirty"));
	const Obj &s = *o.get("sectors").o;
	s.get("node").o->fill(gr.node), gr.n = s.get("n").i(), s.get("bx").o->fill(gr.bx), s.get("by").o->fill(gr.by);
	s.get("cx").o->fill(gr.cx), s.get("cy").o->fill(gr.cy), s.get("start").o->fill(gr.start), s.get("adj").o->fill(gr.adj);
	s.get("adjCost").o->fill(gr.adj_cost), gr.bw = s.get("bw").i(), gr.bh = s.get("bh").i();
	gr.block_nodes.clear();
	for (const Val &v : s.get("blockNodes").o->vals) {
		gr.block_nodes.emplace_back();
		v.o->fill(gr.block_nodes.back());
	}
	gr.links.clear();
	for (const Val &v : s.get("links").o->vals) gr.links.push_back(load_nums<int32_t>(v));
	gr.mean_cost = load_nums<double>(s.get("meanCost"));
}

} // namespace

bool Sim::load(const std::string &text, std::string &why) {
	state::Decoded d;
	if (!state::decode(text, d)) return why = "not a sim save", false;
	if (d.v != 1 || d.region != region.id) return why = "a save v" + std::to_string(d.v) + " of " + d.region + " does not fit v1 of " + region.id, false;
	if (tick != 0 || !units.empty()) return why = "only into a fresh sim", false;
	if (d.root.k != Val::Ref) return why = "no root", false;
	const Obj &r = *d.root.o;
	load_grid(*grid, *r.get("grid").o);
	rng.state = uint32_t(r.get("rng").o->get("state").n);
	// shells: the squads and men every other part refers to
	std::map<const Obj *, Squad *> sOf; // lookup only
	std::map<const Obj *, Unit *> uOf; // lookup only
	for (const Val &v : r.get("squads").o->vals) squads.push_back(sOf[v.o] = new Squad());
	for (const Val &v : r.get("units").o->vals) units.push_back(uOf[v.o] = new Unit());
	auto squadOf = [&](const Val &v) -> Squad * { return v.k == Val::Ref ? sOf.at(v.o) : nullptr; };
	auto unitOf = [&](const Val &v) -> Unit * { return v.k == Val::Ref ? uOf.at(v.o) : nullptr; };
	auto orderOf = [&](const Val &v) { return godot::order_from(variant_of(v)); };
	for (const auto &[obj, s] : sOf) {
		const Obj &x = *obj;
		s->id = x.get("id").i(), s->owner = x.get("owner").s, s->team = x.get("team").i();
		for (const Val &u : x.get("units").o->vals) s->units.push_back(unitOf(u));
		s->alive = x.get("alive").i(), s->shape = shape_of(x.get("shape").s), s->offsets = load_nums<double>(x.get("offsets"));
		s->ax = x.get("ax").n, s->ay = x.get("ay").n, s->cx = x.get("cx").n, s->cy = x.get("cy").n, s->facing = x.get("facing").n, s->speed = x.get("speed").n;
		s->ranged = x.get("ranged").b, s->side = x.get("side").n, s->ramp = x.get("ramp").n, s->path = load_nums<double>(x.get("path")), s->pi = x.get("pi").i();
		s->order = x.get("order").s, s->target = x.get("target").i(), s->repathAt = x.get("repathAt").i();
		if (x.get("goal").k == Val::Ref) s->goal = std::make_pair(x.get("goal").o->vals[0].n, x.get("goal").o->vals[1].n);
		for (const Val &n : x.get("near").o->vals) s->near.push_back(squadOf(n));
		s->sites = load_nums<int>(x.get("sites")), s->node = x.get("node").i();
		if (x.get("fixed").k == Val::Ref) s->fixed = load_nums<double>(x.get("fixed"));
		if (x.get("col").k == Val::Ref) s->col = load_nums<double>(x.get("col"));
		s->siege = x.get("siege").i();
		if (x.get("task").k == Val::Ref) s->task = Task{ x.get("task").o->get("kind").s, x.get("task").o->get("b").i(), x.get("task").o->get("e").i() };
		s->fire = x.get("fire").b, s->claimPt = x.get("claimPt").i(), s->spare = x.get("spare").b, s->act = x.get("act").strOr();
		s->actWil = x.get("actWil").n, s->actReady = x.get("actReady").n, s->actUntil = x.get("actUntil").n, s->out = x.get("out").n, s->inn = x.get("inn").n;
		s->amx = x.get("amx").n, s->amy = x.get("amy").n, s->civ = x.get("civ").b, s->flee = x.get("flee").b, s->calm = x.get("calm").i();
		if (x.get("resume").k == Val::Ref) {
			s->resume = std::make_shared<Order>(orderOf(x.get("resume")));
			s->resume->src = godot::Dictionary(); // as resumeOf writes it (saveOrder writes it back so)
		}
		s->cartDrop = x.get("cartDrop").i(), s->atEase = x.get("atEase").i(), s->work = x.get("work").i(), s->fedUntil = x.get("fedUntil").n;
		s->fedInn = x.get("fedInn").n, s->fedMelee = x.get("fedMelee").n, s->fedMissile = x.get("fedMissile").n, s->fedAcc = x.get("fedAcc").n;
		s->fedHeal = x.get("fedHeal").n, s->dish = x.get("dish").strOr(), s->bandages = x.get("bandages").i(), s->theriacUntil = x.get("theriacUntil").n;
		if (x.get("xfer").k == Val::Ref) {
			const Obj &xo = *x.get("xfer").o, &ref = *xo.get("ref").o;
			Xfer xf;
			if (ref.has("building")) xf.ref.building = ref.get("building").i();
			if (ref.has("cart")) xf.ref.cart = ref.get("cart").i();
			if (ref.has("pile")) xf.ref.pile = ref.get("pile").i();
			xf.dir = xo.get("dir").s;
			if (xo.has("res")) xf.res = xo.get("res").s;
			xf.n = xo.get("n").n, xf.send = xo.get("send").b;
			s->xfer = std::move(xf);
		}
		s->escort = x.get("escort").i(), s->laden = x.get("laden").b;
		if (x.get("salv").k == Val::Ref) s->salv = Salv{ x.get("salv").o->get("pile").i(), x.get("salv").o->get("uid").s, x.get("salv").o->get("t").n };
		s->soul = x.get("soul").i(), s->meek = x.get("meek").b, s->angry = x.get("angry").i();
	}
	std::map<const Obj *, int64_t> stKeys; // lookup only: the men sharing a stats object share its key
	int64_t stNext = 0;
	for (const auto &[obj, u] : uOf) {
		const Obj &x = *obj;
		u->id = x.get("id").i(), u->squad = squadOf(x.get("squad")), u->Worker::squad = u->squad, u->slot = x.get("slot").i();
		u->x = x.get("x").n, u->y = x.get("y").n, u->facing = x.get("facing").n, u->hp = x.get("hp").n, u->maxHp = x.get("maxHp").n;
		u->cls = x.get("cls").s;
		const Obj *st = x.get("st").o;
		u->st = load_stats(st);
		auto sk = stKeys.find(st);
		u->stKey = sk != stKeys.end() ? sk->second : (stKeys[st] = -(1LL << 40) - stNext++);
		u->moving = x.get("moving").b, u->wp = x.get("wp").i(), u->alive = x.get("alive").b, u->wounded = x.get("wounded").b;
		u->fighting = x.get("fighting").b, u->striking = x.get("striking").b, u->swingAt = x.get("swingAt").i(), u->cd = x.get("cd").n;
		u->ammo = x.get("ammo").n, u->tgt = unitOf(x.get("tgt")), u->vx = x.get("vx").n, u->vy = x.get("vy").n, u->spd = x.get("spd").n;
		u->stuck = x.get("stuck").i(), u->wx = x.get("wx").n, u->wy = x.get("wy").n, u->own = load_nums<double>(x.get("own")), u->oi = x.get("oi").i();
		u->ownReq = x.get("ownReq").b, u->crossing = x.get("crossing").b, u->settled = x.get("settled").b, u->settleD = x.get("settleD").n;
		u->best = x.get("best").n, u->stall = x.get("stall").i(), u->ox = x.get("ox").n, u->oy = x.get("oy").n, u->want = x.get("want").n;
		u->toSlot = x.get("toSlot").b, u->job = x.get("job").strOr(), u->carry = x.get("carry").strOr(), u->load = x.get("load").n;
		u->wnode = x.get("wnode").i(), u->wsite = x.get("wsite").i(), u->wslot = x.get("wslot").i(), u->wfor = x.get("wfor").i();
		u->working = x.get("working").b, u->wgx = x.get("wgx").n, u->wgy = x.get("wgy").n, u->wpath = load_nums<double>(x.get("wpath"));
		u->wpi = x.get("wpi").i(), u->wreq = x.get("wreq").b, u->doing = doing_of(x.get("doing"));
		if (x.get("person").k == Val::Ref) u->person = war_person_from(variant_of(x.get("person")));
		u->dealt = x.get("dealt").n, u->kills = x.get("kills").n, u->obj = x.get("obj").n, u->engaged = x.get("engaged").b, u->reported = x.get("reported").b;
		u->civ = x.get("civ").strOr(), u->civT = x.get("civT").n, u->civAt = x.get("civAt").b, u->repaired = x.get("repaired").b;
		u->venomUntil = x.get("venomUntil").n, u->venom = x.get("venom").b, u->beast = x.get("beast").b, u->fieldR = x.get("fieldR").n;
		u->pack = load_opt_hold(x.get("pack"));
		u->tag = x.get("tag").n, u->safeT = x.get("safeT").n, u->pin = x.get("pin").b, u->aloft = x.get("aloft").i(), u->immune = x.get("immune").b;
		u->boss = x.get("boss").i(), u->sat = x.get("sat").n, u->back = x.get("back").b, u->bx = x.get("bx").n, u->by = x.get("by").n;
		if (x.get("wrate").k == Val::Num) u->wrate = x.get("wrate").n;
		if (x.get("brate").k == Val::Num) u->brate = x.get("brate").n;
		if (x.get("gmul").k == Val::Ref) u->gmul = load_cost(x.get("gmul"));
		// the keys TS added after the spawn, in their order
		static const std::pair<const char *, Unit::Key> later[] = { { "mob", Unit::K_MOB }, { "herbs", Unit::K_HERBS }, { "flax", Unit::K_FLAX },
			{ "dash", Unit::K_DASH }, { "dashAt", Unit::K_DASHAT }, { "dashTgt", Unit::K_DASHTGT }, { "dashHit", Unit::K_DASHHIT },
			{ "slowUntil", Unit::K_SLOWUNTIL }, { "downAt", Unit::K_DOWNAT }, { "downQ", Unit::K_DOWNQ }, { "upAt", Unit::K_UPAT }, { "bossHit", Unit::K_BOSSHIT } };
		for (const std::string &k : x.keys)
			for (const auto &[name, key] : later)
				if (k == name) u->keys.push_back(key);
		u->mob = x.get("mob").strOr(), u->herbs = x.get("herbs").b, u->flax = x.get("flax").b, u->dash = x.get("dash").n, u->dashAt = x.get("dashAt").n;
		u->dashTgt = x.has("dashTgt") ? x.get("dashTgt").i() : -1, u->dashHit = x.get("dashHit").b, u->slowUntil = x.get("slowUntil").n;
		if (x.get("downAt").k == Val::Num) u->downAt = x.get("downAt").i();
		if (x.get("downQ").k == Val::Num) u->downQ = x.get("downQ").n;
		if (x.get("upAt").k == Val::Num) u->upAt = x.get("upAt").i();
		if (x.get("bossHit").k == Val::Ref) u->bossHit = load_strs(x.get("bossHit"));
	}
	queue.clear();
	for (const Val &v : r.get("queue").o->vals) queue.push_back(orderOf(v));
	pathQueue.clear(), unitPathQueue.clear();
	for (const Val &v : r.get("pathQueue").o->vals) pathQueue.push_back(squadOf(v));
	for (const Val &v : r.get("unitPathQueue").o->vals) unitPathQueue.push_back(unitOf(v));
	missiles.clear();
	for (const Val &v : r.get("missiles").o->vals) {
		const Obj &x = *v.o;
		Flight m;
		m.at = x.get("at").i(), m.by = unitOf(x.get("by")), m.t = unitOf(x.get("t")), m.raw = x.get("raw").n, m.ap = x.get("ap").n;
		if (x.has("b")) m.aimed = true, m.b = x.get("b").i();
		if (x.has("e")) m.aimed = true, m.e = x.get("e").i();
		if (x.has("fb")) m.fb = x.get("fb").i();
		missiles.push_back(m);
	}
	shots.clear();
	for (const Val &v : r.get("shots").o->vals) {
		const Obj &x = *v.o;
		shots.push_back({ x.get("x0").n, x.get("y0").n, x.get("x1").n, x.get("y1").n, x.get("t0").n, x.get("t1").n, x.get("z0").n, x.get("z1").n,
				x.get("by").i(), missile_of(x.get("kind").s), x.get("fire").b });
	}
	reslotQueue.clear();
	for (const Val &v : r.get("reslotQueue").o->vals) reslotQueue.push_back(squadOf(v));
	tick = r.get("tick").i();
	loot.clear();
	const Obj &lo = *r.get("loot").o;
	for (size_t i = 0; i < lo.keys.size(); i++) {
		std::vector<Item> &items = loot[std::stoi(lo.keys[i])];
		for (const Val &it : lo.vals[i].o->vals) items.push_back(load_item(it));
	}
	evlog.clear();
	for (const Val &v : r.get("log").o->vals) {
		godot::Dictionary e = variant_of(v);
		if (e.get("kind", "") == godot::String("soulClaimed") && e.get("person", godot::Variant()).get_type() == godot::Variant::DICTIONARY) {
			// the C++ log keeps the claimer's id, name, class and level (sim_events.cpp ev_of)
			const godot::Dictionary full = e["person"], hero = full.get("hero", godot::Dictionary());
			godot::Dictionary p;
			p["id"] = full.get("id", "");
			p["name"] = hero.get("name", "");
			if (hero.get("cls", godot::Variant()).get_type() == godot::Variant::STRING) p["cls"] = hero["cls"];
			p["level"] = hero.get("level", 0);
			e["person"] = p;
		}
		evlog.push_back(e);
	}
	civs.clear();
	for (const Val &v : r.get("civs").o->vals) civs.push_back(unitOf(v));
	dresser.clear();
	for (const Val &v : r.get("dresser").o->vals) dresser.insert(v.i());
	// the modules
	if (r.get("souls").k == Val::Ref) {
		const Obj &so = *r.get("souls").o;
		SoulsRoot sr;
		for (const Val &v : so.get("list").o->vals) {
			const Obj &x = *v.o;
			Soul s;
			s.id = x.get("id").i(), s.x = x.get("x").n, s.y = x.get("y").n, s.cls = x.get("cls").s, s.level = x.get("level").n, s.site = x.get("site").s;
			s.until = x.get("until").n, s.prog = x.get("prog").n, s.team = x.get("team").i(), s.contested = x.get("contested").b, s.at = x.get("at").i();
			if (x.get("person").k == Val::Ref) {
				const WarPerson p = war_person_from(variant_of(x.get("person")));
				namedSouls[p.id] = p;
				s.person = SoulPerson{ p.id, p.hero.name, p.hero.cls, double(p.hero.level) };
			}
			if (x.has("bar")) s.bar = x.get("bar").s;
			if (x.get("barUntil").k == Val::Num) s.barUntil = x.get("barUntil").n;
			sr.list.push_back(std::move(s));
		}
		sr.next = so.get("next").i();
		for (const Val &v : so.get("fields").o->vals) sr.fields.push_back({ v.o->get("kind").s, v.o->get("x").n, v.o->get("y").n });
		const Obj &cells = *so.get("cells").o;
		for (size_t i = 0; i + 1 < cells.vals.size(); i += 2) {
			const Obj &c = *cells.vals[i + 1].o, &by = *c.get("by").o;
			SoulCell cell;
			cell.n = c.get("n").n, cell.x = c.get("x").n, cell.y = c.get("y").n, cell.site = c.get("site").i();
			for (size_t j = 0; j < by.keys.size(); j++) cell.by.emplace_back(by.keys[j], by.vals[j].n);
			sr.cells.emplace_back(cells.vals[i].n, std::move(cell));
		}
		sr.rng.state = uint32_t(so.get("rng").o->get("state").n);
		souls->load_root(sr);
	}
	crafting->load(*r.get("crafting").o);
	works->load(*r.get("works").o, [&](const Val &v) -> Worker * { return unitOf(v); });
	siege->load(*r.get("siege").o);
	mobs->load(*r.get("mobs").o);
	vision.load(*r.get("vision").o, [&](const Obj &o) { return works->loadSnap(o); });
	const Obj &po = *r.get("piles").o;
	piles->piles.clear();
	for (const Val &v : po.get("piles").o->vals) {
		const Obj &x = *v.o;
		Pile p{ x.get("id").i(), x.get("x").n, x.get("y").n, load_hold(x.get("hold")), x.get("until").n, x.get("salv").n, x.get("by").i(), std::nullopt };
		if (x.get("claim").k == Val::Ref) p.claim = PileClaim{ x.get("claim").o->get("owner").s, x.get("claim").o->get("name").s, x.get("claim").o->get("until").n };
		piles->piles.push_back(std::move(p));
	}
	piles->load_root(po.get("nextId").i());
	towns->load(*r.get("towns").o);
	bosses->load(*r.get("bosses").o);
	if (r.get("landmarks").k == Val::Ref) {
		const Obj &l = *r.get("landmarks").o;
		landmarks->load_root({ l.get("captured").b, l.get("restored").b, l.get("holder").i(), l.get("men").i(), l.get("foes").i(), l.get("state").s });
	}
	if (r.get("roam").k == Val::Ref) roam->load(*r.get("roam").o);
	if (r.get("secrets").k == Val::Ref) {
		const Obj &so = *r.get("secrets").o, &saves = *so.get("saves").o;
		SecretsRoot sr;
		for (size_t i = 0; i < saves.keys.size(); i++) {
			const Obj &e = *saves.vals[i].o, &s = *e.get("save").o, &picks = *s.get("picks").o;
			SecretSave ss;
			ss.save.v = s.get("v").i(), ss.save.story = s.get("story").s, ss.save.n = s.get("n").n, ss.save.done = s.get("done").b;
			if (s.get("at").k == Val::Str) ss.save.at = s.get("at").s;
			for (size_t j = 0; j < picks.keys.size(); j++) ss.save.picks[picks.keys[j]] = picks.vals[j].s;
			ss.team = e.get("team").i();
			sr.saves.emplace_back(saves.keys[i], std::move(ss));
		}
		sr.tick = so.get("tick").n;
		secrets->load_root(sr);
	}
	// the town levels, bonuses and labour log: refilled in place by the TS decode (no loadRoot)
	std::vector<TownLevel> levels;
	const Obj &tl = *r.get("townLv").o->get("levels").o;
	for (size_t i = 0; i + 1 < tl.vals.size(); i += 2) {
		const Obj &x = *tl.vals[i + 1].o;
		TownLevel t;
		t.team = x.get("team").i(), t.level = x.get("level").i(), t.x = x.get("x").n, t.y = x.get("y").n, t.centre = x.get("centre").i();
		t.variety = x.get("variety").n, t.stone = x.get("stone").n, t.closed = x.get("closed").b, t.stoneWalls = x.get("stoneWalls").b;
		levels.push_back(t);
	}
	townLv->load_root(std::move(levels));
	bonuses.clear();
	const Obj &bo = *r.get("bonuses").o;
	for (size_t i = 0; i + 1 < bo.vals.size(); i += 2) {
		const Obj &x = *bo.vals[i + 1].o;
		TeamBonus &b = bonuses[bo.vals[i].i()];
		b.keys = x.keys;
		if (x.get("repairCost").k == Val::Num) b.repairCost = x.get("repairCost").n;
		if (x.get("sight").k == Val::Num) b.sight = x.get("sight").n;
	}
	labourLog.clear();
	const Obj &ll = *r.get("labourLog").o;
	for (size_t i = 0; i + 1 < ll.vals.size(); i += 2) labourLog.emplace_back(ll.vals[i].s, ll.vals[i + 1].n);
	slain = load_strs(r.get("slain"));
	return true;
}

} // namespace sim
