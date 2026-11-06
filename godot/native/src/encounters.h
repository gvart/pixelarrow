// W-65 random encounters (src/war/sim/encounters.ts), line for line: the kinds that fit a region, the save, the runner
// that reads snapshots and asks its host to spawn, pay, take a toll and rob, and awayLine, goodsWords and pidOfUnit.
// ENC comes from the exported table src/war/sim/encounters and the kinds from src/data/warEncounters ENCOUNTERS
// (in their insertion order), both through SimData.load ("src/war/sim/encounters", "src/data/warEncounters").
//
// Like the story runner (stories.h), the runner reads a small part of the sim's Snapshot (EncSnap below) and of its
// WarEvents (soulClaimed, soulRefused: StoryEvent). The sim does not run it (the view and the room do).
#pragma once

#include <array>
#include <functional>
#include <limits>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <utility>
#include <vector>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>

#include "grid.h"
#include "stories.h"

namespace sim {

// goods as Record<string, number>, in insertion order
using EncGoods = std::vector<std::pair<std::string, double>>;

struct EncOption {
	std::string id, label, text;
	std::optional<StoryReward> reward;
	struct Risk {
		double chance = 0;
		std::string text, next;
	};
	std::optional<Risk> risk;
	std::optional<std::string> next;
	double toll = 0; // 0: none (TS undefined; a toll is never 0)
};

enum class EncKind { Reach, Clear, Track, Rescue, Choice, Guide };

struct EncTrigger {
	EncKind kind = EncKind::Reach;
	// reach
	std::optional<std::string> at; // 'here' | 'town' | 'lair' | 'giver'
	std::optional<double> r, off; // off also for track (0 is falsy for reach: `t.off &&`)
	// clear
	std::string mob;
	double count = 0;
	// track
	double marks = 0;
	// rescue
	std::string cls, name;
	double level = 0;
	// choice
	std::vector<EncOption> options;
};

struct EncStep {
	std::string id, goal, text, label;
	EncTrigger trigger;
	std::optional<StoryReward> reward;
	std::optional<std::string> next, unanswered;
	bool takes = false;
};

struct EncounterDef {
	std::string id, title, lore, end;
	double weight = 0;
	std::optional<double> minDepth;
	std::string needs; // '' none, 'town' | 'lair' | 'story'
	std::optional<std::vector<std::string>> biomes, beasts;
	bool road = false;
	std::optional<std::array<double, 2>> near;
	std::vector<EncStep> steps;
	const EncStep *step(const std::string &id) const {
		for (const EncStep &s : steps)
			if (s.id == id) return &s;
		return nullptr;
	}
};

struct EncConst {
	std::array<double, 2> cool{ 1800, 3000 };
	double fightR = 16;
	std::array<double, 2> far{ 10, 14 };
	double reach = 5, near = 30, town = 12, lair = 18, giver = 8, mark = 9, markR = 6, biome = 0.25, lapse = 1800, leave = 70, respawn = 300, saveEvery = 600;
};

struct EncTables {
	EncConst ENC;
	std::vector<EncounterDef> defs; // ENCOUNTERS, in insertion order (Object.values)
	const EncounterDef *def(const std::string &id) const {
		for (const EncounterDef &d : defs)
			if (d.id == id) return &d;
		return nullptr;
	}
};
// tables["src/war/sim/encounters"], tables["src/data/warEncounters"] (either absent: left as is)
void load_encounter_tables(const godot::Dictionary &tables, EncTables &out);
EncounterDef encounter_from(const godot::Dictionary &d);

struct EncOpen {
	std::string id, step;
	double x = 0, y = 0, tx = 0, ty = 0, since = 0;
	bool with = false;
	std::optional<double> n;
};

struct EncSave {
	int v = 1;
	double n = 0, travel = 0, next = 0;
	std::optional<std::string> last;
	std::optional<EncOpen> open;
	std::optional<std::vector<std::string>> away;
};

struct EncNote {
	std::string kind, enc, step; // start, step, end, lapse, unanswered, robbed
	std::optional<std::string> option;
	bool risk = false;
	std::optional<StoryReward> reward;
	EncGoods goods;
};

// What the runner reads of a region (the RegionData fields), as encounter_region builds it from the region's JSON.
struct EncRegion {
	StoryRegion base; // id, size and movement cost (snapOpen, storySpots)
	double depth = 1; // depthOf
	struct Rect {
		double x = 0, y = 0, w = 0, h = 0;
	};
	std::vector<Rect> safe, entries;
	std::vector<XY> claimPoints;
	std::vector<std::string> lairs; // its lairs' kinds, in order
	std::vector<int> rle;
	std::vector<std::string> biome_names;
	bool has_biomes = false;
};

// The part of a Snapshot the runner reads (lairs and souls: `?? []`).
struct EncSnap {
	struct Squad {
		int id = 0, team = 0;
		std::string owner;
	};
	struct Unit {
		int id = 0, squad = 0;
		double x = 0, y = 0;
		std::string cls, state;
		bool down = false, wounded = false;
	};
	struct Lair {
		int id = 0;
		std::string kind;
		double x = 0, y = 0;
		int squad = 0;
		double alive = 0;
		std::string state;
	};
	struct Soul {
		int id = 0;
		double x = 0, y = 0;
	};
	double tick = 0;
	std::vector<Squad> squads;
	std::vector<Unit> units;
	std::vector<Lair> lairs;
	std::vector<Soul> souls;
};

struct EncBand {
	int squad = 0;
	double x = 0, y = 0, alive = 0;
};
struct EncLairAsk {
	std::string kind;
	double x = 0, y = 0, count = 0;
};

// The optional ones (toll, rob) empty: the TS host without them.
struct EncHost {
	std::function<void(const EncLairAsk &)> add_lair;
	std::function<void(double x, double y, const std::string &cls, double level)> spawn_soul;
	std::function<void(const StoryReward &, XY at, const std::optional<Item> &)> give;
	std::function<void(double share)> toll;
	std::function<EncGoods(const EncBand &)> rob;
};

struct EncMe {
	int team = 0;
	std::optional<std::string> owner;
	std::optional<double> seed;
	bool online() const { return owner && !owner->empty(); }
};

std::string goods_words(const EncGoods &goods);
// null: nobody's (the number Number(owner.slice(2)) gives, NaN included)
std::optional<double> pid_of_unit(const EncSnap &s, int unit);
std::optional<std::string> away_line(const EncNote &n, const std::vector<EncounterDef> &defs);
EncSave new_enc_save(const std::string &region, const std::string &owner, double seed = 1);
const EncStep *enc_step_of(const std::vector<EncounterDef> &defs, const EncSave *s);
std::vector<XY> enc_towns(const EncRegion &r);
std::vector<std::string> enc_hunters(const EncRegion &r);
std::string enc_fauna(const EncRegion &r, double roll = 0);
std::vector<std::string> enc_biomes(const EncRegion &r); // a Set: insertion order
bool enc_fits(const EncounterDef &d, const EncRegion &r, double depth, const std::vector<std::string> &biomes);

class EncounterRun {
public:
	const EncRegion &region;
	const std::vector<EncounterDef> &defs;
	EncSave save;
	double depth = 1;
	bool due = false;
	EncMe me;

