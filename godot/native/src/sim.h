// The live region war sim (src/war/sim/index.ts createSim and step), ported line for line in the same order of
// operations. So far: the step order, squads and units, the orders, paths, formations and the whole movement path
// (anchors, slots, steering, separation, lanes). Subsystems still in TS (works, siege, trade, mobs, bosses, civilians,
// combat...) are stubbed as their empty-map behaviour, each marked `// stub until <module> port`.
#pragma once

#include <array>
#include <cstdint>
#include <deque>
#include <limits>
#include <map>
#include <optional>
#include <string>
#include <vector>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>

#include "classes.h"
#include "formation.h"
#include "grid.h"
#include "rng.h"
#include "vision.h"

namespace sim {

struct Squad;

struct Unit {
	int id = 0;
	Squad *squad = nullptr;
	int slot = 0;
	double x = 0, y = 0, facing = 0, hp = 0, maxHp = 0;
	std::string cls;
	WarStats st;
	bool moving = false;
	int wp = 0;
	bool alive = true, wounded = false, fighting = false, striking = false;
	int swingAt = -1;
	double cd = 0, ammo = 0;
	Unit *tgt = nullptr;
	double vx = 0, vy = 0, spd = 0;
	int stuck = 0;
	double wx = 0, wy = 0;
	std::vector<double> own;
	int oi = 0;
	bool ownReq = false, crossing = false, settled = false;
	double settleD = 0, best = 0;
	int stall = 0;
	double ox = 0, oy = 0, want = 0;
	bool toSlot = false;
	const char *doing = nullptr;
	// works.ts Worker: his job ("" none) and at work this tick; wgx/wgy his work goal
	std::string job;
	bool working = false;
	double wgx = -1, wgy = -1;
	// civilians.ts: his job ("" a soldier), at work at his building
	std::string civ;
	bool civAt = false;
	double tag = 0;
	bool pin = false;
	int aloft = 0;
	bool immune = false;
	double sat = 0;
	bool back = false;
	double bx = 0, by = 0;
	std::string mob; // W-67 a beast with a burst ("" none)
	double dash = 0, slowUntil = 0; // TS undefined: 0
};

struct Squad {
	int id = 0;
	std::string owner;
	int team = 0;
	std::vector<Unit *> units;
	int alive = 0;
	Shape shape = Shape::Line;
	std::vector<double> offsets;
	int offv = 0; // bumped whenever offsets is a new array (formSlot's cache compares the array's identity)
	double ax = 0, ay = 0, cx = 0, cy = 0, facing = 0, speed = 1;
	bool ranged = false;
	double side = 0, ramp = 0;
	std::vector<double> path;
	int pi = 0;
	std::string order = "hold";
	int target = -1;
	int repathAt = 0;
	std::optional<std::pair<double, double>> goal;
	std::vector<Squad *> near;
	std::vector<int> sites;
	int node = -1;
	std::optional<std::vector<double>> fixed, col;
	int siege = -1;
	bool task = false; // a task order (stub until siege port: never set)
	bool fire = false;
	int claimPt = -1;
	bool spare = false;
	double actWil = 5, actReady = 0, actUntil = -1, out = 1, inn = 1;
	double amx = 0, amy = 0;
	bool civ = false, flee = false;
	int calm = 0;
	bool resume = false; // the order a squad resumes (stub: workScan and civScan never set one yet)
	int cartDrop = -1, atEase = 0, work = -1;
	double fedUntil = -1;
	int bandages = 0;
	int escort = -1;
	bool laden = false;
	int soul = -1;
	bool meek = false;
	int angry = 0;
	// formSlot's cache (not saved: a pure function of the anchor, facing, side and offsets)
	bool slot_ok = false;
	double c_ax = 0, c_ay = 0, c_f = 0, c_side = 0;
	int c_off = -1;
	std::vector<double> c_pts;
};

struct Order {
	std::string kind;
	int squad = -1;
	bool has_squad = false;
	double x = 0, y = 0;
	int target = -1;
	std::string shape;
	bool units = false; // a W-53 `units` order (regroup: not ported yet)
};

// works.ts bridgeAt: a finished bridge piece's line (stub until works port: none).
struct Bridge {
	double dir[2];
	int id0;
	double rows[2];
	int width;
};

struct Lanes {
	int id;
	double ex, ey, nx, ny, cl;
	int w;
};

struct Sim {
	Grid *grid = nullptr;
	Mulberry rng{ 1 };
	std::vector<Squad *> squads;
	std::vector<Unit *> units;
	std::vector<Order> queue;
	std::deque<Squad *> pathQueue;
	std::deque<Unit *> unitPathQueue;
	std::vector<Squad *> reslotQueue; // a JS Set: insertion order
	int tick = 0;
	bool anySafe = false; // stub until trade port: no safe zones (region.safe) on the move maps
	std::vector<int32_t> head, next;
	std::map<int, int> platLoad; // order never shows
	Vision vision;
	double outX = 0, outY = 0;

