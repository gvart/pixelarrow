// An item instance as the sim makes one (src/game/heroes.ts makeItem, src/data/items.ts Item): its uid, def, rarity,
// condition and the paint rolled on the sim's Rng (a shield's emblem, field and ink; a crested helmet's crest). Only
// makeItem is here: the item rules (stats, affixes, powers) stay in GDScript (docs/impl/godot-port.md G-10).
#pragma once

#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

#include "rng.h"

namespace sim {

struct ItemPaint {
	std::optional<std::string> emblem, field, ink;
};

struct Item {
	std::string uid, def, rarity;
	double cond = 100;
	std::optional<ItemPaint> paint;
};

// What makeItem reads of an ItemDef, and the paint tables (derived/item_paint).
struct ItemTable {
	struct Def {
		std::string slot, art;
	};
	std::unordered_map<std::string, Def> defs; // lookup only
	std::vector<std::pair<std::string, std::vector<std::string>>> field_ink;
	std::unordered_map<std::string, std::vector<std::string>> culture_emblems; // lookup only
	std::vector<std::string> crested_art;
};
// tables["items"]: src/data/items ITEMS; tables["item_paint"]: derived/item_paint (either absent: left empty)
void load_items(const godot::Dictionary &tables, ItemTable &out);

struct IdSource {
	int nextId = 0;
};

// makeItem(rng, ids, defId, rarity, cond, culture) without a given paint
Item make_item(Mulberry &rng, IdSource &ids, const std::string &def, const std::string &rarity = "common", double cond = 100, const std::string &culture = "greek");

godot::Dictionary item_to_dict(const Item &it);

} // namespace sim
