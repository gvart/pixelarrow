#include "roster.h"

#include <algorithm>
#include <cmath>

#include <godot_cpp/core/class_db.hpp>

#include "civilians.h"
#include "sim_data.h"
#include "skills.h"
#include "soldiers.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::Variant;

static std::string utf8(const Variant &v) { return godot::String(v).utf8().get_data(); }
static godot::String gs(const std::string &s) { return godot::String::utf8(s.c_str()); }
static bool has(const Dictionary &d, const char *k) { return d.has(k) && d[k].get_type() != Variant::NIL; }
static const RosterTables &R() { return data().roster; }
static std::string num(double v) { return std::to_string(int64_t(v)); } // whole numbers only here (PROMOTE)

static std::vector<std::string> strs(const Array &a) {
	std::vector<std::string> v;
	for (int64_t i = 0; i < a.size(); i++) v.push_back(utf8(a[i]));
	return v;
}

void load_roster_tables(const Dictionary &tables, RosterTables &out) {
	if (tables.has("src/war/sim/roster")) {
		const Dictionary t = tables["src/war/sim/roster"], picks = t["DEFAULT_PICKS"], pr = t["PROMOTE"], kit = t["ELITE_KIT"];
		const Array ks = picks.keys();
		for (int64_t i = 0; i < ks.size(); i++) out.DEFAULT_PICKS[utf8(ks[i])] = strs(picks[ks[i]]);
		out.PROMOTE.level = pr["level"];
		out.PROMOTE.honours = pr["honours"];
		out.ELITE_KIT.tier = kit["tier"];
		out.ELITE_KIT.rarity = utf8(kit["rarity"]);
		out.ELITES = strs(t["ELITES"]);
	}
	if (tables.has("src/data/classes")) {
		const Dictionary cs = Dictionary(tables["src/data/classes"])["CLASSES"];
		const Array ks = cs.keys();
		for (int64_t i = 0; i < ks.size(); i++) {
			const Dictionary c = cs[ks[i]];
			RosterTables::ClassDef d;
			d.name = utf8(c["name"]);
			const Array cu = c.get("cultures", Array());
			d.culture = cu.size() && cu[0].get_type() != Variant::NIL ? utf8(cu[0]) : "greek";
			d.group = c.get("group", 0);
			const Dictionary at = c["attrs"];
			const Array aks = at.keys();
			for (int64_t k = 0; k < aks.size(); k++) d.attrs.push_back({ utf8(aks[k]), double(at[aks[k]]) });
			const Dictionary kit = c.get("kit", Dictionary());
			const Array sks = kit.keys();
			for (int64_t k = 0; k < sks.size(); k++) {
				const Array tiers = kit[sks[k]];
				auto &v = d.kit[utf8(sks[k])];
				for (int64_t t = 0; t < tiers.size(); t++) {
					std::vector<std::string> opts;
					const Array os = tiers[t].get_type() == Variant::ARRAY ? Array(tiers[t]) : Array();
					for (int64_t o = 0; o < os.size(); o++) opts.push_back(os[o].get_type() == Variant::STRING ? utf8(os[o]) : "");
					v.push_back(opts);
				}
			}
			out.CLASSES[utf8(ks[i])] = d;
		}
	}
	if (tables.has("src/data/perks")) {
		const Dictionary p = tables["src/data/perks"];
		out.ATTR_IDS = strs(p["ATTR_IDS"]);
		out.ATTR_MAX = p["ATTR_MAX"];
	}
}

// ---------------------------------------------------------------- Hero

double Hero::attr(const std::string &k) const {
	for (const auto &[a, v] : attrs)
		if (a == k) return v;
	return std::numeric_limits<double>::quiet_NaN(); // undefined
}
void Hero::set_attr(const std::string &k, double v) {
	for (auto &e : attrs)
		if (e.first == k) return void(e.second = v);
	attrs.emplace_back(k, v);
}
void Hero::set_equip(const std::string &slot, const Item &it) {
	for (auto &e : equip)
		if (e.first == slot) return void(e.second = it);
	equip.emplace_back(slot, it);
}

