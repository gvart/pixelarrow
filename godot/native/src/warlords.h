// W-72 rival warlords (src/war/sim/warlords.ts), line for line: a director over a region's sim and bots that holds
// places with garrisons, takes more as he ages, tops them up, raids alliance buildings and carts after a warning, loses
// places and falls. WARLORDS, WARLORD, SPOILS (src/data/warWarlords), DAY_TICKS (src/war/sim/warlords), the world graph
// (src/war/world/regions) and ALLIANCES' count (src/war/world/alliances) come through SimData, REGION_DEPTH and
// BASE_ITEMS from the depth and item tables. The TS reads the sim's snapshot and gives spawns and orders through the
// public API; here the snapshot is WarlordsSnap (what it reads of one) and the calls go through WarlordsHost.
// exportState/importState wait for the state port (the Lord fields are public for it).
#pragma once

#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

#include "bots.h"
#include "depth.h"
#include "holders.h"
#include "item.h"
#include "mobs.h"
#include "rng.h"

namespace sim {

struct WarlordDef {
	std::string id, name, title, band, seat, kind;
	double men = 1, lord = 1, tint = 0, scale = 1;
	struct {
		std::string rise, took, warn, freed, fallen;
	} lines;
};

struct WarlordTables {
	std::vector<WarlordDef> WARLORDS;
	struct {
		double think = 10;
		struct {
			double seat = 2, march = 3, marchDay = 1;
		} grow;
		double maxHold = 3;
		struct {
			std::vector<double> base, max;
			double perDay = 1, press = 0.15, cap = 12, hall = 2;
		} garrison;
		double holdR = 10;
		struct {
			double hp = 2, dmg = 1.25, armor = 2;
		} lieutenant, lord;
		double reinforce = 6000, quiet = 20, retake = 72000, back = 3;
		struct {
			double every = 12000, maxDiv = 3, warn = 600;
			std::vector<double> men;
			double perPlayer = 2, max = 12, reach = 110, guard = 16, cartGuard = 10, stay = 900, at = 5;
		} raid;
		struct {
			struct {
				double coin = 0, goods = 0, per = 0;
			} holding;
			struct {
				double coin = 0, goods = 0, per = 0;
				std::vector<std::pair<std::string, double>> rarity;
			} lord;
		} loot;
		double cap = 60, arrive = 6;
		struct {
			double leave = 900;
			std::string line;
		} recall;
	} WARLORD;
	std::unordered_map<std::string, std::string> SPOILS; // looked up by kind only
	double DAY_TICKS = 864000;
	// src/war/world/regions WORLD_REGIONS (what domainOf and edge read), in table order
	struct World {
		std::string id, role;
		double x = 0, y = 0;
		std::vector<std::string> adj;
	};
	std::vector<World> WORLD_REGIONS;
	int ALLIANCES = 4; // ALLIANCES.length
};
// tables["src/data/warWarlords"], ["src/war/sim/warlords"], ["src/war/world/regions"], ["src/war/world/alliances"] (absent: left as is)
void load_warlord_tables(const godot::Dictionary &tables, WarlordTables &out);

// domainOf and warlordsOf (src/data/warWarlords.ts); edge(a, b)'s sideA (src/war/world/graph.ts, "" when they do not touch).
std::vector<std::string> warlord_domain(const WarlordDef &w);
std::vector<const WarlordDef *> warlords_of(const std::string &region);
std::string edge_side(const std::string &a, const std::string &b);

struct WarlordLoot {
	std::vector<std::pair<std::string, double>> goods; // the Record's order
	bool has_item = false;
	std::string def, rarity;
};
// warlordLoot(w, what, depth, seed); what: "holding" | "lord"
WarlordLoot warlord_loot(const WarlordDef &w, const std::string &what, double depth, const std::string &seed);

// What the director reads of a RegionData.
struct WarlordsRegion {
	DepthRegion depth;
	double w = 0, h = 0;
	struct Entry {
		std::string side;
		double x = 0, y = 0, w = 0, h = 0;
	};
	std::vector<Entry> entries;
	std::vector<std::pair<double, double>> claimPoints;
	std::vector<LairEntry> lairs; // kind, x, y, captain
};

// What the director reads of a Snapshot (src/war/types.ts).
struct WarlordsSnap {
	double tick = 0;
	struct Unit {
		int id = 0, squad = -1;
		double x = 0, y = 0;
		bool dead = false; // state 'dead'
		std::string cls;
	};
	struct Squad {
		bool present = false; // squads[id] is undefined when false
		int id = 0, team = 0;
		std::string owner, order;
		std::vector<int> units;
	};
	struct Building {
		int id = 0, team = 0;
		std::string type, state;
		double x = 0, y = 0;
		bool ruin = false;
		bool has_goods = false;
		std::vector<std::pair<std::string, double>> goods;
	};
	struct Siege {
		int id = 0, team = 0;
		std::string type, state;
		double x = 0, y = 0;
	};
	std::vector<Unit> units; // id order
	std::vector<Squad> squads; // indexed by id
	bool has_buildings = false, has_sieges = false, has_claims = false;
	std::vector<Building> buildings;
	std::vector<Siege> sieges;
	std::vector<int> claims; // each claim point's team
};

// The orders the director gives (Order kinds move, load, attackBuilding, merge).
struct WarlordOrder {
	std::string kind;
	int squad = -1;
	double x = 0, y = 0; // move
	std::optional<int> building, siege; // load (from.building), attackBuilding
	int into = -1; // merge
};

// What the director needs of the sim and the bots (the calls the TS makes on WarBuildSim and Bots).
struct WarlordsHost {
	virtual ~WarlordsHost() = default;
	// sim.influence(): its width and mask[t] (0 where the mask has no such tile).
	virtual double influence_w() = 0;
	virtual int influence_at(double t) = 0;
	virtual int spawn_wild(const std::string &owner, const std::string &kind, double count, double x, double y, const SpawnScale &k) = 0;
	virtual void drop_pile(double x, double y, const std::vector<Lot> &lots, const std::vector<Item> &items) = 0;
	virtual void order(const WarlordOrder &o) = 0;
	virtual void drop_squad(int squad) = 0;
	virtual void bot_set(int squad, const Behaviour &b) = 0;
	virtual void bot_clear(int squad) = 0;
};

// WarEvent kind 'warlord'.
struct WarlordNote {
	double t = 0;
	std::string what, warlord, name, text;
	double x = 0, y = 0;
	std::optional<std::string> place;
	std::optional<int> team;
	std::optional<double> in;
};

struct WarlordSnapOut {
	std::string id, name, title, band, kind;
	double tint = 0, scale = 1;
	bool seat = false, fallen = false;
	int lord = -1;
	struct HoldOut {
		std::string place;
		double x = 0, y = 0, men = 0;
		int unit = -1;
		std::string state;
	};
	std::vector<HoldOut> holds;
	bool has_raid = false;
	struct {
		double x = 0, y = 0;
		int team = 0;
		double in = 0;
	} raid;
	bool raiding = false;
};

// A JS Record<string, number>: insertion order, a set keeps a key where it is.
using Record = std::vector<std::pair<std::string, double>>;

struct WarlordMemory {
	Record fallen;
	std::vector<std::pair<std::string, Record>> freed;
};

class Warlords {
public:
	struct Place {
		std::string key;
		double x = 0, y = 0;
		bool lair = false;
	};
	struct Hold {
		std::string place;
		double x = 0, y = 0;
		int squad = -1;
		std::vector<int> extra;
		std::string state; // 'marching' | 'held'
		double since = 0;
		int lt = -1;
		bool hall = false;
		double at = 0;
	};
	struct Raid {
		std::string phase; // 'march' | 'hit' | 'home'
		double x = 0, y = 0;
		std::optional<int> building, siege;
		double until = 0;
		int team = 0;
		bool loot = false;
	};
	struct Party {
		int squad = -1;
		std::string to;
		double at = 0;
		std::optional<Raid> raid;
	};
	struct Warning {
		double x = 0, y = 0;
		int team = 0;
		std::optional<int> building, siege;
		std::string from;
		double at = 0;
		std::string what;
	};
	struct Gone {
		int squad = -1;
		double until = 0;
	};
	// The TS objects are shared by reference (held while iterated over a copy): shared_ptr keeps that.
	struct Lord {
		const WarlordDef *def = nullptr;
		bool seat = false;
		std::pair<double, double> gate;
		std::vector<Place> places;
		std::vector<std::shared_ptr<Hold>> holds;
		std::vector<std::shared_ptr<Party>> parties;
		Record freed;
		std::optional<double> fallen;
		double born = 0;
		int lord = -1;
		bool laid = false;
		double reinforceAt = 0, raidAt = 0;
		std::optional<Warning> warn;
		std::vector<std::shared_ptr<Gone>> gone;
	};

