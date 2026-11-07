// The live region war sim (src/war/sim/index.ts createSim and step), ported line for line in the same order of
// operations. So far: the step order, squads and units, the orders, paths, formations, the whole movement path
// (anchors, slots, steering, separation, lanes), combat (targets, blows, shots, missiles, falls: sim_combat.cpp), the
// works (works.h: sites, walls, bridges, nodes, stores, hunger at the stores, town levels), the siege engines, carts and
// tasks (siege.h, sim_siege.cpp), the trade orders and safe zones (sim_trade.cpp), and the civilians and their crafting
// queues (civilians.h, crafting.h, sim_civ.cpp), the wild (mobs, bosses, roam, souls, secrets, the prebuilt towns and the
// landmarks: sim_wild.cpp), the W-53 regroup (sim_regroup.cpp), the players' paths and perks (start.h), a person's bake
// (stats.h) and the event log (sim_events.cpp). Saves (state.ts) and the larder (the room's, P8) are not here.
#pragma once

#include <algorithm>
#include <array>
#include <cstdint>
#include <deque>
#include <functional>
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
#include "depth.h"
#include "formation.h"
#include "grid.h"
#include "holders.h"
#include "js_map.h"
#include "landmarks.h"
#include "mobs.h"
#include "prebuilt.h"
#include "rng.h"
#include "roam.h"
#include "roster.h"
#include "secrets.h"
#include "siege.h"
#include "souls.h"
#include "start.h"
#include "state.h"
#include "stats.h"
#include "town_level.h"
#include "trade.h"
#include "vision.h"
#include "warlords.h"
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
	std::optional<WarPerson> person; // M5b: the soldier record he was spawned from (TS null: a class spawn)
	std::optional<std::vector<std::string>> bossHit; // E3: the guardians he struck since the last endFight
	// saves (state.ts): the keys TS adds to a man after his spawn, in the order they came; and which stats object he
	// shares (TS u.st: one object per class spawn's squad from the warStats cache, a fresh one per person or re-bake)
	enum Key : uint8_t { K_MOB, K_HERBS, K_FLAX, K_DASH, K_DASHAT, K_DASHTGT, K_DASHHIT, K_SLOWUNTIL, K_DOWNAT, K_DOWNQ, K_UPAT, K_BOSSHIT };
	std::vector<uint8_t> keys;
	void key(Key k) {
		if (std::find(keys.begin(), keys.end(), k) == keys.end()) keys.push_back(k);
	}
	int64_t stKey = 0;
};

// A missile in flight (index.ts Missile; classes.h has the Missile kinds): at a man t (nullptr: at a building b or engine e, or a fire arrow that missed).
struct Flight {
	bool aimed = false; // saves: shot at a building or engine (TS b or e), not at a man (fb)
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
	godot::Dictionary src; // saves: the order as its JSON object, in its key order (the host's, or as a bot writes it)
	std::string kind;
	int squad = -1;
	bool has_squad = false;
	double x = 0, y = 0;
	int target = -1;
	std::string shape;
	std::optional<std::vector<int>> units; // a W-53 `units` order: the men gathered for it
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
	// detach (count, unitIds), merge (into), claimSoul (soul), claimRegion (point), man (unit, act)
	std::optional<double> count;
	std::optional<std::vector<int>> unitIds;
	int into = -1, soul = -1, point = -1, unit = -1;
	std::string act;
	// setAccess (owner above: '' undefined), fortify (fort), rebanner (centre), setLiege (owner, to, pct)
	std::optional<std::string> access;
	std::optional<double> share, fee;
	std::string fort;
	int centre = -1;
	std::optional<std::string> to_owner; // setLiege `to` (TS null: nullopt)
	double pct = 0;
	bool has_owner = false; // setAccess: TS owner given
};

struct Lanes {
	int id;
	double ex, ey, nx, ny, cl;
	int w;
};

struct Sim;
struct BossRegion;
class Bosses;
struct SimMobHost;
struct SimBossHost;
struct SimRoamHost;
struct SimPreHost;

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
	SiegeCartFx cartFx(const std::string &owner) override;
};