static bool is_class_id(const std::string &c) { return R().CLASSES.count(c) > 0; }
static bool is_civ_class(const std::string &c) { return data().civilians.CIV_CLASSES.count(c) > 0; }
static std::string class_id(const std::string &c) { return is_class_id(c) ? c : "militia"; }
static const std::string *family_of(const std::string &cls) {
	const auto &f = data().skills.FAMILY_OF;
	const auto it = f.find(cls);
	return it == f.end() ? nullptr : &it->second;
}
static Item plain_item(const std::string &uid, const std::string &def, const std::string &rarity) {
	Item it;
	it.uid = uid;
	it.def = def;
	it.rarity = rarity;
	it.cond = 100;
	return it;
}
static const char *SLOTS[] = { "weapon", "shield", "helmet", "armor" };

// the first truthy option of a kit tier
static const std::string *first_of(const std::vector<std::string> &opts) {
	for (const std::string &x : opts)
		if (!x.empty()) return &x;
	return nullptr;
}

std::optional<std::string> kit_item(const std::string &cls, const std::string &slot, double tier) {
	const auto &kit = R().CLASSES.at(class_id(cls)).kit;
	const auto it = kit.find(slot);
	const std::vector<std::vector<std::string>> *k = it == kit.end() ? nullptr : &it->second;
	for (double t = std::min(tier, double(k ? k->size() : 1) - 1); t >= 0; t--) {
		if (!k || size_t(t) >= k->size()) continue;
		if (const std::string *item = first_of((*k)[size_t(t)])) return *item;
	}
	return std::nullopt;
}

Hero fresh_hero(const std::string &cls, const std::optional<std::string> &id_) {
	const std::string cid = class_id(cls);
	const std::string id = id_ ? *id_ : "war-" + cid;
	const RosterTables::ClassDef &def = R().CLASSES.at(cid);
	Hero h;
	for (const char *slot : SLOTS) {
		const auto it = def.kit.find(slot);
		const std::string *item = it != def.kit.end() && !it->second.empty() ? first_of(it->second[0]) : nullptr;
		if (item) h.equip.emplace_back(slot, plain_item("war-" + cid + "-" + slot, *item, "common"));
	}
	h.id = id;
	h.name = def.name;
	h.culture = def.culture;
	h.look.tunic = "tunicWhite";
	h.group = def.group;
	h.attrs = def.attrs;
	h.cls = cid;
	return h;
}

static Hero civ_hero(const CivHero &c) {
	Hero h;
	h.id = c.id;
	h.name = c.name;
	h.culture = c.culture;
	h.level = c.level;
	h.xp = c.xp;
	h.look = { c.look.skin, c.look.hair, c.look.hairStyle, c.look.beard, c.look.tunic };
	h.equip.emplace_back("weapon", c.weapon);
	h.kills = c.kills;
	h.battles = c.battles;
	h.group = c.group;
	h.attrs = c.attrs;
	h.points = c.points;
	h.wound = c.wound;
	h.cls = c.cls;
	return h;
}

Hero auto_spend(const Hero &hero) {
	Hero h = hero;
	const RosterTables::ClassDef &base = R().CLASSES.at(is_class_id(h.cls ? *h.cls : "") ? *h.cls : "militia");
	auto b = [&](const std::string &a) {
		for (const auto &[k, v] : base.attrs)
			if (k == a) return v;
		return std::numeric_limits<double>::quiet_NaN();
	};
	std::vector<std::string> order = R().ATTR_IDS;
	std::stable_sort(order.begin(), order.end(), [&](const std::string &x, const std::string &y) { return b(y) - b(x) < 0; });
	for (size_t i = 0; h.points > 0; i++) {
		std::vector<std::string> look{ order[i % 2] };
		look.insert(look.end(), order.begin(), order.end());
		const std::string *a = nullptr;
		for (const std::string &id : look)
			if (h.attr(id) < R().ATTR_MAX) {
				a = &id;
				break;
			}
		if (!a) break;
		h.set_attr(*a, h.attr(*a) + 1);
		h.points--;
	}
	return h;
}

