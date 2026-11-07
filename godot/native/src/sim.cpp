#include "sim.h"
#include "sim_events.h"

#include <algorithm>
#include <cmath>
#include <numeric>
#include <set>
#include <tuple>

#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/core/error_macros.hpp>
#include <godot_cpp/variant/utility_functions.hpp>

#include "js_math.h"
#include "sim_data.h"
#include "sim_wild.h"
#include "works_probe.h"

namespace sim {

namespace {

constexpr double INF = std::numeric_limits<double>::infinity();
constexpr double PI = 3.141592653589793;

constexpr double DT = 0.1;
constexpr double SPEED = 1.5;
constexpr double CATCH_UP = 1.35;
constexpr double RADIUS = 0.35;
constexpr double PUSH = 0.5;
constexpr double TURN = 0.35;
constexpr double WHEEL = 0.6;
constexpr double LOOK = 2.5;
constexpr double FACE_RATE = 0.5;
constexpr double SHOVE = 0.35;
constexpr double PASS = 2;
constexpr double INERTIA = 0.4;
constexpr double SNAP_TURN = PI / 4;
constexpr double ARRIVE = 0.05;
constexpr double RAMP_FROM = 0.6;
constexpr double RAMP_UP = 0.25;
constexpr double BRAKE = 1;
constexpr double BRAKE_MIN = 0.4;
constexpr double SETTLE_K = 0.35;
constexpr double SETTLE_MIN = 0.03;
constexpr double SIDE_RATE = 0.1;
constexpr double SIDE_LOOK = 10;
constexpr double SIDE_GAP = 0.6;
constexpr double KEEP_SIDE = 0.45;
constexpr double FOLD = 0.4;
constexpr double CROSS_WAIT = 0.25;
constexpr int STALL = 10;
constexpr double WAKE = 0.5;
constexpr int RETRY = 10;
constexpr int REPATH_TICKS = 20;
constexpr double PATH_BUDGET = 900;
constexpr size_t UNIT_PATHS_PER_TICK = 2;
constexpr int SCAN = 5;
constexpr int HOLD_EVERY = 10; // M5e: HOLD.every, the raid scan (the rest of HOLD: sim_events.cpp raidScan)
constexpr double NEAR = 26;
constexpr double MELEE_STOP = 1.5;
constexpr double HOLD_OFF = 2.5;
constexpr double YIELD = 0.08;
constexpr double YIELD_R = 1.2;
constexpr double YIELD_TIGHT = 0.15;
constexpr int STUCK_TICKS = 8;
constexpr int STUCK_WINDOW = 30;
constexpr double STUCK_NET = 0.5;
constexpr double OWN_ON = 0.15;
constexpr double CLIMB_LOOK = 1.5;
constexpr double FACE = 18;
constexpr double FACE_TURN = 0.08;
constexpr int NX[8] = { 1, -1, 0, 0, 1, 1, -1, -1 };
constexpr int NY[8] = { 0, 0, 1, -1, 1, -1, 1, -1 };
constexpr double FILE_GAP = 0.75; // TS FILE
constexpr double LANE = 0.8;
constexpr double COL_AHEAD = 3;
constexpr int BACK_DIST = 7, BACK_EVERY = 5; // TS BACK
constexpr double UPHILL = 1.5; // grid.ts UPHILL
constexpr int SQUAD_MAX = 12; // soldiers.ts SQUAD_MAX (ARMY_MAX)
constexpr double FALL = 0.4;
constexpr int EVICT_R = 4;
constexpr int STAKES_EVERY = 5;

// Math.sign
double sign(double v) { return v > 0 ? 1 : v < 0 ? -1 : v; }
// (a - b) ** 2 as V8 runs it (x * x)
double sq(double v) { return v * v; }
double dist2(const Squad &a, double bx, double by) { return sq(a.cx - bx) + sq(a.cy - by); }
double dist2(const Squad &a, const Squad &b) { return sq(a.cx - b.cx) + sq(a.cy - b.cy); }
bool atEnd(const Squad &s) { return s.pi >= double(s.path.size()) / 2; }

Shape shapeOf(const std::string &s) {
	return s == "column" ? Shape::Column : s == "wedge" ? Shape::Wedge : s == "loose" ? Shape::Loose : Shape::Line;
}

// Shorten a flat point path by `by` along its length from the end (never past its first segment's start).
void trimEnd(std::vector<double> &pts, double by) {
	while (pts.size() >= 4 && by > 0) {
		const size_t n = pts.size();
		const double dx = pts[n - 2] - pts[n - 4], dy = pts[n - 1] - pts[n - 3], l = js::hypot(dx, dy);
		if (l > by) {
			pts[n - 2] -= (dx / l) * by;
			pts[n - 1] -= (dy / l) * by;
			return;
		}
		by -= l;
		if (n == 4) {
			pts[2] = pts[0];
			pts[3] = pts[1];
			return;
		}
		pts.resize(n - 2);
	}
}

} // namespace

Sim::Sim(Grid &g, WorksRegion r, const godot::Dictionary &meta, uint32_t seed_) : grid(&g), region(std::move(r)), rng(seed_), seed(seed_) {
	const uint32_t seed = seed_;
	// M6c: loot piles (region.safe: the safe rects)
	std::optional<std::vector<Rect>> safe;
	if (!region.safe.empty()) {
		safe.emplace();
		for (const WorksRect &q : region.safe) safe->push_back(Rect{ double(q.x), double(q.y), double(q.w), double(q.h) });
	}
	piles = std::make_unique<Piles>(safe);
	// M6d: safe-zone tiles (1 inside a region `safe` rect)
	safeMask.assign(size_t(grid->w) * grid->h, 0);
	for (const WorksRect &q : region.safe)
		for (int y = std::max(0, q.y); y < std::min(grid->h, q.y + q.h); y++)
			for (int x = std::max(0, q.x); x < std::min(grid->w, q.x + q.w); x++) safeMask[size_t(y) * grid->w + x] = 1;
	anySafe = !region.safe.empty();
	head.assign(size_t(grid->w) * grid->h, 0);
	worksHost.s = this;
	works = std::make_unique<Works>(*grid, region, worksHost);
	siegeHost.s = this;
	siege = std::make_unique<Siege>(*works, rng, siegeHost);
	// M5h: crafting queues of the workplaces (crafting.h), run on the civilian loop
	CraftDeps deps;
	deps.seed = seed;
	deps.takeAt = [this](int team, double x, double y, const Cost &c) { return works->take_at(team, x, y, c); };
	deps.addAt = [this](int team, double x, double y, const std::string &r, double n) { works->add_at(team, x, y, r, n); };
	deps.emit = [this](const CraftedEvent &e) { note(ev_of(e)); };
	// W-89: a crafter of the building's alliance pays from its network there, then his men's packs; a stranger only from packs
	deps.pay = [this](const Placed &b, const Crafter &c, const Goods &cost) {
		std::vector<Hold *> packs;
		for (Unit *u : units)
			if (u->alive && u->squad->owner == c.owner && u->pack && sq(u->x - b.x) + sq(u->y - b.y) <= sq(data().civilians.CIV.at + 4)) packs.push_back(&*u->pack);
		if (c.team != b.team) return take_from(packs, cost);
		std::vector<Hold *> from = works->sources_at(b.team, b.x, b.y);
		from.insert(from.end(), packs.begin(), packs.end());
		return take_from(from, cost);
	};
	deps.till = [this](const Placed &b, const std::string &res, double n) { works->pay_till(b.id, res, n, region.id); };
	deps.out = [this](const Placed &b, const Payer &payer, const std::string &res, double n) {
		const PileClaim claim{ payer.owner, "Your work", double(tick) + data().trade.CLAIM_TICKS };
		piles->drop(b.x, b.y + 1, { Lot{ res, n, region.id } }, {}, tick, 0, &claim);
	};
	// M6b: a cart rolls out in front of the workshop for the crafter's player, within his cap and the civilian quota
	deps.cart = [this](const Placed &b, const std::string &owner, const std::string &type, bool check) {
		if (!is_cart_type(type) || siege->carts(owner, std::nullopt) >= cart_cap(pathFor(owner).path) || civRoom(b.team) <= 0) return false;
		if (check) return true;
		const std::vector<double> p = works->ring_points(b.id, 1, b.x, b.y + 10);
		const std::pair<double, double> at = p.size() ? std::make_pair(p[0], p[1]) : openPoint(b.x, b.y + 3);
		siege->cart(b.team, owner, type, at.first, at.second);
		return true;
	};
	crafting = std::make_unique<Crafting>(std::move(deps));
	// createMobs, createSecrets, createBosses, createRoam, createTowns (sim_wild.cpp)
	wireWild(meta);
	townLv = std::make_unique<TownLevels>(*grid, [this]() -> const std::vector<TownPiece> & {
		// works.all as townLevel reads it
		townPieces.clear();
		for (const Building &b : works->all()) {
			TownPiece p;
			p.id = b.id;
			p.team = b.team;
			p.type = b.type;
			p.state = b.state;
			p.x = b.x;
			p.y = b.y;
			p.cancelled = b.cancelled;
			p.pre = b.pre.has_value();
			p.n = int(b.ti.size());
			if (b.def->workplace) p.def.workplace = b.def->workplace->kind;
			if (!b.def->wall.empty()) p.def.wall = b.def->wall;
			p.def.access = b.def->access;
			p.def.material = b.def->material;
			p.def.bridge = b.def->bridge;
			p.def.store = b.def->store;
			townPieces.push_back(std::move(p));
		}
		return townPieces;
	}, MOB_TEAM);
	works->prebuild(NEUTRAL_TEAM);
	// M7f: the region's landmark (landmarks.h): holder, capture damage, restore, garrison
	wireLandmarks();
	vision.init(*grid);
	// W-60 souls (souls.h)
	wireSouls(meta);
}

std::vector<double> SimWorksHost::path(int team, double x0, double y0, double x1, double y1) {
	s->grid->team = team;
	return s->cornerPath(x0, y0, x1, y1);
}
void SimWorksHost::evict(const std::vector<int> &tiles) { s->evict(tiles); }
bool SimWorksHost::chance(double p) { return s->rng.next() < p; }
void SimWorksHost::fall(const std::vector<int> &tiles) {
	// a bridge piece collapsed: men on its tiles fall in; deep water drowns them (killed or wounded), a ford hurts
	const std::set<int> down(tiles.begin(), tiles.end());
	for (Unit *u : s->units) {
		const int t = s->grid->tile_at(u->x, u->y);
		if (!u->alive || !down.count(t)) continue;
		s->hurt(*u, double(s->grid->cost[t]) == 0 ? INF : u->maxHp * FALL);
	}
}
// M6c: a store or chest that falls leaves its contents in a pile
void SimWorksHost::spill(double x, double y, const Hold &h, bool burnt) { s->piles->drop(x, y, h.lots, h.items, s->tick, burnt ? data().trade.PILE.spoil : 0); }
// M7a: a pre-built piece razed (a temple or shrine: sacrilege); immune: a safe court's pieces take no harm (a court's corner
// towers stand half outside it)
void SimWorksHost::razed(const Building &b, int by) {
	godot::Dictionary e = ev(s->tick, "razed");
	e["building"] = b.id;
	e["type"] = gstr(b.type);
	e["owner"] = b.team;
	e["by"] = by;
	if (b.type == "temple" || b.type == "shrine") e["sacrilege"] = true;
	s->note(e);
}
bool SimWorksHost::immune(const Building &b) {
	if (!s->anySafe) return false;
	for (int t : b.ti)
		if (s->safeMask[t] == 1) return true;
	return false;
}
double SimWorksHost::douse(const Building &b) { return s->towns->douse(b); }
void SimWorksHost::laboured(Worker &w, const Building &b, double secs) {
	// W-61: labour by owner (build contracts, alliance works)
	const Unit &u = static_cast<const Unit &>(w);
	const std::string &owner = u.squad->owner;
	if (owner.empty() || b.team != u.squad->team) return;
	const std::string k = owner + "|" + std::to_string(b.id);
	for (auto &e : s->labourLog)
		if (e.first == k) {
			e.second += secs;
			return;
		}
	s->labourLog.emplace_back(k, secs);
}
// a levelled town mends faster, an alliance temple cheaper (setBonus)
RepairK SimWorksHost::repairK(const Building &b) {
	const auto it = s->bonuses.find(b.team);
	return { s->townLv->perk_at(b.team, b.x, b.y).repair, it != s->bonuses.end() && it->second.repairCost ? *it->second.repairCost : 1 };
}
// W-215: the cart a gather squad throws its loads on
std::optional<CartDrop> SimWorksHost::cartDrop(WorkSquad &w) {
	Squad &q = static_cast<Squad &>(w);
	SiegeEngine *e = q.order == "gather" && q.cartDrop >= 0 ? s->siege->get(q.cartDrop) : nullptr;
	if (!e || !e->hold || e->state == "destroyed" || e->owner != q.owner) return std::nullopt;
	return CartDrop{ e->x, e->y, &*e->hold, s->siege->cart_cap(q.cartDrop) - loads(*e->hold) };
}

void Sim::evict(const std::vector<int> &tiles) {
	// a site closed its footprint: units standing on it step to the nearest open tile
	const std::set<int> shut(tiles.begin(), tiles.end());
	for (Unit *up : units) {
		Unit &u = *up;
		const int here = grid->tile_at(u.x, u.y);
		if (!u.alive || !shut.count(here)) continue;
		// the nearest open tile on its own level (not up on a cliff beside the site), else any
		int o = -1;
		double bd = INF;
		const int tx = int(std::floor(u.x));
		const int ty = int(std::floor(u.y));
		for (int y = std::max(0, ty - EVICT_R); y <= std::min(grid->h - 1, ty + EVICT_R); y++)
			for (int x = std::max(0, tx - EVICT_R); x <= std::min(grid->w - 1, tx + EVICT_R); x++) {
				const int t = y * grid->w + x;
				const double d = sq(x + 0.5 - u.x) + sq(y + 0.5 - u.y);
				if (d < bd && double(grid->cost[t]) > 0 && std::abs(int(grid->height[t]) - int(grid->height[here])) <= 1) bd = d, o = t;
			}
		if (o < 0) o = grid->nearest_open(tx, ty);
		u.x = (o % grid->w) + 0.5;
		u.y = std::floor(double(o) / grid->w) + 0.5;
	}
}

void Sim::stakes() {
	// M5h3: foe men moving over stakes are wounded
	for (Unit *up : units) {
		Unit &u = *up;
		if (!u.alive || !u.moving) continue;
		const int t = grid->tile_at(u.x, u.y);
		const Building *f = t >= 0 ? works->field_at(t) : nullptr;
		if (f && f->def->field == "stakes" && f->team != u.squad->team) hurt(u, data().economy.FIELD_STAKES.dmg * STAKES_EVERY * DT);
	}
}

Sim::~Sim() {
	for (Unit *u : units) delete u;
	for (Squad *s : squads) delete s;
}

std::pair<double, double> Sim::openPoint(double x, double y) const {
	const int t = grid->tile_at(x, y);
	if (t >= 0 && double(grid->cost[t]) > 0) return { x, y };
	const int o = grid->nearest_open(int(std::min(double(grid->w - 1), std::max(0.0, std::floor(x)))), int(std::min(double(grid->h - 1), std::max(0.0, std::floor(y)))));
	return { (o % grid->w) + 0.5, std::floor(double(o) / grid->w) + 0.5 };
}

std::pair<double, double> Sim::slotPos(Squad &s, int slot) {
	if (s.fixed && size_t(slot) * 2 < s.fixed->size()) return { (*s.fixed)[slot * 2], (*s.fixed)[slot * 2 + 1] };
	if (s.col && size_t(slot) * 2 < s.col->size()) return { (*s.col)[slot * 2], (*s.col)[slot * 2 + 1] };
	// M6b escort at its cart (no foe taken on): a ring ESCORT.ring out round it, so the cart stays in sight
	if (s.order == "escort" && s.target < 0) {
		const SiegeEngine *e = siege->get(s.escort);
		const double ring = data().trade.ESCORT.ring;
		if (e && sq(s.ax - e->x) + sq(s.ay - e->y) <= sq(ring + 4)) {
			// a second squad on the same cart: its own ring 1.5 further out, turned half a slot, so the two never stack
			const double r = ring + (s.id % 2) * 1.5, a = e->facing + ((slot + 0.5 + (s.id % 2) * 0.5) / std::max(1.0, double(s.offsets.size()) / 2)) * PI * 2;
			return { e->x + js::cos(a) * r, e->y + js::sin(a) * r };
		}
	}
	return formSlot(s, slot);
}

std::pair<double, double> Sim::formSlot(Squad &s, int slot) {
	if (!s.slot_ok || s.c_ax != s.ax || s.c_ay != s.ay || s.c_f != s.facing || s.c_side != s.side || s.c_off != s.offv) {
		if (!s.slot_ok || s.c_pts.size() < s.offsets.size()) s.c_pts.assign(s.offsets.size(), 0);
		s.slot_ok = true;
		s.c_ax = s.ax;
		s.c_ay = s.ay;
		s.c_f = s.facing;
		s.c_side = s.side;
		s.c_off = s.offv;
		layOut(s, s.c_pts);
	}
	return { s.c_pts[slot * 2], s.c_pts[slot * 2 + 1] };
}

void Sim::layOut(Squad &s, std::vector<double> &pts) {
	const size_t n = s.offsets.size() / 2;
	const double c = js::cos(s.facing), sn = js::sin(s.facing);
	const int team = grid->team;
	grid->team = s.team;
	auto fits = [&](double ox, double oy, double x, double y) {
		const int t = grid->tile_at(x, y);
		return t >= 0 && sees(false, ox, oy, x, y) && reachIn(t, x, y) <= 0;
	};
	auto reach = [&](double ox, double oy, double ex, double ey) {
		if (fits(ox, oy, ox + ex, oy + ey)) return 1.0;
		double lo = 0, hi = 1;
		for (int k = 0; k < 6; k++) {
			const double m = (lo + hi) / 2;
			if (fits(ox, oy, ox + ex * m, oy + ey * m)) lo = m;
			else hi = m;
		}
		return lo;
	};
	double bx = s.ax, by = s.ay, k = 1;
	if (s.side != 0) {
		k = reach(s.ax, s.ay, -sn * s.side, c * s.side);
		bx += -sn * s.side * k;
		by += c * s.side * k;
	}
	const double sg = sign(s.side), keep = std::min(std::fabs(s.side) * k, KEEP_SIDE);
	for (size_t i = 0; i < n; i++) {
		double f = s.offsets[i * 2], r = s.offsets[i * 2 + 1];
		if (k < 1 && sg * (s.side * k + r) < keep) {
			const double over = keep - sg * (s.side * k + r);
			r += sg * over;
			f -= over * FOLD;
		}
		const double ex = c * f - sn * r, ey = sn * f + c * r;
		const double lo = reach(bx, by, ex, ey);
		pts[i * 2] = bx + ex * lo;
		pts[i * 2 + 1] = by + ey * lo;
	}
	grid->team = team;
}

std::vector<double> Sim::cornerPath(double x0, double y0, double x1, double y1) {
	const auto [gx, gy] = openPoint(x1, y1);
	const int goal = grid->tile_at(gx, gy);
	const std::vector<int32_t> tiles = grid->find_path(grid->tile_at(x0, y0), goal);
	const int w = grid->w;
	std::vector<double> pts{ x0, y0 };
	std::vector<double> cost{ 0 };
	std::vector<bool> keep{ !tiles.empty() && fixedTile(tiles[0]) };
	double acc = 0;
	for (size_t i = 1; i + 1 < tiles.size(); i++) {
		const int a = tiles[i - 1], b = tiles[i], c = tiles[i + 1];
		acc += stepCostOf(a, b);
		if (b - a != c - b || grid->deck[a] != grid->deck[b] || grid->deck[c] != grid->deck[b]) {
			pts.push_back((b % w) + 0.5);
			pts.push_back(std::floor(double(b) / w) + 0.5);
			cost.push_back(acc);
			keep.push_back(fixedTile(a) || fixedTile(b) || fixedTile(c));
		}
	}
	const int last = tiles.back();
	if (tiles.size() > 1) acc += stepCostOf(tiles[tiles.size() - 2], last);
	if (last == goal) {
		pts.push_back(gx);
		pts.push_back(gy);
	} else {
		pts.push_back((last % w) + 0.5);
		pts.push_back(std::floor(double(last) / w) + 0.5);
	}
	cost.push_back(acc);
	keep.push_back(false);
	return grid->pull_path(pts, cost, keep, RADIUS);
}

bool Sim::sees(bool thin, double x0, double y0, double x1, double y1) {
	return thin || fixedTile(grid->tile_at(x0, y0)) || fixedTile(grid->tile_at(x1, y1)) ? grid->line_cost(x0, y0, x1, y1, 0) < INF : grid->line_cost(x0, y0, x1, y1, RADIUS) < INF;
}

bool Sim::fixedTile(int t) const { return t >= 0 && (grid->deck[t] != 0 || grid->span[t] != 0 || !!bridgeAt(t)); }

double Sim::stepCostOf(int a, int b) const {
	const int w = grid->w;
	return grid->step_cost(a, b) * ((a % w) != (b % w) && std::floor(double(a) / w) != std::floor(double(b) / w) ? SQRT2 : 1);
}

void Sim::fitSlots(Squad &s) {
	if (s.fixed || s.col || s.siege >= 0 || s.task || s.order == "gather" || s.order == "build") return;
	std::vector<Unit *> us;
	for (Unit *u : s.units)
		if (u->alive) us.push_back(u);
	const int n = int(us.size());
	if (n < 2 || s.offsets.size() < size_t(n) * 2) return;
	const double c = js::cos(s.facing), sn = js::sin(s.facing);
	std::vector<double> mf(n), mr(n);
	for (int i = 0; i < n; i++) {
		mf[i] = (us[i]->x - s.ax) * c + (us[i]->y - s.ay) * sn;
		mr[i] = -(us[i]->x - s.ax) * sn + (us[i]->y - s.ay) * c;
	}
	const std::vector<double> &O = s.offsets;
	std::vector<int> so(n), mo(n);
	std::iota(so.begin(), so.end(), 0);
	std::iota(mo.begin(), mo.end(), 0);
	std::sort(so.begin(), so.end(), [&](int a, int b) { return O[b * 2] != O[a * 2] ? O[b * 2] - O[a * 2] < 0 : a < b; });
	std::sort(mo.begin(), mo.end(), [&](int a, int b) { return mf[b] != mf[a] ? mf[b] - mf[a] < 0 : us[a]->id < us[b]->id; });
	for (int a = 0; a < n;) {
		int b = a + 1;
		while (b < n && O[so[b - 1] * 2] - O[so[b] * 2] < 0.5) b++;
		std::vector<int> ks(so.begin() + a, so.begin() + b), ms(mo.begin() + a, mo.begin() + b);
		std::sort(ks.begin(), ks.end(), [&](int p, int q) { return O[p * 2 + 1] != O[q * 2 + 1] ? O[p * 2 + 1] - O[q * 2 + 1] < 0 : p < q; });
		std::sort(ms.begin(), ms.end(), [&](int p, int q) { return mr[p] != mr[q] ? mr[p] - mr[q] < 0 : us[p]->id < us[q]->id; });
		for (size_t j = 0; j < ks.size(); j++) us[ms[j]]->slot = ks[j];
		a = b;
	}
}

double Sim::pathHeading(Squad &s) {
	const auto p = alongPath(s, LOOK);
	return js::hypot(p[0] - s.ax, p[1] - s.ay) < 0.3 ? std::numeric_limits<double>::quiet_NaN() : js::atan2(p[1] - s.ay, p[0] - s.ax);
}

void Sim::pathTo(Squad &s, double x, double y) {
	s.path = cornerPath(s.ax, s.ay, x, y);
	const size_t n = s.path.size();
	if ((s.order == "attack" || (s.order == "attackMove" && s.target >= 0)) && !s.ranged && n >= 4) {
		const auto [ox, oy] = openPoint(x, y);
		if (grid->tile_at(s.path[n - 2], s.path[n - 1]) != grid->tile_at(ox, oy)) trimEnd(s.path, HOLD_OFF);
	}
	s.pi = 1;
	for (Unit *u : s.units) {
		u->wp = 0;
		u->own.clear();
	}
	const double h = pathHeading(s);
	if (!std::isnan(h) && std::fabs(js::atan2(js::sin(h - s.facing), js::cos(h - s.facing))) > SNAP_TURN) {
		s.facing = h;
		fitSlots(s);
	}
}

void Sim::requestPath(Squad &s, double x, double y) {
	if (!s.goal) pathQueue.push_back(&s);
	s.goal = std::make_pair(x, y);
}

void Sim::reslot(Squad &s) {
	int k = 0;
	for (Unit *u : s.units)
		if (u->alive) u->slot = k++;
	if (k > 0) {
		s.offsets = formation_offsets(s.shape, k, rng);
		s.offv++;
	}
	fitSlots(s);
	double minSpeed = INF;
	int ranged = 0;
	for (Unit *u : s.units) {
		if (!u->alive) continue;
		minSpeed = std::min(minSpeed, u->st.speed * pace(u->sat));
		if (u->ammo > 0 && u->st.range > 0) ranged++;
	}
	if (k > 0) s.speed = minSpeed;
	s.ranged = ranged * 2 > k;
	// M5c: the squad's active is its best-ranked man's (highest level, then first in the squad) who holds one
	Unit *lead = nullptr;
	std::string act;
	for (Unit *u : s.units) {
		if (!u->alive || !u->person || (lead && lead->person->hero.level >= u->person->hero.level)) continue;
		if (!u->person->skills) continue;
		for (const std::string &id : *u->person->skills)
			if (data().skills.ACTIVES.count(id)) {
				lead = u, act = id;
				break;
			}
	}
	s.act = act;
	const double wil = lead ? lead->person->hero.attr("wil") : 5;
	s.actWil = std::isnan(wil) ? 5 : wil; // `?? 5`
}

void Sim::dropJobs(Squad &s) {
	if (s.order == "gather" || s.order == "build")
		for (Unit *u : s.units) works->set_job(*u, "");
}

void Sim::apply(const Order &o) {
	if (o.kind == "turnSquad") return void(turnSquad(o.squad, o.team.value_or(-1)));
	if (o.kind == "rebanner") return void(rebanner(o.centre, o.team.value_or(-1)));
	if (o.kind == "setLiege") return setLiege(o.owner, o.to_owner, o.pct);
	if (o.units && o.has_squad && o.kind != "man") {
		// W-53: the named men gather into one squad (one per kind) and it takes the order; a layout goes once, to the first
		if (o.squad < 0 || size_t(o.squad) >= squads.size()) return;
		const std::vector<Squad *> qs = regroup(*squads[o.squad], *o.units);
		static const char *const ONCE[] = { "placeBuilding", "placeWall", "placeBridge", "buildSiege", "rebuild", "upgrade", "crew", "claimRegion", "restoreLandmark" };
		const bool once = std::any_of(std::begin(ONCE), std::end(ONCE), [&](const char *k) { return o.kind == k; });
		for (size_t i = 0; i < qs.size() && (!once || i < 1); i++) {
			Order c = o;
			c.squad = qs[i]->id;
			c.units.reset();
			apply(c);
		}
		return;
	}
	if (o.kind == "cancelSite") {
		works->cancel(o.site);
		return;
	}
	if (o.kind == "craft" || o.kind == "cancelCraft" || o.kind == "repair" || o.kind == "salvage") {
		const Building *b = works->piece(o.building);
		// W-89: whoever its access lets in queues there; an order with no name acts for the building's own alliance
		const std::optional<std::string> by = o.kind == "craft" ? o.by : std::nullopt;
		const int team = o.team.value_or(-1);
		if (b && !b->cancelled && (b->state == "done" || b->state == "damaged") && (by ? works->may_use(*b, *by, team) : b->team == team)) {
			CraftOrder c;
			c.kind = o.kind;
			c.team = team;
			c.building = o.building;
			c.recipe = o.recipe;
			c.order = o.craftOrder;
			c.owner = o.owner;
			c.item = o.item;
			crafting->order(c, placed(*b));
		}
		return;
	}
	if (o.kind == "setAccess") return void(works->set_access(o.building, o.owner, o.access, o.share, o.fee)); // W-89
	if (o.kind == "fortify") {
		// M5h3: a Fortifier of the team iron-binds a gate or hangs wet hides, paid at once
		if (o.team && engineerNodes(*o.team).count("fortifier")) works->fortify(*o.team, o.building, o.fort);
		return;
	}
	if (o.kind == "placeBuilding" && !placeable(o.type, !o.has_squad ? o.team : o.squad >= 0 && size_t(o.squad) < squads.size() ? std::optional<int>(squads[o.squad]->team) : std::nullopt)) return;
	if (o.kind == "rebuild") {
		const std::optional<int> team = !o.has_squad ? o.team : o.squad >= 0 && size_t(o.squad) < squads.size() ? std::optional<int>(squads[o.squad]->team) : std::nullopt;
		if (!team || !works->rebuild(o.building, *team, MOB_TEAM)) return;
		if (o.has_squad) {
			Order b;
			b.kind = "build";
			b.squad = o.squad;
			b.has_squad = true;
			b.site = o.building;
			apply(b);
		}
		return;
	}
	if (o.kind == "demolish") {
		if (o.team) works->demolish(o.building, *o.team);
		return;
	}
	if (o.kind == "restoreLandmark") return void(landmarks->restore(o.squad, tick));
	if (o.kind == "upgrade" && !o.has_squad) {
		if (o.team) works->upgrade(o.building, *o.team);
		return;
	}
	if ((o.kind == "placeBuilding" || o.kind == "placeWall" || o.kind == "placeBridge") && !o.has_squad) {
		// no squad: a planned site, built once a squad gets a build order for it
		if (!o.team) return;
		if (o.kind == "placeBuilding") works->place(*o.team, o.type, o.x, o.y, o.rot);
		else if (o.kind == "placeBridge") works->place_bridge(*o.team, o.bridge);
		else works->place_wall(*o.team, o.wall);
		return;
	}
	if (o.squad < 0 || size_t(o.squad) >= squads.size()) return;
	Squad &s = *squads[o.squad];
	if (o.kind == "man") return manOrder(s, o.unit, o.act); // micro: the squad's own order stands
	// M5f: civilians take work orders only
	static const char *const CIV_ORDERS[] = { "move", "hold", "stop", "formation", "gather", "build", "civWork", "detach", "merge", "stopWork", "placeBuilding", "placeWall", "placeBridge", "upgrade", "buildSiege", "load", "unload", "salvagePile", "crew", "uncrew" };
	if (s.civ && std::none_of(std::begin(CIV_ORDERS), std::end(CIV_ORDERS), [&](const char *k) { return o.kind == k; })) return;
	// M5f: an order ends a civilian squad's flight (the flee controller sets it again after its own move)
	s.flee = false;
	s.resume.reset();
	if (o.kind == "fireArrows") {
		s.fire = o.on;
		return;
	}
	if (o.kind == "active") {
		// M5c: fires when ready (no other effect on the squad's order)
		const auto fx = s.act.empty() ? data().skills.ACTIVES.end() : data().skills.ACTIVES.find(s.act);
		if (fx == data().skills.ACTIVES.end() || tick < s.actReady || s.alive == 0) return;
		s.out = fx->second.out;
		s.inn = fx->second.in;
		s.actUntil = tick + data().skills.ACTIVE.buff;
		s.actReady = tick + active_cooldown(s.actWil);
		return;
	}
	// M6d: no attack, fire or capture on what stands in a safe zone
	if (o.kind == "attack" && o.target >= 0 && size_t(o.target) < squads.size() && inSafe(squads[o.target]->cx, squads[o.target]->cy)) return;
	// W-65: attacking roaming folk (or their wagon) sets the whole group against the attacker's team
	if (o.kind == "attack" && o.target >= 0 && size_t(o.target) < squads.size() && squads[o.target]->meek) {
		roamHost->dirty = true;
		roam->provoke(s.team, o.target, std::nullopt);
		roamHost->flush();
	}
	if ((o.kind == "attackBuilding" || o.kind == "ignite") && o.siege) {
		roamHost->dirty = true;
		roam->provoke(s.team, std::nullopt, *o.siege);
		roamHost->flush();
	}
	if (o.kind == "attackBuilding" || o.kind == "ignite") {
		const SiegeEngine *e = o.siege ? siege->get(*o.siege) : nullptr;
		if (o.building >= 0 ? safeBuilding(o.building) : o.siege && e && inSafe(e->x, e->y)) return;
	}
	if (o.kind == "load" || o.kind == "unload" || o.kind == "escort" || o.kind == "salvagePile") return tradeOrder(s, o);
	if (o.kind != "formation" && o.kind != "detach") s.xfer.reset(), s.escort = -1, s.salv.reset();
	if (s.siege >= 0) {
		const SiegeEngine *e = siege->get(s.siege);
		if (!e || e->crew != s.id) s.siege = -1, s.fixed.reset(); // its ladder or tower went up: the crew is free
	}
	if (s.siege >= 0 && (o.kind == "move" || o.kind == "hold" || o.kind == "stop" || o.kind == "attackMove" || o.kind == "attackBuilding" || o.kind == "deploy" || o.kind == "raiseLadder")) {
		// the crew drives its engine (an attack-move rolls it like a move, stop holds it)
		const int id = s.siege;
		if (o.kind == "move" || o.kind == "attackMove") {
			siege->move(id, o.x, o.y);
			s.order = "move";
			return;
		}
		if (o.kind == "hold" || o.kind == "stop") {
			siege->hold(id);
			s.order = "hold";
			return;
		}
		if (o.kind == "deploy") siege->deploy(id, o.pack);
		else if (o.kind == "raiseLadder") {
			if (!siege->raise(id, o.wallTile[0], o.wallTile[1])) return;
		} else if (o.building < 0 || !siege->attack(id, o.building)) return;
		s.order = o.kind;
		return;
	}
	if (o.kind == "deploy" || o.kind == "raiseLadder") return; // no engine
	if (o.kind != "formation" && o.kind != "detach") {
		if (s.siege >= 0) uncrew(s);
		s.task.reset();
		s.claimPt = -1;
		s.soul = -1;
	}
	if (o.kind == "repairBuilding") {
		// M7a: the squad mends a damaged building of its team (paid as it goes)
		if (!works->mend(o.building, s.team)) return;
		Order b;
		b.kind = "build";
		b.squad = s.id;
		b.has_squad = true;
		b.site = o.building;
		apply(b);
		return;
	}
	if (o.kind == "claimSoul") {
		// W-60: walk to the soul; the claim runs while the squad stands by him (souls.h)
		const Soul *so = souls->get(o.soul);
		if (!so || s.civ) return;
		Order m;
		m.kind = "move";
		m.squad = s.id;
		m.has_squad = true;
		m.x = so->x;
		m.y = so->y;
		const int id = so->id;
		apply(m);
		s.soul = id;
		return;
	}
	if (o.kind == "claimRegion") {
		const ClaimEntry *cp = o.point >= 0 && size_t(o.point) < mobRegion.claimPoints.size() ? &mobRegion.claimPoints[o.point] : nullptr;
		if (cp && inSafe(cp->x, cp->y)) return; // M6d: no claim in a safe zone
		mobHost->dirty = true;
		const bool ok = mobs->start_claim(s.id, o.point);
		mobHost->flush();
		if (!ok) return;
		dropJobs(s);
		const Mobs::Claim *c = mobs->claim_point(o.point);
		s.order = "claimRegion";
		s.claimPt = o.point;
		s.fixed.reset();
		requestPath(s, c->x, c->y);
		return;
	}
	if (o.kind == "uncrew") {
		if (s.order == "crew" || s.order == "move" || s.order == "attackBuilding" || s.order == "deploy" || s.order == "raiseLadder") s.order = "hold";
		return;
	}
	if (o.kind == "crew") {
		const int id = o.siege.value_or(-1);
		if ((s.civ && !siege->is_cart(id)) || (siege->is_cart(id) && siege->get(id)->owner != s.owner) || !siege->crew(id, s.id, s.team)) return; // M6b: civilians pull only carts, a player only his own
		dropJobs(s);
		s.siege = id;
		s.order = "crew";
		s.path.clear();
		s.goal.reset();
		return;
	}
	if (o.kind == "buildSiege" || o.kind == "ignite" || o.kind == "extinguish" || o.kind == "pushLadder" || o.kind == "attackBuilding") {
		Task k;
		k.kind = o.kind;
		if (o.kind == "buildSiege") {
			const int id = siege->build(s.team, o.type, o.x, o.y);
			if (id < 0) return;
			k.e = id;
		} else if (o.kind == "pushLadder") {
			const Building *l = works->piece(o.ladder);
			if (!l || l->type != "ladder" || l->team == s.team) return; // M5h3: a siege tower's bridge is not pushed off
			k.b = o.ladder;
		} else {
			k.b = o.building;
			k.e = o.building < 0 ? o.siege.value_or(-1) : -1;
			std::optional<int> tt;
			if (k.b >= 0) {
				if (const Building *b = works->piece(k.b)) tt = b->team;
			} else if (const SiegeEngine *e = siege->get(k.e)) tt = e->team;
			if (!tt || (o.kind != "extinguish" && *tt == s.team)) return;
		}
		if (!taskLive(k)) return;
		dropJobs(s);
		s.task = k;
		s.order = o.kind;
		taskPoints(s);
		return;
	}
	if (o.kind == "detach") {
		// W-53: any of its living men (at least one stays)
		std::vector<Unit *> alive;
		for (Unit *u : s.units)
			if (u->alive) alive.push_back(u);
		const double n = std::min(double(alive.size()) - 1, o.unitIds ? double(alive.size()) : std::floor(o.count.value_or(0)));
		std::vector<Unit *> picked;
		if (n >= 1) {
			if (o.unitIds) {
				for (Unit *u : alive)
					if (std::find(o.unitIds->begin(), o.unitIds->end(), u->id) != o.unitIds->end() && double(picked.size()) < n) picked.push_back(u);
			} else picked.assign(alive.end() - ptrdiff_t(n), alive.end());
		}
		detach(s, picked);
		return;
	}
	if (o.kind == "merge") {
		Squad *t = o.into >= 0 && size_t(o.into) < squads.size() ? squads[o.into] : nullptr;
		if (!t || t == &s || t->team != s.team || t->owner != s.owner || t->civ != s.civ || s.alive == 0 || t->alive + s.alive > SQUAD_MAX) return;
		std::vector<Unit *> alive;
		for (Unit *u : s.units)
			if (u->alive) alive.push_back(u);
		join(s, *t, alive);
		return;
	}
	if (o.kind == "stopWork") {
		dropJobs(s);
		s.order = "hold";
		s.path.clear();
		s.goal.reset();
		return;
	}
	if (o.kind == "upgrade") {
		dropJobs(s);
		const bool up = works->upgrade(o.building, s.team);
		if (up) perkSites(s.owner, { o.building });
		if (!up && !works->site_ok(o.building, s.team)) return;
		s.order = "build";
		s.fixed.reset();
		s.sites = { o.building };
		s.node = -1;
		s.path.clear();
		s.goal.reset();
		for (Unit *u : s.units)
			if (u->alive) works->set_job(*u, "build");
		return;
	}
	if (o.kind == "formation") {
		s.shape = shapeOf(o.shape);
		reslot(s);
		return;
	}
	if (o.kind == "civWork") {
		// M5f: the men stand round the building (its ring) and work there by class; at a workplace the first of them at
		// its stations inside
		const Building *b = works->piece(o.building);
		if (!s.civ || !b || b->cancelled || !works->may_use(*b, s.owner, s.team) || !(b->def->store || b->def->workplace) || (b->state != "done" && b->state != "damaged")) return;
		dropJobs(s);
		s.order = "civWork";
		s.work = o.building;
		s.sites.clear();
		s.node = -1;
		s.path.clear();
		s.goal.reset();
		std::vector<double> pts;
		if (b->team == s.team) { // a stranger works at its door: its floor opens for its alliance
			const std::vector<Spot> spots = works->work_spots(o.building);
			for (size_t i = 0; i < spots.size() && i < size_t(std::max(1, s.alive)); i++) pts.push_back(spots[i][0]), pts.push_back(spots[i][1]);
		}
		const std::vector<double> ring = works->ring_points(o.building, std::max(1, s.alive) - int(pts.size() / 2), s.cx, s.cy);
		pts.insert(pts.end(), ring.begin(), ring.end());
		if (pts.size()) s.fixed = pts;
		else s.fixed.reset();
		if (pts.size()) requestPath(s, pts[0], pts[1]);
		return;
	}
	if (o.kind == "placeBuilding" && building(o.type).brazier) {
		works->place(s.team, o.type, o.x, o.y, o.rot); // W-35: set down done and lit; the squad carries on
		return;
	}
	if (o.kind == "placeBuilding" || o.kind == "placeWall" || o.kind == "placeBridge" || o.kind == "build" || o.kind == "gather") {
		std::vector<int> sites;
		if (o.kind == "placeBuilding") {
			const int id = works->place(s.team, o.type, o.x, o.y, o.rot, s.owner);
			if (id >= 0) sites.push_back(id);
		} else if (o.kind == "placeWall") sites = works->place_wall(s.team, o.wall);
		else if (o.kind == "placeBridge") sites = works->place_bridge(s.team, o.bridge);
		else if (o.kind == "build" && works->site_ok(o.site, s.team)) sites.push_back(o.site);
		if (o.kind != "gather" && sites.empty()) return; // invalid placement: the squad carries on
		if (o.kind != "gather" && o.kind != "build") perkSites(s.owner, sites);
		if (o.kind == "gather" && !works->node_ok(o.node, s.team, s.owner)) return; // M7e: rare nodes for the region's holder only; W-89: a farm its owner lets him use
		s.order = o.kind == "gather" ? "gather" : "build";
		s.sites = sites;
		s.fixed.reset();
		s.node = o.kind == "gather" ? o.node : -1;
		s.cartDrop = -1;
		if (o.kind == "gather" && o.cart && siege->is_cart(*o.cart) && siege->alive(*o.cart)) {
			// W-215: his own cart, near enough to throw on; else the nearest store as ever
			const SiegeEngine *e = siege->get(*o.cart);
			const NodeSnap n = works->resource_nodes()[o.node];
			if (e->owner == s.owner && js::hypot(e->x - n.x, e->y - n.y) <= data().trade.CART.gatherR) s.cartDrop = *o.cart;
		}
		s.path.clear();
		s.goal.reset();
		for (Unit *u : s.units)
			if (u->alive) works->set_job(*u, s.order);
		return;
	}
	dropJobs(s);
	if (o.kind == "stop") {
		const bool arrived = atEnd(s) && !s.goal;
		s.order = "hold";
		s.path.clear();
		s.pi = 0;
		s.goal.reset();
		s.target = -1;
		if (!(s.fixed && arrived)) {
			s.fixed.reset();
			std::tie(s.ax, s.ay) = openPoint(s.cx, s.cy);
			for (Unit *u : s.units) u->own.clear(), u->wp = 0, u->settled = false;
		}
		return;
	}
	s.order = o.kind;
	if (o.kind != "hold") s.fixed.reset();
	if (o.kind == "attackMove") {
		s.amx = o.x;
		s.amy = o.y;
		s.target = -1;
		requestPath(s, o.x, o.y);
	} else if (o.kind == "move") {
		requestPath(s, o.x, o.y);
		std::vector<double> pts = works->deck_points(grid->tile_at(o.x, o.y), s.alive);
		if (!pts.empty()) s.fixed = std::move(pts);
	} else if (o.kind == "hold") {
		s.path.clear();
		s.goal.reset();
	} else if (o.target >= 0 && size_t(o.target) < squads.size() && squads[o.target]->team != s.team) {
		s.target = o.target;
		s.repathAt = tick;
	} else s.order = "hold";
}

bool Sim::calmPair(Squad &s, Squad &o) const {
	return (o.meek && s.team != MOB_TEAM && !((o.angry >> s.team) & 1) && !(s.order == "attack" && s.target == o.id)) || (s.meek && o.team != MOB_TEAM && !((s.angry >> o.team) & 1));
}

void Sim::scanNear() {
	for (Squad *s : squads) {
		s->near.clear();
		if (s->alive == 0) continue;
		for (Squad *o : squads)
			if (o->team != s->team && o->alive > 0 && (dist2(*s, *o) < NEAR * NEAR || sq(s->ax - o->cx) + sq(s->ay - o->cy) < NEAR * NEAR) && !calmPair(*s, *o)) s->near.push_back(o);
	}
}

void Sim::updateAttack(Squad &s) {
	Squad *t = squads[s.target];
	if (t->alive == 0) {
		Squad *best = nullptr;
		for (Squad *o : s.near)
			if (!best || dist2(s, *o) < dist2(s, *best)) best = o;
		if (!best) {
			s.order = "hold";
			s.path.clear();
			s.goal.reset();
			return;
		}
		s.target = best->id;
		s.repathAt = tick;
		t = best;
	}
	chase(s, *t);
}

void Sim::updateAttackMove(Squad &s) {
	Squad *t = s.target >= 0 ? squads[s.target] : nullptr;
	if (t && (t->alive == 0 || std::find(s.near.begin(), s.near.end(), t) == s.near.end())) t = nullptr;
	if (!t)
		for (Squad *o : s.near)
			if (!t || dist2(s, *o) < dist2(s, *t)) t = o;
	if (t) {
		if (s.target != t->id) s.target = t->id, s.repathAt = tick;
		chase(s, *t);
	} else if (s.target >= 0) {
		s.target = -1;
		requestPath(s, s.amx, s.amy);
	} else if (!s.goal && atEnd(s)) s.order = "hold";
}

void Sim::chase(Squad &s, Squad &t) {
	const double stop = s.ranged ? std::max(MELEE_STOP, warRange(s) * 0.8) : MELEE_STOP;
	if (js::hypot(t.cx - s.ax, t.cy - s.ay) < stop && (s.ranged || grid->line_clear(s.ax, s.ay, t.cx, t.cy))) {
		s.path.clear();
		s.goal.reset();
	} else if (tick >= s.repathAt) {
		requestPath(s, t.cx, t.cy);
		s.repathAt = tick + REPATH_TICKS;
	}
}

double Sim::warRange(Squad &s) {
	double r = 0;
	for (Unit *u : s.units)
		if (u->alive && u->ammo > 0) r = std::max(r, u->st.range);
	return r;
}

double Sim::moveCost(double x, double y, double ux, double uy) const {
	const int here = grid->tile_at(x, y);
	const int ahead = grid->tile_at(x + ux * 0.5, y + uy * 0.5);
	const double c = ahead >= 0 && double(grid->cost[ahead]) > 0 ? double(grid->cost[ahead]) : double(grid->cost[here]);
	const int up = grid->tile_at(x + ux * CLIMB_LOOK, y + uy * CLIMB_LOOK);
	return up >= 0 && grid->height[up] > grid->height[here] ? c * UPHILL : c;
}

void Sim::faceThreat(Squad &s) {
	Squad *best = nullptr;
	for (Squad *o : s.near)
		if (!best || dist2(s, *o) < dist2(s, *best)) best = o;
	if (!best || dist2(s, *best) > FACE * FACE) return;
	double turn = js::atan2(best->cy - s.ay, best->cx - s.ax) - s.facing;
	turn = js::atan2(js::sin(turn), js::cos(turn));
	s.facing += std::max(-FACE_TURN, std::min(FACE_TURN, turn));
}

std::optional<Lanes> Sim::laneOf(int t) const {
	const BridgeLine *b = bridgeAt(t);
	if (!b) return std::nullopt;
	const double l = js::hypot(b->dir[0], b->dir[1]), ex = b->dir[0] / l, ey = b->dir[1] / l;
	return Lanes{ b->ids[0], ex, ey, -ey, ex, -ey * b->rows[0] + ex * b->rows[1], b->width };
}

static double laneC(const Lanes &L, int j) { return (j - (L.w - 1) / 2.0) * LANE; }

std::array<double, 4> Sim::alongPath(Squad &s, double d) {
	const std::vector<double> &P = s.path;
	const bool ahead = d >= 0;
	double x = s.ax, y = s.ay, left = std::fabs(d), ux = js::cos(s.facing), uy = js::sin(s.facing);
	int k = ahead ? s.pi : s.pi - 1;
	for (;;) {
		const bool last = ahead ? k >= double(P.size()) / 2 : k < 0;
		const double tx = last ? x + (ahead ? 0 : -ux * left) : P[k * 2], ty = last ? y + (ahead ? 0 : -uy * left) : P[k * 2 + 1];
		const double sx = tx - x, sy = ty - y, sl = js::hypot(sx, sy);
		if (sl > 1e-6) ux = (ahead ? sx : -sx) / sl, uy = (ahead ? sy : -sy) / sl;
		if (last || sl >= left) {
			if (sl >= left && sl > 1e-6) return { x + (sx / sl) * left, y + (sy / sl) * left, ux, uy };
			return { tx, ty, ux, uy };
		}
		left -= sl;
		x = tx;
		y = ty;
		k += ahead ? 1 : -1;
	}
}

std::optional<std::vector<double>> Sim::columnFor(Squad &s) {
	if (s.fixed || s.siege >= 0 || s.task || s.order == "gather" || s.order == "build" || atEnd(s)) return std::nullopt;
	const int n = int(s.offsets.size() / 2);
	std::optional<Lanes> L;
	for (Unit *u : s.units)
		if (u->alive && (L = laneOf(grid->tile_at(u->x, u->y)))) break;
	auto ranks = [&](int w) { return std::ceil(double(n) / w); };
	auto back = [&](int w) { return ((ranks(w) - 1) / 2) * FILE_GAP; };
	for (double d = -back(1) - 1; !L && d <= std::max(COL_AHEAD, back(1)); d += 0.5) {
		const auto p = alongPath(s, d);
		L = laneOf(grid->tile_at(p[0], p[1]));
	}
	if (!L) return std::nullopt;
	const int w = L->w;
	std::vector<double> out;
	for (int i = 0; i < n; i++) {
		const int r = i / w, j = i % w;
		const auto p = alongPath(s, back(w) - r * FILE_GAP);
		const double x = p[0], y = p[1], ux = p[2], uy = p[3];
		const std::optional<Lanes> B = laneOf(grid->tile_at(x, y));
		if (B) {
			const double a = x * B->ex + y * B->ey;
			const int jj = -uy * B->nx + ux * B->ny >= 0 ? j : B->w - 1 - j;
			const double c = B->cl + laneC(*B, std::min(jj, B->w - 1));
			out.push_back(B->ex * a + B->nx * c);
			out.push_back(B->ey * a + B->ny * c);
		} else {
			const double c = (j - (w - 1) / 2.0) * LANE;
			out.push_back(x - uy * c);
			out.push_back(y + ux * c);
		}
	}
	return out;
}

void Sim::keepToLanes() {
	struct F {
		Unit *u;
		double a;
		Lanes L;
		double c;
	};
	std::vector<int> order; // Map insertion order of the files
	std::map<int, std::vector<F>> files;
	for (Unit *u : units) {
		if (!u->alive || !u->job.empty()) continue;
		const std::optional<Lanes> L = laneOf(grid->tile_at(u->x, u->y));
		if (!L) continue;
		const double a = u->x * L->ex + u->y * L->ey, c = u->x * L->nx + u->y * L->ny - L->cl;
		const int j = int(std::max(0.0, std::min(double(L->w - 1), js::round(c / LANE + (L->w - 1) / 2.0))));
		const double m = laneC(*L, L->w - 1);
		const double cc = std::max(-m, std::min(m, c));
		double lc = 0, x = 0, y = 0;
		for (const double q : { cc, cc / 2, 0.0 }) {
			lc = L->cl + q;
			x = L->ex * a + L->nx * lc;
			y = L->ey * a + L->ny * lc;
			if (bridgeAt(grid->tile_at(x, y))) break;
		}
		if (!bridgeAt(grid->tile_at(x, y))) continue;
		u->x = x;
		u->y = y;
		const int k = L->id * 4 + j;
		if (!files.count(k)) order.push_back(k);
		files[k].push_back({ u, a, *L, lc });
	}
	const double MIN = 2 * RADIUS;
	for (const int key : order) {
		std::vector<F> &f = files[key];
		if (f.size() < 2) continue;
		std::sort(f.begin(), f.end(), [](const F &p, const F &q) { return p.a != q.a ? p.a - q.a < 0 : p.u->id < q.u->id; });
		for (int pass = 0; pass < 4; pass++)
			for (size_t i = 1; i < f.size(); i++) {
				const double gap = MIN - (f[i].a - f[i - 1].a);
				if (gap <= 0 || meet(*f[i].u, *f[i - 1].u)) continue;
				f[i - 1].a -= gap / 2;
				f[i].a += gap / 2;
			}
		for (const F &e : f) {
			const double x = e.L.ex * e.a + e.L.nx * e.c, y = e.L.ey * e.a + e.L.ny * e.c;
			const int t = grid->tile_at(x, y);
			if (t >= 0 && double(grid->cost[t]) > 0) e.u->x = x, e.u->y = y;
		}
	}
}

std::pair<double, double> Sim::blockSize(Squad &s) const {
	double w = 0, f = 0;
	for (size_t i = 0; i < s.offsets.size(); i += 2) f = std::max(f, std::fabs(s.offsets[i])), w = std::max(w, std::fabs(s.offsets[i + 1]));
	return { w + RADIUS, f + RADIUS };
}

bool Sim::eases(Squad &s) const { return !s.flee && !s.fixed && s.siege < 0 && !s.task && s.order != "attack" && !(s.order == "attackMove" && s.target >= 0); }

double Sim::giveWay(Squad &s) {
	if (!eases(s) || s.col) return 1;
	const double c = js::cos(s.facing), sn = js::sin(s.facing);
	const auto [ws, fs] = blockSize(s);
	double dir = 0, pc = 1;
	bool hold = false;
	for (Squad *op : squads) {
		Squad &o = *op;
		if (&o == &s || o.alive == 0 || o.team != s.team || o.col || !eases(o)) continue;
		const double dx = o.cx - s.cx, dy = o.cy - s.cy, f = dx * c + dy * sn, r = -dx * sn + dy * c;
		const auto [wo, fo] = blockSize(o);
		const double need = ws + wo + SIDE_GAP, along = fs + fo;
		const double cs = js::cos(o.facing - s.facing);
		if (std::fabs(cs) <= 0.5 && !atEnd(o) && dx * dx + dy * dy < sq(along + need + SIDE_LOOK)) {
			const double co = js::cos(o.facing), so = js::sin(o.facing), cr = c * so - sn * co;
			const double t = (dx * so - dy * co) / cr, v = (dx * sn - dy * c) / cr;
			const double zs = fs + wo + SIDE_GAP, zo = fo + ws + SIDE_GAP;
			if (t > -zs && v > -zo) {
				const double ts = t / s.speed, to = v / o.speed;
				if (std::fabs(ts - to) < zs / s.speed + zo / o.speed && (ts > to || (ts == to && s.id > o.id)) && t > zs - 1) pc = CROSS_WAIT;
			}
			continue;
		}
		if (f < -along || f > along + SIDE_LOOK || std::fabs(r) >= need + 1) continue;
		if (atEnd(o)) {
			if (f < along + 2) hold = true;
			continue;
		}
		const bool meets = cs < -0.5 || (cs > 0.7 && f > 0 && o.speed < s.speed * 0.95);
		if (!meets) continue;
		if (std::fabs(r) >= need || f < 0) {
			hold = true;
			continue;
		}
		dir = std::fabs(r) < 0.5 ? 1 : -sign(r);
	}
	const double max = 2 * ws + SIDE_GAP + 1;
	if (dir) s.side = std::max(-max, std::min(max, s.side + dir * SIDE_RATE));
	else if (!hold && s.side != 0) s.side = sign(s.side) * std::max(0.0, std::fabs(s.side) - SIDE_RATE * 0.5);
	return pc;
}

void Sim::stepSquad(Squad &s) {
	if (s.alive == 0) return;
	if (atEnd(s)) {
		s.col.reset();
		s.ramp = RAMP_FROM;
		if (!s.goal) faceThreat(s);
		return;
	}
	const double pc = giveWay(s);
	double lag = 0;
	int n = 0;
	for (Unit *u : s.units) {
		if (!u->alive || u->fighting || u->back) continue;
		const auto [sx, sy] = slotPos(s, u->slot);
		lag += js::hypot(sx - u->x, sy - u->y);
		n++;
	}
	lag = n ? lag / n : 0;
	double budget = SPEED * s.speed * flee_pace(s.flee) * (s.laden ? data().trade.PORTER.slow : 1) * DT * std::min(1.0, std::max(0.25, 1.25 - lag / 6));
	if (eases(s)) {
		budget *= s.ramp * pc;
		s.ramp = std::min(1.0, s.ramp + RAMP_UP);
		double rem = 0;
		double x = s.ax, y = s.ay;
		for (int j = s.pi; j < double(s.path.size()) / 2 && rem < BRAKE; j++) {
			rem += js::hypot(s.path[j * 2] - x, s.path[j * 2 + 1] - y);
			x = s.path[j * 2];
			y = s.path[j * 2 + 1];
		}
		if (rem < BRAKE) budget *= std::max(BRAKE_MIN, rem / BRAKE);
	} else s.ramp = 1;
	const double want = pathHeading(s);
	if (!std::isnan(want)) {
		double reach = 0.5;
		for (size_t i = 0; i < s.offsets.size(); i += 2) reach = std::max(reach, js::hypot(s.offsets[i], s.offsets[i + 1]));
		const double rate = std::min(TURN, (WHEEL * budget) / reach);
		const double turn = js::atan2(js::sin(want - s.facing), js::cos(want - s.facing));
		s.facing += std::max(-rate, std::min(rate, turn));
	}
	while (budget > 0 && !atEnd(s)) {
		const double tx = s.path[s.pi * 2];
		const double ty = s.path[s.pi * 2 + 1];
		const double dx = tx - s.ax;
		const double dy = ty - s.ay;
		const double d = js::hypot(dx, dy);
		const double dd = d != 0 ? d : 1; // `d || 1`
		const double cost = moveCost(s.ax, s.ay, dx / dd, dy / dd);
		const double stp = budget / cost;
		if (stp >= d) {
			s.ax = tx;
			s.ay = ty;
			s.pi++;
			budget -= d * cost;
		} else {
			s.ax += (dx / d) * stp;
			s.ay += (dy / d) * stp;
			budget = 0;
		}
	}
	s.col = columnFor(s);
}

void Sim::backPoint(Unit &u) {
	Squad &s = *u.squad;
	double fx = 0, fy = 0, best = INF;
	for (Squad *o : s.near) {
		const double d = sq(o->cx - s.ax) + sq(o->cy - s.ay);
		if (o->alive > 0 && d < best) best = d, fx = o->cx, fy = o->cy;
	}
	double dx = best < INF ? s.ax - fx : -js::cos(s.facing), dy = best < INF ? s.ay - fy : -js::sin(s.facing);
	const double l = js::hypot(dx, dy);
	if (l < 1e-6) dx = -js::cos(s.facing), dy = -js::sin(s.facing);
	else dx /= l, dy /= l;
	const double x = std::min(grid->w - 0.5, std::max(0.5, s.ax + dx * BACK_DIST)), y = std::min(grid->h - 0.5, std::max(0.5, s.ay + dy * BACK_DIST));
	const auto [bx, by] = openPoint(x, y);
	if (js::hypot(bx - u.bx, by - u.by) > 1) u.own.clear();
	u.bx = bx;
	u.by = by;
}

std::pair<double, double> Sim::backTarget(Unit &u) {
	if ((tick + u.id) % BACK_EVERY == 0) backPoint(u);
	u.crossing = false;
	if (sees(false, u.x, u.y, u.bx, u.by)) {
		u.own.clear();
		return { u.bx, u.by };
	}
	if (!u.own.empty()) {
		while (u.oi < double(u.own.size()) / 2 - 1 && js::hypot(u.own[u.oi * 2] - u.x, u.own[u.oi * 2 + 1] - u.y) < 0.3) u.oi++;
		return { u.own[u.oi * 2], u.own[u.oi * 2 + 1] };
	}
	if (!u.ownReq) u.ownReq = true, unitPathQueue.push_back(&u);
	return { u.bx, u.by };
}

std::pair<double, double> Sim::unitTarget(Unit &u) {
	if (u.back) return backTarget(u);
	Squad &s = *u.squad;
	const std::optional<Lanes> L = s.col || s.fixed ? std::nullopt : laneOf(grid->tile_at(u.x, u.y));
	if (L) {
		const auto [sx, sy] = slotPos(s, u.slot);
		u.crossing = !bridgeAt(grid->tile_at(sx, sy));
		if (u.crossing) {
			u.own.clear();
			const double a = u.x * L->ex + u.y * L->ey, c = u.x * L->nx + u.y * L->ny, na = a + (s.ax * L->ex + s.ay * L->ey >= a ? 1.5 : -1.5);
			return { L->ex * na + L->nx * c, L->ey * na + L->ny * c };
		}
	} else u.crossing = false;
	const auto [sx, sy] = slotPos(s, u.slot);
	const bool slotSeen = sees(!!s.fixed, u.x, u.y, sx, sy);
	if (slotSeen && !s.fixed) {
		u.own.clear();
		return { sx, sy };
	}
	if (!u.own.empty()) {
		while (u.oi < double(u.own.size()) / 2 - 1) {
			const double d = js::hypot(u.own[u.oi * 2] - u.x, u.own[u.oi * 2 + 1] - u.y);
			if (s.fixed ? d >= 0.5 || (d >= OWN_ON && !(grid->line_cost(u.x, u.y, u.own[u.oi * 2 + 2], u.own[u.oi * 2 + 3], 0) < INF)) : d >= 0.3) break;
			u.oi++;
		}
		if (!s.fixed && u.oi < double(u.own.size()) / 2 - 1 && sees(false, u.x, u.y, u.own[u.oi * 2 + 2], u.own[u.oi * 2 + 3])) u.oi++;
		const double ox = u.own[u.oi * 2];
		const double oy = u.own[u.oi * 2 + 1];
		const bool last = u.oi >= double(u.own.size()) / 2 - 1;
		bool stale = false;
		if (last) {
			const auto e = slotPos(s, u.slot);
			stale = js::hypot(e.first - ox, e.second - oy) > 0.3;
		}
		if (!stale && (!last || js::hypot(ox - u.x, oy - u.y) > 0.3)) return { ox, oy };
		u.own.clear();
	}
	if (slotSeen) return { sx, sy };
	if (s.fixed && !u.ownReq) {
		u.ownReq = true;
		unitPathQueue.push_back(&u);
	}
	const int last = std::min(s.pi, int(s.path.size() / 2) - 1);
	for (int j = last; j > u.wp; j--) {
		if (sees(!!s.fixed, u.x, u.y, s.path[j * 2], s.path[j * 2 + 1])) {
			u.wp = j;
			return { s.path[j * 2], s.path[j * 2 + 1] };
		}
	}
	if (sees(!!s.fixed, u.x, u.y, s.ax, s.ay)) return { s.ax, s.ay };
	if (!s.fixed && !u.ownReq && u.own.empty()) {
		u.ownReq = true;
		unitPathQueue.push_back(&u);
	}
	return { sx, sy };
}

void Sim::countPlatforms() {
	platLoad.clear();
	for (Unit *u : units) {
		if (!u->alive) continue;
		const int p = grid->plat[grid->tile_at(u->x, u->y)];
		if (p >= 0) platLoad[p]++;
	}
}

double Sim::reachIn(int t, double x, double y) {
	if (fixedTile(t)) return 0;
	const int w = grid->w, tx = t % w, ty = t / w;
	double pen = -INF;
	for (int k = 0; k < 8; k++) {
		const int nx = tx + NX[k], ny = ty + NY[k];
		const double fx = x - tx, fy = y - ty;
		const double ex = NX[k] > 0 ? 1 - fx : NX[k] < 0 ? fx : 0, ey = NY[k] > 0 ? 1 - fy : NY[k] < 0 ? fy : 0;
		const double d = js::hypot(ex, ey);
		if (d >= RADIUS || RADIUS - d <= pen) continue;
		const int n = nx < 0 || ny < 0 || nx >= w || ny >= grid->h ? -1 : ny * w + nx;
		if (n >= 0 && (grid->can_enter(t, n) || fixedTile(n))) continue;
		pen = RADIUS - d;
		const double vx = NX[k] > 0 ? -ex : NX[k] < 0 ? ex : 0, vy = NY[k] > 0 ? -ey : NY[k] < 0 ? ey : 0;
		const double l = js::hypot(vx, vy);
		if (l > 1e-9) outX = vx / l, outY = vy / l;
		else outX = -NX[k], outY = -NY[k];
	}
	return pen;
}

void Sim::tryMove(Unit &u, double dx, double dy) {
	const int from = grid->tile_at(u.x, u.y);
	const int pf = grid->plat[from];
	const double pen0 = std::max(0.0, reachIn(from, u.x, u.y)) + 1e-6;
	auto slide = [&](double x, double y) {
		const int t = grid->tile_at(x, y);
		return t >= 0 && (t == from || grid->can_enter(from, t)) ? std::max(0.0, reachIn(t, x, y) - pen0 + 1e-4) : 0.0;
	};
	auto ok = [&](double x, double y) {
		const int t = grid->tile_at(x, y);
		if (t < 0) return false;
		if (t != from && !grid->can_enter(from, t)) return false;
		if (reachIn(t, x, y) > pen0) return false;
		if (t == from) return true;
		const int w = grid->w, fx = from % w, fy = from / w, tx = t % w, ty = t / w;
		if (fx != tx && fy != ty && !(grid->span[from] && grid->span[t]) && !grid->can_enter(from, fy * w + tx) && !grid->can_enter(from, ty * w + fx)) return false;
		if (anySafe && safeMask[t] && !safeMask[from] && !safeEntry(u)) return false; // M6d: the gate refuses him
		const int p = grid->plat[t];
		if (p < 0 || p == pf) return true;
		const auto it = platLoad.find(p);
		return (it == platLoad.end() ? 0 : it->second) < platCap(p);
	};
	double tx = 0, ty = 0, pen = 0;
	if (ok(u.x + dx, u.y + dy)) {
		u.x += dx;
		u.y += dy;
	} else if ((pen = slide(u.x + dx, u.y + dy)) > 0 && ((tx = dx + outX * pen), (ty = dy + outY * pen), ok(u.x + tx, u.y + ty))) {
		u.x += tx;
		u.y += ty;
	} else if (ok(u.x + dx, u.y)) u.x += dx;
	else if (ok(u.x, u.y + dy)) u.y += dy;
	else return;
	const int p = grid->plat[grid->tile_at(u.x, u.y)];
	if (p != pf) {
		if (pf >= 0) platLoad[pf]--;
		if (p >= 0) platLoad[p]++;
	}
}

bool Sim::ghost(Unit &a, Unit &b) {
	return (a.squad->team == b.squad->team && (!a.job.empty() || !b.job.empty() || grid->deck[grid->tile_at(a.x, a.y)] > DECK || grid->deck[grid->tile_at(b.x, b.y)] > DECK)) ||
			(a.squad == b.squad && (a.back || b.back)) || meet(a, b);
}

bool Sim::meet(Unit &a, Unit &b) {
	return a.vx * b.vx + a.vy * b.vy < -0.3 &&
			((!!bridgeAt(grid->tile_at(a.x, a.y)) && !!bridgeAt(grid->tile_at(b.x, b.y))) || (a.squad->team == b.squad->team && (a.squad != b.squad || a.squad->side == 0) && a.toSlot && b.toSlot && tight(a) && tight(b)));
}

bool Sim::tight(Unit &u) const {
	const int t = grid->tile_at(u.x, u.y), tx = t % grid->w, ty = t / grid->w;
	for (int y = ty - 2; y <= ty + 2; y++)
		for (int x = tx - 2; x <= tx + 2; x++) {
			if (x < 0 || y < 0 || x >= grid->w || y >= grid->h) return true;
			const int n = y * grid->w + x;
			if (double(grid->cost[n]) <= 0 || std::abs(int(grid->height[n]) - int(grid->height[t])) >= 2) return true;
		}
	return false;
}

bool Sim::atEase(Unit &u) const { return u.settled && !u.striking && !u.working && u.job.empty() && !u.squad->fixed && !u.squad->task && u.squad->siege < 0; }
bool Sim::shoves(Unit &u, Unit &o) const { return u.squad->team == o.squad->team && u.squad != o.squad && atEase(o) && passing(u); }
bool Sim::passing(Unit &u) const { return (u.vx != 0 || u.vy != 0) && u.toSlot && u.want > PASS && u.squad->pi < double(u.squad->path.size()) / 2; }

void Sim::separate() {
	std::fill(head.begin(), head.end(), -1);
	for (size_t i = 0; i < units.size(); i++) {
		if (!units[i]->alive) continue;
		const int c = grid->tile_at(units[i]->x, units[i]->y);
		next[i] = head[c];
		head[c] = int32_t(i);
	}
	const double MIN = 2 * RADIUS;
	for (size_t i = 0; i < units.size(); i++) {
		Unit &u = *units[i];
		if (!u.alive) continue;
		const int cx = int(std::floor(u.x));
		const int cy = int(std::floor(u.y));
		for (int yy = std::max(0, cy - 1); yy <= std::min(grid->h - 1, cy + 1); yy++) {
			for (int xx = std::max(0, cx - 1); xx <= std::min(grid->w - 1, cx + 1); xx++) {
				for (int j = head[yy * grid->w + xx]; j != -1; j = next[j]) {
					if (j <= int(i)) continue;
					Unit &o = *units[j];
					double ex = u.x - o.x;
					double ey = u.y - o.y;
					const double e = js::hypot(ex, ey);
					if (e >= MIN || (u.fighting && o.fighting) || ghost(u, o)) continue;
					if (e < 1e-8) {
						ex = u.id < o.id ? 1 : -1;
						ey = 0;
					} else {
						ex /= e;
						ey /= e;
					}
					bool uFix = (u.settled && !bridgeAt(grid->tile_at(u.x, u.y))) || u.striking || u.working;
					bool oFix = (o.settled && !bridgeAt(grid->tile_at(o.x, o.y))) || o.striking || o.working;
					if (u.squad->team == o.squad->team && u.squad != o.squad && uFix != oFix) {
						if (uFix && atEase(u) && passing(o)) uFix = false, oFix = true;
						else if (oFix && atEase(o) && passing(u)) oFix = false, uFix = true;
					}
					const double k = u.pin ? 0 : o.pin ? 1 : uFix == oFix ? 0.5 : uFix ? 0 : 1;
					if (u.pin && o.pin) continue;
					const double gap = MIN - e;
					grid->team = u.squad->team;
					if (k > 0) tryMove(u, ex * gap * k, ey * gap * k);
					grid->team = o.squad->team;
					if (k < 1) tryMove(o, -ex * gap * (1 - k), -ey * gap * (1 - k));
				}
			}
		}
	}
}

void Sim::speedOf(Squad &s) {
	double m = INF;
	for (Unit *u : s.units)
		if (u->alive) m = std::min(m, u->st.speed * pace(u->sat));
	if (m < INF) s.speed = m;
}

bool Sim::biteFrom(Unit &u, Hold *h) {
	if (!h) return false;
	const HungerRules &H = data().food.HUNGER;
	for (const auto &[r, v] : { std::pair<const char *, double>{ "ration", H.ration }, { "food", H.food } }) {
		if (amount(*h, r) < 1) continue;
		take(*h, r, 1);
		u.sat = std::min(H.max, u.sat + v);
		return true;
	}
	return false;
}

void Sim::refill(Unit &, Hold &pack, const std::vector<Hold *> &from) {
	const HungerRules &H = data().food.HUNGER;
	double want = H.kit - std::floor(amount(pack, "ration"));
	for (Hold *h : from) {
		if (want <= 0) return;
		const double n = std::min(want, std::floor(amount(*h, "ration")));
		if (n > 0) put_lots(pack, take(*h, "ration", n)), want -= n;
	}
	for (Hold *h : from) {
		if (want <= 0) return;
		const double n = std::min(want, std::floor(amount(*h, "food") / H.packFood));
		if (n > 0) take(*h, "food", n * H.packFood), put_lots(pack, { Lot{ "ration", n, region.id, std::nullopt } }), want -= n;
	}
	// W-80: stub until the room port: no larder offline
}

void Sim::hungerTick() {
	const HungerRules &H = data().food.HUNGER;
	const double sec = H.every * DT;
	for (Unit *up : units) {
		Unit &u = *up;
		if (!u.alive || u.squad->team == MOB_TEAM || u.squad->team == NEUTRAL_TEAM) continue;
		const int was = hunger_stage(u.sat), team = u.squad->team;
		u.sat = std::max(0.0, u.sat - H.decay * sec * townLv->perk_at(team, u.x, u.y).hunger); // W-61: a levelled town's food keeps
		const bool shortOf = !u.squad->civ && (!u.pack || amount(*u.pack, "ration") < H.kit - 1e-9);
		Hold *st = shortOf || u.sat < H.eatAt ? works->store_near(team, u.x, u.y, H.storeR) : nullptr;
		if (st && shortOf) {
			if (!u.pack) u.pack = new_hold();
			refill(u, *u.pack, { st, &works->reserve_of(team) });
		}
		if (u.sat < H.eatAt && !biteFrom(u, u.pack ? &*u.pack : nullptr) && st && !biteFrom(u, st)) biteFrom(u, &works->reserve_of(team));
		const int now = hunger_stage(u.sat);
		if (now == 2 && u.hp > u.maxHp * H.floor) u.hp = std::max(u.maxHp * H.floor, u.hp - u.maxHp * H.drain * sec);
		if (now != was) speedOf(*u.squad);
	}
}

std::shared_ptr<Order> Sim::resumeOf(Squad &s) const {
	auto o = std::make_shared<Order>();
	o->squad = s.id;
	o->has_squad = true;
	if (s.order == "civWork") o->kind = "civWork", o->building = s.work;
	else if (s.order == "gather") {
		o->kind = "gather";
		o->node = s.node;
		if (s.cartDrop >= 0) o->cart = s.cartDrop;
	} else if (s.order == "build" && !s.sites.empty()) o->kind = "build", o->site = s.sites[0];
	else return nullptr;
	return o;
}

void Sim::workScan() {
	for (Squad *sp : squads) {
		Squad &s = *sp;
		if (s.alive == 0 || s.team == MOB_TEAM) continue;
		if (s.order == "gather" && s.cartDrop >= 0) {
			const SiegeEngine *e = siege->get(s.cartDrop);
			if (!e || e->state == "destroyed" || e->owner != s.owner) s.cartDrop = -1;
			else if (siege->cart_cap(s.cartDrop) - loads(*e->hold) <= 1e-6) {
				Order c;
				c.kind = "crew";
				c.squad = s.id;
				c.has_squad = true;
				c.siege = s.cartDrop;
				apply(c);
			}
		}
		if (s.civ) continue;
		if (s.order == "gather" || s.order == "build") {
			bool struck = false;
			for (Unit *u : s.units)
				if (u->alive && u->tag > tick) {
					struck = true;
					break;
				}
			if (s.near.empty() || !struck) continue;
			Squad *foe = s.near[0];
			for (Squad *o : s.near)
				if (dist2(s, *o) < dist2(s, *foe)) foe = o;
			std::shared_ptr<Order> r = resumeOf(s);
			Order a;
			a.kind = "attack";
			a.squad = s.id;
			a.has_squad = true;
			a.target = foe->id;
			apply(a);
			s.resume = r;
			s.atEase = 0;
		} else if (s.resume && s.order == "hold") {
			if (!s.near.empty()) s.atEase = 0;
			else if ((s.atEase += SCAN) >= data().civilians.CIV.calm) {
				const std::shared_ptr<Order> r = s.resume;
				s.resume.reset();
				apply(*r);
			}
		}
	}
}

void Sim::feed(int team, int squad, const std::string &res, double n) {
	std::vector<Hold *> slots;
	if (squad >= 0) {
		// cargo({ squad }): the living men of the squad, a pack each
		for (Unit *u : units)
			if (u->alive && u->squad->id == squad) {
				if (!u->pack) u->pack = new_hold();
				slots.push_back(&*u->pack);
			}
	} else {
		for (const BuildingSnap &b : works->building_snaps())
			if (b.team == team && building(b.type).store && b.state == "done") {
				// cargo({ building }): its hold
				if (Hold *hd = works->hold_of(b.id)) slots.push_back(hd);
				break;
			}
	}
	for (Hold *h : slots) put(*h, res, n / slots.size(), "scenario");
}

void Sim::setSatiety(const std::vector<int> &ids, double sat) {
	const std::set<int> of(ids.begin(), ids.end());
	for (Unit *u : units) {
		if (!u->alive || !of.count(u->id)) continue;
		u->sat = std::max(0.0, std::min(data().food.HUNGER.max, sat));
		speedOf(*u->squad);
	}
}

PerkFx Sim::fxOf(const std::string &owner) const {
	const PlayerPath w = pathFor(owner);
	return perk_fx(w.path, w.level.value_or(1));
}

void Sim::perkSites(const std::string &owner, const std::vector<int> &ids) {
	const PerkFx fx = fxOf(owner);
	if (fx.siteCost || fx.siteHp)
		for (int id : ids) works->perk_site(id, fx.siteCost, fx.siteHp);
}

// W-84: what the cart owner's perks add
SiegeCartFx SimSiegeHost::cartFx(const std::string &owner) {
	const PerkFx fx = s->fxOf(owner);
	return { fx.cartLoads, fx.cartSpeed, fx.cartHp };
}

// setBonus: a bonus with no field clears the team's
void Sim::setBonus(int team, const TeamBonus &b) {
	if (b.repairCost || b.sight) bonuses[team] = b;
	else bonuses.erase(team);
}

int Sim::spawn_squad(const std::string &owner, int team, const std::string &cls, int count, double x, double y, const std::vector<WarPerson> *persons) {
	// M5b: one man per person, each with his own baked stats
	std::optional<std::vector<WarPerson>> ps;
	if (persons) ps.emplace(persons->begin(), persons->begin() + std::min(persons->size(), size_t(SQUAD_MAX)));
	const auto isCiv = [](const std::optional<std::string> &c) { return c && !civ_job(*c).empty(); };
	count = ps ? int(ps->size()) : std::min(count, SQUAD_MAX);
	// M5f: civilians only within the team's share of the civilian quota (-1: no room, no squad)
	if (ps ? std::any_of(ps->begin(), ps->end(), [&](const WarPerson &p) { return isCiv(p.hero.cls); }) : !civ_job(cls).empty()) {
		double room = civRoom(team);
		if (ps) {
			std::vector<WarPerson> kept;
			for (const WarPerson &p : *ps)
				if (!isCiv(p.hero.cls) || room-- > 0) kept.push_back(p);
			*ps = std::move(kept);
		} else count = int(std::min(double(count), std::max(0.0, room)));
		if (ps) count = int(ps->size());
		if (count == 0) return -1;
	}
	const auto [ax, ay] = openPoint(x, y);
	std::vector<WarStats> sts;
	if (ps)
		for (const WarPerson &p : *ps) sts.push_back(with_perks(war_stats_of(p), fxOf(owner)));
	const WarStats st = !sts.empty() ? sts[0] : data().classes.of(cls);
	Squad *s = new Squad();
	s->id = int(squads.size());
	s->owner = owner;
	s->team = team;
	s->alive = count;
	s->shape = Shape::Line;
	s->offsets = formation_offsets(Shape::Line, count, rng);
	s->ax = ax, s->ay = ay, s->cx = ax, s->cy = ay;
	s->speed = st.speed;
	s->ranged = st.range > 0;
	s->ramp = RAMP_FROM;
	s->amx = ax, s->amy = ay;
	s->civ = ps ? std::all_of(ps->begin(), ps->end(), [&](const WarPerson &p) { return isCiv(p.hero.cls); }) : !civ_job(cls).empty();
	s->meek = team == NEUTRAL_TEAM;
	grid->team = team;
	squads.push_back(s);
	for (int k = 0; k < count; k++) {
		const auto [sx, sy] = slotPos(*s, k);
		double px = sx, py = sy;
		if (!grid->line_clear(ax, ay, sx, sy)) {
			px = ax + (-0.2 + (0.2 - -0.2) * rng.next());
			py = ay + (-0.2 + (0.2 - -0.2) * rng.next());
		}
		const WarStats &ust = k < int(sts.size()) ? sts[k] : st;
		const std::string ucls = ps ? (*ps)[k].hero.cls.value_or(cls) : cls;
		Unit *u = new Unit();
		u->id = int(units.size());
		u->squad = s;
		u->Worker::squad = s;
		u->slot = k;
		u->x = px, u->y = py;
		u->hp = u->maxHp = ust.maxHp;
		u->cls = ucls;
		u->st = ust;
		u->stKey = ps ? st_fresh() : st_class(cls);
		u->ammo = ust.ammo;
		u->spd = RAMP_FROM;
		u->wx = px, u->wy = py;
		u->best = INF;
		u->ox = px, u->oy = py;
		u->sat = data().food.HUNGER.max;
		u->bx = px, u->by = py;
		if (ps) u->person = (*ps)[k];
		u->civ = civ_job(ucls);
		setRates(*u);
		if (!u->civ.empty()) civs.push_back(u);
		units.push_back(u);
		s->units.push_back(u);
	}
	if (ps) reslot(*s); // speed and ranged from the men themselves
	scanNear();
	return s->id;
}

void Sim::step() {
	std::vector<Order> q;
	q.swap(queue);
	for (const Order &o : q) apply(o);
	for (Squad *s : squads) {
		if (s->actUntil == tick) s->out = s->inn = 1;
		if (s->alive == 0) continue;
		double x = 0;
		double y = 0;
		for (Unit *u : s->units) {
			if (!u->alive) continue;
			x += u->x;
			y += u->y;
		}
		s->cx = x / s->alive;
		s->cy = y / s->alive;
	}
	grid->flush_sectors();
	if (tick % SCAN == 0) scanNear();
	if (!civs.empty() && tick % SCAN == 0) civScan();
	if (tick % SCAN == 0) workScan();
	if (tick % int(data().economy.STAFF.every) == 0) {
		// W-88: who stands at what
		std::vector<StaffMan> men;
		men.reserve(units.size());
		for (const Unit *u : units) men.push_back({ u->alive, u->x, u->y, u->squad->team });
		works->staff_scan(men, MOB_TEAM);
	}
	if (!civs.empty() && tick % int(data().civilians.CIV.every) == 0) civTick();
	if (tick % int(data().food.HUNGER.every) == 0) hungerTick();
	if (downs > 0 && tick % int(data().food.HUNGER.every) == 0) riseTick();
	wildTick(); // souls, mobs, roam, secrets, bosses, towns
	townLv->tick(tick);
	landmarks->tick(tick);
	for (Squad *s : squads) {
		if (s->alive == 0) continue;
		if (s->order == "attack") grid->team = s->team, updateAttack(*s);
		else if (s->order == "attackMove") grid->team = s->team, updateAttackMove(*s);
		else if (s->order == "escort") grid->team = s->team, escortTick(*s);
	}
	for (double budget = PATH_BUDGET; budget > 0 && !pathQueue.empty();) {
		Squad *s = pathQueue.front();
		pathQueue.pop_front();
		if (!s->goal) continue;
		budget -= js::hypot(s->goal->first - s->ax, s->goal->second - s->ay);
		grid->team = s->team;
		pathTo(*s, s->goal->first, s->goal->second);
		s->goal.reset();
	}
	works->tick();
	for (size_t k = 0; k < UNIT_PATHS_PER_TICK && !unitPathQueue.empty(); k++) {
		Unit *u = unitPathQueue.front();
		unitPathQueue.pop_front();
		u->ownReq = false;
		if (!u->alive) continue;
		grid->team = u->squad->team;
		const auto [tx, ty] = u->back ? std::make_pair(u->bx, u->by) : slotPos(*u->squad, u->slot);
		u->own = cornerPath(u->x, u->y, tx, ty);
		if (u->squad->fixed) u->settled = false, u->best = INF, u->stall = 0;
		u->oi = 1;
	}
	for (Squad *s : squads) stepSquad(*s);
	for (Unit *u : units) u->doing = nullptr;
	siegeSquads();

	countPlatforms();
	std::fill(head.begin(), head.end(), -1);
	if (next.size() != units.size()) next.assign(units.size(), 0);
	for (size_t i = 0; i < units.size(); i++) {
		if (!units[i]->alive) continue;
		const int c = grid->tile_at(units[i]->x, units[i]->y);
		next[i] = head[c];
		head[c] = int32_t(i);
	}

	const double R2 = 4 * RADIUS * RADIUS;
	auto freeAt = [&](double x, double y, int i) {
		const int cx = int(std::floor(x));
		const int cy = int(std::floor(y));
		for (int yy = std::max(0, cy - 1); yy <= std::min(grid->h - 1, cy + 1); yy++)
			for (int xx = std::max(0, cx - 1); xx <= std::min(grid->w - 1, cx + 1); xx++)
				for (int j = head[yy * grid->w + xx]; j != -1; j = next[j])
					if (j != i && sq(units[j]->x - x) + sq(units[j]->y - y) < R2) return false;
		return true;
	};
	for (size_t ii = 0; ii < units.size(); ii++) {
		const int i = int(ii);
		Unit &u = *units[i];
		if (!u.alive) continue;
		if (u.pin) {
			u.fighting = u.striking = false;
			u.tgt = nullptr;
			u.ox = u.x;
			u.oy = u.y;
			u.want = -1;
			u.settled = true;
			continue;
		}
		const double ox = u.x;
		const double oy = u.y;
		grid->team = u.squad->team;
		// act: TS null (to its slot), a point (closing on a foe) or the unit itself (stands: works, a task, a blow)
		bool self = false, point = false;
		double apx = 0, apy = 0;
		if (u.back) {
			u.fighting = u.striking = u.working = false;
			u.tgt = nullptr;
			if (u.cd > 0) u.cd--;
		} else if (!u.job.empty()) {
			u.fighting = u.striking = false;
			u.tgt = nullptr;
			const sim::Act w = works->work(u);
			if (w.kind == sim::Act::HERE) self = true;
			else if (w.kind == sim::Act::POINT) point = true, apx = w.x, apy = w.y;
		} else if (u.squad->task) {
			u.working = false;
			self = taskAct(u) != nullptr; // the man himself (stands at the task) or TS null (to his slot)
		} else {
			u.working = false;
			const Act a = fight(u, apx, apy);
			self = a == Self;
			point = a == Point;
		}
		const bool actNull = !self && !point;
		double dx = 0;
		double dy = 0;
		double d = 0;
		if (!self) {
			const auto [tx, ty] = point ? std::make_pair(apx, apy) : unitTarget(u);
			dx = tx - u.x;
			dy = ty - u.y;
			d = js::hypot(dx, dy);
			Squad &s = *u.squad;
			if (actNull && atEnd(s) && !s.goal && s.siege < 0 && !u.crossing) {
				if (u.settled) {
					const double k = std::min(1.0, (3 * RADIUS) / std::max(d, 1e-6));
					const bool retry = d > ARRIVE && (tick + u.id) % RETRY == 0 && freeAt(tx, ty, i) && freeAt(u.x + dx * k, u.y + dy * k, i);
					if (d > u.settleD + WAKE || (retry && grid->line_clear(u.x, u.y, tx, ty))) {
						u.settled = false;
						u.best = d;
						u.stall = 0;
					}
				} else if (d < u.best - 0.02) {
					u.best = d;
					u.stall = 0;
				} else if (++u.stall > STALL) u.best = 0;
				if (!u.settled && (d <= ARRIVE || u.best == 0)) {
					u.settled = true;
					u.settleD = d;
				}
			} else {
				u.settled = false;
				u.best = INF;
				u.stall = 0;
			}
			if (u.settled) d = 0;
		} else u.settled = false;
		if (d > ARRIVE || (d > 1e-4 && actNull && eases(*u.squad) && !atEnd(*u.squad))) {
			const double cost = moveCost(u.x, u.y, dx / d, dy / d);
			const double full = (SPEED * u.st.speed * pace(u.sat) * flee_pace(u.squad->flee) * (u.squad->laden ? data().trade.PORTER.slow : 1) * (!u.mob.empty() && u.dash > tick ? data().mobs.MOBS.at(u.mob).dash->speed : 1) * (u.slowUntil > tick ? data().boss_sim.BOSS_SLOW : 1) * CATCH_UP * DT) / cost;
			double stp = std::min(d, full);
			if (actNull && eases(*u.squad)) {
				Squad &s = *u.squad;
				if (atEnd(s) && !s.goal) {
					stp = std::min(std::min(d, full * u.spd), std::max(SETTLE_MIN, d * SETTLE_K));
					u.spd = std::min(1.0, u.spd + RAMP_UP);
				}
			}
			double hx = dx / d, hy = dy / d;
			if (d > 1 && !u.fighting && (u.vx || u.vy) && hx * u.vx + hy * u.vy > 0) {
				hx += (u.vx - hx) * INERTIA;
				hy += (u.vy - hy) * INERTIA;
				const double l = js::hypot(hx, hy);
				hx /= l;
				hy /= l;
			}
			u.vx = hx;
			u.vy = hy;
			dx = u.vx * stp;
			dy = u.vy * stp;
		} else {
			dx = 0;
			dy = 0;
			u.vx = 0;
			u.vy = 0;
			u.spd = RAMP_FROM;
		}
		bool yielded = false;
		const int cx = int(std::floor(u.x));
		const int cy = int(std::floor(u.y));
		for (int yy = u.settled && !bridgeAt(grid->tile_at(u.x, u.y)) ? grid->h : cy - 1; yy <= cy + 1; yy++) {
			if (yy < 0 || yy >= grid->h) continue;
			for (int xx = cx - 1; xx <= cx + 1; xx++) {
				if (xx < 0 || xx >= grid->w) continue;
				for (int j = head[yy * grid->w + xx]; j != -1; j = next[j]) {
					if (j == i) continue;
					Unit &o = *units[j];
					const bool squeeze = meet(u, o) && u.squad->side != 0 && !fixedTile(grid->tile_at(u.x, u.y)) && !fixedTile(grid->tile_at(o.x, o.y));
					if ((!squeeze && ghost(u, o)) || shoves(u, o)) continue;
					const double ex = u.x - o.x;
					const double ey = u.y - o.y;
					const double e2 = ex * ex + ey * ey;
					if (!yielded && e2 < YIELD_R * YIELD_R && u.vx * o.vx + u.vy * o.vy < -0.3 && ex * u.vx + ey * u.vy < 0) {
						yielded = true;
						const double k = squeeze ? YIELD_TIGHT : YIELD;
						dx -= u.vy * k;
						dy += u.vx * k;
					}
					if (squeeze || e2 >= R2) continue;
					if (e2 < 1e-8) {
						dx += u.id < o.id ? 0.05 : -0.05;
						continue;
					}
					const double e = std::sqrt(e2);
					const double push = ((2 * RADIUS - e) * PUSH) / 2;
					dx += (ex / e) * push;
					dy += (ey / e) * push;
				}
			}
		}
		if (dx || dy) {
			for (int yy = cy - 1; yy <= cy + 1; yy++) {
				if (yy < 0 || yy >= grid->h) continue;
				for (int xx = cx - 1; xx <= cx + 1; xx++) {
					if (xx < 0 || xx >= grid->w) continue;
					for (int j = head[yy * grid->w + xx]; j != -1; j = next[j]) {
						if (j == i) continue;
						Unit &o = *units[j];
						const double px = u.x + dx - o.x;
						const double py = u.y + dy - o.y;
						const double p2 = px * px + py * py;
						if (p2 >= R2 || p2 < 1e-8 || (u.fighting && o.fighting) || ghost(u, o) || shoves(u, o)) continue;
						const double now = js::hypot(u.x - o.x, u.y - o.y);
						const double p = std::sqrt(p2);
						if (p >= now) continue;
						const double keep = std::min(2 * RADIUS, now) / p;
						dx = o.x + px * keep - u.x;
						dy = o.y + py * keep - u.y;
					}
				}
			}
		}
		tryMove(u, dx, dy);
		u.ox = ox;
		u.oy = oy;
		u.want = self ? -1 : d;
		u.toSlot = actNull;
	}
	for (int k = 0; k < 3; k++) separate();
	tradeTick();
	if (tick % SCAN == 0) piles->tick(tick);
	if (anySafe && tick % SCAN == 0) safeTick();
	if (tick % HOLD_EVERY == 0) raidScan();
	keepToLanes();
	for (Unit *up : units) {
		Unit &u = *up;
		if (!u.alive) continue;
		const double mx = u.x - u.ox;
		const double my = u.y - u.oy;
		u.moving = mx * mx + my * my > 1e-4;
		if (u.want >= 0 && !(u.civAt && !u.moving)) {
			if (!(u.moving && u.want > ARRIVE)) u.facing = u.squad->facing;
			else if (mx * mx + my * my > sq(SHOVE * SPEED * u.st.speed * DT)) {
				const double turn = js::atan2(js::sin(js::atan2(my, mx) - u.facing), js::cos(js::atan2(my, mx) - u.facing));
				u.facing += std::max(-FACE_RATE, std::min(FACE_RATE, turn));
			}
		}
		if (u.toSlot && u.want > 0.5 && !u.moving) {
			if (++u.stuck > STUCK_TICKS && !u.ownReq && u.own.empty()) {
				u.ownReq = true;
				unitPathQueue.push_back(&u);
			}
		} else if (!u.job.empty() && u.want > 0.5 && !u.moving) {
			if (++u.stuck > STUCK_TICKS) u.stuck = 0, u.wgx = u.wgy = -1;
		} else u.stuck = 0;
		if ((tick + u.id) % STUCK_WINDOW == 0) {
			if (u.toSlot && u.want > 0.5 && !u.ownReq && sq(u.x - u.wx) + sq(u.y - u.wy) < STUCK_NET * STUCK_NET) {
				u.own.clear();
				u.ownReq = true;
				unitPathQueue.push_back(&u);
			}
			u.wx = u.x;
			u.wy = u.y;
		}
	}
	if (tick % STAKES_EVERY == 0) stakes();
	land();
	siege->tick(tick);
	for (Squad *s : reslotQueue) reslot(*s);
	reslotQueue.clear();
	if (!shots.empty()) shots.erase(std::remove_if(shots.begin(), shots.end(), [&](const Shot &sh) { return !(sh.t1 > tick); }), shots.end());
	std::vector<VisionUnit> vu;
	vu.reserve(units.size());
	for (Unit *u : units) vu.push_back({ u->x, u->y, u->alive, u->squad->team, data().classes.sight_of(u->cls) });
	std::vector<VisionBuilding> vb;
	for (const BuildingSnap &b : works->building_snaps()) {
		VisionBuilding v = vision_building(b);
		v.snap = std::make_shared<BuildingSnap>(b);
		vb.push_back(std::move(v));
	}
	std::map<int, int> sightAdd; // sightAdd(team): bonuses.get(team)?.sight ?? 0 (whole tiles, as the vision's keys hold them)
	for (const auto &[team, b] : bonuses)
		if (b.sight) sightAdd[team] = int(*b.sight);
	vision.tick(tick, vu, vb, sightAdd);
	tick++;
}

} // namespace sim