	Sim(Grid &g, uint32_t seed);
	~Sim();
	int spawn_squad(const std::string &owner, int team, const std::string &cls, int count, double x, double y);
	void order(const Order &o) { queue.push_back(o); }
	void step();

	// helpers, in index.ts order
	std::pair<double, double> openPoint(double x, double y) const;
	std::pair<double, double> slotPos(Squad &s, int slot);
	std::pair<double, double> formSlot(Squad &s, int slot);
	void layOut(Squad &s, std::vector<double> &pts);
	std::vector<double> cornerPath(double x0, double y0, double x1, double y1);
	bool sees(bool thin, double x0, double y0, double x1, double y1);
	bool fixedTile(int t) const;
	double stepCostOf(int a, int b) const;
	void fitSlots(Squad &s);
	double pathHeading(Squad &s);
	void pathTo(Squad &s, double x, double y);
	void requestPath(Squad &s, double x, double y);
	void reslot(Squad &s);
	void apply(const Order &o);
	void scanNear();
	void updateAttack(Squad &s);
	void updateAttackMove(Squad &s);
	void chase(Squad &s, Squad &t);
	double warRange(Squad &s);
	double moveCost(double x, double y, double ux, double uy) const;
	void faceThreat(Squad &s);
	std::optional<Lanes> laneOf(int t) const;
	std::array<double, 4> alongPath(Squad &s, double d);
	std::optional<std::vector<double>> columnFor(Squad &s);
	void keepToLanes();
	std::pair<double, double> blockSize(Squad &s) const;
	bool eases(Squad &s) const;
	double giveWay(Squad &s);
	void stepSquad(Squad &s);
	void backPoint(Unit &u);
	std::pair<double, double> backTarget(Unit &u);
	std::pair<double, double> unitTarget(Unit &u);
	void countPlatforms();
	double reachIn(int t, double x, double y);
	void tryMove(Unit &u, double dx, double dy);
	bool fight(Unit &u, double &px, double &py);
	bool ghost(Unit &a, Unit &b);
	bool meet(Unit &a, Unit &b);
	bool tight(Unit &u) const;
	bool atEase(Unit &u) const;
	bool shoves(Unit &u, Unit &o) const;
	bool passing(Unit &u) const;
	void separate();
	void speedOf(Squad &s);
	void hungerTick();
	void workScan();

	// stubs of other modules' answers on an empty map
	const Bridge *bridgeAt(int) const { return nullptr; } // stub until works port
	int platCap(int) const { return 0; } // stub until works port
	bool inSafe(double, double) const { return false; } // stub until trade port
	bool calmPair(Squad &s, Squad &o) const;
	double hAt(double x, double y) const { return grid->height[grid->tile_at(x, y)]; }
};

} // namespace sim

namespace godot {

// GDScript face of sim::Sim: Sim.create(region.grid(), seed); spawn_squad, order, step, digest.
class Sim : public RefCounted {
	GDCLASS(Sim, RefCounted)

public:
	Ref<Grid> grid;
	sim::Sim *s = nullptr;
	~Sim();

	static Ref<Sim> create(const Ref<Grid> &grid, int64_t seed);
	int spawn_squad(const String &owner, int team, const String &cls, int count, double x, double y);
	void order(const Dictionary &o);
	void step();
	int get_tick() const { return s->tick; }
	// What src/dev/godotTraces.ts digests of a snapshot, unrounded: tick, units [id, squad, x, y, hp, state, facing], squads [id, team, owner].
	Dictionary digest() const;

protected:
	static void _bind_methods();
};

} // namespace godot
