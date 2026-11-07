// P7 alliance AI (src/war/sim/allianceAi.ts), line for line: one AI alliance in a region through the public sim API
// (the snapshot in; spawns, orders and bot behaviours out). ALLY_AI comes through SimData (src/war/sim/allianceAi),
// TUNNEL from tunnel.h. The TS reads the host's sim.snapshot() of the tick; here that is AiSnap (what it reads of one),
// built once per host tick and shared by every alliance's AI, as the TS shares the one snapshot object.
#pragma once

#include <map>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

#include "bots.h"
#include "holders.h"
#include "mobs.h"

namespace sim {

struct Sim;

struct AllyAiTables {
	double think = 50, players = 3;
	std::vector<std::string> classes;
	double tickMs = 100, muster = 8, holdR = 12, siegeR = 24, spot = 14;
	Cost stock; // in its key order
	std::string camp = "camp", store = "storehouse";
	double report = 100; // AI_SEASON.report (src/war/sim/aiSeason)
};
// tables["src/war/sim/allianceAi"], ["src/war/sim/aiSeason"] (absent: left as is)
void load_ally_tables(const godot::Dictionary &tables, AllyAiTables &out);

// What the AI (and the season's room summary) reads of a Snapshot.
struct AiSnap {
	int tick = 0;
	struct Unit {
		int id = 0, squad = 0;
		double x = 0, y = 0;
		bool dead = false;
		std::string cls;
	};
	struct Squad {
		int id = 0, team = 0;
		std::string owner, order;
		std::vector<int> units;
	};
	struct Bld {
		int id = 0, team = 0;
		std::string type, state;
		double x = 0, y = 0;
		bool ruin = false;
	};
	std::vector<Unit> units; // id order
	std::unordered_map<int, size_t> byId; // lookup only
	std::vector<Squad> squads; // by id
	std::vector<ClaimSnap> claims; // snap.claims ?? []
	std::vector<LairSnap> lairs; // snap.lairs ?? []
	std::vector<Bld> buildings;
	std::vector<std::pair<int, Cost>> stock;
};
AiSnap ai_snap(Sim &s);

struct AllianceAiStats {
	double raised = 0, squads = 0, orders = 0, bots = 0;
	int target = -1;
	std::string doing = "none";
	double laid = 0;
};

// entryOf(region, team): the region's entry sides in their order, one per team (wrapping); entries: [side, x, y, w, h].
struct AiEntry {
	std::string side;
	double x = 0, y = 0, w = 0, h = 0;
};
std::pair<double, double> entry_of(const std::vector<AiEntry> &entries, double w, double h, int team);

class AllianceAi {
public:
	AllianceAi(Sim &sim, Bots &bots, const std::vector<AiEntry> &entries, int team);
	const int team;
	void tick(const std::shared_ptr<const AiSnap> &snap);
	double men() const;
	double present() const;
	AllianceAiStats stats() const { return st; }

private:
	Sim &sim;
	Bots &bots;
	double ex = 0, ey = 0;
	std::vector<std::string> owners;
	std::vector<std::optional<double>> nextAt;
	bool started = false;
	std::vector<std::pair<int, Behaviour>> set; // a JS Map: insertion order
	AllianceAiStats st;
	std::shared_ptr<const AiSnap> snap;
	std::map<int, double> alive; // squad -> living fighting men (only looked up)

	int spawn(int k, double n);
	void order(const godot::Dictionary &o);
	Behaviour *setOf(int id);
	void behave(int id, const Behaviour &b);
	void unbot(int id);
	std::optional<std::pair<double, double>> centre(int id) const;
	std::vector<int> squadsOf(int k) const;
	double menOf(int k) const;
	void raise(double now);
	bool mine(const ClaimSnap &c) const { return c.state == "claimed" && c.team == team; }
	bool walled(double x, double y) const;
	std::pair<int, int> pickTarget() const;
	void band(const std::vector<int> &ids);
	std::pair<double, double> spot(const std::string &type, double x, double y);
	bool build(const std::vector<int> &ids);
	double aliveOf(int id) const;
};

} // namespace sim