// The works' view of the sim (the TS createWorks callbacks and hooks).
struct SimWorksHost : WorksHost {
	Sim *s = nullptr;
	std::vector<double> path(int team, double x0, double y0, double x1, double y1) override;
	void evict(const std::vector<int> &tiles) override;
	bool chance(double p) override;
	void fall(const std::vector<int> &tiles) override;
	void spill(double x, double y, const Hold &hold, bool burnt) override;
	void razed(const Building &b, int by) override;
	bool immune(const Building &b) override;
	double douse(const Building &b) override;
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
	// the view's shots (index.ts ShotSnap): nothing in the sim reads them, but they are saved; dropped once landed
	struct Shot {
		double x0, y0, x1, y1, t0, t1, z0, z1;
		int by;
		Missile kind;
		bool fire;
	};
	std::vector<Shot> shots;
	bool early = false; // W-79: depthOf(region) <= EARLY.depth (set in wireWild)
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
	JsSet<int> dresser; // M5h: teams with a Battle Dresser physician on the field (a JS Set: insertion order, saved)
	std::vector<uint8_t> safeMask; // M6d: safe-zone tiles (1 inside a region `safe` rect)
	std::optional<std::vector<uint8_t>> rollable; // W-145: the ground carts roll on, worked out at the first cart
	int nodesAt = -1;
	std::map<int, std::unordered_set<std::string>> teamNodes; // M5h3: engineer nodes by team (only looked up)
	std::map<int, std::vector<Item>> loot; // M6c: items picked up per team since the last report (only looked up)
	// the region's wild (mobs.h), guardians (bosses.h), roaming life (roam.h), souls (souls.h), hidden quests
	// (secrets.h), pre-built towns (prebuilt.h) and landmark (landmarks.h), wired in sim_wild.cpp
	uint32_t seed = 1;
	MobRegion mobRegion;
	std::unique_ptr<SimMobHost> mobHost;
	std::unique_ptr<Mobs> mobs;
	StoryRegion storyRegion;
	std::vector<SecretSquad> secretSquads; // host.squads as secrets reads them, rebuilt on each read
	std::unique_ptr<Secrets> secrets;
	std::unique_ptr<BossRegion> bossRegion;
	std::unique_ptr<SimBossHost> bossHost;
	std::unique_ptr<Bosses> bosses;
	RoamRegion roamRegion;
	std::unique_ptr<SimRoamHost> roamHost;
	std::unique_ptr<Roam> roam;
	std::unique_ptr<WorksPre> worksPre;
	std::unique_ptr<SimPreHost> preHost;
	std::unique_ptr<Towns> towns;
	std::vector<LmPiece> lmPieces; // works.prebuilt() as landmarks reads it, refreshed in place on each read
	std::vector<LmUnit> lmUnits;
	LmSquad lmSquad;
	std::unique_ptr<Landmarks> landmarks;
	std::vector<SoulMan> soulMen;
	std::unique_ptr<Souls> souls;
	// W-60: the gate the server may set (empty: his fighters on this field)
	std::function<SoulGate(const std::string &owner, const std::string &cls)> soulGate;
	std::vector<std::string> slain; // E3: guardians slain since the last endFight
	// W-85, W-101..W-104: each owner's path (setPaths; unset: NO_PATH for everyone; not saved, as TS)
	std::function<PlayerPath(const std::string &owner)> pathOf;
	PlayerPath pathFor(const std::string &owner) const { return pathOf ? pathOf(owner) : NO_PATH; }
	PerkFx fxOf(const std::string &owner) const; // W-84: the perks of an owner at his demigod level
	void perkSites(const std::string &owner, const std::vector<int> &ids); // W-84: sites he placed or upgraded take his perks
	// W-61: the alliance works' bonuses by team (setBonus; a JS Map only looked up: the vision reads it by team)
	struct TeamBonus {
		std::optional<double> repairCost, sight;
		std::vector<std::string> keys; // the host's object's keys, in its order (saved as given)
	};
	JsMap<int, TeamBonus> bonuses;
	void setBonus(int team, const TeamBonus &b);
	// the event log (index.ts `log`): each WarEvent as its JSON object; at most LOG_MAX until events() drains it
	std::vector<godot::Dictionary> evlog;
	void note(const godot::Dictionary &e);
	std::vector<godot::Dictionary> events() { return std::exchange(evlog, {}); }
	// W-68 named souls: the whole person of each soul souls holds as a SoulPerson (by person id, only looked up)
	std::map<std::string, WarPerson> namedSouls;
	bool spawnNamedSoul(const WarPerson &person, double life, const std::optional<std::pair<std::string, double>> &bar);
	// M5e raids: holding buildings reported fallen (a JS Set, only looked up); tick of the last raid reported per building
	std::set<int> fallen;
	std::map<int, int> raidAt; // only looked up
	bool holds(const Building *b) const;
	void raidScan();

	// saves (sim_state.cpp): index.ts saveRoot as a state.ts graph, the encoded save (base: a fresh sim's root, the
	// typed-array diffs' baseline) and importState into this fresh sim (false and why: a save of another region or sim)
	state::Val saveRoot(state::Graph &g);
	std::string save(Sim *fresh);
	bool load(const std::string &text, std::string &why);
	state::Val savePerson(state::Graph &g, const WarPerson &p);
	state::Val saveOrder(state::Graph &g, const Order &o);
	state::Val saveGrid(state::Graph &g, const Grid &gr);
	state::Val saveSouls(state::Graph &g);
	state::Val savePiles(state::Graph &g);
	state::Val saveLandmarks(state::Graph &g);
	state::Val saveSecrets(state::Graph &g);
	state::Val saveTownLv(state::Graph &g);
	state::Val saveSnap(state::Graph &g, const BuildingSnap &b);

