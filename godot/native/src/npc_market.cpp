// src/war/net/npcMarket.ts and what it reads of src/war/world/graph.ts, line for line (see npc_market.h).
#include "npc_market.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <map>
#include <set>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/string.hpp>

#include "js_math.h"
#include "rng.h"
#include "sim_data.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::Variant;

namespace {
constexpr double DAY = 86'400'000, EPS = 1e-6, INF = std::numeric_limits<double>::infinity();
constexpr double COIN_PER_SILVER = 20;
std::string S(const Variant &v) { return godot::String(v).utf8().get_data(); }
godot::String G(const std::string &s) { return godot::String::utf8(s.c_str()); }
const MarketTables &M() { return data().market; }
uint32_t hs(const std::string &s) { return hash_string(G(s)); }

std::vector<std::pair<std::string, double>> pairs(const Dictionary &d) {
	std::vector<std::pair<std::string, double>> out;
	const Array ks = d.keys();
	for (int64_t i = 0; i < ks.size(); i++) out.emplace_back(S(ks[i]), double(d[ks[i]]));
	return out;
}
double of(const std::vector<std::pair<std::string, double>> &v, const std::string &k, double none = 0) {
	for (const auto &[a, b] : v)
		if (a == k) return b;
	return none;
}

// the land goods, by the name a region's `res` gives them (LAND_GOODS: its key order)
const std::vector<std::pair<std::string, std::string>> LAND_GOODS = { { "food", "food" }, { "wood", "wood" }, { "stone", "stone" }, { "iron", "iron" }, { "copper", "copper" },
	{ "tin", "tin" }, { "marble", "marble" }, { "salt", "salt" }, { "hides", "horses" } };
const std::string *land_key(const std::string &g) {
	for (const auto &[a, b] : LAND_GOODS)
		if (a == g) return &b;
	return nullptr;
}
double land_points(const std::string &region, const std::string &g) {
	const std::string *key = land_key(g);
	if (!key) return 0;
	const MarketTables::Region *r = world_region(region);
	return r ? of(r->res, *key) : 0;
}
// hops from `town` to the nearest land yielding g (nullopt: no land yields it, a made good)
std::optional<double> hops_to_land(const std::string &town, const std::string &g) {
	if (!land_key(g)) return std::nullopt;
	double best = INF;
	for (const auto &r : M().regions)
		if (land_points(r.id, g) > 0) best = std::min(best, hops(town, r.id));
	return best;
}
double swing_k(const std::string &kind) { return kind == "short" ? M().swing.shortK : kind == "glut" ? M().swing.glut : 1; }
NpcGoodRule at_swing(const NpcGoodRule &g, double k) {
	if (k == 1) return g;
	NpcGoodRule o = g;
	o.base = g.base * k;
	return o;
}
double mult(double stock, double par) { return std::max(M().price.min, std::min(M().price.max, 1 + M().price.slope * (1 - stock / par))); }
double mid_price(const NpcGoodRule &g, double stock) { return g.base * mult(stock, g.par); }
double seg(double x0, double x1, const std::function<double(double)> &f) { return x1 > x0 ? ((f(x0) + f(x1)) / 2) * (x1 - x0) : 0; }
double mean_mult(double a, double b, double par) {
	if (std::abs(a - b) < EPS) return mult(a, par);
	const double lo = std::min(a, b), hi = std::max(a, b), slope = M().price.slope, mn = M().price.min, mx = M().price.max;
	const double sMax = par * (1 - (mx - 1) / slope), sMin = par * (1 + (1 - mn) / slope);
	const auto line = [&](double x) { return 1 + slope * (1 - x / par); };
	return (seg(lo, std::min(hi, sMax), [&](double) { return mx; }) + seg(std::max(lo, sMax), std::min(hi, sMin), line) + seg(std::max(lo, sMin), hi, [&](double) { return mn; })) / (hi - lo);
}
// the most of `want`, to 0.01 of a unit, for which fits holds
double most(double want, const std::function<bool(double)> &fits) {
	if (fits(want)) return want;
	double lo = 0, hi = want;
	for (int i = 0; i < 24; i++) {
		const double m = (lo + hi) / 2;
		if (fits(m)) lo = m;
		else hi = m;
	}
	return std::floor(lo * 100) / 100;
}
// Rng.int, Rng.chance (src/sim/rng.ts)
int rint(Mulberry &r, int a, int b) { return a + int(std::floor(r.next() * (b - a + 1))); }
Dictionary swing_to(const NpcSwing &s) {
	Dictionary d;
	d["town"] = G(s.town);
	d["res"] = G(s.res);
	d["kind"] = G(s.kind);
	d["until"] = s.until;
	return d;
}
} // namespace

