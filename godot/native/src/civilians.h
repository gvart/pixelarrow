// Civilians in the war sim (src/war/sim/civilians.ts), so far what combat reads: PHYSICIAN, REMEDY and VENOM from the
// exported table (src/war/sim/civilians) through SimData, and fallShare. The jobs, quota and loops wait for the
// civilians port.
#pragma once

namespace sim {

struct CivilianTables {
	struct {
		double r = 0, surgeonR = 0, heal = 0, near = 0;
	} PHYSICIAN;
	struct {
		double bandage = 0, feedR = 0, theriac = 0;
	} REMEDY;
	struct {
		double ticks = 0, share = 0;
	} VENOM;
};

// A falling man's wounded share: his own (END), + a physician near, + a bandage (x2: Battle Dresser), - venom; within 0..FALL.cap.
double fall_share(double ws, bool physician, double bandages, bool venom);

} // namespace sim
