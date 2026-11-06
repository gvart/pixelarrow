// The pure bits of src/data/units.ts the sim needs (MAX_LEVEL comes from its table through SimData).
#pragma once

namespace sim {

inline double xp_to_next(double level) { return 40 * level; }

} // namespace sim
