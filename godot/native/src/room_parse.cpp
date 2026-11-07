// protocol.ts clientMsgSchema (see room_parse.h), schema by schema in the TS order. A tiny zod: each schema checks a
// Variant and writes what zod would output.
#include "room_parse.h"

#include <cmath>
#include <functional>
#include <regex>
#include <string>
#include <utility>
#include <vector>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/string.hpp>

#include "js_json.h"
#include "sim_data.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::Variant;

namespace {

struct Z {
	std::function<bool(const Variant &, Variant &)> f;
	bool optional = false;
	bool operator()(const Variant &in, Variant &out) const { return f(in, out); }
};

Z opt(Z z) {
	z.optional = true;
	return z;
}

std::string u8(const Variant &v) { return godot::String(v).utf8().get_data(); }

// JS string length (UTF-16 units) of a UTF-8 string
size_t utf16_len(const std::string &s) {
	size_t n = 0;
	for (size_t i = 0; i < s.size(); i++) {
		const unsigned char c = s[i];
		if ((c & 0xC0) == 0x80) continue;
		n += c >= 0xF0 ? 2 : 1;
	}
	return n;
}

bool is_num(const Variant &v) { return v.get_type() == Variant::INT || v.get_type() == Variant::FLOAT; }

// z.number() (finite), .int() (a safe integer), .min / .max, .positive()
struct NumRule {
	bool integer = false;
	double min = -INFINITY, max = INFINITY;
	bool positive = false;
};
Z number(NumRule r = {}) {
	return { [r](const Variant &in, Variant &out) {
		if (!is_num(in)) return false;
		const double v = in;
		if (!std::isfinite(v)) return false;
		if (r.integer && (std::floor(v) != v || std::abs(v) > 9007199254740991.0)) return false;
		if (v < r.min || v > r.max || (r.positive && !(v > 0))) return false;
		out = in;
		return true;
	} };
}
Z num() { return number(); }
Z id() { return number({ true, 0, 2147483648.0 }); }
Z amount() { return number({ false, -INFINITY, 1e6, true }); }

Z boolean() {
	return { [](const Variant &in, Variant &out) {
		if (in.get_type() != Variant::BOOL) return false;
		out = in;
		return true;
	} };
}

Z str(size_t min, size_t max, const char *re = nullptr) {
	std::shared_ptr<std::regex> rx = re ? std::make_shared<std::regex>(re, std::regex::ECMAScript) : nullptr;
	return { [=](const Variant &in, Variant &out) {
		if (in.get_type() != Variant::STRING && in.get_type() != Variant::STRING_NAME) return false;
		const std::string s = u8(in);
		const size_t n = utf16_len(s);
		if (n < min || n > max) return false;
		if (rx && !std::regex_search(s, *rx)) return false;
		out = in;
		return true;
	} };
}
Z regex(const char *re) { return str(0, SIZE_MAX, re); }

Z lit(const char *s) {
	const std::string want = s;
	return { [want](const Variant &in, Variant &out) {
		if (in.get_type() != Variant::STRING || u8(in) != want) return false;
		out = in;
		return true;
	} };
}
Z lit_num(double want) {
	return { [want](const Variant &in, Variant &out) {
		if (!is_num(in) || double(in) != want) return false;
		out = in;
		return true;
	} };
}
Z lit_true() {
	return { [](const Variant &in, Variant &out) {
		if (in.get_type() != Variant::BOOL || !bool(in)) return false;
		out = in;
		return true;
	} };
}

Z enm(std::vector<std::string> xs) {
	return { [xs](const Variant &in, Variant &out) {
		if (in.get_type() != Variant::STRING) return false;
		const std::string s = u8(in);
		for (const std::string &x : xs)
			if (x == s) return (out = in), true;
		return false;
	} };
}

Z array(Z el, size_t min, size_t max, std::function<bool(const Array &)> refine = nullptr) {
	return { [=](const Variant &in, Variant &out) {
		if (in.get_type() != Variant::ARRAY) return false;
		const Array a = in;
		if (size_t(a.size()) < min || size_t(a.size()) > max) return false;
		Array o;
		for (int64_t i = 0; i < a.size(); i++) {
			Variant x;
			if (!el(a[i], x)) return false;
			o.push_back(x);
		}
		if (refine && !refine(o)) return false;
		out = o;
		return true;
	} };
}

using Shape = std::vector<std::pair<const char *, Z>>;
// z.object(shape) (strip; `strict`: unknown keys fail), then .refine(s)
Z object(Shape shape, bool strict = false, std::function<bool(const Dictionary &)> refine = nullptr) {
	return { [=](const Variant &in, Variant &out) {
		if (in.get_type() != Variant::DICTIONARY) return false;
		const Dictionary d = in;
		if (strict) {
			const Array ks = d.keys();
			for (int64_t i = 0; i < ks.size(); i++) {
				bool known = false;
				for (const auto &[k, z] : shape) known = known || u8(ks[i]) == k;
				if (!known) return false;
			}
		}
		Dictionary o;
		for (const auto &[k, z] : shape) {
			if (!d.has(k)) {
				if (!z.optional) return false;
				continue;
			}
			Variant x;
			if (!z(d[k], x)) return false;
			o[k] = x;
		}
		if (refine && !refine(o)) return false;
		out = o;
		return true;
	} };
}

Shape operator+(Shape a, const Shape &b) {
	a.insert(a.end(), b.begin(), b.end());
	return a;
}

// z.discriminatedUnion(key, options): the option whose literal matches the key's value
Z dunion(const char *key, std::vector<std::pair<std::string, Z>> opts) {
	const std::string k = key;
	return { [=](const Variant &in, Variant &out) {
		if (in.get_type() != Variant::DICTIONARY) return false;
		const Dictionary d = in;
		if (!d.has(k.c_str()) || d[k.c_str()].get_type() != Variant::STRING) return false;
		const std::string v = u8(d[k.c_str()]);
		for (const auto &[name, z] : opts)
			if (name == v) return z(in, out);
		return false;
	} };
}

// z.partialRecord(key enum, value)
Z record(std::vector<std::string> keys, Z val) {
	return { [=](const Variant &in, Variant &out) {
		if (in.get_type() != Variant::DICTIONARY) return false;
		const Dictionary d = in;
		const Array ks = d.keys();
		Dictionary o;
		for (int64_t i = 0; i < ks.size(); i++) {
			if (ks[i].get_type() != Variant::STRING) return false;
			const std::string k = u8(ks[i]);
			bool ok = false;
			for (const std::string &x : keys) ok = ok || x == k;
			if (!ok) return false;
			Variant x;
			if (!val(d[ks[i]], x)) return false;
			o[ks[i]] = x;
		}
		out = o;
		return true;
	} };
}

bool has(const Dictionary &d, const char *k) { return d.has(k); }

const std::vector<std::string> BUILDING_TYPES = { "privateHouse", "camp", "storehouse", "outpost", "fort", "barracks", "farm", "olivePress", "palisade", "rampart", "stoneWall", "woodStairs",
	"stoneStairs", "ladder", "woodTower", "stoneTower", "woodGate", "stoneGate", "woodBridge", "stoneBridge", "brazier", "pitchKiln", "forge", "forge2", "forge3", "cookhouse", "cookhouse2",
	"cookhouse3", "infirmary", "infirmary2", "infirmary3", "workshop", "workshop2", "workshop3", "stall", "stall2", "stall3", "sortingFloor", "sortingFloor2", "chest", "stakes", "ditch",
	"towerBridge", "house", "cottage", "tent", "temple", "shrine", "stoa", "statue", "well", "jetty", "warehouse", "board", "cache", "tunnel" };
const std::vector<std::string> GOODS = { "food", "wood", "stone", "marble", "copper", "tin", "iron", "bronze", "silver", "salt", "pitch", "hides", "flax", "herbs", "charcoal", "leather",
	"linen", "oil", "coin", "dragonbone", "nereidPearl", "starIron", "asphodel", "titanBronze", "obsidian", "ration" };
constexpr int ALLIANCES = 4, MAX_SQUADS = 3;

struct Schemas {
	Z client;
	Schemas() {
		const double MAX_SQUAD = data().soldiers.ARMY_MAX;
		const auto pts = [](size_t max, std::function<bool(const Array &)> more = nullptr) {
			return array(num(), 0, max * 2, [more](const Array &a) { return a.size() % 2 == 0 && (!more || more(a)); });
		};
		const Z rot = opt({ [](const Variant &in, Variant &out) { return lit_num(0)(in, out) || lit_num(1)(in, out); } });
		const Z good = enm(GOODS);
		const Z holderRef = object({ { "building", opt(id()) }, { "cart", opt(id()) }, { "pile", opt(id()) } }, true,
				[](const Dictionary &o) { return int(has(o, "building")) + int(has(o, "cart")) + int(has(o, "pile")) == 1; });
		const Shape target = { { "building", opt(id()) }, { "siege", opt(id()) } };
		const auto oneTarget = [](const Dictionary &o) { return has(o, "building") != has(o, "siege"); };
		const Shape U = { { "units", opt(array(id(), 1, size_t(MAX_SQUAD * (MAX_SQUADS + 1)))) } };
		const Shape sq = { { "squad", id() } };
		const auto K = [](const char *k) { return Shape{ { "kind", lit(k) } }; };
		const auto o = [](const char *k, Z z) { return std::pair<std::string, Z>(k, z); };
		const Z order = dunion("kind", {
			o("move", object(K("move") + sq + U + Shape{ { "x", num() }, { "y", num() } })),
			o("attack", object(K("attack") + sq + U + Shape{ { "target", id() } })),
			o("hold", object(K("hold") + sq + U)),
			o("attackMove", object(K("attackMove") + sq + U + Shape{ { "x", num() }, { "y", num() } })),
			o("stop", object(K("stop") + sq + U)),
			o("formation", object(K("formation") + sq + U + Shape{ { "shape", enm({ "line", "column", "wedge", "loose" }) } })),
			o("stopWork", object(K("stopWork") + sq + U)),
			o("fireArrows", object(K("fireArrows") + sq + U + Shape{ { "on", boolean() } })),
			o("detach", object(K("detach") + sq + U + Shape{ { "count", opt(number({ true, 1, MAX_SQUAD })) }, { "unitIds", opt(array(id(), 1, size_t(MAX_SQUAD))) } })),
			o("merge", object(K("merge") + sq + U + Shape{ { "into", id() } })),
			o("active", object(K("active") + sq + U)),
			o("man", object(K("man") + sq + Shape{ { "unit", id() }, { "act", enm({ "fallBack", "rear", "rejoin" }) } })),
			o("gather", object(K("gather") + sq + U + Shape{ { "node", id() }, { "cart", opt(id()) } })),
			o("build", object(K("build") + sq + U + Shape{ { "site", id() } })),
			o("civWork", object(K("civWork") + sq + U + Shape{ { "building", id() } })),
			o("placeBuilding", object(K("placeBuilding") + Shape{ { "squad", opt(id()) } } + U + Shape{ { "type", enm(BUILDING_TYPES) }, { "x", num() }, { "y", num() }, { "rot", rot } })),
			o("placeWall", object(K("placeWall") + Shape{ { "squad", opt(id()) } } + U +
					Shape{ { "material", enm({ "wood", "timber", "stone" }) }, { "points", pts(32) }, { "towers", opt(pts(16)) }, { "gates", opt(pts(16)) }, { "inside", opt(pts(1)) } })),
			o("placeBridge", object(K("placeBridge") + Shape{ { "squad", opt(id()) } } + U +
					Shape{ { "material", enm({ "wood", "stone" }) }, { "points", pts(2) }, { "width", opt(number({ true, 1, 3 })) } })),
			o("upgrade", object(K("upgrade") + Shape{ { "building", id() }, { "squad", opt(id()) } } + U)),
			o("cancelSite", object(K("cancelSite") + Shape{ { "site", id() } })),
			o("demolish", object(K("demolish") + Shape{ { "building", id() } })),
			o("setAccess", object(K("setAccess") + Shape{ { "building", id() }, { "access", opt(enm(data().economy.ACCESS)) }, { "share", opt(number({ false, 0, 1 })) }, { "fee", opt(number({ false, 0, 100000 })) } })),
			o("claimRegion", object(K("claimRegion") + sq + U + Shape{ { "point", id() } })),
			o("claimSoul", object(K("claimSoul") + sq + U + Shape{ { "soul", id() } })),
			o("repairBuilding", object(K("repairBuilding") + sq + U + Shape{ { "building", id() } })),
			o("rebuild", object(K("rebuild") + Shape{ { "building", id() }, { "squad", opt(id()) } } + U)),
			o("craft", object(K("craft") + Shape{ { "building", id() }, { "recipe", str(0, 48, "^[a-z_]+(:[a-z0-9_]+)?$") } })),
			o("cancelCraft", object(K("cancelCraft") + Shape{ { "building", id() }, { "order", id() } })),
			o("fortify", object(K("fortify") + Shape{ { "building", id() }, { "fort", enm({ "ironGate", "wetHides" }) } })),
			o("buildSiege", object(K("buildSiege") + sq + U + Shape{ { "type", enm({ "ram", "stoneThrower", "siegeLadder", "mantlet", "coveredRam", "oxybeles", "siegeTower" }) }, { "x", num() }, { "y", num() } })),
			o("crew", object(K("crew") + sq + U + Shape{ { "siege", id() } })),
			o("uncrew", object(K("uncrew") + sq + U)),
			o("deploy", object(K("deploy") + sq + U + Shape{ { "pack", opt(boolean()) } })),
			o("raiseLadder", object(K("raiseLadder") + sq + U + Shape{ { "wallTile", pts(1, [](const Array &a) { return a.size() == 2; }) } })),
			o("pushLadder", object(K("pushLadder") + sq + U + Shape{ { "ladder", id() } })),
			o("attackBuilding", object(K("attackBuilding") + sq + U + target, false, oneTarget)),
			o("ignite", object(K("ignite") + sq + U + target, false, oneTarget)),
			o("extinguish", object(K("extinguish") + sq + U + target, false, oneTarget)),
			o("load", object(K("load") + sq + U + Shape{ { "from", holderRef }, { "res", opt(good) }, { "n", opt(amount()) }, { "send", opt(lit_true()) } })),
			o("unload", object(K("unload") + sq + U + Shape{ { "to", holderRef }, { "res", opt(good) } })),
			o("escort", object(K("escort") + sq + U + Shape{ { "cart", id() } })),
			o("salvagePile", object(K("salvagePile") + sq + U + Shape{ { "pile", id() }, { "uid", str(1, 120) } })),
		});
		const auto T = [](const char *t) { return Shape{ { "t", lit(t) } }; };
		const Z uids = opt(array(str(1, 120), 0, 20));
		const Z goods = opt(record(GOODS, amount()));
		const Z base = dunion("t", {
			o("join", object(T("join") + Shape{
				{ "v", number({ true }) },
				{ "region", regex("^[a-z0-9_-]{1,40}$") },
				{ "playerId", number({ true, -INFINITY, INFINITY, true }) },
				{ "team", number({ true, 0, ALLIANCES - 1 }) },
				{ "squads", opt(array(array(regex("^[A-Za-z0-9_-]{1,40}$"), 1, size_t(MAX_SQUAD)), 1, MAX_SQUADS)) },
				{ "army", opt(array(object({ { "cls", regex("^[a-z_]{1,24}$") }, { "count", number({ true, 1, MAX_SQUAD }) } }), 1, MAX_SQUADS)) },
			})),
			o("order", object(T("order") + Shape{ { "o", order } })),
			o("view", object(T("view") + Shape{ { "x0", num() }, { "y0", num() }, { "x1", num() }, { "y1", num() } })),
			o("ping", object(T("ping") + Shape{ { "c", num() } })),
			o("mend", object(T("mend") + Shape{ { "kind", enm({ "repair", "salvage" }) }, { "building", id() }, { "uid", str(1, 120) } })),
			o("stow", object(T("stow") + Shape{ { "dir", enm({ "in", "out" }) }, { "site", enm({ "stall", "warehouse", "strongroom", "contract", "tribute" }) },
					{ "of", opt(number({ true, -INFINITY, INFINITY, true })) }, { "squad", opt(id()) }, { "cart", opt(id()) }, { "goods", goods }, { "uids", uids }, { "contract", opt(id()) } }, false,
					[](const Dictionary &m) { return has(m, "squad") != has(m, "cart") && ((u8(m["site"]) == "contract") == has(m, "contract")); })),
			o("handoff", object(T("handoff") + Shape{ { "op", enm({ "offer", "confirm", "cancel" }) }, { "with", number({ true, -INFINITY, INFINITY, true }) }, { "squad", opt(id()) },
					{ "cart", opt(id()) }, { "goods", goods }, { "uids", uids } }, false,
					[](const Dictionary &m) { return u8(m["op"]) != "offer" || has(m, "squad") != has(m, "cart"); })),
			o("npc", object(T("npc") + Shape{ { "op", enm({ "sell", "buy", "hire", "cart" }) }, { "res", opt(good) }, { "n", opt(amount()) }, { "cls", opt(regex("^civ_[a-z_]{1,20}$")) },
					{ "cart", opt(enm({ "handcart", "wagon" })) } }, false,
					[](const Dictionary &m) {
						const std::string op = u8(m["op"]);
						// `!!o.res`: a good is never the empty string, so present is truthy (and the cls regex needs 5 chars)
						return ((op != "sell" && op != "buy") || has(m, "res")) && (op != "hire" || has(m, "cls")) && (op != "cart" || has(m, "cart"));
					})),
			o("board", object(T("board") + Shape{ { "op", enm({ "view", "take", "deliver", "handin", "drop" }) }, { "entry", opt(regex("^[a-z0-9.]{1,16}$")) }, { "job", opt(id()) } })),
			o("guide", object(T("guide") + Shape{ { "op", lit("hide") } })),
			o("story", object(T("story") + Shape{ { "op", lit("choose") }, { "option", regex("^[a-z0-9_-]{1,32}$") } })),
			o("encounter", object(T("encounter") + Shape{ { "op", lit("choose") }, { "option", regex("^[a-z0-9_-]{1,32}$") } })),
		});
		const Shape C = T("check") + Shape{ { "id", id() } };
		const Z check = dunion("kind", {
			o("building", object(C + Shape{ { "kind", lit("building") }, { "type", enm(BUILDING_TYPES) }, { "x", num() }, { "y", num() }, { "rot", rot } })),
			o("wall", object(C + Shape{ { "kind", lit("wall") }, { "material", enm({ "wood", "timber", "stone" }) }, { "points", pts(32) }, { "towers", opt(pts(16)) }, { "gates", opt(pts(16)) }, { "inside", opt(pts(1)) } })),
			o("bridge", object(C + Shape{ { "kind", lit("bridge") }, { "material", enm({ "wood", "stone" }) }, { "points", pts(2) }, { "width", opt(number({ true, 1, 3 })) } })),
		});
		const Shape D = T("dev");
		const Z dev = dunion("op", {
			o("stock", object(D + Shape{ { "op", lit("stock") }, { "res", good }, { "n", amount() } })),
			o("claim", object(D + Shape{ { "op", lit("claim") }, { "x", num() }, { "y", num() }, { "r", opt(number({ false, -INFINITY, 64, true })) } })),
			o("spawn", object(D + Shape{ { "op", lit("spawn") }, { "team", number({ true, 0, ALLIANCES - 1 }) }, { "cls", regex("^[a-z_]{1,24}$") }, { "count", number({ true, 1, MAX_SQUAD }) }, { "x", num() }, { "y", num() } })),
			o("skip", object(D + Shape{ { "op", lit("skip") }, { "ticks", number({ true, 1, 600 }) } })),
		});
		client = { [base, check, dev](const Variant &in, Variant &out) { return base(in, out) || check(in, out) || dev(in, out); } };
	}
};

} // namespace

std::optional<Dictionary> parse_client_msg(const Variant &raw) {
	if (utf16_len(js_stringify(raw)) > size_t(MAX_CLIENT_MSG)) return std::nullopt;
	static const Schemas S; // after SimData.load (ARMY_MAX, ACCESS)
	Variant out;
	if (!S.client(raw, out)) return std::nullopt;
	return Dictionary(out);
}

} // namespace sim
