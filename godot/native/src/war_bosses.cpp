#include "war_bosses.h"

#include "sim_data.h"

namespace sim {

// BY_ID is a Map built from WAR_BOSSES: a later duplicate id wins, so search from the back
const WarBoss *war_boss(const std::string &id) {
	const auto &bs = data().bosses.WAR_BOSSES;
	for (auto it = bs.rbegin(); it != bs.rend(); ++it)
		if (it->id == id) return &*it;
	return nullptr;
}

std::string boss_deed(const std::string &boss) {
	const WarBoss *b = war_boss(boss);
	if (b && b->deed) return *b->deed;
	std::string n = b ? b->name : boss;
	if (n.rfind("the ", 0) == 0) n = n.substr(4); // .replace(/^the /, '')
	return "Bane of " + n;
}

} // namespace sim