void load_market_tables(const Dictionary &tables, MarketTables &out) {
	if (tables.has("src/data/warNpcTowns")) {
		const Dictionary t = tables["src/data/warNpcTowns"], n = t["NPC"];
		out.base = pairs(t["NPC_BASE"]);
		const Dictionary rg = t["NPC_ROLE_GOODS"];
		const Array roles = rg.keys();
		out.roleGoods.clear();
		for (int64_t i = 0; i < roles.size(); i++) {
			std::vector<std::string> gs;
			const Array a = rg[roles[i]];
			for (int64_t k = 0; k < a.size(); k++) gs.push_back(S(a[k]));
			out.roleGoods.emplace_back(S(roles[i]), gs);
		}
		out.hire = pairs(t["NPC_HIRE"]);
		out.carts = pairs(t["NPC_CARTS"]);
		out.reach = n["reach"];
		const Dictionary d = n["distance"], p = n["par"], pr = n["price"], pu = n["purse"], sw = n["swing"];
		out.distance = { d["at"], d["per"], d["far"], d["made"] };
		out.par = { p["made"], p["land"] };
		out.price = { pr["slope"], pr["min"], pr["max"], pr["edge"], pr["recoverHours"] };
		out.purse = { pu["start"], pu["mintSilver"], pu["cap"], pu["thin"] };
		out.swing = { sw["hours"], sw["chance"], sw["short"], sw["glut"] };
	}
	if (tables.has("src/war/world/regions")) {
		out.regions.clear();
		const Array rs = Dictionary(tables["src/war/world/regions"])["WORLD_REGIONS"];
		for (int64_t i = 0; i < rs.size(); i++) {
			const Dictionary r = rs[i];
			MarketTables::Region o;
			o.id = S(r["id"]);
			o.name = S(r["name"]);
			o.role = S(r["role"]);
			o.res = pairs(r.get("res", Dictionary()));
			const Array adj = r.get("adj", Array());
			for (int64_t k = 0; k < adj.size(); k++) o.adj.push_back(S(adj[k]));
			out.regions.push_back(o);
		}
	}
	if (tables.has("src/war/world/alliances")) {
		out.homes.clear();
		const Array as = Dictionary(tables["src/war/world/alliances"])["ALLIANCES"];
		for (int64_t i = 0; i < as.size(); i++) out.homes.emplace_back(int(Dictionary(as[i])["id"]), S(Dictionary(as[i])["home"]));
	}
	if (tables.has("src/war/world/season")) {
		const Dictionary s = tables["src/war/world/season"];
		out.omphalos = S(s["OMPHALOS"]);
		out.frontier.clear();
		const Array f = s["FRONTIER_TOWNS"];
		for (int64_t i = 0; i < f.size(); i++) out.frontier.push_back(S(f[i]));
	}
}

const MarketTables::Region *world_region(const std::string &id) {
	for (const auto &r : M().regions)
		if (r.id == id) return &r;
	return nullptr;
}
bool is_world_region(const std::string &id) { return world_region(id) != nullptr; }

double hops(const std::string &a, const std::string &b) {
	if (a == b) return 0;
	std::set<std::string> seen{ a };
	std::vector<std::string> front{ a };
	for (int n = 1; !front.empty(); n++) {
		std::vector<std::string> next;
		for (const std::string &id : front) {
			const MarketTables::Region *r = world_region(id);
			if (!r) continue;
			for (const std::string &nb : r->adj) {
				if (nb == b) return n;
				if (seen.insert(nb).second) next.push_back(nb);
			}
		}
		front = next;
	}
	return INF;
}

std::string home_of(int alliance) {
	for (const auto &[id, home] : M().homes)
		if (id == alliance) return home;
	return "";
}

const std::vector<NpcGoodRule> &npc_goods(const std::string &town) {
	static std::map<std::string, std::vector<NpcGoodRule>> rules; // the TS `rules` cache: lookup only
	static const std::vector<NpcGoodRule> none;
	const auto had = rules.find(town);
	if (had != rules.end()) return had->second;
	const MarketTables::Region *r = world_region(town);
	if (!r) return none;
	std::vector<std::string> list; // a JS Set: insertion order
	const auto add = [&](const std::string &g) {
		if (std::find(list.begin(), list.end(), g) == list.end()) list.push_back(g);
	};
	for (const auto &[role, gs] : M().roleGoods)
		if (role == r->role)
			for (const std::string &g : gs) add(g);
	for (const auto &[g, key] : LAND_GOODS)
		if (land_points(town, g) > 0) add(g);
	const auto &d = M().distance;
	std::vector<NpcGoodRule> out;
	for (const std::string &res : list) {
		const std::optional<double> h = hops_to_land(town, res);
		const double f = !h ? d.made : d.at + d.per * std::min(*h, d.far), pts = land_points(town, res);
		out.push_back({ res, of(M().base, res) * f, pts > 0 ? M().par.land * pts : M().par.made });
	}
	return rules[town] = out;
}

const NpcGoodRule *npc_good(const std::string &town, const std::string &res) {
	for (const NpcGoodRule &g : npc_goods(town))
		if (g.res == res) return &g;
	return nullptr;
}