	// region: what the works read of the region (works_region_of); meta: the region's JSON (Region.meta)
	Sim(Grid &g, WorksRegion region, const godot::Dictionary &meta, uint32_t seed);
	~Sim();
	// persons: M5b one man per person (TS undefined: nullptr)
	int spawn_squad(const std::string &owner, int team, const std::string &cls, int count, double x, double y, const std::vector<WarPerson> *persons = nullptr);
	void order(const Order &o); // queued; a bot's order gets its JSON object (src) as the TS bot writes it
	// the wild (sim_wild.cpp): spawnMobs, spawnRoam, spawnSoul, hurtBoss, spawnWild, addLair, the wiring of the modules
	void wireWild(const godot::Dictionary &meta); // createMobs .. createTowns
	void wireLandmarks(); // createLandmarks (after works.prebuild)
	void wireSouls(const godot::Dictionary &meta); // createSouls
	void spawnMobs();
	void spawnRoam();
	int spawnSoul(double x, double y, const std::string &cls, double level = 1, const std::string &site = "shrine");
	void hurtBoss(const std::string &id, double dmg, const std::string &owner = "dev", std::optional<int> part = std::nullopt);
	int spawnWild(const std::string &owner, const std::string &kind, double count, double x, double y, const SpawnScale &k);
	void knock(Unit &t, double fx, double fy, double tiles);
	void mobClaim(int team, double x, double y, double r, std::optional<int> from);
	bool guarded() const; // landmarks: a guardian of the region not slain nor away
	void wildTick(); // souls, mobs, roam, secrets, bosses, towns (townLv and landmarks stay in step)
	// the W-53 regroup and the W-63 turns (sim.cpp), in index.ts order
	Squad *detach(Squad &s, const std::vector<Unit *> &picked);
	void join(Squad &s, Squad &t, const std::vector<Unit *> &picked);
	std::vector<Squad *> regroup(Squad &lead, const std::vector<int> &ids);
	void moveMen(Squad &s, Squad &t, const std::vector<Unit *> &picked); // TS move
	bool turnSquad(int id, int team);
	void standDown(const std::vector<int> &ids, int team);
	std::vector<int> rebanner(int centre, int team);
	void capture(int from, int team, double x, double y, double r);
	void manOrder(Squad &s, int id, const std::string &act);
	void setLiege(const std::string &owner, const std::optional<std::string> &to, double pct);
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
	bool atFord(double x, double y) const;
	// u.person?.hero.perks (none: a class spawn)
	static const std::vector<std::string> &perksOf(const Unit &u) {
		static const std::vector<std::string> NONE;
		return u.person ? u.person->hero.perks : NONE;
	}
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
	// what createSim(region, seed) starts from: the grid as built (before the sim's prebuild), the region and the seed
	sim::Grid built;
	Dictionary meta;
	PackedByteArray cells;
	int64_t seed = 0;
	~Sim();

	// exportState: the sim's state as state.ts JSON text (a fresh sim of the same region and seed is the diffs' baseline).
	// importState: a save of this region into this fresh sim (false: it does not fit; the error says why).
	String save();
	bool load(const String &text);

	// grid: region.grid(); meta and cells: Region.meta and Region.cells (what the works read of the region)
	static Ref<Sim> create(const Ref<Grid> &grid, const Dictionary &meta, const PackedByteArray &cells, int64_t seed);
	// persons: M5b, one man per person (src/war/types.ts WarPerson dictionaries; null: a class spawn)
	int spawn_squad(const String &owner, int team, const String &cls, int count, double x, double y, const Variant &persons);
	void order(const Dictionary &o);
	// The host calls (the trace's 'setPaths', 'setBonus', 'spawnNamedSoul' ops): each owner's PlayerPath (null: NO_PATH
	// for all), a team's TeamBonus, a named soul (bar: {owner, ticks} or null).
	void set_paths(const Variant &paths);
	void set_bonus(int team, const Dictionary &b);
	bool spawn_named_soul(const Dictionary &person, double life, const Variant &bar);
	// The event log since the last call (WarEvent dictionaries), drained as events() drains it.
	Array events();
	// The sum of team's fog cells (its teamGrid state), as the host-run digest reads it.
	int64_t fog_sum(int team);
	// The loot piles as the host-run digest reads them: [id, x, y, goods, first items [uid, def, rarity], item count].
	Array piles();
	// The scenario's wild (the trace's 'spawnMobs', 'spawnRoam', 'spawnSoul' and 'hurtBoss' ops).
	void spawn_mobs() { s->spawnMobs(); }
	void spawn_roam() { s->spawnRoam(); }
	int spawn_soul(double x, double y, const String &cls, double level, const String &site);
	void hurt_boss(const String &id, double dmg, const String &owner, const Variant &part);
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
