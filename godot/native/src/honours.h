// Battle honours (src/war/sim/honours.ts): honoursOf, awarded when a fight ends. HONOURS_MAX comes from the exported
// table (src/war/sim/honours) through SimData.
#pragma once

#include <set>
#include <string>
#include <utility>
#include <vector>

namespace sim {

struct HonourTables {
	double HONOURS_MAX = 3;
};

struct Honour {
	std::string name, stat;
};

// What honoursOf reads of a FightReport's PersonResult (src/war/types.ts): the full shape is the index.ts port's.
struct HonourPerson {
	std::string pid;
	int team = 0;
	std::string state; // 'fit' | 'wounded' | 'captive' | 'dead'
};

struct HonourContext {
	std::string region;
	bool chokepoint = false;
	bool has_holder = false; // holder: null when false
	int holder = 0;
	std::set<int> stormed; // membership only
};

// Honours won in the fight, by person id, in the TS Map's insertion order.
std::vector<std::pair<std::string, Honour>> honours_of(const std::vector<HonourPerson> &persons, const HonourContext &ctx);

} // namespace sim
