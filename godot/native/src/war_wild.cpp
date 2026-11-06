#include "war_wild.h"

#include <algorithm>

#include "js_math.h"
#include "sim_data.h"

namespace sim {

// CHIEF_BY_ID is a Map built from WAR_CHIEFS: a later duplicate id wins, so search from the back
const WarChief *war_chief(const std::string &id) {
	const auto &cs = data().wild.WAR_CHIEFS;
	for (auto it = cs.rbegin(); it != cs.rend(); ++it)
		if (it->id == id) return &*it;
	return nullptr;
}

const ChiefKind *chief_kind(const std::string &id) {
	const WarChief *c = war_chief(id);
	const auto &ks = data().wild.CHIEF_KINDS;
	const auto it = ks.find(c ? c->kind : "");
	return it != ks.end() ? &it->second : nullptr;
}

double chief_respawn(double depth) { return js::round(18000 + 4500 * std::max(0.0, std::min(4.0, depth))); }

} // namespace sim
