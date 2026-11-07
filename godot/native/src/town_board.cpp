// src/war/net/townBoard.ts, line for line (see town_board.h).
#include "town_board.h"

#include <algorithm>
#include <cmath>
#include <limits>

#include <godot_cpp/variant/string.hpp>

#include "combat.h"
#include "js_math.h"
#include "npc_market.h"
#include "sim_data.h"
#include "stories.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::Variant;

namespace {
constexpr double HOUR = 3'600'000, INF = std::numeric_limits<double>::infinity();
std::string S(const Variant &v) { return godot::String(v).utf8().get_data(); }
godot::String G(const std::string &s) { return godot::String::utf8(s.c_str()); }
const BoardTables &B() { return data().board; }
std::string N(double v) { return js::number_to_string(v); }

// a stable hash (FNV-1a) of a board's seed
uint32_t hash(const std::string &s) { return hash_string(G(s)); }
template <class T>
const T &pick(const std::vector<T> &xs, const std::string &seed) { return xs[hash(seed) % xs.size()]; }
std::vector<std::string> towns_at(const std::string &town, double n) {
	std::vector<std::string> out;
	for (const auto &r : data().market.regions)
		if (hops(town, r.id) == n) out.push_back(r.id);
	return out;
}
const std::vector<std::string> *words_of(const std::vector<std::pair<std::string, std::vector<std::string>>> &v, const std::string &k) {
	for (const auto &[a, b] : v)
		if (a == k) return &b;
	return nullptr;
}
std::string path_kind(const std::string &path) { return path == "warrior" ? "kill" : path == "builder" ? "build" : path == "trader" ? "trade" : ""; }

// ---------------------------------------------------------------- strength

double root_of(double hp, double dps) { return std::sqrt(std::max(0.0, hp) * std::max(0.0, dps)); }
constexpr double ARMOUR_MET = 4;
double man_root(const std::string &cls, double level = 1, double hp = 1) {
	const WarStats &s = data().classes.of(cls);
	const double blow = std::max(after_armour(s.dmg, ARMOUR_MET, 0) * (10.0 / std::max(1, s.atkTicks)),
		s.range > 0 ? after_armour(s.rangedDmg, ARMOUR_MET, s.ap) * (10.0 / std::max(1, s.shotTicks)) * s.accuracy : 0);
	const double life = (s.maxHp * (10 + s.armor)) / 10, up = 1 + 0.04 * std::max(0.0, level - 1);
	return root_of(life * up * hp, blow * up);
}
double beast_root(const std::string &kind, double depth) {
	const double m = data().depth.rules[size_t(std::max(0.0, std::min(4.0, depth)))].mob;
	const MobDef &def = data().mobs.MOBS.at(kind);
	return man_root(mob_class(kind)) * m * (def.venom || def.dash ? 1.18 : kind == "bandit" ? 1.25 : 1);
}
double floor_strength() {
	static double v = -1;
	if (v >= 0) return v;
	double best = INF;
	for (const auto &[f, start] : data().guide.familyStart) {
		std::vector<BoardMan> men;
		for (const std::string &cls : start) men.push_back({ cls, std::nullopt, std::nullopt });
		best = std::min(best, army_strength(men));
	}
	return v = best;
}
std::string rating_of(double army, double band) {
	const double r = army / std::max(1e-6, band);
	return r >= B().rating.easy ? "easy" : r >= B().rating.fair ? "fair" : r >= B().rating.hard ? "hard" : "deadly";
}

// ---------------------------------------------------------------- the listing

std::vector<std::string> kinds_of(const Dictionary &r) {
	std::vector<std::string> out;
	const Array lairs = r.get("lairs", Array());
	for (int64_t i = 0; i < lairs.size(); i++) {
		const std::string k = S(Dictionary(lairs[i])["kind"]);
		if (std::find(out.begin(), out.end(), k) == out.end()) out.push_back(k);
	}
	out.erase(std::remove_if(out.begin(), out.end(), [](const std::string &k) { return data().mobs.MOBS.at(k).passive; }), out.end());
	return out.empty() ? std::vector<std::string>{ "wolf" } : out;
}
std::vector<const WarChief *> chiefs_of_kind(const std::string &kind) {
	std::vector<const WarChief *> out;
	for (const WarChief &c : data().wild.WAR_CHIEFS)
		if (c.kind == kind) out.push_back(&c);
	return out;
}

Dictionary band_for(const Dictionary &r, double target, const std::string &seed, bool hard, bool rested) {
	const double depth = depth_of(r);
	const std::vector<std::string> kinds = kinds_of(r);
	std::vector<std::string> fit;
	for (const std::string &k : kinds)
		if (std::sqrt(target) / beast_root(k, depth) >= 1.5) fit.push_back(k);
	std::string kind;
	if (!fit.empty()) kind = pick(fit, seed);
	else {
		std::vector<std::string> w{ "jackal", "wolf", "bandit" };
		std::stable_sort(w.begin(), w.end(), [&](const std::string &a, const std::string &b) { return beast_root(a, depth) - beast_root(b, depth) < 0; });
		kind = w[0];
	}
	const double r0 = beast_root(kind, depth), mostN = B().bandMost;
	const auto n = [&](double x) { return std::max(2.0, std::min(mostN, js::round(x))); };
	Dictionary band;
	band["kind"] = G(kind);
	if (hard) {
		const auto ck = data().wild.CHIEF_KINDS.find(kind);
		const std::vector<const WarChief *> chiefs = chiefs_of_kind(kind);
		const double lr = ck != data().wild.CHIEF_KINDS.end() ? r0 * std::sqrt(ck->second.hp * ck->second.dmg) : INF, left = std::sqrt(target) - lr;
		if (rested && !chiefs.empty() && left >= r0) {
			band["count"] = n(left / r0 + 1);
			band["chief"] = G(pick(chiefs, seed)->id);
			return band;
		}
		band["count"] = n((std::sqrt(target) - r0 * std::sqrt(2.5)) / r0 + 1);
		band["lead"] = true;
		return band;
	}
	band["count"] = n(std::sqrt(target) / r0);
	return band;
}

std::string band_goal(const Dictionary &b, const std::string &seed, const std::string &land) {
	const std::string kind = S(b["kind"]);
	if (b.has("chief")) {
		const std::string id = S(b["chief"]);
		for (const WarChief *c : chiefs_of_kind(kind))
			if (c->id == id) return "Slay " + c->name;
		return "Slay the chief";
	}
	const std::vector<std::string> *words = words_of(B().bandWords, land.empty() ? "any" : land);
	std::string people;
	for (const auto &[k, v] : B().bandPeople)
		if (k == kind) people = v;
	return std::string(kind == "bandit" ? "Break" : "Hunt") + " the " + pick(*words, seed) + " " + people;
}

struct Site {
	double x = 0, y = 0;
	std::string type;
};
std::vector<Site> sites_of(const Dictionary &r) {
	const XY at = npc_spot(r);
	std::vector<Site> near;
	const Array pre = r.get("prebuilt", Array());
	const double reach = B().siteReach;
	for (int64_t i = 0; i < pre.size(); i++) {
		const Dictionary p = pre[i];
		const std::string type = S(p["type"]);
		const double x = p["x"], y = p["y"];
		if (words_of(B().buildWork, type) && (x - at.x) * (x - at.x) + (y - at.y) * (y - at.y) <= reach * reach) near.push_back({ x, y, type });
	}
	return near.empty() ? std::vector<Site>{ { at.x, at.y, "" } } : near;
}

std::optional<std::pair<std::string, std::string>> trade_for(const std::string &town, double h0, const std::string &seed) {
	for (const double h : { h0, h0 == 1 ? 2.0 : 1.0 }) {
		std::vector<std::string> tos;
		for (const std::string &t : towns_at(town, h))
			if (!npc_goods(t).empty()) tos.push_back(t);
		if (tos.empty()) continue;
		const std::string to = pick(tos, seed);
		std::vector<std::string> both;
		for (const NpcGoodRule &g : npc_goods(town))
			if (npc_good(to, g.res)) both.push_back(g.res);
		if (!both.empty()) return std::make_pair(to, pick(both, seed + ":g"));
	}
	return std::nullopt;
}

double repeat_share(double heat) { return std::max(B().repeat.floor, 1 / (1 + B().repeat.per * heat)); }
} // namespace

