#include "recipes.h"

#include <algorithm>
#include <cmath>

#include <godot_cpp/variant/array.hpp>

#include "economy.h"
#include "js_math.h"
#include "rng.h"
#include "sim_data.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::String;

static std::string str(const godot::Variant &v) { return String(v).utf8().get_data(); }

static Recipe recipe_of(const Dictionary &d) {
	Recipe r;
	r.id = str(d["id"]);
	r.kind = str(d["kind"]);
	r.prof = str(d["prof"]);
	r.node = str(d["node"]);
	if (d.has("needs")) {
		const Array n = d["needs"];
		for (int64_t i = 0; i < n.size(); i++) r.needs.push_back(str(n[i]));
	}
	r.at = str(d["at"]);
	r.lv = int(d["lv"]);
	r.inputs = cost_of(d["inputs"]);
	r.secs = d["secs"];
	const Dictionary o = d["out"];
	r.out.item = str(o.get("item", ""));
	r.out.tool = str(o.get("tool", ""));
	r.out.good = str(o.get("good", ""));
	r.out.product = str(o.get("product", ""));
	r.out.engine = str(o.get("engine", ""));
	r.out.fort = str(o.get("fort", ""));
	r.out.n = o["n"];
	r.tier = int(d["tier"]);
	r.xp = d["xp"];
	r.perTile = d.get("perTile", false);
	return r;
}

void load_recipes(const Dictionary &tables, RecipeTables &o) {
	const Dictionary rt = tables["recipes"], it = tables["items"], at = tables["affixes"], ct = tables["classes"], dt = tables["derived_crafting"];
	const Dictionary rs = rt["RECIPES"];
	const Array ids = rs.keys();
	for (int64_t i = 0; i < ids.size(); i++) o.RECIPES[str(ids[i])] = recipe_of(rs[ids[i]]);
	const Dictionary bn = rt["BATCH_NODES"];
	const Array bk = bn.keys();
	for (int64_t i = 0; i < bk.size(); i++) o.BATCH_NODES[str(bk[i])] = str(bn[bk[i]]);
	const Dictionary ds = rt["DISHES"];
	const Array dk = ds.keys();
	for (int64_t i = 0; i < dk.size(); i++) {
		const Dictionary f = ds[dk[i]];
		o.DISHES[str(dk[i])] = Dish{ f["inn"], f["melee"], f["missile"], f["acc"], f["heal"], f["xp"], f["mins"] };
	}
	o.FED_CAP = rt["FED_CAP"];
	const Array odds = rt["RARITY_ODDS"];
	for (int64_t i = 0; i < odds.size(); i++) {
		const Array row = odds[i];
		o.RARITY_ODDS.push_back({ row[0], row[1], row[2], row[3], row[4] });
	}
	const Array cap = rt["TIER_CAP"], qmc = rt["QUALITY_MC"], rar = it["RARITIES"], steps = at["AFFIX_STEPS"];
	for (int64_t i = 0; i < cap.size(); i++) o.TIER_CAP.push_back(cap[i]);
	for (int64_t i = 0; i < qmc.size(); i++) o.QUALITY_MC.push_back(qmc[i]);
	for (int64_t i = 0; i < rar.size(); i++) o.RARITIES.push_back(str(rar[i]));
	for (int64_t i = 0; i < steps.size(); i++) o.AFFIX_STEPS.emplace_back(double(Array(steps[i])[0]), double(Array(steps[i])[1]));
	const Dictionary tools = ct["CIV_TOOLS"];
	const Array tk = tools.keys();
	for (int64_t i = 0; i < tk.size(); i++) o.CIV_TOOLS[str(tk[i])] = int(Dictionary(tools[tk[i]])["tier"]);
	const Dictionary cr = dt["CRAFTABLE"];
	const Array ck = cr.keys();
	for (int64_t i = 0; i < ck.size(); i++) {
		const Dictionary c = cr[ck[i]];
		Craftable x;
		x.tier = int(c["tier"]);
		const Array pool = c["pool"], pw = c["powers"];
		for (int64_t k = 0; k < pool.size(); k++) x.pool.emplace_back(str(Array(pool[k])[0]), double(Array(pool[k])[1]));
		for (int64_t k = 0; k < pw.size(); k++) x.powers.push_back(str(pw[k]));
		x.main = str(c.get("main", ""));
		x.tool = c.get("tool", false);
		o.CRAFTABLE[str(ck[i])] = x;
	}
}

