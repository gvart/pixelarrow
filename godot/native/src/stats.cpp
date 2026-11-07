#include "stats.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <limits>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/string.hpp>

#include "civilians.h"
#include "js_math.h"
#include "rng.h"
#include "sim_data.h"
#include "skills.h"
#include "soldiers.h"

namespace sim {

namespace {

std::string u8(const godot::Variant &v) { return godot::String(v).utf8().get_data(); }
std::string opt_s(const godot::Dictionary &d, const char *k) { return d.has(k) && d[k].get_type() != godot::Variant::NIL ? u8(d[k]) : std::string(); }
std::vector<std::string> strs(const godot::Variant &v) {
	std::vector<std::string> out;
	const godot::Array a = v;
	for (int64_t i = 0; i < a.size(); i++) out.push_back(u8(a[i]));
	return out;
}
std::vector<double> nums(const godot::Variant &v) {
	std::vector<double> out;
	const godot::Array a = v;
	for (int64_t i = 0; i < a.size(); i++) out.push_back(a[i]);
	return out;
}
StatMods mods_of(const godot::Variant &v) {
	StatMods m;
	if (v.get_type() != godot::Variant::DICTIONARY) return m;
	const godot::Dictionary d = v;
	const godot::Array ks = d.keys();
	for (int64_t i = 0; i < ks.size(); i++) m.v.emplace_back(u8(ks[i]), double(d[ks[i]]));
	return m;
}
std::map<std::string, std::string> str_map(const godot::Variant &v) {
	std::map<std::string, std::string> out;
	const godot::Dictionary d = v;
	const godot::Array ks = d.keys();
	for (int64_t i = 0; i < ks.size(); i++) out[u8(ks[i])] = u8(d[ks[i]]);
	return out;
}
std::map<std::string, double> num_map(const godot::Variant &v) {
	std::map<std::string, double> out;
	const godot::Dictionary d = v;
	const godot::Array ks = d.keys();
	for (int64_t i = 0; i < ks.size(); i++) out[u8(ks[i])] = d[ks[i]];
	return out;
}
bool has(const std::vector<std::string> &v, const std::string &s) { return std::find(v.begin(), v.end(), s) != v.end(); }

const StatTables &T() { return data().stats; }

double round2(double v) { return js::round(v * 100) / 100; }
double round3(double v) { return js::round(v * 1000) / 1000; }

// JS Number(s) for an affix step ("2", " 3", "": 0; anything else NaN)
double js_number(const std::string &s) {
	size_t a = 0, b = s.size();
	while (a < b && std::isspace(static_cast<unsigned char>(s[a]))) a++;
	while (b > a && std::isspace(static_cast<unsigned char>(s[b - 1]))) b--;
	if (a == b) return 0;
	const std::string t = s.substr(a, b - a);
	if (t == "Infinity" || t == "+Infinity") return std::numeric_limits<double>::infinity();
	if (t == "-Infinity") return -std::numeric_limits<double>::infinity();
	char *end = nullptr;
	const double v = std::strtod(t.c_str(), &end);
	return end == t.c_str() + t.size() && t.find_first_of("xXnN") == std::string::npos ? v : std::numeric_limits<double>::quiet_NaN();
}

std::vector<std::string> split(const std::string &s, char c) {
	std::vector<std::string> out;
	size_t i = 0;
	for (;;) {
		const size_t j = s.find(c, i);
		out.push_back(s.substr(i, j == std::string::npos ? std::string::npos : j - i));
		if (j == std::string::npos) return out;
		i = j + 1;
	}
}

uint32_t hash_of(const std::string &s) { return hash_string(godot::String::utf8(s.c_str())); }

double rng_int(Mulberry &rng, double lo, double hi) { return lo + std::floor(rng.next() * (hi - lo + 1)); }

const std::string &rng_weighted(Mulberry &rng, const std::vector<std::pair<std::string, double>> &entries) {
	double total = 0;
	for (const auto &e : entries) total += e.second;
	double r = rng.next() * total;
	for (const auto &e : entries) {
		r -= e.second;
		if (r < 0) return e.first;
	}
	return entries.back().first;
}

const AffixDef *affix(const std::string &id) {
	for (const AffixDef &a : T().AFFIXES)
		if (a.id == id) return &a;
	return nullptr;
}

const PowerDef *power(const std::string &id) {
	for (const PowerDef &p : T().POWERS)
		if (p.id == id) return &p;
	return nullptr;
}

} // namespace

void load_stat_tables(const godot::Dictionary &tables, StatTables &o) {
	if (tables.has("src/data/items")) {
		const godot::Dictionary m = tables["src/data/items"];
		const godot::Dictionary items = m["ITEMS"];
		const godot::Array ids = items.keys();
		for (int64_t i = 0; i < ids.size(); i++) {
			const godot::Dictionary d = items[ids[i]];
			ItemDefFull f;
			f.id = u8(d["id"]);
			f.slot = u8(d["slot"]);
			f.weaponKind = opt_s(d, "weaponKind");
			f.shieldKind = opt_s(d, "shieldKind");
			f.art = u8(d["art"]);
			f.set = opt_s(d, "set");
			f.power = opt_s(d, "power");
			f.tier = d["tier"];
			f.mods = mods_of(d["mods"]);
			f.twoHanded = d.get("twoHanded", false);
			f.named = d.get("named", false);
			if (d.has("fixed")) f.fixed = mods_of(d["fixed"]).v;
			o.ITEMS[f.id] = f;
		}
		o.RARITIES = strs(m["RARITIES"]);
		o.LEGACY_RARITY = str_map(m["LEGACY_RARITY"]);
		o.RARITY_MULT = num_map(m["RARITY_MULT"]);
		o.QUALITY_MULT = nums(m["QUALITY_MULT"]);
		o.SCALED = strs(m["SCALED"]);
		o.PENALISED = strs(m["PENALISED"]);
	}
	if (tables.has("src/data/affixes")) {
		const godot::Dictionary m = tables["src/data/affixes"];
		const godot::Dictionary af = m["AFFIXES"];
		const godot::Array ks = af.keys();
		for (int64_t i = 0; i < ks.size(); i++) {
			const godot::Dictionary d = af[ks[i]];
			AffixDef a;
			a.id = u8(d["id"]);
			a.step = d["step"];
			a.slots = strs(d["slots"]);
			if (d.has("families")) a.families = strs(d["families"]);
			a.war = d.get("war", false);
			o.AFFIXES.push_back(a);
		}
		o.AFFIX_COUNT = nums(m["AFFIX_COUNT"]);
		const godot::Array st = m["AFFIX_STEPS"];
		for (int64_t i = 0; i < st.size(); i++) {
			const godot::Array e = st[i];
			o.AFFIX_STEPS.push_back({ e[0], e[1] });
		}
		const godot::Dictionary pw = m["POWERS"];
		for (const std::string &id : strs(m["POWER_IDS"])) {
			const godot::Dictionary d = pw[godot::String::utf8(id.c_str())];
			PowerDef p;
			p.id = id;
			p.slots = strs(d["slots"]);
			if (d.has("families") && d["families"].get_type() != godot::Variant::NIL) p.families = strs(d["families"]);
			o.POWERS.push_back(p);
		}
	}
	if (tables.has("src/data/gearRules")) {
		const godot::Dictionary m = tables["src/data/gearRules"];
		const godot::Dictionary cg = m["CLASS_GEAR"];
		const godot::Array ks = cg.keys();
		for (int64_t i = 0; i < ks.size(); i++) {
			const godot::Dictionary d = cg[ks[i]];
			o.CLASS_GEAR[u8(ks[i])] = { strs(d["weapons"]), strs(d["shields"]), u8(d["armor"]) };
		}
		o.WEIGHT_RANK = num_map(m["WEIGHT_RANK"]);
		o.WEIGHT_OVERRIDE = str_map(m["WEIGHT_OVERRIDE"]);
		o.ART_WEIGHT = str_map(m["ART_WEIGHT"]);
		o.TIER_BASE = nums(m["TIER_BASE"]);
		o.RARITY_ADD = nums(m["RARITY_ADD"]);
		o.SET_NEED = num_map(m["SET_NEED"]);
		o.OPEN_HELMET_ART = strs(m["OPEN_HELMET_ART"]);
	}
	if (tables.has("src/data/sets")) {
		const godot::Dictionary sets = godot::Dictionary(tables["src/data/sets"])["SETS"];
		const godot::Array ks = sets.keys();
		for (int64_t i = 0; i < ks.size(); i++) {
			const godot::Array bs = godot::Dictionary(sets[ks[i]])["bonuses"];
			std::vector<StatTables::SetBonus> &v = o.SETS[u8(ks[i])];
			for (int64_t k = 0; k < bs.size(); k++) {
				const godot::Dictionary b = bs[k];
				StatTables::SetBonus e;
				e.pieces = b["pieces"];
				if (b.has("mods")) e.mods = mods_of(b["mods"]);
				v.push_back(e);
			}
		}
	}
	if (tables.has("src/data/traits")) {
		const godot::Dictionary tr = godot::Dictionary(tables["src/data/traits"])["TRAITS"];
		const godot::Array ks = tr.keys();
		for (int64_t i = 0; i < ks.size(); i++) o.TRAITS[u8(ks[i])] = mods_of(godot::Dictionary(tr[ks[i]])["mods"]);
	}
	if (tables.has("src/data/units")) {
		const godot::Dictionary b = godot::Dictionary(tables["src/data/units"])["BASE"];
		o.BASE = { b["hp"], b["hpPerLevel"], b["dmg"], b["dmgPerLevel"], b["speed"], b["accuracy"], b["accuracyPerLevel"], b["reach"], b["atkTime"] };
	}
	if (tables.has("src/data/perks")) {
		const godot::Dictionary m = tables["src/data/perks"];
		o.ATTR_BASE = m["ATTR_BASE"];
		const godot::Dictionary e = m["ATTR_EFFECT"];
		o.ATTR_EFFECT = { e["strDmg"], e["strHp"], e["agiSpeed"], e["agiAccuracy"], e["agiTempo"], e["agiRanged"], e["endHp"] };
	}
	if (tables.has("src/data/classes")) {
		const godot::Dictionary m = tables["src/data/classes"];
		const godot::Dictionary cs = m["CLASSES"];
		const godot::Array ks = cs.keys();
		for (int64_t i = 0; i < ks.size(); i++) {
			const godot::Dictionary d = cs[ks[i]];
			StatClass c;
			c.kind = opt_s(d, "kind");
			if (d.has("beastStats")) {
				const godot::Dictionary b = d["beastStats"];
				c.beastStats = BeastDef{ b["hp"], b["dmg"], b["atkTime"], b["reach"], b["armor"], b["speed"] };
			}
			c.mods = mods_of(d["mods"]);
			c.mount = opt_s(d, "mount");
			o.CLASSES[u8(ks[i])] = c;
		}
		const godot::Dictionary ms = m["MOUNTS"];
		const godot::Array mk = ms.keys();
		for (int64_t i = 0; i < mk.size(); i++) {
			const godot::Dictionary d = ms[mk[i]];
			o.MOUNTS[u8(mk[i])] = { d["speed"], d["hp"] };
		}
	}
	if (tables.has("src/war/sim/classes")) {
		const godot::Dictionary m = tables["src/war/sim/classes"];
		const godot::Dictionary c = m["CLAMP"];
		o.CLAMP = { c["hp"], c["dmg"], c["armor"], c["block"], c["accuracy"], c["atk"], c["speed"], c["range"], c["ammo"], c["ap"], c["bp"] };
		o.CLAMP_BASE = str_map(m["CLAMP_BASE"]);
		o.POWER_FLAGS = num_map(m["POWER_FLAGS"]);
	}
	if (tables.has("src/data/warPerks")) {
		const godot::Dictionary ps = godot::Dictionary(tables["src/data/warPerks"])["PERKS"];
		const godot::Array ks = ps.keys();
		for (int64_t i = 0; i < ks.size(); i++) {
			const godot::Array l = ps[ks[i]];
			std::vector<StatTables::Perk> &v = o.PERKS[u8(ks[i])];
			for (int64_t k = 0; k < l.size(); k++) {
				const godot::Dictionary p = l[k];
				v.push_back({ p["level"], mods_of(p["fx"]).v });
			}
		}
	}
}

// --- src/data/items.ts ---

std::string normalize_rarity(const std::string &r) {
	if (has(T().RARITIES, r)) return r;
	const auto it = T().LEGACY_RARITY.find(r);
	return it != T().LEGACY_RARITY.end() ? it->second : "common";
}

int rarity_rank_of(const std::string &r) {
	const auto &rs = T().RARITIES;
	return int(std::find(rs.begin(), rs.end(), normalize_rarity(r)) - rs.begin());
}

const ItemDefFull &item_def(const std::string &id) { return T().ITEMS.at(id); } // TS: throws on an unknown item

// --- src/data/gearRules.ts ---

std::string weapon_family(const ItemDefFull &def) {
	if (def.slot != "weapon") return "";
	const std::string &k = def.weaponKind;
	if (k == "spear") return def.art == "spear_short" ? "short_spear" : "spear";
	if (k == "lance") return "lance";
	if (k == "javelins") return "javelins";
	if (k == "sword") return def.art == "kopis" ? "curved_sword" : def.art == "longsword" ? "longsword" : "short_sword";
	if (k == "axe") return "axe";
	if (k == "club") return "club";
	if (k == "polearm") return def.art == "falx" ? "falx" : "rhomphaia";
	if (k == "sling") return "sling";
	if (k == "bow") return def.art == "bow_short" ? "short_bow" : "bow";
	return "";
}

static std::string shield_type(const ItemDefFull &def) {
	if (def.slot != "shield") return "";
	return def.shieldKind == "hoplon" ? "big" : def.shieldKind == "oval" ? "long" : "light";
}

static std::string armor_weight(const ItemDefFull &def) {
	if (def.slot != "armor") return "";
	const auto o = T().WEIGHT_OVERRIDE.find(def.id);
	if (o != T().WEIGHT_OVERRIDE.end()) return o->second;
	const auto a = T().ART_WEIGHT.find(def.art);
	return a != T().ART_WEIGHT.end() ? a->second : "medium";
}

std::optional<std::string> class_gear_blocker(const std::string &cls, const ItemDefFull &def) {
	const auto g = T().CLASS_GEAR.find(cls);
	if (def.slot == "helmet" || def.slot == "trinket") return g != T().CLASS_GEAR.end() ? std::nullopt : std::optional<std::string>("none");
	if (g == T().CLASS_GEAR.end()) return "none";
	if (def.slot == "weapon") return has(g->second.weapons, weapon_family(def)) ? std::nullopt : std::optional<std::string>("weapon");
	if (def.slot == "shield") return has(g->second.shields, shield_type(def)) ? std::nullopt : std::optional<std::string>("shield");
	return T().WEIGHT_RANK.at(armor_weight(def)) <= T().WEIGHT_RANK.at(g->second.armor) ? std::nullopt : std::optional<std::string>("armor");
}

static std::pair<std::string, std::string> req_attrs(const ItemDefFull &def) {
	if (def.slot == "weapon") {
		const std::string f = weapon_family(def);
		if (f == "short_sword" || f == "curved_sword") return { "agi", "str" };
		if (f == "bow" || f == "short_bow" || f == "sling" || f == "javelins") return { "agi", "" };
		return { "str", "" };
	}
	if (def.slot == "shield") return shield_type(def) == "light" ? std::make_pair(std::string("agi"), std::string()) : std::make_pair(std::string("str"), std::string("end"));
	if (def.slot == "armor") {
		const std::string w = armor_weight(def);
		if (w == "heavy") return { "end", "str" };
		if (w == "light" && def.tier <= 1) return { "", "" };
		return { "end", "" };
	}
	if (def.slot == "helmet") return has(T().OPEN_HELMET_ART, def.art) && def.tier <= 1 ? std::make_pair(std::string(), std::string()) : std::make_pair(std::string("end"), std::string());
	return def.tier <= 1 ? std::make_pair(std::string(), std::string()) : std::make_pair(std::string("wil"), std::string()); // trinket
}

static std::vector<std::pair<std::string, double>> requirements(const std::string &defId, const std::string &rarity) {
	const ItemDefFull &def = item_def(defId);
	const auto [main, second] = req_attrs(def);
	if (main.empty()) return {};
	const std::string r = normalize_rarity(rarity);
	double n;
	if (def.named) n = 13;
	else if (!def.set.empty()) {
		const auto it = T().SET_NEED.find(r);
		n = it != T().SET_NEED.end() ? it->second : 9;
	} else n = T().TIER_BASE[size_t(std::max(1.0, std::min(3.0, def.tier)) - 1)] + T().RARITY_ADD[size_t(rarity_rank_of(r))];
	std::vector<std::pair<std::string, double>> out;
	if (n > 5) out.push_back({ main, n });
	if (!second.empty() && n - 3 > 5) out.push_back({ second, n - 3 });
	return out;
}

double shortfall(const Attrs *attrs, const std::string &defId, const std::string &rarity) {
	if (!attrs) return 0;
	double miss = 0;
	for (const auto &[attr, n] : requirements(defId, rarity)) {
		double have = 0;
		for (const auto &[k, v] : *attrs)
			if (k == attr) have = v;
		miss += std::max(0.0, n - have);
	}
	return miss;
}

double gear_penalty(double missing) { return std::min(0.7, 0.1 * std::max(0.0, missing)); }

// --- src/data/affixes.ts ---

static std::string affix_slot(const ItemDefFull &def) {
	if (def.slot != "weapon") return def.slot;
	const std::string f = weapon_family(def);
	return f == "bow" || f == "short_bow" || f == "sling" || f == "javelins" ? "ranged" : "melee";
}

static std::vector<std::pair<std::string, double>> affix_pool(const ItemDefFull &def) {
	const std::string slot = affix_slot(def), fam = weapon_family(def);
	std::vector<std::pair<std::string, double>> out;
	for (const AffixDef &a : T().AFFIXES) {
		if (!has(a.slots, slot) || a.war) continue;
		if (a.families && def.slot == "weapon" && !has(*a.families, fam)) continue;
		const std::optional<double> base = def.mods.get(a.id);
		out.push_back({ a.id, base && *base > 0 ? 2 : 1 });
	}
	return out;
}

static std::vector<std::pair<std::string, double>> parse_affixes(const std::string &s) {
	std::vector<std::pair<std::string, double>> out;
	for (const std::string &part : split(s, ',')) {
		const std::vector<std::string> kv = split(part, ':');
		const double n = kv.size() > 1 ? js::round(js_number(kv[1])) : std::numeric_limits<double>::quiet_NaN();
		if (affix(kv[0]) && n > 0) out.push_back({ kv[0], std::min(5.0, n) });
	}
	return out;
}

static uint32_t seed_of(const Item &item, const std::string &salt) { return hash_of(salt + "|" + item.uid + "|" + item.def + "|" + normalize_rarity(item.rarity)); }

std::vector<std::pair<std::string, double>> affixes_of(const Item &item) {
	if (item.aff && !item.aff->empty()) return parse_affixes(*item.aff);
	const ItemDefFull &def = item_def(item.def);
	if (def.fixed) {
		std::vector<std::pair<std::string, double>> out;
		for (const auto &[k, n] : *def.fixed)
			if (affix(k) && n > 0) out.push_back({ k, n });
		return out;
	}
	const int r = rarity_rank_of(item.rarity);
	const double n = T().AFFIX_COUNT[size_t(r)];
	if (!n) return {};
	Mulberry rng(seed_of(item, "aff"));
	std::vector<std::pair<std::string, double>> pool = affix_pool(def), out;
	const auto [lo, hi] = T().AFFIX_STEPS[size_t(r)];
	for (int i = 0; i < n && pool.size(); i++) {
		const std::string id = rng_weighted(rng, pool);
		pool.erase(std::find_if(pool.begin(), pool.end(), [&](const auto &e) { return e.first == id; }));
		out.push_back({ id, rng_int(rng, lo, hi) });
	}
	std::stable_sort(out.begin(), out.end(), [](const auto &a, const auto &b) { return b.second - a.second < 0; });
	return out;
}

StatMods affix_mods(const Item &item) {
	const ItemDefFull &def = item_def(item.def);
	StatMods out;
	for (const auto &[id, steps] : affixes_of(item)) {
		const double step = id == "ammo" && def.weaponKind == "javelins" ? 1 : affix(id)->step;
		out.set(id, round3(out.or0(id) + step * steps));
	}
	return out;
}

static std::vector<std::string> power_pool(const ItemDefFull &def) {
	const std::string slot = affix_slot(def), fam = weapon_family(def);
	std::vector<std::string> out;
	for (const PowerDef &p : T().POWERS) {
		if (!has(p.slots, slot)) continue;
		if (p.families && def.slot == "weapon" && !has(*p.families, fam)) continue;
		out.push_back(p.id);
	}
	return out;
}

std::optional<ItemPower> item_power(const Item &item) {
	const ItemDefFull &def = item_def(item.def);
	const int r = rarity_rank_of(item.rarity);
	const int grade = r >= 4 ? 1 : 0;
	const std::string fixed = item.pow ? *item.pow : def.power;
	if (!fixed.empty()) return power(fixed) ? std::optional<ItemPower>(ItemPower{ fixed, def.named ? 1 : grade }) : std::nullopt;
	if (r < 3 || !def.set.empty()) return std::nullopt;
	const std::vector<std::string> pool = power_pool(def);
	if (pool.empty()) return std::nullopt;
	Mulberry rng(seed_of(item, "pow"));
	return ItemPower{ pool[size_t(std::floor(rng.next() * double(pool.size())))], grade };
}

// --- src/data/items.ts itemMods ---

static StatMods base_mods(const Item &item) {
	const ItemDefFull &def = item_def(item.def);
	const double r = T().RARITY_MULT.at(normalize_rarity(item.rarity)) * T().QUALITY_MULT[size_t(item.q.value_or(1))];
	const double c = 0.6 + 0.4 * std::max(0.0, std::min(100.0, item.cond)) / 100;
	StatMods out;
	for (const auto &[k, v] : def.mods.v) {
		if (has(T().SCALED, k) && v > 0) out.set(k, round2(v * r * (k == "xpBonus" || k == "morale" || k == "hp" ? 1 : c)));
		else out.set(k, v);
	}
	// Rare+ ranged gear carries extra ammunition.
	const std::optional<double> ammo = out.get("ammo");
	if (ammo && *ammo && normalize_rarity(item.rarity) != "common") out.set("ammo", js::round(*ammo * (r + 0.05)));
	return out;
}

StatMods item_mods(const Item &item, const Attrs *attrs) {
	StatMods out = base_mods(item);
	for (const auto &[k, v] : affix_mods(item).v) out.set(k, round2(out.or0(k) + v));
	const double pen = gear_penalty(shortfall(attrs, item.def, item.rarity));
	if (pen > 0) {
		for (const std::string &k : T().PENALISED) {
			const std::optional<double> v = out.get(k);
			if (v && *v > 0) out.set(k, k == "ammo" ? js::round(*v * (1 - pen)) : round2(*v * (1 - pen)));
		}
	}
	return out;
}

// --- src/sim/stats.ts computeStats (the fields the war bake reads) ---

static void add_common(CombatStats &s, const StatMods &m) {
	s.maxHp += m.or0("hp");
	s.rangedDmg += m.or0("rangedDmg");
	s.range += m.or0("range");
	s.ammo += m.or0("ammo");
	s.accuracy += m.or0("accuracy");
	s.block += m.or0("block");
	s.blockPierce += m.or0("blockPierce");
	s.armor += m.or0("armor");
}

static const Item *equip_of(const Hero &h, const std::string &slot) {
	for (const auto &[k, it] : h.equip)
		if (k == slot) return &it;
	return nullptr;
}

static CombatStats beast_stats(const Hero &hero, const BeastDef &b) {
	const double k = 1 + 0.08 * (hero.level - 1);
	CombatStats s;
	s.maxHp = js::round(b.hp * k);
	s.dmg = b.dmg * k;
	s.reach = b.reach;
	s.atkTime = b.atkTime;
	s.shotTime = 2;
	s.accuracy = 0.6;
	s.blockPierce = 0.1;
	s.armor = b.armor;
	s.speed = T().BASE.speed * b.speed;
	return s;
}

CombatStats compute_stats(const Hero &hero) {
	// heroClass: the war bake always names a class id (classOfHero's legacy archetypes never reach here)
	const std::string cid = hero.cls && T().CLASSES.count(*hero.cls) ? *hero.cls : "militia";
	const StatClass &cls = T().CLASSES.at(cid);
	if (cls.kind == "animal" && cls.beastStats) return beast_stats(hero, *cls.beastStats);
	const double lvl = hero.level;
	// gear the class may not use is as good as not worn (docs/ITEMS.md "Class limits")
	const auto usable = [&](const std::string &slot) -> const ItemDefFull * {
		const Item *it = equip_of(hero, slot);
		return it && !class_gear_blocker(cid, item_def(it->def)) ? &item_def(it->def) : nullptr;
	};
	const ItemDefFull *weapon = usable("weapon");
	const ItemDefFull *shieldDef = usable("shield");
	const bool shieldUsable = shieldDef && !(weapon && weapon->twoHanded);
	const auto &B = T().BASE;
	CombatStats s;
	s.maxHp = B.hp + B.hpPerLevel * (lvl - 1);
	s.dmg = B.dmg + B.dmgPerLevel * (lvl - 1);
	s.reach = B.reach;
	s.atkTime = B.atkTime;
	s.shotTime = 2;
	s.accuracy = B.accuracy + B.accuracyPerLevel * (lvl - 1);
	s.speed = B.speed;
	s.weapon = weapon && !weapon->weaponKind.empty() ? weapon->weaponKind : "none";

	double speedMod = 0, atkSpeed = 0;
	std::vector<std::pair<std::string, double>> setCount; // a Map: insertion order
	for (const char *slot : { "weapon", "shield", "helmet", "armor", "trinket" }) {
		const Item *it = equip_of(hero, slot);
		if (!it) continue;
		const ItemDefFull &def = item_def(it->def);
		if (class_gear_blocker(cid, def)) continue;
		// a set piece counts only while its requirements are met
		const bool met = shortfall(&hero.attrs, it->def, it->rarity) == 0;
		if (!def.set.empty() && met) {
			auto e = std::find_if(setCount.begin(), setCount.end(), [&](const auto &x) { return x.first == def.set; });
			if (e == setCount.end()) setCount.push_back({ def.set, 1 });
			else e->second++;
		}
		if (std::string(slot) == "shield" && !shieldUsable) continue;
		const StatMods m = item_mods(*it, &hero.attrs);
		atkSpeed += m.or0("atkSpeed");
		// Weapon defines reach / timing absolutely; everything else is additive.
		if (std::string(slot) == "weapon") {
			if (const auto v = m.get("reach")) s.reach = *v;
			if (const auto v = m.get("atkTime")) s.atkTime = *v;
			if (const auto v = m.get("shotTime")) s.shotTime = *v;
		}
		s.dmg += m.or0("dmg");
		add_common(s, m);
		speedMod += m.or0("speed");
		if (std::string(slot) == "weapon" && m.or0("armorPierce")) s.armorPierce = m.or0("armorPierce");
	}
	// set bonuses: stat lines add like gear
	for (const auto &[set, n] : setCount) {
		const auto it = T().SETS.find(set);
		if (it == T().SETS.end()) continue;
		for (const StatTables::SetBonus &b : it->second) {
			if (n < b.pieces || !b.mods) continue;
			add_common(s, *b.mods);
			s.dmg += b.mods->or0("dmg");
			speedMod += b.mods->or0("speed");
			atkSpeed += b.mods->or0("atkSpeed");
		}
	}
	for (const std::string &t : hero.traits) {
		const StatMods &m = T().TRAITS.at(t);
		add_common(s, m);
		if (m.or0("dmg")) s.dmg += m.or0("dmg");
		speedMod += m.or0("speed");
	}
	// Class traits: like a trait, on top of the gear.
	add_common(s, cls.mods);
	s.dmg += cls.mods.or0("dmg");
	speedMod += cls.mods.or0("speed");
	// Perks: the war bake passes none (warStatsOf: perks [])
	// Attributes: each point away from ATTR_BASE shifts the derived stats.
	const auto &E = T().ATTR_EFFECT;
	const double str = hero.attr("str") - T().ATTR_BASE, agi = hero.attr("agi") - T().ATTR_BASE, end = hero.attr("end") - T().ATTR_BASE;
	s.dmg += str * E.strDmg;
	s.maxHp += str * E.strHp + end * E.endHp;
	speedMod += agi * E.agiSpeed;
	s.accuracy += agi * E.agiAccuracy;
	const double tempo = std::max(0.6, 1 - agi * E.agiTempo);
	s.atkTime *= tempo / (1 + atkSpeed);
	s.shotTime *= tempo;
	if (s.ammo > 0) s.ammo = js::round(s.ammo * 1); // ammoMult: no perks

	if (s.rangedDmg > 0) s.rangedDmg += (lvl - 1) * 0.3 + agi * E.agiRanged;
	s.speed = B.speed * (1 + speedMod);
	if (!cls.mount.empty()) {
		// The animal carries him: its speed and weight; his gear and legs count for less.
		const StatTables::Mount &m = T().MOUNTS.at(cls.mount);
		s.maxHp += m.hp;
		s.speed = B.speed * m.speed * (1 + speedMod * 0.35);
	}
	s.block = std::min(0.8, s.block);
	s.accuracy = std::max(0.2, std::min(0.95, s.accuracy));
	s.maxHp = js::round(s.maxHp);
	return s;
}

// --- src/data/warPerks.ts, src/war/sim/classes.ts ---

PerkFx perk_fx(const std::string &path, double level) {
	PerkFx fx;
	if (path.empty() || level < 2) return fx;
	const auto it = T().PERKS.find(path);
	if (it == T().PERKS.end()) return fx;
	for (const StatTables::Perk &p : it->second)
		if (p.level <= level)
			for (const auto &[f, v] : p.fx) {
				double *x = f == "hp" ? &fx.hp : f == "dmg" ? &fx.dmg : f == "armor" ? &fx.armor : f == "wounded" ? &fx.wounded : f == "work" ? &fx.work
					: f == "siteCost" ? &fx.siteCost : f == "siteHp" ? &fx.siteHp : f == "cartLoads" ? &fx.cartLoads : f == "cartSpeed" ? &fx.cartSpeed : f == "cartHp" ? &fx.cartHp : nullptr;
				if (x) *x = *x + v;
			}
	return fx;
}

WarStats with_perks(const WarStats &s, const PerkFx &fx) {
	if (!fx.hp && !fx.dmg && !fx.armor && !fx.wounded) return s;
	const double hp = 1 + fx.hp, dmg = 1 + fx.dmg;
	WarStats o = s;
	o.maxHp = js::round(s.maxHp * hp);
	o.dmg = s.dmg * dmg;
	o.rangedDmg = s.rangedDmg * dmg;
	o.armor = s.armor + fx.armor;
	o.ws = std::min(0.9, s.ws + fx.wounded);
	return o;
}

static int ticks_of(double sec) { return int(std::max(1.0, js::round(sec * 10))); }

static WarStats bake(const CombatStats &c, double end) {
	WarStats s;
	s.maxHp = c.maxHp;
	s.dmg = c.dmg;
	s.reach = c.reach;
	s.atkTicks = ticks_of(c.atkTime);
	s.rangedDmg = c.rangedDmg;
	s.range = c.ammo > 0 ? c.range : 0;
	s.ammo = c.ammo;
	s.shotTicks = ticks_of(c.shotTime);
	s.shotSpeed = c.weapon == "sling" ? 16 : c.weapon == "javelins" ? 12 : 20;
	s.missile = c.weapon == "sling" ? STONE : c.weapon == "javelins" ? JAVELIN : ARROW;
	s.accuracy = c.accuracy;
	s.armor = c.armor;
	s.block = c.block;
	s.ap = c.armorPierce.value_or(0);
	s.speed = c.speed / T().BASE.speed;
	s.bp = c.blockPierce;
	s.ws = wounded_share(end);
	s.flags = 0;
	return s;
}

WarStats war_stats_of(const WarPerson &person) {
	const Hero &hero = person.hero;
	const std::string hcls = hero.cls.value_or("");
	if (data().civilians.CIV_CLASSES.count(hcls)) {
		// M5f: the civilian's class stats, his level on HP (as soldiers', within the clamp), his tool on his work
		WarStats c = data().classes.of(hcls);
		c.maxHp = js::round(c.maxHp * std::min(T().CLAMP.hp, 1 + 0.04 * (hero.level - 1)));
		c.ws = wounded_share(hero.attr("end"));
		c.work = work_rate(hero.level, equip_of(hero, "weapon"));
		return c;
	}
	const std::string cls = T().CLASSES.count(hcls) ? hcls : "militia";
	const auto cb = T().CLAMP_BASE.find(cls);
	const WarStats &o = data().classes.of(cls), &b = data().classes.of(cb != T().CLAMP_BASE.end() ? cb->second : cls);
	Hero h = hero;
	h.cls = cls;
	h.perks.clear();
	WarStats s = bake(compute_stats(h), hero.attr("end"));
	if (o.range == 0) s.range = 0, s.ammo = 0, s.rangedDmg = 0; // a class without missiles fights without them
	int flags = 0, nf = 0;
	const double MAX_FLAGS = data().skills.MAX_FLAGS;
	const auto flag = [&](int f) {
		if (nf < MAX_FLAGS && !(flags & f)) flags |= f, nf++;
	};
	if (person.skills)
		for (const std::string &id : *person.skills) {
			const auto it = data().skills.SKILLS.find(id);
			if (it == data().skills.SKILLS.end()) continue;
			const SkillDef &k = it->second;
			if (k.kind == 'F' && k.flag && *k.flag) flag(int(*k.flag));
			if (k.kind != 'P') continue;
			s.dmg += k.dmg.value_or(0);
			s.reach += k.reach.value_or(0);
			s.armor += k.armor.value_or(0);
			s.block += k.block.value_or(0);
			s.accuracy += k.accuracy.value_or(0);
			s.bp += k.bp.value_or(0);
			if (s.range > 0) {
				s.range += k.range.value_or(0);
				s.ammo = js::round(s.ammo * k.ammo.value_or(1));
			}
		}
	for (const auto &[slot, it] : hero.equip) {
		const std::optional<ItemPower> pow = item_power(it);
		const auto f = pow ? T().POWER_FLAGS.find(pow->id) : T().POWER_FLAGS.end();
		if (f != T().POWER_FLAGS.end() && f->second) flag(int(f->second));
	}
	if (person.honours)
		for (size_t i = 0; i < person.honours->size() && i < 3; i++) {
			const std::string &st = (*person.honours)[i].stat;
			if (st == "hp") s.maxHp *= 1.02;
			else if (st == "dmg") s.dmg *= 1.02, s.rangedDmg *= 1.02;
			else if (st == "armor") s.armor *= 1.02;
			else if (st == "block") s.block *= 1.02;
			else s.accuracy *= 1.02;
		}
	// the cap: the trained baseline's (b) with CLAMP on top, never below his own class's fresh value (o)
	const auto &C = T().CLAMP;
	s.maxHp = js::round(std::min(s.maxHp, std::max(o.maxHp, b.maxHp * C.hp)));
	s.dmg = std::min(s.dmg, std::max(o.dmg, b.dmg * C.dmg));
	s.rangedDmg = std::min(s.rangedDmg, std::max(o.rangedDmg, b.rangedDmg * C.dmg));
	s.armor = std::min(s.armor, std::max(o.armor, b.armor + C.armor));
	s.block = std::min(s.block, std::max(o.block, b.block + C.block));
	s.accuracy = std::min(s.accuracy, std::max(o.accuracy, b.accuracy + C.accuracy));
	s.atkTicks = std::max(double(s.atkTicks), std::min(double(o.atkTicks), js::round(b.atkTicks * C.atk)));
	s.shotTicks = std::max(double(s.shotTicks), std::min(double(o.shotTicks), js::round(b.shotTicks * C.atk)));
	s.speed = std::min(s.speed, std::max(o.speed, b.speed * C.speed));
	if (s.range > 0) s.range = std::min(s.range, std::max(o.range, b.range + C.range));
	s.ammo = std::min(s.ammo, std::max(o.ammo, js::round(b.ammo * C.ammo)));
	s.ap = std::min(s.ap, std::max(o.ap, b.ap + C.ap));
	s.bp = std::min(s.bp, std::max(o.bp, b.bp + C.bp));
	s.flags = flags;
	const Item *w = equip_of(hero, "weapon");
	const double breach = w ? affix_mods(*w).or0("breaching") : 0;
	if (breach) s.breach = breach;
	return s;
}

} // namespace sim
