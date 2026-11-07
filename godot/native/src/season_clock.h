// The offline season clock (src/war/world/seasonClock.ts) and the season score it reads (src/war/world/season.ts
// scoreRate, allianceRates, hegemon), line for line. SCORE, LIVING, HEGEMONY, HOUR_MS, OMPHALOS, FRONTIER_TOWNS, GATES
// and the world regions' roles and alliances come through SimData.
#pragma once

#include <optional>
#include <string>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

namespace sim {

struct SeasonTables {
	std::string OMPHALOS = "omphalos";
	std::vector<std::string> FRONTIER_TOWNS, GATES;
	struct {
		double omphalos = 10, town = 3, gate = 2, neutral = 1, ruinedTown = 1;
	} SCORE;
	struct {
		double landmark = 2, landmarkCap = 6, prestigeCap = 2;
	} LIVING;
	struct {
		double towns = 3, ms = 86400000;
	} HEGEMONY;
	double HOUR_MS = 3600000;
	struct World {
		std::string id, role;
		int alliance = -1; // null: -1
	};
	std::vector<World> WORLD_REGIONS; // table order
	int ALLIANCES = 4;
};
// tables["src/war/world/season"], ["src/war/world/regions"], ["src/war/world/alliances"] (absent: left as is)
void load_season_tables(const godot::Dictionary &tables, SeasonTables &out);

// ScoredRegion, with the claims a report gave (landmarks, prestige and ruin are the room layer's: none here).
struct ClockRegion {
	std::string id;
	int owner = -1;
	std::vector<double> claims, live;
};
double score_rate(const ClockRegion &r);
std::vector<double> alliance_rates(const std::vector<ClockRegion> &regions);
int hegemon(const std::vector<ClockRegion> &regions); // -1: none

struct SeasonEnd {
	double at = 0;
	std::string reason; // 'time' | 'hegemony'
	int winner = -1; // null: -1
	std::vector<double> scores;
};

class SeasonClock {
public:
	SeasonClock(double startAt, double lengthMs);
	double startAt, endAt;
	std::vector<double> scores;
	double accruedAt;
	struct Hegemony {
		int alliance;
		double since;
	};
	std::optional<Hegemony> hegemony;
	std::optional<SeasonEnd> ended;
	std::vector<ClockRegion> regions;

	double endsAt() const;
	// the end when it ended on this call
	std::optional<SeasonEnd> advance(double now);
	void report(const std::string &id, const std::vector<double> &claims, const std::vector<double> &live, double now);

private:
	void checkHegemony(double now);
};

} // namespace sim