	EncounterRun(const EncRegion &region, const std::vector<EncounterDef> &defs, const std::optional<EncSave> &save, EncMe me, EncHost host, const Story *story);
	std::string owner() const { return me.owner ? *me.owner : "t:" + std::to_string(me.team); }
	const EncounterDef *def() const;
	const EncStep *step() const { return enc_step_of(defs, &save); }
	bool in_fight(const EncSnap &s, const std::vector<const EncSnap::Unit *> &men) const;
	std::vector<EncNote> fire(const EncSnap &s, const EncounterDef &def, const std::optional<XY> &from);
	std::vector<EncNote> tick(const EncSnap &s, const std::vector<StoryEvent> &evs);
	std::optional<std::vector<EncNote>> choose(const EncSnap &s, const std::string &option);
	std::vector<const EncSnap::Unit *> men(const EncSnap &s) const;

private:
	EncHost host;
	bool seen = false;
	double asked = -std::numeric_limits<double>::infinity();
	std::vector<XY> towns;
	std::optional<XY> giver;
	std::set<std::string> fits; // membership only
	std::set<int> souls; // membership only

	std::string key(const std::vector<std::string> &k) const;
	XY centre(const std::vector<const EncSnap::Unit *> &men, XY orr) const;
	std::vector<const EncounterDef *> choices(const EncSnap &s) const;
	XY target(const EncSnap &s, const EncStep &st, XY at);
	XY offset(XY at, double d, const std::string &key) const;
	void open(const EncSnap &s, const EncStep &st);
	std::optional<Item> item(const std::string &step, const std::optional<StoryReward> &rw) const;
	void pay(const EncSnap &s, const std::string &step, const std::optional<StoryReward> &rw);
	void advance(const EncSnap &s, const EncounterDef &def, const EncStep &st, const std::optional<std::string> &next, std::vector<EncNote> &notes);
	void ensure(const EncSnap &s, const EncStep &st);
};

// Dictionaries in the TS shapes
EncRegion encounter_region(const godot::Dictionary &meta, const Grid &grid);
std::optional<EncSave> enc_save_from(const std::vector<EncounterDef> &defs, const godot::Variant &v); // encSaveOk, then the save as read
godot::Dictionary enc_save_to_dict(const EncSave &s);

} // namespace sim

