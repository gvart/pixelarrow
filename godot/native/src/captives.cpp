#include "captives.h"

#include <algorithm>
#include <cstdint>

#include "js_math.h"
#include "sim_data.h"

namespace sim {

double refuse_chance(double level) {
	const CaptiveRules &C = data().captives.CAPTIVE;
	return std::min(1.0, C.refuse + C.refusePerLevel * std::max(0.0, level - 1));
}

// The UTF-16 code units of a UTF-8 string, as JS charCodeAt sees them.
static std::vector<uint16_t> utf16(const std::string &s) {
	std::vector<uint16_t> out;
	for (size_t i = 0; i < s.size();) {
		const uint8_t c = uint8_t(s[i]);
		uint32_t cp;
		int n;
		if (c < 0x80) cp = c, n = 1;
		else if (c < 0xe0) cp = c & 0x1f, n = 2;
		else if (c < 0xf0) cp = c & 0x0f, n = 3;
		else cp = c & 0x07, n = 4;
		for (int k = 1; k < n && i + k < s.size(); k++) cp = (cp << 6) | (uint8_t(s[i + k]) & 0x3f);
		i += n;
		if (cp >= 0x10000) {
			cp -= 0x10000;
			out.push_back(uint16_t(0xd800 + (cp >> 10)));
			out.push_back(uint16_t(0xdc00 + (cp & 0x3ff)));
		} else out.push_back(uint16_t(cp));
	}
	return out;
}

double unit_of(const std::string &id) {
	uint32_t h = 0x811c9dc5u;
	for (uint16_t c : utf16(id)) h = (h ^ c) * 0x01000193u; // Math.imul: the low 32 bits
	h ^= h >> 15;
	h = h * 0x2c1b3c6du;
	h ^= h >> 12;
	return double(h) / 4294967296.0;
}

bool refuses(const std::string &id, double level) { return unit_of("join:" + id) < refuse_chance(level); }

double ask_at(double until) {
	const CaptiveRules &C = data().captives.CAPTIVE;
	return until - C.holdMs + C.askMs;
}

std::vector<std::string> soul_regions(const std::string &from) {
	const auto &world = data().captives.WORLD_REGIONS;
	double ax = 0, ay = 0;
	for (const WorldRegion &r : world)
		if (r.id == from) {
			ax = r.x, ay = r.y;
			break;
		}
	std::vector<const WorldRegion *> rest;
	for (const WorldRegion &r : world)
		if (r.id != from) rest.push_back(&r);
	// Array.prototype.sort is stable: a stable sort on the same comparator gives the same order. localeCompare on these
	// ids (lowercase ASCII and '-') orders as plain byte comparison.
	std::stable_sort(rest.begin(), rest.end(), [&](const WorldRegion *a, const WorldRegion *b) {
		const double c = js::pow(a->x - ax, 2) + js::pow(a->y - ay, 2) - (js::pow(b->x - ax, 2) + js::pow(b->y - ay, 2));
		if (c != 0) return c < 0;
		return a->id < b->id;
	});
	std::vector<std::string> out{ from };
	for (const WorldRegion *r : rest) out.push_back(r->id);
	return out;
}

} // namespace sim
