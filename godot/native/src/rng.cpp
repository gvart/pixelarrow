#include "rng.h"

#include <cmath>
#include <godot_cpp/core/class_db.hpp>

#include "js_math.h"

namespace sim {

uint32_t hash_string(const godot::String &s) {
	uint32_t h = 0x811c9dc5u;
	const godot::Char16String u = s.utf16();
	for (int i = 0; i < u.length(); i++) {
		h ^= uint32_t(u.get_data()[i]);
		h *= 0x01000193u;
	}
	return h;
}

} // namespace sim

namespace godot {

Ref<Rng> Rng::create(int64_t seed) {
	Ref<Rng> r;
	r.instantiate();
	r->m = sim::Mulberry(uint32_t(seed));
	return r;
}

Variant Rng::pick(const Array &arr) {
	return arr[int64_t(std::floor(m.next() * double(arr.size())))];
}

Variant Rng::weighted(const Array &entries) {
	double total = 0;
	for (int64_t i = 0; i < entries.size(); i++) total += double(Array(entries[i])[1]);
	double r = m.next() * total;
	for (int64_t i = 0; i < entries.size(); i++) {
		const Array e = entries[i];
		r -= double(e[1]);
		if (r < 0) return e[0];
	}
	return Array(entries[entries.size() - 1])[0];
}

Array Rng::shuffle(Array arr) {
	for (int64_t i = arr.size() - 1; i > 0; i--) {
		const int64_t j = int64_t(std::floor(m.next() * double(i + 1)));
		const Variant tmp = arr[i];
		arr[i] = arr[j];
		arr[j] = tmp;
	}
	return arr;
}

void Rng::_bind_methods() {
	ClassDB::bind_static_method("Rng", D_METHOD("create", "seed"), &Rng::create);
	ClassDB::bind_method(D_METHOD("get_state"), &Rng::get_state);
	ClassDB::bind_method(D_METHOD("set_state", "state"), &Rng::set_state);
	ADD_PROPERTY(PropertyInfo(Variant::INT, "state"), "set_state", "get_state");
	ClassDB::bind_method(D_METHOD("next"), &Rng::next);
	ClassDB::bind_method(D_METHOD("range_f", "lo", "hi"), &Rng::range_f);
	ClassDB::bind_method(D_METHOD("int_in", "lo", "hi"), &Rng::int_in);
	ClassDB::bind_method(D_METHOD("chance", "p"), &Rng::chance);
	ClassDB::bind_method(D_METHOD("pick", "arr"), &Rng::pick);
	ClassDB::bind_method(D_METHOD("weighted", "entries"), &Rng::weighted);
	ClassDB::bind_method(D_METHOD("shuffle", "arr"), &Rng::shuffle);
	ClassDB::bind_static_method("Rng", D_METHOD("hash_string", "s"), &Rng::hash_string);
}

double JsMath::hypot(double a, double b) { return js::hypot(a, b); }
double JsMath::round_js(double x) { return js::round(x); }

void JsMath::_bind_methods() {
	ClassDB::bind_static_method("JsMath", D_METHOD("hypot", "a", "b"), &JsMath::hypot);
	ClassDB::bind_static_method("JsMath", D_METHOD("round_js", "x"), &JsMath::round_js);
}

} // namespace godot
