// The live region's binary snapshot frames (src/war/net/codec.ts DeltaEncoder), line for line: one encoder per client
// remembers what that client was last sent (quantised) and writes only what changed. The frame layout is in codec.ts;
// the frames match the TS byte for byte (strings are written as codec.ts writes them: at most 255 chars, each & 0x7f,
// so only ASCII ids, classes, orders and owners go through Writer.s). The decoder side (the Godot client) comes with P10.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/packed_byte_array.hpp>
#include <godot_cpp/variant/variant.hpp>

#include "js_map.h"

namespace sim {

// What one client sees this tick (interest.ts visibleTo; Snapshot parts as their JSON objects). warden: nil for none.
struct FrameInput {
	int tick = 0;
	godot::Array units, squads, shots, buildings, sieges, souls, bosses;
	godot::Variant warden;
};

class DeltaEncoder {
public:
	godot::PackedByteArray encode(const FrameInput &f, bool key);

private:
	struct Sent {
		std::vector<int> q;
		std::string meta;
	};
	struct Rec {
		godot::Variant id;
		std::string json;
	};
	JsMap<int, Sent> units;
	JsMap<int, std::string> squads;
	JsMap<std::string, Rec> buildings, sieges, souls, bosses;
	JsMap<std::string, std::string> bossDyn;
	std::string warden = "none";
};

} // namespace sim
