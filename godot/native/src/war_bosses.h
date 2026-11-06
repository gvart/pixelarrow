// The guardians (src/data/warBosses.ts), as far as the deeds need them: WAR_BOSSES (id, name, deed) comes from the
// exported table (src/data/warBosses) through SimData; bossDeed is ported here. The rest is the bosses port's.
#pragma once

#include <optional>
#include <string>
#include <vector>

namespace sim {

struct WarBoss {
	std::string id, name;
	std::optional<std::string> deed;
};

struct BossTables {
	std::vector<WarBoss> WAR_BOSSES;
};

const WarBoss *war_boss(const std::string &id);
// E3: the deed its slayers earn ("Bane of ..." unless the boss names its own).
std::string boss_deed(const std::string &boss);

} // namespace sim
