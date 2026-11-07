// The wild's and the other modules' saves and loads (their TS saveRoot / loadRoot): mobs, siege, bosses, roam,
// crafting, the pre-built towns and the vision, as their TS twins hand them to state.ts.
#include "bosses.h"
#include "crafting.h"
#include "mobs.h"
#include "prebuilt.h"
#include "roam.h"
#include "siege.h"
#include "sim_data.h"
#include "state_util.h"
#include "vision.h"

namespace sim {

using state::Graph;
using state::Obj;
using state::TA;
using state::Val;

namespace {

template <class T, class F>
Obj *list_of(Graph &g, const T &items, F &&f) {
	Obj *a = g.array();
	for (const auto &x : items) a->push(f(x));
	return a;
}
Obj *pair_of(Graph &g, double a, double b) {
	Obj *o = g.array();
	o->push(a).push(b);
	return o;
}
const char *lair_state(int s) {
	static const char *names[] = { "home", "chase", "return", "flee", "raid" };
	return names[s];
}
int lair_state_of(const std::string &s) {
	static const char *names[] = { "home", "chase", "return", "flee", "raid" };
	for (int i = 0; i < 5; i++)
		if (s == names[i]) return i;
	return 0;
}
const char *ai_name(int a) {
	static const char *names[] = { "drakon", "scylla", "brontes", "gyges", "chimera", "king", "maenads", "titan", "river", "brute", "boar", "griffin", "lion", "bear", "minotaur" };
	return names[a];
}

} // namespace

// ---- mobs ----

Val Mobs::save(Graph &g) const {
	Obj *o = g.object();
	o->set("lairs", list_of(g, lairs, [&](const Lair &l) -> Val {
		Obj *x = g.object();
		x->set("id", l.id).set("kind", l.kind).set("def", Val::ext("MOBS." + l.kind)).set("x", l.x).set("y", l.y).set("count", l.count);
		if (l.chief) {
			const std::string key = "chief:" + l.chief->id;
			Obj *c = g.named(key);
			if (!c) {
				c = g.object();
				c->set("id", l.chief->id).set("name", l.chief->name).set("title", l.chief->title).set("kind", l.chief->kind);
				g.name(key, c);
			}
			x->set("chief", c);
		}
		x->set("squad", l.squad).set("state", lair_state(l.state)).set("cleared", l.cleared).set("respawnAt", l.respawnAt).set("nodes", g.nums(l.nodes));
		x->set("wanderAt", l.wanderAt).set("fleeUntil", l.fleeUntil).set("hpSeen", l.hpSeen).set("foe", l.foe).set("captain", l.captain);
		x->set("capAlive", l.capAlive).set("post", l.post).set("raidUntil", l.raidUntil);
		if (l.once) x->set("once", true);
		if (l.lead) x->set("lead", true);
		if (l.chief) x->set("chiefAlive", l.chiefAlive);
		return x;
	}));
	o->set("claims", list_of(g, claims, [&](const Claim &c) -> Val {
		Obj *x = g.object();
		x->set("id", c.id).set("x", c.x).set("y", c.y).set("r", c.r).set("lairs", g.nums(c.lairs)).set("team", c.team).set("squad", c.squad);
		x->set("progress", c.progress).set("contested", c.contested);
		return x;
	}));
	o->set("spawned", spawned).set("tick", tick_);
	o->set("gates", list_of(g, gates, [&](const BossGate &b) -> Val {
		Obj *x = g.object();
		x->set("id", b.id).set("alive", b.alive);
		return x;
	}));
	o->set("held", held_).set("raidAt", raidAt);
	return o;
}

void Mobs::load(const Obj &o) {
	lairs.clear();
	for (const Val &v : o.get("lairs").o->vals) {
		const Obj &x = *v.o;
		Lair l;
		l.id = x.get("id").i(), l.kind = x.get("kind").s, l.x = x.get("x").n, l.y = x.get("y").n, l.count = x.get("count").n;
		auto it = data().mobs.MOBS.find(l.kind);
		if (it != data().mobs.MOBS.end()) l.def = it->second;
		if (x.has("chief")) {
			const Obj &c = *x.get("chief").o;
			l.chief = WarChief{ c.get("id").s, c.get("name").s, c.get("title").s, c.get("kind").s };
		}
		l.squad = x.get("squad").i(), l.state = State(lair_state_of(x.get("state").s)), l.cleared = x.get("cleared").b;
		l.respawnAt = x.get("respawnAt").n, l.nodes = load_nums<int>(x.get("nodes")), l.wanderAt = x.get("wanderAt").n;
		l.fleeUntil = x.get("fleeUntil").n, l.hpSeen = x.get("hpSeen").n, l.foe = x.get("foe").i(), l.captain = x.get("captain").b;
		l.capAlive = x.get("capAlive").b, l.post = x.get("post").i(), l.raidUntil = x.get("raidUntil").n;
		l.once = x.get("once").b, l.lead = x.get("lead").b, l.chiefAlive = x.get("chiefAlive").b;
		lairs.push_back(std::move(l));
	}
	claims.clear();
	for (const Val &v : o.get("claims").o->vals) {
		const Obj &x = *v.o;
		Claim c;
		c.id = x.get("id").i(), c.x = x.get("x").n, c.y = x.get("y").n, c.r = x.get("r").n, c.lairs = load_nums<int>(x.get("lairs"));
		c.team = x.get("team").i(), c.squad = x.get("squad").i(), c.progress = x.get("progress").n, c.contested = x.get("contested").b;
		claims.push_back(std::move(c));
	}
	spawned = o.get("spawned").b, tick_ = o.get("tick").n;
	gates.clear();
	for (const Val &v : o.get("gates").o->vals) gates.push_back({ v.o->get("id").s, v.o->get("alive").b });
	held_ = o.get("held").b, raidAt = o.get("raidAt").n;
}

// ---- siege ----

Val Siege::save(Graph &g) const {
	Obj *o = g.object();
	o->set("engines", list_of(g, engines, [&](const SiegeEngine &e) -> Val {
		Obj *x = g.object();
		x->set("id", e.id).set("type", e.type).set("def", Val::ext("SIEGE." + e.type)).set("team", e.team).set("x", e.x).set("y", e.y);
		x->set("facing", e.facing).set("hp", e.hp).set("maxHp", e.maxHp).set("state", e.state).set("labour", e.labour).set("crew", e.crew);
		x->set("mode", e.mode).set("goal", e.goal ? Val(pair_of(g, (*e.goal)[0], (*e.goal)[1])) : Val::null()).set("path", g.nums(e.path)).set("pi", e.pi);
		x->set("target", e.target).set("wall", e.wall ? Val(pair_of(g, (*e.wall)[0], (*e.wall)[1])) : Val::null()).set("ladder", e.ladder).set("cd", e.cd);
		x->set("swingAt", e.swingAt).set("prog", e.prog).set("burn", e.burn).set("kindle", e.kindle).set("tower", e.tower).set("owner", e.owner);
		x->set("hold", e.hold ? save_hold(g, *e.hold) : Val::null()).set("halt", e.halt).set("cap", e.cap).set("capT", e.capT).set("capO", e.capO);
		x->set("stop", Val::strOrNull(e.stop)).set("lag", e.lag).set("stowed", e.stowed);
		return x;
	}));
	o->set("boulders", list_of(g, boulders, [&](const Boulder &b) -> Val {
		Obj *x = g.object();
		x->set("at", b.at).set("x", b.x).set("y", b.y).set("target", b.target).set("hit", b.hit).set("dmg", b.dmg);
		return x;
	}));
	o->set("bolts", list_of(g, bolts, [&](const Bolt &b) -> Val {
		Obj *x = g.object();
		x->set("at", b.at).set("team", b.team).set("x0", b.x0).set("y0", b.y0).set("x1", b.x1).set("y1", b.y1).set("dmg", b.dmg);
		return x;
	}));
	o->set("shots", list_of(g, shots_, [&](const SiegeShot &s) -> Val {
		Obj *x = g.object();
		x->set("x0", s.x0).set("y0", s.y0).set("x1", s.x1).set("y1", s.y1).set("t0", s.t0).set("t1", s.t1).set("z0", s.z0).set("z1", s.z1);
		x->set("by", s.by).set("kind", s.kind).set("siege", s.siege);
		return x;
	}));
	o->set("pathsLeft", pathsLeft);
	return o;
}

void Siege::load(const Obj &o) {
	engines.clear();
	for (const Val &v : o.get("engines").o->vals) {
		const Obj &x = *v.o;
		SiegeEngine e;
		e.id = x.get("id").i(), e.type = x.get("type").s;
		auto it = data().siege.SIEGE.find(e.type);
		e.def = it == data().siege.SIEGE.end() ? nullptr : &it->second;
		e.team = x.get("team").i(), e.x = x.get("x").n, e.y = x.get("y").n, e.facing = x.get("facing").n, e.hp = x.get("hp").n;
		e.maxHp = x.get("maxHp").n, e.state = x.get("state").s, e.labour = x.get("labour").n, e.crew = x.get("crew").i(), e.mode = x.get("mode").s;
		if (x.get("goal").k == Val::Ref) e.goal = std::array<double, 2>{ x.get("goal").o->vals[0].n, x.get("goal").o->vals[1].n };
		e.path = load_nums<double>(x.get("path")), e.pi = x.get("pi").i(), e.target = x.get("target").i();
		if (x.get("wall").k == Val::Ref) e.wall = std::array<int, 2>{ x.get("wall").o->vals[0].i(), x.get("wall").o->vals[1].i() };
		e.ladder = x.get("ladder").i(), e.cd = x.get("cd").n, e.swingAt = x.get("swingAt").i(), e.prog = x.get("prog").n, e.burn = x.get("burn").n;
		e.kindle = x.get("kindle").n, e.tower = x.get("tower").b, e.owner = x.get("owner").s, e.hold = load_opt_hold(x.get("hold"));
		e.halt = x.get("halt").n, e.cap = x.get("cap").n, e.capT = x.get("capT").i(), e.capO = x.get("capO").s, e.stop = x.get("stop").strOr();
		e.lag = x.get("lag").n, e.stowed = x.get("stowed").b;
		engines.push_back(std::move(e));
	}
	boulders.clear();
	for (const Val &v : o.get("boulders").o->vals) {
		const Obj &x = *v.o;
		boulders.push_back({ x.get("at").n, x.get("x").n, x.get("y").n, x.get("target").i(), x.get("hit").b, x.get("dmg").n });
	}
	bolts.clear();
	for (const Val &v : o.get("bolts").o->vals) {
		const Obj &x = *v.o;
		bolts.push_back({ x.get("at").n, x.get("team").i(), x.get("x0").n, x.get("y0").n, x.get("x1").n, x.get("y1").n, x.get("dmg").n });
	}
	shots_.clear();
	for (const Val &v : o.get("shots").o->vals) {
		const Obj &x = *v.o;
		shots_.push_back({ x.get("x0").n, x.get("y0").n, x.get("x1").n, x.get("y1").n, x.get("t0").n, x.get("t1").n, x.get("z0").n, x.get("z1").n,
				x.get("by").i(), x.get("kind").s, x.get("siege").i() });
	}
	pathsLeft = o.get("pathsLeft").i();
	mantlets = 0;
	for (const SiegeEngine &e : engines)
		if (e.type == "mantlet") mantlets++;
}

// ---- bosses ----

Val Bosses::save(Graph &g) const {
	Obj *o = g.object();
	o->set("runs", list_of(g, runs, [&](const Run &r) -> Val {
		Obj *x = g.object();
		x->set("i", r.i).set("id", r.id).set("ai", ai_name(r.ai)).set("x", r.x).set("y", r.y).set("sq", r.sq).set("parts", r.parts);
		x->set("called", g.nums(r.called)).set("main", r.main).set("phase", r.phase).set("state", r.state).set("scale", r.scale).set("raid", r.raid);
		x->set("next", r.next).set("next2", r.next2).set("perch", r.perch).set("perchAt", r.perchAt);
		if (r.fly) {
			const Fly &f = *r.fly;
			Obj *fo = g.object();
			fo->set("x0", f.x0).set("y0", f.y0).set("x1", f.x1).set("y1", f.y1).set("t0", f.t0).set("t1", f.t1).set("then", f.then);
			x->set("fly", fo);
		} else x->set("fly", Val::null());
		x->set("fleeAt", r.fleeAt).set("respawnAt", r.respawnAt).set("guardN", r.guardN);
		Obj *dmg = g.object();
		for (const auto &[k, v] : r.dmg) dmg->set(k.c_str(), v);
		x->set("dmg", dmg).set("last", r.last);
		if (r.fx) {
			const RunFx &f = *r.fx;
			Obj *fo = g.object();
			fo->set("kind", f.kind).set("x", f.x).set("y", f.y).set("tx", f.tx).set("ty", f.ty).set("r", f.r).set("at", f.at);
			x->set("fx", fo);
		} else x->set("fx", Val::null());
		if (r.tele) {
			const Tele &t = *r.tele;
			Obj *to = g.object();
			to->set("kind", t.kind).set("x", t.x).set("y", t.y).set("tx", t.tx).set("ty", t.ty).set("r", t.r).set("t0", t.t0).set("go", t.go).set("at", t.at);
			to->set("held", t.held).set("wall", t.wall);
			x->set("tele", to);
		} else x->set("tele", Val::null());
		x->set("stun", r.stun).set("surge", r.surge);
		if (r.hasHitAt) x->set("hitAt", r.hitAt);
		return x;
	}));
	o->set("spawned", spawned).set("tick", tick_);
	if (warden) {
		Obj *w = g.object();
		w->set("x", warden->x).set("y", warden->y).set("w", warden->w).set("h", warden->h).set("at", warden->at);
		o->set("warden", w);
	} else o->set("warden", Val::null());
	o->set("wardenAt", wardenAt);
	return o;
}

void Bosses::load(const Obj &o) {
	runs.clear();
	for (const Val &v : o.get("runs").o->vals) {
		const Obj &x = *v.o;
		Run r;
		r.i = x.get("i").i(), r.id = x.get("id").s, r.ai = ai_of(x.get("ai").s), r.x = x.get("x").n, r.y = x.get("y").n, r.sq = x.get("sq").i();
		r.parts = x.get("parts").i(), r.called = load_nums<int>(x.get("called")), r.main = x.get("main").i(), r.phase = x.get("phase").i();
		r.state = x.get("state").s, r.scale = x.get("scale").n, r.raid = x.get("raid").n, r.next = x.get("next").n, r.next2 = x.get("next2").n;
		r.perch = x.get("perch").i(), r.perchAt = x.get("perchAt").n;
		if (x.get("fly").k == Val::Ref) {
			const Obj &f = *x.get("fly").o;
			r.fly = Fly{ f.get("x0").n, f.get("y0").n, f.get("x1").n, f.get("y1").n, f.get("t0").n, f.get("t1").n, f.get("then").s };
		}
		r.fleeAt = x.get("fleeAt").n, r.respawnAt = x.get("respawnAt").n, r.guardN = x.get("guardN").n;
		const Obj &dmg = *x.get("dmg").o;
		for (size_t i = 0; i < dmg.keys.size(); i++) r.dmg[dmg.keys[i]] = dmg.vals[i].n;
		r.last = x.get("last").s;
		if (x.get("fx").k == Val::Ref) {
			const Obj &f = *x.get("fx").o;
			r.fx = RunFx{ f.get("kind").s, f.get("x").n, f.get("y").n, f.get("tx").n, f.get("ty").n, f.get("r").n, f.get("at").n };
		}
		if (x.get("tele").k == Val::Ref) {
			const Obj &t = *x.get("tele").o;
			r.tele = Tele{ t.get("kind").s, t.get("x").n, t.get("y").n, t.get("tx").n, t.get("ty").n, t.get("r").n, t.get("t0").n, t.get("go").n, t.get("at").n,
				t.get("held").b, t.get("wall").b };
		}
		r.stun = x.get("stun").n, r.surge = x.get("surge").n;
		if (x.has("hitAt")) r.hitAt = x.get("hitAt").n, r.hasHitAt = true;
		runs.push_back(std::move(r));
	}
	spawned = o.get("spawned").b, tick_ = o.get("tick").n;
	warden.reset();
	if (o.get("warden").k == Val::Ref) {
		const Obj &w = *o.get("warden").o;
		warden = Warden{ w.get("x").n, w.get("y").n, w.get("w").n, w.get("h").n, w.get("at").n };
	}
	wardenAt = o.get("wardenAt").n;
}

// ---- roam ----

Val Roam::save(Graph &g) const {
	Obj *o = g.object();
	o->set("groups", list_of(g, groups, [&](const Group &r) -> Val {
		Obj *x = g.object();
		x->set("id", r.id).set("kind", r.kind).set("mob", Val::opt(r.mob)).set("cls", r.cls).set("count", r.count).set("guards", r.guards);
		const std::string rk = "route:" + std::to_string(r.routeOf >= 0 ? r.routeOf : r.id);
		Obj *route = g.named(rk);
		if (!route) g.name(rk, route = g.nums(r.route));
		x->set("squad", r.squad).set("guard", r.guard).set("cart", r.cart).set("route", route).set("leg", r.leg).set("dir", r.dir);
		x->set("hx", r.hx).set("hy", r.hy).set("state", r.state).set("until", r.until).set("foe", r.foe).set("fx", r.fx).set("fy", r.fy);
		Obj *esc = g.object();
		for (const auto &[k, e] : r.escort) esc->set(k.c_str(), pair_of(g, e.first, e.second));
		x->set("stall", r.stall).set("asleep", r.asleep).set("hpSeen", r.hpSeen).set("escort", esc).set("road", r.road).set("dead", r.dead);
		x->set("respawnAt", r.respawnAt).set("once", r.once).set("pilgrim", r.pilgrim);
		return x;
	}));
	o->set("rng", g.rng(rng.state)).set("on", on).set("tick", tick_);
	return o;
}

void Roam::load(const Obj &o) {
	groups.clear();
	std::map<const Obj *, int> routes; // lookup only
	for (const Val &v : o.get("groups").o->vals) {
		const Obj &x = *v.o;
		Group r;
		r.id = x.get("id").i(), r.kind = x.get("kind").s;
		if (x.get("mob").k == Val::Str) r.mob = x.get("mob").s;
		r.cls = x.get("cls").s, r.count = x.get("count").n, r.guards = x.get("guards").n, r.squad = x.get("squad").i(), r.guard = x.get("guard").i();
		r.cart = x.get("cart").i(), r.route = load_nums<double>(x.get("route"));
		auto ro = routes.find(x.get("route").o);
		if (ro != routes.end()) r.routeOf = ro->second;
		else routes[x.get("route").o] = r.id;
		r.leg = x.get("leg").n, r.dir = x.get("dir").i(), r.hx = x.get("hx").n, r.hy = x.get("hy").n, r.state = x.get("state").s;
		r.until = x.get("until").n, r.foe = x.get("foe").i(), r.fx = x.get("fx").n, r.fy = x.get("fy").n, r.stall = x.get("stall").n;
		r.asleep = x.get("asleep").b, r.hpSeen = x.get("hpSeen").n;
		const Obj &esc = *x.get("escort").o;
		for (size_t i = 0; i < esc.keys.size(); i++) r.escort[esc.keys[i]] = { esc.vals[i].o->vals[0].n, esc.vals[i].o->vals[1].i() };
		r.road = x.get("road").n, r.dead = x.get("dead").b, r.respawnAt = x.get("respawnAt").n, r.once = x.get("once").b, r.pilgrim = x.get("pilgrim").b;
		groups.push_back(std::move(r));
	}
	rng.state = uint32_t(o.get("rng").o->get("state").n);
	on = o.get("on").b, tick_ = o.get("tick").n;
}

// ---- crafting (an order's recipe is a RECIPES row, saved by name) ----

Val Crafting::save(Graph &g) const {
	Obj *o = g.object(), *qs = g.make('m'), *ss = g.make('m');
	for (const auto &[id, q] : queues) {
		Obj *a = g.array();
		for (const QOrder &x : q) {
			Obj *e = g.object();
			e->set("id", x.id).set("kind", x.kind).set("recipe", Val::ext("RECIPES." + x.recipe->id));
			if (x.item) e->set("item", save_item(g, *x.item)).set("owner", x.owner ? Val(*x.owner) : Val());
			e->set("by", x.by).set("left", x.left).set("total", x.total).set("taken", x.taken ? save_cost(g, *x.taken) : Val::null());
			if (x.payer) {
				Obj *p = g.object();
				p->set("team", x.payer->team).set("owner", x.payer->owner);
				e->set("payer", p);
			}
			a->push(e);
		}
		qs->put(id, a);
	}
	for (const auto &[team, c] : supplies) ss->put(team, save_cost(g, c));
	o->set("queues", qs).set("supplies", ss).set("nextId", nextId);
	return o;
}

void Crafting::load(const Obj &o) {
	static const std::string RECIPES = "RECIPES.";
	queues.clear();
	const Obj &qs = *o.get("queues").o;
	for (size_t i = 0; i + 1 < qs.vals.size(); i += 2) {
		std::vector<QOrder> q;
		for (const Val &v : qs.vals[i + 1].o->vals) {
			const Obj &x = *v.o;
			QOrder r{ x.get("id").i(), x.get("kind").s, &data().recipes.RECIPES.at(x.get("recipe").s.substr(RECIPES.size())), std::nullopt, std::nullopt,
				x.get("by").i(), x.get("left").n, x.get("total").n, std::nullopt, std::nullopt };
			if (x.get("item").k == Val::Ref) r.item = load_item(x.get("item"));
			if (x.get("owner").k == Val::Str) r.owner = x.get("owner").s;
			if (x.get("taken").k == Val::Ref) r.taken = load_cost(x.get("taken"));
			if (x.get("payer").k == Val::Ref) r.payer = Payer{ x.get("payer").o->get("team").i(), x.get("payer").o->get("owner").s };
			q.push_back(std::move(r));
		}
		queues.emplace_back(qs.vals[i].i(), std::move(q));
	}
	supplies.clear();
	const Obj &ss = *o.get("supplies").o;
	for (size_t i = 0; i + 1 < ss.vals.size(); i += 2) supplies.emplace_back(ss.vals[i].i(), load_cost(ss.vals[i + 1]));
	nextId = o.get("nextId").i();
}

// ---- the pre-built towns ----

Val Towns::save(Graph &g) const {
	Obj *o = g.object(), *st = g.make('m'), *bl = g.make('m');
	for (const auto &[k, v] : stand) st->put(k, v);
	for (const auto &[k, v] : blessed_) bl->put(k, v);
	o->set("stand", st).set("blessed", bl).set("tick", tick_);
	return o;
}

void Towns::load(const Obj &o) {
	stand.clear(), blessed_.clear();
	const Obj &st = *o.get("stand").o, &bl = *o.get("blessed").o;
	for (size_t i = 0; i + 1 < st.vals.size(); i += 2) stand.emplace_back(st.vals[i].i(), st.vals[i + 1].n);
	for (size_t i = 0; i + 1 < bl.vals.size(); i += 2) blessed_.emplace_back(bl.vals[i].i(), bl.vals[i + 1].n);
	tick_ = o.get("tick").n;
}

// ---- vision ----

Val Vision::save(Graph &g, const std::function<Val(const BuildingSnap &)> &snap) const {
	Obj *o = g.object(), *ts = g.make('m');
	for (const auto &[t, v] : teams) {
		Obj *e = g.object(), *fog = g.object(), *seen = g.make('m'), *keys = g.make('m');
		fog->set("team", t).set("w", cells.cw).set("h", cells.ch).set("cell", VISION.cell).set("state", g.typed(TA::Uint8, v.state)).set("version", v.version);
		for (int id : v.seen_order) {
			const VisionBuilding &b = v.seen.at(id);
			Obj *s = g.find(b.snap.get()); // the same object for every team that saw it at that poll
			if (!s) g.bind(b.snap.get(), s = snap(*b.snap).o);
			seen->put(id, s);
		}
		for (const auto &[k, en] : v.keys) keys->put(k, en.n);
		e->set("count", g.typed(TA::Uint16, v.count)).set("fog", fog).set("seen", seen).set("keys", keys);
		ts->put(t, e);
	}
	o->set("cellH", g.typed(TA::Uint8, cells.cell_h)).set("cellF", g.typed(TA::Uint8, cells.cell_f)).set("heightsAt", heights_at).set("teams", ts);
	return o;
}

void Vision::load(const Obj &o, const std::function<BuildingSnap(const Obj &)> &snap) {
	o.get("cellH").o->fill(cells.cell_h);
	o.get("cellF").o->fill(cells.cell_f);
	heights_at = o.get("heightsAt").n;
	polled = false;
	teams.clear();
	std::map<const Obj *, std::shared_ptr<const BuildingSnap>> snaps; // lookup only
	const Obj &ts = *o.get("teams").o;
	for (size_t i = 0; i + 1 < ts.vals.size(); i += 2) {
		const Obj &e = *ts.vals[i + 1].o;
		Team &v = teams[ts.vals[i].i()];
		e.get("count").o->fill(v.count);
		const Obj &fog = *e.get("fog").o;
		fog.get("state").o->fill(v.state);
		v.version = fog.get("version").i();
		const Obj &seen = *e.get("seen").o;
		for (size_t j = 0; j + 1 < seen.vals.size(); j += 2) {
			const Obj *so = seen.vals[j + 1].o;
			std::shared_ptr<const BuildingSnap> &sp = snaps[so];
			if (!sp) sp = std::make_shared<BuildingSnap>(snap(*so));
			const int id = seen.vals[j].i();
			v.seen_order.push_back(id);
			v.seen[id] = vision_building(*sp);
			v.seen[id].snap = sp;
		}
		const Obj &keys = *e.get("keys").o;
		for (size_t j = 0; j + 1 < keys.vals.size(); j += 2) {
			const int k = keys.vals[j].i();
			v.keys[k] = Entry{ cells.compute(k / 128, k % 128), keys.vals[j + 1].i() };
		}
	}
}

} // namespace sim