void load_board_tables(const Dictionary &tables, BoardTables &out) {
	if (!tables.has("src/data/warTownBoard")) return;
	const Dictionary t = tables["src/data/warTownBoard"], b = t["BOARD"];
	out.hold = b["hold"];
	out.windowHours = b["windowHours"];
	out.onPath = b["onPath"];
	out.offPathPoints = b["offPathPoints"];
	const Dictionary rp = b["repeat"];
	out.repeat = { rp["per"], rp["floor"], rp["recoverHours"] };
	out.kill.clear();
	for (const Variant &v : Array(b["kill"])) {
		const Dictionary k = v;
		out.kill.push_back({ S(k["size"]), k["share"], k["coin"], k["points"] });
	}
	out.bandMost = b["bandMost"];
	out.chiefHeat = b["chiefHeat"];
	out.build.clear();
	for (const Variant &v : Array(b["build"])) {
		const Dictionary k = v;
		out.build.push_back({ S(k["size"]), k["labour"], k["coin"], k["points"] });
	}
	out.trade.clear();
	for (const Variant &v : Array(b["trade"])) {
		const Dictionary k = v;
		out.trade.push_back({ S(k["size"]), k["hops"], k["loads"], k["coin"], k["points"] });
	}
	const Dictionary e = b["errand"], bd = b["band"];
	out.errand = { e["coin"], e["points"] };
	out.band = { bd["near"], bd["far"], bd["apart"], bd["tries"] };
	out.siteReach = b["siteReach"];
	const Dictionary ra = t["RATING"];
	out.rating = { ra["easy"], ra["fair"], ra["hard"] };
	const auto lists = [](const Dictionary &d) {
		std::vector<std::pair<std::string, std::vector<std::string>>> o;
		const Array ks = d.keys();
		for (int64_t i = 0; i < ks.size(); i++) {
			std::vector<std::string> v;
			for (const Variant &x : Array(d[ks[i]])) v.push_back(S(x));
			o.emplace_back(S(ks[i]), v);
		}
		return o;
	};
	out.buildWork = lists(t["BUILD_WORK"]);
	out.bandWords = lists(t["BAND_WORDS"]);
	out.buildAny.clear();
	for (const Variant &x : Array(t["BUILD_ANY"])) out.buildAny.push_back(S(x));
	out.bandPeople.clear();
	const Dictionary bp = t["BAND_PEOPLE"];
	for (const Variant &k : bp.keys()) out.bandPeople.emplace_back(S(k), S(bp[k]));
	out.giverAny = S(t["GIVER_ANY"]);
	out.errandStory.clear();
	const Dictionary es = t["ERRAND_STORY"];
	for (const Variant &land : es.keys()) {
		std::vector<std::pair<std::string, std::string>> v;
		const Dictionary k = es[land];
		for (const Variant &kind : k.keys()) v.emplace_back(S(kind), S(k[kind]));
		out.errandStory.emplace_back(S(land), v);
	}
}

