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

// ---- load ----

namespace {

Cost cost_of(const Val &v) { return load_cost(v); }
std::vector<int> ints(const Val &v) { return load_nums<int>(v); }

} // namespace

// A tiles array of building id as a version: its current one (the building's own), or an older one some snapshot or its
// farm node still holds (distinct arrays, distinct versions, so a save shares them again as they came).
int Works::verOf(int id, const Obj *o) const {
	if (id >= 0 && id < int(curTiles_.size()) && curTiles_[id] == o) return buildings[id].tilesVer;
	auto it = vers_.find(o);
	if (it != vers_.end()) return it->second;
	return vers_[o] = 1000000 + oldVers_[id]++;
}

void Works::load(const Obj &o, const std::function<Worker *(const Val &)> &worker) {
	lieges.clear();
	const Obj &lg = *o.get("lieges").o;
	for (size_t i = 0; i + 1 < lg.vals.size(); i += 2) lieges[lg.vals[i].s] = Liege{ lg.vals[i + 1].o->get("to").s, lg.vals[i + 1].o->get("pct").n };
	// buildings first (their tiles are the versions the nodes and snapshots refer to)
	buildings.clear();
	curTiles_.clear(), vers_.clear(), oldVers_.clear();
	std::map<const Obj *, Building *> bOf; // lookup only
	std::map<const Obj *, int64_t> insides; // lookup only
	for (const Val &v : o.get("buildings").o->vals) {
		const Obj &x = *v.o;
		Building b;
		b.id = x.get("id").i(), b.type = x.get("type").s, b.def = &building(b.type), b.team = x.get("team").i(), b.rot = x.get("rot").i();
		b.x = x.get("x").n, b.y = x.get("y").n, b.w = x.get("w").n, b.h = x.get("h").n, b.tiles = ints(x.get("tiles")), b.tilesVer = 0;
		b.ti = ints(x.get("ti")), b.state = x.get("state").s, b.labour = x.get("labour").n, b.need = x.get("need").n;
		b.cost = cost_of(x.get("cost")), b.delivered = cost_of(x.get("delivered")), b.incoming = cost_of(x.get("incoming"));
		b.costSum = x.get("costSum").n, b.hp = x.get("hp").n, b.maxHp = x.get("maxHp").n, b.saved = load_nums<double>(x.get("saved"));
		b.users = x.get("users").i(), b.node = x.get("node").i(), b.slots = ints(x.get("slots")), b.slotUser = ints(x.get("slotUser"));
		b.cancelled = x.get("cancelled").b, b.base = load_nums<double>(x.get("base"));
		const Obj *in = x.get("inside").o;
		b.inside = { in->vals[0].n, in->vals[1].n };
		auto ik = insides.find(in);
		b.insideKey = ik != insides.end() ? ik->second : (insides[in] = b.id + 1);
		b.decked = x.get("decked").b, b.attach = x.get("attach").i(), b.door = x.get("door").i();
		if (x.get("prev").k == Val::Ref) {
			const Obj &p = *x.get("prev").o;
			b.prev = Building::Prev{ p.get("type").s, &building(p.get("type").s), p.get("maxHp").n, p.get("hp").n, p.get("need").n, cost_of(p.get("cost")),
				p.get("costSum").n, cost_of(p.get("delivered")), p.get("n").i() };
		}
		b.burn = x.get("burn").n, b.kindle = x.get("kindle").n, b.rubble = x.get("rubble").b, b.siege = x.get("siege").i(), b.push = x.get("push").n;
		if (x.get("bridge").k == Val::Ref) {
			const Obj &l = *x.get("bridge").o;
			BridgeLine bl;
			bl.ids = ints(l.get("ids")), bl.i = l.get("i").i(), bl.axis = l.get("axis").s;
			bl.dir = { l.get("dir").o->vals[0].i(), l.get("dir").o->vals[1].i() };
			bl.width = l.get("width").i(), bl.part = l.get("part").s, bl.deck = l.get("deck").n, bl.rows = load_nums<double>(l.get("rows"));
			b.bridge = std::move(bl);
		}
		b.fuel = x.get("fuel").n, b.iron = x.get("iron").b, b.wet = x.get("wet").n, b.hold = load_opt_hold(x.get("hold")), b.owner = x.get("owner").s;
		if (x.get("pre").k == Val::Ref) {
			const Obj &p = *x.get("pre").o;
			b.pre = Pre{ p.get("i").i(), p.get("zone").i(), p.get("landmark").b, p.get("ruin").b, p.get("gone").b, load_nums<double>(p.get("ground")),
				p.get("fouled").n, p.get("foulT").n };
		}
		b.lastBy = x.get("lastBy").i(), b.mend = x.get("mend").b, b.credit = x.get("credit").n, b.raze = x.get("raze").n, b.staff = x.get("staff").b;
		b.access = x.get("access").s, b.share = x.get("share").n, b.fee = x.get("fee").n, b.lock = x.get("lock").n, b.lockTold = x.get("lockTold").n;
		curTiles_.push_back(x.get("tiles").o);
		buildings.push_back(std::move(b));
		bOf[&x] = &buildings.back();
	}
	nodes.clear();
	std::map<const Obj *, Node *> nOf; // lookup only
	for (const Val &v : o.get("nodes").o->vals) {
		const Obj &x = *v.o;
		Node n;
		n.id = x.get("id").i(), n.res = x.get("res").s, n.x = x.get("x").n, n.y = x.get("y").n, n.amount = x.get("amount").n, n.max = x.get("max").n;
		n.regrow = x.get("regrow").n, n.rate = x.get("rate").n, n.slots = x.get("slots").n, n.users = x.get("users").i(), n.tiles = ints(x.get("tiles"));
		if (x.has("obj")) n.obj = x.get("obj").i();
		n.rare = x.get("rare").b;
		if (x.has("building")) n.building = x.get("building").i(), n.tilesVer = verOf(*n.building, x.get("tiles").o);
		if (x.has("kiln")) n.kiln = x.get("kiln").i();
		if (x.has("locked")) n.locked = x.get("locked").b, n.hasLocked = true;
		nodes.push_back(std::move(n));
		nOf[&x] = &nodes.back();
	}
	o.get("nodeAt").o->fill(nodeAt);
	regrowing.clear();
	for (const Val &v : o.get("regrowing").o->vals) regrowing.push_back(nOf.at(v.o));
	auto refs = [&](const char *key) {
		std::vector<Building *> out;
		for (const Val &v : o.get(key).o->vals) out.push_back(bOf.at(v.o));
		return out;
	};
	braziers = refs("braziers");
	o.get("occ").o->fill(occ);
	o.get("noBuild").o->fill(noBuild);
	reserve.clear();
	const Obj &rs = *o.get("reserve").o;
	for (size_t i = 0; i + 1 < rs.vals.size(); i += 2) reserve[rs.vals[i].i()] = load_hold(rs.vals[i + 1]);
	storeList = refs("storeList");
	claims.clear();
	for (const Val &v : o.get("claims").o->vals) claims.push_back({ v.o->get("team").i(), v.o->get("x").n, v.o->get("y").n, v.o->get("r").n });
	const Obj &io = *o.get("infl").o;
	infl.w = io.get("w").i(), infl.h = io.get("h").i(), infl.version = io.get("version").i();
	io.get("mask").o->fill(infl.mask);
	pathQueue.clear();
	for (const Val &v : o.get("pathQueue").o->vals) pathQueue.push_back(worker(v));
	waits.clear();
	const Obj &ws = *o.get("waits").o;
	for (size_t i = 0; i + 1 < ws.vals.size(); i += 2) {
		const Obj &p = *ws.vals[i + 1].o;
		waits[ws.vals[i].i()] = { p.vals[0].n, p.vals[1].n, p.vals[2].n };
	}
	active.clear();
	for (const Val &v : o.get("active").o->vals) active.push_back(worker(v));
	cutOff.clear();
	const Obj &co = *o.get("cutOff").o;
	for (size_t i = 0; i + 1 < co.vals.size(); i += 2) {
		JsSet<int> &s = cutOff[co.vals[i].i()];
		for (const Val &x : co.vals[i + 1].o->vals) s.insert(x.i());
	}
	waitAt.clear();
	for (const Val &x : o.get("waitAt").o->vals) waitAt.insert(x.i());
	burning = refs("burning");
	tick_ = o.get("tick").i(), fields = o.get("fields").i();
	prebuilt_ = refs("prebuilt");
	fallback_ = o.get("fallback").i();
	// the caches start afresh (the TS works' too: they are not saved)
	nets.clear(), netCache.clear(), storeVer = 0;
}

