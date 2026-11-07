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

bool Sim::load(const std::string &text, std::string &why) {
	why = "not ported yet";
	return false;
}

} // namespace sim
