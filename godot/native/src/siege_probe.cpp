#include "siege_probe.h"

#include <cmath>
#include <deque>
#include <set>

#include <godot_cpp/core/class_db.hpp>

#include "holders.h"
#include "js_math.h"
#include "rng.h"
#include "siege.h"
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

// The fake world of src/dev/vectors/siege.ts: squads of men, a goal each, a struck flag; nodes per team.
struct SiegeMan {
	double x = 0, y = 0;
	bool alive = true;
};
struct SiegeSquadW {
	int team = 0;
	std::string owner;
	std::vector<std::string> nodes;
	std::vector<SiegeMan> men;
	std::optional<std::array<double, 2>> goal;
	bool hit = false;
};
struct SiegeWorld {
	std::vector<SiegeSquadW> squads;
	std::vector<std::set<std::string>> teamNodes; // has() only
	godot::Array events, expect;

	void ev(const godot::Array &e) { events.push_back(e); }
	// The TS answer to the call about to be logged (its event at this index), or nil.
	godot::Variant answer(const char *name, int at) const {
		const int64_t i = events.size();
		if (i >= expect.size()) return godot::Variant();
		const godot::Array e = expect[i];
		if (e.size() <= at || S(e[0]) != name) return godot::Variant();
		return e[at];
	}
};

static void dirtyOf(Grid &g, SiegeWorld &w) {
	if (g.dirty.empty()) return;
	w.ev(godot::Array::make("dirty", ints(g.dirty)));
	g.dirty.clear();
}

struct SiegeProbeWorksHost : WorksHost {
	Grid *grid = nullptr;
	SiegeWorld *world = nullptr;
	std::vector<double> path(int team, double x0, double y0, double x1, double y1) override {
		dirtyOf(*grid, *world);
		grid->team = team;
		const godot::Variant a = world->answer("wpath", 6);
		const std::vector<double> pts = a.get_type() == godot::Variant::ARRAY ? vnums(a) : std::vector<double>{};
		godot::Array e = godot::Array::make("wpath", team, x0, y0, x1, y1);
		e.push_back(nums(pts));
		world->ev(e);
		return pts;
	}
	void evict(const std::vector<int> &tiles) override { world->ev(godot::Array::make("evict", ints(tiles))); }
	bool chance(double p) override {
		const godot::Variant a = world->answer("chance", 2);
		const bool r = a.get_type() == godot::Variant::BOOL && bool(a);
		world->ev(godot::Array::make("chance", p, r));
		return r;
	}
	void fall(const std::vector<int> &tiles) override { world->ev(godot::Array::make("fall", ints(tiles))); }
};

struct SiegeProbeHost : SiegeHost {
	Grid *grid = nullptr;
	SiegeWorld *world = nullptr;
	const WorksRegion *region = nullptr;
	Works *works = nullptr;

