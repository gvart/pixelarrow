// W-62 the guided first hour (src/war/net/guide.ts), line for line: each path's chain (GUIDE_PATHS, from the exported
// table src/war/net/guide), the hand-off (guideNext, guideHand), where the guide's targets stand (guideSpots: the walk
// from the entry), and the done-checks (GuideWatch, watchFor, watchEvents, doneNow) over the room's snapshot. The room's
// runner (server/src/war/guide.ts RoomGuide) is in room_life.cpp.
#pragma once

#include <map>
#include <optional>
#include <set>
#include <string>
#include <utility>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/packed_byte_array.hpp>

#include "stories.h"

namespace sim {

// A JS Set of strings: insertion order
struct StrSet {
	std::vector<std::string> v;
	bool has(const std::string &s) const;
	void add(const std::string &s);
};

struct GuideStep {
	std::string id;
	std::vector<std::pair<std::string, double>> reward; // the table's key order
};
struct GuideTables {
	std::map<std::string, std::vector<GuideStep>> paths; // GUIDE_PATHS by path
	struct {
		std::string kind;
		double count = 2, at = 90;
	} lair;
	struct {
		double at = 16, level = 1;
	} soul;
	double near = 30, giverNear = 14, homeR = 64;
	double masteryNear = 20; // src/war/net/mastery.ts MASTERY.near
	std::vector<std::string> terrain; // src/war/region/compact.ts TERRAIN
	std::map<std::string, Story> stories; // src/data/warStories STORIES by region
	std::map<std::string, std::map<std::string, Story>> pathStories; // PATH_STORIES
	std::map<std::string, std::vector<std::string>> familyStart; // src/war/world/start FAMILIES[f].start
	struct {
		std::string id;
		double minLoads = 2, chance = 0.35;
	} robbers; // src/data/warEncounters ROBBERS
	struct {
		double hp = 1.5, loot = 2;
	} wake; // src/war/world/events WAKE
	double stormChance = 4; // STORM.chance
};
// tables["src/war/net/guide"], ["src/war/net/mastery"], ["src/war/region/compact"], ["src/data/warStories"],
// ["src/war/world/start"], ["src/data/warEncounters"], ["src/war/world/events"] (each absent: left as is)
void load_guide_tables(const godot::Dictionary &tables, GuideTables &out);

// storyOf(region, path): path "" is null
const Story *story_of(const std::string &region, const std::string &path = "");
const std::vector<GuideStep> &guide_steps(const std::string &path);

XY home_anchor(const godot::Dictionary &meta);
XY entry_spot(const godot::Dictionary &meta, int team);
struct GuideNext {
	std::string region, giver;
	XY exit;
};
std::optional<GuideNext> guide_next(const std::string &home, const godot::Dictionary &meta);
struct GuideHand {
	std::string giver;
	XY at;
	std::optional<std::string> road;
};
std::optional<GuideHand> guide_hand(const std::string &id, const godot::Dictionary &meta, const std::string &path);

struct GuideSpots {
	XY entry, home, soul, lair;
};
// cells: the region's u16 per tile (height | terrain << 4 | water << 7)
GuideSpots guide_spots(const godot::Dictionary &meta, const godot::PackedByteArray &cells, int team);

struct GuideSave {
	int v = 1;
	std::vector<std::string> done;
	bool hidden = false;
};
bool guide_open(const GuideSave *g, const std::string &path);
std::optional<GuideSave> guide_save_from(const godot::Variant &v);
godot::Dictionary guide_save_dict(const GuideSave &s);

struct GuideWatch {
	int team = 0;
	std::string owner;
	std::set<int> had; // membership only
	bool seen = false;
	std::optional<XY> lair;
	StrSet flags;
	std::optional<XY> next;
	double nextR = 30;
	std::optional<XY> town;
	std::map<int, std::string> access; // only looked up
};
GuideWatch watch_for(const std::string &path, const godot::Dictionary &meta, int team, const std::string &owner, const std::string &home, const std::optional<XY> &lair);
void watch_events(GuideWatch &w, const std::vector<godot::Dictionary> &evs);
StrSet done_now(GuideWatch &w, const godot::Dictionary &snap);

} // namespace sim
