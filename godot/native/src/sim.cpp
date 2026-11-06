#include "sim.h"

#include <algorithm>
#include <cmath>
#include <numeric>
#include <tuple>

#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/core/error_macros.hpp>
#include <godot_cpp/variant/utility_functions.hpp>

#include "js_math.h"
#include "sim_data.h"

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

Sim::Sim(Grid &g, uint32_t seed) : grid(&g), rng(seed) {
	head.assign(size_t(grid->w) * grid->h, 0);
	// stub until works port: createWorks, works.prebuild(NEUTRAL_TEAM) (no pre-built pieces on the move maps)
	// stub until siege, crafting, mobs, secrets, bosses, roam, prebuilt, townLevel, landmarks ports: their create* calls
	vision.init(*grid);
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
	// stub until trade port: an escort's ring round its cart (no escort orders yet)
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
	// stub until skills port: the squad's active (persons only; class spawns hold none)
	s.actWil = 5;
}

void Sim::apply(const Order &o) {
	// not ported yet: turnSquad, rebanner, setLiege, the W-53 `units` regroup, sites, crafting, landmarks, upgrades
	if (o.units) {
		ERR_PRINT(godot::String("sim: a `units` order is not ported yet: ") + o.kind.c_str());
		return;
	}
	if (o.squad < 0 || size_t(o.squad) >= squads.size()) return;
	Squad &s = *squads[o.squad];
	// stub until civilians port: a civilian squad's order filter (no civilians on the move maps)
	s.flee = false;
	s.resume = false;
	if (o.kind == "fireArrows" || o.kind == "active" || o.kind == "load" || o.kind == "unload" || o.kind == "escort" || o.kind == "salvagePile") {
		ERR_PRINT(godot::String("sim: order not ported yet: ") + o.kind.c_str());
		return;
	}
	// stub until roam port: attacking roaming folk provokes them (no meek squads yet); until trade port: safe zones
	if (o.kind != "formation" && o.kind != "detach") s.escort = -1;
	// stub until siege port: crews driving their engines (s.siege is never set yet)
	if (o.kind == "deploy" || o.kind == "raiseLadder") return;
	if (o.kind != "formation" && o.kind != "detach") {
		s.task = false;
		s.claimPt = -1;
		s.soul = -1;
	}
	if (o.kind == "formation") {
		s.shape = shapeOf(o.shape);
		reslot(s);
		return;
	}
	if (o.kind != "move" && o.kind != "attackMove" && o.kind != "hold" && o.kind != "stop" && o.kind != "attack") {
		ERR_PRINT(godot::String("sim: order not ported yet: ") + o.kind.c_str());
		return;
	}
	// stub until works port: a gather or build squad's men drop their jobs (no work orders yet)
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
		// stub until works port: works.deckPoints (a move onto a wall walk; no decks on the move maps)
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
	const Bridge *b = bridgeAt(t);
	if (!b) return std::nullopt;
	const double l = js::hypot(b->dir[0], b->dir[1]), ex = b->dir[0] / l, ey = b->dir[1] / l;
	return Lanes{ b->id0, ex, ey, -ey, ex, -ey * b->rows[0] + ex * b->rows[1], b->width };
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
	// stub until civilians and trade ports: CIV.fleeSpeed (no flight) and PORTER.slow (nobody laden)
	double budget = SPEED * s.speed * 1 * 1 * DT * std::min(1.0, std::max(0.25, 1.25 - lag / 6));
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
		// stub until trade port: the safe zone's gate (anySafe is false)
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

// Fighting for one unit this tick: true with (px, py) the point to close on, false for its slot (TS null). The blows
// themselves (pickTarget, strike, shoot) are not ported yet: a squad with foes near stops here.
bool Sim::fight(Unit &u, double &px, double &py) {
	Squad &s = *u.squad;
	u.fighting = false;
	u.striking = false;
	if (u.cd > 0) u.cd--;
	// stub until siege port: siege.busy (no engines yet)
	if (!u.civ.empty() || (s.order == "move" && (s.goal || !atEnd(s))) || (anySafe && inSafe(u.x, u.y))) {
		u.tgt = nullptr;
		return false;
	}
	if (s.near.empty()) {
		u.tgt = nullptr;
		return false;
	}
	ERR_PRINT_ONCE("sim: combat (pickTarget, strike, shoot) is not ported yet");
	u.tgt = nullptr;
	(void)px;
	(void)py;
	return false;
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

void Sim::hungerTick() {
	const double sec = data().food.HUNGER.every * DT;
	for (Unit *up : units) {
		Unit &u = *up;
		if (!u.alive || u.squad->team == MOB_TEAM || u.squad->team == NEUTRAL_TEAM) continue;
		const int was = hunger_stage(u.sat);
		// stub until townLevel port: perkAt(...).hunger is 1 with no towns
		u.sat = std::max(0.0, u.sat - data().food.HUNGER.decay * sec * 1);
		// stub until works and holders ports: no store near and no packs (storeNear null, refill and biteFrom do nothing)
		const int now = hunger_stage(u.sat);
		if (now == 2 && u.hp > u.maxHp * data().food.HUNGER.floor) u.hp = std::max(u.maxHp * data().food.HUNGER.floor, u.hp - u.maxHp * data().food.HUNGER.drain * sec);
		if (now != was) speedOf(*u.squad);
	}
}

void Sim::workScan() {
	// stub until siege port: a gather squad's cart drop (no carts yet); until works port: no gather or build orders,
	// so no squad drops its tools; nothing sets a resume order yet
}

int Sim::spawn_squad(const std::string &owner, int team, const std::string &cls, int count, double x, double y) {
	// stub until roster port: persons (one baked man each); until civilians port: the civilian quota
	count = std::min(count, SQUAD_MAX);
	const auto [ax, ay] = openPoint(x, y);
	const WarStats &st = data().classes.of(cls);
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
		Unit *u = new Unit();
		u->id = int(units.size());
		u->squad = s;
		u->slot = k;
		u->x = px, u->y = py;
		u->hp = u->maxHp = st.maxHp;
		u->cls = cls;
		u->st = st;
		u->ammo = st.ammo;
		u->spd = RAMP_FROM;
		u->wx = px, u->wy = py;
		u->best = INF;
		u->ox = px, u->oy = py;
		u->sat = data().food.HUNGER.max;
		u->bx = px, u->by = py;
		// stub until civilians port: setRates and the civilian job (soldiers only so far)
		units.push_back(u);
		s->units.push_back(u);
	}
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
	// stub until civilians port: civScan (no civilians)
	if (tick % SCAN == 0) workScan();
	// stub until works port: staffScan; until civilians port: civTick
	if (tick % int(data().food.HUNGER.every) == 0) hungerTick();
	// stub until depth port: riseTick (nobody down)
	// stub until souls, mobs, roam, secrets, bosses, prebuilt (towns), townLevel and landmarks ports: their ticks, which
	// do nothing on a map where none of their things were spawned
	for (Squad *s : squads) {
		if (s->alive == 0) continue;
		if (s->order == "attack") grid->team = s->team, updateAttack(*s);
		else if (s->order == "attackMove") grid->team = s->team, updateAttackMove(*s);
		// stub until trade port: escortTick
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
	// stub until works port: works.tick
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
	// stub until siege port: siegeSquads (no crews, no tasks)

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
			// stub until works port: works.work (nobody has a job yet)
			u.fighting = u.striking = false;
			u.tgt = nullptr;
		} else if (u.squad->task) {
			// stub until siege port: taskAct (no tasks yet)
			u.working = false;
		} else {
			u.working = false;
			point = fight(u, apx, apy);
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
			// stub until civilians, trade, mobs and bosses ports: flight, laden, a beast's burst and a guardian's stagger are all 1
			const double full = (SPEED * u.st.speed * pace(u.sat) * 1 * 1 * 1 * 1 * CATCH_UP * DT) / cost;
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
	// stub until trade port: tradeTick, piles.tick, safeTick; until captives port: raidScan
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
	// stub until works port: stakes; combat not ported yet: land (no missiles); until siege port: siege.tick
	for (Squad *s : reslotQueue) reslot(*s);
	reslotQueue.clear();
	std::vector<VisionUnit> vu;
	vu.reserve(units.size());
	for (Unit *u : units) vu.push_back({ u->x, u->y, u->alive, u->squad->team, data().classes.sight_of(u->cls) });
	vision.tick(tick, vu, {}, {}); // stub until works port: no buildings; townLevel bonuses: no sight added
	tick++;
}

} // namespace sim

namespace godot {

Sim::~Sim() { delete s; }

Ref<Sim> Sim::create(const Ref<Grid> &grid, int64_t seed) {
	Ref<Sim> r;
	ERR_FAIL_COND_V_MSG(grid.is_null(), r, "Sim.create: no grid");
	ERR_FAIL_COND_V_MSG(!SimData::loaded(), r, "Sim.create: SimData.load first");
	r.instantiate();
	r->grid = grid;
	r->s = new sim::Sim(grid->g, uint32_t(seed));
	return r;
}

int Sim::spawn_squad(const String &owner, int team, const String &cls, int count, double x, double y) {
	return s->spawn_squad(owner.utf8().get_data(), team, cls.utf8().get_data(), count, x, y);
}

void Sim::order(const Dictionary &d) {
	sim::Order o;
	o.kind = String(d.get("kind", "")).utf8().get_data();
	o.has_squad = d.has("squad");
	o.squad = o.has_squad ? int(d["squad"]) : -1;
	o.x = d.get("x", 0.0);
	o.y = d.get("y", 0.0);
	o.target = int(d.get("target", -1));
	o.shape = String(d.get("shape", "")).utf8().get_data();
	o.units = d.has("units");
	s->order(o);
}

void Sim::step() { s->step(); }

Dictionary Sim::digest() const {
	Dictionary out;
	out["tick"] = s->tick;
	Array us;
	for (const sim::Unit *u : s->units) {
		// state as the snapshot gives it (attack needs combat, not ported yet)
		const char *state = !u->alive ? "dead" : u->working ? (u->job.empty() ? "build" : u->job.c_str()) : u->moving ? "move" : "idle";
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
	return out;
}

void Sim::_bind_methods() {
	ClassDB::bind_static_method("Sim", D_METHOD("create", "grid", "seed"), &Sim::create);
	ClassDB::bind_method(D_METHOD("spawn_squad", "owner", "team", "cls", "count", "x", "y"), &Sim::spawn_squad);
	ClassDB::bind_method(D_METHOD("order", "order"), &Sim::order);
	ClassDB::bind_method(D_METHOD("step"), &Sim::step);
	ClassDB::bind_method(D_METHOD("get_tick"), &Sim::get_tick);
	ClassDB::bind_method(D_METHOD("digest"), &Sim::digest);
}

} // namespace godot