WarPerson make_person(const std::string &id, const std::string &cls, const PersonOpts &o) {
	const double PPL = data().soldiers.POINTS_PER_LEVEL;
	const double level = std::max(1.0, std::min(data().soldiers.MAX_LEVEL, o.level ? *o.level : 1));
	if (is_civ_class(cls)) {
		// M5f: a civilian: his tool (kit tier, rarity) in the weapon slot, no skills yet
		const auto &tools = data().civilians.CIV_CLASSES.at(cls).tools;
		const std::string tool = tools.at(size_t(std::max(0.0, std::min(2.0, o.tier ? *o.tier : 0))));
		Hero h = civ_hero(fresh_civilian(cls, id));
		if (o.name) h.name = *o.name;
		h.level = level;
		h.points = (level - 1) * PPL;
		h.equip = { { "weapon", plain_item(id + "-tool", tool, o.rarity ? *o.rarity : "common") } };
		WarPerson p;
		p.id = id;
		p.hero = auto_spend(h);
		p.skills = std::vector<std::string>{};
		return p;
	}
	Hero hero = fresh_hero(cls, id);
	if (o.name) hero.name = *o.name;
	hero.level = level;
	hero.points = (level - 1) * PPL;
	const double tier = o.tier ? *o.tier : 0;
	const std::string rarity = o.rarity ? *o.rarity : "common";
	if (tier > 0 || rarity != "common")
		for (const char *slot : SLOTS) {
			const auto def = kit_item(*hero.cls, slot, tier);
			if (def) hero.set_equip(slot, plain_item(id + "-" + slot, *def, rarity));
		}
	hero = auto_spend(hero);
	const std::string *fam = family_of(*hero.cls);
	std::vector<std::string> picked;
	if (o.skills) picked = *o.skills;
	else if (fam) picked = R().DEFAULT_PICKS.at(*fam);
	WarPerson p;
	p.id = id;
	p.hero = hero;
	p.skills = legal_skills(*hero.cls, level, picked);
	return p;
}

// ---------------------------------------------------------------- the roster

WarPerson *Roster::find(const std::string &id) {
	for (WarPerson &p : persons)
		if (p.id == id) return &p;
	return nullptr;
}
const WarPerson *Roster::get(const std::string &id) const {
	for (const WarPerson &p : persons)
		if (p.id == id) return &p;
	return nullptr;
}
void Roster::set(const WarPerson &p) {
	if (WarPerson *q = find(p.id)) *q = p;
	else persons.push_back(p);
}
void Roster::add(const WarPerson &p) { set(p); }
std::vector<WarPerson> Roster::all() const { return persons; }

std::vector<WarPerson> Roster::recruit(const std::string &prefix, const std::string &cls, int n, const std::optional<PersonOpts> &o) {
	std::vector<WarPerson> out;
	for (int k = 0; k < n; k++) {
		const WarPerson p = make_person(prefix + "-" + std::to_string(persons.size()), cls, o ? *o : PersonOpts{});
		set(p);
		out.push_back(p);
	}
	return out;
}

void Roster::apply(const std::vector<PersonResultIn> &rs) {
	for (const PersonResultIn &x : rs) {
		const WarPerson *p0 = get(x.pid);
		if (!p0) continue;
		const WarPerson p = *p0;
		// E3: his fresh deeds onto his record, a scar for a wound he lived through
		std::vector<Deed> deeds, fresh;
		add_deeds(p.deeds ? *p.deeds : std::vector<Deed>{}, x.deeds ? *x.deeds : std::vector<Deed>{}, deeds, fresh);
		WarPerson q = p;
		q.hero = x.hero;
		if (!deeds.empty()) q.deeds = deeds;
		if (x.scar) q.scars = std::min(data().deeds.SCARS_MAX, (p.scars ? *p.scars : 0) + 1);
		set(q);
		bool found = false;
		for (auto &e : states)
			if (e.first == x.pid) e.second = x.state, found = true;
		if (!found) states.emplace_back(x.pid, x.state);
	}
}

std::string Roster::state(const std::string &id) const {
	for (const auto &e : states)
		if (e.first == id) return e.second;
	return "fit";
}

std::vector<WarPerson> Roster::fit() const {
	std::vector<WarPerson> out;
	for (const WarPerson &p : persons)
		if (state(p.id) == "fit") out.push_back(p);
	return out;
}

void Roster::update(const WarPerson &p) {
	if (find(p.id)) set(p);
}

void Roster::remove(const std::string &id) {
	persons.erase(std::remove_if(persons.begin(), persons.end(), [&](const WarPerson &p) { return p.id == id; }), persons.end());
	states.erase(std::remove_if(states.begin(), states.end(), [&](const auto &e) { return e.first == id; }), states.end());
}

