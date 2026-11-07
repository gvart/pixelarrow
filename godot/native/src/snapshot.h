// index.ts snapshot() (src/war/sim/index.ts): the whole Snapshot of a sim as its JSON object, every key in the TS order
// and present only where the TS sets it, so what the room reads of it and what the frame codec writes of it (JSON
// blocks of buildings, engines, souls and guardians) match the TS byte for byte (docs/impl/godot-port.md P8).
#pragma once

#include <godot_cpp/variant/dictionary.hpp>

#include "sim.h"

namespace sim {

godot::Dictionary snapshot(Sim &s);

// the parts the probes write the same way (works_probe.cpp, siege_probe.cpp)
godot::Dictionary snapDict(const BuildingSnap &b);
godot::Dictionary siegeSnapDict(const SiegeSnap &e);

} // namespace sim
