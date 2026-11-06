// The live region war sim (src/war/sim/index.ts createSim and step), ported line for line in the same order of
// operations. So far: the step order, squads and units, the orders, paths, formations, the whole movement path
// (anchors, slots, steering, separation, lanes), combat (targets, blows, shots, missiles, falls: sim_combat.cpp) and the
// works (works.h: sites, walls, bridges, nodes, stores, hunger at the stores, town levels). Subsystems still in TS (siege,
// mobs, bosses, roam, civilians...) are stubbed as their empty-map behaviour, each marked `// stub until <module> port`.
#pragma once

#include <algorithm>
#include <array>
#include <cstdint>
#include <deque>
#include <limits>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/packed_byte_array.hpp>

#include "bots.h"
#include "classes.h"
#include "formation.h"
#include "grid.h"
#include "holders.h"
#include "rng.h"
#include "town_level.h"
#include "trade.h"
#include "vision.h"
#include "works.h"

namespace sim {

struct Squad;

// A man of the sim: a works Worker (id, x, y, facing, alive, his job, load and work goal) and the rest of index.ts Unit.
// `squad` shadows Worker::squad (the same squad, as the works see it); both are set together.
struct Unit : Worker {
	Squad *squad = nullptr;
	int slot = 0;
	double hp = 0, maxHp = 0;
	std::string cls;
	WarStats st;
	bool moving = false;
	int wp = 0;
	bool wounded = false, fighting = false, striking = false;
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
	double dashAt = 0; // TS undefined: 0
	int dashTgt = -1; // TS undefined: -1
	bool dashHit = false;
	// M5d tallies since the last endFight
	double dealt = 0, kills = 0, obj = 0;
	bool engaged = false, reported = false;
	// M5h: venom until this tick, his blows bite, a beast, a physician's field radius
	double venomUntil = -1;
	bool venom = false, beast = false;
	double fieldR = 0;
	int boss = -1; // M7d: the guardian run it belongs to (-1 none)
	// W-79 early mercy: knocked down at this tick, quiet ticks since, the tick he last got up (nullopt: TS undefined)
	std::optional<int> downAt, upAt;
	std::optional<double> downQ;
	std::optional<Hold> pack; // M6/W-60: what he carries (TS null: nullopt)
};

// A missile in flight (index.ts Missile; classes.h has the Missile kinds): at a man t (nullptr: at a building b or engine e, or a fire arrow that missed).
struct Flight {
	int at = 0;
	Unit *by = nullptr;
	Unit *t = nullptr;
	double raw = 0, ap = 0;
	int b = -1, e = -1, fb = -1; // -1: TS undefined
};

struct Order;

// A squad: a works WorkSquad (team, owner, the sites of its build order, the node of its gather order) and the rest of
// index.ts Squad.
struct Squad : WorkSquad {
	int id = 0;
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
	std::shared_ptr<Order> resume; // the order it takes up again (TS null: none)
	int cartDrop = -1, atEase = 0, work = -1;
	double fedUntil = -1;
	double fedInn = 1, fedMelee = 0, fedMissile = 0, fedAcc = 0, fedHeal = 1;
	double theriacUntil = -1;
	std::string act; // M5c squad active ("" none: class spawns hold none)
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

// An index.ts Order: the fields of the kinds ported (TS undefined: -1, nullopt or empty).
struct Order {
	std::string kind;
	int squad = -1;
	bool has_squad = false;
	double x = 0, y = 0;
	int target = -1;
	std::string shape;
	bool units = false; // a W-53 `units` order (regroup: not ported yet)
	std::optional<int> team;
	std::string type; // placeBuilding
	int rot = 0;
	WallOrder wall; // placeWall (material, points, towers, gates, inside)
	BridgeOrder bridge; // placeBridge (material, points, width)
	int site = -1, node = -1, building = -1;
	std::optional<int> cart;
	bool on = false; // fireArrows
};

struct Lanes {
	int id;
	double ex, ey, nx, ny, cl;
	int w;
};

struct Sim;

// The works' view of the sim (the TS createWorks callbacks and hooks).
struct SimWorksHost : WorksHost {
	Sim *s = nullptr;
	std::vector<double> path(int team, double x0, double y0, double x1, double y1) override;
	void evict(const std::vector<int> &tiles) override;
	bool chance(double p) override;
	void fall(const std::vector<int> &tiles) override;
	void spill(double x, double y, const Hold &hold, bool burnt) override;
	bool immune(const Building &b) override;
	void laboured(Worker &u, const Building &b, double secs) override;
	RepairK repairK(const Building &b) override;
	std::optional<CartDrop> cartDrop(WorkSquad &s) override;
};

struct Sim {
	Grid *grid = nullptr;
	WorksRegion region;
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
	std::vector<Flight> missiles;
	bool early = false; // W-79: stub until the region port (the sim has no region id for depthOf yet): no early mercy
	int downs = 0;
	SimWorksHost worksHost;
	std::unique_ptr<Works> works;
	std::unique_ptr<Piles> piles;
	std::vector<TownPiece> townPieces; // works.all as townLevel reads it, rebuilt on each read
	std::unique_ptr<TownLevels> townLv;
	std::vector<std::pair<std::string, double>> labourLog; // W-61: secs by `${owner}|${site}`, a JS Map: insertion order

