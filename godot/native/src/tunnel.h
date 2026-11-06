// W-66 the Tunnel of Shades (src/war/sim/tunnel.ts), line for line: the anti-reroll floor's lazy clock and the card and
// HUD lines. Times are ms (doubles, as the TS numbers); "null" is std::nullopt.
#pragma once

#include <cstdint>
#include <limits>
#include <optional>
#include <string>

#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/string.hpp>

namespace sim {

struct TunnelRules {
	int floor = 6;
	double everyMs = 10 * 60000;
};
inline const TunnelRules TUNNEL{};

// room: absent is no limit (Infinity); floor: absent is TUNNEL.floor
struct TunnelState {
	double alive = 0;
	std::optional<double> nextAt, room, floor;
};
struct TunnelSettle {
	double raise = 0;
	std::optional<double> nextAt;
	double alive = 0, pending = 0;
};
TunnelSettle settle_tunnel(const TunnelState &s, double now);

std::string clock(double ms);
std::string span(double ms);

struct WipeState {
	double fit = 0;
	std::optional<double> nextAt;
	double wounded = 0;
	std::optional<double> woundedAt;
};
bool wiped(const WipeState &t);
struct WipeNext {
	std::optional<double> at;
	std::string text;
};
WipeNext wipe_next(const WipeState &t);
std::string wipe_line(const WipeState &t, double now);
// nullopt: nothing pending
std::optional<std::string> tunnel_line(double alive, std::optional<double> nextAt, double now, double floor = TUNNEL.floor);
std::string tunnel_hint(double floor);

} // namespace sim

namespace godot {

// GDScript face of the tunnel rules (tests feed it the TS vectors; the room calls them too). Dictionaries are the TS
// shapes, null for null.
class Tunnel : public RefCounted {
	GDCLASS(Tunnel, RefCounted)

public:
	static Dictionary rules();
	static Dictionary settle(const Dictionary &state, double now);
	static String clock(double ms);
	static String span(double ms);
	static bool wiped(const Dictionary &t);
	static Dictionary wipe_next(const Dictionary &t);
	static String wipe_line(const Dictionary &t, double now);
	static Variant tunnel_line(double alive, const Variant &next_at, double now, const Variant &floor);
	static String tunnel_hint(double floor);

protected:
	static void _bind_methods();
};

} // namespace godot