	// createWarlords: null (here: none()) when the region lies in no warlord's domain.
	Warlords(const WarlordsRegion &region, double seed, WarlordsHost &host);
	bool none() const { return lords.empty(); }

	void setAge(double days) { age = days; }
	void setPlayers(double n);
	std::vector<WarlordNote> tick(const WarlordsSnap &s);
	std::vector<WarlordSnapOut> snaps() const;
	void raidNow(double after = 0);
	double men() const { return has_snap ? menAll() : 0; }
	WarlordMemory memory() const;
	void recall(const WarlordMemory &m);
	void fell(const std::string &id, double at);

	std::vector<Lord> lords;

private:
	const WarlordsRegion region;
	double seed;
	WarlordsHost &host;
	double depth;
	const DepthRule &rule;
	double age = 0, players = 0, tick_ = 0;
	Mulberry rng;
	WarlordsSnap snap;
	bool has_snap = false;
	std::unordered_map<int, const WarlordsSnap::Unit *> units; // lookup only
	std::vector<WarlordNote> notes;

	std::string seedStr() const;
	std::pair<double, double> inside(double x, double y) const;
	static bool alive(const WarlordsSnap::Unit *u) { return u && !u->dead; }
	const WarlordsSnap::Unit *unit(int id) const;
	const WarlordsSnap::Squad *squad(int id) const;
	std::vector<int> squadMen(int id) const;
	std::optional<std::pair<double, double>> centre(int id) const;
	bool foesNear(double x, double y, double r, std::optional<int> team = std::nullopt, double n = 1) const;
	double menAll() const;
	double press() const { return std::max(1.0, players); }
	double size(const WarlordDef &w, double since, bool hall = false) const;
	double target(const Lord &l) const;
	int influenced(double x, double y);
	const Place *nextPlace(Lord &l);
	void say(const Lord &l, const std::string &what, const std::string &text, double x, double y, std::optional<std::string> place = std::nullopt,
			std::optional<int> team = std::nullopt, std::optional<double> in = std::nullopt);
	int spawn(Lord &l, double n, double x, double y, const std::string &lead = "");
	void garrison(Lord &l, const Place &p, double since, bool march, std::optional<std::pair<double, double>> from = std::nullopt);
	std::optional<std::pair<double, double>> source(const Lord &l, double x, double y, const std::string *not_ = nullptr) const;
	void free(Lord &l, const std::shared_ptr<Hold> &h);
	void fall(Lord &l, double x, double y);
	std::optional<Warning> raidTarget(const Lord &l) const;
	bool standing(std::optional<int> building, std::optional<int> siege, int team) const;
	double holdMen(const Hold &h) const;
	bool down(const Lord &l) const { return l.fallen.has_value() && age - *l.fallen < data_back(); }
	double data_back() const;
	void withdraw(Lord &l);
	void think(Lord &l);
};

} // namespace sim