	static double near2(const SiegeMan &m, double x, double y) { return js::pow(m.x - x, 2) + js::pow(m.y - y, 2); }
	std::vector<double> replayPath(const char *name, int team, double x0, double y0, double x1, double y1) {
		dirtyOf(*grid, *world);
		grid->team = team;
		const godot::Variant a = world->answer(name, 6);
		const std::vector<double> pts = a.get_type() == godot::Variant::ARRAY ? vnums(a) : std::vector<double>{};
		godot::Array e = godot::Array::make(name, team, x0, y0, x1, y1);
		e.push_back(nums(pts));
		world->ev(e);
		return pts;
	}
	std::vector<double> path(int team, double x0, double y0, double x1, double y1) override { return replayPath("path", team, x0, y0, x1, y1); }
	std::optional<std::vector<double>> cartPath(int team, double x0, double y0, double x1, double y1) override { return replayPath("cpath", team, x0, y0, x1, y1); }
	int crewNear(int crew, double x, double y, double r) override {
		int n = 0;
		if (crew < 0 || crew >= int(world->squads.size())) return 0;
		for (const SiegeMan &m : world->squads[crew].men)
			if (m.alive && near2(m, x, y) <= r * r) n++;
		return n;
	}
	void splash(double x, double y, double r, double dmg, double ap) override { world->ev(godot::Array::make("splash", x, y, r, dmg, ap)); }
	bool open(double x, double y) override {
		const int t = grid->tile_at(x, y);
		return t >= 0 && double(grid->cost[t]) > 0 && grid->deck[t] == 0;
	}
	bool walkable(double x0, double y0, double x1, double y1) override { return grid->line_cost(x0, y0, x1, y1, 0) < INFINITY; }
	double cost(double x, double y) override {
		const int t = grid->tile_at(x, y);
		return t >= 0 && double(grid->cost[t]) > 0 ? double(grid->cost[t]) : 1;
	}
	bool hasNode(int team, const std::string &node) override { return team >= 0 && team < int(world->teamNodes.size()) && world->teamNodes[team].count(node) > 0; }
	std::optional<std::array<double, 2>> foe(int team, double x, double y, double r) override {
		const SiegeMan *best = nullptr;
		double bd = r * r;
		for (const SiegeSquadW &s : world->squads) {
			if (s.team == team) continue;
			for (const SiegeMan &m : s.men) {
				if (!m.alive) continue;
				const double d = near2(m, x, y);
				if (d < bd) bd = d, best = &m;
			}
		}
		if (!best) return std::nullopt;
		return std::array<double, 2>{ best->x, best->y };
	}
	void pierce(int team, double x0, double y0, double x1, double y1, double w, double dmg, double ap, double n) override {
		godot::Array e = godot::Array::make("pierce", team, x0, y0, x1, y1, w, dmg);
		e.push_back(ap);
		e.push_back(n);
		world->ev(e);
	}
	bool stoneTower(int team, double x, double y) override {
		const Building *b = works->piece(works->on_building(grid->tile_at(x, y)));
		return !!b && b->type == "stoneTower" && b->team == team;
	}
	std::optional<double> cartCost(double x, double y, double dx, double dy) override {
		const int t = grid->tile_at(x + dx * 0.5, y + dy * 0.5);
		return t >= 0 && double(grid->cost[t]) > 0 && region->water[t] == 0 ? double(grid->cost[t]) : 0;
	}
	bool foeNear(int team, double x, double y, double r) override {
		for (const SiegeSquadW &s : world->squads)
			if (s.team != team)
				for (const SiegeMan &m : s.men)
					if (m.alive && near2(m, x, y) <= r * r) return true;
		return false;
	}
	bool crewHit(int crew) override { return crew >= 0 && crew < int(world->squads.size()) && world->squads[crew].hit; }
	std::optional<std::pair<int, std::string>> taker(const SiegeEngine &e) override {
		const auto &CART = data().trade.CART;
		for (const SiegeSquadW &s : world->squads)
			if (s.team == e.team)
				for (const SiegeMan &m : s.men)
					if (m.alive && near2(m, e.x, e.y) <= CART.guard * CART.guard) return std::nullopt;
		for (const SiegeSquadW &s : world->squads)
			if (s.team != e.team)
				for (const SiegeMan &m : s.men)
					if (m.alive && near2(m, e.x, e.y) <= CART.beside * CART.beside) return std::make_pair(s.team, s.owner);
		return std::nullopt;
	}
	void captured(const SiegeEngine &e, const std::string &by) override { world->ev(godot::Array::make("captured", e.id, G(by))); }
	void wreck(const SiegeEngine &e, bool burnt) override { world->ev(godot::Array::make("wreck", e.id, burnt, holdSer(e.hold ? &*e.hold : nullptr))); }
	bool crewNode(int crew, const std::string &node) override {
		if (crew < 0 || crew >= int(world->squads.size())) return false;
		for (const std::string &n : world->squads[crew].nodes)
			if (n == node) return true;
		return false;
	}
	SiegeCartFx cartFx(const std::string &owner) override { return owner == "p" ? SiegeCartFx{ 2, 0.15, 0.25 } : SiegeCartFx{}; }
};

static WallOrder wallOrderOf(const godot::Dictionary &d) {
	WallOrder o;
	o.material = S(d["material"]);
	o.points = vnums(d["points"]);
	if (d.has("towers")) o.towers = vnums(d["towers"]), o.has_towers = true;
	if (d.has("gates")) o.gates = vnums(d["gates"]), o.has_gates = true;
	if (d.has("inside")) o.inside = vnums(d["inside"]);
	return o;
}

