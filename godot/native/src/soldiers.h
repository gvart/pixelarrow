// Soldier rules of the war sim (src/war/sim/soldiers.ts): squad size, falling, XP. The numbers come from the exported
// table (src/war/sim/soldiers, with MAX_LEVEL of src/data/units and POINTS_PER_LEVEL of src/data/perks) through SimData.
#pragma once

namespace sim {

struct SoldierTables {
	int ARMY_MAX = 12, SQUAD_MAX = 12;
	struct {
		double wounded = 0, perEnd = 0, physician = 0, cap = 0;
	} FALL;
	struct {
		double perDmg = 0, kill = 0, survived = 0, objective = 0;
	} XP;
	double CAPTURE_R = 0;
	double MAX_LEVEL = 10, POINTS_PER_LEVEL = 2;
};

double wounded_share(double end, bool physician = false);

// What gainXp reads and writes of a Hero (src/data/units.ts): the rest of the record is copied untouched by the caller.
struct HeroXp {
	double level = 1, xp = 0, points = 0;
};

// A copy of the hero with xp added, levelled up (+POINTS_PER_LEVEL each) as far as it goes, up to MAX_LEVEL.
HeroXp gain_xp(const HeroXp &hero, double xp, int &level_ups);

} // namespace sim