std::vector<NpcSwing> npc_swings(const std::string &town, double now) {
	const std::vector<NpcGoodRule> &goods = npc_goods(town);
	if (goods.size() < 2) return {};
	const double ms = M().swing.hours * 3'600'000, shift = std::fmod(double(hs(town)), ms), win = std::floor((now + shift) / ms), until = (win + 1) * ms - shift;
	const uint32_t seed = hs("swing:" + town + ":" + js::number_to_string(win));
	Mulberry r(seed ? seed : 1);
	const int n = int(goods.size()), a = rint(r, 0, n - 1), b = (a + rint(r, 1, n - 1)) % n;
	std::vector<NpcSwing> out;
	if (r.next() < M().swing.chance) out.push_back({ town, goods[a].res, "short", until });
	if (r.next() < M().swing.chance) out.push_back({ town, goods[b].res, "glut", until });
	return out;
}

std::optional<NpcGoodRule> npc_rule_now(const std::string &town, const std::string &res, double now) {
	const NpcGoodRule *g = npc_good(town, res);
	if (!g) return std::nullopt;
	std::string kind;
	for (const NpcSwing &s : npc_swings(town, now))
		if (s.res == res) {
			kind = s.kind;
			break;
		}
	return at_swing(*g, swing_k(kind));
}

std::vector<NpcSwing> npc_news(const std::string &town, double now) {
	std::vector<NpcSwing> out;
	if (const MarketTables::Region *r = world_region(town))
		for (const std::string &t : r->adj)
			for (const NpcSwing &s : npc_swings(t, now)) out.push_back(s);
	std::stable_sort(out.begin(), out.end(), [](const NpcSwing &a, const NpcSwing &b) { return a.until != b.until ? a.until < b.until : a.town < b.town; });
	return out;
}

double stock_after(double stock, double par, double ms) { return ms <= 0 ? stock : par + (stock - par) * js::exp(-ms / (M().price.recoverHours * 3'600'000)); }

double thin_purse(double nominal, double purse) {
	const double full = M().purse.start, floor = M().purse.thin, b = 1 - floor;
	return purse - nominal / 2 >= full ? nominal : (nominal * (floor + (b * std::max(0.0, purse)) / full)) / (1 + (nominal * b) / (2 * full));
}

double pay_for(const NpcGoodRule &g, double stock, double n, double purse) { return std::floor(thin_purse(n * g.base * mean_mult(stock, stock + n, g.par) * (1 - M().price.edge), purse) + EPS); }
double cost_of(const NpcGoodRule &g, double stock, double n) { return std::ceil(n * g.base * mean_mult(stock, stock - n, g.par) * (1 + M().price.edge) - EPS); }
double sellable(const NpcGoodRule &g, double stock, double want, double purse) {
	return most(want, [&](double n) { return pay_for(g, stock, n, purse) <= purse; });
}
double buyable(const NpcGoodRule &g, double stock, double want, double coin) {
	return most(std::min(want, stock), [&](double n) { return cost_of(g, stock, n) <= coin; });
}
double npc_day(double now) { return std::floor(now / DAY); }
double purse_after(double coin, double days) {
	const double mint = M().purse.mintSilver * COIN_PER_SILVER;
	return days <= 0 || coin >= M().purse.cap ? coin : std::min(M().purse.cap, coin + days * mint);
}

Dictionary npc_shown(const std::string &town, double purse, const std::vector<std::pair<std::string, double>> &stock, double realPurse, double now) {
	const std::vector<NpcSwing> swings = npc_swings(town, now);
	Array goods;
	for (const NpcGoodRule &g : npc_goods(town)) {
		std::string kind;
		for (const NpcSwing &s : swings)
			if (s.res == g.res) {
				kind = s.kind;
				break;
			}
		const NpcGoodRule at = at_swing(g, swing_k(kind));
		const double st = of(stock, g.res);
		Dictionary o; // npcOffer
		o["res"] = G(g.res);
		o["stock"] = st;
		o["par"] = g.par;
		if (!kind.empty()) o["swing"] = G(kind);
		o["pay"] = js::round(thin_purse(mid_price(at, st) * (1 - M().price.edge), realPurse) * 100) / 100;
		o["ask"] = js::round(mid_price(at, st) * (1 + M().price.edge) * 100) / 100;
		goods.push_back(o);
	}
	Array news;
	for (const NpcSwing &s : npc_news(town, now)) news.push_back(swing_to(s));
	Dictionary v;
	v["town"] = G(town);
	v["purse"] = purse;
	v["goods"] = goods;
	v["news"] = news;
	return v;
}

std::optional<double> npc_hire(const std::string &cls) {
	for (const auto &[k, n] : M().hire)
		if (k == cls) return n;
	return std::nullopt;
}
std::optional<double> npc_cart(const std::string &type) {
	for (const auto &[k, n] : M().carts)
		if (k == type) return n;
	return std::nullopt;
}

} // namespace sim