int craft_grade(const GradeOpts &o) {
	const auto &R = data().recipes.RARITIES;
	const std::string rarity = o.toolRarity.value_or("common");
	const auto it = std::find(R.begin(), R.end(), rarity);
	const int rank = it == R.end() ? -1 : int(it - R.begin());
	const int g = o.level + o.toolTier.value_or(1) - 1 + int(std::floor(std::max(0, rank) / 2.0)) + o.wpLevel.value_or(1) - 1 + (o.masterwork ? 2 : 0) + (o.specialty ? 1 : 0);
	return std::max(1, std::min(19, g));
}

const std::array<double, 5> &odds_row(int g) {
	return data().recipes.RARITY_ODDS[std::min(5, int(std::floor((std::max(1, g) - 1) / 3.0)))];
}

uint32_t to_uint32(double x) {
	if (!std::isfinite(x)) return 0;
	double m = std::fmod(std::trunc(x), 4294967296.0);
	if (m < 0) m += 4294967296.0;
	return uint32_t(m);
}

std::string js_int_str(double x) { return std::to_string(int64_t(x)); }

static uint32_t hash_of(const std::string &s) { return hash_string(String::utf8(s.c_str())); }

static std::string base36(uint32_t h) {
	if (!h) return "0";
	std::string s;
	while (h) {
		s.insert(s.begin(), "0123456789abcdefghijklmnopqrstuvwxyz"[h % 36]);
		h /= 36;
	}
	return s;
}

// Rng.int, weighted, pick of src/sim/rng.ts on the sim's Mulberry.
static int rng_int(Mulberry &rng, double lo, double hi) { return int(lo + std::floor(rng.next() * (hi - lo + 1))); }
template <typename T>
static size_t rng_weighted(Mulberry &rng, const std::vector<std::pair<T, double>> &entries) {
	double total = 0;
	for (const auto &e : entries) total += e.second;
	double r = rng.next() * total;
	for (size_t i = 0; i < entries.size(); i++) {
		r -= entries[i].second;
		if (r < 0) return i;
	}
	return entries.size() - 1;
}

Item craft_roll(const std::string &defId, int g, const RollSeed &seed, const RollOpts &o) {
	const RecipeTables &T = data().recipes;
	const Craftable &c = T.CRAFTABLE.at(defId); // TS throws on an unknown craft
	const int tier = c.tier;
	const uint32_t h = seed.str ? hash_of(*seed.str) : to_uint32(seed.num);
	Mulberry rng{ hash_of("craft|" + std::to_string(h) + "|" + defId) };
	const auto &row = odds_row(g);
	std::vector<std::pair<int, double>> rw;
	for (size_t i = 0; i < T.RARITIES.size(); i++) rw.emplace_back(int(i), row[i]);
	int r = rw[rng_weighted(rng, rw)].first;
	r = std::min(r, int(T.TIER_CAP[std::max(1, std::min(3, tier))]));
	const double u = rng.next();
	const int q = u < crude_chance(g) ? 0 : o.masterwork && u < crude_chance(g) + masterwork_chance(g) ? 2 : 1;
	Item item;
	item.uid = "c" + base36(h);
	item.def = defId;
	item.rarity = T.RARITIES[r];
	item.cond = T.QUALITY_MC[q];
	item.q = q;
	item.mc = T.QUALITY_MC[q];
	if (o.maker && !o.maker->empty()) item.mk = *o.maker;
	static const int STATS[] = { 0, 1, 2, 3, 4 }; // random stats by rarity
	const int n = STATS[r];
	if (n) {
		std::vector<std::pair<std::string, double>> pool = c.pool;
		std::vector<std::pair<std::string, int>> out;
		const auto [lo, hi] = T.AFFIX_STEPS[r];
		for (int i = 0; i < n && !pool.empty(); i++) {
			const size_t k = rng_weighted(rng, pool);
			const std::string id = pool[k].first;
			for (size_t j = 0; j < pool.size(); j++)
				if (pool[j].first == id) {
					pool.erase(pool.begin() + j);
					break;
				}
			out.emplace_back(id, q == 0 ? 1 : q == 2 && i == 0 ? 2 : rng_int(rng, lo, hi));
		}
		std::stable_sort(out.begin(), out.end(), [](const auto &a, const auto &b) { return b.second < a.second; });
		if (!out.empty()) {
			std::string s;
			for (size_t i = 0; i < out.size(); i++) s += (i ? "," : "") + out[i].first + ":" + std::to_string(out[i].second);
			item.aff = s;
		}
	}
	if (r >= 3 && !c.tool) {
		const auto &pool = c.powers;
		if (!pool.empty()) item.pow = pool[size_t(std::floor(rng.next() * double(pool.size())))];
	}
	return item;
}

} // namespace sim
