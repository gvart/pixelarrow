// M5f civilians of the live region war sim (src/war/sim/index.ts: civRoom, safeAt, flee, civScan, civJobDone, crafter,
// eat and civTick), line for line, as Sim members, with the createCrafting deps the sim gives its crafting queues. The
// civilian rules themselves are civilians.h, the queues crafting.h.
#include <algorithm>
#include <cmath>
#include <limits>

#include "js_math.h"
#include "professions.h"
#include "sim.h"
#include "sim_data.h"

namespace sim {

namespace {

constexpr double DT = 0.1; // as sim.cpp
constexpr int SCAN = 5;
constexpr double SPOT_NEAR = 0.5;
constexpr double PATIENT_HP = 50; // M5f: HP a physician heals for one job's XP
constexpr int SQUAD_MAX = 12; // soldiers.ts SQUAD_MAX

double sq(double v) { return v * v; }

const CivilianTables &C() { return data().civilians; }

// M5f: seconds of work per batch, by job at a building (TS BATCH; NaN: undefined)
double batchOf(const std::string &job) {
	return job == "cook" ? C().COOK.batch : job == "smith" ? C().SMITH.batch : job == "physician" ? 1 : std::numeric_limits<double>::quiet_NaN();
}

// M5h: dishes a squad eats, best first (the M5f rations last)
const char *const DISH_PREF[] = { "feast", "fish_stew", "lentil_soup", "black_broth", "kykeon", "bread", "salt_pork" };

} // namespace

Placed Sim::placed(const Building &b) const {
	Placed p;
	p.id = b.id;
	p.team = b.team;
	p.def = b.def;
	p.x = b.x;
	p.y = b.y;
	if (!b.owner.empty()) p.owner = b.owner;
	p.share = b.share;
	p.fee = b.fee;
	return p;
}

double Sim::civRoom(int team) {
	if (team == NEUTRAL_TEAM) return civ_room(true, 0, 0, 0); // W-65: roaming folk are no team's civilians
	std::set<int> teams{ team }; // only counted
	for (Squad *q : squads)
		if (q->team != MOB_TEAM && q->team != NEUTRAL_TEAM && q->alive > 0) teams.insert(q->team);
	int n = siege->carts(std::nullopt, team); // M6b: carts are in the civilian quota
	for (Unit *u : civs)
		if (u->alive && u->squad->team == team) n++;
	// stub until prebuilt port: towns.population(team).cap (no towns: 0)
	return civ_room(false, double(teams.size()), n, 0);
}

bool Sim::safeAt(int team, double x, double y) {
	const double r = C().CIV.calmR;
	for (Squad *q : squads) {
		if (q->team == team || q->civ || q->alive == 0) continue;
		for (Unit *t : q->units)
			if (t->alive && sq(t->x - x) + sq(t->y - y) <= r * r) return false;
	}
	return true;
}

void Sim::flee(Squad &s, double fx, double fy) {
	const std::shared_ptr<Order> resume = s.flee ? s.resume : resumeOf(s);
	double tx = std::numeric_limits<double>::quiet_NaN(), ty = tx, bd = std::numeric_limits<double>::infinity();
	const double cr = C().CIV.calmR;
	for (int id = 0;; id++) {
		const Building *b = works->piece(id);
		if (!b) break;
		if (b->team != s.team || b->cancelled || (b->state != "done" && b->state != "damaged") || !(b->def->store || b->def->influence > 0) || !b->def->wall.empty()) continue;
		if (sq(b->x - fx) + sq(b->y - fy) <= cr * cr) continue; // the foe is there
		const double d = sq(b->x - s.cx) + sq(b->y - s.cy);
		if (d < bd) {
			bd = d;
			const std::vector<double> p = works->ring_points(id, 1, s.cx, s.cy);
			tx = p.size() > 0 ? p[0] : std::numeric_limits<double>::quiet_NaN();
			ty = p.size() > 1 ? p[1] : std::numeric_limits<double>::quiet_NaN();
		}
	}
	if (std::isnan(tx)) {
		const double dx = s.cx - fx, dy = s.cy - fy;
		double l = js::hypot(dx, dy);
		if (l == 0 || std::isnan(l)) l = 1; // `|| 1`
		tx = std::max(1.0, std::min(double(grid->w - 1), s.cx + (dx / l) * C().CIV.away));
		ty = std::max(1.0, std::min(double(grid->h - 1), s.cy + (dy / l) * C().CIV.away));
	}
	Order o;
	o.kind = "move";
	o.squad = s.id;
	o.has_squad = true;
	o.x = tx;
	o.y = ty;
	apply(o);
	s.flee = true;
	s.calm = 0;
	s.resume = resume;
}

void Sim::civScan() {
	const auto &CIV = C().CIV;
	for (Squad *sp : squads) {
		Squad &s = *sp;
		if (!s.civ || s.alive == 0) continue;
		double best = std::numeric_limits<double>::infinity(), fx = 0, fy = 0;
		for (Squad *o : s.near) {
			if (o->civ || o->alive == 0) continue;
			for (Unit *t : o->units) {
				if (!t->alive) continue;
				const double d2 = sq(t->x - s.cx) + sq(t->y - s.cy);
				if (d2 < best) best = d2, fx = t->x, fy = t->y;
			}
		}
		if (best <= CIV.fleeR * CIV.fleeR) {
			// run, or run on: the refuge it reached has the foe at the door
			if (!s.flee || (s.pi >= double(s.path.size()) / 2 && !s.goal)) flee(s, fx, fy);
			s.calm = 0;
		} else if (s.flee && best > CIV.calmR * CIV.calmR && (s.calm += SCAN) >= CIV.calm) {
			// back to work once no foe is at the work place either (else they wait where they are)
			const std::shared_ptr<Order> r = s.resume;
			std::optional<std::pair<double, double>> at;
			if (r) {
				if (r->kind == "civWork" || r->kind == "build") {
					if (const Building *b = works->piece(r->kind == "civWork" ? r->building : r->site)) at = std::make_pair(b->x, b->y);
				} else if (r->kind == "gather") {
					const std::vector<NodeSnap> ns = works->resource_nodes();
					if (r->node >= 0 && size_t(r->node) < ns.size()) at = std::make_pair(ns[r->node].x, ns[r->node].y);
				}
			}
			if (at && !safeAt(s.team, at->first, at->second)) {
				s.calm = 0;
				continue;
			}
			s.flee = false;
			s.resume.reset();
			if (r) apply(*r);
		}
	}
}

bool Sim::civJobDone(Unit &u, int team, double bx, double by) {
	if (u.civ == "cook") {
		// W-60: grain and onions cooked down into rations, into the nearest store
		Cost food;
		food.set("food", C().COOK.food);
		if (!works->take_at(team, bx, by, food)) return false;
		Cost salt;
		salt.set("salt", C().COOK.salt);
		const bool salted = works->take_at(team, bx, by, salt);
		works->add_at(team, bx, by, "ration", C().COOK.rations * (salted ? 1 + C().COOK.saltBonus : 1));
		return true;
	}
	if (u.civ == "smith") {
		Cost ore;
		ore.set("copper", C().SMITH.copper);
		ore.set("tin", C().SMITH.tin);
		if (works->take_at(team, bx, by, ore)) {
			works->add_at(team, bx, by, "bronze", C().SMITH.bronze);
			return true;
		}
		// no ore: mend the most worn item of a man of his team near the forge (stub until roster port: no persons, so
		// no man wears kit to mend)
		return false;
	}
	return false;
}

Crafter Sim::crafter(Unit &u) const {
	// stub until roster port: persons (a class spawn: level 1, no perks, no tool, no name)
	Crafter c;
	c.id = u.id;
	if (!u.civ.empty()) c.prof = u.civ;
	c.level = 1;
	c.work = u.st.work < 0 ? 1 : u.st.work;
	c.bountiful = tool_mods(nullptr).bountiful;
	c.owner = u.squad->owner;
	c.team = u.squad->team;
	c.name = "civilian";
	return c;
}

void Sim::eat(Squad &s, const std::string &d, bool longer) {
	const Fed f = fed_of(d, longer);
	s.dish = d;
	s.fedInn = f.inn;
	s.fedMelee = f.melee;
	s.fedMissile = f.missile;
	s.fedAcc = f.acc;
	s.fedHeal = f.heal;
	s.fedUntil = tick + f.ticks;
	for (Unit *u : s.units)
		if (u->alive) u->sat = data().food.HUNGER.max; // W-60: a meal fills them up
}

void Sim::civTick() {
	const CivilianTables &c = C();
	const double sec = c.CIV.every * DT;
	std::vector<Unit *> at;
	std::vector<std::pair<int, std::vector<Unit *>>> shops; // a JS Map: insertion order
	dresser.clear();
	for (Unit *up : civs) {
		Unit &u = *up;
		u.civAt = false;
		Squad &s = *u.squad;
		// stub until roster port: persons (no perks, so heldNodes of none)
		if (u.alive && u.civ == "physician" && held_nodes("physician", {}).count("battleDresser")) dresser.insert(s.team);
		if (!u.alive || s.flee || s.order != "civWork") continue;
		const Building *b = works->piece(s.work);
		if (!b || b->cancelled || !works->may_use(*b, s.owner, s.team) || b->state == "destroyed" || works->dist2(s.work, u.x, u.y) > c.CIV.at * c.CIV.at) continue;
		if (!b->def->workplace && !at_building(u.civ)) continue;
		if (u.civ == "physician" && !b->def->workplace && b->type != "camp" && b->type != "fort") continue;
		u.civAt = true;
		const std::vector<Spot> spots = works->work_spots(b->id);
		const Spot *spot = nullptr;
		for (const Spot &p : spots)
			if (sq(p[0] - u.x) + sq(p[1] - u.y) < SPOT_NEAR * SPOT_NEAR) {
				spot = &p;
				break;
			}
		u.facing = spot ? js::atan2((*spot)[3] - u.y, (*spot)[2] - u.x) : js::atan2(b->y - u.y, b->x - u.x); // at a station: facing it
		if (b->def->workplace && (b->state == "done" || b->state == "damaged") && crafting->has(b->id)) {
			auto l = std::find_if(shops.begin(), shops.end(), [&](const auto &e) { return e.first == b->id; });
			if (l == shops.end()) shops.emplace_back(b->id, std::vector<Unit *>{}), l = shops.end() - 1;
			l->second.push_back(&u);
		} else at.push_back(&u);
	}
	for (const auto &[id, list] : shops) {
		std::vector<Crafter> cs;
		for (Unit *u : list) cs.push_back(crafter(*u));
		const std::vector<std::pair<int, double>> busy = crafting->work(placed(*works->piece(id)), cs, sec, tick);
		for (Unit *u : list) {
			const auto xp = std::find_if(busy.begin(), busy.end(), [&](const auto &e) { return e.first == u->id; });
			if (xp == busy.end()) at.push_back(u);
			else u->obj += xp->second;
		}
	}
	for (Unit *up : at) {
		Unit &u = *up;
		Squad &s = *u.squad;
		const Building &b = *works->piece(s.work);
		if (!at_building(u.civ)) continue;
		const double w = u.st.work < 0 ? 1 : u.st.work;
		if (u.civ == "physician") {
			if (b.type != "camp" && b.type != "fort" && !(b.def->workplace && b.def->workplace->kind == "infirmary")) continue;
			// the hurt of his team near him heal (fed men faster); every PATIENT_HP healed is a job
			for (Unit *o : units) {
				if (!o->alive || o->hp >= o->maxHp || o->squad->team != s.team || works->dist2(s.work, o->x, o->y) > c.PHYSICIAN.r * c.PHYSICIAN.r || (anySafe && inSafe(o->x, o->y))) continue; // M6d: no healing in a safe zone
				// stub until prebuilt port: no blessed squads (BLESS.heal)
				const double add = std::min(o->maxHp - o->hp, o->maxHp * c.PHYSICIAN.heal * sec * w * (o->squad->fedUntil > tick ? o->squad->fedHeal : 1) * 1);
				o->hp += add;
				u.civT += add;
			}
			if (u.civT >= PATIENT_HP) u.civT -= PATIENT_HP, u.obj += c.CIV_XP;
			continue;
		}
		u.civT += sec * w;
		const double batch = batchOf(u.civ);
		if (u.civT < batch) continue;
		if (civJobDone(u, s.team, b.x, b.y)) u.civT -= batch, u.obj += c.CIV_XP;
		else u.civT = batch;
	}
	bool any = false;
	for (Unit *cv : civs)
		if (cv->civAt && (cv->civ == "cook" || cv->civ == "physician")) {
			any = true;
			break;
		}
	if (!any) return;
	for (Squad *sp : squads) {
		Squad &s = *sp;
		if (s.civ || s.alive == 0 || s.team == MOB_TEAM) continue;
		Unit *cook = nullptr;
		bool doc = false;
		for (Unit *cv : civs) {
			if (!cv->civAt || cv->squad->team != s.team || sq(cv->x - s.cx) + sq(cv->y - s.cy) > c.COOK.feedR * c.COOK.feedR) continue;
			if (cv->civ == "cook") cook = cv;
			else if (cv->civ == "physician") doc = true;
		}
		if (doc) {
			// M5h: bandages up to SQUAD_MAX, theriac when it has run out
			const int need = std::min(SQUAD_MAX, s.alive) - s.bandages;
			const int have = int(std::floor(crafting->supply(s.team).get("bandage")));
			const int n = std::min(need, have);
			if (n > 0 && crafting->use(s.team, "bandage", n)) s.bandages += n;
			if (s.theriacUntil <= tick && crafting->use(s.team, "theriac", 1)) s.theriacUntil = tick + c.REMEDY.theriac;
		}
		if (!cook || s.fedUntil > tick) continue;
		// squads near a cook at work eat a dish (or a ration) a man, if the team has it for all
		const bool longer = held_nodes("cook", {}).count("headCook") > 0; // stub until roster port: no perks
		const char *dish = nullptr;
		for (const char *d : DISH_PREF)
			if (crafting->use(s.team, d, s.alive)) {
				dish = d;
				break;
			}
		Cost ration;
		ration.set("ration", s.alive);
		if (dish) eat(s, dish, longer);
		else if (works->take_at(s.team, cook->x, cook->y, ration)) eat(s, "ration", longer); // W-60: rations from the cook's store
	}
}

} // namespace sim
