// An item instance (src/data/items.ts Item), as the sim carries it in holds, packs, piles and crafted events, and as
// makeItem (src/game/heroes.ts) makes one: uid, def, rarity, condition and the paint rolled on the sim's Rng (a shield's
// emblem, field and ink; a crested helmet's crest). Optional TS fields are std::optional (absent and present differ in
// the events the sim emits). The item rules (stats, affixes, powers) are not here (docs/impl/godot-port.md G-10).
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
	std::optional<std::string> aff, pow;
	std::optional<int> q; // 0 crude, 1 fine, 2 masterwork
	std::optional<double> mc;
	std::optional<std::string> mk, tr;
	bool affLast = false; // its aff the object's last key (asTrophy's spread on an item with none): saved in that order
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