godot::Dictionary siegeSnapDict(const SiegeSnap &s) {
	godot::Dictionary d;
	d["id"] = s.id;
	d["type"] = G(s.type);
	d["team"] = s.team;
	d["x"] = s.x;
	d["y"] = s.y;
	d["facing"] = s.facing;
	d["hp"] = s.hp;
	d["maxHp"] = s.maxHp;
	d["state"] = G(s.state);
	d["progress"] = s.progress;
	d["crew"] = s.crew;
	d["crewNeed"] = s.crewNeed;
	d["crewHere"] = s.crewHere;
	if (s.reload) d["reload"] = *s.reload;
	if (s.swing) d["swing"] = *s.swing;
	if (s.target) d["target"] = *s.target;
	if (s.burning) d["burning"] = *s.burning;
	if (s.ladder) d["ladder"] = *s.ladder;
	if (s.stopped) d["stopped"] = G(*s.stopped);
	if (s.cart) {
		d["owner"] = G(s.owner);
		d["cargo"] = costDict(s.cargo);
		d["items"] = s.items;
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
		d["loads"] = s.loads;
		d["cap"] = s.cap;
		if (s.halted) d["halted"] = true;
		if (s.capture) d["capture"] = *s.capture;
	}
	return d;
}

} // namespace sim

