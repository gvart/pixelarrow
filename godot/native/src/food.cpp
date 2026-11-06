#include "food.h"

#include "sim_data.h"

namespace sim {

int hunger_stage(double sat) {
	const HungerRules &H = data().food.HUNGER;
	return sat < H.starving ? 2 : sat < H.hungry ? 1 : 0;
}
double pace(double sat) { return data().food.HUNGER.pace[hunger_stage(sat)]; }
double blow(double sat) { return data().food.HUNGER.attack[hunger_stage(sat)]; }

} // namespace sim
