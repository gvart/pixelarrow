#include "civilians.h"

#include <algorithm>

#include "sim_data.h"

namespace sim {

double fall_share(double ws, bool physician, double bandages, bool venom) {
	const CivilianTables &c = data().civilians;
	return std::max(0.0, std::min(data().soldiers.FALL.cap, ws + (physician ? c.PHYSICIAN.near : 0) + c.REMEDY.bandage * bandages - (venom ? c.VENOM.share : 0)));
}

} // namespace sim
