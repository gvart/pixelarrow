// SiegeProbe: the siege engines (siege.h) and the works under them inside a replay of the fake world of
// src/dev/vectors/siege.ts, for tests/sim/test_siege.gd. The squads, their men and their walking are mirrored here, and
// so are the host answers the TS world computes (crews near, foes, nodes, the grid's open ground and costs); the paths
// and the works' chance rolls are taken from the recorded events of the tick.
#pragma once

#include <memory>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/packed_byte_array.hpp>

#include "grid.h"

namespace sim {
class Works;
class Siege;
struct Mulberry;
struct WorksRegion;
struct SiegeWorld;
struct SiegeProbeWorksHost;
struct SiegeProbeHost;
} // namespace sim

namespace godot {

class SiegeProbe : public RefCounted {
	GDCLASS(SiegeProbe, RefCounted)

	Ref<Grid> grid;
	std::unique_ptr<sim::WorksRegion> region;
	std::unique_ptr<sim::SiegeWorld> world;
	std::unique_ptr<sim::SiegeProbeWorksHost> whost;
	std::unique_ptr<sim::SiegeProbeHost> host;
	std::unique_ptr<sim::Works> works;
	std::unique_ptr<sim::Mulberry> rng;
	std::unique_ptr<sim::Siege> siege;

public:
	SiegeProbe();
	~SiegeProbe();
	// grid: the region's Grid (Region.grid()); meta and cells: Region.meta and Region.cells; scenario: one of the
	// vectors' scenarios (its team nodes and squads).
	static Ref<SiegeProbe> create(const Ref<Grid> &grid, const Dictionary &meta, const PackedByteArray &cells, const Dictionary &scenario);
	// The TS host events of the tick to come: where the answers to paths and chance rolls are read.
	void begin(const Array &expect);
	Variant call_api(const Array &call);
	// The men walk, the works tick, the siege ticks, the dirty tiles are logged.
	void step(int tick);
	Array take_events();
	Array engines_state() const;
	Array men_state() const;
	// e (the siege snapshots), sh (the shots) and b (the buildings), as the vectors.
	Dictionary snap(int tick);

protected:
	static void _bind_methods();
};

} // namespace godot