namespace godot {

using sim::G;
using sim::I;
using sim::S;

SiegeProbe::SiegeProbe() = default;
SiegeProbe::~SiegeProbe() = default;

Ref<SiegeProbe> SiegeProbe::create(const Ref<Grid> &grid, const Dictionary &meta, const PackedByteArray &cells, const Dictionary &scenario) {
	Ref<SiegeProbe> p;
	p.instantiate();
	p->grid = grid;
	sim::Grid &g = grid->g;
	// the RegionData the works read (as WorksProbe::create)
	auto *r = new sim::WorksRegion();
	p->region.reset(r);
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
	const int n = g.w * g.h;
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
	const Array cps = meta.get("claimPoints", Array());
	for (int64_t i = 0; i < cps.size(); i++) {
		const Dictionary c = cps[i];
		sim::WorksClaimPoint k{ c["x"], c["y"], std::nullopt };
		if (c.has("r") && !sim::nil(c["r"])) k.r = double(c["r"]);
		r->claimPoints.push_back(k);
	}
	// no prebuilt pieces: the vectors never call prebuild

	p->world = std::make_unique<sim::SiegeWorld>();
	sim::SiegeWorld &w = *p->world;
	const Array tn = scenario["teamNodes"];
	for (int64_t i = 0; i < tn.size(); i++) {
		std::set<std::string> s;
		const Array a = tn[i];
		for (int64_t j = 0; j < a.size(); j++) s.insert(S(a[j]));
		w.teamNodes.push_back(s);
	}
	const Array sq = scenario["squads"];
	for (int64_t i = 0; i < sq.size(); i++) {
		const Dictionary d = sq[i];
		sim::SiegeSquadW s;
		s.team = I(d["team"]);
		s.owner = S(d["owner"]);
		const Array nodes = d["nodes"];
		for (int64_t j = 0; j < nodes.size(); j++) s.nodes.push_back(S(nodes[j]));
		const Array men = d["men"];
		for (int64_t j = 0; j < men.size(); j++) {
			const Array m = men[j];
			s.men.push_back(sim::SiegeMan{ double(m[0]), double(m[1]), true });
		}
		w.squads.push_back(s);
	}

	p->whost = std::make_unique<sim::SiegeProbeWorksHost>();
	p->whost->grid = &g;
	p->whost->world = &w;
	p->works = std::make_unique<sim::Works>(g, *p->region, *p->whost);
	p->host = std::make_unique<sim::SiegeProbeHost>();
	p->host->grid = &g;
	p->host->world = &w;
	p->host->region = p->region.get();
	p->host->works = p->works.get();
	p->rng = std::make_unique<sim::Mulberry>(sim::hash_string(G(r->id)) + 5);
	p->siege = std::make_unique<sim::Siege>(*p->works, *p->rng, *p->host);
	return p;
}

void SiegeProbe::begin(const Array &expect) {
	world->expect = expect;
	world->events = Array();
}

Variant SiegeProbe::call_api(const Array &c) {
	using namespace sim;
	Works &W = *works;
	Siege &X = *siege;
	SiegeWorld &w = *world;
	const std::string name = S(c[0]);
	const auto n = [&](int i) { return double(c[i + 1]); };
	const auto k = [&](int i) { return I(c[i + 1]); };
	const auto a = [&](int i) -> Variant { return c[i + 1]; };
	if (name == "label") return Variant();
	// works and world set-up
	if (name == "claim") return W.claim(k(0), n(1), n(2), n(3), false), Variant();
	if (name == "addStock") return W.add_stock(k(0), S(a(1)), n(2)), Variant();
	if (name == "place") return W.place(k(0), S(a(1)), n(2), n(3), 0, "");
	if (name == "placeWall") return ints(W.place_wall(k(0), wallOrderOf(a(1))));
	if (name == "finishSite") return W.finish_site(k(0));
	if (name == "wdamage") return W.damage(k(0), n(1), k(2)), Variant();
	if (name == "push") return W.push(k(0), n(1));
	if (name == "goal") {
		if (nil(a(1))) w.squads[k(0)].goal.reset();
		else w.squads[k(0)].goal = std::array<double, 2>{ double(Array(a(1))[0]), double(Array(a(1))[1]) };
		return Variant();
	}
	if (name == "hit") return w.squads[k(0)].hit = bool(a(1)), Variant();
	if (name == "killMan") return w.squads[k(0)].men[k(1)].alive = false, Variant();
	if (name == "cargo") {
		Hold &h = *const_cast<SiegeEngine *>(X.get(k(0)))->hold;
		put(h, S(a(1)), n(2), S(a(3)), nil(a(4)) ? std::nullopt : std::optional<double>(n(4)));
		return Variant();
	}
	if (name == "item") {
		Item it;
		it.uid = S(a(1));
		it.def = "dory";
		it.rarity = "common";
		it.cond = 100;
		if (!nil(a(2))) it.q = k(2);
		const_cast<SiegeEngine *>(X.get(k(0)))->hold->items.push_back(it);
		return Variant();
	}
	// the siege API
	if (name == "build") return X.build(k(0), S(a(1)), n(2), n(3));
	if (name == "cart") return X.cart(k(0), S(a(1)), S(a(2)), n(3), n(4));
	if (name == "carts") return X.carts(nil(a(0)) ? std::nullopt : std::optional<std::string>(S(a(0))), nil(a(1)) ? std::nullopt : std::optional<int>(k(1)));
	if (name == "isCart") return X.is_cart(k(0));
	if (name == "cartCap") return X.cart_cap(k(0));
	if (name == "labour") return X.labour(k(0), n(1));
	if (name == "stow") {
		auto r = X.stow(k(0));
		if (!r) return Variant();
		return Array::make(G(r->first), holdSer(&r->second));
	}
	if (name == "cartHolds") {
		Array out;
		for (Hold *h : X.cart_holds(S(a(0)))) out.push_back(holdSer(h));
		return out;
	}
	if (name == "setOwner") return X.set_owner(k(0), k(1), S(a(2))), Variant();
	if (name == "alive") return X.alive(k(0));
	if (name == "built") return X.built(k(0));
	if (name == "crew") return X.crew(k(0), k(1), k(2));
	if (name == "uncrew") return X.uncrew(k(0)), Variant();
	if (name == "move") return X.move(k(0), n(1), n(2)), Variant();
	if (name == "hold") return X.hold(k(0)), Variant();
	if (name == "attack") return X.attack(k(0), k(1));
	if (name == "deploy") return X.deploy(k(0), bool(a(1))), Variant();
	if (name == "raise") return X.raise(k(0), n(1), n(2));
	if (name == "busy") return X.busy(k(0));
	if (name == "kindle") return X.kindle(k(0), n(1));
	if (name == "fireK") return X.fire_k(k(0));
	if (name == "roof") return X.roof(k(0), n(1), n(2), n(3));
	if (name == "cover") return X.cover(k(0), n(1), n(2), n(3), n(4));
	if (name == "douse") return X.douse(k(0), n(1));
	if (name == "damage") return X.damage(k(0), n(1)), Variant();
	if (name == "crewPoints") return nums(X.crew_points(k(0), k(1)));
	ERR_FAIL_V_MSG(Variant(), String("SiegeProbe: no call ") + G(name));
}

void SiegeProbe::step(int tick) {
	using namespace sim;
	constexpr double SPEED = 0.15;
	// men walk straight: a crew to its engine's crew points (its first crewed engine), else to the squad's goal
	const std::vector<SiegeEngine> &es = siege->all();
	for (int i = 0; i < int(world->squads.size()); i++) {
		SiegeSquadW &s = world->squads[i];
		int eng = -1;
		for (int id = 0; id < int(es.size()); id++)
			if (es[id].crew == i && es[id].state != "destroyed") {
				eng = id;
				break;
			}
		std::vector<SiegeMan *> live;
		for (SiegeMan &m : s.men)
			if (m.alive) live.push_back(&m);
		std::optional<std::vector<double>> pts;
		if (eng >= 0) pts = siege->crew_points(eng, int(live.size()));
		for (int k = 0; k < int(live.size()); k++) {
			SiegeMan &m = *live[k];
			const double tx = pts ? (*pts)[k * 2] : s.goal ? (*s.goal)[0] + (k % 4) * 0.6 : m.x;
			const double ty = pts ? (*pts)[k * 2 + 1] : s.goal ? (*s.goal)[1] + std::floor(k / 4.0) * 0.6 : m.y;
			const double dx = tx - m.x, dy = ty - m.y, d = js::hypot(dx, dy);
			if (d <= SPEED) m.x = tx, m.y = ty;
			else m.x += (dx / d) * SPEED, m.y += (dy / d) * SPEED;
		}
	}
	works->tick();
	siege->tick(tick);
	dirtyOf(grid->g, *world);
}

Array SiegeProbe::take_events() {
	Array e = world->events;
	world->events = Array();
	return e;
}

Array SiegeProbe::engines_state() const {
	using namespace sim;
	Array out;
	for (const SiegeEngine &e : siege->all()) {
		Array r;
		const auto nz = [](const std::string &s) { return s.empty() ? Variant() : Variant(G(s)); };
		for (const Variant &v : { Variant(e.id), Variant(G(e.type)), Variant(e.team), Variant(e.x), Variant(e.y), Variant(e.facing), Variant(e.hp), Variant(e.maxHp), Variant(G(e.state)),
					 Variant(e.labour), Variant(e.crew), Variant(G(e.mode)), e.goal ? Variant(Array::make((*e.goal)[0], (*e.goal)[1])) : Variant(), Variant(int64_t(e.path.size())), Variant(e.pi),
					 Variant(e.target), e.wall ? Variant(Array::make((*e.wall)[0], (*e.wall)[1])) : Variant(), Variant(e.ladder), Variant(e.cd), Variant(e.swingAt), Variant(e.prog),
					 Variant(e.burn), Variant(e.kindle), Variant(e.tower), Variant(G(e.owner)), holdSer(e.hold ? &*e.hold : nullptr), Variant(e.halt), Variant(e.cap), Variant(e.capT),
					 Variant(G(e.capO)), nz(e.stop), Variant(e.lag), Variant(e.stowed) })
			r.push_back(v);
		out.push_back(r);
	}
	return out;
}

Array SiegeProbe::men_state() const {
	Array out;
	for (const sim::SiegeSquadW &s : world->squads) {
		Array ms;
		for (const sim::SiegeMan &m : s.men) ms.push_back(Array::make(m.x, m.y, m.alive));
		out.push_back(ms);
	}
	return out;
}

Dictionary SiegeProbe::snap(int tick) {
	Dictionary d;
	Array e;
	for (const sim::SiegeSnap &s : siege->snaps(tick)) e.push_back(sim::siegeSnapDict(s));
	d["e"] = e;
	Array sh;
	for (const sim::SiegeShot &s : siege->shots()) {
		Dictionary o;
		o["x0"] = s.x0;
		o["y0"] = s.y0;
		o["x1"] = s.x1;
		o["y1"] = s.y1;
		o["t0"] = s.t0;
		o["t1"] = s.t1;
		o["z0"] = s.z0;
		o["z1"] = s.z1;
		o["by"] = s.by;
		o["kind"] = G(s.kind);
		o["siege"] = s.siege;
		sh.push_back(o);
	}
	d["sh"] = sh;
	Array b;
	for (const sim::BuildingSnap &s : works->building_snaps())
		b.push_back(Array::make(s.id, G(s.type), s.team, G(s.state), s.hp, s.burning ? Variant(*s.burning) : Variant(), s.siege ? Variant(*s.siege) : Variant()));
	d["b"] = b;
	return d;
}

void SiegeProbe::_bind_methods() {
	ClassDB::bind_static_method("SiegeProbe", D_METHOD("create", "grid", "meta", "cells", "scenario"), &SiegeProbe::create);
	ClassDB::bind_method(D_METHOD("begin", "expect"), &SiegeProbe::begin);
	ClassDB::bind_method(D_METHOD("call_api", "call"), &SiegeProbe::call_api);
	ClassDB::bind_method(D_METHOD("step", "tick"), &SiegeProbe::step);
	ClassDB::bind_method(D_METHOD("take_events"), &SiegeProbe::take_events);
	ClassDB::bind_method(D_METHOD("engines_state"), &SiegeProbe::engines_state);
	ClassDB::bind_method(D_METHOD("men_state"), &SiegeProbe::men_state);
	ClassDB::bind_method(D_METHOD("snap", "tick"), &SiegeProbe::snap);
}

} // namespace godot