namespace godot {

// GDScript face of the encounter runner (tests replay the TS vectors through it). Host calls are recorded:
// ["addLair", {...}], ["spawnSoul", x, y, cls, level], ["give", reward, {x, y}, item or null], ["toll", share],
// ["rob", band]; rob answers with the goods set by set_rob.
class EncounterRun : public RefCounted {
	GDCLASS(EncounterRun, RefCounted)

public:
	sim::EncRegion region;
	std::optional<sim::Story> story;
	std::unique_ptr<sim::EncounterRun> run;
	Array calls;
	sim::EncGoods rob_answer;

	// meta: the region's JSON; grid: its fresh movement grid; me: {team, owner?, seed?}; story: a Story dictionary or null;
	// host: {rob: bool, toll: bool} (which optional host calls it has)
	static Ref<EncounterRun> create(const Dictionary &meta, const Ref<Grid> &grid, const Variant &save, const Dictionary &me, const Variant &story, const Dictionary &host);
	Array tick(const Dictionary &snap, const Array &events);
	// travel: up to n ticks on one snapshot (its tick counting up from snap.tick), stopping at the first notes: [notes, ran]
	Array travel(const Dictionary &snap, int n);
	Array fire(const Dictionary &snap, const String &def, const Variant &from);
	Variant choose(const Dictionary &snap, const String &option);
	void set_rob(const Dictionary &goods);
	Dictionary get_save() const;
	Variant step() const;
	bool take_due();
	double depth() const { return run->depth; }
	Array take_calls();

	// pure helpers
	static Dictionary region_info(const Dictionary &meta, const Ref<Grid> &grid); // depth, towns, hunters, biomes, fits, fitsAt, fauna
	static Array save_check(const Variant &save); // [encSaveOk, encStepOf id or null]
	static Variant away_line(const Dictionary &note);
	static String goods_words(const Dictionary &goods);
	static Variant pid_of_unit(const Dictionary &snap, int unit);
	static Dictionary enc();

protected:
	static void _bind_methods();
};

} // namespace godot
