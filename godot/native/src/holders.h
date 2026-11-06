// Holders of goods (src/war/sim/holders.ts), line for line: a hold keeps lots (a good, an amount, its origin, a seal)
// and items; takes are first in, first out over the lots, so origins travel with the goods; an emptied lot stays at 0.
#pragma once

#include <functional>
#include <limits>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

#include "item.h"

namespace sim {

// Partial<Record<GoodKind, number>>: goods by kind in insertion order, as Object.entries walks them.
struct Cost {
	std::vector<std::pair<std::string, double>> kv;

	const double *find(const std::string &k) const {
		for (const auto &e : kv)
			if (e.first == k) return &e.second;
		return nullptr;
	}
	double *find(const std::string &k) {
		for (auto &e : kv)
			if (e.first == k) return &e.second;
		return nullptr;
	}
	// cost[k] ?? 0
	double get(const std::string &k) const {
		const double *v = find(k);
		return v ? *v : 0;
	}
	// cost[k] = v: a new key goes last
	void set(const std::string &k, double v) {
		if (double *p = find(k)) *p = v;
		else kv.emplace_back(k, v);
	}
	bool has(const std::string &k) const { return find(k) != nullptr; }
	bool empty() const { return kv.empty(); }
};

// s (M6g): sealed under carry contract s; s < 0 (W-153): tribute set aside for player -s.
struct Lot {
	std::string r;
	double n = 0;
	std::string o;
	std::optional<double> s;
};

struct Hold {
	std::vector<Lot> lots;
	std::vector<Item> items;
};

// W-153: which lots a move draws and the seal they end with.
struct Draw {
	std::function<bool(const Lot &)> ok;
	std::function<std::optional<double>(const Lot &)> to;
	bool goodsOnly = false;
};

struct HoldItem {
	std::string uid, def, rarity;
	std::optional<int> q;
};

struct HolderTables {
	double ITEMS_PER_LOAD = 5, COIN_LOAD = 200, RATION_LOAD = 20;
};
void load_holders(const godot::Dictionary &t, HolderTables &out);

constexpr double HOLD_EPS = 1e-9;

double per_load(const std::optional<std::string> &r);
inline bool is_tithe(const Lot &l) { return l.s.has_value() && *l.s < 0; }
std::optional<double> tithe_seal(const std::optional<std::string> &owner);
std::optional<Cost> tithe_in(const Hold &h);
inline Hold new_hold() { return Hold{}; }
double amount(const Hold &h, const std::string &r);
Cost &totals(const Hold &h, Cost &out);
double loads(const Hold &h);
void put(Hold &h, const std::string &r, double n, const std::string &o, std::optional<double> s = std::nullopt);
void put_lots(Hold &h, const std::vector<Lot> &lots);
std::vector<Lot> take(Hold &h, const std::string &r, double n);
bool take_from(const std::vector<Hold *> &holds, const Cost &cost);
double move(Hold &a, Hold &b, double max, const std::optional<std::string> &r = std::nullopt, double maxItems = std::numeric_limits<double>::infinity(), bool unsealed = false, const Draw *draw = nullptr);
void spoil(Hold &h, double share);
std::vector<HoldItem> item_list(const Hold &h, int max = 8);
bool empty(const Hold &h);

} // namespace sim
