#include "item.h"

#include <algorithm>
#include <cmath>

#include <godot_cpp/core/error_macros.hpp>
#include <godot_cpp/variant/array.hpp>

#include "js_math.h"
#include "sim_data.h"

namespace sim {

static std::string utf8(const godot::String &s) { return s.utf8().get_data(); }

void load_items(const godot::Dictionary &tables, ItemTable &out) {
	// ITEMS: "src/data/items" (the whole module, as the sim's tables give it), else "items" (ITEMS itself)
	if (tables.has("src/data/items") || tables.has("items")) {
		const godot::Dictionary items = tables.has("src/data/items") ? godot::Dictionary(godot::Dictionary(tables["src/data/items"])["ITEMS"]) : godot::Dictionary(tables["items"]);
		const godot::Array ids = items.keys();
		for (int64_t i = 0; i < ids.size(); i++) {
			const godot::Dictionary d = items[ids[i]];
			out.defs[utf8(ids[i])] = { utf8(d.get("slot", "")), utf8(d.get("art", "")) };
		}
	}
	if (tables.has("item_paint")) {
		const godot::Dictionary p = tables["item_paint"];
		const godot::Array fi = p["FIELD_INK"];
		for (int64_t i = 0; i < fi.size(); i++) {
			const godot::Array e = fi[i], inks = e[1];
			std::vector<std::string> v;
			for (int64_t k = 0; k < inks.size(); k++) v.push_back(utf8(inks[k]));
			out.field_ink.push_back({ utf8(e[0]), v });
		}
		const godot::Dictionary ce = p["CULTURE_EMBLEMS"];
		const godot::Array cs = ce.keys();
		for (int64_t i = 0; i < cs.size(); i++) {
			const godot::Array e = ce[cs[i]];
			std::vector<std::string> v;
			for (int64_t k = 0; k < e.size(); k++) v.push_back(utf8(e[k]));
			out.culture_emblems[utf8(cs[i])] = v;
		}
		const godot::Array ca = p["CRESTED_ART"];
		for (int64_t i = 0; i < ca.size(); i++) out.crested_art.push_back(utf8(ca[i]));
	}
}

template <typename T>
static const T &pick(Mulberry &rng, const std::vector<T> &arr) {
	return arr[size_t(std::floor(rng.next() * double(arr.size())))];
}

static std::string base36(int n) {
	if (n == 0) return "0";
	std::string s;
	for (; n > 0; n /= 36) s.insert(s.begin(), "0123456789abcdefghijklmnopqrstuvwxyz"[n % 36]);
	return s;
}

static std::string new_id(IdSource &ids, const std::string &prefix) { return prefix + base36(ids.nextId++); }

static ItemPaint shield_paint(Mulberry &rng, const std::string &culture) {
	const ItemTable &t = data().items;
	const auto &fi = pick(rng, t.field_ink);
	ItemPaint p;
	p.emblem = pick(rng, t.culture_emblems.at(culture));
	p.field = fi.first;
	p.ink = pick(rng, fi.second);
	return p;
}

static ItemPaint crest_paint(Mulberry &rng) {
	static const std::vector<std::string> crests = { "red", "ink", "cream", "red" };
	ItemPaint p;
	p.field = pick(rng, crests);
	return p;
}

Item make_item(Mulberry &rng, IdSource &ids, const std::string &def_id, const std::string &rarity, double cond, const std::string &culture) {
	const ItemTable &t = data().items;
	const auto d = t.defs.find(def_id);
	if (d == t.defs.end()) ERR_PRINT(godot::String("Unknown item ") + def_id.c_str());
	Item item{ new_id(ids, "i"), def_id, rarity, js::round(cond), std::nullopt };
	if (d == t.defs.end()) return item;
	if (d->second.slot == "shield") item.paint = shield_paint(rng, culture);
	else if (d->second.slot == "helmet" && std::find(t.crested_art.begin(), t.crested_art.end(), d->second.art) != t.crested_art.end()) item.paint = crest_paint(rng);
	return item;
}

godot::Dictionary item_to_dict(const Item &it) {
	godot::Dictionary d;
	d["uid"] = godot::String::utf8(it.uid.c_str());
	d["def"] = godot::String::utf8(it.def.c_str());
	d["rarity"] = godot::String::utf8(it.rarity.c_str());
	d["cond"] = it.cond;
	if (it.paint) {
		godot::Dictionary p;
		if (it.paint->emblem) p["emblem"] = godot::String::utf8(it.paint->emblem->c_str());
		if (it.paint->field) p["field"] = godot::String::utf8(it.paint->field->c_str());
		if (it.paint->ink) p["ink"] = godot::String::utf8(it.paint->ink->c_str());
		d["paint"] = p;
	}
	return d;
}

} // namespace sim
