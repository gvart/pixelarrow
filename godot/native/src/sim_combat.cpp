// Combat of the live region war sim (src/war/sim/index.ts: setRates, riseTick, hurt, reachable, pickTarget, blockOf,
// dmgMult, strike, shoot, land, burst and fight), line for line, as Sim members. The rules themselves are combat.h.
#include <algorithm>
#include <cmath>
#include <limits>

#include "combat.h"
#include "js_math.h"
#include "sim.h"
#include "sim_data.h"

namespace sim {

namespace {

constexpr double INF = std::numeric_limits<double>::infinity();
constexpr double DT = 0.1; // as sim.cpp
constexpr int RETARGET = 5;
constexpr double LEASH = 4;
constexpr double CHARGE = 10;
constexpr double REACH_PAD = 0.3;
constexpr double FIRE_RELOAD = 1.5;

double sq(double v) { return v * v; }

int flag(const char *name) { return int(data().skills.F.at(name)); }

} // namespace

void Sim::setRates(Unit &u) {
	// stub until works and civilians ports: wrate, brate, gmul, herbs and flax (gather and build rates; no civilians
	// yet), the held nodes (none) and the demigod's quick hands (no paths: NO_PATH)
	u.fieldR = data().civilians.PHYSICIAN.r;
	const std::string mk = mob_kind_of(u.cls);
	u.venom = !mk.empty() ? data().mobs.MOBS.at(mk).venom : false;
	if (!mk.empty() && data().mobs.MOBS.at(mk).dash) u.mob = mk;
	else u.mob.clear();
	u.beast = !mk.empty() && mk != "bandit";
}

void Sim::riseTick() {
	const EarlyRules &E = data().depth.early;
	const int dt = int(data().food.HUNGER.every);
	for (Unit *up : units) {
		Unit &u = *up;
		if (!u.downAt) continue;
		if (tick - *u.downAt >= E.giveUp) {
			u.downAt.reset();
			u.downQ.reset();
			downs--;
			continue;
		}
		bool foe = false;
		for (Unit *o : units)
			if (o->alive && o->fighting && o->squad->team != u.squad->team && o->civ.empty() && sq(o->x - u.x) + sq(o->y - u.y) <= E.clear * E.clear) {
				foe = true;
				break;
			}
		u.downQ = foe ? 0 : u.downQ.value_or(0) + dt;
		if (*u.downQ < E.rise) continue;
		u.downAt.reset();
		u.downQ.reset();
		u.upAt = tick;
		downs--;
		u.alive = true;
		u.wounded = false;
		u.hp = std::max(1.0, u.maxHp * E.hp);
		u.squad->alive++;
		addReslot(*u.squad);
		// the view's 'rise' note: no event log yet
	}
}

void Sim::hurt(Unit &t, double dmg, Unit *by) {
	if (anySafe && inSafe(t.x, t.y) && dmg != INF) return;
	if (t.immune) return;
	// stub until trade port: the combat tag (by.tag = t.tag = tick + SAFE.tag; no safe zones yet)
	const double workDefence = 1; // stub until economy port: WORK_DEFENCE (no gather or build orders yet)
	const double d = dmg * (working(t) ? workDefence : 1) * (t.squad->fedUntil > tick ? t.squad->fedInn : 1) * (by && dmg != INF ? blow(by->sat) : 1);
	if (by && by->venom && t.squad->theriacUntil <= tick) t.venomUntil = tick + data().civilians.VENOM.ticks;
	if (by) {
		by->dealt += std::min(d, t.hp);
		by->engaged = t.engaged = true;
		// stub until bosses port: the killers' list and a slayer's deed (no guardians: boss -1)
	}
	t.hp -= d;
	if (t.hp > 0) return;
	t.hp = 0;
	t.alive = false;
	// stub until works port: works.release (nobody holds a job)
	t.fighting = false;
	t.moving = false;
	t.tgt = nullptr;
	if (early && by && by->squad->team == MOB_TEAM && t.squad->team != MOB_TEAM && t.squad->team != NEUTRAL_TEAM && t.civ.empty() && !(t.upAt && tick - *t.upAt < data().depth.early.again)) {
		t.wounded = true;
		t.downAt = tick;
		t.downQ = 0;
		downs++;
		t.squad->alive--;
		addReslot(*t.squad);
		by->kills++;
		return;
	}
	// stub until civilians port: a Battle Dresser's double bandage (no dressers); until prebuilt port: no blessed squads
	const int bandage = t.squad->bandages > 0 ? (t.squad->bandages--, 1) : 0;
	t.wounded = rng.next() < fall_share(t.st.ws + 0, physicianNear(t), bandage, t.venomUntil > tick);
	// stub until civilians port: a hunter's hides (no foragers)
	t.squad->alive--;
	addReslot(*t.squad);
	if (by) by->kills++;
	// stub until souls port: souls.fell; until trade port: his pack and kit to a pile (class spawns carry none); the
	// view's 'fall' note: no event log yet
}

bool Sim::reachable(Unit &u, Unit &t) const { return std::abs(double(hAt(u.x, u.y)) - double(hAt(t.x, t.y))) <= 1 && grid->line_clear(u.x, u.y, t.x, t.y); }

Unit *Sim::pickTarget(Unit &u, bool attacking, Squad *foe) {
	Squad &s = *u.squad;
	const bool shoot = u.ammo > 0 && u.st.range > 0;
	const double maxD = attacking ? INF : shoot ? u.st.range + height_range(COMBAT.missileMaxDiff) : LEASH + u.st.reach + REACH_PAD;
	Unit *best = nullptr;
	double bestScore = maxD * maxD;
	for (Squad *o : s.near) {
		const double bias = attacking && o != foe ? 9 : 0;
		for (Unit *t : o->units) {
			if (!t->alive || (anySafe && inSafe(t->x, t->y))) continue;
			if (t->immune) continue;
			if (t->aloft && !shoot && (t->aloft == 1 || !atFord(u.x, u.y))) continue;
			const double d2 = sq(t->x - u.x) + sq(t->y - u.y) + bias;
			if (d2 < bestScore) {
				if (!shoot && d2 < CHARGE * CHARGE && !reachable(u, *t)) continue;
				bestScore = d2;
				best = t;
			}
		}
	}
	return best;
}

double Sim::blockOf(Unit &u, Unit &t) const {
	const double b = t.st.block * (1 - u.st.bp);
	return (t.st.flags & flag("holdFast")) && t.squad->order == "hold" ? b * data().skills.FLAG_FX.holdBlock : b;
}

double Sim::dmgMult(Unit &u, Unit &t, bool missile) const {
	const double m = u.squad->out * t.squad->inn * (u.squad->fedUntil > tick ? 1 + (missile ? u.squad->fedMissile : u.squad->fedMelee) : 1);
	return (u.st.flags & flag("finisher")) && t.hp < data().skills.FLAG_FX.finishHp * t.maxHp ? m * data().skills.FLAG_FX.finishDmg : m;
}

void Sim::strike(Unit &u, Unit &t, double dh) {
	const bool bog = groundAt(u.x, u.y) == BOG;
	u.cd = js::round(u.st.atkTicks * (bog ? COMBAT.bogAtk : 1) * (dh < 0 ? COMBAT.uphillAtk : 1));
	u.swingAt = tick;
	if (!working(t) && rng.next() < block_chance(blockOf(u, t), t.facing, u.x - t.x, u.y - t.y, false, groundAt(t.x, t.y) == BOG)) return;
	const MobDash *burst = u.dashHit && !u.mob.empty() ? &*data().mobs.MOBS.at(u.mob).dash : nullptr;
	if (burst) u.dashHit = false;
	hurt(t, after_armour(u.st.dmg * melee_height(dh) * (bog ? COMBAT.bogDmg : 1) * dmgMult(u, t) * (burst ? burst->dmg : 1), t.st.armor, 0), &u);
	const double knock = u.st.knock + (burst && burst->knock ? *burst->knock : 0);
	if (knock && t.alive) {
		double d = js::hypot(t.x - u.x, t.y - u.y);
		if (d == 0 || d != d) d = 1; // `|| 1`
		const double k = knock / 3;
		grid->team = t.squad->team;
		for (int i = 0; i < 3; i++) tryMove(t, ((t.x - u.x) / d) * k, ((t.y - u.y) / d) * k);
		grid->team = u.squad->team;
		t.settled = false;
	}
}

void Sim::shoot(Unit &u, Unit &t, double d, double dh, double range) {
	const bool fire = false; // stub until works port: fireShot (no lit braziers; fireArrows not ported)
	u.ammo--;
	u.cd = js::round(u.st.shotTicks * (fire ? FIRE_RELOAD : 1));
	u.swingAt = tick;
	const int at = tick + int(std::max(1.0, js::round(d / u.st.shotSpeed / DT)));
	// the view's shot (ShotSnap): not kept, nothing in the sim reads it
	if (u.ammo == 0) addReslot(*u.squad);
	const int fb = -1; // stub until works port: works.onBuilding (fire arrows only)
	const bool hit = rng.next() < hit_chance(u.st.accuracy + (u.squad->fedUntil > tick ? u.squad->fedAcc : 0), d, range, groundAt(t.x, t.y) == FOREST);
	if (!hit && fb < 0) return;
	const bool bog = groundAt(u.x, u.y) == BOG;
	Flight m;
	m.at = at;
	m.by = &u;
	m.t = hit ? &t : nullptr;
	m.raw = u.st.rangedDmg * COMBAT.missileDmg * missile_height(dh) * (bog ? COMBAT.bogDmg : 1);
	m.ap = u.st.ap;
	m.fb = fb;
	missiles.push_back(m);
}

void Sim::land() {
	if (missiles.empty()) return;
	std::vector<Flight> keep;
	for (const Flight &m : missiles) {
		if (m.at > tick) {
			keep.push_back(m);
			continue;
		}
		// stub until works and siege ports: fire on a deck, shots at a building or engine (shootAt, fire arrows: none yet)
		Unit *t = m.t;
		if (!t || !t->alive) continue;
		const double cv = 0; // stub until siege port: cover (no rams, no mantlets)
		if (cv > 0 && rng.next() < cv) continue;
		if (!working(*t) && rng.next() < block_chance(blockOf(*m.by, *t), t->facing, m.by->x - t->x, m.by->y - t->y, true, groundAt(t->x, t->y) == BOG)) continue;
		hurt(*t, after_armour(m.raw * dmgMult(*m.by, *t, true), t->st.armor, m.ap), m.by);
	}
	missiles = std::move(keep);
}

void Sim::burst(Unit &u, Unit &t, double gap) {
	const MobDash &b = *data().mobs.MOBS.at(u.mob).dash;
	if (gap < b.min || gap > b.max || u.dashAt > tick || (b.once && u.dashTgt == t.id)) return;
	u.dash = tick + b.ticks;
	u.dashAt = tick + b.cd;
	u.dashTgt = t.id;
	u.dashHit = true;
	// the view's 'mobDash' note: no event log yet
}

Sim::Act Sim::fight(Unit &u, double &px, double &py) {
	Squad &s = *u.squad;
	u.fighting = false;
	u.striking = false;
	if (u.cd > 0) u.cd--;
	// stub until siege port: siege.busy (no engines yet)
	if (!u.civ.empty() || (s.order == "move" && (s.goal || s.pi < double(s.path.size()) / 2)) || (anySafe && inSafe(u.x, u.y))) {
		u.tgt = nullptr;
		return ToSlot;
	}
	if (s.near.empty()) {
		u.tgt = nullptr;
		return ToSlot;
	}
	const bool attacking = s.order == "attack" || ((s.order == "attackMove" || s.order == "escort") && s.target >= 0);
	Squad *foe = attacking ? squads[s.target] : nullptr;
	if (!u.tgt || !u.tgt->alive || (tick + u.id) % RETARGET == 0) u.tgt = pickTarget(u, attacking, foe);
	Unit *t = u.tgt;
	if (!t) return ToSlot;
	const double d = js::hypot(t->x - u.x, t->y - u.y);
	const double dh = double(hAt(u.x, u.y)) - double(hAt(t->x, t->y));
	const bool missile = u.ammo > 0 && u.st.range > 0;
	const double range = missile ? u.st.range + height_range(dh) : u.st.reach + REACH_PAD;
	if (d <= range && (missile || reachable(u, *t))) {
		u.fighting = true;
		u.striking = true;
		u.facing = js::atan2(t->y - u.y, t->x - u.x);
		if (u.cd <= 0) {
			if (missile) shoot(u, *t, d, dh, range);
			else strike(u, *t, dh);
		}
		return Self;
	}
	if (attacking ? d < CHARGE + (missile ? range : 0) : !missile && d < LEASH + range) {
		if (grid->line_clear(u.x, u.y, t->x, t->y)) {
			u.fighting = true;
			if (missile) {
				const double k = (d - range * 0.9) / d;
				px = u.x + (t->x - u.x) * k;
				py = u.y + (t->y - u.y) * k;
				return Point;
			}
			if (!u.mob.empty()) burst(u, *t, d - range);
			px = t->x;
			py = t->y;
			return Point;
		}
	}
	return ToSlot;
}

} // namespace sim