double board_window(double now) { return std::floor(now / (B().windowHours * HOUR)); }
double window_end(double win) { return (win + 1) * B().windowHours * HOUR; }

double army_strength(const std::vector<BoardMan> &men, double level) {
	const double k = 1 + 0.03 * std::max(0.0, level - 1);
	double sum = 0;
	for (const BoardMan &m : men) sum = sum + man_root(m.cls, m.level.value_or(1), m.hp.value_or(1)) * (m.cls.rfind("civ_", 0) == 0 ? 0.4 : 1);
	const double x = sum * k;
	return x * x;
}

double band_strength(const Dictionary &b, double depth) {
	const std::string kind = S(b["kind"]);
	const double r = beast_root(kind, depth);
	const auto ck = b.has("chief") ? data().wild.CHIEF_KINDS.find(kind) : data().wild.CHIEF_KINDS.end();
	const double lead = ck != data().wild.CHIEF_KINDS.end() ? r * std::sqrt(ck->second.hp * ck->second.dmg) : b.has("lead") ? r * std::sqrt(2 * 1.25) : r;
	const double x = lead + r * std::max(0.0, double(b["count"]) - 1);
	return x * x;
}

Array board_entries(const Dictionary &r, double win, const BoardFor &f) {
	const std::string town = S(r["id"]), land = land_of(town), w = N(win);
	const double depth = depth_of(r), base = std::max(f.army, floor_strength());
	const bool rested = f.killHeat < B().chiefHeat;
	std::vector<Dictionary> out;
	for (size_t i = 0; i < B().kill.size(); i++) {
		const auto &t = B().kill[i];
		const std::string seed = town + ":" + w + ":k" + std::to_string(i);
		const Dictionary band = band_for(r, base * t.share, seed, t.size == "hard", rested);
		const double strength = band_strength(band, depth), scale = std::sqrt(strength / std::max(1e-6, floor_strength() * t.share));
		Dictionary e;
		e["id"] = G("k" + std::to_string(i) + "." + w);
		e["kind"] = "kill";
		e["goal"] = G(band_goal(band, seed, land));
		e["size"] = G(t.size);
		e["coin"] = js::round(t.coin * scale);
		e["points"] = js::round(t.points * scale);
		e["band"] = band;
		e["strength"] = strength;
		out.push_back(e);
	}
	const std::vector<Site> sites = sites_of(r);
	for (size_t i = 0; i < B().build.size(); i++) {
		const auto &t = B().build[i];
		const std::string seed = town + ":" + w + ":b" + std::to_string(i);
		const Site &s = pick(sites, seed);
		const std::vector<std::string> *words = words_of(B().buildWork, s.type);
		if (!words) words = &B().buildAny;
		Dictionary e, site;
		site["x"] = s.x;
		site["y"] = s.y;
		e["id"] = G("b" + std::to_string(i) + "." + w);
		e["kind"] = "build";
		e["goal"] = G((*words)[i]);
		e["size"] = G(t.size);
		e["coin"] = t.coin;
		e["points"] = t.points;
		e["labour"] = t.labour;
		e["site"] = site;
		out.push_back(e);
	}
	for (size_t i = 0; i < B().trade.size(); i++) {
		const auto &t = B().trade[i];
		const std::string seed = town + ":" + w + ":t" + std::to_string(i);
		const auto way = trade_for(town, t.hops, seed);
		if (!way) continue;
		const MarketTables::Region *to = world_region(way->first);
		Dictionary e;
		e["id"] = G("t" + std::to_string(i) + "." + w);
		e["kind"] = "trade";
		e["goal"] = G("Carry " + way->second + " to " + (to ? to->name : way->first));
		e["size"] = G(t.size);
		e["coin"] = t.coin;
		e["points"] = t.points;
		e["res"] = G(way->second);
		e["n"] = t.loads * per_load(way->second);
		e["loads"] = t.loads;
		e["toTown"] = G(way->first);
		out.push_back(e);
	}
	const std::string mine = path_kind(f.path);
	Array ordered;
	for (const Dictionary &e : out)
		if (S(e["kind"]) == mine) ordered.push_back(e);
	for (const Dictionary &e : out)
		if (S(e["kind"]) != mine) ordered.push_back(e);
	if (f.errand && !mine.empty()) {
		// W-190: the giver's errand: the smallest of his own kind, in the town's own words
		Dictionary small;
		for (const Dictionary &e : out)
			if (S(e["kind"]) == mine) {
				small = e.duplicate(true);
				break;
			}
		std::string story;
		for (const auto &[l, kinds] : B().errandStory)
			if (l == (land.empty() ? "any" : land))
				for (const auto &[k, line] : kinds)
					if (k == mine) story = line;
		small["id"] = G("e." + w);
		small["size"] = "errand";
		small["coin"] = B().errand.coin;
		small["points"] = B().errand.points;
		small["giver"] = G(f.giver.value_or(B().giverAny));
		small["story"] = G(story);
		ordered.push_front(small);
	}
	return ordered;
}