BuildingSnap Works::loadSnap(const Obj &o) const {
	BuildingSnap s;
	s.id = o.get("id").i(), s.type = o.get("type").s, s.team = o.get("team").i(), s.x = o.get("x").n, s.y = o.get("y").n, s.w = o.get("w").n;
	s.h = o.get("h").n, s.rot = o.get("rot").i(), s.tiles = ints(o.get("tiles")), s.tilesVer = verOf(s.id, o.get("tiles").o), s.state = o.get("state").s;
	s.progress = o.get("progress").n, s.delivered = o.get("delivered").n, s.hp = o.get("hp").n, s.maxHp = o.get("maxHp").n;
	s.workers = o.get("workers").i(), s.maxWorkers = o.get("maxWorkers").i();
	if (o.has("tier")) s.tier = o.get("tier").n;
	if (o.has("walk")) s.walk = o.get("walk").n;
	if (o.has("depth")) s.depth = o.get("depth").n;
	if (o.has("attach")) s.attach = o.get("attach").i();
	if (o.has("steps")) s.steps = load_nums<double>(o.get("steps"));
	if (o.has("door")) s.door = std::array<int, 2>{ o.get("door").o->vals[0].i(), o.get("door").o->vals[1].i() };
	if (o.has("cap")) s.cap = o.get("cap").n;
	if (o.has("upgradeFrom")) s.upgradeFrom = o.get("upgradeFrom").s;
	if (o.has("burning")) s.burning = o.get("burning").n;
	if (o.has("lit")) s.lit = o.get("lit").b;
	if (o.has("fuel")) s.fuel = o.get("fuel").n;
	s.rubble = o.get("rubble").b;
	if (o.has("siege")) s.siege = o.get("siege").i();
	s.iron = o.get("iron").b, s.wet = o.get("wet").b;
	if (o.has("push")) s.push = o.get("push").n;
	if (o.has("bridge")) {
		const Obj &l = *o.get("bridge").o;
		BridgeLine bl;
		bl.axis = l.get("axis").s, bl.dir = { l.get("dir").o->vals[0].i(), l.get("dir").o->vals[1].i() }, bl.width = l.get("width").i();
		bl.part = l.get("part").s, bl.deck = l.get("deck").n, bl.rows = load_nums<double>(l.get("rows"));
		s.bridge = std::move(bl);
	}
	if (o.has("goods")) s.goods = cost_of(o.get("goods"));
	if (o.has("items")) {
		s.items = o.get("items").i();
		std::vector<HoldItem> list;
		for (const Val &v : o.get("list").o->vals) {
			HoldItem it{ v.o->get("uid").s, v.o->get("def").s, v.o->get("rarity").s };
			if (v.o->has("q")) it.q = v.o->get("q").i();
			list.push_back(std::move(it));
		}
		s.list = std::move(list);
	}
	if (o.has("tithe")) s.tithe = cost_of(o.get("tithe")), s.titheTo = o.get("titheTo").s;
	if (o.has("owner")) s.owner = o.get("owner").s;
	s.staffed = o.get("staffed").b;
	if (o.has("access")) s.access = o.get("access").s;
	if (o.has("share")) s.share = o.get("share").n;
	if (o.has("fee")) s.fee = o.get("fee").n;
	if (o.has("lock")) s.lock = o.get("lock").n, s.lockMax = o.get("lockMax").n;
	s.pre = o.get("pre").b, s.landmark = o.get("landmark").b;
	if (o.has("art")) s.art = o.get("art").s;
	s.ruin = o.get("ruin").b, s.fouled = o.get("fouled").b, s.mend = o.get("mend").b;
	if (o.has("razing")) s.razing = o.get("razing").n;
	if (o.has("stalled")) s.stalled = o.get("stalled").s;
	if (o.has("waiting")) s.waiting = cost_of(o.get("waiting"));
	if (o.has("stalls")) s.stalls = o.get("stalls").i();
	return s;
}

} // namespace sim
