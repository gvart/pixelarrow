// WorksProbe: the works (works.h) inside a replay of the fake world of src/dev/vectors/works.ts, for
// tests/sim/test_works.gd. The squads, workers, their walking and the cart are mirrored here; the host's answers that
// the TS world rolled or searched (paths, chance rolls) are taken from the recorded events of the tick.
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
struct WorksRegion;
struct WallOrder;
struct BridgeOrder;
struct ReplayWorksHost;
struct ProbeWorld;
// What the works read of a region (Region.meta and Region.cells; n: its tile count); the probe and the Sim share it.
void works_region_of(const godot::Dictionary &meta, const godot::PackedByteArray &cells, int n, WorksRegion &out);
// A placeWall / placeBridge order's fields from its dictionary.
WallOrder wall_order_of(const godot::Dictionary &d);
BridgeOrder bridge_order_of(const godot::Dictionary &d);
} // namespace sim

namespace godot {

class WorksProbe : public RefCounted {
	GDCLASS(WorksProbe, RefCounted)

	Ref<Grid> grid;
	std::unique_ptr<sim::WorksRegion> region;
	std::unique_ptr<sim::ProbeWorld> world;
	std::unique_ptr<sim::ReplayWorksHost> host;
	std::unique_ptr<sim::Works> works;

public:
	WorksProbe();
	~WorksProbe();
	// grid: the region's Grid (Region.grid()); meta and cells: Region.meta and Region.cells; scenario: one of the
	// vectors' scenarios (its squads, workers and men).
	static Ref<WorksProbe> create(const Ref<Grid> &grid, const Dictionary &meta, const PackedByteArray &cells, const Dictionary &scenario);
	// The TS host events of the tick to come: where the answers to paths and chance rolls are read.
	void begin(const Array &expect);
	Variant call_api(const Array &call);
	void tick_works();
	Array work_all();
	void end_tick();
	Array take_events();
	Array workers_state() const;
	// b, n, st, cart (as the vectors), inf_version and mask (the influence bytes: the test hashes them).
	Dictionary snap();

protected:
	static void _bind_methods();
};

} // namespace godot
