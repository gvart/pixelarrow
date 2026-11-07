// Bot AI for war squads (src/war/sim/bots.ts createBots), line for line: the field behaviours (attackMove, hold, flank),
// the siege ones (siegeRam, siegeLadder, siegeArchers, assault, siegeBolts, defendWalls, with the M5h3 engine designs)
// and the trade ones (raider, escort, haul), with the fog of war (W-39: each team thinks on what it sees or saw within
// MEMORY ticks: foe squads, men and engines in sight, foe buildings as last seen). The TS bots read sim.snapshot(); these
// read the same off the sim (Snap: units in id order, the building and engine snaps).
#pragma once

#include <array>
#include <limits>
#include <map>
#include <optional>
#include <string>
#include <vector>

#include "js_map.h"

namespace sim {

struct Sim;
struct Order;

struct Behaviour {
	std::string kind; // 'attackMove' | 'hold' | 'flank' | 'siegeRam' | 'siegeLadder' | 'siegeArchers' | 'assault' | 'siegeBolts' | 'defendWalls' | 'raider' | 'escort' | 'haul'
	double x = 0, y = 0;
	bool has_radius = false;
	double radius = 0; // hold, defendWalls (TS undefined: has_radius false)
	double via[2] = { 0, 0 }; // flank
	std::string engine; // siege: the M5h3 design ("" undefined)
	double w = 0, h = 0; // raider: the ambush rect
	std::optional<double> weak, reach; // raider
	int cart = -1; // escort, haul
	std::vector<std::array<double, 2>> path; // haul
};

struct Bots {
	struct Bot {
		Behaviour b;
		std::string phase, issued;
		int target = -1;
		int engine = -1; // siege: its engine, -1 none yet
		std::optional<std::array<double, 2>> at; // siege: where it ordered its engine built
		bool fire = false;
		double brazier = -std::numeric_limits<double>::infinity();
		int tries = 0;
		bool plain = false;
		int cart = -1;
	};
	struct Centre {
		double x = 0, y = 0;
		int alive = 0, team = 0;
	};
	struct Seen {
		double x, y;
		int at;
	};
	// What the bots read of a BuildingSnap (the live ones and the vision's last seen).
	struct Bld {
		int id = 0, team = 0;
		std::string type, state;
		double x = 0, y = 0;
		std::vector<double> tiles;
		bool rubble = false, burning = false;
		std::optional<int> siege, attach;
		double walk = 0; // TS undefined: 0 (only read as `walk ?? 0`)
	};
	// What they read of a UnitSnap.
	struct Man {
		int id = 0, squad = 0, on = -1; // on: -1 TS undefined
		double x = 0, y = 0;
		bool dead = false;
		std::string cls;
	};
	// What they read of a SiegeSnap.
	struct Eng {
		int id = 0, team = 0, crew = -1;
		std::string type, state;
		double x = 0, y = 0;
		bool burning = false;
	};
	// What they read of a SquadSnap's active (M5c): its skill, ticks till ready, ticks of buff left.
	struct Act {
		std::string skill;
		double ready = 0, on = 0;
	};
	// A snapshot as one team's bots see it.
	struct Snap {
		int tick = 0;
		std::vector<std::optional<Act>> acts; // by squad id (nullopt: no active)
		std::vector<Man> units;
		std::vector<Bld> buildings;
		std::vector<Eng> sieges;
	};
	struct View {
		std::vector<Centre> cs;
		Snap snap;
	};

	Sim *sim = nullptr;
	int every = 5;
	int ticks = 0;
	std::vector<int> order; // the Map's insertion order
	std::map<int, Bot> bots;
	JsMap<int, JsMap<int, Seen>> memo; // team -> foe squad -> last seen (JS Maps: insertion order, saved)

	explicit Bots(Sim *s, int ev = 5) : sim(s), every(ev) {}
	bool set(int squad, const Behaviour &b);
	void clear(int squad);
	void tick();
	// M5e eviction resume (bots.ts exportState / importState): encodeGraph({ bots, ticks, memo }) as its JSON text, and
	// back into these fresh bots (false: a malformed text)
	std::string exportState() const;
	bool importState(const std::string &text);

private:
	std::vector<Centre> centres(const Snap &snap) const;
	Snap snapshot() const;
	View viewOf(const Snap &snap, const std::vector<Centre> &cs, int team);
	void send(Bot &bot, const std::string &key, int squad, const std::string &kind, double x, double y, int target);
	void send(Bot &bot, const std::string &key, const Order &o);
	int nearestEnemy(const std::vector<Centre> &cs, int team, double x, double y, double r) const;
	void useActive(int id, const Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap);
	void attackMove(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, double x, double y);
	const Eng *engineFor(int id, Bot &bot, const Centre &me, const Snap &snap, const std::string &type);
	const Eng *designFor(int id, Bot &bot, const Centre &me, const Snap &snap, const std::string &base, const std::string &want);
	bool rollTo(int id, Bot &bot, const Eng &e, const std::vector<const Bld *> &walls, double dist, double x, double y);
	bool scout(int id, Bot &bot, const Centre &me, const std::vector<Bld> &blds, double x, double y);
	void siegeRam(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap, double x, double y);
	void siegeLadder(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap, double x, double y);
	void brazier(int id, Bot &bot, const Centre &me, const Snap &snap, double tx, double ty);
	void siegeArchers(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap, double x, double y);
	void assault(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap, double x, double y);
	void siegeBolts(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap, double x, double y);
	void defendWalls(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap, double x, double y, double r);
	void holdAt(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, double x, double y, double r);
	int guardsOf(const Snap &snap, const std::vector<Centre> &cs, int team, double x, double y) const;
	bool pull(int id, Bot &bot, const Eng &e, double x, double y, const std::string &key);
	void raider(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap, const Behaviour &b);
	void escort(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap, int cart);
	void haul(int id, Bot &bot, const Centre &me, const Snap &snap, const Behaviour &b);
	void think();
};

} // namespace sim
