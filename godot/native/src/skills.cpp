#include "skills.h"

#include <algorithm>

#include "js_math.h"
#include "sim_data.h"

namespace sim {

double active_cooldown(double wil) {
	const auto &A = data().skills.ACTIVE;
	return js::round(A.cooldown * std::max(0.5, 1 - A.perWil * std::max(0.0, wil - 5)));
}

std::vector<std::string> legal_skills(const std::string &cls, double level, const std::vector<std::string> &picked) {
	const SkillTables &t = data().skills;
	const auto fi = t.FAMILY_OF.find(cls);
	const std::string *fam = fi != t.FAMILY_OF.end() ? &fi->second : nullptr;
	size_t slots = 0;
	for (double l : t.SKILL_LEVELS)
		if (level >= l) slots++;
	std::vector<std::string> out;
	for (const std::string &id : picked) {
		const auto si = t.SKILLS.find(id);
		if (fam && si != t.SKILLS.end() && si->second.family == *fam && std::find(out.begin(), out.end(), id) == out.end() && out.size() < slots) out.push_back(id);
	}
	return out;
}

} // namespace sim
