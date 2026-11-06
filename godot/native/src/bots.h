// Bot AI for war squads (src/war/sim/bots.ts createBots), line for line, so far the field behaviours: attackMove,
// hold and flank, with the fog of war (W-39: each team thinks on what it sees or saw within MEMORY ticks). The TS bots
// read sim.snapshot(); these read the same off the sim (units in id order, x, y, alive, squads' team). The siege, trade
// and engine behaviours wait for the siege and trade ports (set() refuses them).
#pragma once

#include <map>
#include <string>
#include <vector>

namespace sim {

struct Sim;

struct Behaviour {
	std::string kind; // 'attackMove' | 'hold' | 'flank'
	double x = 0, y = 0;
	bool has_radius = false;
	double radius = 0; // hold (TS undefined: has_radius false)
	double via[2] = { 0, 0 }; // flank
};

struct Bots {
	struct Bot {
		Behaviour b;
		std::string phase, issued;
		int target = -1;
	};
	struct Centre {
		double x = 0, y = 0;
		int alive = 0, team = 0;
	};
	struct Seen {
		double x, y;
		int at;
	};

	Sim *sim = nullptr;
	int every = 5;
	int ticks = 0;
	std::vector<int> order; // the Map's insertion order
	std::map<int, Bot> bots;
	std::map<int, std::map<int, Seen>> memo; // team -> foe squad -> last seen (looked up by key only)

	explicit Bots(Sim *s, int ev = 5) : sim(s), every(ev) {}
	// false: a behaviour not ported yet
	bool set(int squad, const Behaviour &b);
	void clear(int squad);
	void tick();

private:
	std::vector<Centre> centres() const;
	std::vector<Centre> viewOf(const std::vector<Centre> &cs, int team);
	void send(Bot &bot, const std::string &key, int squad, const std::string &kind, double x, double y, int target);
	int nearestEnemy(const std::vector<Centre> &cs, int team, double x, double y, double r) const;
	void attackMove(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, double x, double y);
	void holdAt(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, double x, double y, double r);
	void think();
};

} // namespace sim