std::optional<std::string> Roster::promote(const std::string &id, const std::string &to) {
	const WarPerson *p = get(id);
	if (!p) return std::string("no such person");
	if (state(id) != "fit") return "he is " + state(id);
	const auto why = promote_blocker(*p, to);
	if (!why) set(promote_person(*p, to));
	return why;
}

// ---------------------------------------------------------------- level-up choice

// [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7): per code point, its first UTF-16 unit
static uint32_t hash(const godot::String &s) {
	uint64_t h = 7;
	for (int64_t i = 0; i < s.length(); i++) {
		const uint32_t cp = uint32_t(s[i]);
		const uint32_t unit = cp >= 0x10000 ? 0xD800 + ((cp - 0x10000) >> 10) : cp;
		h = (h * 31 + unit) & 0xffffffffu;
	}
	return uint32_t(h);
}

static double slots_at(double level) {
	double n = 0;
	for (double l : data().skills.SKILL_LEVELS)
		if (level >= l) n++;
	return n;
}

std::vector<LevelOffer> level_offers(const WarPerson &p) {
	const Hero &h = p.hero;
	const std::string cls = h.cls ? *h.cls : "militia";
	const std::string *fam = family_of(cls);
	const auto held = legal_skills(cls, h.level, p.skills ? *p.skills : std::vector<std::string>{});
	const double slots = slots_at(h.level);
	std::vector<LevelOffer> out;
	if (fam && double(held.size()) < slots) {
		std::vector<std::string> pool;
		const auto it = data().skills.SKILL_POOL.find(*fam);
		if (it != data().skills.SKILL_POOL.end())
			for (const std::string &id : it->second)
				if (std::find(held.begin(), held.end(), id) == held.end()) pool.push_back(id);
		const size_t k = hash(gs(p.id + std::to_string(held.size()))) % std::max<size_t>(1, pool.size());
		std::vector<std::string> pick(pool.begin() + std::min(k, pool.size()), pool.end());
		pick.insert(pick.end(), pool.begin(), pool.begin() + std::min(k, pool.size()));
		if (pick.size() > 2) pick.resize(2);
		if (!pick.empty()) {
			for (const std::string &s : pick) out.push_back({ "skill", s, "", 0 });
			return out;
		}
	}
	if (h.points <= 0) return out;
	const double n = std::min(h.points, data().soldiers.POINTS_PER_LEVEL);
	for (const std::string &a : R().ATTR_IDS)
		if (h.attr(a) < R().ATTR_MAX) out.push_back({ "attr", "", a, n });
	return out;
}

WarPerson apply_offer(const WarPerson &p, const LevelOffer &o) {
	const Hero &h = p.hero;
	const std::string cls = h.cls ? *h.cls : "militia";
	WarPerson q = p;
	if (o.kind == "skill") {
		auto held = legal_skills(cls, h.level, p.skills ? *p.skills : std::vector<std::string>{});
		held.push_back(o.skill);
		q.skills = legal_skills(cls, h.level, held);
		return q;
	}
	const double add = std::max(0.0, std::min({ o.n, h.points, R().ATTR_MAX - h.attr(o.attr) }));
	q.hero.set_attr(o.attr, h.attr(o.attr) + add);
	q.hero.points = h.points - add;
	return q;
}

std::variant<WarPerson, std::string> spend_level(const WarPerson &p, const std::vector<std::pair<std::string, double>> &attrs, const std::optional<std::string> &skill) {
	const Hero &h = p.hero;
	Hero a = h;
	double spent = 0;
	for (const std::string &k : R().ATTR_IDS) {
		double n = 0;
		for (const auto &[ak, v] : attrs)
			if (ak == k) n = v;
		if (n < 0) return std::string("no_points"); // points are spent, never taken back
		if (a.attr(k) + n > R().ATTR_MAX) return std::string("attr_max");
		a.set_attr(k, a.attr(k) + n);
		spent += n;
	}
	if (spent > h.points) return std::string("no_points");
	std::vector<std::string> skills = p.skills ? *p.skills : std::vector<std::string>{};
	if (skill) {
		auto with = skills;
		with.push_back(*skill);
		const auto legal = legal_skills(h.cls ? *h.cls : "militia", h.level, with);
		if (std::find(skills.begin(), skills.end(), *skill) != skills.end() || std::find(legal.begin(), legal.end(), *skill) == legal.end()) return std::string("bad_skill");
		skills.push_back(*skill);
	}
	WarPerson q = p;
	q.hero.attrs = a.attrs;
	q.hero.points = h.points - spent;
	q.skills = skills;
	return q;
}

