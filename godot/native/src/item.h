// An owned item instance (src/data/items.ts Item), as the sim carries it: in holds, packs, piles and crafted events.
// Optional TS fields are std::optional (absent and present differ in the events the sim emits).
#pragma once

#include <optional>
#include <string>

namespace sim {

struct ItemPaint {
	std::optional<std::string> emblem, field, ink;
};

struct Item {
	std::string uid, def, rarity;
	double cond = 0;
	std::optional<ItemPaint> paint;
	std::optional<std::string> aff, pow;
	std::optional<int> q; // 0 crude, 1 fine, 2 masterwork
	std::optional<double> mc;
	std::optional<std::string> mk, tr;
};

} // namespace sim
