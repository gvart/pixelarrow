#include "depth.h"

#include <algorithm>

#include "sim_data.h"

namespace sim {

double depth_of(const DepthRegion &r) {
	double d = 1;
	if (r.has_depth) d = r.depth;
	else {
		const auto &t = data().depth.region_depth;
		const auto it = t.find(r.id);
		if (it != t.end()) d = it->second;
	}
	return std::max(0.0, std::min(4.0, d));
}

const DepthRule &depth_rule(const DepthRegion &r) { return data().depth.rules[size_t(depth_of(r))]; }

} // namespace sim
