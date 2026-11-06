#include "works_probe.h"

#include <deque>
#include <set>

#include <godot_cpp/core/class_db.hpp>

#include "holders.h"
#include "js_math.h"
#include "sim_data.h"
#include "works.h"

namespace sim {

static std::string S(const godot::Variant &v) { return godot::String(v).utf8().get_data(); }
static godot::String G(const std::string &s) { return godot::String::utf8(s.c_str()); }
static int I(const godot::Variant &v) { return int(double(v)); }
static bool nil(const godot::Variant &v) { return v.get_type() == godot::Variant::NIL; }

static godot::Array ints(const std::vector<int> &v) {
	godot::Array a;
	for (int x : v) a.push_back(x);
	return a;
}
static godot::Array nums(const std::vector<double> &v) {
	godot::Array a;
	for (double x : v) a.push_back(x);
	return a;
}
static std::vector<int> vints(const godot::Array &a) {
	std::vector<int> v;
	for (int64_t i = 0; i < a.size(); i++) v.push_back(I(a[i]));
	return v;
}
static std::vector<double> vnums(const godot::Array &a) {
	std::vector<double> v;
	for (int64_t i = 0; i < a.size(); i++) v.push_back(double(a[i]));
	return v;
}
static godot::Dictionary costDict(const Cost &c) {
	godot::Dictionary d;
	for (const auto &e : c.kv) d[G(e.first)] = e.second;
	return d;
}
static Cost costOf(const godot::Dictionary &d) {
	Cost c;
	const godot::Array ks = d.keys();
	for (int64_t i = 0; i < ks.size(); i++) c.set(S(ks[i]), double(d[ks[i]]));
	return c;
}
static godot::Variant holdSer(const Hold *h) {
	if (!h) return godot::Variant();
	godot::Dictionary d;
	godot::Array lots, items;
	for (const Lot &l : h->lots) {
		godot::Array e;
		e.push_back(G(l.r));
		e.push_back(l.n);
		e.push_back(G(l.o));
		e.push_back(l.s ? godot::Variant(*l.s) : godot::Variant());
		lots.push_back(e);
	}
	for (const Item &it : h->items) items.push_back(G(it.uid));
	d["lots"] = lots;
	d["items"] = items;
	return d;
}
static godot::Array lineSer(const BridgeLine &b) {
	godot::Array a;
	a.push_back(G(b.axis));
	a.push_back(godot::Array::make(b.dir[0], b.dir[1]));
	a.push_back(b.width);
	a.push_back(G(b.part));
	a.push_back(b.deck);
	a.push_back(nums(b.rows));
	return a;
}
static godot::Variant actSer(const Act &a) {
	if (a.kind == Act::NONE) return godot::Variant();
	if (a.kind == Act::HERE) return godot::String("here");
	// NaN here is a read past a path's end: undefined in TS, null in its JSON
	const auto u = [](double v) { return v != v ? godot::Variant() : godot::Variant(v); };
	return godot::Array::make(u(a.x), u(a.y));
}

// The fake world of src/dev/vectors/works.ts: squads with a home (one with a cart), workers, extra men for the staff scan.
struct ProbeSquad : WorkSquad {
	double hx = 0, hy = 0;
	bool hasCart = false;
	double cx = 0, cy = 0, cap = 0;
	Hold cart;
};
struct ProbeWorld {
	std::deque<ProbeSquad> squads;
	std::deque<Worker> workers;
	std::vector<std::array<double, 3>> men;
	std::set<int> immune;
};

struct ReplayWorksHost : WorksHost {
	Grid *grid = nullptr;
	ProbeWorld *world = nullptr;
	godot::Array events, expect;

	void ev(const godot::Array &e) { events.push_back(e); }
	// The TS answer to the call about to be logged (its event at this index), or nil.
	godot::Variant answer(const char *name, int at) {
		const int64_t i = events.size();
		if (i >= expect.size()) return godot::Variant();
		const godot::Array e = expect[i];
		if (e.size() <= at || S(e[0]) != name) return godot::Variant();
		return e[at];
	}
	void dirty() {
		if (grid->dirty.empty()) return;
		ev(godot::Array::make("dirty", ints(grid->dirty)));
		grid->dirty.clear();
	}