	// region: what the works read of the region (works_region_of)
	Sim(Grid &g, WorksRegion region, uint32_t seed);
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
	// fight's answer: TS null (to its slot), a point (px, py) to close on, or the unit itself (stands and fights)
	enum Act { ToSlot, Point, Self };
	Act fight(Unit &u, double &px, double &py);
	// combat (sim_combat.cpp), in index.ts order
	bool working(Unit &u) const { return u.squad->order == "gather" || u.squad->order == "build"; }
	void riseTick();
	void hurt(Unit &t, double dmg, Unit *by = nullptr);
	bool reachable(Unit &u, Unit &t) const;
	bool atFord(double, double) const { return false; } // stub until bosses port: nothing is aloft
	Unit *pickTarget(Unit &u, bool attacking, Squad *foe);
	double blockOf(Unit &u, Unit &t) const;
	double dmgMult(Unit &u, Unit &t, bool missile = false) const;
	void strike(Unit &u, Unit &t, double dh);
	void shoot(Unit &u, Unit &t, double d, double dh, double range);
	void land();
	void burst(Unit &u, Unit &t, double gap);
	bool physicianNear(Unit &) const { return false; } // stub until civilians port: no physicians
	void setRates(Unit &u);
	bool ghost(Unit &a, Unit &b);
	bool meet(Unit &a, Unit &b);
	bool tight(Unit &u) const;
	bool atEase(Unit &u) const;
	bool shoves(Unit &u, Unit &o) const;
	bool passing(Unit &u) const;
	void separate();
	void speedOf(Squad &s);
	void hungerTick();
	bool biteFrom(Unit &u, Hold *h);
	void refill(Unit &u, Hold &pack, const std::vector<Hold *> &from);
	void workScan();
	std::shared_ptr<Order> resumeOf(Squad &s) const;
	void tradeTick();
	void stakes();
	void evict(const std::vector<int> &tiles);
	void dropJobs(Squad &s); // `if (s.order === 'gather' || s.order === 'build') for (const u of s.units) works.setJob(u, null)`
	bool fireShot(Unit &u);
	double fireReach(Unit &u) const;
	// the WarBuildSim calls the scenarios make
	void claim(int team, double x, double y, std::optional<double> r) { works->claim(team, x, y, r); }
	void addStock(int team, const std::string &res, double n) { works->add_stock(team, res, n); }
	void finishBridges(int team) { works->finish_bridges(team); }
	void setSatiety(const std::vector<int> &ids, double sat);
	// src/war/scenarios/run.ts feedSim: food or rations into squad `squad`'s packs (spread over its men), or (-1) the
	// first standing store of `team`
	void feed(int team, int squad, const std::string &res, double n);

	const BridgeLine *bridgeAt(int t) const { return works->bridge_at(t); }
	double platCap(int p) const { return works->plat_cap(p); }
	// stubs of other modules' answers on an empty map
	bool inSafe(double, double) const { return false; } // stub until trade port
	bool calmPair(Squad &s, Squad &o) const;
	double hAt(double x, double y) const { return grid->height[grid->tile_at(x, y)]; }
	int groundAt(double x, double y) const { return grid->ground[grid->tile_at(x, y)]; }
	// reslotQueue.add (a JS Set: a squad once, in insertion order)
	void addReslot(Squad &s) {
		if (std::find(reslotQueue.begin(), reslotQueue.end(), &s) == reslotQueue.end()) reslotQueue.push_back(&s);
	}
};

} // namespace sim

namespace godot {

// GDScript face of sim::Sim: Sim.create(region.grid(), region.meta, region.cells, seed); spawn_squad, order, step, digest. Its bots (bots.ts
// createBots(sim)): set_bot, and bots_tick after each step, as src/war/scenarios/run.ts stepSim.
class Sim : public RefCounted {
	GDCLASS(Sim, RefCounted)

public:
	Ref<Grid> grid;
	sim::Sim *s = nullptr;
	sim::Bots *bots = nullptr;
	~Sim();

	// grid: region.grid(); meta and cells: Region.meta and Region.cells (what the works read of the region)
	static Ref<Sim> create(const Ref<Grid> &grid, const Dictionary &meta, const PackedByteArray &cells, int64_t seed);
	int spawn_squad(const String &owner, int team, const String &cls, int count, double x, double y);
	void order(const Dictionary &o);
	void step();
	// The WarBuildSim calls a scenario's setup makes: claim (r null: CLAIM_RADIUS), addStock, finishBridges, setSatiety.
	void claim(int team, double x, double y, const Variant &r);
	void add_stock(int team, const String &res, double n);
	void finish_bridges(int team);
	void set_satiety(const Array &ids, double sat);
	// A scenario's food (the trace's 'feed' op): squad null puts it in the team's first standing store.
	void feed(int team, const Variant &squad, const String &res, double n);
	// A bot behaviour (bots.ts Behaviour) on squad `squad`; false: a behaviour not ported yet.
	bool set_bot(int squad, const Dictionary &b);
	void bots_tick() { bots->tick(); }
	int get_tick() const { return s->tick; }
	// What src/dev/godotTraces.ts digests of a snapshot, unrounded: tick, units [id, squad, x, y, hp, state, facing],
	// squads [id, team, owner], buildings [id, type, team, state, progress], stock {team: {res: n}}.
	Dictionary digest();

protected:
	static void _bind_methods();
};

} // namespace godot
