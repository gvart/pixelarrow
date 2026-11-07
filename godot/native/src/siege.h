// Siege engines of the war sim (src/war/sim/siege.ts), line for line: rams, stone throwers, siege ladders, the M5h3
// engineer designs (mantlet, covered ram, oxybeles, siege tower) and the M6b carts (handcart, wagon): building, crews,
// rolling along paths, battering, deploying and shooting, raising ladders and docking towers, fire, cover, cargo,
// halts and captures. SIEGE, CART_ARMOR, RAM, THROWER, LADDER, MANTLET, COVERED, OXY, TOWER and NODE come from the
// exported table src/war/sim/siege (SimData.load "siege"); the unexported constants are code, as in the TS. The sim
// drives it through SiegeHost (the TS SiegeHooks). Save and restore (saveRoot/loadRoot, ./state.ts) wait for the state
// port.
#pragma once

#include <array>
#include <map>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

#include "state.h"
#include "holders.h"
#include "rng.h"

namespace sim {

class Works;

struct SiegeDef {
	double hp = 0;
	Cost cost;
	double labour = 0, crew = 0, speed = 0;
	std::string node; // "" none (M5h3: the engineer node a team needs to build it)
};

struct SiegeTables {
	std::map<std::string, SiegeDef> SIEGE; // looked up by type only
	std::map<std::string, double> CART_ARMOR; // looked up by type only
	struct { double reach, ticks, dmg, stone, cover; } RAM{};
	struct { double min, range, reload, deploy, dmg, speed, acc, scatter, splash, splashDmg; } THROWER{};
	struct { double raise, pushed, fall; } LADDER{};
	struct { double cover, r, side; } MANTLET{};
	struct { double cover, fire; } COVERED{};
	struct { double range, min, reload, dmg, ap, pierce, width, speed, past; } OXY{};
	struct { double dock; } TOWER{};
	struct { double sapper, archimedes; } NODE{};
};
void load_siege(const godot::Dictionary &t, SiegeTables &out);

inline bool is_cart_type(const std::string &t) { return t == "handcart" || t == "wagon"; }

// The TS Engine. Strings stand for the TS string unions; "" is null where the TS has null.
struct SiegeEngine {
	int id = 0;
	std::string type;
	const SiegeDef *def = nullptr;
	int team = 0;
	double x = 0, y = 0, facing = 0, hp = 0, maxHp = 0;
	std::string state; // SiegeState
	double labour = 0;
	int crew = -1;
	std::string mode; // 'none' | 'move' | 'attack' | 'raise' | 'deploy' | 'pack'
	std::optional<std::array<double, 2>> goal;
	std::vector<double> path;
	int pi = 0;
	int target = -1;
	std::optional<std::array<int, 2>> wall;
	int ladder = -1;
	double cd = 0;
	int swingAt = -1;
	double prog = 0, burn = 0, kindle = 0;
	bool tower = false; // M5h3: built on its team's stone tower platform
	// M6b carts: the owning player, cargo, halted (a foe near) until this tick, capture progress (ticks) by team capT / owner capO.
	std::string owner;
	std::optional<Hold> hold;
	double halt = 0, cap = 0;
	int capT = -1;
	std::string capO;
	std::string stop; // W-216 why it is not rolling ("" null); lag: ticks its crew has lagged
	double lag = 0;
	bool stowed = false; // W-217
};

// The TS ShotSnap of a boulder or a bolt (z0, z1 are 0; fire never set).
struct SiegeShot {
	double x0, y0, x1, y1, t0, t1, z0, z1;
	int by;
	std::string kind;
	int siege;
};

struct SiegeSnap {
	int id = 0;
	std::string type;
	int team = 0;
	double x = 0, y = 0, facing = 0, hp = 0, maxHp = 0;
	std::string state;
	double progress = 0;
	int crew = -1;
	double crewNeed = 0;
	int crewHere = 0;
	std::optional<double> reload, swing;
	std::optional<int> target;
	std::optional<double> burning;
	std::optional<int> ladder;
	std::optional<std::string> stopped;
	// carts
	bool cart = false;
	std::string owner;
	Cost cargo;
	int items = 0;
	std::optional<std::vector<HoldItem>> list;
	double loads = 0, cap = 0;
	bool halted = false;
	std::optional<double> capture;
};

// W-84: what the cart owner's perks add (PerkFx, src/data/warPerks.ts): the three a cart reads.
struct SiegeCartFx {
	double cartLoads = 0, cartSpeed = 0, cartHp = 0;
};

// What the siege needs of the sim (the TS SiegeHooks). The optional TS hooks default to what the TS does without them.
struct SiegeHost {
	virtual ~SiegeHost() = default;
	virtual std::vector<double> path(int team, double x0, double y0, double x1, double y1) = 0;
	// Crew men of squad `crew` within r of (x,y).
	virtual int crewNear(int crew, double x, double y, double r) = 0;
	// Men within r of (x,y) take a blow of dmg (armour pierce ap).
	virtual void splash(double x, double y, double r, double dmg, double ap) = 0;
	virtual bool open(double x, double y) = 0;
	// A man walks straight from one point to the other: no cliff, wall or water between.
	virtual bool walkable(double x0, double y0, double x1, double y1) = 0;
	// Move cost of the tile at (x,y) (1 grass).
	virtual double cost(double x, double y) = 0;
	// M5h3: the team's living engineers hold this node (the TS nodes(team).has(node)).
	virtual bool hasNode(int team, const std::string &node) = 0;
	// The nearest foe man of `team` in its sight within r of (x,y), or nullopt.
	virtual std::optional<std::array<double, 2>> foe(int team, double x, double y, double r) = 0;
	// A bolt of `team` from (x0,y0) to (x1,y1): up to n foe men within w of the line, nearest first, take dmg (pierce ap).
	virtual void pierce(int team, double x0, double y0, double x1, double y1, double w, double dmg, double ap, double n) = 0;
	// (x,y) is on a stone tower platform of `team`.
	virtual bool stoneTower(int team, double x, double y) = 0;
	// M6b: a cart's path and its pace multiplier stepping from (x,y) along (dx,dy) (0: closed); nullopt: no such hook.
	virtual std::optional<std::vector<double>> cartPath(int team, double x0, double y0, double x1, double y1) { return std::nullopt; }
	virtual std::optional<double> cartCost(double x, double y, double dx, double dy) { return std::nullopt; }
	// M6b: a living foe of `team` (not fauna) within r of (x,y).
	virtual bool foeNear(int team, double x, double y, double r) { return false; }
	// W-218: a man of this crew struck or was struck lately.
	virtual bool crewHit(int crew) { return false; }
	// M6b: who would take cart e now: the team and owner of a foe unit beside it with none of e's team within guard.
	virtual std::optional<std::pair<int, std::string>> taker(const SiegeEngine &e) { return std::nullopt; }
	// M6b: cart e changed hands; e wrecked or burnt (its cargo to a pile).
	virtual void captured(const SiegeEngine &e, const std::string &by) {}
	virtual void wreck(const SiegeEngine &e, bool burnt) {}
	// M6b: the crew of e holds this merchant node (Pack Mules).
	virtual bool crewNode(int crew, const std::string &node) { return false; }
	// W-84: what the cart owner's perks add.
	virtual SiegeCartFx cartFx(const std::string &owner) { return {}; }
};

class Siege {
public:
	// saves (state.ts): the TS saveRoot as a graph, and the loadRoot of one (into a fresh sim)
	state::Val save(state::Graph &g) const;
	void load(const state::Obj &o);
	Siege(Works &works, Mulberry &rng, SiegeHost &hooks);

