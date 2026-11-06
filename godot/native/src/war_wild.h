// Local mini-bosses, the chiefs (src/data/warWild.ts): CHIEF_KINDS and WAR_CHIEFS come from the exported table
// (src/data/warWild) through SimData; warChief, chiefKind and chiefRespawn are ported here. Loot rows stay in the table
// (chiefLoot is the bosses port's).
#pragma once

#include <map>
#include <string>
#include <vector>

namespace sim {

struct WarChief {
	std::string id, name, title, kind;
};

struct ChiefKind {
	double scale = 1, tint = 0xffffff, hp = 1, dmg = 1, armor = 0, escort = 0;
};

struct WildTables {
	std::map<std::string, ChiefKind> CHIEF_KINDS; // looked up by kind only
	std::vector<WarChief> WAR_CHIEFS;
};

const WarChief *war_chief(const std::string &id);
const ChiefKind *chief_kind(const std::string &id);
// Ticks a slain chief's lair stays clear.
double chief_respawn(double depth);

} // namespace sim
