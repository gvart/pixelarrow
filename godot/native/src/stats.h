// A person's baked war stats, line for line: the item rules they read (src/data/items.ts itemMods, baseMods,
// normalizeRarity, rarityRank; src/data/affixes.ts itemAffixes, affixMods, itemPower and their pools; src/data/gearRules.ts
// classGearBlocker, shortfall, gearPenalty; src/data/sets.ts activeBonuses), the battle stats (src/sim/stats.ts
// computeStats, beastStats) and the war bake (src/war/sim/classes.ts bake, warStatsOf, withPerks; src/data/warPerks.ts
// perkFx). computeStats is ported for what the war bake reads of it (hp, damage, reach, timings, missiles, accuracy,
// block, pierce, armour, speed, weapon): morale, stamina, abilities, auras and the knock-out chance never reach a
// WarStats, so they are left out. A fresh class's numbers stay the derived/war_stats table (the same warStats(cls)).
//
// Tables (SimData.load): src/data/items, src/data/affixes, src/data/gearRules, src/data/sets, src/data/traits,
// src/data/units, src/data/perks, src/data/classes, src/war/sim/classes, src/data/warPerks.
#pragma once

#include <map>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

#include "classes.h"
#include "roster.h"

namespace sim {

// A StatMods record: its keys in insertion order (Object.keys order shows in itemMods' rounding).
struct StatMods {
	std::vector<std::pair<std::string, double>> v;
	std::optional<double> get(const std::string &k) const {
		for (const auto &e : v)
			if (e.first == k) return e.second;
		return std::nullopt;
	}
	double or0(const std::string &k) const { return get(k).value_or(0); }
	void set(const std::string &k, double x) {
		for (auto &e : v)
			if (e.first == k) {
				e.second = x;
				return;
			}
		v.emplace_back(k, x);
	}
};

struct ItemDefFull {
	std::string id, slot, weaponKind, shieldKind, art, set, power; // "" undefined
	double tier = 1;
	StatMods mods;
	bool twoHanded = false, named = false;
	std::optional<std::vector<std::pair<std::string, double>>> fixed;
};

struct AffixDef {
	std::string id;
	double step = 0;
	std::vector<std::string> slots;
	std::optional<std::vector<std::string>> families;
	bool war = false;
};

struct PowerDef {
	std::string id;
	std::vector<std::string> slots;
	std::optional<std::vector<std::string>> families;
};

struct BeastDef {
	double hp = 0, dmg = 0, atkTime = 0, reach = 0, armor = 0, speed = 0;
};

struct StatClass {
	std::string kind; // 'animal' or ""
	std::optional<BeastDef> beastStats;
	StatMods mods;
	std::string mount; // "" none
};

struct PerkFx {
	double hp = 0, dmg = 0, armor = 0, wounded = 0, work = 0, siteCost = 0, siteHp = 0, cartLoads = 0, cartSpeed = 0, cartHp = 0;
};

struct StatTables {
	std::map<std::string, ItemDefFull> ITEMS; // lookup only
	std::vector<std::string> RARITIES;
	std::map<std::string, std::string> LEGACY_RARITY; // lookup only
	std::map<std::string, double> RARITY_MULT; // lookup only
	std::vector<double> QUALITY_MULT;
	std::vector<std::string> SCALED, PENALISED;
	std::vector<AffixDef> AFFIXES; // Object.values order
	std::vector<double> AFFIX_COUNT;
	std::vector<std::pair<double, double>> AFFIX_STEPS;
	std::vector<PowerDef> POWERS; // POWER_IDS order
	// gearRules
	struct ClassGear {
		std::vector<std::string> weapons, shields;
		std::string armor;
	};
	std::map<std::string, ClassGear> CLASS_GEAR; // lookup only
	std::map<std::string, double> WEIGHT_RANK;
	std::map<std::string, std::string> WEIGHT_OVERRIDE, ART_WEIGHT;
	std::vector<double> TIER_BASE, RARITY_ADD;
	std::map<std::string, double> SET_NEED;
	std::vector<std::string> OPEN_HELMET_ART;
	// sets: each set's bonus lines (pieces, mods: none when absent)
	struct SetBonus {
		double pieces = 0;
		std::optional<StatMods> mods;
	};
	std::map<std::string, std::vector<SetBonus>> SETS; // lookup only
	std::map<std::string, StatMods> TRAITS; // lookup only
	struct {
		double hp = 40, hpPerLevel = 4, dmg = 2, dmgPerLevel = 0.4, speed = 2, accuracy = 0.62, accuracyPerLevel = 0.01, reach = 0.9, atkTime = 1.2;
	} BASE;
	double ATTR_BASE = 5;
	struct {
		double strDmg = 0, strHp = 0, agiSpeed = 0, agiAccuracy = 0, agiTempo = 0, agiRanged = 0, endHp = 0;
	} ATTR_EFFECT;
	std::map<std::string, StatClass> CLASSES; // lookup only
	struct Mount {
		double speed = 1, hp = 0;
	};
	std::map<std::string, Mount> MOUNTS; // lookup only
	// src/war/sim/classes
	struct {
		double hp = 1.4, dmg = 1.4, armor = 4, block = 0.1, accuracy = 0.12, atk = 0.85, speed = 1.1, range = 1.5, ammo = 1.5, ap = 0.08, bp = 0.12;
	} CLAMP;
	std::map<std::string, std::string> CLAMP_BASE; // lookup only
	std::map<std::string, double> POWER_FLAGS; // lookup only
	// src/data/warPerks PERKS: by path, each perk's level and fx (in fx key order)
	struct Perk {
		double level = 0;
		std::vector<std::pair<std::string, double>> fx;
	};
	std::map<std::string, std::vector<Perk>> PERKS; // lookup only
};
void load_stat_tables(const godot::Dictionary &tables, StatTables &out);

std::string normalize_rarity(const std::string &r);
int rarity_rank_of(const std::string &r);
const ItemDefFull &item_def(const std::string &id);
std::string weapon_family(const ItemDefFull &def);
std::optional<std::string> class_gear_blocker(const std::string &cls, const ItemDefFull &def);
using Attrs = std::vector<std::pair<std::string, double>>;
// attrs: nullptr when TS passes none
double shortfall(const Attrs *attrs, const std::string &defId, const std::string &rarity);
double gear_penalty(double missing);
std::vector<std::pair<std::string, double>> affixes_of(const Item &item);
StatMods affix_mods(const Item &item);
struct ItemPower {
	std::string id;
	int grade = 0;
};
std::optional<ItemPower> item_power(const Item &item);
// attrs: the wearer's (nullptr: none)
StatMods item_mods(const Item &item, const Attrs *attrs);

// computeStats: the fields a WarStats bakes from
struct CombatStats {
	double maxHp = 0, dmg = 0, reach = 0, atkTime = 0, rangedDmg = 0, range = 0, ammo = 0, shotTime = 0, accuracy = 0, block = 0, blockPierce = 0, armor = 0, speed = 0;
	std::string weapon = "none";
	std::optional<double> armorPierce;
};
CombatStats compute_stats(const Hero &hero);

PerkFx perk_fx(const std::string &path, double level);
WarStats with_perks(const WarStats &s, const PerkFx &fx);
WarStats war_stats_of(const WarPerson &p);

} // namespace sim