// ---------------------------------------------------------------- promotion

bool is_elite(const std::string &cls) { return std::find(R().ELITES.begin(), R().ELITES.end(), cls) != R().ELITES.end(); }

std::vector<std::string> promotes_to(const std::string &cls) {
	const std::string *fam = family_of(cls);
	if (!fam || cls == "militia" || is_elite(cls)) return {};
	std::vector<std::string> out;
	for (const std::string &e : R().ELITES) {
		const std::string *f = family_of(e);
		if (f && *f == *fam) out.push_back(e);
	}
	return out;
}

std::optional<std::string> promote_blocker(const WarPerson &p, const std::string &to) {
	const std::string cls = p.hero.cls ? *p.hero.cls : "militia";
	const auto opts = promotes_to(cls);
	if (std::find(opts.begin(), opts.end(), to) == opts.end()) return "a " + cls + " is not promoted to " + to;
	if (p.hero.level < R().PROMOTE.level) return "level " + num(R().PROMOTE.level) + " first";
	if (double(p.honours ? p.honours->size() : 0) < R().PROMOTE.honours) return num(R().PROMOTE.honours) + " honour first";
	return std::nullopt;
}

WarPerson promote_person(const WarPerson &p, const std::string &to) {
	PersonOpts kit;
	kit.tier = R().ELITE_KIT.tier;
	kit.rarity = R().ELITE_KIT.rarity;
	WarPerson q = p;
	q.hero.cls = to;
	q.hero.equip = make_person(p.id, to, kit).hero.equip;
	q.skills = legal_skills(to, p.hero.level, p.skills ? *p.skills : std::vector<std::string>{});
	return q;
}

WarPerson grant_xp(const WarPerson &p, double xp) {
	int ups = 0;
	const HeroXp g = gain_xp({ p.hero.level, p.hero.xp, p.hero.points }, xp, ups);
	WarPerson q = p;
	q.hero.level = g.level;
	q.hero.xp = g.xp;
	q.hero.points = g.points;
	return q;
}

// ---------------------------------------------------------------- dictionaries

static std::optional<std::string> ostr(const Dictionary &d, const char *k) { return has(d, k) ? std::optional<std::string>(utf8(d[k])) : std::nullopt; }

Item item_from(const Dictionary &d) {
	Item it;
	it.uid = utf8(d["uid"]);
	it.def = utf8(d["def"]);
	it.rarity = utf8(d["rarity"]);
	it.cond = d["cond"];
	if (d.has("paint")) {
		const Dictionary p = d["paint"];
		it.paint = ItemPaint{ ostr(p, "emblem"), ostr(p, "field"), ostr(p, "ink") };
	}
	it.aff = ostr(d, "aff");
	it.pow = ostr(d, "pow");
	if (has(d, "q")) it.q = int(d["q"]);
	if (has(d, "mc")) it.mc = double(d["mc"]);
	it.mk = ostr(d, "mk");
	it.tr = ostr(d, "tr");
	return it;
}
Dictionary item_full_to(const Item &it) {
	Dictionary d = item_to_dict(it);
	if (it.aff) d["aff"] = gs(*it.aff);
	if (it.pow) d["pow"] = gs(*it.pow);
	if (it.q) d["q"] = *it.q;
	if (it.mc) d["mc"] = *it.mc;
	if (it.mk) d["mk"] = gs(*it.mk);
	if (it.tr) d["tr"] = gs(*it.tr);
	return d;
}

static Array arr(const std::vector<std::string> &v) {
	Array a;
	for (const std::string &s : v) a.push_back(gs(s));
	return a;
}

