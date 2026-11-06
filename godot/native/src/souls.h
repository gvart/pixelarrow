// W-60 souls (src/war/sim/souls.ts), line for line: the region's soul sites (shrines, spaced ruins, lairs, then the old
// battlefields its falls make), the spawn rolls on the module's own Rng, claims, contests, the wild taking a soul, the
// fading, W-62 storms and W-68 named souls. Tables through SimData ("souls": the src/war/sim/souls table: SOUL,
// SOUL_CLASSES, SOUL_LEVEL, SOUL_LEVEL_MAX); START, which is not exported, is spelt out in souls.cpp.
//
// A named soul's person is a WarPerson (holders, not ported yet): SoulPerson below is just what souls reads of one (id,
// hero name, class, level); the host keeps the whole person by id.
#pragma once

#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>

#include "rng.h"

namespace sim {

struct SoulTables {
	// SOUL
	double every = 0, max = 0, life = 0, fade = 0, reach = 0, channel = 0, scan = 0, field = 0, cell = 0, fields = 0, ruins = 0, spacing = 0, stormMax = 0;
	std::unordered_map<std::string, double> chance; // by site, lookup only
	std::unordered_map<std::string, std::vector<std::string>> classes; // SOUL_CLASSES by site
	std::unordered_map<std::string, double> level; // SOUL_LEVEL by site
	double level_max = 0; // SOUL_LEVEL_MAX
};
// tables["souls"]: the src/war/sim/souls table (absent: left empty)
void load_soul_tables(const godot::Dictionary &tables, SoulTables &out);

double soul_level(const std::string &site, double depth);

struct SoulPerson {
	std::string id, name;
	std::optional<std::string> cls;
	double level = 0;
};

struct Soul {
	int id = 0;
	double x = 0, y = 0;
	std::string cls;
	double level = 0;
	std::string site;
	double until = 0, prog = 0;
	int team = -1;
	bool contested = false;
	int at = -1;
	std::optional<SoulPerson> person;
	std::optional<std::string> bar;
	std::optional<double> barUntil;
};
struct SoulSite {
	std::string kind;
	double x = 0, y = 0;
};
struct SoulCell {
	double n = 0, x = 0, y = 0;
	std::vector<std::pair<std::string, double>> by; // a JS object of class names: insertion order
	int site = -1;
};

// What soulSites reads of a region.
struct SoulRegion {
	struct Pre {
		std::string type, state;
		double x = 0, y = 0;
	};
	std::vector<Pre> prebuilt;
	std::vector<std::pair<double, double>> lairs;
	double depth = 1; // depthOf(region)
};
SoulRegion soul_region(const godot::Dictionary &meta);
std::vector<SoulSite> soul_sites(const SoulRegion &r);

struct SoulMan {
	double x = 0, y = 0;
	int team = 0, squad = 0, claim = -1;
	std::string owner;
	bool civ = false;
};
struct SoulGate {
	bool ok = false;
	double have = 0;
	std::optional<std::string> why;
};
struct SoulJoin {
	int unit = 0;
	SoulPerson person;
};
// soulClaimed {soul, squad, owner, unit, person}, soulRefused {soul, squad, owner, have, why}, soulLost {soul, team,
// pid?}, soulFaded {soul, pid?}
struct SoulEvent {
	double t = 0;
	std::string kind;
	int soul = 0, squad = 0, unit = 0, team = 0;
	std::string owner, why;
	double have = 0;
	std::optional<std::string> pid;
	std::optional<SoulPerson> person;
};
struct SoulHost {
	std::function<const std::vector<SoulMan> &()> men;
	std::function<SoulGate(const std::string &owner, const std::string &cls)> gate;
	std::function<std::optional<SoulJoin>(const Soul &s, int squad)> join;
	std::function<void(const std::string &owner, int soul)> stop;
	std::function<void(const SoulEvent &)> emit;
	std::function<double(double x, double y)> chance_at; // optional: empty means 1
};

struct SoulSnap {
	int id = 0;
	double x = 0, y = 0;
	std::string cls;
	double level = 0;
	std::string site;
	double left = 0;
	std::optional<double> claim;
	int team = 0;
	bool contested = false;
	std::optional<std::string> name;
	std::optional<std::pair<std::string, double>> bar;
};

// saveRoot: list, next, fields, cells (a Map: insertion order), rng
struct SoulsRoot {
	std::vector<Soul> list;
	int next = 0;
	std::vector<SoulSite> fields;
	std::vector<std::pair<double, SoulCell>> cells;
	Mulberry rng{ 1 };
};

class Souls {
public:
	Souls(const SoulRegion &region, uint32_t seed, SoulHost host);
	void tick(double t);
	void fell(double x, double y, const std::string &cls);
	int spawn(double x, double y, const std::string &cls, double level, const std::string &site, double t);
	bool spawn_named(const SoulPerson &person, double t, double life, const std::optional<std::pair<std::string, double>> &bar);
	const Soul *get(int id) const;
	std::vector<SoulSnap> snaps(double t) const;
	bool any() const { return !list.empty(); }
	void set_storm(double k) { storm = std::max(1.0, k); }
	std::vector<SoulSite> sites() const;
	SoulsRoot save_root() const { return { list, next, fields, cells, rng }; }
	void load_root(const SoulsRoot &o) { list = o.list, next = o.next, fields = o.fields, cells = o.cells, rng = o.rng; }

private:
	double depth;
	std::vector<SoulSite> fixed;
	Mulberry rng;
	std::vector<Soul> list;
	int next = 0;
	std::vector<SoulSite> fields;
	std::vector<std::pair<double, SoulCell>> cells;
	double storm = 1;
	SoulHost host;