namespace godot {

Sim::~Sim() {
	delete bots;
	delete s;
}

Ref<Sim> Sim::create(const Ref<Grid> &grid, const Dictionary &meta, const PackedByteArray &cells, int64_t seed) {
	Ref<Sim> r;
	ERR_FAIL_COND_V_MSG(grid.is_null(), r, "Sim.create: no grid");
	ERR_FAIL_COND_V_MSG(!SimData::loaded(), r, "Sim.create: SimData.load first");
	ERR_FAIL_COND_V_MSG(cells.size() != int64_t(grid->g.w) * grid->g.h * 2, r, "Sim.create: cells do not fit the grid");
	r.instantiate();
	r->grid = grid;
	r->built = grid->g;
	r->meta = meta;
	r->cells = cells;
	r->seed = seed;
	sim::WorksRegion region;
	sim::works_region_of(meta, cells, grid->g.w * grid->g.h, region);
	r->s = new sim::Sim(grid->g, std::move(region), meta, uint32_t(seed));
	r->bots = new sim::Bots(r->s);
	return r;
}

int Sim::spawn_squad(const String &owner, int team, const String &cls, int count, double x, double y, const Variant &persons) {
	if (persons.get_type() != Variant::ARRAY) return s->spawn_squad(owner.utf8().get_data(), team, cls.utf8().get_data(), count, x, y);
	std::vector<sim::WarPerson> ps;
	const Array a = persons;
	for (int64_t i = 0; i < a.size(); i++) ps.push_back(sim::war_person_from(a[i]));
	return s->spawn_squad(owner.utf8().get_data(), team, cls.utf8().get_data(), count, x, y, &ps);
}

void Sim::set_paths(const Variant &paths) {
	if (paths.get_type() != Variant::DICTIONARY) {
		s->pathOf = nullptr;
		return;
	}
	std::map<std::string, sim::PlayerPath> by; // lookup only
	const Dictionary d = paths;
	const Array ks = d.keys();
	for (int64_t i = 0; i < ks.size(); i++) by[String(ks[i]).utf8().get_data()] = sim::player_path_from(d[ks[i]]);
	s->pathOf = [by](const std::string &owner) {
		const auto it = by.find(owner);
		return it != by.end() ? it->second : sim::NO_PATH;
	};
}

void Sim::set_bonus(int team, const Dictionary &b) {
	sim::Sim::TeamBonus t;
	if (b.has("repairCost")) t.repairCost = double(b["repairCost"]);
	if (b.has("sight")) t.sight = double(b["sight"]);
	const Array ks = b.keys();
	for (int64_t i = 0; i < ks.size(); i++) t.keys.push_back(String(ks[i]).utf8().get_data());
	s->setBonus(team, t);
}

bool Sim::spawn_named_soul(const Dictionary &person, double life, const Variant &bar) {
	std::optional<std::pair<std::string, double>> b;
	if (bar.get_type() == Variant::DICTIONARY) {
		const Dictionary d = bar;
		b = std::make_pair(std::string(String(d["owner"]).utf8().get_data()), double(d["ticks"]));
	}
	return s->spawnNamedSoul(sim::war_person_from(person), life, b);
}

Array Sim::events() {
	Array out;
	for (const Dictionary &e : s->events()) out.push_back(e);
	return out;
}

Array Sim::piles() {
	Array out;
	for (const sim::Pile &p : s->piles->piles) {
		Array e;
		e.push_back(p.id);
		e.push_back(p.x);
		e.push_back(p.y);
		sim::Cost c;
		sim::totals(p.hold, c);
		Dictionary g;
		for (const auto &kv : c.kv) g[String::utf8(kv.first.c_str())] = kv.second;
		e.push_back(g);
		Array items;
		for (const sim::HoldItem &it : sim::item_list(p.hold)) {
			Array i;
			i.push_back(String::utf8(it.uid.c_str()));
			i.push_back(String::utf8(it.def.c_str()));
			i.push_back(String::utf8(it.rarity.c_str()));
			items.push_back(i);
		}
		e.push_back(items);
		e.push_back(int64_t(p.hold.items.size()));
		out.push_back(e);
	}
	return out;
}

int64_t Sim::fog_sum(int team) {
	int64_t n = 0;
	for (uint8_t v : s->vision.team(team).state) n += v;
	return n;
}

PackedByteArray Sim::fog_state(int team) {
	const std::vector<uint8_t> &st = s->vision.team(team).state;
	PackedByteArray out;
	out.resize(st.size());
	if (!st.empty()) memcpy(out.ptrw(), st.data(), st.size());
	return out;
}

Vector3i Sim::fog_size() {
	return Vector3i(s->vision.cells.cw, s->vision.cells.ch, sim::VISION.cell);
}

Dictionary Sim::view_state() {
	Dictionary out;
	Array us;
	for (const sim::Unit *u : s->units) {
		Array a;
		a.push_back(u->id);
		a.push_back(u->maxHp);
		a.push_back(String(u->cls.c_str()));
		a.push_back(String(u->person ? u->person->id.c_str() : ""));
		a.push_back(u->person ? u->person->hero.level : 0.0);
		us.push_back(a);
	}
	out["units"] = us;
	Array bs;
	for (const sim::BuildingSnap &b : s->works->building_snaps()) {
		Array a;
		a.push_back(b.id);
		a.push_back(String(b.type.c_str()));
		a.push_back(b.team);
		a.push_back(b.x);
		a.push_back(b.y);
		a.push_back(b.w);
		a.push_back(b.h);
		a.push_back(b.rot);
		a.push_back(String(b.state.c_str()));
		a.push_back(b.progress);
		a.push_back(b.hp);
		a.push_back(b.maxHp);
		a.push_back(b.ruin);
		a.push_back(b.wet);
		a.push_back(b.fouled);
		a.push_back(b.delivered);
		PackedInt32Array t;
		for (int v : b.tiles) t.push_back(v);
		a.push_back(t);
		bs.push_back(a);
	}
	out["buildings"] = bs;
	return out;
}

static std::string u8(const Variant &v) { return String(v).utf8().get_data(); }

// src/war/types.ts HolderRef from its dictionary ({building} | {cart} | {pile})
static sim::HolderRef holder_ref_of(const Variant &v) {
	sim::HolderRef r;
	if (v.get_type() != Variant::DICTIONARY) return r;
	const Dictionary d = v;
	if (d.has("building")) r.building = int(d["building"]);
	if (d.has("cart")) r.cart = int(d["cart"]);
	if (d.has("pile")) r.pile = int(d["pile"]);
	return r;
}

sim::Order order_from(const Dictionary &d) {
	sim::Order o;
	o.src = d.duplicate(true);
	o.kind = u8(d.get("kind", ""));
	o.has_squad = d.has("squad");
	o.squad = o.has_squad ? int(d["squad"]) : -1;
	o.x = d.get("x", 0.0);
	o.y = d.get("y", 0.0);
	o.target = int(d.get("target", -1));
	o.shape = u8(d.get("shape", ""));
	const auto ints = [](const Variant &v) {
		std::vector<int> out;
		const Array a = v;
		for (int64_t i = 0; i < a.size(); i++) out.push_back(int(a[i]));
		return out;
	};
	if (d.has("units")) o.units = ints(d["units"]);
	if (d.has("unitIds")) o.unitIds = ints(d["unitIds"]);
	if (d.has("count")) o.count = double(d["count"]);
	o.into = int(d.get("into", -1));
	o.soul = int(d.get("soul", -1));
	o.point = int(d.get("point", -1));
	o.unit = int(d.get("unit", -1));
	o.act = u8(d.get("act", ""));
	if (d.has("access")) o.access = u8(d["access"]);
	if (d.has("share")) o.share = double(d["share"]);
	if (d.has("fee")) o.fee = double(d["fee"]);
	o.fort = u8(d.get("fort", ""));
	o.centre = int(d.get("centre", -1));
	o.pct = d.get("pct", 0.0);
	if (o.kind == "setLiege") {
		o.has_owner = d.has("owner");
		if (d.has("to") && d["to"].get_type() != Variant::NIL) o.to_owner = u8(d["to"]);
	}
	if (d.has("team")) o.team = int(d["team"]);
	o.type = u8(d.get("type", ""));
	o.rot = int(d.get("rot", 0));
	if (o.kind == "placeWall") o.wall = sim::wall_order_of(d);
	if (o.kind == "placeBridge") o.bridge = sim::bridge_order_of(d);
	o.site = int(d.get("site", -1));
	o.node = int(d.get("node", -1));
	o.building = int(d.get("building", -1));
	if (d.has("cart")) o.cart = int(d["cart"]);
	o.on = d.get("on", false);
	if (d.has("siege")) o.siege = int(d["siege"]);
	o.ladder = int(d.get("ladder", -1));
	o.pack = d.get("pack", false);
	if (d.has("wallTile")) {
		const Array w = d["wallTile"];
		o.wallTile = { int(w[0]), int(w[1]) };
	}
	o.from = holder_ref_of(d.get("from", Variant()));
	if (o.kind != "setLiege") o.to = holder_ref_of(d.get("to", Variant()));
	if (d.has("res")) o.res = u8(d["res"]);
	if (d.has("n")) o.n = double(d["n"]);
	o.send = d.get("send", false);
	o.pile = int(d.get("pile", -1));
	o.uid = u8(d.get("uid", ""));
	o.recipe = u8(d.get("recipe", ""));
	o.craftOrder = int(d.get("order", 0));
	o.owner = u8(d.get("owner", ""));
	if (d.has("by")) o.by = u8(d["by"]);
	if (d.has("item") && d["item"].get_type() == Variant::DICTIONARY) o.item = sim::item_from(d["item"]); // repair, salvage
	return o;
}

void Sim::order(const Dictionary &d) { s->order(order_from(d)); }

int Sim::spawn_soul(double x, double y, const String &cls, double level, const String &site) { return s->spawnSoul(x, y, cls.utf8().get_data(), level, site.utf8().get_data()); }

void Sim::hurt_boss(const String &id, double dmg, const String &owner, const Variant &part) {
	s->hurtBoss(id.utf8().get_data(), dmg, owner.utf8().get_data(), part.get_type() == Variant::NIL ? std::nullopt : std::optional<int>(int(part)));
}

int Sim::spawn_cart(int team, const String &owner, const String &type, double x, double y) { return s->spawnCart(team, owner.utf8().get_data(), type.utf8().get_data(), x, y); }

void Sim::step() { s->step(); }

String Sim::save() {
	sim::Grid g = built;
	sim::WorksRegion region;
	sim::works_region_of(meta, cells, g.w * g.h, region);
	sim::Sim fresh(g, std::move(region), meta, uint32_t(seed));
	return String::utf8(s->save(&fresh).c_str());
}

bool Sim::load(const String &text) {
	std::string why;
	const bool ok = s->load(text.utf8().get_data(), why);
	if (!ok) ERR_PRINT(String::utf8(("Sim.load: " + why).c_str()));
	return ok;
}

void Sim::claim(int team, double x, double y, const Variant &r) { s->claim(team, x, y, r.get_type() == Variant::NIL ? std::nullopt : std::optional<double>(double(r))); }
void Sim::add_stock(int team, const String &res, double n) { s->addStock(team, res.utf8().get_data(), n); }
void Sim::finish_bridges(int team) { s->finishBridges(team); }
void Sim::feed(int team, const Variant &squad, const String &res, double n) { s->feed(team, squad.get_type() == Variant::NIL ? -1 : int(squad), res.utf8().get_data(), n); }
void Sim::set_satiety(const Array &ids, double sat) {
	std::vector<int> v;
	for (int64_t i = 0; i < ids.size(); i++) v.push_back(int(ids[i]));
	s->setSatiety(v, sat);
}

bool Sim::set_bot(int squad, const Dictionary &d) {
	sim::Behaviour b;
	b.kind = u8(d.get("kind", ""));
	b.x = d.get("x", 0.0);
	b.y = d.get("y", 0.0);
	b.has_radius = d.has("radius");
	b.radius = d.get("radius", 0.0);
	if (d.has("via")) {
		const Array v = d["via"];
		b.via[0] = v[0];
		b.via[1] = v[1];
	}
	b.engine = u8(d.get("engine", ""));
	b.w = d.get("w", 0.0);
	b.h = d.get("h", 0.0);
	if (d.has("weak")) b.weak = double(d["weak"]);
	if (d.has("reach")) b.reach = double(d["reach"]);
	b.cart = int(d.get("cart", -1));
	if (d.has("path")) {
		const Array p = d["path"];
		for (int64_t i = 0; i < p.size(); i++) {
			const Array q = p[i];
			b.path.push_back({ double(q[0]), double(q[1]) });
		}
	}
	return bots->set(squad, b);
}

Dictionary Sim::digest() {
	Dictionary out;
	out["tick"] = s->tick;
	Array us;
	for (const sim::Unit *u : s->units) {
		// state as the snapshot gives it: in reach of a foe still standing, or the blow just dealt felled it
		const bool atk = u->alive && u->striking && ((u->tgt && u->tgt->alive) || u->swingAt == s->tick - 1 || u->squad->task);
		const char *state = !u->alive ? "dead" : atk ? "attack" : u->working ? (u->job.empty() ? "build" : u->job.c_str()) : u->moving ? "move" : "idle";
		Array a;
		a.push_back(u->id);
		a.push_back(u->squad->id);
		a.push_back(u->x);
		a.push_back(u->y);
		a.push_back(u->hp);
		a.push_back(String(state));
		a.push_back(u->facing);
		us.push_back(a);
	}
	out["units"] = us;
	Array qs;
	for (const sim::Squad *q : s->squads) {
		Array a;
		a.push_back(q->id);
		a.push_back(q->team);
		a.push_back(String(q->owner.c_str()));
		qs.push_back(a);
	}
	out["squads"] = qs;
	// buildings: [id, type, team, state, progress]; stock: {team: {res: n}} (JS integer keys, as strings)
	Array bs;
	for (const sim::BuildingSnap &b : s->works->building_snaps()) {
		Array a;
		a.push_back(b.id);
		a.push_back(String(b.type.c_str()));
		a.push_back(b.team);
		a.push_back(String(b.state.c_str()));
		a.push_back(b.progress);
		bs.push_back(a);
	}
	out["buildings"] = bs;
	Dictionary st;
	for (const auto &[team, c] : s->works->stock_snap()) {
		Dictionary g;
		for (const auto &[r, n] : c.kv) g[String(r.c_str())] = n;
		st[String::num_int64(team)] = g;
	}
	out["stock"] = st;
	return out;
}

void Sim::_bind_methods() {
	ClassDB::bind_static_method("Sim", D_METHOD("create", "grid", "meta", "cells", "seed"), &Sim::create);
	ClassDB::bind_method(D_METHOD("spawn_squad", "owner", "team", "cls", "count", "x", "y", "persons"), &Sim::spawn_squad, DEFVAL(Variant()));
	ClassDB::bind_method(D_METHOD("set_paths", "paths"), &Sim::set_paths);
	ClassDB::bind_method(D_METHOD("set_bonus", "team", "bonus"), &Sim::set_bonus);
	ClassDB::bind_method(D_METHOD("spawn_named_soul", "person", "life", "bar"), &Sim::spawn_named_soul, DEFVAL(Variant()));
	ClassDB::bind_method(D_METHOD("events"), &Sim::events);
	ClassDB::bind_method(D_METHOD("fog_sum", "team"), &Sim::fog_sum);
	ClassDB::bind_method(D_METHOD("fog_state", "team"), &Sim::fog_state);
	ClassDB::bind_method(D_METHOD("fog_size"), &Sim::fog_size);
	ClassDB::bind_method(D_METHOD("view_state"), &Sim::view_state);
	ClassDB::bind_method(D_METHOD("piles"), &Sim::piles);
	ClassDB::bind_method(D_METHOD("order", "order"), &Sim::order);
	ClassDB::bind_method(D_METHOD("spawn_mobs"), &Sim::spawn_mobs);
	ClassDB::bind_method(D_METHOD("spawn_roam"), &Sim::spawn_roam);
	ClassDB::bind_method(D_METHOD("spawn_soul", "x", "y", "cls", "level", "site"), &Sim::spawn_soul, DEFVAL(1.0), DEFVAL("shrine"));
	ClassDB::bind_method(D_METHOD("hurt_boss", "id", "dmg", "owner", "part"), &Sim::hurt_boss, DEFVAL("dev"), DEFVAL(Variant()));
	ClassDB::bind_method(D_METHOD("spawn_cart", "team", "owner", "type", "x", "y"), &Sim::spawn_cart);
	ClassDB::bind_method(D_METHOD("step"), &Sim::step);
	ClassDB::bind_method(D_METHOD("save"), &Sim::save);
	ClassDB::bind_method(D_METHOD("load", "text"), &Sim::load);
	ClassDB::bind_method(D_METHOD("claim", "team", "x", "y", "r"), &Sim::claim);
	ClassDB::bind_method(D_METHOD("add_stock", "team", "res", "n"), &Sim::add_stock);
	ClassDB::bind_method(D_METHOD("finish_bridges", "team"), &Sim::finish_bridges);
	ClassDB::bind_method(D_METHOD("set_satiety", "ids", "sat"), &Sim::set_satiety);
	ClassDB::bind_method(D_METHOD("feed", "team", "squad", "res", "n"), &Sim::feed);
	ClassDB::bind_method(D_METHOD("set_bot", "squad", "behaviour"), &Sim::set_bot);
	ClassDB::bind_method(D_METHOD("bots_tick"), &Sim::bots_tick);
	ClassDB::bind_method(D_METHOD("get_tick"), &Sim::get_tick);
	ClassDB::bind_method(D_METHOD("digest"), &Sim::digest);
}

} // namespace godot
