// E3 veterans: deeds and scars (src/war/sim/deeds.ts). DEEDS_MAX, SCARS_MAX, DEED and DEED_NAME come from the exported
// table (src/war/sim/deeds) through SimData.
#pragma once

#include <map>
#include <string>
#include <vector>

namespace sim {

struct DeedTables {
	double DEEDS_MAX = 8, SCARS_MAX = 3;
	struct {
		double gate = 0, last = 0, slayer = 0;
	} DEED;
	std::map<std::string, std::string> DEED_NAME; // looked up by id only
};

// A deed of a man's record (src/war/types.ts Deed).
struct Deed {
	std::string id, name;
};

Deed plain_deed(const std::string &id);
Deed slayer_deed(const std::string &boss);
// W-73: the banner of a mastered region.
Deed mastery_deed(const std::string &region, const std::string &name);

// The deeds of `had` not yet in `have`, in order (none twice), and the record with them (at most DEEDS_MAX).
void add_deeds(const std::vector<Deed> &have, const std::vector<Deed> &had, std::vector<Deed> &all, std::vector<Deed> &fresh);

} // namespace sim
