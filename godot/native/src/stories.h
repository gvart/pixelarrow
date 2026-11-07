// W-65 region story chains (src/war/sim/stories.ts), line for line: stories as data, their spots snapped to open
// ground, the paths through their choices, the items they pay, and the runner that reads snapshots and events and asks
// its host to spawn and pay. Also the world-fill hidden quests (src/data/warStories.ts hiddenStories and the `make` of
// each HIDDEN template, which the data export drops as code); their words come from the HIDDEN_TEXT table.
//
// The runner reads a small part of the sim's Snapshot (StorySnap below: squads, units, lairs, souls, buildings) and of
// its WarEvents (soulClaimed, soulRefused), so the full src/war/types.ts shapes are not needed here; the sim step builds
// a StorySnap as secrets.ts builds its runner's snapshot.
#pragma once

#include <cstdint>
#include <functional>
#include <limits>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>

#include "grid.h"
#include "item.h"

namespace sim {

struct XY {
	double x = 0, y = 0;
};
using Pt = XY; // a tile point as authored

struct StoryReward {
	// goods in the order they are written (Partial<Record<GoodKind, number>>); present even when empty
	std::optional<std::vector<std::pair<std::string, double>>> goods;
	struct ItemRef {
		std::string def, rarity;
	};
	std::optional<ItemRef> item;
	struct Soul {
		std::string cls;
		double level = 0;
		std::string name;
	};
	std::optional<Soul> soul;
};

struct StoryOption {
	std::string id, label, text;
	std::optional<StoryReward> reward;
	std::optional<std::string> next;
};

enum class Trigger { Talk, Reach, Track, Clear, Rescue, Built, Trade, Choice };

struct StoryTrigger {
	Trigger kind = Trigger::Talk;
	Pt at;
	std::vector<Pt> marks;
	// clear
	std::string mob;
	double count = 0;
	bool lead = false;
	std::optional<std::string> name, chief;
	// rescue (name above)
	std::string cls;
	double level = 0;
	// built
	std::string type;
	// trade
	std::string op;
	std::optional<double> coin;
	bool abroad = false;
	// choice
	std::vector<StoryOption> options;
};

struct StoryStep {
	std::string id, goal, story, where, label;
	StoryTrigger trigger;
	std::optional<StoryReward> reward;
	std::optional<std::string> next;
};

struct Story {
	std::string id, region, title;
	struct Giver {
		std::string name, title;
		Pt at;
		std::string cls;
	} giver;
	std::string hook, backstory;
	std::vector<StoryStep> steps;
	std::string end;
	std::optional<StoryReward> reward;
	std::optional<std::string> path;
	bool hidden = false;
};

// picks: a JS object, read by key only (std::map: its order never shows)
struct StorySave {
	int v = 1;
	std::string story;
	std::optional<std::string> at;
	double n = 0;
	std::map<std::string, std::string> picks;
	bool done = false;
};
StorySave new_save(const Story &s);

struct StoryRadii {
	double talk = 8, reach = 5, mark = 6, near = 30, soul = 2.5;
};
inline const StoryRadii STORY_R{};
constexpr double STORY_RESPAWN = 300;

// What the runner tells. kind: start, step (step, reward, option), end (reward), count (n).
struct StoryNote {
	std::string kind, step;
	std::optional<StoryReward> reward;
	std::optional<std::string> option;
	double n = 0;
};

struct LairAsk {
	std::string kind;
	double x = 0, y = 0;
	std::optional<double> count;
	bool lead = false;
	std::optional<std::string> chief;
};

struct StoryHost {
	std::function<void(const LairAsk &)> add_lair;
	std::function<void(double x, double y, const std::string &cls, double level)> spawn_soul;
	std::function<void(const StoryReward &, XY at, const std::optional<Item> &)> give;
};

// The part of a Snapshot the runner reads.
struct StorySnap {
	struct Squad {
		int id = 0, team = 0;
		std::string owner;
	};
	struct Unit {
		int squad = 0;
		double x = 0, y = 0;
		std::string cls, state;
	};
	struct Lair {
		double x = 0, y = 0;
		std::string state;
	};
	struct Soul {
		int id = 0;
		double x = 0, y = 0;
	};
	struct Building {
		std::string type, state, owner;
		int team = 0;
		bool pre = false, has_owner = false;
	};
	double tick = 0;
	std::vector<Squad> squads;
	std::vector<Unit> units;
	std::vector<Lair> lairs;
	std::vector<Soul> souls;
	std::vector<Building> buildings;
};
// soulClaimed / soulRefused (others are passed as kind "" and never match)
struct StoryEvent {
	std::string kind;
	int soul = 0, squad = 0;
	std::optional<std::string> owner;
};

struct StoryMe {
	int team = 0;
	std::optional<std::string> owner;
	bool online() const { return owner && !owner->empty(); } // the TS `this.me.owner` truthiness
};

// What snapOpen and storySpots read of a region: its size and its fresh movement grid's cost (buildGrid(r).cost), and
// the town spot of npcSpot (src/war/net/npcMarket.ts).
struct StoryRegion {
	std::string id;
	int w = 0, h = 0;
	std::vector<float> cost;
	XY npc;
};
XY npc_spot(const godot::Dictionary &meta);

XY snap_open(const StoryRegion &r, Pt p);
struct StorySpots {
	XY giver;
	std::map<std::string, std::vector<XY>> steps; // by step id, read by key only
};
StorySpots story_spots(const StoryRegion &r, const Story &s);
const StoryStep *step_of(const Story &s, const StorySave *save);
const StoryStep *story_after(const Story &s, const StoryStep &st, const std::optional<std::string> &next);
std::vector<const StoryStep *> story_path(const Story &s, const StorySave *save);
std::optional<Item> story_item(const Story &s, const std::string &step, const std::string &owner, const std::optional<StoryReward> &r);
bool rescued(const StorySnap &s, const std::vector<StoryEvent> &evs, const std::set<int> &souls, const StoryMe &me);

class StoryRun {
public:
	const StoryRegion &region;
	const Story story;
	StorySpots spots;
	StorySave save;
	StoryMe me;