	// A new engine of `team` at (x,y), its cost paid; its id, or -1 (no stock, no ground).
	int build(int team, const std::string &type, double x, double y);
	// M6b: a finished cart of `owner` (team `team`) at (x,y), empty and idle; its id.
	int cart(int team, const std::string &owner, const std::string &type, double x, double y);
	// M6b: living carts (of `owner`, or of team `team`).
	int carts(const std::optional<std::string> &owner, std::optional<int> team) const;
	bool is_cart(int id) const { return id >= 0 && id < int(engines.size()) && cart_(engines[id]); }
	double cart_cap(int id) { return id >= 0 && id < int(engines.size()) ? cartCap(engines[id]) : 0; }
	bool labour(int id, double dt);
	const SiegeEngine *get(int id) const { return id >= 0 && id < int(engines.size()) ? &engines[id] : nullptr; }
	// get, as the TS callers hold it: the engine itself (the sim moves goods in and out of a cart's hold)
	SiegeEngine *get(int id) { return id >= 0 && id < int(engines.size()) ? &engines[id] : nullptr; }
	// M6h (server): cart id leaves the field for a world transit (no wreck, no pile); its type and cargo.
	std::optional<std::pair<std::string, Hold>> stow(int id);
	// W-153: the holds of `owner`'s carts.
	std::vector<Hold *> cart_holds(const std::string &owner);
	// M6i (server): a capture between linked accounts is undone: the cart is `owner`'s (team `team`) again.
	void set_owner(int id, int team, const std::string &owner);
	bool alive(int id) const { return alive_(get(id)); }
	bool built(int id) const { return built_(get(id)); }
	bool crew(int id, int crew, int team);
	void uncrew(int id);
	void move(int id, double x, double y);
	void hold(int id);
	bool attack(int id, int building);
	void deploy(int id, bool packUp);
	bool raise(int id, double x, double y);
	bool busy(int id);
	bool kindle(int id, double dt);
	double fire_k(int id) const { return id >= 0 && id < int(engines.size()) ? fireK(engines[id]) : 1; }
	double roof(int id, double x, double y, double r) const;
	double cover(int team, double x, double y, double sx, double sy) const;
	bool douse(int id, double dt);
	void damage(int id, double dmg) {
		if (id >= 0 && id < int(engines.size())) damage_(engines[id], dmg);
	}
	std::vector<double> crew_points(int id, int n);
	void tick(int tick);
	const std::vector<SiegeShot> &shots() const { return shots_; }
	std::vector<SiegeSnap> snaps(int tick);
	const std::vector<SiegeEngine> &all() const { return engines; }

private:
	struct Boulder {
		double at, x, y;
		int target;
		bool hit;
		double dmg;
	};
	struct Bolt {
		double at;
		int team;
		double x0, y0, x1, y1, dmg;
	};

