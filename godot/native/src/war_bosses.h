// The guardians (src/data/warBosses.ts): WAR_BOSSES and BOSS_TIERS come from the exported table (src/data/warBosses)
// through SimData; warBoss, bossDeed, asTrophy, bossGoods and bossLoot are ported here. The item rows bossLoot and
// asTrophy read (BASE_ITEMS, the set pieces of ITEM_LIST, fixed items) come from src/data/items, the stat steps from
// src/data/affixes, and each item's affixPool (the affix rules stay in TS) from derived/boss_loot.
#pragma once

#include <optional>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

#include "item.h"

namespace sim {

struct WarBoss {
	std::string id, name;
	std::optional<std::string> deed;
	int tier = 1;
	std::vector<std::string> signature;
	std::vector<double> phases;
	struct Rare {
		std::string good;
		double n = 0;
	};
	std::optional<Rare> rare;
};

struct BossTier {
	int picks = 0;
	std::vector<std::pair<std::string, double>> rarity;
	double minTier = 0, trophy = 0, signature = 0;
};

struct BossTables {
	std::vector<WarBoss> WAR_BOSSES;
	std::unordered_map<int, BossTier> BOSS_TIERS; // lookup only
	// bossLoot and asTrophy (load_boss_loot)
	std::vector<std::pair<std::string, double>> BASE_ITEMS; // id, tier, in TS order
	std::vector<std::pair<std::string, std::string>> ITEM_SETS; // ITEM_LIST id, set ('' none), in TS order
	std::unordered_set<std::string> FIXED; // ITEMS ids with fixed stats (lookup only)
	std::unordered_map<std::string, std::vector<std::pair<std::string, double>>> AFFIX_POOL; // affixPool(def), lookup only
	std::vector<double> AFFIX_COUNT;
	std::vector<std::pair<double, double>> AFFIX_STEPS;
	std::vector<std::string> RARITIES;
};
// tables["src/data/items"] (the whole module), ["affixes"] (src/data/affixes), ["derived_boss_loot"] (derived/boss_loot); each absent: left empty
void load_boss_loot(const godot::Dictionary &tables, BossTables &out);

const WarBoss *war_boss(const std::string &id);
// E3: the deed its slayers earn ("Bane of ..." unless the boss names its own).
std::string boss_deed(const std::string &boss);

// W-73: a dropped item made the guardian's trophy: his name on it and every random stat at its top step.
Item as_trophy(const Item &item, const std::string &boss);

struct BossGood {
	std::string r;
	double n = 0;
};
// M7e: the goods a kill of `boss` drops into its loot pile.
std::vector<BossGood> boss_goods(const std::string &boss);

struct BossDrop {
	std::string def, rarity;
	bool trophy = false;
};
// What a kill of `boss` drops; `seed` names the kill. Unknown boss: nothing.
std::vector<BossDrop> boss_loot(const std::string &boss, const std::string &seed);

} // namespace sim
