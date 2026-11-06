#include "tunnel.h"

#include <algorithm>
#include <cmath>
#include <vector>

#include <godot_cpp/core/class_db.hpp>

namespace sim {

// `${n}` of a whole number (every number these lines print is one)
static std::string num(double n) { return std::to_string(int64_t(n)); }

TunnelSettle settle_tunnel(const TunnelState &s, double now) {
	double alive = s.alive, raise = 0;
	std::optional<double> nextAt = s.nextAt;
	const double room = s.room.value_or(std::numeric_limits<double>::infinity()), floor = s.floor.value_or(TUNNEL.floor);
	if (alive >= floor || room <= 0) return { 0, std::nullopt, alive, 0 };
	if (!nextAt) nextAt = now + TUNNEL.everyMs;
	while (*nextAt <= now && alive < floor && raise < room) {
		raise++;
		alive++;
		*nextAt += TUNNEL.everyMs;
	}
	if (alive >= floor || raise >= room) nextAt = std::nullopt;
	return { raise, nextAt, alive, std::min(floor - alive, room - raise) };
}

std::string clock(double ms) {
	const double s = std::max(0.0, std::ceil(ms / 1000));
	std::string sec = num(std::fmod(s, 60));
	if (sec.size() < 2) sec = "0" + sec;
	return num(std::floor(s / 60)) + ":" + sec;
}

std::string span(double ms) {
	if (ms < 3600000) return clock(ms);
	const double m = std::ceil(ms / 60000);
	const double r = std::fmod(m, 60);
	return num(std::floor(m / 60)) + " h" + (r != 0 ? " " + num(r) + " m" : "");
}

bool wiped(const WipeState &t) { return t.fit == 0 && (t.nextAt || t.wounded > 0); }

WipeNext wipe_next(const WipeState &t) {
	std::vector<WipeNext> c;
	if (t.nextAt) c.push_back({ t.nextAt, "The next man rises in" });
	if (t.wounded > 0 && t.woundedAt) c.push_back({ t.woundedAt, "Your first wounded man is fit in" });
	std::stable_sort(c.begin(), c.end(), [](const WipeNext &a, const WipeNext &b) { return *a.at - *b.at < 0; });
	if (!c.empty()) return c[0];
	return { std::nullopt, "Your next man stands in" };
}

std::string wipe_line(const WipeState &t, double now) {
	std::vector<std::string> p;
	if (t.nextAt && t.wounded > 0) p.push_back("Next fighter rises in " + span(*t.nextAt - now));
	if (t.wounded > 0) p.push_back(num(t.wounded) + " wounded heal" + (t.woundedAt ? " in " + span(*t.woundedAt - now) : ""));
	std::string out;
	for (size_t i = 0; i < p.size(); i++) out += (i ? " · " : "") + p[i];
	return out;
}

std::optional<std::string> tunnel_line(double alive, std::optional<double> nextAt, double now, double floor) {
	if (!nextAt || alive >= floor) return std::nullopt;
	return "Next fighter rises in " + clock(*nextAt - now) + " · " + num(alive) + "/" + num(floor);
}

std::string tunnel_hint(double floor) {
	return "The Tunnel of Shades: while you have fewer than " + num(floor) + " men, one rises in your home town every 10 min";
}

} // namespace sim

namespace godot {

static std::optional<double> opt(const Variant &v) {
	if (v.get_type() == Variant::NIL) return std::nullopt;
	return double(v);
}
static Variant var(const std::optional<double> &v) { return v ? Variant(*v) : Variant(); }
static String str(const std::string &s) { return String::utf8(s.c_str()); }

static sim::WipeState wipe_of(const Dictionary &d) {
	return { d["fit"], opt(d.get("nextAt", Variant())), d["wounded"], opt(d.get("woundedAt", Variant())) };
}

Dictionary Tunnel::rules() {
	Dictionary d;
	d["floor"] = sim::TUNNEL.floor;
	d["everyMs"] = sim::TUNNEL.everyMs;
	return d;
}

Dictionary Tunnel::settle(const Dictionary &state, double now) {
	sim::TunnelState s;
	s.alive = state["alive"];
	s.nextAt = opt(state.get("nextAt", Variant()));
	s.room = opt(state.get("room", Variant()));
	s.floor = opt(state.get("floor", Variant()));
	const sim::TunnelSettle r = sim::settle_tunnel(s, now);
	Dictionary d;
	d["raise"] = r.raise;
	d["nextAt"] = var(r.nextAt);
	d["alive"] = r.alive;
	d["pending"] = r.pending;
	return d;
}

String Tunnel::clock(double ms) { return str(sim::clock(ms)); }
String Tunnel::span(double ms) { return str(sim::span(ms)); }
bool Tunnel::wiped(const Dictionary &t) { return sim::wiped(wipe_of(t)); }

Dictionary Tunnel::wipe_next(const Dictionary &t) {
	const sim::WipeNext n = sim::wipe_next(wipe_of(t));
	Dictionary d;
	d["at"] = var(n.at);
	d["text"] = str(n.text);
	return d;
}

String Tunnel::wipe_line(const Dictionary &t, double now) { return str(sim::wipe_line(wipe_of(t), now)); }

Variant Tunnel::tunnel_line(double alive, const Variant &next_at, double now, const Variant &floor) {
	const auto l = sim::tunnel_line(alive, opt(next_at), now, opt(floor).value_or(sim::TUNNEL.floor));
	return l ? Variant(str(*l)) : Variant();
}

String Tunnel::tunnel_hint(double floor) { return str(sim::tunnel_hint(floor)); }

void Tunnel::_bind_methods() {
	ClassDB::bind_static_method("Tunnel", D_METHOD("rules"), &Tunnel::rules);
	ClassDB::bind_static_method("Tunnel", D_METHOD("settle", "state", "now"), &Tunnel::settle);
	ClassDB::bind_static_method("Tunnel", D_METHOD("clock", "ms"), &Tunnel::clock);
	ClassDB::bind_static_method("Tunnel", D_METHOD("span", "ms"), &Tunnel::span);
	ClassDB::bind_static_method("Tunnel", D_METHOD("wiped", "state"), &Tunnel::wiped);
	ClassDB::bind_static_method("Tunnel", D_METHOD("wipe_next", "state"), &Tunnel::wipe_next);
	ClassDB::bind_static_method("Tunnel", D_METHOD("wipe_line", "state", "now"), &Tunnel::wipe_line);
	ClassDB::bind_static_method("Tunnel", D_METHOD("tunnel_line", "alive", "next_at", "now", "floor"), &Tunnel::tunnel_line);
	ClassDB::bind_static_method("Tunnel", D_METHOD("tunnel_hint", "floor"), &Tunnel::tunnel_hint);
}

} // namespace godot
