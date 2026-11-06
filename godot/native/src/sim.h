// The live region war sim (src/war/sim/index.ts createSim and step), ported line for line in the same order of
// operations. So far: the step order, squads and units, the orders, paths, formations, the whole movement path
// (anchors, slots, steering, separation, lanes), combat (targets, blows, shots, missiles, falls: sim_combat.cpp), the
// works (works.h: sites, walls, bridges, nodes, stores, hunger at the stores, town levels), the siege engines, carts and
// tasks (siege.h, sim_siege.cpp), the trade orders and safe zones (sim_trade.cpp), and the civilians and their crafting
// queues (civilians.h, crafting.h, sim_civ.cpp). Subsystems not wired yet (mobs, bosses, roam, souls...) are stubbed as
// their empty-map behaviour, each marked `// stub until <module> port`.
#pragma once

#include <algorithm>
#include <array>
#include <cstdint>
#include <deque>
#include <limits>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <unordered_set>
#include <vector>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/packed_byte_array.hpp>

#include "bots.h"
#include "civilians.h"
#include "classes.h"
#include "crafting.h"
#include "formation.h"
#include "grid.h"
#include "holders.h"
#include "rng.h"
#include "siege.h"
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
	// M5f civilians (civilians.h): his job ("" a soldier), seconds of work towards his next batch, at work at his
	// building since the last civilian tick; repaired: a smith mended his gear (reported by endFight)
	std::string civ;
	double civT = 0;
	bool civAt = false;
	bool repaired = false;
	// M6: combat tag (no safe-zone entry) until this tick; ticks inside a safe zone
	double tag = 0;
	double safeT = 0;
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

// A task order (M2c, index.ts Task): the target building b or engine e (-1 none).
struct Task {
	std::string kind; // 'ignite' | 'extinguish' | 'pushLadder' | 'attackBuilding' | 'buildSiege'
	int b = -1, e = -1;
};

// src/war/types.ts HolderRef: one of a building, a cart or a pile.
struct HolderRef {
	std::optional<int> building, cart, pile;
};

// M6 load / unload under way (index.ts Xfer): the holder, which way, the good and how many goods are still wanted.
struct Xfer {
	HolderRef ref;
	std::string dir; // 'load' | 'unload'
	std::optional<std::string> res;
	double n = 0;
	bool send = false;
};

// M6c: a pile item a smith breaks up (index.ts Squad.salv).
struct Salv {
	int pile = 0;
	std::string uid;
	double t = 0;
};

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
	std::optional<Task> task; // a task order (TS null: nullopt)
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
	std::string dish; // M5h: the last dish eaten ("" null)
	double theriacUntil = -1;
	std::string act; // M5c squad active ("" none: class spawns hold none)
	int bandages = 0;
	std::optional<Xfer> xfer; // M6: a load / unload under way (TS null: nullopt)
	int escort = -1;
	bool laden = false;
	std::optional<Salv> salv;
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
	std::optional<int> siege; // crew, attackBuilding / ignite at an engine
	int ladder = -1; // pushLadder
	bool pack = false; // deploy
	std::array<int, 2> wallTile{ 0, 0 }; // raiseLadder
	HolderRef from, to; // load, unload
	std::optional<std::string> res; // load, unload
	std::optional<double> n; // load
	bool send = false; // load
	int pile = -1; // salvagePile
	std::string uid; // salvagePile
	// crafting (CraftOrder): the recipe, the order to cancel, an item's owner and the item; by: who queues a craft
	std::string recipe;
	int craftOrder = 0;
	std::string owner;
	std::optional<std::string> by;
	Item item;
};

struct Lanes {
	int id;
	double ex, ey, nx, ny, cl;
	int w;
};

struct Sim;

// A holder as the trade orders see it (index.ts HolderAt).
struct HolderAt {
	Hold *hold = nullptr;
	double x = 0, y = 0;
	std::string kind; // 'store' | 'chest' | 'cart' | 'pile'
	int team = 0;
	std::string owner;
	double cap = 0;
	int id = 0;
};

