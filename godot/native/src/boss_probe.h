// The guardians (bosses.h) for the tests: a replay host over the men and squads of src/dev/vectors/bosses.ts, and
// bossLoot and bossPile as Godot values.
#pragma once

#include <memory>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/string.hpp>

namespace sim {
struct BossReplayHost;
struct BossRegion;
class Bosses;
} // namespace sim

namespace godot {

class BossProbe : public RefCounted {
	GDCLASS(BossProbe, RefCounted)

	std::unique_ptr<sim::BossReplayHost> host;
	std::unique_ptr<sim::BossRegion> region;
	std::unique_ptr<sim::Bosses> bosses;
	Array before_u, before_s;

public:
	BossProbe();
	~BossProbe();
	static Ref<BossProbe> create(const Dictionary &region, double w, double h, int64_t seed, const Array &water, const Array &walls, const Array &levels, const Array &claimed);
	// The world's changes of a tick record (nu, nq, du, dq); the tick the host's claimed() reads.
	void apply(const Dictionary &rec);
	Variant call_api(const Array &call);
	void tick(double t);
	Array take_events();
	// [men, squads] changed since apply (the calls and the tick), each serialized as the vectors do.
	Array changed();
	Dictionary snaps();
	static Array boss_loot(const String &boss, const String &seed);
	static Dictionary boss_pile(const String &region, const String &run, const Dictionary &e);

protected:
	static void _bind_methods();
};

} // namespace godot
