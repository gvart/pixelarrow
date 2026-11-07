// Cargo between the region room's live holders and the host (server/src/war/cargo.ts, M6e-M6h): what the transfers
// move (takeAll out of the packs and carts of men who leave, fill into those who arrive), and a bundle as its JSON.
#pragma once

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

// {r, n, o, s?} and {lots, items} as the TS objects (items whole: roster.h item_full_to)
godot::Dictionary lot_to(const Lot &l);
Lot lot_from(const godot::Dictionary &d);
godot::Dictionary bundle_to(const Bundle &b);
Bundle bundle_from(const godot::Dictionary &d);

} // namespace sim