// The siege's view of the sim (the TS createSiege hooks, sim_siege.cpp).
struct SimSiegeHost : SiegeHost {
	Sim *s = nullptr;
	std::vector<double> path(int team, double x0, double y0, double x1, double y1) override;
	int crewNear(int crew, double x, double y, double r) override;
	void splash(double x, double y, double r, double dmg, double ap) override;
	bool open(double x, double y) override;
	bool walkable(double x0, double y0, double x1, double y1) override;
	double cost(double x, double y) override;
	bool hasNode(int team, const std::string &node) override;
	std::optional<std::array<double, 2>> foe(int team, double x, double y, double r) override;
	void pierce(int team, double x0, double y0, double x1, double y1, double w, double dmg, double ap, double n) override;
	bool stoneTower(int team, double x, double y) override;
	std::optional<std::vector<double>> cartPath(int team, double x0, double y0, double x1, double y1) override;
	std::optional<double> cartCost(double x, double y, double dx, double dy) override;
	bool crewHit(int crew) override;
	bool foeNear(int team, double x, double y, double r) override;
	std::optional<std::pair<int, std::string>> taker(const SiegeEngine &e) override;
	void captured(const SiegeEngine &e, const std::string &by) override;
	void wreck(const SiegeEngine &e, bool burnt) override;
	bool crewNode(int crew, const std::string &node) override;
	// cartFx: stub until the paths port (NO_PATH: no perks), the SiegeHost default
};

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
	bool anySafe = false; // M6d: the region has safe rects
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
	SimSiegeHost siegeHost;
	std::unique_ptr<Siege> siege;
	std::unique_ptr<Crafting> crafting;
	std::vector<Unit *> civs; // M5f: the civilians (all ever spawned, in id order)
	std::set<int> dresser; // M5h: teams with a Battle Dresser physician on the field (a JS Set, only looked up)
	std::vector<uint8_t> safeMask; // M6d: safe-zone tiles (1 inside a region `safe` rect)
	std::optional<std::vector<uint8_t>> rollable; // W-145: the ground carts roll on, worked out at the first cart
	int nodesAt = -1;
	std::map<int, std::unordered_set<std::string>> teamNodes; // M5h3: engineer nodes by team (only looked up)
	std::map<int, std::vector<Item>> loot; // M6c: items picked up per team since the last report (only looked up)

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
	bool safeBuilding(int id) const;
	void hides(Unit &t);
	void objective(Squad &s, const char *what);
	void hitBuilding(Squad &s, int b, double dmg);
	Unit *pickTarget(Unit &u, bool attacking, Squad *foe);
	double blockOf(Unit &u, Unit &t) const;
	double dmgMult(Unit &u, Unit &t, bool missile = false) const;
	void strike(Unit &u, Unit &t, double dh);
	void shoot(Unit &u, Unit &t, double d, double dh, double range);
	void land();
	void burst(Unit &u, Unit &t, double gap);
	bool physicianNear(Unit &t) const { return physician_near(civs, t); }
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
	// W-35: why the squad's fire arrows are out ("noBrazier" | "noPitch"; "" none), as the snapshot's fireArrows.reason gives it
	// (no fireArrows, "", for a squad whose first man shoots no arrows)
	std::string fireBlock(Squad &s);
	void shootAt(Unit &u, double tx, double ty, double d, double dh, double range, const Task &k);
	double cover(Unit &t, Unit &by) const;
	// siege (sim_siege.cpp), in index.ts order
	const std::unordered_set<std::string> &engineerNodes(int team);
	bool placeable(const std::string &type, std::optional<int> team);
	void uncrew(Squad &s);
	bool taskLive(const Task &k);
	int ladderTop(int id) const;
	void taskPoints(Squad &s);
	Unit *taskAct(Unit &u);
	void siegeSquads();
	int spawnCart(int team, const std::string &owner, const std::string &type, double x, double y, std::optional<int> crew = std::nullopt);
	// trade (sim_trade.cpp), in index.ts order
	bool inSafe(double x, double y) const;
	std::optional<HolderAt> holderAt(const HolderRef &ref);
	bool byHolder(const HolderAt &h, double x, double y, double r) const;
	bool mayTake(Squad &s, const HolderAt &h);
	bool mayOpen(Squad &s, const HolderAt &h);
	bool mayPut(Squad &s, const HolderAt &h);
	bool owedHere(Squad &s, const HolderAt &h);
	bool bringsTithe(Squad &s, const HolderAt &h);
	std::optional<Draw> drawOf(Squad &s, const HolderAt &h, const Xfer &x);
	std::optional<Draw> putOf(Squad &s, const HolderAt &h);
	std::vector<Hold *> takeHolds(Squad &s, const HolderAt &h);
	int crewCart(Squad &s);
	void tradeOrder(Squad &s, const Order &o);
	bool lockedTo(Squad &s, const HolderAt &h, std::optional<int> id);
	void salvTick(Squad &s);
	void escortTick(Squad &s);
	void safeTick();
	void walkSquadOut(Squad &s);
	bool safeEntry(Unit &u);
	// civilians (sim_civ.cpp), in index.ts order
	double civRoom(int team);
	bool safeAt(int team, double x, double y);
	void flee(Squad &s, double fx, double fy);
	void civScan();
	bool civJobDone(Unit &u, int team, double bx, double by);
	Crafter crafter(Unit &u) const;
	void eat(Squad &s, const std::string &d, bool longer);
	void civTick();
	Placed placed(const Building &b) const;
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
	// A scenario's cart (the trace's 'spawnCart' op: run.ts spawnCart), empty and idle; its id.
	int spawn_cart(int team, const String &owner, const String &type, double x, double y);
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