	Works &works;
	Mulberry &rng;
	SiegeHost &hooks;
	std::vector<SiegeEngine> engines;
	std::vector<Boulder> boulders;
	std::vector<Bolt> bolts;
	std::vector<SiegeShot> shots_;
	int pathsLeft = 0;
	int mantlets = 0; // M5h3: mantlets built (cover() skips the scan without one)
	int tickNow = 0;

	static bool alive_(const SiegeEngine *e) { return e && e->state != "destroyed"; }
	static bool cart_(const SiegeEngine &e) { return e.hold.has_value(); }
	static bool built_(const SiegeEngine *e) { return alive_(e) && e->state != "building"; }
	double cartCap(const SiegeEngine &e);
	int crewHere(const SiegeEngine &e);
	bool has(int team, const std::string &node) const { return hooks.hasNode(team, node); }
	double need(const SiegeEngine &e) const;
	double dmgK(const SiegeEngine &e) const;
	double rangeK(const SiegeEngine &e) const;
	static bool isRam(const SiegeEngine &e) { return e.type == "ram" || e.type == "coveredRam"; }
	double fireK(const SiegeEngine &e) const;
	bool targetOk(const SiegeEngine &e) const;
	void damage_(SiegeEngine &e, double dmg);
	void goTo(SiegeEngine &e, double x, double y);
	bool roll(SiegeEngine &e, int n);
	void settle(SiegeEngine &e);
	void ram(SiegeEngine &e, int n, int tick);
	void thrower(SiegeEngine &e, int n, int tick);
	void deploy_(SiegeEngine &e, int n);
	void pack(SiegeEngine &e, int n);
	void ladder(SiegeEngine &e, int n);
	void bolt(SiegeEngine &e, int n, int tick);
};

} // namespace sim