	std::vector<double> path(int team, double x0, double y0, double x1, double y1) override {
		dirty();
		grid->team = team;
		const godot::Variant a = answer("path", 6);
		const std::vector<double> pts = a.get_type() == godot::Variant::ARRAY ? vnums(a) : std::vector<double>{};
		godot::Array e = godot::Array::make("path", team, x0, y0, x1, y1);
		e.push_back(nums(pts));
		ev(e);
		return pts;
	}
	void evict(const std::vector<int> &tiles) override { ev(godot::Array::make("evict", ints(tiles))); }
	bool chance(double p) override {
		const godot::Variant a = answer("chance", 2);
		const bool r = a.get_type() == godot::Variant::BOOL && bool(a);
		ev(godot::Array::make("chance", p, r));
		return r;
	}
	void fall(const std::vector<int> &tiles) override { ev(godot::Array::make("fall", ints(tiles))); }
	void spill(double x, double y, const Hold &hold, bool burnt) override { ev(godot::Array::make("spill", x, y, holdSer(&hold), burnt)); }
	void razed(const Building &b, int by) override { ev(godot::Array::make("razed", b.id, by)); }
	bool immune(const Building &b) override {
		const bool r = world->immune.count(b.id) > 0;
		ev(godot::Array::make("immune", b.id, r));
		return r;
	}
	double douse(const Building &b) override {
		const double r = b.id % 2 ? 1.5 : 1;
		ev(godot::Array::make("douse", b.id, r));
		return r;
	}
	void laboured(Worker &u, const Building &b, double secs) override { ev(godot::Array::make("lab", u.id, b.id, secs)); }
	RepairK repairK(const Building &b) override {
		const RepairK r = b.pre ? RepairK{ 1.25, 0.8 } : RepairK{ 1, 1 };
		ev(godot::Array::make("repairK", b.id, r.speed, r.cost));
		return r;
	}
	std::optional<CartDrop> cartDrop(WorkSquad &s) override {
		int q = 0;
		for (; q < int(world->squads.size()); q++)
			if (&world->squads[q] == &s) break;
		ProbeSquad &p = world->squads[q];
		if (!p.hasCart) {
			ev(godot::Array::make("cart", q, godot::Variant()));
			return std::nullopt;
		}
		const double room = p.cap - loads(p.cart);
		ev(godot::Array::make("cart", q, p.cx, p.cy, room));
		return CartDrop{ p.cx, p.cy, &p.cart, room };
	}
};

static godot::Dictionary snapDict(const BuildingSnap &s) {
	godot::Dictionary d;
	d["id"] = s.id;
	d["type"] = G(s.type);
	d["team"] = s.team;
	d["x"] = s.x;
	d["y"] = s.y;
	d["w"] = s.w;
	d["h"] = s.h;
	d["rot"] = s.rot;
	d["tiles"] = ints(s.tiles);
	d["state"] = G(s.state);
	d["progress"] = s.progress;
	d["delivered"] = s.delivered;
	d["hp"] = s.hp;
	d["maxHp"] = s.maxHp;
	d["workers"] = s.workers;
	d["maxWorkers"] = s.maxWorkers;
	if (s.tier) d["tier"] = *s.tier;
	if (s.walk) d["walk"] = *s.walk;
	if (s.depth) d["depth"] = *s.depth;
	if (s.attach) d["attach"] = *s.attach;
	if (s.steps) d["steps"] = nums(*s.steps);
	if (s.door) d["door"] = godot::Array::make((*s.door)[0], (*s.door)[1]);
	if (s.cap) d["cap"] = *s.cap;
	if (s.upgradeFrom) d["upgradeFrom"] = G(*s.upgradeFrom);
	if (s.burning) d["burning"] = *s.burning;
	if (s.lit) d["lit"] = *s.lit;
	if (s.fuel) d["fuel"] = *s.fuel;
	if (s.rubble) d["rubble"] = true;
	if (s.siege) d["siege"] = *s.siege;
	if (s.iron) d["iron"] = true;
	if (s.wet) d["wet"] = true;
	if (s.push) d["push"] = *s.push;
	if (s.bridge) {
		godot::Dictionary b;
		b["axis"] = G(s.bridge->axis);
		b["dir"] = godot::Array::make(s.bridge->dir[0], s.bridge->dir[1]);
		b["width"] = s.bridge->width;
		b["part"] = G(s.bridge->part);
		b["deck"] = s.bridge->deck;
		b["rows"] = nums(s.bridge->rows);
		d["bridge"] = b;
	}
	if (s.goods) d["goods"] = costDict(*s.goods);
	if (s.items) d["items"] = *s.items;
	if (s.list) {
		godot::Array l;
		for (const HoldItem &it : *s.list) {
			godot::Dictionary e;
			e["uid"] = G(it.uid);
			e["def"] = G(it.def);
			e["rarity"] = G(it.rarity);
			if (it.q) e["q"] = *it.q;
			l.push_back(e);
		}
		d["list"] = l;
	}
	if (s.tithe) d["tithe"] = costDict(*s.tithe);
	if (s.titheTo) d["titheTo"] = G(*s.titheTo);
	if (s.owner) d["owner"] = G(*s.owner);
	if (s.staffed) d["staffed"] = true;
	if (s.access) d["access"] = G(*s.access);
	if (s.share) d["share"] = *s.share;
	if (s.fee) d["fee"] = *s.fee;
	if (s.lock) d["lock"] = *s.lock;
	if (s.lockMax) d["lockMax"] = *s.lockMax;
	if (s.pre) d["pre"] = true;
	if (s.landmark) d["landmark"] = true;
	if (s.art) d["art"] = G(*s.art);
	if (s.ruin) d["ruin"] = true;
	if (s.fouled) d["fouled"] = true;
	if (s.mend) d["mend"] = true;
	if (s.razing) d["razing"] = *s.razing;
	if (s.waiting) d["waiting"] = costDict(*s.waiting);
	if (s.stalled) d["stalled"] = G(*s.stalled);
	if (s.stalls) d["stalls"] = *s.stalls;
	return d;
}

WallOrder wall_order_of(const godot::Dictionary &d) {
	WallOrder o;
	o.material = S(d["material"]);
	o.points = vnums(d["points"]);
	if (d.has("towers")) o.towers = vnums(d["towers"]), o.has_towers = true;
	if (d.has("gates")) o.gates = vnums(d["gates"]), o.has_gates = true;
	if (d.has("inside")) o.inside = vnums(d["inside"]);
	return o;
}
BridgeOrder bridge_order_of(const godot::Dictionary &d) {
	BridgeOrder o;
	o.material = S(d["material"]);
	o.points = vnums(d["points"]);
	if (d.has("width")) o.width = double(d["width"]);
	return o;
}

// What the works read of a region (Region.meta and Region.cells; n: its tile count).
void works_region_of(const godot::Dictionary &meta, const godot::PackedByteArray &cells, int n, WorksRegion &out) {
	using namespace godot;
	WorksRegion *r = &out;
	r->id = S(meta["id"]);
	r->has_depth = meta.has("depth") && !sim::nil(meta["depth"]);
	if (r->has_depth) r->depth = meta["depth"];
	const auto rects = [](const Variant &v, std::vector<sim::WorksRect> &out) {
		if (sim::nil(v)) return;
		const Array a = v;
		for (int64_t i = 0; i < a.size(); i++) {
			const Dictionary d = a[i];
			out.push_back(sim::WorksRect{ I(d["x"]), I(d["y"]), I(d["w"]), I(d["h"]) });
		}
	};
	rects(meta.get("noBuild", Variant()), r->noBuild);
	rects(meta.get("safe", Variant()), r->safe);
	rects(meta.get("yard", Variant()), r->yard);
	r->water.resize(n);
	r->terrain.resize(n);
	for (int i = 0; i < n; i++) {
		const uint16_t c = uint16_t(cells[i * 2] | (cells[i * 2 + 1] << 8));
		r->terrain[i] = uint8_t((c >> 4) & 7);
		r->water[i] = uint8_t(c >> 7);
	}
	const Array objs = meta.get("objects", Array());
	for (int64_t i = 0; i < objs.size(); i++) {
		const Dictionary o = objs[i];
		r->objects.push_back(sim::WorksObject{ S(o["id"]), o["x"], o["y"] });
	}
	const Array pre = meta.get("prebuilt", Array());
	for (int64_t i = 0; i < pre.size(); i++) {
		const Dictionary e = pre[i];
		sim::PrebuiltEntry q;
		q.type = S(e["type"]);
		q.x = e["x"];
		q.y = e["y"];
		q.rot = I(e.get("rot", 0));
		if (e.has("tiles")) q.tiles = sim::vints(e["tiles"]);
		if (e.has("hp") && !sim::nil(e["hp"])) q.hp = double(e["hp"]);
		q.state = S(e.get("state", ""));
		if (e.has("claim") && !sim::nil(e["claim"])) q.claim = I(e["claim"]);
		q.landmark = bool(e.get("landmark", false));
		q.art = S(e.get("art", ""));
		q.maxHp = double(e.get("maxHp", 0.0));
		r->prebuilt.push_back(q);
	}
	const Array cps = meta.get("claimPoints", Array());
	for (int64_t i = 0; i < cps.size(); i++) {
		const Dictionary c = cps[i];
		sim::WorksClaimPoint k{ c["x"], c["y"], std::nullopt };
		if (c.has("r") && !sim::nil(c["r"])) k.r = double(c["r"]);
		r->claimPoints.push_back(k);
	}
}

} // namespace sim

