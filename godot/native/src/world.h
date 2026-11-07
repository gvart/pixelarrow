// The strategic world (docs/impl/godot-port.md P11): server/src/war/world/world.ts World line for line, with what it uses of
// src/war/world: graph.ts (worldRegion, adjacent, edge), events.ts (seasonSeed, seasonEvents, activeEvents, nextEvent)
// and season.ts (through season_clock.h: scoreRate, allianceRates, hegemon). Free of rooms: the region rooms come in as
// WorldPorts (local_world.h wires LocalRooms in, as worldDO.ts wires WarRegionDOs).
//
// The state is kept as the TS keeps it: plain objects and arrays (Dictionaries and Arrays, shared by reference as JS
// objects are), keys in the TS insertion order, so the world state, the map snapshot and their JSON are the TS ones by
// construction (WorldState, RegionState, Transit, Haul, SeasonState; src/war/net/world.ts WorldSnapshot). The TS
// `transfer` and `due` are async only for their ports; here the ports answer at once, in the same order.
// Tables (regions, ALLIANCES, WAR_SEASON, EVENTS, RUSH, SIEGE, EVENT_REGIONS, PATH_IDS) come through SimData.
#pragma once

#include <map>
#include <optional>
#include <string>
#include <tuple>
#include <vector>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/variant.hpp>

namespace sim {

struct WorldTables {
	struct Region {
		std::string id, name, role;
		int alliance = -1; // null: -1
		double x = 0, y = 0;
		std::vector<std::string> adj;
	};
	std::vector<Region> WORLD_REGIONS; // table order
	double EDGE_MS_PER_UNIT = 40000;
	std::vector<std::string> HOMES; // ALLIANCES[i].home
	struct Season {
		double id = 1, travelScale = 1, offExitMsPerTile = 1500, foeRadius = 20, lengthMs = 28.0 * 24 * 3600000;
		std::string name;
	} WAR_SEASON;
	struct {
		double every = 0, jitter = 0, minMs = 0, maxMs = 0, first = 0;
	} EVENTS;
	double RUSH_perLoad = 1, RUSH_cap = 20, SIEGE_capture = 20, SIEGE_held = 10;
	std::vector<std::string> EVENT_KINDS;
	std::map<std::string, std::vector<std::string>> EVENT_REGIONS; // by kind (lookup only)
	std::vector<std::string> PATH_IDS;
	double CARGO_wagon = 1.5, CARGO_porter = 1.2, RETRY_MS = 5000, HAUL_RETRY_MS = 30000; // world.ts (no data table)
};
// tables["src/war/world/regions"], ["…/graph"], ["…/alliances"], ["…/events"], ["…/start"] (absent: left as is)
void load_world_tables(const godot::Dictionary &tables, WorldTables &out);

// graph.ts
const WorldTables::Region *graph_region(const std::string &id);
bool adjacent(const std::string &a, const std::string &b);
struct WorldEdge {
	std::string sideA, sideB;
	double ms = 0;
};
std::optional<WorldEdge> world_edge(const std::string &a, const std::string &b);

// events.ts: a WorldEvent is {id, kind, region, startAt, endAt}
double season_seed(double id, double startAt);
godot::Array season_events(double seed, double startAt, double endAt);
godot::Array active_events(const godot::Array &list, double now);
godot::Variant next_event(const godot::Array &list, double now); // nil: none

// world.ts cargoLoads, cargoFactor (TransitCargo {packs: {id: Bundle}, carts?: [{type, lots, items}]})
double cargo_loads(const godot::Variant &cargo);
double cargo_factor(const godot::Variant &cargo);

// world.ts Ports: the region rooms as the world reaches them. depart: DepartResult ({ids, off, lost?, cargo?} or
// {error, detail?}); arrive: ArriveResult ({ok: true} or {error}); lost and cargo nil when absent.
struct WorldPorts {
	virtual ~WorldPorts() = default;
	virtual godot::Dictionary depart(const std::string &from, int pid, const std::string &side, const std::string &to, double foeRadius) = 0;
	virtual godot::Dictionary arrive(const std::string &to, int pid, int alliance, const godot::Array &ids, const std::string &side, const godot::Variant &lost, const godot::Variant &cargo) = 0;
	virtual bool online(int pid) = 0;
};

godot::Dictionary fresh_season(double id, double now, const WorldTables::Season &cfg);
godot::Dictionary fresh_world(double now, const WorldTables::Season &cfg);
godot::Dictionary snap_of(const godot::Dictionary &t); // world.ts snapOf

class World {
public:
	godot::Dictionary st; // WorldState
	WorldTables::Season season;

	World(const godot::Dictionary &st, const WorldTables::Season &season);

	double seasonEndsAt() const;
	godot::Variant advance(double now); // the SeasonResult when it ended on this call, else nil
	void newSeason(double now);
	godot::Array events();
	godot::Array activeEvents(double now);
	godot::Variant nextEvent(double now);
	godot::Variant nextEventAt();
	struct EventTick {
		godot::Array started, ended;
		bool changed = false;
	};
	EventTick eventTick(double now);
	void eventScore(int a, double pts, double now);
	godot::Variant region(const std::string &id) const;
	struct Reported {
		bool rejected = false, changed = false;
		godot::Variant ended; // nil: none
	};
	Reported report(const std::string &id, const godot::Dictionary &rep, double now);
	void sacrilege(int a, double now);
	void setTravel(int a, double k);
	// a Transit, or {error, detail?}; alliance -1: none (null)
	godot::Dictionary transfer(int pid, int alliance, const godot::Dictionary &o, double now, WorldPorts &ports, bool safe = false);
	bool wake(int pid, double now);
	bool due(double now, WorldPorts &ports);
	godot::Variant nextDue();
	godot::Variant nextAlarm();
	godot::Array personsInTransit() const;
	// members and clans per alliance (worldDO.ts allianceCounts)
	godot::Dictionary snapshot(int pid, int alliance, const std::vector<double> &members, const std::vector<double> &clans, double now);
	godot::Array convoys(int pid, int alliance);
	godot::Dictionary seasonSnap(double now);

private:
	std::optional<std::tuple<double, double, double>> schedKey;
	godot::Array sched;
	void checkHegemony(double now);
	godot::Variant eventIn(const std::string &region, const std::string &kind, double now);
};

} // namespace sim
