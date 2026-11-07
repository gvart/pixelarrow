// src/war/net/codec.ts DeltaEncoder, line for line (see codec.h).
#include "codec.h"

#include <cmath>
#include <set>

#include <godot_cpp/variant/string.hpp>

#include "js_json.h"
#include "js_math.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::String;
using godot::Variant;

static constexpr int NET_VERSION = 28, QUANT = 8;
static constexpr int POS = 1, FACE = 2, HP = 4, STATE = 8, Z = 16, ANIM = 32, META = 64, EXTRA = 128;
static const char *const STATES[] = { "idle", "move", "attack", "dead", "gather", "build" };
static const char *const TASKS[] = { "", "ignite", "extinguish", "push", "crew" };
static const char *const CARRY[] = { "", "food", "wood", "stone", "marble", "copper", "tin", "iron", "bronze", "silver", "salt", "pitch" };
static const char *const MISSILES[] = { "arrow", "stone", "javelin" };
static const char *const REASONS[] = { "", "noBrazier", "noPitch" };
static const double TAU = M_PI * 2;
enum { QX, QY, QF, QH, QS, QZ, QSW, QRD, QON, QTK, QCA, QLD, QTG, QSA };

template <size_t N>
static int index_of(const char *const (&list)[N], const Variant &v, bool undefinedFirst) {
	// list.indexOf(v): a missing value (undefined) is at 0 only where the list starts with undefined
	if (v.get_type() == Variant::NIL) return undefinedFirst ? 0 : -1;
	const std::string s = String(v).utf8().get_data();
	for (size_t i = undefinedFirst ? 1 : 0; i < N; i++)
		if (s == list[i]) return int(i);
	return -1;
}

static double num(const Dictionary &d, const char *k, double dflt = 0) {
	const Variant v = d.get(k, Variant());
	return v.get_type() == Variant::NIL ? dflt : double(v);
}
static bool has(const Dictionary &d, const char *k) { return d.has(k) && d[k].get_type() != Variant::NIL; }
static std::string str(const Variant &v) { return v.get_type() == Variant::NIL ? "" : std::string(String(v).utf8().get_data()); }

static int clampU16(double v) { return v < 0 ? 0 : v > 65535 ? 65535 : int(v); }
static int u8v(const Dictionary &d, const char *k) {
	if (!has(d, k)) return 255;
	const double v = d[k];
	return v < 0 ? 0 : v > 254 ? 254 : int(js::round(v));
}
static int u8n(double v) { return v < 0 ? 0 : v > 254 ? 254 : int(js::round(v)); }
static int32_t to_int32(double v) {
	if (!std::isfinite(v)) return 0;
	const double t = std::trunc(v), m = std::fmod(t, 4294967296.0);
	const double u = m < 0 ? m + 4294967296.0 : m;
	return int32_t(uint32_t(u));
}
static uint32_t to_uint32(double v) { return uint32_t(to_int32(v)); }

static std::vector<int> quantise(const Dictionary &u, int tick) {
	const int w = !has(u, "wounded") ? 0 : bool(u["wounded"]) ? 24 : 8;
	const double f = num(u, "facing");
	const double turn = std::fmod(std::fmod(f, TAU) + TAU, TAU) / TAU;
	return {
		clampU16(js::round(num(u, "x") * QUANT)), clampU16(js::round(num(u, "y") * QUANT)),
		to_int32(js::round(turn * 256)) & 255,
		clampU16(js::round(num(u, "hp") * 10)), std::max(0, index_of(STATES, u["state"], false)) | w | (has(u, "down") ? 32 : 0), u8n(num(u, "z", 0)),
		u8v(u, "swing"), u8v(u, "ready"), !has(u, "on") ? 0 : int(num(u, "on")) + 1, std::max(0, index_of(TASKS, u.get("task", Variant()), true)),
		std::max(0, index_of(CARRY, u.get("carry", Variant()), true)), u8n(num(u, "load", 0)),
		num(u, "tag") != 0 ? tick + int(num(u, "tag")) : 0, u8v(u, "sat"),
	};
}