namespace godot {

using sim::G;
using sim::I;
using sim::S;

WorksProbe::WorksProbe() = default;
WorksProbe::~WorksProbe() = default;

Ref<WorksProbe> WorksProbe::create(const Ref<Grid> &grid, const Dictionary &meta, const PackedByteArray &cells, const Dictionary &scenario) {
	Ref<WorksProbe> p;
	p.instantiate();
	p->grid = grid;
	sim::Grid &g = grid->g;
	auto *r = new sim::WorksRegion();
	p->region.reset(r);
	sim::works_region_of(meta, cells, g.w * g.h, *r);

	p->world = std::make_unique<sim::ProbeWorld>();
	sim::ProbeWorld &w = *p->world;
	const Array sq = scenario["squads"];
	for (int64_t i = 0; i < sq.size(); i++) {
		const Dictionary d = sq[i];
		sim::ProbeSquad s;
		s.team = I(d["team"]);
		s.owner = S(d["owner"]);
		const Array home = d["home"];
		s.hx = home[0];
		s.hy = home[1];
		if (d.has("cart")) {
			const Array c = d["cart"];
			s.hasCart = true;
			s.cx = c[0];
			s.cy = c[1];
			s.cap = c[2];
		}
		w.squads.push_back(s);
	}
	const Array ws = scenario["workers"];
	for (int64_t i = 0; i < ws.size(); i++) {
		const Dictionary d = ws[i];
		sim::Worker u;
		u.id = 10 + int(i);
		const Array at = d["at"];
		u.x = at[0];
		u.y = at[1];
		u.squad = &w.squads[I(d["squad"])];
		if (!sim::nil(d["wrate"])) u.wrate = double(d["wrate"]);
		if (!sim::nil(d["brate"])) u.brate = double(d["brate"]);
		u.herbs = d["herbs"];
		u.flax = d["flax"];
		if (!sim::nil(d["gmul"])) u.gmul = sim::costOf(d["gmul"]);
		w.workers.push_back(u);
	}
	const Array men = scenario["men"];
	for (int64_t i = 0; i < men.size(); i++) {
		const Array m = men[i];
		w.men.push_back({ double(m[0]), double(m[1]), double(m[2]) });
	}
	if (scenario.has("immune")) {
		const Array im = scenario["immune"];
		for (int64_t i = 0; i < im.size(); i++) w.immune.insert(I(im[i]));
	}

	p->host = std::make_unique<sim::ReplayWorksHost>();
	p->host->grid = &g;
	p->host->world = &w;
	p->works = std::make_unique<sim::Works>(g, *p->region, *p->host);
	p->works->set_ties([](const std::string &owner, const std::string &other) { return owner == "b" && other == "c"; });
	return p;
}

void WorksProbe::begin(const Array &expect) {
	host->expect = expect;
	host->events = Array();
}

Variant WorksProbe::call_api(const Array &c) {
	using namespace sim;
	Works &W = *works;
	ProbeWorld &world = *this->world;
	const std::string name = S(c[0]);
	const auto n = [&](int i) { return double(c[i + 1]); };
	const auto k = [&](int i) { return I(c[i + 1]); };
	const auto a = [&](int i) -> Variant { return c[i + 1]; };
	const auto placeSer = [](const PlaceResult &r) { return Array::make(r.ok, r.reason.empty() ? Variant() : Variant(G(r.reason)), ints(r.tiles)); };
	if (name == "label") return Variant();
	if (name == "prebuild") return W.prebuild(k(0)), Variant();
	if (name == "claim") return W.claim(k(0), n(1), n(2), n(3), bool(a(4))), Variant();
	if (name == "addStock") {
		std::optional<std::pair<double, double>> at;
		if (!nil(a(3))) at = std::make_pair(double(Array(a(3))[0]), double(Array(a(3))[1]));
		W.add_stock(k(0), S(a(1)), n(2), at);
		return Variant();
	}
	if (name == "place") return W.place(k(0), S(a(1)), n(2), n(3), k(4), S(a(5)));
	if (name == "placeWall") return ints(W.place_wall(k(0), wall_order_of(a(1))));
	if (name == "placeBridge") return ints(W.place_bridge(k(0), bridge_order_of(a(1))));
	if (name == "checkPlacement") return placeSer(W.check_placement(k(0), S(a(1)), n(2), n(3), k(4)));
	if (name == "checkWall") {
		const WallPlan r = W.check_wall(k(0), wall_order_of(a(1)));
		Array ps;
		for (const WallPiece &q : r.pieces) ps.push_back(Array::make(G(q.type), ints(q.tiles), q.ok, q.reason.empty() ? Variant() : Variant(G(q.reason))));
		return Array::make(r.ok, r.reason.empty() ? Variant() : Variant(G(r.reason)), ps);
	}
	if (name == "checkBridge") {
		const BridgePlan r = W.check_bridge(k(0), bridge_order_of(a(1)));
		Array ps;
		for (const BridgePiece &q : r.pieces) ps.push_back(Array::make(G(q.type), G(q.part), ints(q.tiles), nums(q.rows), q.ok));
		Array out = Array::make(r.ok, r.reason.empty() ? Variant() : Variant(G(r.reason)), G(r.axis), Array::make(r.dir[0], r.dir[1]), r.width, r.span);
		out.push_back(r.maxSpan);
		out.push_back(ps);
		return out;
	}
	if (name == "finishSite") return W.finish_site(k(0));
	if (name == "finishBridges") return W.finish_bridges(k(0)), Variant();
	if (name == "setJob") return W.set_job(world.workers[k(0)], nil(a(1)) ? "" : S(a(1))), Variant();
	if (name == "release") return W.release(world.workers[k(0)]), Variant();
	if (name == "sites") return world.squads[k(0)].sites = vints(a(1)), Variant();
	if (name == "node") return world.squads[k(0)].node = k(1), Variant();
	if (name == "kill") return world.workers[k(0)].alive = false, Variant();
	if (name == "cancel") return W.cancel(k(0));
	if (name == "demolish") return W.demolish(k(0), k(1));
	if (name == "upgrade") return W.upgrade(k(0), k(1));
	if (name == "mend") return W.mend(k(0), k(1));
	if (name == "rebuild") return W.rebuild(k(0), k(1), k(2));
	if (name == "damage") return W.damage(k(0), n(1), k(2)), Variant();
	if (name == "kindle") return W.kindle(k(0), n(1));
	if (name == "fireHit") return W.fire_hit(k(0), n(1)), Variant();
	if (name == "douse") return W.douse(k(0), n(1));
	if (name == "fortify") return W.fortify(k(0), k(1), S(a(2)));
	if (name == "raiseLadder") return W.raise_ladder(k(0), k(1), k(2), k(3), S(a(4)));
	if (name == "ladderFoot") return W.ladder_foot(k(0), k(1), k(2));
	if (name == "push") return W.push(k(0), n(1));
	if (name == "setTeams") return W.set_teams(vints(a(0)), k(1)), Variant();
	if (name == "setAccess") {
		const std::optional<std::string> acc = nil(a(2)) ? std::nullopt : std::optional<std::string>(S(a(2)));
		const std::optional<double> share = nil(a(3)) ? std::nullopt : std::optional<double>(n(3));
		const std::optional<double> fee = nil(a(4)) ? std::nullopt : std::optional<double>(n(4));
		return W.set_access(k(0), S(a(1)), acc, share, fee);
	}
	if (name == "liege") return W.lieges[S(a(0))] = Works::Liege{ S(a(1)), n(2) }, Variant();
	if (name == "payTill") return W.pay_till(k(0), S(a(1)), n(2), S(a(3))), Variant();
	if (name == "tillOf") return holdSer(&W.till_of(k(0)));
	if (name == "ownedHolds") {
		Array out;
		for (Hold *h : W.owned_holds(S(a(0)))) out.push_back(holdSer(h));
		return out;
	}
	if (name == "staffScan") {
		std::vector<StaffMan> men;
		for (const Worker &u : world.workers) men.push_back(StaffMan{ u.alive, u.x, u.y, u.squad->team });
		for (const auto &m : world.men) men.push_back(StaffMan{ true, m[0], m[1], int(m[2]) });
		W.staff_scan(men, k(0));
		return Variant();
	}
	if (name == "breakLock") {
		const auto r = W.break_lock(k(0), n(1), n(2));
		return Array::make(r.first, r.second);
	}
	if (name == "storeNet") return W.store_net(k(0));
	if (name == "holdOf") return holdSer(W.hold_of(k(0)));
	if (name == "storeNear") return holdSer(W.store_near(k(0), n(1), n(2), n(3)));
	if (name == "netAt") return W.net_at(k(0), n(1), n(2));
	if (name == "haveAt") return costDict(W.have_at(k(0), n(1), n(2)));
	if (name == "takeAt") return W.take_at(k(0), n(1), n(2), costOf(a(3)));
	if (name == "addAt") return W.add_at(k(0), n(1), n(2), S(a(3)), n(4)), Variant();
	if (name == "sourcesAt") {
		Array out;
		for (Hold *h : W.sources_at(k(0), n(1), n(2))) out.push_back(holdSer(h));
		return out;
	}
	if (name == "mayUse") return W.may_use(*W.piece(k(0)), S(a(1)), k(2));
	if (name == "nodeOk") return W.node_ok(k(0), k(1), S(a(2)));
	if (name == "lockNodes") return W.lock_nodes(vints(a(0)), bool(a(1))), Variant();
	if (name == "siteOk") return W.site_ok(k(0), k(1));
	if (name == "perkSite") return W.perk_site(k(0), n(1), n(2)), Variant();
	if (name == "dist2") return W.dist2(k(0), n(1), n(2));
	if (name == "nearestTile") {
		const auto p = W.nearest_tile(k(0), n(1), n(2));
		return Array::make(p.first, p.second);
	}
	if (name == "workSpots") {
		Array out;
		for (const Spot &s : W.work_spots(k(0))) out.push_back(Array::make(s[0], s[1], s[2], s[3]));
		return out;
	}
	if (name == "ringPoints") return nums(W.ring_points(k(0), k(1), n(2), n(3)));
	if (name == "fieldAt") {
		const Building *b = W.field_at(k(0));
		return b ? Variant(b->id) : Variant();
	}
	if (name == "onBuilding") return W.on_building(k(0));
	if (name == "bridgeAt") {
		const BridgeLine *b = W.bridge_at(k(0));
		return b ? Variant(lineSer(*b)) : Variant();
	}
	if (name == "deckPoints") return nums(W.deck_points(k(0), k(1)));
	if (name == "litNear") return W.lit_near(k(0), n(1), n(2), n(3), nil(a(4)) ? std::nullopt : std::optional<double>(n(4)));
	if (name == "pitch") return W.pitch(k(0), n(1), n(2));
	if (name == "platCap") return W.plat_cap(k(0));
	if (name == "near") return ints(W.near(n(0), n(1), n(2)));
	if (name == "setFallback") return W.set_fallback(k(0)), Variant();
	if (name == "fallback") return W.fallback();
	if (name == "resetLandmark") return W.reset_landmark(), Variant();
	if (name == "landmarkCapture") return W.landmark_capture(n(0)), Variant();
	if (name == "landmarkRestore") return W.landmark_restore(k(0), costOf(a(1)), n(2), n(3));
	if (name == "preRows") {
		Array out;
		for (const PreRow &r : W.pre_rows()) out.push_back(Array::make(r.i, r.hp, r.ruin, r.gone, r.team));
		return out;
	}
	if (name == "loadPreRows") {
		std::vector<Works::PreRowIn> rows;
		const Array rs = a(0);
		for (int64_t i = 0; i < rs.size(); i++) {
			const Array r = rs[i];
			rows.push_back(Works::PreRowIn{ I(r[0]), double(r[1]), bool(r[2]), bool(r[3]) });
		}
		W.load_pre_rows(rows);
		return Variant();
	}
	if (name == "vanish") return W.vanish(k(0)), Variant();
	if (name == "foul") return W.foul(k(0), n(1), nil(a(2)) ? std::nullopt : std::optional<double>(n(2))), Variant();
	if (name == "addItem") {
		Item it;
		it.uid = S(a(1));
		it.def = "dory";
		it.rarity = "common";
		it.cond = 100;
		W.hold_of(k(0))->items.push_back(it);
		return Variant();
	}
	if (name == "influence") return W.influence().version;
	ERR_FAIL_V_MSG(Variant(), String("WorksProbe: no call ") + G(name));
}

void WorksProbe::tick_works() { works->tick(); }

Array WorksProbe::work_all() {
	Array acts;
	constexpr double SPEED = 0.35;
	for (sim::Worker &u : world->workers) {
		if (!u.alive) {
			acts.push_back(Variant());
			continue;
		}
		const sim::Act act = works->work(u);
		acts.push_back(sim::actSer(act));
		if (act.kind == sim::Act::HERE) continue;
		const sim::ProbeSquad &s = *static_cast<sim::ProbeSquad *>(u.squad);
		const double tx = act.kind == sim::Act::POINT ? act.x : s.hx, ty = act.kind == sim::Act::POINT ? act.y : s.hy;
		const double dx = tx - u.x, dy = ty - u.y, d = js::hypot(dx, dy);
		if (d <= SPEED) u.x = tx, u.y = ty;
		else u.x += (dx / d) * SPEED, u.y += (dy / d) * SPEED;
	}
	return acts;
}

void WorksProbe::end_tick() { host->dirty(); }

Array WorksProbe::take_events() {
	Array e = host->events;
	host->events = Array();
	return e;
}

Array WorksProbe::workers_state() const {
	Array out;
	for (const sim::Worker &u : world->workers) {
		Array r = Array::make(u.id, u.job.empty() ? Variant() : Variant(G(u.job)), u.carry.empty() ? Variant() : Variant(G(u.carry)), u.load, u.wnode, u.wsite);
		for (const Variant &v : { Variant(u.wslot), Variant(u.wfor), Variant(u.working), Variant(u.wgx), Variant(u.wgy), Variant(u.wpi), Variant(u.wreq), Variant(u.facing), Variant(u.x), Variant(u.y),
					 Variant(int64_t(u.wpath.size())), Variant(u.alive) })
			r.push_back(v);
		out.push_back(r);
	}
	return out;
}

Dictionary WorksProbe::snap() {
	Dictionary d;
	Array b;
	for (const sim::BuildingSnap &s : works->building_snaps()) b.push_back(sim::snapDict(s));
	d["b"] = b;
	Array n;
	for (const sim::NodeSnap &s : works->resource_nodes()) {
		Dictionary e;
		e["id"] = s.id;
		e["res"] = G(s.res);
		e["x"] = s.x;
		e["y"] = s.y;
		e["amount"] = s.amount;
		e["max"] = s.max;
		if (s.obj) e["obj"] = *s.obj;
		if (s.building) e["building"] = *s.building;
		if (s.guarded) e["guarded"] = true;
		if (s.rare) e["rare"] = true;
		n.push_back(e);
	}
	d["n"] = n;
	Dictionary st;
	for (const auto &e : works->stock_snap()) st[String::num_int64(e.first)] = sim::costDict(e.second);
	d["st"] = st;
	Array cart;
	for (const sim::ProbeSquad &s : world->squads) cart.push_back(s.hasCart ? sim::holdSer(&s.cart) : Variant());
	d["cart"] = cart;
	d["inf_version"] = works->influence().version;
	const std::vector<uint8_t> &m = works->influence().mask;
	PackedByteArray mask;
	mask.resize(int64_t(m.size()));
	memcpy(mask.ptrw(), m.data(), m.size());
	d["mask"] = mask;
	return d;
}

void WorksProbe::_bind_methods() {
	ClassDB::bind_static_method("WorksProbe", D_METHOD("create", "grid", "meta", "cells", "scenario"), &WorksProbe::create);
	ClassDB::bind_method(D_METHOD("begin", "expect"), &WorksProbe::begin);
	ClassDB::bind_method(D_METHOD("call_api", "call"), &WorksProbe::call_api);
	ClassDB::bind_method(D_METHOD("tick_works"), &WorksProbe::tick_works);
	ClassDB::bind_method(D_METHOD("work_all"), &WorksProbe::work_all);
	ClassDB::bind_method(D_METHOD("end_tick"), &WorksProbe::end_tick);
	ClassDB::bind_method(D_METHOD("take_events"), &WorksProbe::take_events);
	ClassDB::bind_method(D_METHOD("workers_state"), &WorksProbe::workers_state);
	ClassDB::bind_method(D_METHOD("snap"), &WorksProbe::snap);
}

} // namespace godot
