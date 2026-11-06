// Small deterministic PRNG (mulberry32), bit for bit the TS one (src/sim/rng.ts). Never use other randomness in the sim.
#pragma once

#include <cmath>
#include <cstdint>
#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/string.hpp>

namespace sim {

struct Mulberry {
	uint32_t state;
	explicit Mulberry(uint32_t seed) : state(seed ? seed : 0x9e3779b9u) {}
	// Uniform double in [0, 1).
	double next() {
		uint32_t t = state += 0x6d2b79f5u;
		t = (t ^ (t >> 15)) * (t | 1u);
		t ^= t + (t ^ (t >> 7)) * (t | 61u);
		return double(t ^ (t >> 14)) / 4294967296.0;
	}
};

// FNV-1a over UTF-16 code units, as the TS hashString (charCodeAt).
uint32_t hash_string(const godot::String &s);

} // namespace sim

namespace godot {

// The sim's Rng for GDScript (tests and game code): Rng.create(seed).
class Rng : public RefCounted {
	GDCLASS(Rng, RefCounted)

public:
	sim::Mulberry m{ 1 };

	static Ref<Rng> create(int64_t seed);
	int64_t get_state() const { return m.state; }
	void set_state(int64_t s) { m.state = uint32_t(s); }
	double next() { return m.next(); }
	double range_f(double lo, double hi) { return lo + (hi - lo) * m.next(); }
	int64_t int_in(int64_t lo, int64_t hi) { return lo + int64_t(std::floor(m.next() * double(hi - lo + 1))); }
	bool chance(double p) { return m.next() < p; }
	Variant pick(const Array &arr);
	Variant weighted(const Array &entries);
	Array shuffle(Array arr);
	static int64_t hash_string(const String &s) { return sim::hash_string(s); }

protected:
	static void _bind_methods();
};

class JsMath : public RefCounted {
	GDCLASS(JsMath, RefCounted)

public:
	static double hypot(double a, double b);
	static double round_js(double x);
	static double sin(double x);
	static double cos(double x);
	static double tan(double x);
	static double atan2(double y, double x);
	static double log2(double x);
	static double pow(double x, double y);

protected:
	static void _bind_methods();
};

} // namespace godot