namespace {
// A growable byte writer (codec.ts Writer).
struct Writer {
	std::vector<uint8_t> buf;
	void u8(int v) { buf.push_back(uint8_t(v)); }
	void u16(int v) {
		buf.push_back(uint8_t(v & 255));
		buf.push_back(uint8_t((v >> 8) & 255));
	}
	void u32(double v) {
		const uint32_t x = to_uint32(v);
		for (int i = 0; i < 4; i++) buf.push_back(uint8_t((x >> (8 * i)) & 255));
	}
	void v(double v) {
		uint32_t x = to_uint32(v);
		while (x >= 0x80) {
			buf.push_back(uint8_t((x & 0x7f) | 0x80));
			x >>= 7;
		}
		buf.push_back(uint8_t(x));
	}
	void z(double x) { v(x >= 0 ? x * 2 : -x * 2 - 1); }
	void s(const std::string &t) {
		// t.length and charCodeAt: UTF-16 units (ASCII here)
		const godot::Char16String w = String::utf8(t.c_str()).utf16();
		const int64_t len = std::min<int64_t>(255, w.length());
		buf.push_back(uint8_t(len));
		for (int64_t i = 0; i < len; i++) buf.push_back(uint8_t(w.get_data()[i] & 0x7f));
	}
	void bytes(const std::string &b) {
		v(double(b.size()));
		buf.insert(buf.end(), b.begin(), b.end());
	}
};
} // namespace

static std::string num_s(double v) { return js::number_to_string(v); }

// `${s.team}|${s.order}|${s.owner}|${s.meals ?? ''}|${s.cartDrop ?? ''}|${fa ? `${fa.on}${fa.available}${fa.reason}` : ''}|${activeAbs(s, tick)}`
static std::string squad_key(const Dictionary &s, int tick) {
	std::string k = num_s(s["team"]) + "|" + str(s["order"]) + "|" + str(s["owner"]) + "|" + (has(s, "meals") ? num_s(s["meals"]) : "") + "|" + (has(s, "cartDrop") ? num_s(s["cartDrop"]) : "") + "|";
	if (has(s, "fireArrows")) {
		const Dictionary fa = s["fireArrows"];
		k += std::string(bool(fa["on"]) ? "true" : "false") + (bool(fa["available"]) ? "true" : "false") + (has(fa, "reason") ? str(fa["reason"]) : "undefined");
	}
	k += "|";
	if (has(s, "active")) {
		const Dictionary a = s["active"];
		const double ready = a["ready"], on = a["on"];
		k += str(a["skill"]) + "," + num_s(ready ? tick + ready : 0) + "," + num_s(on ? tick + on : 0);
	} else k += "null";
	return k;
}

static double absIn(int tick, double n) { return n > 0 ? tick + n : -1; }

// A guardian's slow part (all but x, y, hp), countdowns made absolute.
static Dictionary boss_rest(const Dictionary &b, int tick) {
	Dictionary r;
	const Array keys = b.keys();
	for (int64_t i = 0; i < keys.size(); i++) {
		const String k = keys[i];
		if (k == "x" || k == "y" || k == "hp") continue;
		r[k] = b[k];
	}
	if (b.has("respawnIn")) r["respawnIn"] = absIn(tick, b["respawnIn"]);
	if (b.has("fx")) {
		Dictionary fx = Dictionary(b["fx"]).duplicate();
		fx["t"] = tick - double(fx["t"]);
		r["fx"] = fx;
	}
	if (b.has("tele")) {
		Dictionary t = Dictionary(b["tele"]).duplicate();
		t["in"] = absIn(tick, t["in"]);
		r["tele"] = t;
	}
	return r;
}

static std::string id_key(const Variant &id) { return id.get_type() == Variant::STRING ? "s" + str(id) : "n" + num_s(id); }

// A JSON block of the records that changed since `sent` (and the ids gone), or 0 bytes for none.
template <class M>
static void records(Writer &w, M &sent, const Array &now, bool key) {
	std::vector<std::string> u;
	std::set<std::string> seen;
	for (int64_t i = 0; i < now.size(); i++) {
		const Dictionary b = now[i];
		const std::string k = id_key(b["id"]), j = js_stringify(b);
		seen.insert(k);
		auto it = sent.find(k);
		if (it == sent.end() || it->second.json != j) {
			sent[k] = { b["id"], j };
			u.push_back(j);
		}
	}
	std::vector<std::pair<std::string, Variant>> r;
	if (!key)
		for (auto &e : sent)
			if (!seen.count(e.first)) r.push_back({ e.first, e.second.id });
	for (auto &e : r) sent.erase(e.first);
	if (u.size() || r.size()) {
		std::string out = "{\"u\":[";
		for (size_t i = 0; i < u.size(); i++) out += (i ? "," : "") + u[i];
		out += "],\"r\":[";
		for (size_t i = 0; i < r.size(); i++) out += (i ? "," : "") + js_stringify(r[i].second);
		out += "]}";
		w.bytes(out);
	} else w.v(0);
}

