#include "war_wild.h"

#include <algorithm>

#include "js_math.h"
#include "rng.h"
#include "sim_data.h"

namespace sim {

// CHIEF_BY_ID is a Map built from WAR_CHIEFS: a later duplicate id wins, so search from the back
const WarChief *war_chief(const std::string &id) {
	const auto &cs = data().wild.WAR_CHIEFS;
	for (auto it = cs.rbegin(); it != cs.rend(); ++it)
		if (it->id == id) return &*it;
	return nullptr;
}

const ChiefKind *chief_kind(const std::string &id) {
	const WarChief *c = war_chief(id);
	const auto &ks = data().wild.CHIEF_KINDS;
	const auto it = ks.find(c ? c->kind : "");
	return it != ks.end() ? &it->second : nullptr;
}

double chief_respawn(double depth) { return js::round(18000 + 4500 * std::max(0.0, std::min(4.0, depth))); }

ChiefDrop chief_loot(const std::string &id, double depth, const std::string &seed) {
	ChiefDrop out;
	const ChiefKind *k = chief_kind(id);
	if (!k) return out;
	const double m = 1 + k->loot.per * depth;
	out.goods.push_back({ "coin", js::round(k->loot.coin * m) });
	for (const auto &gn : k->loot.goods) {
		const double v = js::round(gn.second * m);
		auto e = std::find_if(out.goods.begin(), out.goods.end(), [&](const auto &x) { return x.first == gn.first; });
		if (e != out.goods.end()) e->second = v;
		else out.goods.push_back({ gn.first, v });
	}
	const uint32_t h = hash_string(godot::String::utf8((id + ":" + seed + ":chiefloot").c_str()));
	Mulberry rng(h ? h : 1);
	if (!(rng.next() < k->loot.itemChance)) return out;
	std::vector<std::string> pool;
	for (const auto &[d, tier] : data().bosses.BASE_ITEMS)
		if (tier <= 2 + std::floor(depth / 2)) pool.push_back(d);
	const std::string def = pool[size_t(std::floor(rng.next() * double(pool.size())))];
	// rng.weighted(k.loot.item.rarity)
	double total = 0;
	for (const auto &e : k->loot.itemRarity) total += e.second;
	double r = rng.next() * total;
	std::string rarity = k->loot.itemRarity.back().first;
	for (const auto &e : k->loot.itemRarity) {
		r -= e.second;
		if (r < 0) {
			rarity = e.first;
			break;
		}
	}
	out.item = std::make_pair(def, rarity);
	return out;
}

} // namespace sim
