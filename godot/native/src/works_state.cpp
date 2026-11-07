// Works save and load (src/war/sim/works.ts saveRoot / loadRoot): the works' state as the TS works hand it to state.ts.
// Shared arrays come out shared as in TS: a building's tiles with its snapshots and its farm node (per tiles version), a
// bridge's ids and dir with all its pieces, a wall's inside point with all its pieces.
#include "works.h"

#include <string>

#include "state_util.h"

namespace sim {

using state::Graph;
using state::Obj;
using state::TA;
using state::Val;

namespace {

Obj *named_nums(Graph &g, const std::string &key, const std::vector<int> &v) {
	if (Obj *o = g.named(key)) return o;
	Obj *o = g.nums(v);
	g.name(key, o);
	return o;
}
std::string tiles_key(int id, int ver) { return "btiles:" + std::to_string(id) + ":" + std::to_string(ver); }

} // namespace

Obj *Works::tilesObj(Graph &g, int id, int ver, const std::vector<int> &tiles) const { return named_nums(g, tiles_key(id, ver), tiles); }

Val Works::saveSnap(Graph &g, const BuildingSnap &s) const {
	Obj *o = g.object();
	o->set("id", s.id).set("type", s.type).set("team", s.team).set("x", s.x).set("y", s.y).set("w", s.w).set("h", s.h).set("rot", s.rot);
	o->set("tiles", tilesObj(g, s.id, s.tilesVer, s.tiles)).set("state", s.state).set("progress", s.progress).set("delivered", s.delivered);
	o->set("hp", s.hp).set("maxHp", s.maxHp).set("workers", s.workers).set("maxWorkers", s.maxWorkers);
	if (s.tier) o->set("tier", *s.tier);
	if (s.walk) o->set("walk", *s.walk);
	if (s.depth) o->set("depth", *s.depth);
	if (s.attach) o->set("attach", *s.attach);
	if (s.steps) o->set("steps", g.nums(*s.steps));
	if (s.door) {
		Obj *d = g.array();
		d->push((*s.door)[0]).push((*s.door)[1]);
		o->set("door", d);
	}
	if (s.cap) o->set("cap", *s.cap);
	if (s.upgradeFrom) o->set("upgradeFrom", *s.upgradeFrom);
	if (s.burning) o->set("burning", *s.burning);
	if (s.lit) o->set("lit", *s.lit);
	if (s.fuel) o->set("fuel", *s.fuel);
	if (s.rubble) o->set("rubble", true);
	if (s.siege) o->set("siege", *s.siege);
	if (s.iron) o->set("iron", true);
	if (s.wet) o->set("wet", true);
	if (s.push) o->set("push", *s.push);
	if (s.bridge) {
		const BridgeLine &l = *s.bridge;
		Obj *b = g.object();
		b->set("axis", l.axis).set("dir", bridgeDir(g, s.id)).set("width", l.width).set("part", l.part).set("deck", l.deck).set("rows", bridgeRows(g, s.id));
		o->set("bridge", b);
	}
	if (s.goods) {
		o->set("goods", save_cost(g, *s.goods));
		if (s.items) {
			Obj *list = g.array();
			for (const HoldItem &it : *s.list) {
				Obj *i = g.object();
				i->set("uid", it.uid).set("def", it.def).set("rarity", it.rarity);
				if (it.q) i->set("q", *it.q);
				list->push(i);
			}
			o->set("items", *s.items).set("list", list);
		}
	}
	if (s.tithe) o->set("tithe", save_cost(g, *s.tithe)).set("titheTo", *s.titheTo);
	if (s.owner) o->set("owner", *s.owner);
	if (s.staffed) o->set("staffed", true);
	if (s.access) {
		o->set("access", *s.access);
		if (s.share) o->set("share", *s.share);
		if (s.fee) o->set("fee", *s.fee);
	}
	if (s.lock) o->set("lock", *s.lock).set("lockMax", *s.lockMax);
	if (s.pre) {
		o->set("pre", true);
		if (s.landmark) o->set("landmark", true);
		if (s.art) o->set("art", *s.art);
		if (s.ruin) o->set("ruin", true);
		if (s.fouled) o->set("fouled", true);
	}
	if (s.mend) o->set("mend", true);
	if (s.razing) o->set("razing", *s.razing);
	if (s.stalled) o->set("stalled", *s.stalled);
	if (s.waiting) o->set("waiting", save_cost(g, *s.waiting));
	if (s.stalls) o->set("stalls", *s.stalls);
	return o;
}

// a bridge's dir and rows arrays: one per piece line (dir, ids) or per piece (rows), as the TS pieces share them
Obj *Works::bridgeDir(Graph &g, int id) const {
	const BridgeLine &l = *buildings[id].bridge;
	const std::string key = "bdir:" + std::to_string(l.ids.empty() ? id : l.ids[0]);
	if (Obj *o = g.named(key)) return o;
	Obj *o = g.array();
	o->push(l.dir[0]).push(l.dir[1]);
	g.name(key, o);
	return o;
}
Obj *Works::bridgeRows(Graph &g, int id) const {
	const std::string key = "brows:" + std::to_string(id);
	if (Obj *o = g.named(key)) return o;
	Obj *o = g.nums(buildings[id].bridge->rows);
	g.name(key, o);
	return o;
}

Val Works::save(Graph &g, const std::function<Val(const Worker *)> &worker) const {
	for (const Building &b : buildings) g.keyed(&b, 'o');
	for (const Node &n : nodes) g.keyed(&n, 'o');
	auto bref = [&](const Building *b) -> Val { return g.find(b); };
	auto list = [&](auto &&items, auto &&f) {
		Obj *a = g.array();
		for (auto &&x : items) a->push(f(x));
		return a;
	};
	for (const Node &n : nodes) {
		Obj *o = g.find(&n);
		o->set("id", n.id).set("res", n.res).set("x", n.x).set("y", n.y).set("amount", n.amount).set("max", n.max).set("regrow", n.regrow);
		o->set("rate", n.rate).set("slots", n.slots).set("users", n.users);
		o->set("tiles", n.building && n.tilesVer >= 0 ? Val(tilesObj(g, *n.building, n.tilesVer, n.tiles)) : Val(g.nums(n.tiles)));
		if (n.obj) o->set("obj", *n.obj);
		if (n.rare) o->set("rare", true);
		if (n.building) o->set("building", *n.building);
		if (n.kiln) o->set("kiln", *n.kiln);
		if (n.hasLocked) o->set("locked", n.locked);
	}
	for (const Building &b : buildings) {
		Obj *o = g.find(&b);
		o->set("id", b.id).set("type", b.type).set("def", Val::ext("BUILDINGS." + b.type)).set("team", b.team).set("rot", b.rot).set("x", b.x).set("y", b.y);
		o->set("w", b.w).set("h", b.h).set("tiles", tilesObj(g, b.id, b.tilesVer, b.tiles)).set("ti", g.nums(b.ti)).set("state", b.state);
		o->set("labour", b.labour).set("need", b.need).set("cost", save_cost(g, b.cost)).set("delivered", save_cost(g, b.delivered));
		o->set("incoming", save_cost(g, b.incoming)).set("costSum", b.costSum).set("hp", b.hp).set("maxHp", b.maxHp).set("saved", g.nums(b.saved));
		o->set("users", b.users).set("node", b.node).set("slots", g.nums(b.slots)).set("slotUser", g.nums(b.slotUser)).set("cancelled", b.cancelled);
		Obj *inside = b.insideKey ? g.named("inside:" + std::to_string(b.insideKey)) : nullptr;
		if (!inside) {
			inside = g.array();
			inside->push(b.inside[0]).push(b.inside[1]);
			if (b.insideKey) g.name("inside:" + std::to_string(b.insideKey), inside);
		}
		o->set("base", g.nums(b.base)).set("inside", inside).set("decked", b.decked).set("attach", b.attach).set("door", b.door);
		if (b.prev) {
			const Building::Prev &p = *b.prev;
			Obj *po = g.object();
			po->set("type", p.type).set("def", Val::ext("BUILDINGS." + p.type)).set("maxHp", p.maxHp).set("hp", p.hp).set("need", p.need);
			po->set("cost", save_cost(g, p.cost)).set("costSum", p.costSum).set("delivered", save_cost(g, p.delivered)).set("n", p.n);
			o->set("prev", po);
		} else o->set("prev", Val::null());
		o->set("burn", b.burn).set("kindle", b.kindle).set("rubble", b.rubble).set("siege", b.siege).set("push", b.push);
		if (b.bridge) {
			const BridgeLine &l = *b.bridge;
			Obj *bo = g.object();
			bo->set("ids", named_nums(g, "bids:" + std::to_string(l.ids.empty() ? b.id : l.ids[0]), l.ids)).set("i", l.i).set("axis", l.axis);
			bo->set("dir", bridgeDir(g, b.id)).set("width", l.width).set("part", l.part).set("deck", l.deck).set("rows", bridgeRows(g, b.id));
			o->set("bridge", bo);
		} else o->set("bridge", Val::null());
		o->set("fuel", b.fuel).set("iron", b.iron).set("wet", b.wet).set("hold", b.hold ? save_hold(g, *b.hold) : Val::null()).set("owner", b.owner);
		if (b.pre) {
			const Pre &p = *b.pre;
			Obj *po = g.object();
			po->set("i", p.i).set("zone", p.zone).set("landmark", p.landmark).set("ruin", p.ruin).set("gone", p.gone).set("ground", g.nums(p.ground));
			po->set("fouled", p.fouled).set("foulT", p.foulT);
			o->set("pre", po);
		} else o->set("pre", Val::null());
		o->set("lastBy", b.lastBy).set("mend", b.mend).set("credit", b.credit).set("raze", b.raze).set("staff", b.staff).set("access", b.access);
		o->set("share", b.share).set("fee", b.fee).set("lock", b.lock).set("lockTold", b.lockTold);
	}
	Obj *root = g.object();
	Obj *lg = g.make('m');
	for (const auto &[owner, l] : lieges) {
		Obj *lo = g.object();
		lo->set("to", l.to).set("pct", l.pct);
		lg->put(owner, lo);
	}
	root->set("lieges", lg).set("nodes", list(nodes, [&](const Node &n) -> Val { return g.find(&n); }));
	root->set("nodeAt", g.typed(TA::Int32, nodeAt)).set("regrowing", list(regrowing, [&](const Node *n) -> Val { return g.find(n); }));
	root->set("buildings", list(buildings, [&](const Building &b) -> Val { return g.find(&b); })).set("braziers", list(braziers, bref));
	root->set("occ", g.typed(TA::Int32, occ)).set("noBuild", g.typed(TA::Uint8, noBuild));
	Obj *rs = g.make('m');
	for (const auto &[team, h] : reserve) rs->put(team, save_hold(g, h));
	root->set("reserve", rs).set("storeList", list(storeList, bref));
	root->set("claims", list(claims, [&](const Claim &c) -> Val {
		Obj *o = g.object();
		o->set("team", c.team).set("x", c.x).set("y", c.y).set("r", c.r);
		return o;
	}));
	Obj *io = g.object();
	io->set("w", infl.w).set("h", infl.h).set("mask", g.typed(TA::Uint8, infl.mask)).set("version", infl.version);
	root->set("infl", io).set("pathQueue", list(pathQueue, worker));
	Obj *ws = g.make('m');
	for (const auto &[id, p] : waits) {
		Obj *a = g.array();
		a->push(p[0]).push(p[1]).push(p[2]);
		ws->put(id, a);
	}
	root->set("waits", ws);
	Obj *ac = g.make('s');
	for (const Worker *u : active) ac->push(worker(u));
	root->set("active", ac);
	Obj *co = g.make('m');
	for (const auto &[id, set] : cutOff) {
		Obj *s = g.make('s');
		for (int x : set) s->push(x);
		co->put(id, s);
	}
	Obj *wa = g.make('s');
	for (int t : waitAt) wa->push(t);
	root->set("cutOff", co).set("waitAt", wa).set("burning", list(burning, bref)).set("tick", tick_).set("fields", fields);
	root->set("prebuilt", list(prebuilt_, bref)).set("fallback", fallback_);
	return root;
}

} // namespace sim