double heat_after(double heat, double ms) { return ms <= 0 ? heat : heat * js::exp(-ms / (B().repeat.recoverHours * HOUR)); }

Quote quote_pay(const std::string &kind, double coin, double points, const std::string &path, double heat, double purse) {
	const bool on = !path.empty() && path_kind(path) == kind;
	const double pc = coin * (on ? B().onPath : 1), pp = on || path.empty() ? points : points * B().offPathPoints, share = repeat_share(heat);
	return { std::floor(std::min(std::max(0.0, purse), thin_purse(pc * share, purse))), js::round(pp * share) };
}

Array board_lines(const Array &entries, double army, const std::string &path, const std::function<double(const std::string &)> &heat, double purse, const std::set<std::string> &held,
	double depth) {
	Array out;
	for (int64_t i = 0; i < entries.size(); i++) {
		const Dictionary e = entries[i];
		const std::string kind = S(e["kind"]);
		const Quote q = quote_pay(kind, e["coin"], e["points"], path, heat(kind), purse);
		Dictionary l = e.duplicate(true);
		l["pay"] = q.coin;
		l["gain"] = q.points;
		l["held"] = held.count(S(e["id"])) > 0;
		if (e.has("strength")) l["rating"] = G(rating_of(army, e["strength"]));
		out.push_back(l);
	}
	return out;
}

} // namespace sim
