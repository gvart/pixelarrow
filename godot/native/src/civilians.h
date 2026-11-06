// Civilians in the war sim (src/war/sim/civilians.ts), line for line: the numbers (CIV, COOK, SMITH, PHYSICIAN, ...) from
// the exported table (src/war/sim/civilians) through SimData, with what they read of src/data/classes (CIV_CLASSES,
// CIV_TOOLS), src/data/items (RARITIES) and src/data/affixes (the Deft and Bountiful steps); fallShare, civJob, workRate,
// toolMods (src/data/recipes.ts), freshCivilian and wornest. For the core (src/war/sim/index.ts closures, ported here so
// the sim can call them): the flight pace, physicianNear, civRoom's sum and setRates' civilian part. civScan and civTick
// stay with the core: they act on works, crafting queues, towns and siege carts.
#pragma once

#include <map>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "item.h"
#include "js_math.h"

namespace sim {

struct CivClassDef {
	std::string name;
	std::vector<std::pair<std::string, double>> attrs; // in key order (str, agi, end, wil)
	std::vector<std::string> tools; // tier 1..3
};

struct CivilianTables {
	double REGION_CAP = 600;
	struct {
		double quota = 0.1, fleeR = 10, calmR = 14, calm = 30, fleeSpeed = 1.3, away = 16, every = 10, at = 2.2, dmg = 0.3, armor = 0.5, hp = 0.8;
	} CIV;
	double CIV_QUOTA = 60;
	struct {
		double batch = 0, food = 0, salt = 0, rations = 0, saltBonus = 0, feedR = 0, fedTicks = 0, inn = 0, heal = 0;
	} COOK;
	struct {
		double batch = 0, copper = 0, tin = 0, bronze = 0, repairR = 0, repair = 0;
	} SMITH;
	struct {
		double build = 0;
	} ENGINEER;
	struct {
		double gather = 0;
	} FORAGER;
	struct {
		double r = 0, surgeonR = 0, heal = 0, near = 0;
	} PHYSICIAN;
	struct {
		double woodsman = 0, prospector = 0, pitchman = 0, masterBuilder = 0;
	} FORAGE;
	struct {
		double r = 0, hides = 0;
	} HUNT;
	struct {
		double bandage = 0, feedR = 0, theriac = 0;
	} REMEDY;
	struct {
		double ticks = 0, share = 0;
	} VENOM;
	double CIV_XP = 1;
	struct {
		double perLevel = 0, perTier = 0, perRarity = 0;
	} WORK;
	std::map<std::string, std::string> CLIP; // lookup only
	std::vector<std::string> AT_BUILDING;
	// data deps
	std::map<std::string, CivClassDef> CIV_CLASSES; // lookup only
	std::map<std::string, int> CIV_TOOLS; // tool id -> tier, lookup only
	std::vector<std::string> RARITIES;
	double DEFT = 0, BOUNTIFUL = 0; // AFFIXES.deft.step, AFFIXES.bountiful.step
};

// A falling man's wounded share: his own (END), + a physician near, + a bandage (x2: Battle Dresser), - venom; within 0..FALL.cap.
double fall_share(double ws, bool physician, double bandages, bool venom);

// A civilian class's job ("" : not a civilian class).
std::string civ_job(const std::string &cls);
// Work clip a civilian at his building plays ("" : none).
std::string civ_clip(const std::string &job);
// Jobs done standing at a building (civWork order).
bool at_building(const std::string &job);

struct ToolMods {
	double deft = 0, bountiful = 0;
};
// src/data/recipes.ts toolMods: Deft and Bountiful of a crafted tool's affixes.
ToolMods tool_mods(const Item *item);
// A civilian's work multiplier from his level and the tool in his weapon slot.
double work_rate(double level, const Item *tool);

// The fresh civilian of a class (src/data/units.ts Hero, the fields freshCivilian sets): level 1, its attributes, the
// tier-1 tool (common).
struct CivHero {
	std::string id, name, culture, cls;
	double level = 1, xp = 0, kills = 0, battles = 0, group = 0, points = 0, wound = 0;
	struct {
		double skin = 0, hair = 0, hairStyle = 0, beard = 0;
		std::string tunic;
	} look;
	Item weapon; // equip.weapon
	std::vector<std::pair<std::string, double>> attrs;
};
CivHero fresh_civilian(const std::string &cls, const std::optional<std::string> &id = std::nullopt);

// The most worn item of a person's equip (slots in key order; nullopt items empty); nullopt: all whole.
using CivEquip = std::vector<std::pair<std::string, std::optional<Item>>>;
std::optional<std::pair<std::string, Item>> wornest(const CivEquip &equip);

// --- for the core (index.ts) ---

// A squad's pace while fleeing (index.ts: `s.flee ? CIV.fleeSpeed : 1`).
double flee_pace(bool flee);

// A fit physician of t's team within his field radius of t (index.ts physicianNear), over the sim's civilian units.
template <class U>
bool physician_near(const std::vector<U *> &civs, const U &t) {
	for (const U *p : civs)
		if (p->civ == "physician" && p->alive && p != &t && p->squad->team == t.squad->team && js::pow(p->x - t.x, 2) + js::pow(p->y - t.y, 2) <= p->fieldR * p->fieldR) return true;
	return false;
}

// civRoom's sum: CIV_QUOTA split between the teams present, plus the town's houses, less the civilians and carts it has
// (index.ts civRoom; a roaming team gets the whole quota).
double civ_room(bool roaming, double teams, double have, double townCap);

// setRates' civilian part (index.ts): gather and build rates by job and work rate, the M5h node effects and the
// demigod's quick hands (`fxWork`). Fields nullopt are TS undefined; herbs and flax are only set for a forager with nodes.
struct CivRates {
	std::optional<double> wrate, brate;
	std::optional<std::vector<std::pair<std::string, double>>> gmul; // insertion order as TS assigns it
	std::optional<bool> herbs, flax;
	double fieldR = 0;
};
CivRates civ_rates(const std::string &civ, std::optional<double> work, const std::vector<std::string> &perks, double fxWork);

} // namespace sim
