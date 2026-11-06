// War skills (src/war/sim/skills.ts): FAMILY_OF, F, MAX_FLAGS, FLAG_FX, SKILLS, SKILL_POOL, SKILL_LEVELS, ACTIVES and
// ACTIVE come from the exported table (src/war/sim/skills) through SimData; activeCooldown and legalSkills are ported here.
#pragma once

#include <map>
#include <optional>
#include <string>
#include <vector>

namespace sim {

struct SkillDef {
	std::string family;
	char kind = 'P'; // 'P' | 'F' | 'A'
	std::optional<double> dmg, reach, armor, block, accuracy, range, ammo, bp, flag;
};

struct SkillTables {
	std::map<std::string, std::string> FAMILY_OF; // looked up by class only
	std::map<std::string, double> F; // looked up by name only
	double MAX_FLAGS = 3;
	struct {
		double holdBlock = 1, finishDmg = 1, finishHp = 0, fireReach = 1, firePitch = 1;
	} FLAG_FX;
	std::map<std::string, SkillDef> SKILLS; // looked up by id only
	std::map<std::string, std::vector<std::string>> SKILL_POOL; // by family, each in SKILLS order
	std::vector<double> SKILL_LEVELS;
	struct Active {
		double out = 1, in = 1;
	};
	std::map<std::string, Active> ACTIVES; // looked up by id only
	struct {
		double cooldown = 0, perWil = 0, buff = 0;
	} ACTIVE;
};

// Cooldown in ticks, 2.5% shorter per WIL point of the leader above 5 (never below half).
double active_cooldown(double wil);

// Skills a person may hold at `level` from `picked`: of his family, in open slots, one each.
std::vector<std::string> legal_skills(const std::string &cls, double level, const std::vector<std::string> &picked);

} // namespace sim