Hero hero_from(const Dictionary &d) {
	Hero h;
	h.id = utf8(d["id"]);
	h.name = utf8(d["name"]);
	h.culture = utf8(d["culture"]);
	h.level = d["level"];
	h.xp = d["xp"];
	h.traits = strs(d.get("traits", Array()));
	const Dictionary lk = d["look"];
	h.look = { lk["skin"], lk["hair"], lk["hairStyle"], lk["beard"], utf8(lk["tunic"]) };
	const Dictionary eq = d["equip"];
	const Array ek = eq.keys();
	for (int64_t i = 0; i < ek.size(); i++)
		if (eq[ek[i]].get_type() == Variant::DICTIONARY) h.equip.emplace_back(utf8(ek[i]), item_from(eq[ek[i]]));
	h.kills = d["kills"];
	h.battles = d["battles"];
	h.group = d["group"];
	const Dictionary at = d["attrs"];
	const Array ak = at.keys();
	for (int64_t i = 0; i < ak.size(); i++) h.attrs.emplace_back(utf8(ak[i]), double(at[ak[i]]));
	h.points = d["points"];
	h.perks = strs(d.get("perks", Array()));
	h.wound = d["wound"];
	if (has(d, "reserve")) h.reserve = bool(d["reserve"]);
	h.arch = ostr(d, "arch");
	h.cls = ostr(d, "cls");
	return h;
}

Dictionary hero_to(const Hero &h) {
	Dictionary d;
	d["id"] = gs(h.id);
	d["name"] = gs(h.name);
	d["culture"] = gs(h.culture);
	d["level"] = h.level;
	d["xp"] = h.xp;
	d["traits"] = arr(h.traits);
	Dictionary lk;
	lk["skin"] = h.look.skin;
	lk["hair"] = h.look.hair;
	lk["hairStyle"] = h.look.hairStyle;
	lk["beard"] = h.look.beard;
	lk["tunic"] = gs(h.look.tunic);
	d["look"] = lk;
	Dictionary eq;
	for (const auto &[slot, it] : h.equip) eq[gs(slot)] = item_full_to(it);
	d["equip"] = eq;
	d["kills"] = h.kills;
	d["battles"] = h.battles;
	d["group"] = h.group;
	Dictionary at;
	for (const auto &[k, v] : h.attrs) at[gs(k)] = v;
	d["attrs"] = at;
	d["points"] = h.points;
	d["perks"] = arr(h.perks);
	d["wound"] = h.wound;
	if (h.reserve) d["reserve"] = *h.reserve;
	if (h.arch) d["arch"] = gs(*h.arch);
	if (h.cls) d["cls"] = gs(*h.cls);
	return d;
}

static std::vector<Deed> deeds_from(const Array &a) {
	std::vector<Deed> v;
	for (int64_t i = 0; i < a.size(); i++) {
		const Dictionary x = a[i];
		v.push_back({ utf8(x["id"]), utf8(x["name"]) });
	}
	return v;
}

WarPerson war_person_from(const Dictionary &d) {
	WarPerson p;
	p.id = utf8(d["id"]);
	p.hero = hero_from(d["hero"]);
	if (has(d, "skills")) p.skills = strs(d["skills"]);
	if (has(d, "honours")) {
		const Array a = d["honours"];
		std::vector<Honour> v;
		for (int64_t i = 0; i < a.size(); i++) {
			const Dictionary x = a[i];
			v.push_back({ utf8(x["name"]), utf8(x["stat"]) });
		}
		p.honours = v;
	}
	if (has(d, "deeds")) p.deeds = deeds_from(d["deeds"]);
	if (has(d, "scars")) p.scars = double(d["scars"]);
	return p;
}

Dictionary war_person_to(const WarPerson &p) {
	Dictionary d;
	d["id"] = gs(p.id);
	d["hero"] = hero_to(p.hero);
	if (p.skills) d["skills"] = arr(*p.skills);
	if (p.honours) {
		Array a;
		for (const Honour &h : *p.honours) {
			Dictionary x;
			x["name"] = gs(h.name);
			x["stat"] = gs(h.stat);
			a.push_back(x);
		}
		d["honours"] = a;
	}
	if (p.deeds) {
		Array a;
		for (const Deed &x : *p.deeds) {
			Dictionary o;
			o["id"] = gs(x.id);
			o["name"] = gs(x.name);
			a.push_back(o);
		}
		d["deeds"] = a;
	}
	if (p.scars) d["scars"] = *p.scars;
	return d;
}

} // namespace sim

