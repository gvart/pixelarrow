// Local mini-bosses, the chiefs (src/data/warWild.ts): CHIEF_KINDS and WAR_CHIEFS come from the exported table
// (src/data/warWild) through SimData; warChief, chiefKind, chiefRespawn and chiefLoot (src/data/warBosses.ts) are ported
// here.
#pragma once

#include <map>
#include <optional>
#include <string>
#include <vector>

namespace sim {

struct WarChief {
	std::string id, name, title, kind;
};

struct ChiefKind {
	double scale = 1, tint = 0xffffff, hp = 1, dmg = 1, armor = 0, escort = 0;
	// his kill drops: coin and goods (in key order), each x (1 + per x depth); an item at itemChance, its rarity weighted
	struct Loot {
		double coin = 0, per = 0, itemChance = 0;
		std::vector<std::pair<std::string, double>> goods, itemRarity;
	} loot;
};

struct WildTables {
	std::map<std::string, ChiefKind> CHIEF_KINDS; // looked up by kind only
	std::vector<WarChief> WAR_CHIEFS;
};

const WarChief *war_chief(const std::string &id);
const ChiefKind *chief_kind(const std::string &id);
// Ticks a slain chief's lair stays clear.
double chief_respawn(double depth);
// chiefLoot: what a kill of chief `id` at `depth` drops; `seed` names the kill (the same seed, the same drop). goods in
// key order (coin first); item: its def and rarity (none: no item)
struct ChiefDrop {
	std::vector<std::pair<std::string, double>> goods;
	std::optional<std::pair<std::string, std::string>> item;
};
ChiefDrop chief_loot(const std::string &id, double depth, const std::string &seed);

} // namespace sim
