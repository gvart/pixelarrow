// W-61 / W-63 town level (src/war/sim/townLevel.ts), line for line: the towns of each team round its camps and forts
// (or its first store), their measure (variety, stone share, walls closed, stone walls), the level it reaches and its
// perks. The tables (TOWN, TOWN_LEVELS, TOWN_PERKS) come through SimData ("town_level": the src/war/sim/townLevel table).
//
// The pieces are works.ts Buildings (not ported yet): TownPiece below is just the part of a Piece this module reads, so
// the sim step fills it from the works state.
#pragma once

#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/packed_string_array.hpp>

#include "grid.h"

namespace sim {

struct TownNeed {
	std::string name;
	double variety = 0, stone = 0;
	bool closed = false, stoneWalls = false;
};
struct TownPerk {
	double store = 0, hunger = 1, souls = 1, repair = 1;
};
struct TownTables {
	double r = 0, every = 0, area = 0; // TOWN
	std::vector<TownNeed> levels; // TOWN_LEVELS
	std::vector<TownPerk> perks; // TOWN_PERKS
	int max() const { return int(levels.size()) - 1; } // TOWN_MAX
};
// tables["town_level"]: the src/war/sim/townLevel table (absent: left empty)
void load_town_tables(const godot::Dictionary &tables, TownTables &out);

// What townLevel reads of a works Piece (and of its BuildingDef).
struct TownPiece {
	int id = 0, team = 0;
	std::string type, state;
	double x = 0, y = 0;
	bool cancelled = false, pre = false;
	int n = 0; // ti.length
	struct Def {
		std::optional<std::string> workplace; // workplace.kind
		std::optional<std::string> wall;
		std::string access, material;
		bool bridge = false, store = false;
	} def;
};

std::string kind_of(const std::string &type, const TownPiece::Def &d);

struct TownLevel {
	int team = 0, level = 0;
	double x = 0, y = 0, variety = 0, stone = 0;
	bool closed = false, stoneWalls = false;
	int centre = 0;
};
struct TownMeasure {
	double variety = 0, stone = 0;
	bool closed = false, stoneWalls = false;
};
int level_of(const TownMeasure &m);
std::vector<std::string> next_needs(int level, const TownMeasure &m);

class TownLevels {
public:
	TownLevels(const Grid &grid, std::function<const std::vector<TownPiece> &()> pieces, int mob);

	void tick(double tick);
	void measure();
	int level(int team) const;
	const TownLevel *town_at(int team, double x, double y) const;
	const TownLevel *town(int centre) const;
	std::vector<int> members(int centre) const;
	const TownPerk &perk_at(int team, double x, double y) const;
	double souls_at(double x, double y) const;
	// saveRoot: the towns by centre, in insertion order (a Map)
	const std::vector<TownLevel> &save_root() const { return levels; }
	void load_root(std::vector<TownLevel> l) { levels = std::move(l); }

private:
	const Grid &grid;
	std::function<const std::vector<TownPiece> &()> pieces;
	int mob;
	std::vector<TownLevel> levels; // the TS Map by centre id: insertion order, centres unique
	std::vector<uint32_t> seen;
	uint32_t stamp = 0;

	bool closed_at(int c);
};

} // namespace sim

namespace godot {

// GDScript face of the town levels (tests replay the TS vectors through it). Pieces are TownPiece dictionaries:
// {id, type, team, x, y, state, cancelled, pre, n, def: {workplace?, wall?, access?, bridge?, store?, material}}.
class TownLevels : public RefCounted {
	GDCLASS(TownLevels, RefCounted)

public:
	Ref<Grid> grid;
	std::vector<sim::TownPiece> list;
	std::unique_ptr<sim::TownLevels> t;

	static Ref<TownLevels> create(const Ref<Grid> &grid, int mob);
	void set_pieces(const Array &pieces);
	void tick(double tick) { t->tick(tick); }
	void measure() { t->measure(); }
	int level(int team) const { return t->level(team); }
	Variant town_at(int team, double x, double y) const;
	Variant town(int centre) const;
	Array members(int centre) const;
	Dictionary perk_at(int team, double x, double y) const;
	double souls_at(double x, double y) const { return t->souls_at(x, y); }
	Array snaps() const;

	static int level_of(const Dictionary &m);
	static PackedStringArray next_needs(const Dictionary &t);
	static String kind_of(const String &type, const Dictionary &def);

protected:
	static void _bind_methods();
};

} // namespace godot
