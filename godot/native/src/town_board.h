// The town boards (src/war/net/townBoard.ts, W-184..W-193), line for line: a town's listing seeded by town and window,
// a Kill's band sized to his army (Lanchester strengths), the pay by path, repeat and purse. The numbers and words come
// from the exported table src/data/warTownBoard (SimData.load). Pure: all state comes in, time is the caller's clock.
// Entries and lines are their TS objects (Dictionaries in TS key order).
#pragma once

#include <functional>
#include <optional>
#include <set>
#include <string>
#include <utility>
#include <vector>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>

namespace sim {

struct BoardTables {
	double hold = 3, windowHours = 4, onPath = 1.25, offPathPoints = 0.25;
	struct {
		double per = 0.3, floor = 0.2, recoverHours = 4;
	} repeat;
	struct Kill {
		std::string size;
		double share = 0, coin = 0, points = 0;
	};
	std::vector<Kill> kill;
	double bandMost = 16, chiefHeat = 0.2;
	struct Build {
		std::string size;
		double labour = 0, coin = 0, points = 0;
	};
	std::vector<Build> build;
	struct Trade {
		std::string size;
		double hops = 0, loads = 0, coin = 0, points = 0;
	};
	std::vector<Trade> trade;
	struct {
		double coin = 30, points = 25;
	} errand;
	struct {
		double near = 32, far = 68, apart = 26, tries = 48;
	} band;
	double siteReach = 40;
	struct {
		double easy = 1.6, fair = 1, hard = 0.6;
	} rating;
	std::vector<std::pair<std::string, std::vector<std::string>>> buildWork, bandWords; // BUILD_WORK, BAND_WORDS
	std::vector<std::string> buildAny;
	std::vector<std::pair<std::string, std::string>> bandPeople;
	std::string giverAny;
	std::vector<std::pair<std::string, std::vector<std::pair<std::string, std::string>>>> errandStory; // land -> kind -> line
};
// tables["src/data/warTownBoard"]
void load_board_tables(const godot::Dictionary &tables, BoardTables &out);

constexpr double TOWN_SEAL = 1'000'000'000;

double board_window(double now);
double window_end(double win);
// men: {cls, level?, hp?}
struct BoardMan {
	std::string cls;
	std::optional<double> level, hp;
};
double army_strength(const std::vector<BoardMan> &men, double level = 1);
double band_strength(const godot::Dictionary &band, double depth);

struct BoardFor {
	double army = 0;
	std::string path; // "" null
	double killHeat = 0;
	bool errand = false;
	std::optional<std::string> giver;
};
// boardEntries: region its RegionData (Region.meta)
godot::Array board_entries(const godot::Dictionary &region, double win, const BoardFor &f);
double heat_after(double heat, double ms);
struct Quote {
	double coin = 0, points = 0;
};
Quote quote_pay(const std::string &kind, double coin, double points, const std::string &path, double heat, double purse);
// boardLines: heat by kind; held: the entry ids he holds
godot::Array board_lines(const godot::Array &entries, double army, const std::string &path, const std::function<double(const std::string &)> &heat, double purse,
	const std::set<std::string> &held, double depth);

} // namespace sim
