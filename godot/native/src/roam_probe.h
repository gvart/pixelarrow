// Probes for the tests of roam and civilians (tests/sim/test_roam.gd, test_civilians.gd check them against the TS
// vectors). RoamProbe: the roam controller inside a replay host that takes the squads and wagons from the vectors
// (src/dev/vectors/roam.ts) and records every host call the controller makes. CivProbe: the pure civilian rules.
#pragma once

#include <memory>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/string.hpp>

namespace sim {
class Roam;
struct RoamReplayHost;
struct RoamRegion;
} // namespace sim

namespace godot {

class RoamProbe : public RefCounted {
	GDCLASS(RoamProbe, RefCounted)

	std::unique_ptr<sim::RoamReplayHost> host;
	std::unique_ptr<sim::RoamRegion> region;
	std::unique_ptr<sim::Roam> roam;

public:
	RoamProbe();
	~RoamProbe();
	// region: the region's meta (Region.meta); cap: squads the host stands at most.
	static Ref<RoamProbe> create(const Dictionary &region, double w, double h, double seed, int cap);
	// squads [[id, owner, team, alive, civ, flee, meek, angry, cx, cy, order, target, arrived, fighting, [hp, maxHp, alive]...]],
	// carts [[id, x, y, team, alive, moving]]
	void apply(const Array &squads, const Array &carts);
	Variant call_api(const Array &call);
	void tick(double t);
	Array take_events();
	Array angry() const; // [id, angry] of every squad with a grudge
	Dictionary snaps() const;

protected:
	static void _bind_methods();
};

class CivProbe : public RefCounted {
	GDCLASS(CivProbe, RefCounted)

public:
	static Variant civ_job(const String &cls);
	static Variant clip(const String &job);
	static bool at_building(const String &job);
	// tool: null or an item {uid, def, rarity, cond, aff?}
	static double work_rate(double level, const Variant &tool);
	static Array tool_mods(const Variant &tool); // [deft, bountiful]
	static Dictionary fresh_civilian(const String &cls, const Variant &id);
	// equip: [[slot, item or null]] in key order; out [slot, item] or null
	static Variant wornest(const Array &equip);
	static double fall_share(double ws, bool physician, double bandages, bool venom);
	static Array consts(); // the civilian numbers the sim reads, in a fixed order

protected:
	static void _bind_methods();
};

} // namespace godot
