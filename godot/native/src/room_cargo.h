// Cargo between the region room's live holders and the host (server/src/war/cargo.ts, M6e-M6h): what the transfers
// move (takeAll out of the packs and carts of men who leave, fill into those who arrive), what a road's toll and its
// robbers take (tollOf, robOf; W-197), and a bundle as its JSON.
#pragma once

#include <optional>
#include <string>
#include <utility>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

#include "holders.h"
#include "sim.h"

namespace sim {

// Goods and items in flight (cargo.ts Bundle).
struct Bundle {
	std::vector<Lot> lots;
	std::vector<Item> items;
};

// Put a bundle into the slots as far as they have room (first slot first); what did not fit comes back.
Bundle cargo_fill(const std::vector<CargoSlot> &slots, const Bundle &b);
// Everything out of the slots (a world transit).
Bundle cargo_take_all(const std::vector<CargoSlot> &slots);
// tollOf: a share of every lot is taken (rations too).
void cargo_toll(const std::vector<CargoSlot> &slots, double share);
// robOf: up to n loads taken, coin first, then the biggest lots (no rations); what was taken, by good in taking order.
std::vector<std::pair<std::string, double>> cargo_rob(const std::vector<CargoSlot> &slots, double n);

// Wave B (the holders and trade): bundleLoads, bundleGoods, contents (by good, sealed lots too, and the items), the free
// loads (room), takeOut (all or nothing; sealed lots only under their own seal: nullopt none), takeSealed.
double bundle_loads(const Bundle &b);
Cost bundle_goods(const Bundle &b);
std::pair<Cost, std::vector<Item>> cargo_contents(const std::vector<CargoSlot> &slots);
double cargo_room(const std::vector<CargoSlot> &slots);
std::optional<Bundle> cargo_take_out(const std::vector<CargoSlot> &slots, const Cost &goods, const std::vector<std::string> &uids = {}, std::optional<double> seal = std::nullopt);
Bundle cargo_take_sealed(const std::vector<CargoSlot> &slots, double seal);

// {r, n, o, s?} and {lots, items} as the TS objects (items whole: roster.h item_full_to)
godot::Dictionary lot_to(const Lot &l);
Lot lot_from(const godot::Dictionary &d);
godot::Dictionary bundle_to(const Bundle &b);
Bundle bundle_from(const godot::Dictionary &d);

} // namespace sim
