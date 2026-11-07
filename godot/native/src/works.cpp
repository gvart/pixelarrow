#include "works.h"

#include <algorithm>
#include <cmath>
#include <limits>

#include <godot_cpp/variant/array.hpp>

#include "depth.h"
#include "js_math.h"
#include "sim_data.h"

namespace sim {

using godot::Dictionary;

void load_works(const Dictionary &t, WorksTables &o) {
	const Dictionary f = t["FIRE"], fo = t["FORT"];
	o.FIRE.start = f["start"];
	o.FIRE.grow = f["grow"];
	o.FIRE.life = f["life"];
	o.FIRE.spread = f["spread"];
	o.FIRE.spreadMin = f["spreadMin"];
	o.FIRE.kindle = f["kindle"];
	o.FIRE.douse = f["douse"];
	o.FIRE.push = f["push"];
	o.FIRE.rubble = f["rubble"];
	o.FORT.iron = fo["iron"];
	o.FORT.ironCost = cost_of(fo["ironCost"]);
	o.FORT.wet = fo["wet"];
	o.FORT.wetTicks = fo["wetTicks"];
	o.FORT.wetCost = fo["wetCost"];
}

static const EconomyTables &E() { return data().economy; }
static const auto &FIRE() { return data().works.FIRE; }
static const auto &FORT() { return data().works.FORT; }
static double sq2(double v) { return js::pow(v, 2); } // `v ** 2`
static constexpr double INF = std::numeric_limits<double>::infinity();
static constexpr double NaN = std::numeric_limits<double>::quiet_NaN();

static constexpr double DT = 0.1;
// Bridge line steps by octant of the drag angle (+x first, turning towards +y).
static constexpr int STEPS[8][2] = { { 1, 0 }, { 1, 1 }, { 0, 1 }, { -1, 1 }, { -1, 0 }, { -1, -1 }, { 0, -1 }, { 1, -1 } };
static constexpr double NEAR_NODE = 15; // an empty node's workers look this far for another of the same resource
static constexpr double AT = 1.6; // a worker this near a footprint tile centre (or a node) is there
static constexpr int WORK_PATHS = 6; // worker A* searches per tick
static constexpr int REGROW_TICKS = 10;
static constexpr double AT_SLOT = 0.3; // a worker this near its work slot is there
static constexpr double WAIT_OFF = 2.5; // workers with no free slot wait this far off the footprint edge
static constexpr double REPATH_NEAR = 6; // a site closing re-paths the workers headed this near its footprint
static constexpr double LADDER_COST = 4; // move cost multiplier on a ladder (a slow climb)
static constexpr double DOOR_COST = 2; // ... through a stone tower's door and inner stair
static constexpr double DETOUR = 3, DETOUR_PAD = 16; // a builder's way to its slot longer than DETOUR x straight + pad tiles: left to others
static constexpr int STAFF_CELL = 3; // the scan's grid: 8 tiles a cell
static constexpr int DIRS[4][2] = { { 1, 0 }, { 0, 1 }, { -1, 0 }, { 0, -1 } };
// src/war/region/compact.ts TERRAIN
static constexpr uint8_t T_FOREST = 1, T_MARSH = 3, T_ROCK = 4;
// M5h: a Herb Finder's share of the load as herbs (forest and marsh nodes); a Weaver's share of a farm load as flax.
static constexpr double SHARE_HERBS = 0.2, SHARE_FLAX = 0.25;

// grid.cost[t] = v (a Float32Array)
static inline void setCost(Grid &g, int t, double v) { g.cost[t] = float(v); }
// a Uint8Array store: ToUint8
static inline uint8_t u8(double v) { return std::isfinite(v) ? uint8_t(int64_t(std::trunc(v)) & 0xff) : 0; }
// arr[i] for a JS array: undefined (NaN in arithmetic) past its end
static inline double at_or_nan(const std::vector<double> &a, size_t i) { return i < a.size() ? a[i] : NaN; }
// `a[i] || 1`
static inline double or1(const std::vector<double> &a, size_t i) {
	const double v = i < a.size() ? a[i] : 0;
	return v != 0 && !std::isnan(v) ? v : 1;
}
// b.incoming[r]! -= n (a missing key: undefined - n = NaN)
static inline void subKey(Cost &c, const std::string &r, double n) {
	if (double *p = c.find(r)) *p -= n;
	else c.set(r, NaN);
}
static inline bool has(const std::vector<int> &v, int x) { return std::find(v.begin(), v.end(), x) != v.end(); }
static inline int indexOf(const std::vector<int> &v, int x) {
	const auto it = std::find(v.begin(), v.end(), x);
	return it == v.end() ? -1 : int(it - v.begin());
}
static inline int32_t toInt32(double v) {
	if (!std::isfinite(v)) return 0;
	const double m = std::fmod(std::trunc(v), 4294967296.0);
	return int32_t(uint32_t(int64_t(m < 0 ? m + 4294967296.0 : m)));
}
static inline double sign(double v) { return v > 0 ? 1 : v < 0 ? -1 : v; }

// M7a: what stands for `team` in the gate grid: its own (team + 1), or open to all (0) for the neutral team.
static int gateOf(int team) { return team == E().NEUTRAL_TEAM ? 0 : team + 1; }

static double fieldSlow(const std::string &f) { return f == "stakes" ? E().FIELD_STAKES.slow : E().FIELD_DITCH.slow; }
static const EconomyTables::Kit &wallKit(const std::string &m) { return m == "wood" ? E().WALL_KIT_WOOD : m == "timber" ? E().WALL_KIT_TIMBER : E().WALL_KIT_STONE; }

Works::Works(Grid &g, const WorksRegion &r, WorksHost &hst) : grid(g), region(r), host(hst), w(g.w), h(g.h), fallback_(E().NEUTRAL_TEAM) {
	nodeAt.assign(size_t(w) * h, -1);
	occ.assign(size_t(w) * h, -1);
	noBuild.assign(size_t(w) * h, 0);
	for (const WorksRect &q : region.noBuild)
		for (int y = q.y; y < q.y + q.h; y++)
			for (int x = q.x; x < q.x + q.w; x++) noBuild[size_t(y) * w + x] = 1;
	// M6d: no building in a safe zone (rented sites: M6f)
	for (const WorksRect &q : region.safe)
		for (int y = q.y; y < q.y + q.h; y++)
			for (int x = q.x; x < q.x + q.w; x++) noBuild[size_t(y) * w + x] = 1;
	infl.w = w;
	infl.h = h;
	infl.mask.assign(size_t(w) * h, 0);
	netStack.assign(size_t(w) * h, 0);
	staffHead.assign(size_t((w >> STAFF_CELL) + 1) * ((h >> STAFF_CELL) + 1), 0);
	staffNext.assign(64, 0);

	DepthRegion dr;
	dr.id = region.id;
	dr.has_depth = region.has_depth;
	dr.depth = region.depth;
	yieldK = depth_rule(dr).yield; // M7c: deeper regions' nodes hold more (rare goods keep their own rate)
	for (size_t i = 0; i < region.objects.size(); i++) {
		const WorksObject &o = region.objects[i];
		const auto it = E().RESOURCE_NODES.find(o.id);
		if (it == E().RESOURCE_NODES.end()) continue;
		const NodeDef &d = it->second;
		const double k = d.rare ? 1 : yieldK;
		Node n;
		n.id = int(nodes.size());
		n.res = d.res;
		n.x = o.x;
		n.y = o.y;
		n.amount = d.max * k;
		n.max = d.max * k;
		n.regrow = d.regrow * k;
		n.rate = d.rate;
		n.slots = d.slots;
		n.obj = int(i);
		n.rare = d.rare;
		const int t = grid.tile_at(o.x, o.y);
		if (t >= 0) {
			n.tiles = { t % w, t / w };
			nodeAt[t] = n.id;
		}
		nodes.push_back(n);
		if (nodes.back().regrow > 0) regrowing.push_back(&nodes.back());
	}
}

bool Works::isCut(const Worker &u, int id) const {
	const auto it = cutOff.find(u.id);
	return it != cutOff.end() && it->second.count(id);
}
void Works::cut(const Worker &u, int id) { cutOff[u.id].insert(id); }
void Works::unwait(Worker &u) {
	const auto it = waits.find(u.id);
	if (it != waits.end() && it->second[1] >= 0) waitAt.erase(int(std::floor(it->second[2])) * w + int(std::floor(it->second[1])));
	waits.erase(u.id);
}
void Works::activeAdd(Worker *u) {
	if (std::find(active.begin(), active.end(), u) == active.end()) active.push_back(u);
}
void Works::activeDelete(Worker *u) {
	const auto it = std::find(active.begin(), active.end(), u);
	if (it != active.end()) active.erase(it);
}

Hold &Works::reserve_of(int team) { return reserve[team]; }

// --- M6a store networks: a team's done stores joined by its influence (4-connected tiles of its bit) ---
const std::vector<int32_t> &Works::labels(int team) {
	auto it = nets.find(team);
	if (it != nets.end() && it->second.v == infl.version) return it->second.lab;
	Net &c = nets[team];
	c.lab.assign(size_t(w) * h, -1);
	std::vector<int32_t> &lab = c.lab;
	const int bit = 1 << team, size = w * h;
	const std::vector<uint8_t> &mask = infl.mask;
	int n = 0;
	// a net's number comes from its first tile in scan order, so the order of this flood cannot change the result
	const auto reach = [&](int o, int sp) {
		if ((mask[o] & bit) && lab[o] < 0) lab[o] = n, netStack[sp++] = o;
		return sp;
	};
	for (int s = 0; s < size; s++) {
		if (lab[s] >= 0 || !(mask[s] & bit)) continue;
		lab[s] = n;
		netStack[0] = s;
		for (int sp = 1; sp > 0;) {
			const int t = netStack[--sp], x = t % w;
			if (x > 0) sp = reach(t - 1, sp);
			if (x < w - 1) sp = reach(t + 1, sp);
			if (t >= w) sp = reach(t - w, sp);
			if (t < size - w) sp = reach(t + w, sp);
		}
		n++;
	}
	c.v = infl.version;
	return lab;
}

int Works::net_at(int team, double x, double y) {
	const int t = grid.tile_at(x, y);
	return t < 0 ? -1 : labels(team)[t];
}

bool Works::standing(const Building &b) const { return !b.cancelled && (b.state == "done" || b.state == "damaged" || (b.prev && b.state != "destroyed")); }

int Works::storeNet(const Building &b) {
	const std::vector<int32_t> &lab = labels(b.team);
	for (int t : b.ti)
		if (lab[t] >= 0) return lab[t];
	return -1;
}

bool Works::shared(const Building &b) const { return b.owner.empty() || b.access == "alliance" || b.access == "anyone"; }

const std::vector<Building *> &Works::netStores(int team, int net) {
	static const std::vector<Building *> none;
	if (net < 0) return none;
	const std::pair<int, int> k{ team, net };
	const auto it = netCache.find(k);
	if (it != netCache.end() && it->second.v == infl.version && it->second.s == storeVer) return it->second.list;
	std::vector<Building *> list;
	for (Building *b : storeList)
		if (b->team == team && standing(*b) && shared(*b) && storeNet(*b) == net) list.push_back(b);
	NetList &c = netCache[k];
	c = NetList{ infl.version, storeVer, std::move(list) };
	return c.list;
}

std::vector<Hold *> Works::sources(int team, double x, double y) {
	const std::vector<Building *> list = netStores(team, net_at(team, x, y));
	std::vector<Hold *> out;
	for (Building *b : list) out.push_back(&*b->hold);
	out.push_back(&reserve_of(team));
	return out;
}

bool Works::take_at(int team, double x, double y, const Cost &cost) { return take_from(sources(team, x, y), cost); }

Cost Works::have_at(int team, double x, double y) {
	Cost out;
	for (Hold *hd : sources(team, x, y)) totals(*hd, out);
	return out;
}

void Works::add_at(int team, double x, double y, const std::string &r, double n, const std::string &o) {
	Building *best = nullptr;
	double bd = INF;
	const std::vector<Building *> list = netStores(team, net_at(team, x, y));
	for (Building *b : list) {
		const double d = sq2(b->x - x) + sq2(b->y - y);
		if (d < bd) bd = d, best = b;
	}
	put(best ? *best->hold : reserve_of(team), r, n, o);
}

// --- W-88, W-89 who is there and who may use it ---
bool Works::may_use(const Building &b, const std::string &owner, int team) const {
	if (b.owner.empty()) return team == b.team;
	if (b.owner == owner) return true;
	if (b.access == "anyone") return true;
	if (b.access == "alliance") return team == b.team;
	return b.access == "household" && !owner.empty() && ties(b.owner, owner);
}

Hold &Works::till_of(Building &b) {
	if (!b.hold) b.hold = new_hold();
	return *b.hold;
}

void Works::pay_till(Building &b, const std::string &res, double n, const std::string &o) {
	Hold &hold = till_of(b);
	const auto l = lieges.find(b.owner);
	const std::optional<double> seal = tithe_seal(l != lieges.end() ? std::optional<std::string>(l->second.to) : std::nullopt);
	const double cut = l != lieges.end() && seal ? n * (l->second.pct / 100) : 0;
	if (cut > 0) put(hold, res, cut, o, seal);
	put(hold, res, n - cut, o);
}

bool Works::hasTerms(const Building &b) const { return needs_person(b.type, *b.def) || b.def->house; }

// --- influence ---
void Works::repaint() {
	std::fill(infl.mask.begin(), infl.mask.end(), 0);
	const auto paint = [&](int team, double cx, double cy, double r) {
		const int bit = 1 << team;
		for (double y = std::max(0.0, std::floor(cy - r)); y <= std::min(double(h - 1), std::ceil(cy + r)); y++)
			for (double x = std::max(0.0, std::floor(cx - r)); x <= std::min(double(w - 1), std::ceil(cx + r)); x++)
				if (sq2(x + 0.5 - cx) + sq2(y + 0.5 - cy) <= r * r) infl.mask[size_t(y) * w + size_t(x)] |= uint8_t(bit);
	};
	for (const Claim &c : claims) paint(c.team, c.x, c.y, c.r);
	for (const Building &b : buildings)
		if (b.def->influence > 0 && (b.state == "done" || b.state == "damaged")) paint(b.team, b.x, b.y, b.def->influence);
	infl.version++;
	owners();
}

// --- M7a pre-built ownership: a piece follows the holder of its claim point, else the influence over it, else `fallback` ---
int Works::zoneTeam(int z) const {
	if (z < 0 || z >= int(region.claimPoints.size())) return -1;
	const WorksClaimPoint &c = region.claimPoints[z];
	for (int i = int(claims.size()) - 1; i >= 0; i--)
		if (claims[i].x == c.x && claims[i].y == c.y) return claims[i].team;
	return -1;
}

int Works::ownerOf(const Building &b) const {
	// M7b: a safe court's pieces never change hands: the court cannot be fought over, its gates stand open to all
	for (const WorksRect &r : region.safe)
		for (int t : b.ti)
			if (t % w >= r.x && t / w >= r.y && t % w < r.x + r.w && t / w < r.y + r.h) return E().NEUTRAL_TEAM;
	if (b.pre->zone >= 0) {
		const int t = zoneTeam(b.pre->zone);
		return t >= 0 ? t : fallback_;
	}
	const int t = grid.tile_at(b.x, b.y);
	const int m = t >= 0 ? infl.mask[t] : 0;
	if (!m) return fallback_;
	if (m & (1 << b.team)) return b.team;
	int low = m & -m, k = 0; // the lowest team whose influence covers it
	while (low > 1) low >>= 1, k++;
	return k;
}

// Tiles of b the gate grid opens for its team only (a gate, a stone tower's door, a workplace's open floor).
std::vector<int> Works::gateTiles(const Building &b) const {
	if (b.state == "destroyed" || b.state == "foundation") return {};
	std::vector<int> out;
	if (b.def->wall == "gate" && !b.prev) out = b.ti;
	else if (b.def->workplace)
		for (int t : b.ti)
			if (double(grid.cost[t]) > 0) out.push_back(t);
	if (b.door >= 0) out.push_back(b.door);
	return out;
}

void Works::setTeam(Building &b, int team) {
	if (b.team == team) return;
	b.team = team;
	for (int t : gateTiles(b)) grid.gate[t] = u8(gateOf(team));
	grid.dirty.insert(grid.dirty.end(), b.tiles.begin(), b.tiles.end());
	b.mend = false;
	b.credit = 0;
	for (Worker *u : active)
		if (u->wsite == b.id) leave(*u);
	if (b.def->store) storeVer++;
	if (b.def->influence > 0 && (b.state == "done" || b.state == "damaged")) needPaint = true;
}

void Works::owners() {
	if (owning || prebuilt_.empty()) return;
	owning = true;
	for (Building *b : prebuilt_)
		if (!b->pre->gone) setTeam(*b, ownerOf(*b));
	owning = false;
	if (needPaint) {
		needPaint = false;
		repaint();
	}
}

// --- placement ---
std::string Works::checkTiles(int team, const std::vector<int> &tiles, bool flat, bool anyTeam, const std::vector<std::pair<int, double>> *lets) const {
	double lo = INF, hi = -INF;
	for (size_t i = 0; i + 1 < tiles.size(); i += 2) {
		const int x = tiles[i], y = tiles[i + 1];
		if (x < 0 || y < 0 || x >= w || y >= h) return "bounds";
		const int t = y * w + x;
		if (lets) {
			const auto it = std::find_if(lets->begin(), lets->end(), [&](const std::pair<int, double> &e) { return e.first == t; });
			if (it != lets->end()) {
				lo = std::min(lo, it->second);
				hi = std::max(hi, it->second);
				continue;
			}
		}
		if (noBuild[t]) return "noBuild";
		if (region.water[t] > 0) return "water";
		if (region.terrain[t] == T_ROCK) return "rock";
		if (occ[t] >= 0) return "overlap";
		if (double(grid.cost[t]) == 0) return "blocked";
		if (nodeAt[t] >= 0 && nodes[nodeAt[t]].amount > 0) return "node";
		if (!anyTeam && !(infl.mask[t] & (1 << team))) return "influence";
		lo = std::min(lo, double(grid.height[t]));
		hi = std::max(hi, double(grid.height[t]));
	}
	return flat && hi - lo > 1 ? "slope" : "";
}

PlaceResult Works::check_placement(int team, const std::string &type, double x, double y, int rot) {
	const auto fwh = rotated(type, rot);
	const std::vector<int> tiles = rect_tiles(x, y, fwh[0], fwh[1]);
	const BuildingDef &def = building(type);
	if (def.prebuilt) return { false, "blocked", tiles }; // M7a: only the region places these
	if (def.brazier) return checkBrazier(team, tiles);
	if (!def.access.empty()) {
		const AccessOf a = accessOf(team, type, tiles);
		const std::string reason = !a.reason.empty() ? a.reason : checkTiles(team, a.tiles, true, def.access == "ladder");
		return !reason.empty() ? PlaceResult{ false, reason, a.tiles } : PlaceResult{ true, "", a.tiles };
	}
	std::string reason;
	if (def.wall == "segment") reason = "short";
	else if (!def.wall.empty()) {
		const auto lets = wallUnder(team, tiles);
		reason = checkTiles(team, tiles, true, false, &lets);
	} else reason = checkTiles(team, tiles, true, false);
	return !reason.empty() ? PlaceResult{ false, reason, tiles } : PlaceResult{ true, "", tiles };
}

Building *Works::ownSegment(int t, int team) {
	if (occ[t] < 0) return nullptr;
	Building &o = buildings[occ[t]];
	return o.team == team && o.def->wall == "segment" && !o.prev && !o.cancelled && o.state != "destroyed" ? &o : nullptr;
}

std::vector<std::pair<int, double>> Works::wallUnder(int team, const std::vector<int> &tiles) {
	std::vector<std::pair<int, double>> out; // a JS Map: insertion order
	for (size_t i = 0; i + 1 < tiles.size(); i += 2) {
		const int x = tiles[i], y = tiles[i + 1];
		if (x < 0 || y < 0 || x >= w || y >= h) continue;
		const int t = y * w + x;
		Building *o = ownSegment(t, team);
		if (o) {
			const double g = o->base[indexOf(o->ti, t)];
			auto it = std::find_if(out.begin(), out.end(), [&](const std::pair<int, double> &e) { return e.first == t; });
			if (it != out.end()) it->second = g;
			else out.emplace_back(t, g);
		}
	}
	return out;
}

void Works::giveWay(int team, const std::string &type, const std::vector<int> &tiles) {
	const auto under = wallUnder(team, tiles);
	std::vector<std::pair<Building *, std::vector<int>>> by; // a JS Map of Sets: insertion order
	const bool alongX = tiles.size() >= 4 && tiles[1] == tiles[3];
	const auto add_to = [](std::vector<int> &d, int t) {
		if (!has(d, t)) d.push_back(t);
	};
	for (const auto &e : under) {
		const int t = e.first;
		Building *o = ownSegment(t, team);
		auto it = std::find_if(by.begin(), by.end(), [&](const auto &p) { return p.first == o; });
		if (it == by.end()) {
			by.emplace_back(o, std::vector<int>{});
			it = by.end() - 1;
		}
		std::vector<int> &d = it->second;
		add_to(d, t);
		if (building(type).wall == "gate" && o->def->depth == 2)
			for (int s : { -1, 1 }) {
				const int n = alongX ? t + s * w : t + s;
				if (n >= 0 && n < w * h && occ[n] == o->id) add_to(d, n);
			}
	}
	for (auto &e : by) cutOut(*e.first, e.second);
}

void Works::cutOut(Building &b, const std::vector<int> &drop) {
	const size_t n0 = b.ti.size();
	const bool decked = b.decked;
	const size_t closed = b.saved.size();
	for (Worker *u : active)
		if (u->wsite == b.id) leave(*u);
	lowerDeck(b);
	std::vector<int> ti, tiles;
	std::vector<double> base, saved;
	for (size_t i = 0; i < b.ti.size(); i++) {
		const int t = b.ti[i];
		if (!has(drop, t)) {
			ti.push_back(t);
			tiles.push_back(t % w);
			tiles.push_back(t / w);
			base.push_back(b.base[i]);
			if (i < closed) saved.push_back(b.saved[i]);
			continue;
		}
		occ[t] = -1;
		if (i < closed && !decked) setCost(grid, t, b.saved[i]);
		grid.dirty.push_back(t % w);
		grid.dirty.push_back(t / w);
	}
	if (ti.empty()) {
		b.state = "destroyed";
		b.cancelled = true;
		b.ti = ti;
		b.tiles = tiles;
		b.tilesVer++;
		b.base = base;
		b.saved = saved;
		return;
	}
	const double k = double(ti.size()) / double(n0);
	for (Cost *c : { &b.cost, &b.delivered })
		for (auto &e : c->kv) e.second = e.second * k;
	b.ti = ti;
	b.tiles = tiles;
	b.tilesVer++;
	b.base = base;
	b.saved = saved;
	b.need = b.need * k;
	b.labour = b.labour * k;
	b.maxHp = b.maxHp * k;
	b.hp = b.hp * k;
	b.costSum = b.costSum * k;
	bbox(b);
	if (decked) raiseDeck(b);
	b.slots = workSlots(b);
	b.slotUser.assign(b.slots.size(), -1);
}

PlaceResult Works::checkBrazier(int team, const std::vector<int> &tiles) {
	const int x = tiles[0], y = tiles[1], t = y * w + x;
	const Building *under = x >= 0 && y >= 0 && x < w && y < h && occ[t] >= 0 ? &buildings[occ[t]] : nullptr;
	std::string reason;
	// a field piece: on the ground it needs no influence (attackers set them down before foe walls)
	if (!(under && under->team == team && under->decked && grid.deck[t] == DECK)) reason = checkTiles(team, tiles, true, true);
	if (reason.empty())
		for (const Building *b : braziers)
			if (b->state != "destroyed" && b->ti[0] == t) {
				reason = "overlap";
				break;
			}
	if (reason.empty())
		for (const auto &e : building("brazier").cost.kv)
			if (have_at(team, x + 0.5, y + 0.5).get(e.first) < e.second) {
				reason = "cost";
				break;
			}
	return !reason.empty() ? PlaceResult{ false, reason, tiles } : PlaceResult{ true, "", tiles };
}

int Works::addBrazier(int team, const std::vector<int> &tiles) {
	const int t = tiles[1] * w + tiles[0];
	const BuildingDef &def = building("brazier");
	take_at(team, tiles[0] + 0.5, tiles[1] + 0.5, def.cost);
	const Building *under = occ[t] >= 0 ? &buildings[occ[t]] : nullptr;
	Building b;
	b.id = int(buildings.size());
	b.type = "brazier";
	b.def = &def;
	b.team = team;
	b.rot = 0;
	b.x = tiles[0] + 0.5;
	b.y = tiles[1] + 0.5;
	b.w = 1;
	b.h = 1;
	b.tiles = tiles;
	b.tilesVer++;
	b.ti = { t };
	b.state = "done";
	b.labour = 1;
	b.need = 1;
	b.cost = def.cost;
	b.delivered = def.cost;
	b.costSum = 0;
	b.hp = def.hp;
	b.maxHp = def.hp;
	b.base = { double(grid.height[t]) };
	b.inside = { double(tiles[0]), double(tiles[1]) };
	b.attach = under && under->decked ? under->id : -1;
	b.fuel = E().BRAZIER.life;
	b.access = "alliance";
	b.lock = 0;
	b.lockTold = -E().LOCK.tell;
	buildings.push_back(b);
	braziers.push_back(&buildings.back());
	return buildings.back().id;
}

WallPlan Works::check_wall(int team, const WallOrder &o) {
	const EconomyTables::Kit &kit = wallKit(o.material);
	std::vector<int> line = line_tiles(o.points);
	// W-57: a line starting or ending on an own wall, tower or gate joins it there (those tiles are not built again)
	const auto joins = [&](int k) {
		const int x = line[k * 2], y = line[k * 2 + 1];
		const Building *b = x >= 0 && y >= 0 && x < w && y < h && occ[y * w + x] >= 0 ? &buildings[occ[y * w + x]] : nullptr;
		return !!b && b->team == team && !b->def->wall.empty() && !b->cancelled && b->state != "destroyed";
	};
	int a = 0, z = int(line.size()) / 2;
	while (a < z && joins(a)) a++;
	while (z > a && joins(z - 1)) z--;
	const bool joined = a > 0 || z < int(line.size()) / 2;
	line = std::vector<int>(line.begin() + a * 2, line.begin() + z * 2);
	const int n = int(line.size()) / 2;
	if (n < (joined ? 1 : 2)) return WallPlan{ false, joined ? "overlap" : "short", {} };
	std::vector<bool> taken(n, false);
	bool takenNeg = false;
	const auto nearest = [&](double px, double py) {
		int best = 0;
		double bd = INF;
		for (int k = 0; k < n; k++) {
			const double d = sq2(line[k * 2] + 0.5 - px) + sq2(line[k * 2 + 1] + 0.5 - py);
			if (d < bd) bd = d, best = k;
		}
		return best;
	};
	std::vector<WallPiece> pieces;
	const std::vector<double> &towers = o.towers;
	for (size_t i = 0; i + 1 < towers.size(); i += 2) {
		const int k = nearest(towers[i], towers[i + 1]);
		const std::vector<int> tiles = rect_tiles(line[k * 2] + 1, line[k * 2 + 1] + 1, 2, 2);
		for (int j = 0; j < n; j++)
			for (size_t t = 0; t + 1 < tiles.size(); t += 2)
				if (line[j * 2] == tiles[t] && line[j * 2 + 1] == tiles[t + 1]) taken[j] = true;
		pieces.push_back(WallPiece{ kit.tower, tiles, true, "" });
	}
	const std::vector<double> &gates = o.gates;
	for (size_t i = 0; i + 1 < gates.size(); i += 2) {
		int k = nearest(gates[i], gates[i + 1]);
		if (k == n - 1) k--;
		// line.slice(k * 2, k * 2 + 4) (k may be -1 on a one-tile line: slice(-2, 2))
		std::vector<int> tiles;
		{
			const int len = int(line.size());
			int s = k * 2, e = k * 2 + 4;
			if (s < 0) s = std::max(0, len + s);
			if (e < 0) e = std::max(0, len + e);
			e = std::min(e, len);
			for (int q = s; q < e; q++) tiles.push_back(line[q]);
		}
		// taken[-1] is a JS property, not an element: kept apart (takenNeg)
		const auto tk = [&](int q) { return q == -1 ? takenNeg : q >= 0 && q < n ? bool(taken[q]) : false; };
		const bool clash = tk(k) || tk(k + 1);
		for (int q : { k, k + 1 }) {
			if (q == -1) takenNeg = true;
			else if (q >= 0 && q < n) taken[q] = true;
		}
		pieces.push_back(WallPiece{ kit.gate, tiles, !clash, clash ? "overlap" : "" });
	}
	// walls with a walkway are two tiles deep: an inner row toward the inside, one tile across the line's main axis
	const std::array<double, 2> inside = o.inside.size() >= 2 ? std::array<double, 2>{ o.inside[0], o.inside[1] } : homeOf(team);
	std::set<int> onLine; // membership only
	for (int k = 0; k < n; k++) onLine.insert(line[k * 2 + 1] * w + line[k * 2]);
	for (const WallPiece &p : pieces)
		for (size_t t = 0; t + 1 < p.tiles.size(); t += 2) onLine.insert(p.tiles[t + 1] * w + p.tiles[t]);
	const std::array<double, 2> oxy = building(kit.segment).depth == 2 ? innerStep(line, inside) : std::array<double, 2>{ 0, 0 };
	const int ox = int(oxy[0]), oy = int(oxy[1]);
	std::set<int> used; // membership only
	// Each free line tile's inner tile (or none) and why it cannot be built ("": it can).
	struct At {
		bool inner;
		int ix, iy;
		std::string reason;
	};
	std::vector<At> at;
	for (int k = 0; k < n; k++) {
		const int x = line[k * 2], y = line[k * 2 + 1], ix = x + ox, iy = y + oy, ik = iy * w + ix;
		const bool inner = (ox || oy) && !onLine.count(ik) && !used.count(ik);
		if (inner) used.insert(ik);
		at.push_back(At{ inner, ix, iy, taken[k] ? "" : checkTiles(team, inner ? std::vector<int>{ x, y, ix, iy } : std::vector<int>{ x, y }, false) });
	}
	// W-57: the free tiles in runs of one verdict, cut to SEGMENT: red runs are skipped with their reason, the rest is built
	for (int k = 0; k < n;) {
		if (taken[k]) {
			k++;
			continue;
		}
		const std::string reason = at[k].reason;
		std::vector<int> tiles, inner;
		while (k < n && !taken[k] && at[k].reason == reason && double(tiles.size()) < E().SEGMENT * 2) {
			tiles.push_back(line[k * 2]);
			tiles.push_back(line[k * 2 + 1]);
			if (at[k].inner) inner.push_back(at[k].ix), inner.push_back(at[k].iy);
			k++;
		}
		tiles.insert(tiles.end(), inner.begin(), inner.end());
		pieces.push_back(WallPiece{ kit.segment, tiles, reason.empty(), reason });
	}
	// towers and gates on the line may not overlap each other (two towers on one spot)
	std::set<int> mine; // membership only
	for (WallPiece &p : pieces) {
		if (!p.ok || building(p.type).wall == "segment") continue;
		const std::string r = checkTiles(team, p.tiles, building(p.type).wall == "tower");
		bool dup = false;
		for (size_t t = 0; t + 1 < p.tiles.size(); t += 2) {
			const int key = p.tiles[t + 1] * w + p.tiles[t];
			if (mine.count(key)) dup = true;
			mine.insert(key);
		}
		const std::string reason = !r.empty() ? r : dup ? "overlap" : "";
		if (!reason.empty()) p.ok = false, p.reason = reason;
	}
	// W-57: the plan stands while any piece can be built; reason: why the first skipped one cannot
	WallPlan plan;
	plan.ok = false;
	for (const WallPiece &p : pieces) plan.ok = plan.ok || p.ok;
	for (const WallPiece &p : pieces)
		if (!p.ok) {
			plan.reason = p.reason;
			break;
		}
	plan.pieces = pieces;
	return plan;
}

std::array<double, 2> Works::innerStep(const std::vector<int> &line, std::array<double, 2> inside) const {
	double x0 = INF, x1 = -INF, y0 = INF, y1 = -INF;
	for (size_t i = 0; i + 1 < line.size(); i += 2) x0 = std::min(x0, double(line[i])), x1 = std::max(x1, double(line[i])), y0 = std::min(y0, double(line[i + 1])), y1 = std::max(y1, double(line[i + 1]));
	const double cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
	return x1 - x0 >= y1 - y0 ? std::array<double, 2>{ 0, inside[1] < cy ? -1.0 : 1.0 } : std::array<double, 2>{ inside[0] < cx ? -1.0 : 1.0, 0 };
}

std::array<double, 2> Works::homeOf(int team) const {
	double x = 0, y = 0;
	int n = 0;
	for (const Claim &c : claims)
		if (c.team == team) x += c.x, y += c.y, n++;
	for (const Building &b : buildings)
		if (b.team == team && b.def->influence > 0 && !b.cancelled && b.state != "destroyed") x += b.x, y += b.y, n++;
	return n ? std::array<double, 2>{ x / n, y / n } : std::array<double, 2>{ w / 2.0, h / 2.0 };
}

int Works::add(int team, const std::string &type, const std::vector<int> &tiles, int rot, const std::optional<std::array<double, 2>> &inside, int attach, const std::string &owner) {
	const BuildingDef &def = building(type);
	const double k = def.perTile ? double(tiles.size() / 2) : 1;
	double x0 = INF, y0 = INF, x1 = -INF, y1 = -INF;
	for (size_t i = 0; i + 1 < tiles.size(); i += 2) {
		x0 = std::min(x0, double(tiles[i]));
		x1 = std::max(x1, double(tiles[i] + 1));
		y0 = std::min(y0, double(tiles[i + 1]));
		y1 = std::max(y1, double(tiles[i + 1] + 1));
	}
	Cost cost;
	double costSum = 0;
	for (const auto &e : def.cost.kv) cost.set(e.first, e.second * k), costSum += e.second * k;
	const double maxHp = def.hp * k;
	Building b;
	b.id = int(buildings.size());
	b.type = type;
	b.def = &def;
	b.team = team;
	b.rot = rot;
	b.x = (x0 + x1) / 2;
	b.y = (y0 + y1) / 2;
	b.w = x1 - x0;
	b.h = y1 - y0;
	b.tiles = tiles;
	b.tilesVer++;
	b.state = "foundation";
	b.labour = 0;
	b.need = def.labour * k;
	b.cost = cost;
	b.costSum = costSum;
	b.hp = maxHp * 0.1;
	b.maxHp = maxHp;
	b.inside = inside ? *inside : homeOf(team);
	b.attach = attach;
	if (def.store || def.chest || def.cache) b.hold = new_hold();
	b.owner = owner;
	b.access = def.house && !owner.empty() ? "private" : "alliance";
	b.lock = lock_of(def);
	b.lockTold = -E().LOCK.tell;
	buildings.push_back(b);
	Building &nb = buildings.back();
	if (def.store) storeList.push_back(&nb);
	for (size_t i = 0; i + 1 < tiles.size(); i += 2) {
		const int t = tiles[i + 1] * w + tiles[i];
		nb.ti.push_back(t);
		nb.base.push_back(grid.height[t]);
		occ[t] = nb.id;
	}
	// the TS pushes b after its slots; workSlots reads only b itself and the grid
	nb.slots = workSlots(nb);
	nb.slotUser.assign(nb.slots.size(), -1);
	return nb.id;
}

bool Works::standable(int t, int team) const {
	if (t < 0 || t >= w * h) return false;
	return double(grid.cost[t]) > 0 && (occ[t] < 0 || onDeck(t)) && (!grid.gate[t] || grid.gate[t] == team + 1);
}

bool Works::onDeck(int t) const {
	if (occ[t] < 0) return false;
	const Building &o = buildings[occ[t]];
	return o.bridge && o.decked;
}

std::vector<int> Works::workSlots(const Building &b) const {
	const std::vector<int> &inside = b.ti; // membership only
	std::vector<int> ring;
	std::set<int> seen; // membership only
	for (size_t i0 = 0; i0 < b.ti.size(); i0++) {
		const int t0 = b.ti[i0];
		for (int dy = -1; dy <= 1; dy++)
			for (int dx = -1; dx <= 1; dx++) {
				const int x = (t0 % w) + dx, y = (t0 / w) + dy;
				if (x < 0 || y < 0 || x >= w || y >= h) continue;
				const int t = y * w + x;
				if (has(inside, t) || seen.count(t) || !standable(t, b.team) || std::abs(double(grid.height[t]) - (b.bridge ? b.bridge->deck : b.base[i0])) > 1) continue;
				bool out = false;
				for (const auto &e : DIRS) {
					const int nx = x + e[0], ny = y + e[1];
					if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
					const int n = ny * w + nx;
					if (!has(inside, n) && standable(n, b.team) && std::abs(double(grid.height[n]) - double(grid.height[t])) < 2) out = true;
				}
				if (!out) continue;
				seen.insert(t);
				ring.push_back(t);
			}
	}
	const auto ang = [&](int t) { return js::atan2(double(t / w) + 0.5 - b.y, double(t % w) + 0.5 - b.x); };
	std::sort(ring.begin(), ring.end(), [&](int a, int c) {
		const double d = ang(a) - ang(c);
		if (d != 0) return d < 0;
		return a < c;
	});
	const int k = int(std::min(b.def->workers, double(ring.size())));
	std::vector<int> out;
	for (int i = 0; i < k; i++) out.push_back(ring[size_t(std::floor(double(i) * double(ring.size()) / k))]);
	return out;
}

int Works::place(int team, const std::string &type, double x, double y, int rot, const std::string &owner) {
	const BuildingDef &def = building(type);
	// M6a: a chest is a player's (CHEST.cap a player a region); W-90: a house is a player's too (HOUSE.cap)
	const bool house = def.house;
	if (def.chest) {
		if (owner.empty()) return -1;
		int n = 0;
		for (const Building &b : buildings)
			if (b.owner == owner && b.def->chest && b.def->house == house && !b.cancelled && b.state != "destroyed") n++;
		if (n >= (house ? E().HOUSE.cap : E().CHEST.cap)) return -1;
	}
	const PlaceResult r = check_placement(team, type, x, y, rot);
	if (!r.ok) return -1;
	if (def.brazier) return addBrazier(team, r.tiles);
	if (!def.wall.empty()) giveWay(team, type, r.tiles);
	return add(team, type, r.tiles, rot, std::nullopt, !def.access.empty() ? accessOf(team, type, r.tiles).attach : -1, owner);
}

std::vector<int> Works::place_wall(int team, const WallOrder &o) {
	const WallPlan plan = check_wall(team, o);
	if (!plan.ok) return {};
	const std::array<double, 2> inside = o.inside.size() >= 2 ? std::array<double, 2>{ o.inside[0], o.inside[1] } : homeOf(team);
	// W-57: the pieces that can be built are laid out, the blocked ones skipped
	std::vector<int> ids;
	for (const WallPiece &p : plan.pieces)
		if (p.ok) ids.push_back(add(team, p.type, p.tiles, 0, inside));
	for (int id : ids) {
		Building &b = buildings[id]; // slots again, now that every piece is marked out
		b.insideKey = ids[0] + 1; // saves: TS hands all the pieces the one inside array
		b.slots = workSlots(b);
		b.slotUser.assign(b.slots.size(), -1);
	}
	return ids;
}

// --- bridges (M2d) ---
BridgePlan Works::check_bridge(int team, const BridgeOrder &o) {
	const std::vector<double> &p = o.points;
	const size_t n2 = p.size();
	const auto pt = [&](long i) { return i >= 0 && size_t(i) < n2 ? p[size_t(i)] : 0.0; };
	const double sx = std::floor(pt(0)), sy = std::floor(pt(1)), ex = std::floor(pt(long(n2) - 2)), ey = std::floor(pt(long(n2) - 1));
	// the nearest of the 8 steps (4 lines) to the drag; a diagonal step is sqrt 2 tiles long
	const int oct = int(std::fmod(std::fmod(js::round(js::atan2(ey - sy, ex - sx) / (M_PI / 4)), 8) + 8, 8));
	const int dx = STEPS[oct][0], dy = STEPS[oct][1];
	const bool diag = dx != 0 && dy != 0;
	const double stepLen = diag ? SQRT2 : 1;
	const std::string axis = !diag ? (dx ? "x" : "y") : dx == dy ? "v" : "h";
	const int width = int(std::max(1.0, std::min(3.0, js::round(o.width ? *o.width : E().BRIDGE.width))));
	const double maxSpan = o.material == "wood" ? E().BRIDGE.maxSpanWood : E().BRIDGE.maxSpanStone;
	const int len = int(js::round(((ex - sx) * dx + (ey - sy) * dy) / (dx * dx + dy * dy))) + 1;
	// a row's tiles beside the line: an axis row `width` tiles (+y along x, +x along y; 3 wide centred); a diagonal row a
	// staircase band: tiles on every other diagonal across (px, py) and between them the 4-neighbour half a step ahead
	std::vector<std::array<int, 2>> offs;
	if (!diag) {
		int j = -int(std::floor((width - 1) / 2.0));
		for (int n = 0; n < width; j++, n++) offs.push_back(dx ? std::array<int, 2>{ 0, j } : std::array<int, 2>{ j, 0 });
	} else {
		const int px = -dy, py = dx;
		const int qx = px * dx > 0 ? px : 0, qy = px * dx > 0 ? 0 : py;
		const int n = int(js::round(width * SQRT2)) + 1;
		int j = -int(std::floor((n - 1) / 2.0));
		for (int c = 0; c < n; j++, c++) {
			const int m = int(std::floor(j / 2.0)), odd = j - 2 * m;
			offs.push_back({ px * m + qx * odd, py * m + qy * odd });
		}
	}
	const auto fail = [&](const std::string &reason, double span = 0, const std::vector<BridgePiece> &pieces = {}) {
		BridgePlan b;
		b.ok = false;
		b.reason = reason;
		b.axis = axis;
		b.dir = { dx, dy };
		b.width = width;
		b.span = span;
		b.maxSpan = maxSpan;
		b.pieces = pieces;
		return b;
	};
	if (len < 3 || n2 < 4) return fail("short");
	const auto row = [&](int k) {
		std::vector<int> r;
		for (const auto &of : offs) r.push_back(int(sx) + dx * k + of[0]), r.push_back(int(sy) + dy * k + of[1]);
		return r;
	};
	const auto centre = [&](int k) {
		const std::vector<int> r = row(k);
		double cx = 0, cy = 0;
		for (size_t i = 0; i + 1 < r.size(); i += 2) cx += r[i], cy += r[i + 1];
		return std::array<double, 2>{ cx / double(offs.size()) + 0.5, cy / double(offs.size()) + 0.5 };
	};
	const auto inMap = [&](int k) {
		const std::vector<int> r = row(k);
		for (size_t i = 0; i < r.size(); i++)
			if (!(r[i] >= 0 && r[i] < (i % 2 ? h : w))) return false;
		return true;
	};
	const auto wet = [&](int k) {
		const std::vector<int> r = row(k);
		for (size_t i = 0; i + 1 < r.size(); i += 2) {
			const long t = long(r[i + 1]) * w + r[i];
			if (t >= 0 && t < long(region.water.size()) && region.water[size_t(t)] > 0) return true;
		}
		return false;
	};
	if (!inMap(0) || !inMap(len - 1)) return fail("bounds");
	if (wet(0)) return fail("bank");
	int k0 = 1;
	while (k0 < len && !wet(k0)) k0++;
	if (k0 >= len) return fail("short"); // no water on the line
	int k1 = k0;
	while (k1 + 1 < len && wet(k1 + 1)) k1++;
	const double span = js::round((k1 - k0 + 1) * stepLen);
	const std::string type = o.material == "wood" ? E().BRIDGE.kitWood : E().BRIDGE.kitStone;
	// each ramp is BRIDGE.ramp rows of the bank (outer row first on end0, inner first on end1), past the drag if need be
	const auto rampRows = [&](const std::vector<int> &ks, const std::string &part) {
		BridgePiece q;
		q.type = type;
		q.part = part;
		for (int k : ks) {
			const auto r = row(k);
			q.tiles.insert(q.tiles.end(), r.begin(), r.end());
		}
		for (int k : ks) {
			const auto c = centre(k);
			q.rows.push_back(c[0]);
			q.rows.push_back(c[1]);
		}
		q.ok = true;
		return q;
	};
	const int RAMP = int(E().BRIDGE.ramp), PIECE = int(E().BRIDGE.piece);
	std::vector<int> r0, r1;
	for (int i = 0; i < RAMP; i++) r0.push_back(k0 - RAMP + i);
	for (int i = 0; i < RAMP; i++) r1.push_back(k1 + 1 + i);
	std::vector<BridgePiece> pieces{ rampRows(r0, "end0") };
	for (int k = k0; k <= k1; k += PIECE) {
		BridgePiece q;
		q.type = type;
		q.part = "deck";
		for (int j = k; j <= std::min(k1, k + PIECE - 1); j++) {
			const auto r = row(j);
			q.tiles.insert(q.tiles.end(), r.begin(), r.end());
			const auto c = centre(j);
			q.rows.push_back(c[0]);
			q.rows.push_back(c[1]);
		}
		q.ok = true;
		pieces.push_back(q);
	}
	if (k1 + 1 < len) pieces.push_back(rampRows(r1, "end1"));
	const auto bad = [&](const std::string &reason) {
		for (BridgePiece &q : pieces) q.ok = false;
		return fail(reason, span, pieces);
	};
	if (span > maxSpan) return bad("span");
	if (k1 + 1 >= len) return bad("bank"); // the drag ends in the water
	std::vector<int> rr = r0;
	rr.insert(rr.end(), r1.begin(), r1.end());
	for (int k : rr)
		if (!inMap(k)) return bad("bounds");
	for (int k : rr)
		if (wet(k)) return bad("bank"); // a bank too narrow for the ramp
	// ramps: open dry ground, banks at most a level apart, one of them in the team's influence
	double lo = INF, hi = -INF;
	bool own = false;
	for (size_t ei : { size_t(0), pieces.size() - 1 }) {
		BridgePiece &e = pieces[ei];
		const std::string r = checkTiles(team, e.tiles, false, true);
		if (!r.empty()) {
			e.ok = false;
			return fail(r, span, pieces);
		}
		bool mine = true;
		for (size_t i = 0; i + 1 < e.tiles.size(); i += 2) {
			const int t = e.tiles[i + 1] * w + e.tiles[i];
			lo = std::min(lo, double(grid.height[t]));
			hi = std::max(hi, double(grid.height[t]));
			if (!(infl.mask[t] & (1 << team))) mine = false;
		}
		own = own || mine;
	}
	if (hi - lo > 1) return bad("slope");
	if (!own) return bad("influence");
	// deck: free of buildings, no-build bands and rock; a dry tile beside the water open
	for (BridgePiece &q : pieces)
		if (q.part == "deck")
			for (size_t i = 0; i + 1 < q.tiles.size(); i += 2) {
				const int t = q.tiles[i + 1] * w + q.tiles[i];
				const std::string r = noBuild[t] ? "noBuild" : occ[t] >= 0 ? "overlap" : region.terrain[t] == T_ROCK ? "rock" : !region.water[t] && double(grid.cost[t]) == 0 ? "blocked" : "";
				if (!r.empty()) {
					q.ok = false;
					return fail(r, span, pieces);
				}
			}
	BridgePlan ok;
	ok.ok = true;
	ok.axis = axis;
	ok.dir = { dx, dy };
	ok.width = width;
	ok.span = span;
	ok.maxSpan = maxSpan;
	ok.pieces = pieces;
	return ok;
}

std::vector<int> Works::place_bridge(int team, const BridgeOrder &o) {
	const BridgePlan plan = check_bridge(team, o);
	if (!plan.ok) return {};
	double deck = 0;
	for (const BridgePiece *q : { &plan.pieces[0], &plan.pieces[plan.pieces.size() - 1] })
		for (size_t i = 0; i + 1 < q->tiles.size(); i += 2) deck = std::max(deck, double(grid.height[q->tiles[i + 1] * w + q->tiles[i]]));
	std::vector<int> ids;
	for (const BridgePiece &q : plan.pieces) ids.push_back(add(team, q.type, q.tiles, 0));
	for (size_t i = 0; i < ids.size(); i++) {
		Building &b = buildings[ids[i]];
		b.bridge = BridgeLine{ ids, int(i), plan.axis, plan.dir, plan.width, plan.pieces[i].part, deck, plan.pieces[i].rows };
		b.slots = workSlots(b);
		b.slotUser.assign(b.slots.size(), -1);
	}
	return ids;
}

// A bridge piece takes workers: a ramp always, a deck piece once a neighbour along the line is done.
bool Works::ready(const Building &b) const {
	if (!b.bridge || b.bridge->part != "deck") return true;
	const BridgeLine &br = *b.bridge;
	for (int j : { br.i - 1, br.i + 1 })
		if (j >= 0 && j < int(br.ids.size()) && buildings[br.ids[j]].decked) return true;
	return false;
}

// --- site life ---
double Works::deliveredShare(const Building &b) const {
	if (b.costSum == 0) return 1;
	double s = 0;
	for (const auto &e : b.delivered.kv) s += e.second;
	return s / b.costSum;
}

void Works::waitOf(Building &b, BuildingSnap &s) {
	if (b.cancelled || b.mend || (b.state != "foundation" && b.state != "scaffold")) return;
	const bool idle = !b.users;
	const auto setIdle = [&]() {
		if (idle) s.stalled = "noWorkers";
	};
	if (b.labour < b.need * deliveredShare(b) - 1e-6) return setIdle();
	Cost lack;
	for (const auto &e : b.cost.kv) {
		const double n = e.second - b.delivered.get(e.first) - b.incoming.get(e.first);
		if (n > 1e-6) lack.set(e.first, n);
	}
	if (lack.empty()) return setIdle();
	// a site outside every network (a far bridge ramp): its builders fetch from the network of the store nearest them
	int sn = storeNet(b);
	if (sn < 0) {
		double bd = INF;
		for (Building *o : storeList)
			if (o->team == b.team && standing(*o) && sq2(o->x - b.x) + sq2(o->y - b.y) < bd) bd = sq2(o->x - b.x) + sq2(o->y - b.y), sn = storeNet(*o);
	}
	const std::vector<Building *> stores = netStores(b.team, sn);
	if (stores.empty()) {
		s.stalled = "noStore";
		return;
	}
	Cost have;
	std::vector<Hold *> hds;
	for (Building *o : stores) hds.push_back(&*o->hold);
	hds.push_back(&reserve_of(b.team));
	for (Hold *hd : hds) totals(*hd, have);
	Cost waiting;
	for (const auto &e : lack.kv)
		if (e.second - have.get(e.first) > 1e-6) waiting.set(e.first, std::ceil(e.second - have.get(e.first)));
	setIdle();
	if (!waiting.empty()) s.waiting = waiting;
}

void Works::close(Building &b) {
	const std::vector<int> fresh(b.ti.begin() + std::min(b.saved.size(), b.ti.size()), b.ti.end());
	for (int t : fresh) {
		b.saved.push_back(grid.cost[t]);
		setCost(grid, t, 0);
		grid.dirty.push_back(t % w);
		grid.dirty.push_back(t / w);
	}
	host.evict(fresh);
	// workers headed near it, or holding one of its slots, search their way again (the old path may run through it, or
	// the goal is now cut off or a long detour away)
	const double r = std::max(b.w, b.h) / 2 + REPATH_NEAR;
	for (Worker *u : active)
		if (u->alive && (u->wsite == b.id || (std::abs(u->wgx - b.x) < r && std::abs(u->wgy - b.y) < r))) u->wgx = u->wgy = -1;
}

// --- walkways (W-27, W-28) ---
Building *Works::walkWall(int t, int team) {
	if (t < 0 || t >= w * h || occ[t] < 0) return nullptr;
	Building &o = buildings[occ[t]];
	return o.team == team && o.def->wall == "segment" && o.def->walk && !o.cancelled && o.state != "destroyed" ? &o : nullptr;
}

std::vector<int> Works::innerRow(const std::vector<int> &tiles, std::array<double, 2> inside, const std::set<int> &skip) const {
	double x0 = INF, x1 = -INF, y0 = INF, y1 = -INF;
	for (size_t i = 0; i + 1 < tiles.size(); i += 2) x0 = std::min(x0, double(tiles[i])), x1 = std::max(x1, double(tiles[i])), y0 = std::min(y0, double(tiles[i + 1])), y1 = std::max(y1, double(tiles[i + 1]));
	const double cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
	const int ox = x1 - x0 >= y1 - y0 ? 0 : (inside[0] < cx ? -1 : 1);
	const int oy = x1 - x0 >= y1 - y0 ? (inside[1] < cy ? -1 : 1) : 0;
	std::set<int> own; // membership only
	for (size_t i = 0; i + 1 < tiles.size(); i += 2) own.insert(tiles[i + 1] * w + tiles[i]);
	std::vector<int> out;
	for (size_t i = 0; i + 1 < tiles.size(); i += 2) {
		const int x = tiles[i] + ox, y = tiles[i + 1] + oy, k = y * w + x;
		if (own.count(k) || skip.count(k)) continue;
		own.insert(k);
		out.push_back(x);
		out.push_back(y);
	}
	return out;
}

Works::AccessOf Works::accessOf(int team, const std::string &type, const std::vector<int> &tiles) {
	const int n = int(tiles.size()) / 2;
	if (building(type).access == "ladder") {
		const int t = tiles[1] * w + tiles[0];
		for (const auto &e : DIRS) {
			const int x = tiles[0] + e[0], y = tiles[1] + e[1];
			if (x < 0 || y < 0 || x >= w || y >= h) continue;
			if (occ[y * w + x] < 0) continue;
			const Building &o = buildings[occ[y * w + x]];
			if (o.def->walk && o.def->access.empty() && !o.cancelled && o.state != "destroyed" && t >= 0) return { "", o.id, tiles };
		}
		return { "attach", -1, tiles };
	}
	const double ax = sign(tiles[(n - 1) * 2] - tiles[0]), ay = sign(tiles[(n - 1) * 2 + 1] - tiles[1]); // first to last tile
	for (int up : { 1, -1 }) {
		const int top = up > 0 ? n - 1 : 0, bottom = n - 1 - top;
		const int tx = int(tiles[top * 2] + ax * up), ty = int(tiles[top * 2 + 1] + ay * up);
		const int bx = int(tiles[bottom * 2] - ax * up), by = int(tiles[bottom * 2 + 1] - ay * up);
		if (tx < 0 || ty < 0 || tx >= w || ty >= h || bx < 0 || by < 0 || bx >= w || by >= h) continue;
		Building *wall = walkWall(ty * w + tx, team);
		if (!wall) continue;
		// on its inside face, and a way onto the bottom step
		if (-ax * up * (wall->inside[0] - tx - 0.5) - ay * up * (wall->inside[1] - ty - 0.5) <= 0) continue;
		const int entry = by * w + bx;
		if (double(grid.cost[entry]) == 0 || occ[entry] >= 0 || grid.deck[entry] != 0) continue;
		std::vector<int> ordered;
		for (int k = 0; k < n; k++) {
			const int j = up > 0 ? k : n - 1 - k;
			ordered.push_back(tiles[j * 2]);
			ordered.push_back(tiles[j * 2 + 1]);
		}
		return { "", wall->id, ordered };
	}
	return { "attach", -1, tiles };
}

std::vector<double> Works::steps(const Building &s) const {
	const double walk = s.attach >= 0 && s.attach < int(buildings.size()) && buildings[s.attach].def->walk ? buildings[s.attach].def->walk : 2;
	const size_t n = s.ti.size();
	std::vector<double> out;
	for (size_t i = 0; i < n; i++) out.push_back(std::max(1.0, walk - 1 - double(n - 1 - i)));
	return out;
}

void Works::ramp(Building &s) {
	const Building *wall = s.attach >= 0 && s.attach < int(buildings.size()) ? &buildings[s.attach] : nullptr;
	const int top = s.ti[s.ti.size() - 1];
	double base = s.base[s.base.size() - 1];
	if (wall) {
		const int tx = top % w, ty = top / w;
		for (const auto &e : DIRS) {
			const int k = indexOf(wall->ti, (ty + e[1]) * w + tx + e[0]);
			if (k >= 0) base = wall->base[k];
		}
	}
	const std::vector<double> lv = steps(s);
	for (size_t i = 0; i < s.ti.size(); i++) {
		const int t = s.ti[i];
		grid.height[t] = u8(base + lv[i]);
		setCost(grid, t, or1(s.saved, i));
		grid.deck[t] = STAIR;
	}
	s.decked = true;
	grid.dirty.insert(grid.dirty.end(), s.tiles.begin(), s.tiles.end());
}

int Works::doorOf(const Building &b) const {
	int best = -1;
	double bs = -INF;
	for (int f : b.ti) {
		const int fx = f % w, fy = f / w;
		const double ix = b.inside[0] - fx - 0.5, iy = b.inside[1] - fy - 0.5;
		double il = js::hypot(ix, iy);
		if (il == 0 || std::isnan(il)) il = 1;
		for (const auto &e : DIRS) {
			const int x = fx + e[0], y = fy + e[1];
			if (x < 0 || y < 0 || x >= w || y >= h) continue;
			const int t = y * w + x;
			if (has(b.ti, t) || double(grid.cost[t]) == 0 || occ[t] >= 0 || grid.deck[t] != 0) continue;
			const double sc = (e[0] * ix + e[1] * iy) / il;
			if (sc > bs) bs = sc, best = f;
		}
	}
	return best;
}

void Works::raiseDeck(Building &b) {
	const BuildingDef &d = *b.def;
	if (b.bridge) {
		const BridgeLine br = *b.bridge;
		const bool diag = br.axis == "h" || br.axis == "v";
		for (int t : b.ti) {
			grid.height[t] = u8(br.deck);
			setCost(grid, t, E().BRIDGE.cost);
			if (diag) grid.span[t] = 1;
			grid.narrow[t] = br.width < 2 ? 1 : 0; // M6b: carts need a bridge 2 wide
			grid.cart_mul[t] = 1;
		}
		b.decked = true;
		grid.dirty.insert(grid.dirty.end(), b.tiles.begin(), b.tiles.end());
		// the next pieces get their work slots on this deck; workers cut off before may find a way now
		for (int j : { br.i - 1, br.i + 1 }) {
			if (j < 0 || j >= int(br.ids.size())) continue;
			Building &o = buildings[br.ids[j]];
			if (o.users > 0 || o.decked) continue;
			o.slots = workSlots(o);
			o.slotUser.assign(o.slots.size(), -1);
		}
		cutOff.clear();
		return;
	}
	if (d.access == "stairs") return ramp(b);
	if (d.access == "ladder") {
		const int t = b.ti[0];
		setCost(grid, t, or1(b.saved, 0) * (b.type == "towerBridge" ? 1 : LADDER_COST)); // M5h3: a tower's bridge is no climb
		grid.deck[t] = LADDER;
		grid.plat[t] = b.id;
		b.decked = true;
		grid.dirty.insert(grid.dirty.end(), b.tiles.begin(), b.tiles.end());
		return;
	}
	if (!d.walk) return;
	for (size_t i = 0; i < b.ti.size(); i++) {
		const int t = b.ti[i];
		grid.height[t] = u8(b.base[i] + d.walk);
		if (double(grid.cost[t]) == 0) setCost(grid, t, or1(b.saved, i));
		grid.deck[t] = DECK;
		if (d.wall == "tower") grid.plat[t] = b.id;
	}
	if (d.door && b.door < 0) b.door = doorOf(b);
	if (d.door && b.door >= 0) {
		const int t = b.door;
		const int k = indexOf(b.ti, t);
		grid.height[t] = u8(b.base[k]);
		grid.deck[t] = LADDER;
		grid.gate[t] = u8(gateOf(b.team));
		setCost(grid, t, or1(b.saved, size_t(k)) * DOOR_COST);
	}
	b.decked = true;
	grid.dirty.insert(grid.dirty.end(), b.tiles.begin(), b.tiles.end());
	for (Building &o : buildings)
		if (o.attach == b.id && o.decked && o.def->access == "stairs") ramp(o);
}

void Works::lowerDeck(Building &b) {
	if (!b.decked) return;
	for (size_t i = 0; i < b.ti.size(); i++) {
		const int t = b.ti[i];
		grid.height[t] = u8(b.base[i]);
		grid.deck[t] = 0;
		grid.plat[t] = -1;
		if (i < b.saved.size()) setCost(grid, t, b.saved[i]);
	}
	if (b.door >= 0) grid.gate[b.door] = 0;
	b.door = -1;
	b.decked = false;
	grid.dirty.insert(grid.dirty.end(), b.tiles.begin(), b.tiles.end());
}

void Works::bbox(Building &b) {
	double x0 = INF, y0 = INF, x1 = -INF, y1 = -INF;
	for (size_t i = 0; i + 1 < b.tiles.size(); i += 2) x0 = std::min(x0, double(b.tiles[i])), x1 = std::max(x1, double(b.tiles[i] + 1)), y0 = std::min(y0, double(b.tiles[i + 1])), y1 = std::max(y1, double(b.tiles[i + 1] + 1));
	b.x = (x0 + x1) / 2;
	b.y = (y0 + y1) / 2;
	b.w = x1 - x0;
	b.h = y1 - y0;
}

std::vector<Spot> Works::spotsOf(const Building &b) const {
	if (!b.def->workplace) return {};
	const BuildingDef::Workplace &wp = *b.def->workplace;
	const double lw = b.rot ? b.h : b.w, lh = b.rot ? b.w : b.h;
	std::vector<Spot> own;
	if (wp.spots) own = *wp.spots;
	else
		for (int i = 0; i < int(lw); i++) own.push_back(Spot{ lw - 0.5 - i, lh - 0.5, lw - 0.5 - i, lh / 2 - 0.5 });
	const double x0 = b.x - b.w / 2, y0 = b.y - b.h / 2;
	std::vector<Spot> out;
	for (int i = 0; i < int(own.size()) && i < wp.level; i++) {
		const Spot &s = own[i];
		out.push_back(b.rot ? Spot{ x0 + s[1], y0 + s[0], x0 + s[3], y0 + s[2] } : Spot{ x0 + s[0], y0 + s[1], x0 + s[2], y0 + s[3] });
	}
	return out;
}

void Works::openInside(Building &b) {
	const double x0 = b.x - b.w / 2, y0 = b.y - b.h / 2;
	std::set<int> open; // membership only
	for (const Spot &s : spotsOf(b)) {
		double tx = std::floor(s[0]), ty = std::floor(s[1]);
		const bool alongX = x0 + b.w - 1 - tx <= y0 + b.h - 1 - ty;
		open.insert(int(ty) * w + int(tx));
		while (alongX ? tx < x0 + b.w - 1 : ty < y0 + b.h - 1) {
			if (alongX) tx++;
			else ty++;
			open.insert(int(ty) * w + int(tx));
		}
	}
	std::vector<int> shut;
	for (size_t i = 0; i < b.ti.size(); i++) {
		const int t = b.ti[i];
		if (open.count(t)) setCost(grid, t, or1(b.saved, i)), grid.gate[t] = u8(gateOf(b.team));
		else if (double(grid.cost[t]) > 0) setCost(grid, t, 0), grid.gate[t] = 0, shut.push_back(t);
	}
	grid.dirty.insert(grid.dirty.end(), b.tiles.begin(), b.tiles.end());
	if (!shut.empty()) host.evict(shut);
}

void Works::finish(Building &b) {
	b.state = "done";
	b.hp = b.maxHp;
	if (b.prev) {
		b.prev.reset();
		b.need = b.def->labour * (b.def->perTile ? double(b.ti.size()) : 1);
		b.labour = b.need;
	}
	raiseDeck(b);
	if (b.def->workplace) openInside(b);
	if (!b.def->field.empty()) {
		// M5h3: men cross it slowly, engines not at all
		b.saved.clear();
		for (int t : b.ti) b.saved.push_back(grid.cost[t]);
		for (int t : b.ti) setCost(grid, t, double(grid.cost[t]) * fieldSlow(b.def->field)), grid.trench[t] = 1;
		grid.dirty.insert(grid.dirty.end(), b.tiles.begin(), b.tiles.end());
		fields++;
	}
	if (b.def->wall == "gate") {
		for (size_t i = 0; i < b.ti.size(); i++) {
			const int t = b.ti[i];
			setCost(grid, t, at_or_nan(b.saved, i));
			grid.gate[t] = u8(gateOf(b.team));
		}
		grid.dirty.insert(grid.dirty.end(), b.tiles.begin(), b.tiles.end());
	}
	if (b.def->yields) {
		const BuildingDef::Yields &y = *b.def->yields;
		Node n;
		n.id = int(nodes.size());
		n.res = y.res;
		n.x = b.x;
		n.y = b.y;
		n.amount = y.max;
		n.max = y.max;
		n.regrow = y.regrow;
		n.rate = y.rate;
		n.slots = 2 * (b.w + b.h);
		n.tiles = b.tiles;
		n.tilesVer = b.tilesVer;
		n.building = b.id;
		if (b.type == "pitchKiln") {
			// W-35: pines standing near feed it faster
			double pines = 0;
			for (const Node &o : nodes)
				if (o.obj && o.amount >= 1 && E().PINES.count(region.objects[*o.obj].id) && sq2(o.x - b.x) + sq2(o.y - b.y) <= sq2(E().KILN.pineR)) pines++;
			n.regrow *= 1 + E().KILN.pineBoost * std::min(pines, E().KILN.pineMax);
			n.kiln = b.team;
			n.amount = 0; // it starts cold
		}
		nodes.push_back(n);
		regrowing.push_back(&nodes.back());
		b.node = nodes.back().id;
	}
	if (b.def->influence > 0) repaint();
	if (b.def->store) storeVer++;
}

void Works::destroy(Building &b, bool razed) {
	if (b.def->brazier) {
		// knocked over: not in occ, nothing to open
		b.state = "destroyed";
		b.hp = 0;
		b.fuel = 0;
		return;
	}
	if (b.pre && !b.pre->gone) return ruin(b); // M7a: a pre-built piece falls to a ruin in place
	for (Building *o : braziers)
		if (o->attach == b.id && o->state != "destroyed") destroy(*o); // its deck goes
	const bool closed = b.state != "foundation";
	const bool wasDone = b.state == "done" || b.state == "damaged";
	// M6c: a store or chest that falls leaves its contents in a pile (burnt: fire spoils half the goods)
	if (b.hold && !empty(*b.hold)) {
		host.spill(b.x, b.y, *b.hold, b.burn > 0);
		if (b.def->store || b.def->chest) b.hold = Hold{};
		else b.hold.reset();
	}
	b.state = "destroyed";
	b.hp = 0;
	b.prev.reset();
	b.burn = 0;
	b.rubble = closed && !b.def->wall.empty() && !razed; // a breach (a piece its own team takes down leaves none)
	lowerDeck(b);
	for (size_t i = 0; i < b.ti.size(); i++) {
		const int t = b.ti[i];
		occ[t] = -1;
		if (closed && double(grid.cost[t]) == 0) setCost(grid, t, at_or_nan(b.saved, i));
		if (b.rubble && double(grid.cost[t]) > 0) setCost(grid, t, double(grid.cost[t]) * FIRE().rubble);
		grid.gate[t] = 0;
		grid.span[t] = 0;
		grid.narrow[t] = 0;
	}
	if (!b.def->field.empty() && wasDone) {
		for (size_t i = 0; i < b.ti.size(); i++) setCost(grid, b.ti[i], at_or_nan(b.saved, i)), grid.trench[b.ti[i]] = 0; // filled, or the stakes broken
		fields--;
	}
	if (closed) grid.dirty.insert(grid.dirty.end(), b.tiles.begin(), b.tiles.end());
	if (b.bridge && wasDone) host.fall(b.ti); // the deck collapses under the men on it
	if (b.node >= 0) nodes[b.node].amount = nodes[b.node].max = nodes[b.node].regrow = 0;
	if (wasDone && b.def->influence > 0) repaint();
	if (b.def->store) storeVer++;
}

void Works::ruin(Building &b, bool spill) {
	Pre &p = *b.pre;
	for (Building *o : braziers)
		if (o->attach == b.id && o->state != "destroyed") destroy(*o);
	const bool wasDone = b.state == "done" || b.state == "damaged" || !!b.prev;
	if (b.hold && !empty(*b.hold)) {
		if (spill) {
			Hold out;
			for (const Lot &l : b.hold->lots) {
				Lot k = l;
				k.n = l.n * E().RUIN.spill;
				if (k.n > 1e-9) out.lots.push_back(k);
			}
			out.items = b.hold->items;
			host.spill(b.x, b.y, out, b.burn > 0);
		}
		b.hold = new_hold();
	}
	b.state = "destroyed";
	b.hp = 0;
	b.prev.reset();
	b.burn = 0;
	b.rubble = true;
	b.mend = false;
	b.credit = 0;
	p.ruin = true;
	lowerDeck(b);
	for (size_t i = 0; i < b.ti.size(); i++) {
		const int t = b.ti[i];
		const double g = at_or_nan(p.ground, i);
		setCost(grid, t, g > 0 ? g * E().RUIN.slow : 0);
		grid.gate[t] = 0;
		grid.span[t] = 0;
		grid.narrow[t] = 0;
	}
	b.saved.clear();
	for (int t : b.ti) b.saved.push_back(grid.cost[t]);
	grid.dirty.insert(grid.dirty.end(), b.tiles.begin(), b.tiles.end());
	for (Worker *u : active)
		if (u->wsite == b.id) leave(*u);
	if (b.node >= 0) nodes[b.node].amount = nodes[b.node].max = nodes[b.node].regrow = 0;
	b.node = -1;
	if (wasDone && b.def->influence > 0) repaint();
	if (b.def->store) storeVer++;
	if (spill) host.razed(b, b.lastBy);
}

void Works::razeNow(Building &b) {
	b.raze = 0;
	if (b.state != "done" && b.state != "damaged") return; // burnt or battered down meanwhile
	// a store's goods move to the next store of its network (items alone fall as a pile)
	std::vector<Lot> lots;
	if (b.hold) lots = b.hold->lots;
	if (b.hold) {
		Hold kept;
		kept.items = b.hold->items;
		b.hold = kept;
	}
	destroy(b, true);
	b.cancelled = true;
	// after it is gone: a store taken down refunds into the next store of the network, not into itself
	for (const Lot &l : lots) add_at(b.team, b.x, b.y, l.r, l.n, l.o);
	for (const auto &e : b.cost.kv)
		if (e.second > 0) add_at(b.team, b.x, b.y, e.first, e.second * E().DEMOLISH.refund);
}

void Works::damage(int id, double dmg, int by) {
	if (id < 0 || id >= int(buildings.size())) return;
	Building &b = buildings[id];
	if (b.state == "destroyed" || host.immune(b)) return;
	if (by >= 0) b.lastBy = by;
	b.hp -= dmg;
	if (b.hp <= 0) destroy(b);
	else if (b.state == "done" && b.hp < b.maxHp / 2) b.state = "damaged";
}

// --- fire (M2c) ---
double Works::wetK(const Building &b) const { return b.wet > tick_ ? FORT().wet : 1; }
bool Works::canBurn(const Building *b) const { return !!b && b->def->burnable && !b->cancelled && b->state != "destroyed" && b->state != "foundation"; }
void Works::ignite(Building &b) {
	if (b.burn > 0) return;
	b.burn = FIRE().start;
	burning.push_back(&b);
}

std::vector<Building *> Works::besides(const Building &b) {
	std::set<int> ids; // sorted below
	for (int t : b.ti) {
		const int x = t % w, y = t / w;
		for (const auto &e : DIRS) {
			const int nx = x + e[0], ny = y + e[1];
			if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
			const int o = occ[ny * w + nx];
			if (o >= 0 && o != b.id) ids.insert(o);
		}
	}
	std::vector<Building *> out;
	for (int i : ids) out.push_back(&buildings[i]);
	return out;
}

void Works::fireTick() {
	if (burning.empty()) return;
	const bool spread = tick_ % 10 == 0;
	const std::vector<Building *> now = burning;
	for (Building *b : now) {
		if (b->burn <= 0 || b->state == "destroyed") continue;
		b->burn = std::min(1.0, b->burn + FIRE().grow * DT);
		damage(b->id, (b->burn * b->maxHp * DT) / FIRE().life);
		if (!spread || b->burn < FIRE().spreadMin || b->state == "destroyed") continue;
		for (Building *o : besides(*b))
			if (canBurn(o) && o->burn <= 0 && host.chance(FIRE().spread * b->burn * wetK(*o))) ignite(*o);
	}
	for (int i = int(burning.size()) - 1; i >= 0; i--)
		if (burning[i]->burn <= 0 || burning[i]->state == "destroyed") {
			burning[i]->burn = 0;
			burning.erase(burning.begin() + i);
		}
}

// --- siege ladders (M2c) ---
int Works::ladder_foot(int team, int x, int y) const {
	if (x < 0 || y < 0 || x >= w || y >= h) return -1;
	if (occ[y * w + x] < 0) return -1;
	const Building &o = buildings[occ[y * w + x]];
	if (o.team == team || !o.def->walk || !o.def->access.empty() || !o.decked || (o.state != "done" && o.state != "damaged")) return -1;
	int best = -1;
	double bs = INF;
	const double ix = o.inside[0] - x - 0.5, iy = o.inside[1] - y - 0.5;
	double il = js::hypot(ix, iy);
	if (il == 0 || std::isnan(il)) il = 1;
	for (const auto &e : DIRS) {
		const int nx = x + e[0], ny = y + e[1];
		if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
		const int t = ny * w + nx;
		if (double(grid.cost[t]) == 0 || occ[t] >= 0 || grid.deck[t] != 0 || grid.gate[t]) continue;
		const double sc = (e[0] * ix + e[1] * iy) / il; // most outward
		if (sc < bs) bs = sc, best = t;
	}
	return best;
}

// --- workers ---
double Works::near2(const std::vector<int> &tiles, double x, double y) const {
	double best = INF;
	for (size_t i = 0; i + 1 < tiles.size(); i += 2) best = std::min(best, sq2(tiles[i] + 0.5 - x) + sq2(tiles[i + 1] + 0.5 - y));
	return best;
}
bool Works::at(const std::vector<int> &tiles, const Worker &u) const { return near2(tiles, u.x, u.y) <= AT * AT; }

std::pair<double, double> Works::spot(const std::vector<int> &tiles, const Worker &u, double cx, double cy) const {
	std::set<int> inside; // membership only
	for (size_t i = 0; i + 1 < tiles.size(); i += 2) inside.insert(tiles[i + 1] * w + tiles[i]);
	std::vector<int> ring;
	for (size_t i = 0; i + 1 < tiles.size(); i += 2)
		for (int dy = -1; dy <= 1; dy++)
			for (int dx = -1; dx <= 1; dx++) {
				const int x = tiles[i] + dx, y = tiles[i + 1] + dy;
				if (x < 0 || y < 0 || x >= w || y >= h) continue;
				const int t = y * w + x;
				if (inside.count(t) || double(grid.cost[t]) == 0 || (grid.gate[t] && grid.gate[t] != u.squad->team + 1) || has(ring, t)) continue;
				ring.push_back(t);
			}
	if (ring.empty()) return { cx, cy };
	const auto d = [&](int a) { return sq2(double(a % w) + 0.5 - u.x) + sq2(double(a / w) + 0.5 - u.y); };
	std::sort(ring.begin(), ring.end(), [&](int a, int b) {
		const double k = d(a) - d(b);
		if (k != 0) return k < 0;
		return a < b;
	});
	const int t = ring[size_t(u.id % std::min(int(ring.size()), 3))];
	return { double(t % w) + 0.5, double(t / w) + 0.5 };
}

Act Works::walkTo(Worker &u, double x, double y) {
	if (std::abs(x - u.wgx) > 0.5 || std::abs(y - u.wgy) > 0.5) {
		u.wgx = x;
		u.wgy = y;
		u.wpath.clear();
		if (!u.wreq) {
			u.wreq = true;
			pathQueue.push_back(&u);
		}
	}
	if (!u.wpath.empty()) {
		while (u.wpi < int(u.wpath.size()) / 2 - 1 && js::hypot(u.wpath[u.wpi * 2] - u.x, u.wpath[u.wpi * 2 + 1] - u.y) < 0.4) u.wpi++;
		return Act::at(u.wpath[u.wpi * 2], u.wpath[u.wpi * 2 + 1]);
	}
	return Act::at(x, y);
}

std::vector<Building *> Works::stores(int team) {
	std::vector<Building *> out;
	for (Building &b : buildings)
		if (b.team == team && b.def->store && (b.state == "done" || b.state == "damaged")) out.push_back(&b);
	return out;
}

Building *Works::nearestStore(const Worker &u) {
	Building *best = nullptr;
	double bd = INF;
	for (Building *b : stores(u.squad->team)) {
		const double d = near2(b->tiles, u.x, u.y);
		if (d < bd) bd = d, best = b;
	}
	return best;
}

void Works::leave(Worker &u) {
	if (u.wsite < 0) return;
	Building &b = buildings[u.wsite];
	b.users--;
	if (u.wslot >= 0) b.slotUser[u.wslot] = -1;
	u.wsite = u.wslot = -1;
}

void Works::dropRefunded(Worker &u) {
	if (u.wfor >= 0 && buildings[u.wfor].cancelled) {
		u.carry.clear();
		u.load = 0;
		u.wfor = -1;
	}
}

void Works::release(Worker &u) {
	if (u.wnode >= 0) nodes[u.wnode].users--;
	leave(u);
	dropRefunded(u);
	if (u.wfor >= 0 && !u.carry.empty()) subKey(buildings[u.wfor].incoming, u.carry, u.load);
	u.wnode = u.wfor = -1;
	u.working = false;
	unwait(u);
}

void Works::set_job(Worker &u, const std::string &job) {
	release(u);
	cutOff.erase(u.id);
	u.job = job;
	if (!job.empty()) activeAdd(&u);
	else activeDelete(&u);
	u.wgx = u.wgy = -1;
	u.wpath.clear();
}

void Works::takeNode(Worker &u, Node &n) {
	if (u.wnode >= 0) nodes[u.wnode].users--;
	u.wnode = n.id;
	n.users++;
}

bool Works::holds(int team) const {
	const auto &cps = region.claimPoints;
	if (!cps.empty()) {
		for (size_t z = 0; z < cps.size(); z++)
			if (zoneTeam(int(z)) == team) return true;
		return false;
	}
	for (const Claim &c : claims)
		if (c.team == team) return true;
	return false;
}

bool Works::shut(const Node &n, int team, const std::string &owner) const {
	return n.locked || (n.rare && !holds(team)) || (n.building && !buildings[*n.building].owner.empty() && !may_use(buildings[*n.building], owner, team));
}

Works::Node *Works::findNode(const std::string &res, double x, double y, double r, int first, int team, const std::string &owner) {
	Node *f = first >= 0 && first < int(nodes.size()) ? &nodes[first] : nullptr;
	if (f && f->res == res && f->amount >= 1 && f->users < f->slots && !shut(*f, team, owner)) return f;
	Node *best = nullptr;
	double bd = r * r;
	for (Node &n : nodes) {
		if (n.res != res || n.amount < 1 || n.users >= n.slots || shut(n, team, owner)) continue;
		const double d = sq2(n.x - x) + sq2(n.y - y);
		if (d < bd) bd = d, best = &n;
	}
	return best;
}

Act Works::deliver(Worker &u) {
	const std::optional<CartDrop> c = host.cartDrop(*u.squad);
	Building *s = c ? nullptr : nearestStore(u);
	if (!c && !s) return Act::none();
	if (c) {
		if (js::hypot(c->x - u.x, c->y - u.y) > data().trade.CART.reach) return walkTo(u, c->x, c->y);
	} else if (!at(s->tiles, u))
		return walkTo(u, spot(s->tiles, u, s->x, s->y));
	Hold &st = c ? *c->hold : *s->hold;
	const std::string &o = region.id;
	// W-215: on a cart, as far as it has room; what will not go on stays in his arms until the squad takes the cart up
	const double off = c ? std::min(u.load, std::max(0.0, c->room) * E().CARRY) : u.load;
	const Node *n = u.wnode >= 0 && u.wnode < int(nodes.size()) ? &nodes[u.wnode] : nullptr;
	Building *farm = n && n->building ? &buildings[*n->building] : nullptr;
	if (!u.carry.empty()) {
		// W-89: the owner of the farm or press keeps his share, in the building's own hold
		const double *gm = u.gmul ? u.gmul->find(u.carry) : nullptr;
		const double got = off * (gm ? *gm : 1);
		const double cut = farm && !farm->owner.empty() && farm->share > 0 && farm->owner != u.squad->owner ? got * farm->share : 0;
		if (cut > 0) pay_till(*farm, u.carry, cut, o);
		put(st, u.carry, got - cut, o);
	}
	// M5h: Herb Finder (forest and marsh nodes), Weaver (farms)
	if (u.herbs && n && n->obj) {
		const int t = grid.tile_at(n->x, n->y);
		if (t >= 0 && (region.terrain[t] == T_FOREST || region.terrain[t] == T_MARSH)) put(st, "herbs", off * SHARE_HERBS, o);
	}
	if (u.flax && n && n->building && buildings[*n->building].type == "farm") put(st, "flax", off * SHARE_FLAX, o);
	if (u.carry == "wood" && n && n->obj && E().PINES.count(region.objects[*n->obj].id)) put(st, "pitch", off * E().KILN.fromPine, o);
	if (off < u.load - 1e-6) {
		u.load -= off;
		return Act::here();
	}
	u.carry.clear();
	u.load = 0;
	return Act::here();
}

Act Works::gather(Worker &u) {
	Node *n = u.wnode >= 0 ? &nodes[u.wnode] : nullptr;
	if (u.load > 0 && (u.load >= E().CARRY - 1e-6 || (n && u.carry != n->res))) return deliver(u);
	if (n && shut(*n, u.squad->team, u.squad->owner)) {
		// a guard lair came back (or the region was lost: a rare node): off this node
		n->users--;
		u.wnode = -1;
		n = nullptr;
	}
	if (!n || n->amount < 1) {
		Node *from = n ? n : (u.squad->node >= 0 && u.squad->node < int(nodes.size()) ? &nodes[u.squad->node] : nullptr);
		Node *next = from ? findNode(from->res, from->x, from->y, NEAR_NODE, u.squad->node, u.squad->team, u.squad->owner) : nullptr;
		if (!next) {
			if (u.wnode >= 0) nodes[u.wnode].users--, u.wnode = -1;
			return u.load > 0 ? deliver(u) : Act::none();
		}
		takeNode(u, *next);
		n = next;
	}
	if (!at(n->tiles, u)) return walkTo(u, spot(n->tiles, u, n->x, n->y));
	const double take = std::min({ n->rate * DT * (u.wrate ? *u.wrate : 1), n->amount, E().CARRY - u.load });
	n->amount -= take;
	u.carry = n->res;
	u.load += take;
	u.working = true;
	u.facing = js::atan2(n->y - u.y, n->x - u.x);
	if (n->amount < 1e-6 && n->regrow == 0) {
		n->amount = 0;
		const int t = grid.tile_at(n->x, n->y);
		if (t >= 0 && nodeAt[t] == n->id) nodeAt[t] = -1;
	}
	return Act::here();
}

bool Works::unfinished(const Building &b) const {
	return b.state == "foundation" || b.state == "scaffold" || ((b.state == "damaged" || b.mend) && b.state != "destroyed" && b.hp < b.maxHp);
}

Cost Works::fullCost(const Building &b) {
	const double k = b.def->perTile ? double(b.ti.size()) : 1;
	Cost out;
	const double c = host.repairK(b).cost;
	for (const auto &e : b.def->cost.kv) out.set(e.first, e.second * k * E().REPAIR.cost * c);
	return out;
}

Act Works::mendTick(Worker &u, Building &b) {
	if (b.credit <= 1e-9) {
		if (!take_at(b.team, b.x, b.y, fullCost(b))) return Act::here(); // waiting for materials
		b.credit += b.maxHp * E().REPAIR.step;
	}
	u.working = true;
	const double k = b.def->perTile ? double(b.ti.size()) : 1;
	const double rate = DT * (u.brate ? *u.brate : 1) * host.repairK(b).speed;
	double den = b.def->labour * k * E().REPAIR.labour;
	if (den == 0 || std::isnan(den)) den = 1;
	const double full = ((b.maxHp * E().REPAIR.step) / den) * rate;
	const double add = std::min({ b.credit, b.maxHp - b.hp, full });
	if (add > 0) host.laboured(u, b, (rate * add) / full);
	b.hp += add;
	b.credit -= add;
	if (b.state == "damaged" && b.hp >= b.maxHp / 2) b.state = "done";
	if (b.hp >= b.maxHp - 1e-6) {
		b.hp = b.maxHp;
		b.mend = false;
	}
	return Act::here();
}

bool Works::slotOk(const Building &b, int k) const { return k >= 0 && k < int(b.slots.size()) && standable(b.slots[k], b.team); }

int Works::freeSlot(const Building &b, const Worker &u) const {
	int best = -1;
	double bd = INF;
	for (int k = 0; k < int(b.slots.size()); k++) {
		if (b.slotUser[k] >= 0 || !slotOk(b, k)) continue;
		const int t = b.slots[k];
		const double d = sq2(double(t % w) + 0.5 - u.x) + sq2(double(t / w) + 0.5 - u.y);
		if (d < bd) bd = d, best = k;
	}
	return best;
}

std::optional<std::pair<Building *, int>> Works::pickSite(Worker &u) {
	std::optional<std::pair<Building *, int>> best;
	double bd = INF;
	for (int id : u.squad->sites) {
		if (id < 0 || id >= int(buildings.size())) continue;
		Building &b = buildings[id];
		if (b.team != u.squad->team || !unfinished(b) || b.users >= int(b.slots.size()) || isCut(u, id) || !ready(b)) continue;
		const double d = near2(b.tiles, u.x, u.y);
		if (d >= bd) continue;
		const int k = freeSlot(b, u);
		if (k >= 0) bd = d, best = std::make_pair(&b, k);
	}
	return best;
}

Act Works::wait(Worker &u) {
	Building *site = nullptr;
	double bd = INF;
	for (int id : u.squad->sites) {
		if (id < 0 || id >= int(buildings.size())) continue;
		Building &b = buildings[id];
		if (b.team != u.squad->team || !unfinished(b) || isCut(u, id)) continue;
		const double d = near2(b.tiles, u.x, u.y);
		if (d < bd) bd = d, site = &b;
	}
	if (!site) return Act::none();
	auto it = waits.find(u.id);
	if (it == waits.end() || it->second[0] != site->id) {
		// a free spot round the site (golden-angle spread by worker id, two rings) with a clear walk to one of its slots;
		// none: back to the squad
		unwait(u);
		std::array<double, 3> p{ double(site->id), -1, -1 };
		for (int i = 0; i < 24 && p[1] < 0; i++) {
			const double a = u.id * 2.399963 + i * 0.52, r = std::max(site->w, site->h) / 2 + WAIT_OFF + (i >= 12 ? 1.5 : 0);
			const double x = std::floor(site->x + js::cos(a) * r), y = std::floor(site->y + js::sin(a) * r);
			if (x < 0 || y < 0 || x >= w || y >= h || waitAt.count(int(y) * w + int(x)) || !standable(int(y) * w + int(x), site->team)) continue;
			for (int t : site->slots)
				if (grid.line_clear(x + 0.5, y + 0.5, double(t % w) + 0.5, double(t / w) + 0.5)) {
					p = { double(site->id), x + 0.5, y + 0.5 };
					waitAt.insert(int(y) * w + int(x));
					break;
				}
		}
		waits[u.id] = p;
		it = waits.find(u.id);
	}
	const std::array<double, 3> p = it->second;
	if (p[1] < 0) return Act::none();
	return sq2(u.x - p[1]) + sq2(u.y - p[2]) <= 0.25 ? Act::here() : walkTo(u, p[1], p[2]);
}

Act Works::toSlot(Worker &u, Building &b) {
	const auto pos = [&](int k) { return std::pair<double, double>{ double(b.slots[k] % w) + 0.5, double(b.slots[k] / w) + 0.5 }; };
	const auto [sx, sy] = pos(u.wslot);
	const double d2 = sq2(u.x - sx) + sq2(u.y - sy);
	if (d2 <= AT_SLOT * AT_SLOT) return Act::here();
	const int n = int(u.wpath.size()) / 2;
	const bool ended = n > 0 && !u.wreq && u.wgx == sx && u.wgy == sy && u.wpi >= n - 1 && js::hypot(u.wpath[n * 2 - 2] - u.x, u.wpath[n * 2 - 1] - u.y) <= AT_SLOT;
	if (!ended) return walkTo(u, sx, sy);
	if (!at(b.tiles, u)) {
		// no way to the site from here (another level, cut off): leave it to others; a load for it goes back to the store
		cut(u, b.id);
		if (u.wfor == b.id && !u.carry.empty()) subKey(b.incoming, u.carry, u.load), u.wfor = -1;
		leave(u);
		return Act::none();
	}
	const int k = freeSlot(b, u);
	if (k < 0) return Act::here();
	const auto [kx, ky] = pos(k);
	if (sq2(u.x - kx) + sq2(u.y - ky) >= d2) return Act::here();
	b.slotUser[u.wslot] = -1;
	b.slotUser[k] = u.id;
	u.wslot = k;
	return walkTo(u, kx, ky);
}

void Works::detour(Worker &u) {
	if (u.job != "build" || u.wpath.size() < 4) return;
	const auto it = waits.find(u.id);
	const bool waiting = u.wsite < 0 && it != waits.end() && it->second[1] == u.wgx && it->second[2] == u.wgy;
	Building *b = u.wsite >= 0 ? &buildings[u.wsite] : waiting ? &buildings[int(it->second[0])] : nullptr;
	if (!b || (!waiting && near2(b->tiles, u.wgx, u.wgy) > AT * AT)) return;
	double len = 0;
	for (size_t i = 2; i < u.wpath.size(); i += 2) len += js::hypot(u.wpath[i] - u.wpath[i - 2], u.wpath[i + 1] - u.wpath[i - 1]);
	if (len <= DETOUR * js::hypot(u.wgx - u.x, u.wgy - u.y) + DETOUR_PAD) return;
	cut(u, b->id);
	if (waiting) unwait(u);
	else {
		if (u.wfor == b->id && !u.carry.empty()) subKey(b->incoming, u.carry, u.load), u.wfor = -1;
		leave(u);
	}
	u.wgx = u.wgy = -1;
	u.wpath.clear();
}

Act Works::build(Worker &u) {
	Building *b = u.wsite >= 0 ? &buildings[u.wsite] : nullptr;
	if (b && (!unfinished(*b) || !slotOk(*b, u.wslot) || b->team != u.squad->team)) {
		leave(u);
		b = nullptr;
	}
	if (!b) {
		const auto pick = pickSite(u);
		if (!pick) return u.load > 0 && u.wfor < 0 ? deliver(u) : wait(u);
		const int k = pick->second;
		b = pick->first;
		u.wsite = b->id;
		u.wslot = k;
		b->slotUser[k] = u.id;
		b->users++;
		unwait(u);
	}
	if (u.load > 0) {
		if (u.wfor != b->id) {
			if (u.wfor >= 0 && !u.carry.empty()) subKey(buildings[u.wfor].incoming, u.carry, u.load);
			u.wfor = -1;
			return deliver(u);
		}
		const Act go = toSlot(u, *b);
		if (go.kind != Act::HERE) return go;
		const std::string r = u.carry;
		b->delivered.set(r, b->delivered.get(r) + u.load);
		subKey(b->incoming, r, u.load);
		u.carry.clear();
		u.load = 0;
		u.wfor = -1;
		return Act::here();
	}
	if (b->mend) {
		const Act go = toSlot(u, *b);
		if (go.kind != Act::HERE) return go;
		u.facing = js::atan2(b->y - u.y, b->x - u.x);
		return mendTick(u, *b);
	}
	// fetch what the site still lacks from a store of its network that has it (M6a; the strongroom through any of them)
	if (b->state != "damaged") {
		// a site outside every network (a far bridge ramp): the network of the store nearest the worker
		int sn = storeNet(*b);
		if (sn < 0) {
			Building *ns = nearestStore(u);
			sn = storeNet(ns ? *ns : *b);
		}
		const std::vector<Building *> net = netStores(b->team, sn);
		Hold &room = reserve_of(b->team);
		const std::vector<std::pair<std::string, double>> costs = b->cost.kv;
		for (const auto &e : costs) {
			const std::string &r = e.first;
			const double lack = e.second - b->delivered.get(r) - b->incoming.get(r);
			if (lack < 1e-6) continue;
			const bool inRoom = amount(room, r) > 1e-6;
			Building *s = nullptr;
			double sd = INF;
			for (Building *o : net) {
				const double d = near2(o->tiles, u.x, u.y);
				if (d < sd && (inRoom || amount(*o->hold, r) > 1e-6)) sd = d, s = o;
			}
			if (!s) continue;
			if (!at(s->tiles, u)) return walkTo(u, spot(s->tiles, u, s->x, s->y));
			double got = 0;
			for (Hold *hd : { &*s->hold, &room })
				for (const Lot &l : take(*hd, r, std::min(E().CARRY, lack) - got)) got += l.n;
			if (got < 1e-9) continue;
			b->incoming.set(r, b->incoming.get(r) + got);
			u.carry = r;
			u.load = got;
			u.wfor = b->id;
			return Act::here();
		}
	}
	const Act go = toSlot(u, *b);
	if (go.kind != Act::HERE) return go;
	u.facing = js::atan2(b->y - u.y, b->x - u.x);
	if (b->state == "damaged") {
		u.working = true;
		const double rate = DT * (u.brate ? *u.brate : 1) * host.repairK(*b).speed;
		host.laboured(u, *b, rate);
		b->hp = std::min(b->maxHp, b->hp + (b->maxHp / b->need) * rate);
		if (b->hp >= b->maxHp / 2) b->state = "done";
		return Act::here();
	}
	const double cap = b->need * deliveredShare(*b);
	if (b->labour >= cap) return Act::here(); // waiting for materials
	u.working = true;
	if (b->state == "foundation") {
		b->state = "scaffold";
		if (b->def->field.empty()) close(*b); // M5h3: a field tile never closes
	} else if (b->saved.size() < b->ti.size() && b->def->field.empty())
		close(*b); // an upgrade's new inner row
	const double was = b->labour;
	b->labour = std::min(cap, b->labour + DT * (u.brate ? *u.brate : 1));
	if (b->labour > was) host.laboured(u, *b, b->labour - was);
	b->hp = b->prev ? b->prev->hp + (b->maxHp - b->prev->hp) * (b->labour / b->need) : b->maxHp * std::max(0.1, b->labour / b->need);
	if (b->labour >= b->need - 1e-9) finish(*b);
	return Act::here();
}

// --- M7a: the region's pre-built pieces, done at the start (state, hp share), owned by `fallback` until someone holds them ---
std::string Works::regionGood() const {
	std::vector<std::pair<std::string, double>> by; // a JS Map: insertion order
	for (const Node &n : nodes)
		if (n.obj) {
			auto it = std::find_if(by.begin(), by.end(), [&](const auto &e) { return e.first == n.res; });
			if (it == by.end()) by.emplace_back(n.res, n.max);
			else it->second += n.max;
		}
	std::string best = "food";
	double bv = 0;
	for (const auto &e : by)
		if (e.second > bv) bv = e.second, best = e.first;
	return best;
}

void Works::raise(Building &b) {
	Pre &p = *b.pre;
	for (size_t i = 0; i < b.ti.size(); i++) setCost(grid, b.ti[i], at_or_nan(p.ground, i));
	p.ruin = false;
	b.rubble = false;
	b.saved.clear();
	b.state = "scaffold";
	close(b);
	finish(b);
	b.lastBy = -1;
}

void Works::prebuild(int start) {
	fallback_ = start;
	const std::string good = regionGood();
	for (size_t i = 0; i < region.prebuilt.size(); i++) {
		const PrebuiltEntry &e = region.prebuilt[i];
		if (!E().BUILDINGS.count(e.type)) continue;
		const BuildingDef &def = building(e.type);
		const int rot = e.rot;
		const auto fwh = rotated(e.type, rot);
		const std::vector<int> tiles = !e.tiles.empty() ? e.tiles : rect_tiles(e.x, e.y, fwh[0], fwh[1]);
		bool skip = false;
		for (size_t k = 0; k + 1 < tiles.size(); k += 2)
			if (tiles[k] < 0 || tiles[k + 1] < 0 || tiles[k] >= w || tiles[k + 1] >= h || occ[tiles[k + 1] * w + tiles[k]] >= 0) {
				skip = true; // off the map or on another piece: skipped
				break;
			}
		if (skip) continue;
		Building &b = buildings[add(start, e.type, tiles, rot)];
		int zone = e.claim ? *e.claim : -1;
		if (zone < 0) {
			zone = -1;
			for (size_t z = 0; z < region.claimPoints.size(); z++) {
				const WorksClaimPoint &c = region.claimPoints[z];
				if (sq2(c.x - b.x) + sq2(c.y - b.y) <= sq2(c.r ? *c.r : E().CLAIM_RADIUS)) {
					zone = int(z);
					break;
				}
			}
		}
		b.pre = Pre{ int(i), zone, e.landmark, false, false, {}, 0, 0 };
		b.delivered = b.cost;
		b.state = "scaffold";
		close(b);
		b.pre->ground = b.saved;
		b.labour = b.need;
		finish(b);
		if (e.maxHp) b.maxHp = e.maxHp; // M7d: a landmark piece's own (the keep's 8000)
		b.hp = b.maxHp * (e.hp ? *e.hp : (e.landmark ? 0.6 : 1));
		if (b.hp < b.maxHp / 2) b.state = "damaged";
		if (def.cache) put(*b.hold, good, def.cache * E().CARRY, region.id);
		if (e.state == "ruined") ruin(b, false);
		prebuilt_.push_back(&b);
	}
	owners();
}

// --- the API ---
void Works::set_fallback(int team) {
	if (fallback_ == team) return;
	fallback_ = team;
	owners();
}

std::vector<int> Works::near(double x, double y, double r) const {
	std::vector<int> out;
	for (double ty = std::max(0.0, std::floor(y - r)); ty <= std::min(double(h - 1), std::floor(y + r)); ty++)
		for (double tx = std::max(0.0, std::floor(x - r)); tx <= std::min(double(w - 1), std::floor(x + r)); tx++) {
			const int b = occ[size_t(ty) * w + size_t(tx)];
			if (b >= 0 && sq2(tx + 0.5 - x) + sq2(ty + 0.5 - y) <= r * r && !has(out, b)) out.push_back(b);
		}
	return out;
}

void Works::reset_landmark() {
	for (Building *bp : prebuilt_) {
		Building &b = *bp;
		if (!b.pre || !b.pre->landmark || b.pre->gone) continue;
		if (b.pre->ruin && !(b.pre->i < int(region.prebuilt.size()) && region.prebuilt[b.pre->i].state == "ruined")) raise(b), b.hp = b.maxHp * 0.6;
		if (b.state == "destroyed") continue;
		b.hp = std::max(b.hp, b.maxHp * 0.6);
		if (b.state == "damaged" && b.hp >= b.maxHp / 2) b.state = "done";
	}
}

void Works::landmark_capture(double share) {
	for (Building *bp : prebuilt_) {
		Building &b = *bp;
		if (!b.pre || !b.pre->landmark || b.pre->ruin || b.state == "destroyed") continue;
		if (b.def->wall == "gate") {
			ruin(b, false);
			continue;
		}
		b.hp = std::min(b.hp, b.maxHp * share);
		if (b.state == "done" && b.hp < b.maxHp / 2) b.state = "damaged";
	}
}

bool Works::landmark_restore(int team, const Cost &cost, double x, double y) {
	if (!take_at(team, x, y, cost)) return false;
	for (Building *bp : prebuilt_) {
		Building &b = *bp;
		if (!b.pre || !b.pre->landmark || b.pre->gone) continue;
		if (b.pre->ruin) raise(b);
		else if (b.state == "done" || b.state == "damaged") {
			b.hp = b.maxHp;
			b.state = "done";
		}
		b.mend = false;
		b.credit = 0;
	}
	return true;
}

std::vector<PreRow> Works::pre_rows() const {
	std::vector<PreRow> out;
	for (const Building *b : prebuilt_) out.push_back(PreRow{ b->pre->i, js::round(b->hp), b->pre->ruin, b->pre->gone, b->team });
	return out;
}

void Works::load_pre_rows(const std::vector<PreRowIn> &rows) {
	std::map<int, Building *> at; // lookup only (a later piece of the same index wins, as new Map does)
	for (Building *b : prebuilt_) at[b->pre->i] = b;
	for (const PreRowIn &r : rows) {
		const auto it = at.find(r.i);
		if (it == at.end() || it->second->pre->gone) continue;
		Building &b = *it->second;
		if (r.gone) {
			b.pre->gone = true;
			destroy(b);
			continue;
		}
		if (r.ruin) {
			if (!b.pre->ruin) ruin(b, false);
			continue;
		}
		if (b.pre->ruin) raise(b); // authored a ruin, left raised (a restore or a rebuild): it stands again
		b.hp = std::max(1.0, std::min(b.maxHp, r.hp));
		b.state = b.hp < b.maxHp / 2 ? "damaged" : "done";
	}
}

bool Works::mend(int id, int team) {
	if (id < 0 || id >= int(buildings.size())) return false;
	Building &b = buildings[id];
	if (b.cancelled || b.team != team || (b.state != "done" && b.state != "damaged") || b.prev || b.hp >= b.maxHp || b.def->brazier) return false;
	b.mend = true;
	return true;
}

bool Works::rebuild(int id, int team, int mobTeam) {
	if (id < 0 || id >= int(buildings.size())) return false;
	Building &b = buildings[id];
	if (!b.pre || !b.pre->ruin || b.pre->gone || b.pre->landmark || b.team != team || team == E().NEUTRAL_TEAM || team == mobTeam) return false;
	Pre &p = *b.pre;
	for (size_t i = 0; i < b.ti.size(); i++) setCost(grid, b.ti[i], at_or_nan(p.ground, i));
	grid.dirty.insert(grid.dirty.end(), b.tiles.begin(), b.tiles.end());
	b.saved.clear();
	p.ruin = false;
	b.rubble = false;
	const double k = b.def->perTile ? double(b.ti.size()) : 1;
	b.cost = Cost{};
	b.costSum = 0;
	for (const auto &e : b.def->cost.kv) b.cost.set(e.first, e.second * k * E().RUIN.rebuild), b.costSum += e.second * k * E().RUIN.rebuild;
	b.need = b.def->labour * k * E().RUIN.rebuild;
	b.labour = 0;
	b.delivered = Cost{};
	b.incoming = Cost{};
	b.state = "foundation";
	b.hp = b.maxHp * 0.1;
	b.lastBy = -1;
	if (b.def->store || b.def->cache) b.hold = new_hold();
	b.slots = workSlots(b);
	b.slotUser.assign(b.slots.size(), -1);
	b.users = 0;
	return true;
}

void Works::vanish(int id) {
	if (id < 0 || id >= int(buildings.size())) return;
	Building &b = buildings[id];
	if (!b.pre || b.pre->gone) return;
	b.pre->gone = true;
	destroy(b);
}

void Works::foul(int id, double foulT, std::optional<double> until) {
	if (id < 0 || id >= int(buildings.size()) || !buildings[id].pre) return;
	Pre &p = *buildings[id].pre;
	p.foulT = foulT;
	if (until) p.fouled = *until;
}

const BridgeLine *Works::bridge_at(int t) const {
	if (t < 0 || t >= w * h || occ[t] < 0) return nullptr;
	const Building &o = buildings[occ[t]];
	return o.bridge && o.decked ? &*o.bridge : nullptr;
}

void Works::finish_bridges(int team) {
	for (size_t i = 0; i < buildings.size(); i++) {
		Building &b = buildings[i];
		if (!b.bridge || b.team != team || (b.state != "foundation" && b.state != "scaffold")) continue;
		b.delivered = b.cost;
		if (b.state == "foundation") b.state = "scaffold", close(b);
		b.labour = b.need;
		finish(b);
	}
}

bool Works::finish_site(int id) {
	if (id < 0 || id >= int(buildings.size())) return false;
	Building &b = buildings[id];
	if (b.state != "foundation" && b.state != "scaffold") return false;
	b.delivered = b.cost;
	if (b.state == "foundation") b.state = "scaffold", close(b);
	b.labour = b.need;
	finish(b);
	return true;
}

void Works::set_teams(const std::vector<int> &ids, int team) {
	for (int id : ids)
		if (id >= 0 && id < int(buildings.size()) && !buildings[id].pre) setTeam(buildings[id], team);
	if (needPaint) needPaint = false, repaint();
}

void Works::claim(int team, double x, double y, std::optional<double> r, bool replace) {
	if (replace)
		for (int i = int(claims.size()) - 1; i >= 0; i--)
			if (claims[i].x == x && claims[i].y == y) claims.erase(claims.begin() + i);
	claims.push_back(Claim{ team, x, y, r ? *r : E().CLAIM_RADIUS });
	repaint();
}

void Works::add_stock(int team, const std::string &res, double n, const std::optional<std::pair<double, double>> &at) {
	if (at) {
		if (n >= 0) add_at(team, at->first, at->second, res, n);
		else {
			Cost c;
			c.set(res, -n);
			take_at(team, at->first, at->second, c);
		}
		return;
	}
	if (n >= 0) put(reserve_of(team), res, n, region.id);
	else take(reserve_of(team), res, -n);
}

Hold *Works::store_near(int team, double x, double y, double r) {
	Building *best = nullptr;
	double bd = r * r;
	for (Building *b : storeList) {
		if (b->team != team || !b->hold || !standing(*b) || !shared(*b)) continue;
		const double d = sq2(b->x - x) + sq2(b->y - y);
		if (d <= bd) bd = d, best = b;
	}
	return best && best->hold ? &*best->hold : nullptr;
}

bool Works::set_access(int id, const std::string &owner, const std::optional<std::string> &access, std::optional<double> share, std::optional<double> fee) {
	if (id < 0 || id >= int(buildings.size())) return false;
	Building &b = buildings[id];
	if (b.cancelled || owner.empty() || b.owner != owner || !hasTerms(b)) return false;
	if (access && !access->empty()) {
		if (b.access != *access && b.def->store) storeVer++;
		b.access = *access;
	}
	if (share) b.share = std::max(0.0, std::min(E().TERMS.share, *share));
	if (fee) b.fee = std::max(0.0, std::min(E().TERMS.fee, js::round(*fee)));
	return true;
}

std::vector<Hold *> Works::owned_holds(const std::string &owner) {
	std::vector<Hold *> out;
	for (Building &b : buildings)
		if (b.owner == owner && b.hold) out.push_back(&*b.hold);
	return out;
}

void Works::staff_scan(const std::vector<StaffMan> &men, int mob) {
	const int cw = (w >> STAFF_CELL) + 1;
	std::fill(staffHead.begin(), staffHead.end(), -1);
	if (staffNext.size() < men.size()) staffNext.assign(men.size() * 2, 0);
	for (size_t i = 0; i < men.size(); i++) {
		const StaffMan &u = men[i];
		if (!u.alive) continue;
		const int c = int32_t(int64_t(toInt32(u.y) >> STAFF_CELL) * cw + (toInt32(u.x) >> STAFF_CELL));
		if (c < 0 || c >= int(staffHead.size())) continue;
		staffNext[i] = staffHead[c];
		staffHead[c] = int32_t(i);
	}
	const double secs = E().STAFF.every * DT;
	for (Building &b : buildings) {
		const double lockMax = lock_of(*b.def);
		const bool mending = b.lock < lockMax;
		if (b.team == E().NEUTRAL_TEAM || b.team == mob || b.team < 0 || b.cancelled || (b.state != "done" && b.state != "damaged") || (!mending && !needs_person(b.type, *b.def))) {
			b.staff = false;
			continue;
		}
		const double r = E().STAFF.reach + std::max(b.w, b.h) / 2, r2 = E().STAFF.reach * E().STAFF.reach;
		const int x0 = int(std::max(0.0, std::floor(b.x - r))) >> STAFF_CELL, x1 = int(std::min(double(w - 1), std::ceil(b.x + r))) >> STAFF_CELL;
		const int y0 = int(std::max(0.0, std::floor(b.y - r))) >> STAFF_CELL, y1 = int(std::min(double(h - 1), std::ceil(b.y + r))) >> STAFF_CELL;
		int n = 0;
		for (int cy = y0; cy <= y1; cy++)
			for (int cx = x0; cx <= x1; cx++)
				for (int i = staffHead[cy * cw + cx]; i >= 0; i = staffNext[i]) {
					const StaffMan &u = men[i];
					if (u.team != b.team) continue;
					const double dx = std::max(std::abs(u.x - b.x) - b.w / 2, 0.0), dy = std::max(std::abs(u.y - b.y) - b.h / 2, 0.0);
					if (dx * dx + dy * dy <= r2) n++;
				}
		b.staff = n > 0;
		if (n > 0 && mending) b.lock = std::min(lockMax, b.lock + n * E().LOCK.perMan * secs); // his men at the door mend it
	}
}

std::pair<double, bool> Works::break_lock(int id, double men, double secs) {
	Building &b = buildings[id];
	b.lock = std::max(0.0, b.lock - men * E().LOCK.perMan * secs);
	const bool tell = tick_ - b.lockTold >= E().LOCK.tell;
	if (tell) b.lockTold = tick_;
	return { b.lock, tell };
}

int Works::store_net(int id) {
	if (id < 0 || id >= int(buildings.size())) return -1;
	Building &b = buildings[id];
	return b.def->store && standing(b) ? storeNet(b) : -1;
}

Hold *Works::hold_of(int id) {
	if (id < 0 || id >= int(buildings.size())) return nullptr;
	Building &b = buildings[id];
	return standing(b) && b.hold ? &*b.hold : nullptr;
}

bool Works::node_ok(int id, int team, const std::string &owner) const { return id >= 0 && id < int(nodes.size()) && nodes[id].max > 0 && !shut(nodes[id], team, owner); }

void Works::lock_nodes(const std::vector<int> &ids, bool on) {
	for (int id : ids)
		if (id >= 0 && id < int(nodes.size())) nodes[id].locked = on, nodes[id].hasLocked = true;
}

bool Works::site_ok(int id, int team) const { return id >= 0 && id < int(buildings.size()) && buildings[id].team == team && unfinished(buildings[id]); }

bool Works::cancel(int id) {
	if (id < 0 || id >= int(buildings.size())) return false;
	Building &b = buildings[id];
	if (b.state != "foundation" && b.state != "scaffold") return false;
	for (const auto &e : b.incoming.kv)
		if (e.second > 0) add_at(b.team, b.x, b.y, e.first, e.second);
	for (const auto &e : b.delivered.kv)
		if (e.second > 0) add_at(b.team, b.x, b.y, e.first, e.second * E().CANCEL_REFUND);
	b.incoming = Cost{};
	if (b.pre) {
		// M7a: a rebuild called off: the ruin lies again
		for (Worker *u : active)
			if (u->wsite == b.id) leave(*u);
		b.delivered = Cost{};
		ruin(b, false);
		return true;
	}
	if (b.prev) {
		// an upgrade: the old piece stands on as it was (its workers leave: it is no longer unfinished); a grown inner row goes
		const Building::Prev p = *b.prev;
		for (size_t i = 0; size_t(p.n) + i < b.ti.size(); i++) {
			const int t = b.ti[p.n + i];
			occ[t] = -1;
			if (size_t(p.n) + i < b.saved.size()) setCost(grid, t, b.saved[p.n + i]);
			grid.dirty.push_back(t % w);
			grid.dirty.push_back(t / w);
		}
		b.ti.resize(p.n);
		b.base.resize(p.n);
		b.saved.resize(std::min(b.saved.size(), size_t(p.n)));
		b.tiles.resize(std::min(b.tiles.size(), size_t(p.n) * 2));
		b.tilesVer++;
		bbox(b);
		const double hp = std::min(p.maxHp, b.hp);
		b.type = p.type;
		b.def = p.def;
		b.maxHp = p.maxHp;
		b.hp = hp;
		b.need = p.need;
		b.labour = p.need;
		b.cost = p.cost;
		b.costSum = p.costSum;
		b.delivered = p.delivered;
		b.prev.reset();
		b.state = b.hp < b.maxHp / 2 ? "damaged" : "done";
		return true;
	}
	destroy(b);
	b.cancelled = true;
	if (b.def->store) storeVer++;
	return true;
}

bool Works::demolish(int id, int team) {
	if (id < 0 || id >= int(buildings.size())) return false;
	Building &b = buildings[id];
	if (b.cancelled || b.team != team || b.pre || b.prev || b.raze || (b.state != "done" && b.state != "damaged")) return false;
	b.raze = tick_ + E().DEMOLISH.ticks;
	b.mend = false;
	for (Worker *u : active)
		if (u->wsite == b.id) leave(*u);
	return true;
}

void Works::perk_site(int id, double costCut, double hpUp) {
	if (id < 0 || id >= int(buildings.size())) return;
	Building &b = buildings[id];
	for (auto &e : b.cost.kv) e.second *= 1 - costCut;
	b.costSum *= 1 - costCut;
	b.maxHp *= 1 + hpUp;
	if (!b.prev) b.hp *= 1 + hpUp;
}

bool Works::upgrade(int id, int team) {
	if (id < 0 || id >= int(buildings.size())) return false;
	Building &b = buildings[id];
	if (b.cancelled || b.team != team || b.state != "done" || !b.def->upgrade) return false;
	const BuildingDef::Upgrade up = *b.def->upgrade;
	// a thin wall growing a walkway takes an inner row (tiles taken by the line's own towers and gates are left out)
	std::vector<int> grow;
	if (building(up.to).depth == 2 && (b.def->depth ? b.def->depth : 1) < 2) {
		std::set<int> skip; // membership only
		for (const Building &o : buildings)
			if (&o != &b && o.team == team && !o.def->wall.empty() && !o.cancelled && o.state != "destroyed")
				for (int t : o.ti) skip.insert(t);
		grow = innerRow(b.tiles, b.inside, skip);
		if (!checkTiles(team, grow, false).empty()) return false;
	}
	const int n = int(b.ti.size());
	b.prev = Building::Prev{ b.type, b.def, b.maxHp, b.hp, b.need, b.cost, b.costSum, b.delivered, n };
	for (size_t i = 0; i + 1 < grow.size(); i += 2) {
		const int t = grow[i + 1] * w + grow[i];
		b.ti.push_back(t);
		b.base.push_back(grid.height[t]);
		occ[t] = b.id;
	}
	b.tiles.insert(b.tiles.end(), grow.begin(), grow.end());
	b.tilesVer++;
	bbox(b);
	const double k = b.def->perTile ? double(b.ti.size()) : 1;
	b.type = up.to;
	b.def = &building(up.to);
	b.cost = Cost{};
	b.costSum = 0;
	for (const auto &e : up.cost.kv) b.cost.set(e.first, e.second * k), b.costSum += e.second * k;
	b.delivered = Cost{};
	b.incoming = Cost{};
	b.labour = 0;
	b.need = up.labour * k;
	b.maxHp = b.def->hp * k;
	b.state = "scaffold"; // already standing: no close()
	b.slots = workSlots(b);
	b.slotUser.assign(b.slots.size(), -1);
	b.users = 0;
	return true;
}

double Works::dist2(int id, double x, double y) const { return id >= 0 && id < int(buildings.size()) ? near2(buildings[id].tiles, x, y) : INF; }

std::pair<double, double> Works::nearest_tile(int id, double x, double y) const {
	const Building &b = buildings[id];
	std::pair<double, double> best{ b.x, b.y };
	double bd = INF;
	for (size_t i = 0; i + 1 < b.tiles.size(); i += 2) {
		const double d = sq2(b.tiles[i] + 0.5 - x) + sq2(b.tiles[i + 1] + 0.5 - y);
		if (d < bd) bd = d, best = { b.tiles[i] + 0.5, b.tiles[i + 1] + 0.5 };
	}
	return best;
}

std::vector<Spot> Works::work_spots(int id) const {
	if (id < 0 || id >= int(buildings.size())) return {};
	const Building &b = buildings[id];
	return b.def->workplace && (b.state == "done" || b.state == "damaged") ? spotsOf(b) : std::vector<Spot>{};
}

std::vector<double> Works::ring_points(int id, int n, double x, double y) const {
	if (id < 0 || id >= int(buildings.size())) return {};
	const Building &b = buildings[id];
	std::vector<int> ring;
	for (int t0 : b.ti)
		for (int dy = -1; dy <= 1; dy++)
			for (int dx = -1; dx <= 1; dx++) {
				const int tx = (t0 % w) + dx, ty = (t0 / w) + dy;
				if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
				const int t = ty * w + tx;
				if (has(b.ti, t) || has(ring, t) || double(grid.cost[t]) == 0 || occ[t] >= 0 || grid.deck[t] != 0) continue;
				ring.push_back(t);
			}
	const auto d = [&](int t) { return sq2(double(t % w) + 0.5 - x) + sq2(double(t / w) + 0.5 - y); };
	std::sort(ring.begin(), ring.end(), [&](int a, int c) {
		const double k = d(a) - d(c);
		if (k != 0) return k < 0;
		return a < c;
	});
	std::vector<double> out;
	for (int i = 0; i < n && !ring.empty(); i++) {
		const int t = ring[size_t(i) % ring.size()];
		out.push_back(double(t % w) + 0.5);
		out.push_back(double(t / w) + 0.5);
	}
	return out;
}

bool Works::kindle(int id, double dt) {
	Building *b = id >= 0 && id < int(buildings.size()) ? &buildings[id] : nullptr;
	if (!canBurn(b)) return false;
	if (b->burn > 0) return true;
	b->kindle += dt * wetK(*b);
	if (b->kindle >= FIRE().kindle) ignite(*b);
	return true;
}

void Works::fire_hit(int id, double p) {
	Building *b = id >= 0 && id < int(buildings.size()) ? &buildings[id] : nullptr;
	if (canBurn(b) && b->burn <= 0 && host.chance(p * wetK(*b))) ignite(*b);
}

bool Works::fortify(int team, int id, const std::string &fort) {
	if (id < 0 || id >= int(buildings.size())) return false;
	Building &b = buildings[id];
	if (b.team != team || b.cancelled || (b.state != "done" && b.state != "damaged")) return false;
	if (fort == "ironGate") {
		if (b.def->wall != "gate" || b.iron || !take_at(team, b.x, b.y, FORT().ironCost)) return false;
		b.iron = true;
		b.maxHp *= FORT().iron;
		b.hp *= FORT().iron;
		return true;
	}
	Cost c;
	c.set("hides", FORT().wetCost * double(b.ti.size()));
	if (!canBurn(&b) || !take_at(team, b.x, b.y, c)) return false;
	b.wet = tick_ + FORT().wetTicks;
	return true;
}

const Building *Works::field_at(int t) const {
	const Building *b = fields > 0 && grid.trench[t] && occ[t] >= 0 ? &buildings[occ[t]] : nullptr;
	return b && !b->def->field.empty() ? b : nullptr;
}

bool Works::douse(int id, double dt) {
	if (id < 0 || id >= int(buildings.size())) return false;
	Building &b = buildings[id];
	if (b.burn <= 0) return false;
	b.burn = std::max(0.0, b.burn - FIRE().douse * dt * host.douse(b));
	if (b.burn <= 0) b.kindle = 0;
	return true;
}

int Works::raise_ladder(int team, int x, int y, int siege, const std::string &type) {
	const int foot = ladder_foot(team, x, y);
	if (foot < 0) return -1;
	const int id = add(team, type, { foot % w, foot / w }, 0, std::nullopt, occ[y * w + x]);
	Building &b = buildings[id];
	b.saved = { double(grid.cost[foot]) };
	b.siege = siege;
	b.state = "done";
	b.labour = b.need;
	b.hp = b.maxHp;
	raiseDeck(b);
	grid.gate[foot] = u8(team + 1); // the attackers' way up: defenders push it, they do not climb down it
	return id;
}

bool Works::push(int id, double dt) {
	if (id < 0 || id >= int(buildings.size())) return false;
	Building &b = buildings[id];
	if (b.type != "ladder" || b.state == "destroyed" || b.cancelled) return false;
	b.push += dt / FIRE().push;
	if (b.push >= 1) destroy(b);
	return b.state == "destroyed";
}

bool Works::lit_near(int team, double x, double y, double z, std::optional<double> rr) const {
	const double r = rr ? *rr : E().BRAZIER.radius;
	for (const Building *b : braziers)
		if (b->team == team && b->fuel > 0 && b->state != "destroyed" && std::abs(double(grid.height[b->ti[0]]) - z) <= 1 && sq2(b->x - x) + sq2(b->y - y) <= r * r) return true;
	return false;
}

int Works::on_building(int t) const { return t >= 0 && (grid.deck[t] != 0 || onDeck(t)) ? occ[t] : -1; }

std::vector<double> Works::deck_points(int t, int n) const {
	if (t < 0 || grid.deck[t] != DECK) return {};
	std::vector<double> ranks[3];
	std::set<int> seen{ t }; // membership only
	std::set<int> towers; // membership only
	std::vector<int> queue{ t };
	for (size_t q = 0; q < queue.size() && int(ranks[0].size()) < n * 2 && int(q) < 8 * n + 16; q++) {
		const int c = queue[q];
		const int p = grid.plat[c];
		const int x = c % w, y = c / w;
		if (p >= 0) {
			if (!towers.count(p)) {
				towers.insert(p);
				const Building &b = buildings[p];
				const double cap = b.def->cap ? b.def->cap : 1, cols = std::ceil(std::sqrt(cap)), rows = std::ceil(cap / cols);
				const double x0 = b.x - b.w / 2, y0 = b.y - b.h / 2;
				for (int i = 0; i < cap; i++) {
					const double px = x0 + (std::fmod(i, cols) + 0.5) * (b.w / cols), py = y0 + (std::floor(i / cols) + 0.5) * (b.h / rows);
					const int pt = grid.tile_at(px, py);
					if (pt >= 0 && grid.deck[pt] == DECK) ranks[0].push_back(px), ranks[0].push_back(py); // not in the door
				}
			}
		} else {
			const Building *b = occ[c] >= 0 ? &buildings[occ[c]] : nullptr;
			bool landing = false, outer = false;
			for (const auto &e : DIRS) {
				const int nx = x + e[0], ny = y + e[1];
				if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
				const int o = ny * w + nx;
				if (grid.deck[o] > DECK) landing = true;
				else if (grid.deck[o] == 0 && b) {
					const double ix = b->inside[0] - x - 0.5, iy = b->inside[1] - y - 0.5;
					double il = js::hypot(ix, iy);
					if (il == 0 || std::isnan(il)) il = 1;
					if ((e[0] * ix + e[1] * iy) / il < -0.5) outer = true;
				}
			}
			ranks[landing ? 2 : outer ? 0 : 1].push_back(x + 0.5);
			ranks[landing ? 2 : outer ? 0 : 1].push_back(y + 0.5);
		}
		for (const auto &e : DIRS) {
			const int nx = x + e[0], ny = y + e[1];
			if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
			const int o = ny * w + nx;
			if (seen.count(o) || grid.deck[o] != DECK || std::abs(double(grid.height[o]) - double(grid.height[c])) > 1) continue;
			seen.insert(o);
			queue.push_back(o);
		}
	}
	std::vector<double> out;
	for (const auto &r : ranks)
		for (double v : r)
			if (int(out.size()) < n * 2) out.push_back(v);
	return out;
}

Act Works::work(Worker &u) {
	u.working = false;
	dropRefunded(u);
	return u.job == "gather" ? gather(u) : u.job == "build" ? build(u) : Act::none();
}

void Works::tick() {
	const size_t k = std::min(pathQueue.size(), size_t(WORK_PATHS));
	const std::vector<Worker *> batch(pathQueue.begin(), pathQueue.begin() + k);
	pathQueue.erase(pathQueue.begin(), pathQueue.begin() + k);
	for (Worker *u : batch) {
		u->wreq = false;
		if (!u->alive || u->job.empty()) continue;
		u->wpath = host.path(u->squad->team, u->x, u->y, u->wgx, u->wgy);
		u->wpi = u->wpath.size() > 2 ? 1 : 0; // a one-point path has no step 1
		detour(*u);
	}
	fireTick();
	for (size_t i = 0; i < buildings.size(); i++) {
		Building &b = buildings[i];
		if (b.raze && tick_ >= b.raze) razeNow(b);
	}
	if (++tick_ % REGROW_TICKS == 0)
		for (Node *n : regrowing) {
			if (n->amount >= n->max) continue;
			if (n->building && !buildings[*n->building].staff) continue; // W-88: a farm, press, kiln or jetty needs a man at it
			double add = std::min(n->max - n->amount, n->regrow * DT * REGROW_TICKS);
			if (n->kiln) {
				// W-35: a kiln burns its team's wood into pitch
				const std::vector<Hold *> src = sources(*n->kiln, n->x, n->y);
				double wood = 0;
				for (Hold *hd : src) wood += amount(*hd, "wood");
				add = std::min(add, wood / E().KILN.wood);
				if (add > 0) {
					Cost c;
					c.set("wood", add * E().KILN.wood);
					take_from(src, c);
				}
			}
			n->amount += add;
		}
	for (Building *b : braziers)
		if (b->fuel > 0 && b->state != "destroyed") b->fuel = std::max(0.0, b->fuel - DT);
}

std::vector<NodeSnap> Works::resource_nodes() const {
	std::vector<NodeSnap> out;
	for (const Node &n : nodes) out.push_back(NodeSnap{ n.id, n.res, n.x, n.y, n.amount, n.max, n.obj, n.building, n.locked, n.rare });
	return out;
}

std::vector<BuildingSnap> Works::building_snaps() {
	std::vector<BuildingSnap> out;
	for (Building &b : buildings) {
		if (b.cancelled) continue;
		BuildingSnap s;
		int maxWorkers = 0;
		for (int k = 0; k < int(b.slots.size()); k++)
			if (slotOk(b, k)) maxWorkers++;
		s.id = b.id;
		s.tilesVer = b.tilesVer;
		s.type = b.type;
		s.team = b.team;
		s.x = b.x;
		s.y = b.y;
		s.w = b.w;
		s.h = b.h;
		s.rot = b.rot;
		s.tiles = b.tiles;
		s.state = b.state;
		s.progress = b.state == "destroyed" ? 0 : b.labour / b.need;
		s.delivered = deliveredShare(b);
		s.hp = b.hp;
		s.maxHp = b.maxHp;
		s.workers = b.users;
		s.maxWorkers = maxWorkers;
		const BuildingDef &d = *b.def;
		if (d.tier) s.tier = d.tier;
		if (d.walk) s.walk = b.decked ? d.walk : 0, s.depth = d.depth ? d.depth : 1;
		else if (d.wall == "segment") s.depth = 1;
		if (b.attach >= 0) s.attach = b.attach;
		if (d.access == "stairs") s.steps = steps(b);
		if (b.door >= 0) s.door = std::array<int, 2>{ b.door % w, b.door / w };
		if (d.cap) s.cap = d.cap;
		if (b.prev) s.upgradeFrom = b.prev->type;
		if (b.burn > 0) s.burning = b.burn;
		if (d.brazier) s.lit = b.fuel > 0 && b.state != "destroyed", s.fuel = b.fuel / E().BRAZIER.life;
		s.rubble = b.rubble;
		if (b.siege >= 0) s.siege = b.siege;
		s.iron = b.iron;
		s.wet = b.wet > tick_;
		if (b.push > 0 && b.state != "destroyed") s.push = std::min(1.0, b.push);
		if (b.bridge) s.bridge = *b.bridge;
		if (b.hold && b.state != "destroyed") {
			Cost g;
			s.goods = totals(*b.hold, g);
			if (!b.hold->items.empty()) s.items = int(b.hold->items.size()), s.list = item_list(*b.hold);
		}
		{
			const std::optional<Cost> t = b.hold && b.state != "destroyed" ? tithe_in(*b.hold) : std::nullopt;
			if (t) {
				s.tithe = t;
				for (const Lot &l : b.hold->lots)
					if (is_tithe(l) && l.n > 1e-9) {
						const double who = -*l.s;
						char buf[32];
						std::snprintf(buf, sizeof buf, "p:%.0f", who);
						s.titheTo = std::string(buf);
						break;
					}
			}
		}
		if (!b.owner.empty()) s.owner = b.owner;
		s.staffed = b.staff;
		if (!b.owner.empty() && hasTerms(b)) {
			s.access = b.access;
			if (b.share) s.share = b.share;
			if (b.fee) s.fee = b.fee;
		}
		if (lock_of(d) && b.state != "destroyed") s.lock = b.lock, s.lockMax = lock_of(d);
		if (b.pre) {
			s.pre = true;
			s.landmark = b.pre->landmark;
			if (b.pre->i < int(region.prebuilt.size()) && !region.prebuilt[b.pre->i].art.empty()) s.art = region.prebuilt[b.pre->i].art;
			s.ruin = b.pre->ruin;
			s.fouled = b.pre->fouled > tick_;
		}
		s.mend = b.mend;
		if (b.raze) s.razing = std::min(1.0, 1 - (b.raze - tick_) / E().DEMOLISH.ticks);
		waitOf(b, s);
		if (b.type == "stoa") s.stalls = 2;
		out.push_back(s);
	}
	return out;
}

std::vector<std::pair<int, Cost>> Works::stock_snap() {
	std::map<int, Cost> out; // a JS object with integer keys: ascending
	for (const auto &e : reserve) {
		Cost c;
		out[e.first] = totals(e.second, c);
	}
	for (Building *b : storeList)
		if (standing(*b)) totals(*b->hold, out[b->team]);
	return std::vector<std::pair<int, Cost>>(out.begin(), out.end());
}

} // namespace sim
