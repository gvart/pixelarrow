// The soldier roster (src/war/sim/roster.ts), line for line: makePerson and autoSpend, the in-memory roster (recruit,
// fight reports back, states, promotion), the level-up offers (levelOffers, applyOffer, spendLevel), promotion
// (promotesTo, promoteBlocker, promotePerson) and grantXp. DEFAULT_PICKS, PROMOTE, ELITE_KIT and ELITES come from the
// exported table src/war/sim/roster, and what freshHero and kitItem read of src/data/classes CLASSES (name, cultures,
// group, attrs, kit) and of src/data/perks (ATTR_IDS, ATTR_MAX), through SimData.load ("src/war/sim/roster",
// "src/data/classes", "src/data/perks"); skills, soldiers, civilians and deeds read their own tables.
//
// Hero (src/data/units.ts) and WarPerson (src/war/types.ts) are the whole records, as the roster copies them. freshHero
// and kitItem (src/war/sim/classes.ts) are ported here: classes.h holds only the baked numbers.
#pragma once

#include <map>
#include <memory>
#include <optional>
#include <string>
#include <utility>
#include <variant>
#include <vector>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>

#include "deeds.h"
#include "honours.h"
#include "item.h"

namespace sim {

struct HeroLook {
	double skin = 0, hair = 0, hairStyle = 0, beard = 0;
	std::string tunic;
};

// A Hero; equip and attrs as Records in key order.
struct Hero {
	std::string id, name, culture;
	double level = 1, xp = 0;
	std::vector<std::string> traits;
	HeroLook look;
	std::vector<std::pair<std::string, Item>> equip;
	double kills = 0, battles = 0, group = 0;
	std::vector<std::pair<std::string, double>> attrs;
	double points = 0;
	std::vector<std::string> perks;
	double wound = 0;
	std::optional<bool> reserve;
	std::optional<std::string> arch, cls;
	double attr(const std::string &k) const;
	void set_attr(const std::string &k, double v);
	void set_equip(const std::string &slot, const Item &it);
};

struct WarPerson {
	std::string id;
	Hero hero;
	std::optional<std::vector<std::string>> skills;
	std::optional<std::vector<Honour>> honours;
	std::optional<std::vector<Deed>> deeds;
	std::optional<double> scars;
};

struct RosterTables {
	std::map<std::string, std::vector<std::string>> DEFAULT_PICKS; // by family, lookup only
	struct {
		double level = 6, honours = 1;
	} PROMOTE;
	struct {
		double tier = 1;
		std::string rarity = "rare";
	} ELITE_KIT;
	std::vector<std::string> ELITES;
	// CLASSES: what freshHero and kitItem read
	struct ClassDef {
		std::string name, culture; // cultures[0] ?? 'greek'
		double group = 0;
		std::vector<std::pair<std::string, double>> attrs;
		std::map<std::string, std::vector<std::vector<std::string>>> kit; // slot -> tiers -> options ("" for a falsy one)
	};
	std::map<std::string, ClassDef> CLASSES; // lookup only
	std::vector<std::string> ATTR_IDS;
	double ATTR_MAX = 15;
};
// tables["src/war/sim/roster"], tables["src/data/classes"], tables["src/data/perks"] (each absent: left as is)
void load_roster_tables(const godot::Dictionary &tables, RosterTables &out);

struct PersonOpts {
	std::optional<double> level, tier;
	std::optional<std::string> rarity, name;
	std::optional<std::vector<std::string>> skills;
};

std::optional<std::string> kit_item(const std::string &cls, const std::string &slot, double tier = 0);
Hero fresh_hero(const std::string &cls, const std::optional<std::string> &id = std::nullopt);
Hero auto_spend(const Hero &hero);
WarPerson make_person(const std::string &id, const std::string &cls, const PersonOpts &o = {});

struct PersonResultIn {
	std::string pid, state;
	Hero hero;
	std::optional<std::vector<Deed>> deeds;
	bool scar = false;
};

class Roster {
public:
	void add(const WarPerson &p);
	const WarPerson *get(const std::string &id) const;
	std::vector<WarPerson> all() const;
	std::vector<WarPerson> recruit(const std::string &prefix, const std::string &cls, int n, const std::optional<PersonOpts> &o);
	void apply(const std::vector<PersonResultIn> &persons);
	std::string state(const std::string &id) const;
	std::vector<WarPerson> fit() const;
	void update(const WarPerson &p);
	void remove(const std::string &id);
	std::optional<std::string> promote(const std::string &id, const std::string &to);

private:
	std::vector<WarPerson> persons; // a Map by id: insertion order
	std::vector<std::pair<std::string, std::string>> states; // a Map: read by key only
	WarPerson *find(const std::string &id);
	void set(const WarPerson &p);
};

struct LevelOffer {
	std::string kind; // skill | attr
	std::string skill, attr;
	double n = 0;
};
std::vector<LevelOffer> level_offers(const WarPerson &p);
WarPerson apply_offer(const WarPerson &p, const LevelOffer &o);
// the person after the spend, or why not: attr_max, no_points, bad_skill
std::variant<WarPerson, std::string> spend_level(const WarPerson &p, const std::vector<std::pair<std::string, double>> &attrs, const std::optional<std::string> &skill);

bool is_elite(const std::string &cls);
std::vector<std::string> promotes_to(const std::string &cls);
std::optional<std::string> promote_blocker(const WarPerson &p, const std::string &to);
WarPerson promote_person(const WarPerson &p, const std::string &to);
WarPerson grant_xp(const WarPerson &p, double xp);

// Dictionaries in the TS shapes
Hero hero_from(const godot::Dictionary &d);
godot::Dictionary hero_to(const Hero &h);
WarPerson war_person_from(const godot::Dictionary &d);
godot::Dictionary war_person_to(const WarPerson &p);

} // namespace sim

namespace godot {

// GDScript face of the roster (tests replay src/dev/vectors/roster.ts through it): the pure functions, and a roster
// driven by the vectors' ops (["recruit", prefix, cls, n, opts or null], ["add", person], ["apply", report],
// ["update", person], ["remove", id], ["promote", id, to], ["state", id]).
class Roster : public RefCounted {
	GDCLASS(Roster, RefCounted)

public:
	std::unique_ptr<sim::Roster> ro;
	Roster();
	~Roster();

	static Ref<Roster> create();
	Variant op(const Array &input);
	Array all() const;
	PackedStringArray fit() const;
	String state(const String &id) const;

	static Dictionary make_person(const String &id, const String &cls, const Dictionary &opts);
	static Dictionary auto_spend(const Dictionary &hero);
	static Array level_offers(const Dictionary &person);
	static Dictionary apply_offer(const Dictionary &person, const Dictionary &offer);
	static Variant spend_level(const Dictionary &person, const Dictionary &attrs, const Variant &skill);
	static PackedStringArray promotes_to(const String &cls);
	static Variant promote_blocker(const Dictionary &person, const String &to);
	static Dictionary promote_person(const Dictionary &person, const String &to);
	static Dictionary grant_xp(const Dictionary &person, double xp);
	static Dictionary consts();

protected:
	static void _bind_methods();
};

} // namespace godot