	Soul &make(double x, double y, const std::string &cls, double level, const std::string &site, double t, int at = -1);
	std::string pick(const SoulSite &site, int i);
	void roll(double t);
	bool claim(Soul &s, double t);
};

} // namespace sim

namespace godot {

// GDScript face of the souls (tests replay the TS vectors through it). The men come in with set_men([{x, y, team,
// squad, claim, owner, civ}]); host answers are popped in call order from `answers`: ["gate", owner, cls, {ok, have,
// why?}], ["join", soul, squad, {unit, person} or null], ["chanceAt", x, y, k]. Every host call is recorded with what it
// answered, as the TS driver writes them, and ["stop", owner, soul], ["emit", event].
class Souls : public RefCounted {
	GDCLASS(Souls, RefCounted)

public:
	sim::SoulRegion region;
	std::vector<sim::SoulMan> men;
	Array answers, calls;
	Dictionary persons; // id -> the whole person (the host's)
	std::unique_ptr<sim::Souls> s;

	static Ref<Souls> create(const Dictionary &meta, int64_t seed, bool chance_at);
	void set_men(const Array &men);
	void set_answers(const Array &a) { answers = a.duplicate(); }
	Array take_calls();
	void tick(double t) { s->tick(t); }
	void fell(double x, double y, const String &cls) { s->fell(x, y, cls.utf8().get_data()); }
	int spawn(double x, double y, const String &cls, double level, const String &site, double t);
	bool spawn_named(const Dictionary &person, double t, double life, const Variant &bar);
	Variant get(int id) const;
	Array snaps(double t) const;
	bool any() const { return s->any(); }
	void set_storm(double k) { s->set_storm(k); }
	Array sites() const;
	// the root moves here from another Souls (as loadRoot(saveRoot()) does), with the host's men and persons
	void load_root_of(const Ref<Souls> &from) { s->load_root(from->s->save_root()), persons = from->persons.duplicate(), men = from->men; }

	static Array soul_sites(const Dictionary &meta);
	static double soul_level(const String &site, double depth) { return sim::soul_level(site.utf8().get_data(), depth); }

protected:
	static void _bind_methods();
};

} // namespace godot
