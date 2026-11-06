// Probes for the tests of depth, soldiers, skills, honours, deeds, food, captives and mobs (tests/sim/test_*.gd check
// them against the TS vectors). WildProbe: the pure rules. MobsProbe: the mob controller inside a replay host that takes
// the squads from the vectors (src/dev/vectors/mobs.ts) and records every host call the controller makes.
#pragma once

#include <memory>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/string.hpp>

namespace sim {
class Mobs;
struct ReplayHost;
struct MobRegion;
} // namespace sim

namespace godot {

class WildProbe : public RefCounted {
	GDCLASS(WildProbe, RefCounted)

public:
	static double depth_of(const Dictionary &region);
	static Array depth_rule(const Dictionary &region); // [mob, respawn, claim.ticks]
	static double wounded_share(double end, bool physician);
	static Array gain_xp(double level, double xp, double points, double add); // [level, xp, points, levelUps]
	static double active_cooldown(double wil);
	static Array legal_skills(const String &cls, double level, const Array &picked);
	static Array honours_of(const Array &persons, const Dictionary &ctx); // persons [pid, team, state]; out [pid, name, stat]
	static Array plain_deed(const String &id);
	static Array slayer_deed(const String &boss);
	static Array mastery_deed(const String &region, const String &name);
	static Array add_deeds(const Variant &have, const Array &had); // [all, fresh], deeds as [id, name]
	static int hunger_stage(double sat);
	static double pace(double sat);
	static double blow(double sat);
	static double refuse_chance(double level);
	static bool refuses(const String &id, double level);
	static double ask_at(double until);
	static PackedStringArray soul_regions(const String &from);
	static Variant mob_kind_of(const String &cls);
	static String foes_word(const String &cls, int n);

protected:
	static void _bind_methods();
};

class MobsProbe : public RefCounted {
	GDCLASS(MobsProbe, RefCounted)

	std::unique_ptr<sim::ReplayHost> host;
	std::unique_ptr<sim::MobRegion> region;
	std::unique_ptr<sim::Mobs> mobs;

public:
	MobsProbe();
	~MobsProbe();
	// region: the region's meta (Region.meta); towers [{id, x, y}]; carts null (no carts hook) or [{id, x, y, team}];
	// nodes [[x, y, obj]] (node id = index).
	static Ref<MobsProbe> create(const Dictionary &region, double w, double h, int64_t seed, const Array &nodes, const Array &towers, const Variant &carts);
	void apply(const Array &deltas);
	Variant call_api(const Array &call);
	void tick(double t);
	Array take_events();
	double hp_sum() const;
	Dictionary snaps();

protected:
	static void _bind_methods();
};

} // namespace godot