	StoryRun(const StoryRegion &region, Story story, const std::optional<StorySave> &save, StoryMe me, StoryHost host);
	const StoryStep *step() const { return step_of(story, &save); }
	std::string owner() const { return me.owner ? *me.owner : "t:" + std::to_string(me.team); }
	std::vector<StoryNote> tick(const StorySnap &s, const std::vector<StoryEvent> &evs);
	std::vector<StoryNote> trade(const StorySnap &s, const std::string &op, double coin, double abroad);
	std::optional<std::vector<StoryNote>> choose(const StorySnap &s, const std::string &option);

private:
	StoryHost host;
	bool seen = false;
	double asked = -std::numeric_limits<double>::infinity();
	std::set<int> souls; // membership only

	std::vector<const StorySnap::Unit *> men(const StorySnap &s) const;
	XY centre(const StorySnap &s, XY orr) const;
	void pay(const StorySnap &s, const std::string &step, const std::optional<StoryReward> &r, XY at);
	void advance(const StorySnap &s, const StoryStep *next, std::vector<StoryNote> &notes);
	void finish(const StorySnap &s, const StoryStep &st, std::vector<StoryNote> &notes);
	void ensure(const StorySnap &s, const StoryStep &st);
};

// ---------------------------------------------------------------- hidden quests (src/data/warStories.ts)

struct HiddenText {
	std::string title, hook, backstory, story, end;
};
// The tables hiddenStories reads, through SimData: WAR_CHIEFS, WORLD_REGIONS, REGION_DEPTH, HIDDEN, HIDDEN_TEXT.
struct StoryTables {
	struct Chief {
		std::string id, name, kind;
	};
	std::vector<Chief> chiefs; // WAR_CHIEFS order (chiefsOfKind filters it)
	struct World {
		std::string id, biome;
		double x = 0, y = 0;
	};
	std::vector<World> world; // WORLD_REGIONS order (find)
	struct Template {
		std::string id, find;
	};
	std::vector<Template> hidden;
	std::unordered_map<std::string, std::unordered_map<std::string, HiddenText>> text; // template -> land ("plain") -> words
};
void load_story_tables(const godot::Dictionary &tables, StoryTables &out);

// landOf: "" for none
std::string land_of(const std::string &id);
// depthOf (src/war/sim/depth.ts): r.depth ?? REGION_DEPTH[r.id] ?? 1, clamped to 0..4
double depth_of(const godot::Dictionary &meta);
std::vector<Story> hidden_stories(const godot::Dictionary &meta);

// Dictionaries in the TS shapes (tables in, vectors out)
Story story_from(const godot::Dictionary &d);
godot::Dictionary story_to_dict(const Story &s);
godot::Dictionary reward_to_dict(const StoryReward &r);
StoryReward reward_from(const godot::Dictionary &d);
std::optional<StorySave> save_from(const Story &s, const godot::Variant &v); // saveOk, then the save as read
godot::Dictionary save_to_dict(const StorySave &s);
// the room's runs (room_life.cpp): its snapshot, events and the notes as the GDScript face reads and writes them
StorySnap story_snap(const godot::Dictionary &snap);
std::vector<StoryEvent> story_events(const godot::Array &evs);
godot::Array story_notes(const std::vector<StoryNote> &ns);

} // namespace sim

namespace godot {

// GDScript face of the story runner (tests replay the TS vectors through it; the room and the sim step use sim:: directly).
// Host calls are recorded: ["addLair", {...}], ["spawnSoul", x, y, cls, level], ["give", reward, {x, y}, item or null].
class StoryRun : public RefCounted {
	GDCLASS(StoryRun, RefCounted)

public:
	sim::StoryRegion region;
	std::unique_ptr<sim::StoryRun> run;
	Array calls;

	// story: a Story dictionary; meta: the region's JSON; grid: its fresh movement grid; me: {team, owner?}
	static Ref<StoryRun> create(const Dictionary &story, const Dictionary &meta, const Ref<Grid> &grid, const Variant &save, const Dictionary &me);
	Array tick(const Dictionary &snap, const Array &events);
	Array trade(const Dictionary &snap, const String &op, double coin, double abroad);
	Variant choose(const Dictionary &snap, const String &option);
	Dictionary get_save() const;
	Dictionary spots() const;
	Variant step() const;
	Array take_calls();

	// pure helpers
	static Dictionary snap_open(const Dictionary &meta, const Ref<Grid> &grid, double x, double y);
	static Dictionary story_spots(const Dictionary &story, const Dictionary &meta, const Ref<Grid> &grid);
	static PackedStringArray story_path(const Dictionary &story, const Variant &save);
	static Variant story_item(const Dictionary &story, const String &step, const String &owner, const Variant &reward);
	static Array save_check(const Dictionary &story, const Variant &save);
	static Array hidden_stories(const Dictionary &meta);
	static Dictionary round_trip(const Dictionary &story);
	static Dictionary radii();

protected:
	static void _bind_methods();
};

} // namespace godot
