#include "soldiers.h"

#include <algorithm>

#include "sim_data.h"
#include "units.h"

namespace sim {

double wounded_share(double end, bool physician) {
	const auto &F = data().soldiers.FALL;
	return std::min(F.cap, F.wounded + F.perEnd * std::max(0.0, end - 5) + (physician ? F.physician : 0));
}

HeroXp gain_xp(const HeroXp &hero, double xp, int &level_ups) {
	const SoldierTables &t = data().soldiers;
	HeroXp h = hero;
	h.xp = hero.xp + xp;
	level_ups = 0;
	while (h.level < t.MAX_LEVEL && h.xp >= xp_to_next(h.level)) {
		h.xp -= xp_to_next(h.level);
		h.level++;
		h.points += t.POINTS_PER_LEVEL;
		level_ups++;
	}
	return h;
}

} // namespace sim
