// Siege of the live region war sim (src/war/sim/index.ts: the createSiege hooks, engineerNodes, placeable, the M2c siege
// closures uncrew, taskLive, ladderTop, taskPoints, taskAct and siegeSquads, safeBuilding, hides, objective, hitBuilding
// and spawnCart), line for line, as Sim members. The engines themselves are siege.h.
#include <algorithm>
#include <cmath>
#include <limits>

#include "combat.h"
#include "js_math.h"
#include "professions.h"
#include "sim.h"
#include "sim_data.h"

namespace sim {

namespace {

constexpr double INF = std::numeric_limits<double>::infinity();
constexpr double DT = 0.1; // as sim.cpp
constexpr double TASK_AT = 1.6;
constexpr double BUILDING_MELEE = 0.08;
constexpr int TASK_REPOINT = 10;
constexpr int REPATH_TICKS = 20;
constexpr double CART_FORD = 2, CART_UPHILL = 1 / 0.6; // grid.ts

double sq(double v) { return v * v; }
double dist2(const Squad &a, double bx, double by) { return sq(a.cx - bx) + sq(a.cy - by); }

const std::unordered_set<std::string> NO_NODES;

} // namespace

// --- the createSiege hooks ---

std::vector<double> SimSiegeHost::path(int team, double x0, double y0, double x1, double y1) {
	s->grid->team = team;
	s->grid->engine = true; // M5h3: off stakes and ditches
	std::vector<double> p = s->cornerPath(x0, y0, x1, y1);
	s->grid->engine = false;
	return p;
}

int SimSiegeHost::crewNear(int crew, double x, double y, double r) {
	int n = 0;
	if (crew >= 0 && size_t(crew) < s->squads.size())
		for (Unit *u : s->squads[crew]->units)
			if (u->alive && sq(u->x - x) + sq(u->y - y) <= r * r) n++;
	return n;
}

void SimSiegeHost::splash(double x, double y, double r, double dmg, double ap) {
	for (Unit *u : s->units)
		if (u->alive && sq(u->x - x) + sq(u->y - y) <= r * r) s->hurt(*u, after_armour(dmg, u->st.armor, ap));
}

bool SimSiegeHost::open(double x, double y) {
	const int t = s->grid->tile_at(x, y);
	return t >= 0 && double(s->grid->cost[t]) > 0 && s->grid->deck[t] == 0;
}

bool SimSiegeHost::walkable(double x0, double y0, double x1, double y1) { return s->grid->line_cost(x0, y0, x1, y1, 0) < INF; }

double SimSiegeHost::cost(double x, double y) {
	const int t = s->grid->tile_at(x, y);
	return t >= 0 && double(s->grid->cost[t]) > 0 ? double(s->grid->cost[t]) : 1;
}

bool SimSiegeHost::hasNode(int team, const std::string &node) { return s->engineerNodes(team).count(node) > 0; }

std::optional<std::array<double, 2>> SimSiegeHost::foe(int team, double x, double y, double r) {
	Unit *best = nullptr;
	double bd = r * r;
	for (Unit *u : s->units) {
		if (!u->alive || u->squad->team == team || !u->civ.empty()) continue;
		const double d = sq(u->x - x) + sq(u->y - y);
		if (d < bd && s->vision.visible_to(team, u->x, u->y)) bd = d, best = u;
	}
	if (!best) return std::nullopt;
	return std::array<double, 2>{ best->x, best->y };
}

void SimSiegeHost::pierce(int team, double x0, double y0, double x1, double y1, double w, double dmg, double ap, double n) {
	const double dx = x1 - x0, dy = y1 - y0;
	double l2 = dx * dx + dy * dy;
	if (l2 == 0) l2 = 1; // `|| 1`
	std::vector<std::pair<double, Unit *>> hit;
	for (Unit *u : s->units) {
		if (!u->alive || u->squad->team == team) continue;
		const double k = ((u->x - x0) * dx + (u->y - y0) * dy) / l2;
		if (k < 0 || k > 1) continue;
		if (sq(x0 + dx * k - u->x) + sq(y0 + dy * k - u->y) <= w * w) hit.emplace_back(k, u);
	}
	std::stable_sort(hit.begin(), hit.end(), [](const auto &a, const auto &b) { return a.first != b.first ? a.first - b.first < 0 : a.second->id < b.second->id; });
	const size_t m = n <= 0 ? 0 : std::min(hit.size(), size_t(n)); // slice(0, n)
	for (size_t i = 0; i < m; i++) s->hurt(*hit[i].second, after_armour(dmg, hit[i].second->st.armor, ap));
}

bool SimSiegeHost::stoneTower(int team, double x, double y) {
	const int t = s->grid->tile_at(x, y);
	const Building *b = t >= 0 && s->grid->deck[t] == DECK ? s->works->piece(s->grid->plat[t]) : nullptr;
	return b && b->type == "stoneTower" && b->team == team && (b->state == "done" || b->state == "damaged");
}

// M6b carts
std::optional<std::vector<double>> SimSiegeHost::cartPath(int team, double x0, double y0, double x1, double y1) {
	s->grid->team = team;
	s->grid->engine = s->grid->cart = true;
	std::vector<double> p = s->cornerPath(x0, y0, x1, y1);
	s->grid->engine = s->grid->cart = false;
	return p;
}

std::optional<double> SimSiegeHost::cartCost(double x, double y, double dx, double dy) {
	Grid &g = *s->grid;
	const int a = g.tile_at(x, y), b = g.tile_at(x + dx * 0.5, y + dy * 0.5);
	if (b < 0) return 0.0;
	if (a != b) {
		g.cart = g.engine = true;
		const bool ok = a < 0 || g.can_enter(a, b);
		g.cart = g.engine = false;
		if (!ok) return 0.0;
	}
	const double k = double(g.cart_mul[b]) > 0 ? double(g.cart_mul[b]) : CART_FORD;
	return a >= 0 && g.height[b] > g.height[a] ? k * CART_UPHILL : k;
}

bool SimSiegeHost::crewHit(int crew) {
	if (crew < 0 || size_t(crew) >= s->squads.size()) return false;
	for (Unit *u : s->squads[crew]->units)
		if (u->alive && u->tag > s->tick) return true;
	return false;
}

bool SimSiegeHost::foeNear(int team, double x, double y, double r) {
	if (team == NEUTRAL_TEAM) return false; // W-65: a caravan's wagon halts on its own (./roam.ts)
	for (Unit *u : s->units)
		if (u->alive && u->squad->team != team && u->squad->team != MOB_TEAM && u->civ.empty() && !u->squad->meek && sq(u->x - x) + sq(u->y - y) <= r * r) return true;
	return false;
}

std::optional<std::pair<int, std::string>> SimSiegeHost::taker(const SiegeEngine &e) {
	if (s->inSafe(e.x, e.y)) return std::nullopt; // M6d: no capture in a safe zone
	const auto &CART = data().trade.CART;
	Unit *by = nullptr;
	for (Unit *u : s->units) {
		if (!u->alive || u->squad->team == MOB_TEAM || (u->squad->meek && u->squad->team != e.team)) continue; // W-65: roaming folk take no carts
		const double d = sq(u->x - e.x) + sq(u->y - e.y);
		if (u->squad->team == e.team && d <= CART.guard * CART.guard) return std::nullopt;
		if (u->squad->team != e.team && d <= CART.beside * CART.beside && (!by || u->id < by->id)) by = u;
	}
	if (!by) return std::nullopt;
	return std::make_pair(by->squad->team, by->squad->owner);
}

void SimSiegeHost::captured(const SiegeEngine &e, const std::string &by) {
	// the 'cartCaptured' note: no event log yet
	// CART.captureXp to the taking squad (the nearest of its owner)
	Squad *best = nullptr;
	for (Squad *q : s->squads)
		if (q->owner == by && q->alive > 0 && (!best || dist2(*q, e.x, e.y) < dist2(*best, e.x, e.y))) best = q;
	if (best)
		for (Unit *u : best->units)
			if (u->alive) u->obj += data().trade.CART.captureXp;
	for (Squad *q : s->squads)
		if (q->escort == e.id && q->team != e.team) q->escort = -1, q->order = "hold";
}

void SimSiegeHost::wreck(const SiegeEngine &e, bool burnt) { s->piles->drop(e.x, e.y, e.hold->lots, e.hold->items, s->tick, burnt ? data().trade.PILE.spoil : 0); }

bool SimSiegeHost::crewNode(int crew, const std::string &node) {
	if (crew < 0 || size_t(crew) >= s->squads.size()) return false;
	for (Unit *u : s->squads[crew]->units)
		if (u->alive && u->civ == "merchant" && held_nodes("merchant", Sim::perksOf(*u)).count(node)) return true;
	return false;
}

// --- the sim's siege closures ---

const std::unordered_set<std::string> &Sim::engineerNodes(int team) {
	if (nodesAt != tick) {
		nodesAt = tick;
		teamNodes.clear();
		for (Unit *u : units) {
			if (!u->alive || u->civ != "engineer") continue;
			std::unordered_set<std::string> &set = teamNodes[u->squad->team];
			for (const std::string &n : held_nodes("engineer", perksOf(*u))) set.insert(n);
		}
	}
	const auto it = teamNodes.find(team);
	return it == teamNodes.end() ? NO_NODES : it->second;
}

bool Sim::placeable(const std::string &type, std::optional<int> team) {
	// M5h3: building types that need an engineer node of the team to place; towerBridge is never placed
	const char *n = type == "stakes" || type == "ditch" ? "fortifier" : type == "towerBridge" ? "-" : nullptr;
	return !n || (team && engineerNodes(*team).count(n));
}

bool Sim::safeBuilding(int id) const {
	const Building *b = works->piece(id);
	return b && anySafe && inSafe(b->x, b->y);
}

void Sim::hides(Unit &t) {
	// M5h Hunter: a beast killed within HUNT.r of a hunter forager brings his team HUNT.hides
	const auto &HUNT = data().civilians.HUNT;
	std::set<int> got; // only looked up
	for (Unit *c : civs) {
		const int team = c->squad->team;
		if (!c->alive || c->civ != "forager" || got.count(team) || !held_nodes("forager", perksOf(*c)).count("hunter") || sq(c->x - t.x) + sq(c->y - t.y) > HUNT.r * HUNT.r) continue;
		got.insert(team);
		works->add_at(team, c->x, c->y, "hides", HUNT.hides);
	}
}

void Sim::objective(Squad &s, const char *) {
	for (Unit *u : s.units)
		if (u->alive) u->obj += data().soldiers.XP.objective;
	// the 'objective' note: no event log yet
}

void Sim::hitBuilding(Squad &s, int b, double dmg) {
	const Building *p = works->piece(b);
	const std::optional<std::string> was = p ? std::optional<std::string>(p->state) : std::nullopt;
	// W-61 walls that matter: blows and arrows barely mark a player's stone wall, gate or tower
	const bool held = p && p->team != NEUTRAL_TEAM && p->team != MOB_TEAM;
	works->damage(b, held && !p->def->wall.empty() && p->def->material == "stone" ? dmg * data().economy.WALLS.stoneMelee : dmg, s.team);
	const Building *q = works->piece(b);
	if (was && *was != "destroyed" && q && q->state == "destroyed") objective(s, "building");
}

void Sim::uncrew(Squad &s) {
	const SiegeEngine *e = siege->get(s.siege);
	if (e && e->crew == s.id) siege->uncrew(s.siege);
	s.siege = -1;
	s.fixed.reset();
}

bool Sim::taskLive(const Task &k) {
	const Building *b = k.b >= 0 ? works->piece(k.b) : nullptr;
	const SiegeEngine *e = k.e >= 0 ? siege->get(k.e) : nullptr;
	if (k.b >= 0 && (!b || b->cancelled || b->state == "destroyed")) return false;
	if (k.e >= 0 && (!e || e->state == "destroyed")) return false;
	if (!b && !e) return false;
	if (k.kind == "buildSiege") return e->state == "building";
	if (k.kind == "ignite") return b ? b->def->burnable && b->state != "foundation" && b->burn <= 0 : e->burn <= 0;
	if (k.kind == "extinguish") return (b ? b->burn : e->burn) > 0;
	return true;
}

int Sim::ladderTop(int id) const {
	const Building *l = works->piece(id);
	if (!l) return -1;
	const int lx = l->tiles[0], ly = l->tiles[1];
	static const int D[4][2] = { { 1, 0 }, { 0, 1 }, { -1, 0 }, { 0, -1 } };
	for (const auto &d : D) {
		const int t = grid->tile_at(lx + d[0], ly + d[1]);
		if (t >= 0 && grid->deck[t] == DECK) return t;
	}
	return -1;
}

void Sim::taskPoints(Squad &s) {
	const Task &k = *s.task;
	const int n = std::max(1, s.alive);
	if (k.kind == "attackBuilding" && s.ranged) {
		s.fixed.reset();
		double tx, ty;
		if (k.b >= 0) std::tie(tx, ty) = works->nearest_tile(k.b, s.cx, s.cy);
		else tx = siege->get(k.e)->x, ty = siege->get(k.e)->y;
		const double d = js::hypot(s.cx - tx, s.cy - ty), r = warRange(s) * 0.7;
		if (d > r) requestPath(s, tx + ((s.cx - tx) * r) / d, ty + ((s.cy - ty) * r) / d);
		return;
	}
	std::vector<double> pts = k.kind == "pushLadder" ? works->deck_points(ladderTop(k.b), n) : k.b >= 0 ? works->ring_points(k.b, n, s.cx, s.cy) : siege->crew_points(k.e, n);
	if (!pts.empty()) s.fixed = pts;
	else s.fixed.reset();
	if (!pts.empty()) requestPath(s, pts[0], pts[1]);
}

Unit *Sim::taskAct(Unit &u) {
	Squad &s = *u.squad;
	const Task k = *s.task;
	u.fighting = u.striking = false;
	u.tgt = nullptr;
	if (u.cd > 0) u.cd--;
	const SiegeEngine *e = k.e >= 0 ? siege->get(k.e) : nullptr;
	double tx, ty;
	if (k.b >= 0) std::tie(tx, ty) = works->nearest_tile(k.b, u.x, u.y);
	else tx = e->x, ty = e->y;
	const double d = js::hypot(tx - u.x, ty - u.y);
	if (k.kind == "attackBuilding" && u.ammo > 0 && u.st.range > 0) {
		const double dh = double(hAt(u.x, u.y)) - double(hAt(tx, ty));
		const double range = u.st.range + height_range(dh);
		if (d > range) return nullptr;
		u.striking = true;
		u.facing = js::atan2(ty - u.y, tx - u.x);
		if (u.cd <= 0) shootAt(u, tx, ty, d, dh, range, k);
		return &u;
	}
	if (d > TASK_AT) return nullptr;
	const int here = grid->tile_at(u.x, u.y);
	if (k.kind == "pushLadder" && grid->deck[here] != DECK) return nullptr;
	if (k.kind != "pushLadder" && grid->deck[here] == DECK) return nullptr; // up on a wall: not at its foot
	u.facing = js::atan2(ty - u.y, tx - u.x);
	if (k.kind == "attackBuilding") {
		u.striking = true;
		if (u.cd > 0) return &u;
		u.cd = u.st.atkTicks;
		u.swingAt = tick;
		const double dmg = u.st.dmg * BUILDING_MELEE * (1 + (u.st.breach < 0 ? 0 : u.st.breach)); // M5h Breaching (TS undefined: -1)
		// M6b: a cart takes a blow like a man of its armour
		const auto ca = k.e >= 0 ? data().siege.CART_ARMOR.find(e->type) : data().siege.CART_ARMOR.end();
		if (k.b >= 0) hitBuilding(s, k.b, dmg);
		else siege->damage(k.e, ca != data().siege.CART_ARMOR.end() ? after_armour(u.st.dmg, ca->second, 0) : dmg);
	} else if (k.kind == "buildSiege") {
		if (siege->labour(k.e, DT * (u.brate ? *u.brate : 1))) u.working = true;
	} else if (k.kind == "ignite") {
		u.doing = "ignite";
		if (k.b >= 0) works->kindle(k.b, DT);
		else siege->kindle(k.e, DT);
	} else if (k.kind == "extinguish") {
		u.doing = "extinguish";
		if (k.b >= 0) works->douse(k.b, DT);
		else siege->douse(k.e, DT);
	} else {
		u.doing = "push";
		const Building *l = works->piece(k.b);
		const int lt = l->ti[0];
		if (works->push(k.b, DT))
			for (Unit *o : units)
				if (o->alive && grid->tile_at(o->x, o->y) == lt) hurt(*o, o->maxHp * data().siege.LADDER.fall); // climbers fall
	}
	return &u;
}

void Sim::siegeSquads() {
	for (Squad *sp : squads) {
		Squad &s = *sp;
		if (s.alive == 0) continue;
		if (s.siege >= 0) {
			const SiegeEngine *e = siege->get(s.siege);
			if (!e || e->state == "destroyed" || e->crew != s.id) {
				s.siege = -1;
				s.fixed.reset();
				s.order = "hold";
				continue;
			}
			s.fixed = siege->crew_points(s.siege, s.alive);
			s.ax = e->x;
			s.ay = e->y;
			s.path.clear();
			s.pi = 0;
			s.goal.reset();
			for (Unit *u : s.units)
				if (u->alive && sq(u->x - e->x) + sq(u->y - e->y) < 6.25) u->doing = "crew";
		} else if (s.task) {
			if (!taskLive(*s.task)) {
				s.task.reset();
				s.fixed.reset();
				s.order = "hold";
				s.path.clear();
				s.goal.reset();
			} else if (s.task->e >= 0 && (tick + s.id) % TASK_REPOINT == 0 && s.task->kind != "attackBuilding") s.fixed = siege->crew_points(s.task->e, std::max(1, s.alive));
			else if (s.task->kind == "attackBuilding" && s.ranged && (tick + s.id) % REPATH_TICKS == 0 && s.pi >= double(s.path.size()) / 2 && !s.goal) taskPoints(s);
		}
	}
}

int Sim::spawnCart(int team, const std::string &owner, const std::string &type, double x, double y, std::optional<int> crew) {
	if (!rollable) rollable = grid->cart_land();
	const auto [cx, cy] = grid->nearest_land(*rollable, x, y); // W-145: a cart is set down where it can roll
	const int id = siege->cart(team, owner, type, cx, cy);
	if (crew) {
		// at once: a haul's next leg may leave before a tick
		Order o;
		o.kind = "crew";
		o.squad = *crew;
		o.has_squad = true;
		o.siege = id;
		apply(o);
	}
	return id;
}

} // namespace sim
