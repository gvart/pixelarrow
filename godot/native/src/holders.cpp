#include "holders.h"

#include <algorithm>
#include <cstdlib>

#include "sim_data.h"

namespace sim {

void load_holders(const godot::Dictionary &t, HolderTables &out) {
	out.ITEMS_PER_LOAD = t["ITEMS_PER_LOAD"];
	out.COIN_LOAD = t["COIN_LOAD"];
	out.RATION_LOAD = t["RATION_LOAD"];
}

double per_load(const std::optional<std::string> &r) {
	const HolderTables &H = data().holders;
	return r && *r == "coin" ? H.COIN_LOAD : r && *r == "ration" ? H.RATION_LOAD : data().economy.CARRY;
}

// /^p:(\d+)$/ -> -Number(digits)
std::optional<double> tithe_seal(const std::optional<std::string> &owner) {
	if (!owner || owner->size() < 3 || owner->compare(0, 2, "p:") != 0) return std::nullopt;
	for (size_t i = 2; i < owner->size(); i++)
		if ((*owner)[i] < '0' || (*owner)[i] > '9') return std::nullopt;
	return -std::strtod(owner->c_str() + 2, nullptr);
}

std::optional<Cost> tithe_in(const Hold &h) {
	std::optional<Cost> out;
	for (const Lot &l : h.lots)
		if (is_tithe(l) && l.n > HOLD_EPS) {
			if (!out) out.emplace();
			out->set(l.r, out->get(l.r) + l.n);
		}
	return out;
}

double amount(const Hold &h, const std::string &r) {
	double s = 0;
	for (const Lot &l : h.lots)
		if (l.r == r && !is_tithe(l)) s += l.n;
	return s;
}

Cost &totals(const Hold &h, Cost &out) {
	for (const Lot &l : h.lots)
		if (!is_tithe(l)) out.set(l.r, out.get(l.r) + l.n);
	return out;
}

double loads(const Hold &h) {
	double g = 0;
	for (const Lot &l : h.lots) g += l.n / per_load(l.r);
	return g + double(h.items.size()) / data().holders.ITEMS_PER_LOAD;
}

void put(Hold &h, const std::string &r, double n, const std::string &o, std::optional<double> s) {
	if (n <= HOLD_EPS) return;
	for (Lot &x : h.lots)
		if (x.r == r && x.o == o && x.s == s) {
			x.n += n;
			return;
		}
	h.lots.push_back(Lot{ r, n, o, s });
}

void put_lots(Hold &h, const std::vector<Lot> &lots) {
	for (const Lot &l : lots) put(h, l.r, l.n, l.o, l.s);
}

std::vector<Lot> take(Hold &h, const std::string &r, double n) {
	std::vector<Lot> out;
	for (size_t i = 0; i < h.lots.size() && n > HOLD_EPS;) {
		Lot &l = h.lots[i];
		if (l.r != r || is_tithe(l)) {
			i++;
			continue;
		}
		const double k = std::min(l.n, n);
		out.push_back(Lot{ r, k, l.o, l.s });
		l.n -= k;
		n -= k;
		if (l.n <= HOLD_EPS) l.n = 0; // an empty lot stays (its good reads 0)
		i++;
	}
	return out;
}

// Take up to n out of lot l itself (its origin and seal kept).
static std::vector<Lot> take_lot(Lot &l, double n) {
	const double k = std::min(l.n, n);
	l.n -= k;
	if (l.n <= HOLD_EPS) l.n = 0;
	if (k > HOLD_EPS) return { Lot{ l.r, k, l.o, l.s } };
	return {};
}

bool take_from(const std::vector<Hold *> &holds, const Cost &cost) {
	for (const auto &[r, v] : cost.kv) {
		if (!(v > 0)) continue;
		double have = 0;
		for (const Hold *h : holds) have += amount(*h, r);
		if (have < v - HOLD_EPS) return false;
	}
	for (const auto &[r, v] : cost.kv) {
		double left = v;
		for (Hold *h : holds) {
			if (left <= HOLD_EPS) break;
			for (const Lot &l : take(*h, r, left)) left -= l.n;
		}
	}
	return true;
}

double move(Hold &a, Hold &b, double max, const std::optional<std::string> &r, double maxItems, bool unsealed, const Draw *draw) {
	double left = max;
	const auto ok = [&](const Lot &x) { return x.n > HOLD_EPS && (draw ? draw->ok(x) : !is_tithe(x) && (!unsealed || !x.s.has_value())); };
	while (left > HOLD_EPS) {
		Lot *l = nullptr;
		if (r) {
			for (Lot &x : a.lots)
				if (x.r == *r && ok(x)) {
					l = &x;
					break;
				}
		} else {
			// [...a.lots].sort((x, y) => y.n - x.n).find(ok): a stable sort, so the most plentiful, the first of equals
			for (Lot &x : a.lots)
				if (ok(x) && (!l || x.n > l->n)) l = &x;
		}
		if (l) {
			const std::string lr = l->r;
			const double n = std::min(l->n, left * per_load(lr));
			if (draw) {
				for (const Lot &t : take_lot(*l, n)) put(b, t.r, t.n, t.o, draw->to(*l));
			} else {
				put_lots(b, unsealed ? take_lot(*l, n) : take(a, lr, n));
			}
			left -= n / per_load(lr);
			continue;
		}
		if (r || (draw && draw->goodsOnly) || a.items.empty() || left < 1 / data().holders.ITEMS_PER_LOAD - HOLD_EPS || maxItems-- <= 0) break;
		b.items.push_back(a.items.front());
		a.items.erase(a.items.begin());
		left -= 1 / data().holders.ITEMS_PER_LOAD;
	}
	return max - left;
}

void spoil(Hold &h, double share) {
	for (Lot &l : h.lots) l.n *= 1 - share;
	h.lots.erase(std::remove_if(h.lots.begin(), h.lots.end(), [](const Lot &l) { return !(l.n > HOLD_EPS); }), h.lots.end());
}

std::vector<HoldItem> item_list(const Hold &h, int max) {
	std::vector<HoldItem> out;
	for (size_t i = 0; i < h.items.size() && int(i) < max; i++) out.push_back(HoldItem{ h.items[i].uid, h.items[i].def, h.items[i].rarity, h.items[i].q });
	return out;
}

bool empty(const Hold &h) {
	if (!h.items.empty()) return false;
	for (const Lot &l : h.lots)
		if (!(l.n <= HOLD_EPS)) return false;
	return true;
}

} // namespace sim
