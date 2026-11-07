// server/src/war/cargo.ts fill, takeAll, tollOf and robOf, line for line (see room_cargo.h).
#include "room_cargo.h"

#include <algorithm>
#include <deque>

#include <godot_cpp/variant/array.hpp>

#include "roster.h"
#include "sim_data.h"

namespace sim {

namespace {
constexpr double EPS = 1e-6;
std::string S(const godot::Variant &v) { return godot::String(v).utf8().get_data(); }
godot::String G(const std::string &s) { return godot::String::utf8(s.c_str()); }
} // namespace

Bundle cargo_fill(const std::vector<CargoSlot> &slots, const Bundle &b) {
	Bundle rest;
	std::vector<Lot> lots = b.lots;
	for (const CargoSlot &s : slots)
		for (Lot &l : lots) {
			const double room = (s.cap - loads(*s.hold)) * per_load(l.r);
			if (room <= EPS || l.n <= EPS) continue;
			const double k = std::min(room, l.n);
			put(*s.hold, l.r, k, l.o, l.s);
			l.n -= k;
		}
	for (const Lot &l : lots)
		if (l.n > EPS) rest.lots.push_back(l);
	std::deque<Item> items(b.items.begin(), b.items.end());
	const double per = data().holders.ITEMS_PER_LOAD;
	for (const CargoSlot &s : slots)
		while (!items.empty() && s.cap - loads(*s.hold) >= 1 / per - EPS) s.hold->items.push_back(items.front()), items.pop_front();
	rest.items.assign(items.begin(), items.end());
	return rest;
}

Bundle cargo_take_all(const std::vector<CargoSlot> &slots) {
	Bundle out;
	for (const CargoSlot &s : slots) {
		for (const Lot &l : s.hold->lots)
			if (l.n > EPS) out.lots.push_back(l);
		out.items.insert(out.items.end(), s.hold->items.begin(), s.hold->items.end());
		s.hold->lots.clear();
		s.hold->items.clear();
	}
	return out;
}

void cargo_toll(const std::vector<CargoSlot> &slots, double share) {
	for (const CargoSlot &s : slots)
		for (Lot &l : s.hold->lots) l.n *= 1 - share;
}

std::vector<std::pair<std::string, double>> cargo_rob(const std::vector<CargoSlot> &slots, double n) {
	std::vector<std::pair<std::string, double>> out;
	double left = n;
	std::vector<Lot *> lots;
	for (const CargoSlot &s : slots)
		for (Lot &l : s.hold->lots)
			if (l.r != "ration" && l.n > EPS) lots.push_back(&l);
	std::stable_sort(lots.begin(), lots.end(), [](const Lot *a, const Lot *b) {
		const int c = int(b->r == "coin") - int(a->r == "coin");
		return c ? c < 0 : b->n - a->n < 0;
	});
	for (Lot *l : lots) {
		if (left <= EPS) break;
		const double k = std::min(l->n, left * per_load(l->r));
		l->n -= k;
		left -= k / per_load(l->r);
		// Record<string, number> as a JS object fills: a key added again keeps its place
		auto e = std::find_if(out.begin(), out.end(), [&](const auto &x) { return x.first == l->r; });
		if (e != out.end()) e->second += k;
		else out.push_back({ l->r, k });
	}
	return out;
}

double bundle_loads(const Bundle &b) {
	double a = 0;
	for (const Lot &l : b.lots) a = a + l.n / per_load(l.r);
	return a + double(b.items.size()) / data().holders.ITEMS_PER_LOAD;
}

Cost bundle_goods(const Bundle &b) {
	Cost out;
	for (const Lot &l : b.lots) out.set(l.r, out.get(l.r) + l.n);
	return out;
}

std::pair<Cost, std::vector<Item>> cargo_contents(const std::vector<CargoSlot> &slots) {
	Cost goods;
	std::vector<Item> items;
	for (const CargoSlot &s : slots) {
		for (const Lot &l : s.hold->lots)
			if (l.n > EPS) goods.set(l.r, goods.get(l.r) + l.n);
		items.insert(items.end(), s.hold->items.begin(), s.hold->items.end());
	}
	return { goods, items };
}

double cargo_room(const std::vector<CargoSlot> &slots) {
	double a = 0;
	for (const CargoSlot &s : slots) a = a + std::max(0.0, s.cap - loads(*s.hold));
	return a;
}

std::optional<Bundle> cargo_take_out(const std::vector<CargoSlot> &slots, const Cost &goods, const std::vector<std::string> &uids, std::optional<double> seal) {
	for (const auto &[r, n] : goods.kv) {
		double have = 0;
		for (const CargoSlot &s : slots)
			for (const Lot &l : s.hold->lots)
				if (l.r == r && l.s == seal) have += l.n;
		if (have < n - EPS) return std::nullopt;
	}
	std::vector<std::string> all;
	for (const CargoSlot &s : slots)
		for (const Item &it : s.hold->items) all.push_back(it.uid);
	for (const std::string &u : uids)
		if (std::find(all.begin(), all.end(), u) == all.end()) return std::nullopt;
	Bundle out;
	for (const auto &[r, n] : goods.kv) {
		double left = n;
		for (const CargoSlot &s : slots)
			for (Lot &l : s.hold->lots) {
				if (l.r != r || l.s != seal || left <= EPS) continue;
				const double k = std::min(l.n, left);
				l.n -= k;
				left -= k;
				out.lots.push_back({ l.r, k, l.o, seal });
			}
	}
	for (const CargoSlot &s : slots) {
		std::vector<Item> keep;
		for (const Item &it : s.hold->items) (std::find(uids.begin(), uids.end(), it.uid) != uids.end() ? out.items : keep).push_back(it);
		s.hold->items = keep;
	}
	for (const CargoSlot &s : slots) s.hold->lots.erase(std::remove_if(s.hold->lots.begin(), s.hold->lots.end(), [](const Lot &l) { return !(l.n > EPS); }), s.hold->lots.end());
	return out;
}

Bundle cargo_take_sealed(const std::vector<CargoSlot> &slots, double seal) {
	Bundle out;
	for (const CargoSlot &s : slots) {
		for (const Lot &l : s.hold->lots)
			if (l.s == seal && l.n > EPS) out.lots.push_back(l);
		s.hold->lots.erase(std::remove_if(s.hold->lots.begin(), s.hold->lots.end(), [&](const Lot &l) { return l.s == seal; }), s.hold->lots.end());
	}
	return out;
}

godot::Dictionary lot_to(const Lot &l) {
	godot::Dictionary d;
	d["r"] = G(l.r);
	d["n"] = l.n;
	d["o"] = G(l.o);
	if (l.s) d["s"] = *l.s;
	return d;
}

Lot lot_from(const godot::Dictionary &d) {
	Lot l{ S(d["r"]), double(d["n"]), S(d.get("o", "")), std::nullopt };
	if (d.has("s") && d["s"].get_type() != godot::Variant::NIL) l.s = double(d["s"]);
	return l;
}

godot::Dictionary bundle_to(const Bundle &b) {
	godot::Array lots, items;
	for (const Lot &l : b.lots) lots.push_back(lot_to(l));
	for (const Item &it : b.items) items.push_back(item_full_to(it));
	godot::Dictionary d;
	d["lots"] = lots;
	d["items"] = items;
	return d;
}

Bundle bundle_from(const godot::Dictionary &d) {
	Bundle b;
	const godot::Array lots = d.get("lots", godot::Array()), items = d.get("items", godot::Array());
	for (int64_t i = 0; i < lots.size(); i++) b.lots.push_back(lot_from(lots[i]));
	for (int64_t i = 0; i < items.size(); i++) b.items.push_back(item_from(items[i]));
	return b;
}

} // namespace sim