namespace godot {

static std::string u8(const Variant &v) { return String(v).utf8().get_data(); }

static sim::PersonOpts opts_from(const Dictionary &d) {
	sim::PersonOpts o;
	if (d.has("level")) o.level = double(d["level"]);
	if (d.has("tier")) o.tier = double(d["tier"]);
	if (d.has("rarity")) o.rarity = u8(d["rarity"]);
	if (d.has("name")) o.name = u8(d["name"]);
	if (d.has("skills")) {
		std::vector<std::string> v;
		const Array a = d["skills"];
		for (int64_t i = 0; i < a.size(); i++) v.push_back(u8(a[i]));
		o.skills = v;
	}
	return o;
}

static Array persons_to(const std::vector<sim::WarPerson> &ps) {
	Array a;
	for (const sim::WarPerson &p : ps) a.push_back(sim::war_person_to(p));
	return a;
}

Roster::Roster() = default;
Roster::~Roster() = default;

Ref<Roster> Roster::create() {
	Ref<Roster> r;
	r.instantiate();
	r->ro = std::make_unique<sim::Roster>();
	return r;
}

Variant Roster::op(const Array &in) {
	const String k = in[0];
	if (k == "recruit") {
		std::optional<sim::PersonOpts> o;
		if (in[4].get_type() == Variant::DICTIONARY) o = opts_from(in[4]);
		return persons_to(ro->recruit(u8(in[1]), u8(in[2]), int(in[3]), o));
	}
	if (k == "add") ro->add(sim::war_person_from(in[1]));
	else if (k == "apply") {
		std::vector<sim::PersonResultIn> rs;
		const Array ps = Dictionary(in[1])["persons"];
		for (int64_t i = 0; i < ps.size(); i++) {
			const Dictionary x = ps[i];
			sim::PersonResultIn p;
			p.pid = u8(x["pid"]);
			p.state = u8(x["state"]);
			p.hero = sim::hero_from(x["hero"]);
			if (x.has("deeds")) {
				std::vector<sim::Deed> v;
				const Array a = x["deeds"];
				for (int64_t j = 0; j < a.size(); j++) v.push_back({ u8(Dictionary(a[j])["id"]), u8(Dictionary(a[j])["name"]) });
				p.deeds = v;
			}
			p.scar = x.get("scar", false).booleanize();
			rs.push_back(p);
		}
		ro->apply(rs);
	} else if (k == "update") ro->update(sim::war_person_from(in[1]));
	else if (k == "remove") ro->remove(u8(in[1]));
	else if (k == "promote") {
		const auto why = ro->promote(u8(in[1]), u8(in[2]));
		return why ? Variant(String::utf8(why->c_str())) : Variant();
	} else if (k == "state") return String(ro->state(u8(in[1])).c_str());
	return Variant();
}

Array Roster::all() const { return persons_to(ro->all()); }

PackedStringArray Roster::fit() const {
	PackedStringArray a;
	for (const sim::WarPerson &p : ro->fit()) a.push_back(String::utf8(p.id.c_str()));
	return a;
}

String Roster::state(const String &id) const { return String(ro->state(u8(id)).c_str()); }

Dictionary Roster::make_person(const String &id, const String &cls, const Dictionary &opts) { return sim::war_person_to(sim::make_person(u8(id), u8(cls), opts_from(opts))); }

Dictionary Roster::auto_spend(const Dictionary &hero) { return sim::hero_to(sim::auto_spend(sim::hero_from(hero))); }

static Dictionary offer_to(const sim::LevelOffer &o) {
	Dictionary d;
	d["kind"] = String(o.kind.c_str());
	if (o.kind == "skill") d["skill"] = String(o.skill.c_str());
	else d["attr"] = String(o.attr.c_str()), d["n"] = o.n;
	return d;
}

Array Roster::level_offers(const Dictionary &person) {
	Array a;
	for (const sim::LevelOffer &o : sim::level_offers(sim::war_person_from(person))) a.push_back(offer_to(o));
	return a;
}

Dictionary Roster::apply_offer(const Dictionary &person, const Dictionary &offer) {
	sim::LevelOffer o;
	o.kind = u8(offer["kind"]);
	o.skill = u8(offer.get("skill", ""));
	o.attr = u8(offer.get("attr", ""));
	o.n = offer.get("n", 0);
	return sim::war_person_to(sim::apply_offer(sim::war_person_from(person), o));
}

Variant Roster::spend_level(const Dictionary &person, const Dictionary &attrs, const Variant &skill) {
	std::vector<std::pair<std::string, double>> a;
	const Array ks = attrs.keys();
	for (int64_t i = 0; i < ks.size(); i++) a.emplace_back(u8(ks[i]), double(attrs[ks[i]]));
	std::optional<std::string> s;
	if (skill.get_type() == Variant::STRING) s = u8(skill);
	const auto r = sim::spend_level(sim::war_person_from(person), a, s);
	if (const std::string *why = std::get_if<std::string>(&r)) return String(why->c_str());
	return sim::war_person_to(std::get<sim::WarPerson>(r));
}

PackedStringArray Roster::promotes_to(const String &cls) {
	PackedStringArray a;
	for (const std::string &e : sim::promotes_to(u8(cls))) a.push_back(String(e.c_str()));
	return a;
}

Variant Roster::promote_blocker(const Dictionary &person, const String &to) {
	const auto why = sim::promote_blocker(sim::war_person_from(person), u8(to));
	return why ? Variant(String::utf8(why->c_str())) : Variant();
}

Dictionary Roster::promote_person(const Dictionary &person, const String &to) { return sim::war_person_to(sim::promote_person(sim::war_person_from(person), u8(to))); }

Dictionary Roster::grant_xp(const Dictionary &person, double xp) { return sim::war_person_to(sim::grant_xp(sim::war_person_from(person), xp)); }

Dictionary Roster::consts() {
	const sim::RosterTables &t = sim::data().roster;
	Dictionary d, picks, pr, kit;
	for (const auto &[f, v] : t.DEFAULT_PICKS) {
		Array a;
		for (const std::string &s : v) a.push_back(String(s.c_str()));
		picks[String(f.c_str())] = a;
	}
	pr["level"] = t.PROMOTE.level;
	pr["honours"] = t.PROMOTE.honours;
	kit["tier"] = t.ELITE_KIT.tier;
	kit["rarity"] = String(t.ELITE_KIT.rarity.c_str());
	Array el;
	for (const std::string &e : t.ELITES) el.push_back(String(e.c_str()));
	d["DEFAULT_PICKS"] = picks;
	d["PROMOTE"] = pr;
	d["ELITE_KIT"] = kit;
	d["ELITES"] = el;
	return d;
}

void Roster::_bind_methods() {
	ClassDB::bind_static_method("Roster", D_METHOD("create"), &Roster::create);
	ClassDB::bind_method(D_METHOD("op", "input"), &Roster::op);
	ClassDB::bind_method(D_METHOD("all"), &Roster::all);
	ClassDB::bind_method(D_METHOD("fit"), &Roster::fit);
	ClassDB::bind_method(D_METHOD("state", "id"), &Roster::state);
	ClassDB::bind_static_method("Roster", D_METHOD("make_person", "id", "cls", "opts"), &Roster::make_person);
	ClassDB::bind_static_method("Roster", D_METHOD("auto_spend", "hero"), &Roster::auto_spend);
	ClassDB::bind_static_method("Roster", D_METHOD("level_offers", "person"), &Roster::level_offers);
	ClassDB::bind_static_method("Roster", D_METHOD("apply_offer", "person", "offer"), &Roster::apply_offer);
	ClassDB::bind_static_method("Roster", D_METHOD("spend_level", "person", "attrs", "skill"), &Roster::spend_level);
	ClassDB::bind_static_method("Roster", D_METHOD("promotes_to", "cls"), &Roster::promotes_to);
	ClassDB::bind_static_method("Roster", D_METHOD("promote_blocker", "person", "to"), &Roster::promote_blocker);
	ClassDB::bind_static_method("Roster", D_METHOD("promote_person", "person", "to"), &Roster::promote_person);
	ClassDB::bind_static_method("Roster", D_METHOD("grant_xp", "person", "xp"), &Roster::grant_xp);
	ClassDB::bind_static_method("Roster", D_METHOD("consts"), &Roster::consts);
}

} // namespace godot
