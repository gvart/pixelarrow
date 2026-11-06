#include "war_bosses.h"

#include <algorithm>
#include <cmath>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/string.hpp>

#include "rng.h"
#include "sim_data.h"

namespace sim {

static std::string u8(const godot::Variant &v) { return godot::String(v).utf8().get_data(); }

void load_boss_loot(const godot::Dictionary &tables, BossTables &out) {
	if (tables.has("src/data/items")) {
		const godot::Dictionary m = tables["src/data/items"];
		const godot::Array base = m["BASE_ITEMS"];
		for (int64_t i = 0; i < base.size(); i++) {
			const godot::Dictionary d = base[i];
			out.BASE_ITEMS.push_back({ u8(d["id"]), double(d["tier"]) });
		}
		const godot::Array list = m["ITEM_LIST"];
		for (int64_t i = 0; i < list.size(); i++) {
			const godot::Dictionary d = list[i];
			out.ITEM_SETS.push_back({ u8(d["id"]), d.has("set") ? u8(d["set"]) : std::string() });
		}
		const godot::Dictionary items = m["ITEMS"];
		const godot::Array ids = items.keys();
		for (int64_t i = 0; i < ids.size(); i++) {
			const godot::Dictionary d = items[ids[i]];
			if (d.has("fixed")) out.FIXED.insert(u8(ids[i]));
		}
		const godot::Array rs = m["RARITIES"];
		for (int64_t i = 0; i < rs.size(); i++) out.RARITIES.push_back(u8(rs[i]));
	}
	if (tables.has("affixes")) {
		const godot::Dictionary m = tables["affixes"];
		const godot::Array c = m["AFFIX_COUNT"], s = m["AFFIX_STEPS"];
		for (int64_t i = 0; i < c.size(); i++) out.AFFIX_COUNT.push_back(c[i]);
		for (int64_t i = 0; i < s.size(); i++) {
			const godot::Array e = s[i];
			out.AFFIX_STEPS.push_back({ e[0], e[1] });
		}
	}
	if (tables.has("derived_boss_loot")) {
		const godot::Dictionary p = godot::Dictionary(tables["derived_boss_loot"])["AFFIX_POOL"];
		const godot::Array ids = p.keys();
		for (int64_t i = 0; i < ids.size(); i++) {
			const godot::Array pool = p[ids[i]];
			auto &v = out.AFFIX_POOL[u8(ids[i])];
			for (int64_t k = 0; k < pool.size(); k++) {
				const godot::Array e = pool[k];
				v.push_back({ u8(e[0]), e[1] });
			}
		}
	}
}

// BY_ID is a Map built from WAR_BOSSES: a later duplicate id wins, so search from the back
const WarBoss *war_boss(const std::string &id) {
	const auto &bs = data().bosses.WAR_BOSSES;
	for (auto it = bs.rbegin(); it != bs.rend(); ++it)
		if (it->id == id) return &*it;
	return nullptr;
}

std::string boss_deed(const std::string &boss) {
	const WarBoss *b = war_boss(boss);
	if (b && b->deed) return *b->deed;
	std::string n = b ? b->name : boss;
	if (n.rfind("the ", 0) == 0) n = n.substr(4); // .replace(/^the /, '')
	return "Bane of " + n;
}

// Rng.int, pick and weighted of src/sim/rng.ts on the sim's Mulberry.
static double rng_int(Mulberry &rng, double lo, double hi) { return lo + std::floor(rng.next() * (hi - lo + 1)); }
template <typename T>
static const T &rng_pick(Mulberry &rng, const std::vector<T> &arr) {
	return arr[size_t(std::floor(rng.next() * double(arr.size())))];
}
static const std::string &rng_weighted(Mulberry &rng, const std::vector<std::pair<std::string, double>> &entries) {
	double total = 0;
	for (const auto &e : entries) total += e.second;
	double r = rng.next() * total;
	for (const auto &e : entries) {
		r -= e.second;
		if (r < 0) return e.first;
	}
	return entries.back().first;
}
static uint32_t hash_of(const std::string &s) { return hash_string(godot::String::utf8(s.c_str())); }

static int rarity_rank(const std::string &r) {
	const auto &rs = data().bosses.RARITIES;
	const auto it = std::find(rs.begin(), rs.end(), r);
	return it == rs.end() ? 0 : int(it - rs.begin()); // normalizeRarity: a drop's rarity is always one of RARITIES
}

// src/data/affixes.ts itemAffixes, rolled from the uid (a drop carries no stored `aff`; a fixed item never reaches it here).
static std::vector<std::pair<std::string, double>> item_affixes(const Item &item) {
	const BossTables &t = data().bosses;
	const int r = rarity_rank(item.rarity);
	const double n = t.AFFIX_COUNT[r];
	if (!n) return {};
	Mulberry rng(hash_of("aff|" + item.uid + "|" + item.def + "|" + item.rarity));
	const auto pit = t.AFFIX_POOL.find(item.def);
	std::vector<std::pair<std::string, double>> pool = pit != t.AFFIX_POOL.end() ? pit->second : std::vector<std::pair<std::string, double>>{};
	std::vector<std::pair<std::string, double>> out;
	const auto [lo, hi] = t.AFFIX_STEPS[r];
	for (int i = 0; i < n && pool.size(); i++) {
		const std::string id = rng_weighted(rng, pool);
		pool.erase(std::find_if(pool.begin(), pool.end(), [&](const auto &e) { return e.first == id; }));
		out.push_back({ id, rng_int(rng, lo, hi) });
	}
	std::stable_sort(out.begin(), out.end(), [](const auto &a, const auto &b) { return b.second - a.second < 0; });
	return out;
}

static std::string num(double v) {
	char b[32];
	snprintf(b, sizeof b, "%.0f", v); // steps are small integers
	return b;
}

Item as_trophy(const Item &item, const std::string &boss) {
	const WarBoss *b = war_boss(boss);
	const bool fixed = data().bosses.FIXED.count(item.def) > 0;
	const auto &rs = data().bosses.RARITIES;
	const double top = data().bosses.AFFIX_STEPS[std::find(rs.begin(), rs.end(), "legendary") - rs.begin()].second;
	std::string aff;
	if (!fixed) {
		bool first = true;
		for (const auto &e : item_affixes(item)) {
			aff += (first ? "" : ",") + e.first + ":" + num(top);
			first = false;
		}
	}
	Item out = item;
	if (b) out.tr = b->name;
	if (!aff.empty()) out.aff = aff;
	return out;
}

std::vector<BossGood> boss_goods(const std::string &boss) {
	const WarBoss *b = war_boss(boss);
	if (!b || !b->rare) return {};
	return { { b->rare->good, b->rare->n } };
}

static std::vector<std::string> signature_items(const std::string &s) {
	std::vector<std::string> pieces;
	for (const auto &[id, set] : data().bosses.ITEM_SETS)
		if (set == s) pieces.push_back(id);
	return pieces.size() ? pieces : std::vector<std::string>{ s };
}

std::vector<BossDrop> boss_loot(const std::string &boss, const std::string &seed) {
	const WarBoss *b = war_boss(boss);
	if (!b) return {};
	const BossTier &t = data().bosses.BOSS_TIERS.at(b->tier);
	const uint32_t h = hash_of(boss + ":" + seed + ":bossloot");
	Mulberry rng(h ? h : 1);
	std::vector<std::string> pool;
	for (const auto &[id, tier] : data().bosses.BASE_ITEMS)
		if (tier >= t.minTier) pool.push_back(id);
	std::vector<BossDrop> out;
	for (int i = 0; i < t.picks; i++) {
		if (i == 0 && rng.next() < t.trophy) {
			const bool sig = b->signature.size() > 0 && rng.next() < t.signature;
			out.push_back({ sig ? rng_pick(rng, signature_items(rng_pick(rng, b->signature))) : rng_pick(rng, pool), "legendary", true });
			continue;
		}
		const std::string def = rng_pick(rng, pool);
		out.push_back({ def, rng_weighted(rng, t.rarity) });
	}
	return out;
}

} // namespace sim
