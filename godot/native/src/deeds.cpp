#include "deeds.h"

#include "sim_data.h"
#include "war_bosses.h"

namespace sim {

Deed plain_deed(const std::string &id) { return { id, data().deeds.DEED_NAME.at(id) }; }
Deed slayer_deed(const std::string &boss) { return { "slayer:" + boss, boss_deed(boss) }; }
Deed mastery_deed(const std::string &region, const std::string &name) { return { "banner:" + region, "Banner of " + name }; }

void add_deeds(const std::vector<Deed> &have, const std::vector<Deed> &had, std::vector<Deed> &all, std::vector<Deed> &fresh) {
	all = have;
	fresh.clear();
	const double max = data().deeds.DEEDS_MAX;
	for (const Deed &d : had) {
		bool dup = false;
		for (const Deed &x : all) dup = dup || x.id == d.id;
		if (double(all.size()) >= max || dup) continue;
		all.push_back(d);
		fresh.push_back(d);
	}
}

} // namespace sim