godot::PackedByteArray DeltaEncoder::encode(const FrameInput &f, bool key) {
	if (key) {
		units.clear(), squads.clear(), buildings.clear(), sieges.clear(), souls.clear(), bosses.clear(), bossDyn.clear();
		warden = "";
	}
	Writer w;
	w.u8(key ? 2 : 1);
	w.u8(NET_VERSION);
	w.u32(f.tick);
	// units
	const size_t countAt = w.buf.size();
	w.u32(0); // placeholder, patched to a fixed 4-byte varint below
	int count = 0;
	std::set<int> seen;
	for (int64_t i = 0; i < f.units.size(); i++) {
		const Dictionary u = f.units[i];
		const int id = u["id"];
		seen.insert(id);
		const std::vector<int> q = quantise(u, f.tick);
		const std::string meta = num_s(u["squad"]) + "|" + num_s(u["maxHp"]) + "|" + str(u["cls"]) + "|" + (has(u, "pid") ? str(u["pid"]) : "") + "|" + num_s(has(u, "level") ? double(u["level"]) : 0);
		auto was = units.find(id);
		int m = 0;
		if (was == units.end() || was->second.meta != meta) m |= META | POS | FACE | HP | STATE | Z | ANIM | EXTRA;
		else {
			const std::vector<int> &p = was->second.q;
			if (p[QX] != q[QX] || p[QY] != q[QY]) m |= POS;
			if (p[QF] != q[QF]) m |= FACE;
			if (p[QH] != q[QH]) m |= HP;
			if (p[QS] != q[QS]) m |= STATE;
			if (p[QZ] != q[QZ]) m |= Z;
			if (p[QSW] != q[QSW] || p[QRD] != q[QRD]) m |= ANIM;
			if (p[QON] != q[QON] || p[QTK] != q[QTK] || p[QCA] != q[QCA] || p[QLD] != q[QLD] || p[QTG] != q[QTG] || p[QSA] != q[QSA]) m |= EXTRA;
		}
		if (!m) continue;
		units[id] = { q, meta };
		count++;
		w.v(id);
		w.u8(m);
		if (m & POS) w.u16(q[QX]), w.u16(q[QY]);
		if (m & FACE) w.u8(q[QF]);
		if (m & HP) w.u16(q[QH]);
		if (m & STATE) w.u8(q[QS]);
		if (m & Z) w.u8(q[QZ]);
		if (m & ANIM) w.u8(q[QSW]), w.u8(q[QRD]);
		if (m & META) {
			w.v(u["squad"]);
			w.u16(clampU16(js::round(double(u["maxHp"]) * 10)));
			w.s(str(u["cls"]));
			w.s(has(u, "pid") ? str(u["pid"]) : "");
			w.u8(has(u, "level") ? to_int32(u["level"]) & 255 : 0);
		}
		if (m & EXTRA) w.v(q[QON]), w.u8(q[QTK]), w.u8(q[QCA]), w.u8(q[QLD]), w.v(q[QTG]), w.u8(q[QSA]);
	}
	// a 4-byte varint (padded with continuation bits) so the count can be patched in place
	w.buf[countAt] = uint8_t((count & 0x7f) | 0x80);
	w.buf[countAt + 1] = uint8_t(((count >> 7) & 0x7f) | 0x80);
	w.buf[countAt + 2] = uint8_t(((count >> 14) & 0x7f) | 0x80);
	w.buf[countAt + 3] = uint8_t((count >> 21) & 0x7f);
	// removed
	std::vector<int> gone;
	if (!key)
		for (auto &e : units)
			if (!seen.count(e.first)) gone.push_back(e.first);
	w.v(double(gone.size()));
	for (int id : gone) units.erase(id), w.v(id);
	// squads
	std::vector<Dictionary> sq;
	for (int64_t i = 0; i < f.squads.size(); i++) {
		const Dictionary s = f.squads[i];
		auto it = squads.find(int(s["id"]));
		if (it == squads.end() || it->second != squad_key(s, f.tick)) sq.push_back(s);
	}
	w.v(double(sq.size()));
	for (const Dictionary &s : sq) {
		squads[int(s["id"])] = squad_key(s, f.tick);
		w.v(s["id"]);
		w.u8(to_int32(s["team"]) & 255);
		w.s(str(s["order"]));
		if (has(s, "fireArrows")) {
			const Dictionary fa = s["fireArrows"];
			w.u8(1 | (bool(fa["on"]) ? 2 : 0) | (bool(fa["available"]) ? 4 : 0) | (std::max(0, index_of(REASONS, fa.get("reason", Variant()), true)) << 3));
		} else w.u8(0);
		w.s(str(s["owner"]));
		w.u8(!has(s, "meals") ? 255 : int(std::min(254.0, double(s["meals"]))));
		w.v(!has(s, "cartDrop") ? 0 : double(s["cartDrop"]) + 1);
		if (has(s, "active")) {
			const Dictionary a = s["active"];
			const double ready = a["ready"], on = a["on"];
			w.s(str(a["skill"]));
			w.v(ready ? f.tick + ready : 0);
			w.v(on ? f.tick + on : 0);
		} else w.s("");
	}
	// shots
	w.v(double(f.shots.size()));
	for (int64_t i = 0; i < f.shots.size(); i++) {
		const Dictionary s = f.shots[i];
		w.u16(clampU16(js::round(double(s["x0"]) * QUANT)));
		w.u16(clampU16(js::round(double(s["y0"]) * QUANT)));
		w.u16(clampU16(js::round(double(s["x1"]) * QUANT)));
		w.u16(clampU16(js::round(double(s["y1"]) * QUANT)));
		w.v(std::max(0.0, f.tick - double(s["t0"])));
		w.u8(u8n(double(s["t1"]) - double(s["t0"])));
		w.u8(u8n(s["z0"]));
		w.u8(u8n(s["z1"]));
		w.u8(std::max(0, index_of(MISSILES, s["kind"], false)) | (has(s, "fire") ? 4 : 0) | (has(s, "siege") ? 8 : 0));
		w.z(s["by"]);
		if (has(s, "siege")) w.v(s["siege"]);
	}
	// buildings, then engines and carts: whole records, changed ones only (few)
	records(w, buildings, f.buildings, key);
	records(w, sieges, f.sieges, key);
	// W-60 souls: their `left` counts down every tick, so they go as absolute fade ticks (sent on change only)
	Array souls_abs;
	for (int64_t i = 0; i < f.souls.size(); i++) {
		Dictionary x = Dictionary(f.souls[i]).duplicate();
		x["left"] = f.tick + double(x["left"]);
		souls_abs.push_back(x);
	}
	records(w, souls, souls_abs, key);
	// W-67 guardians: the slow part as JSON on change, then position and hp in binary
	Array rest;
	for (int64_t i = 0; i < f.bosses.size(); i++) rest.push_back(boss_rest(f.bosses[i], f.tick));
	records(w, bosses, rest, key);
	struct Dyn {
		std::string id;
		int x, y;
		double hp;
	};
	std::vector<Dyn> dyn;
	for (int64_t i = 0; i < f.bosses.size(); i++) {
		const Dictionary b = f.bosses[i];
		Dyn d{ str(b["id"]), clampU16(js::round(double(b["x"]) * QUANT)), clampU16(js::round(double(b["y"]) * QUANT)), std::max(0.0, js::round(double(b["hp"]))) };
		const std::string k = std::to_string(d.x) + "," + std::to_string(d.y) + "," + num_s(d.hp);
		auto it = bossDyn.find(d.id);
		if (it == bossDyn.end() || it->second != k) dyn.push_back(d);
	}
	std::vector<std::string> drop;
	for (auto &e : bossDyn)
		if (!bosses.count("s" + e.first)) drop.push_back(e.first);
	for (auto &k : drop) bossDyn.erase(k);
	w.v(double(dyn.size()));
	for (const Dyn &d : dyn) {
		bossDyn[d.id] = std::to_string(d.x) + "," + std::to_string(d.y) + "," + num_s(d.hp);
		w.s(d.id);
		w.u16(d.x);
		w.u16(d.y);
		w.v(d.hp);
	}
	std::string wk = "none";
	Dictionary wd;
	if (f.warden.get_type() == Variant::DICTIONARY) {
		wd = f.warden;
		wk = num_s(wd["x"]) + "," + num_s(wd["y"]) + "," + num_s(wd["w"]) + "," + num_s(wd["h"]) + "," + num_s(absIn(f.tick, wd["in"]));
	}
	if (wk == warden) w.u8(0);
	else if (f.warden.get_type() != Variant::DICTIONARY) w.u8(1), warden = wk;
	else {
		warden = wk;
		w.u8(2);
		w.u16(clampU16(js::round(wd["x"])));
		w.u16(clampU16(js::round(wd["y"])));
		w.u8(u8n(wd["w"]));
		w.u8(u8n(wd["h"]));
		w.z(absIn(f.tick, wd["in"]));
	}
	godot::PackedByteArray out;
	out.resize(int64_t(w.buf.size()));
	for (size_t i = 0; i < w.buf.size(); i++) out.set(int64_t(i), w.buf[i]);
	return out;
}

} // namespace sim
