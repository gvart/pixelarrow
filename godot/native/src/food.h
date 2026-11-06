// W-60 hunger (src/war/sim/food.ts): HUNGER and HUNGER_NAMES come from the exported table (src/war/sim/food) through
// SimData; hungerStage, pace and blow are ported here.
#pragma once

#include <string>
#include <vector>

namespace sim {

struct HungerRules {
	double max = 100, decay = 0, eatAt = 0, hungry = 0, starving = 0, ration = 0, food = 0, kit = 0, packFood = 0, storeR = 0, every = 1,
		   drain = 0, floor = 0;
	double pace[3] = { 1, 1, 1 }, attack[3] = { 1, 1, 1 };
};

struct FoodTables {
	HungerRules HUNGER;
	std::vector<std::string> HUNGER_NAMES;
};

// 0 fed, 1 hungry, 2 starving.
int hunger_stage(double sat);
double pace(double sat);
double blow(double sat);

} // namespace sim
