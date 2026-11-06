// Probe for the warlords test (tests/sim/test_warlords.gd checks it against the TS vectors, src/dev/vectors/warlords.ts):
// the director inside a replay host that takes the world (squads, men, buildings, carts, claim teams) from the vectors
// and records every host call the director makes.
#pragma once

#include <memory>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>

namespace sim {
class Warlords;
struct WarlordsReplayHost;
struct WarlordsRegion;
} // namespace sim

namespace godot {

class WarlordsProbe : public RefCounted {
	GDCLASS(WarlordsProbe, RefCounted)

	std::unique_ptr<sim::WarlordsReplayHost> host;
	std::unique_ptr<sim::WarlordsRegion> region;
	std::unique_ptr<sim::Warlords> lords;

public:
	WarlordsProbe();
	~WarlordsProbe();
	// region: the region's meta (Region.meta); inf: [[x0, y0, x1, y1, bits]]; off: a man's offset from his squad's centre by index.
	static Ref<WarlordsProbe> create(const Dictionary &region, double w, double h, double seed, int cap, const Array &inf, const Array &off);
	bool none() const;
	// rec: q [[id, owner, team, cx, cy, order, units]], u [[id, squad, cls, dead]], ux [ids], b, g, cl (src/dev/vectors/warlords.ts)
	void apply(const Dictionary &rec);
	Variant call_api(const Array &call);
	// think: the snapshot as the world stands; else one with its tick only. The notes.
	Array tick(double t, bool think);
	Array take_events();
	Array snaps() const;

protected:
	static void _bind_methods();
};

} // namespace godot
