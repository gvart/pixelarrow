// Economy and construction state of the war sim (src/war/sim/works.ts), line for line: resource nodes, store
// networks, building sites and their workers, walls, wall-walks, stairs and ladders, fire, siege ladders, bridges,
// pre-built pieces, repairs, demolition, staffing and door locks. FIRE and FORT come from the exported table
// src/war/sim/works (SimData.load "works"); the unexported tuning constants are code, as in the TS. The sim drives it
// through WorksHost (the TS createWorks path, evict, chance, fall and hooks). Save and restore (saveRoot/loadRoot,
// ./state.ts) wait for the state port.
//
// A unit the works drive is a Worker and its squad a WorkSquad (the TS Worker and WorkSquad): the sim's Unit and Squad
// are meant to derive from them when the coordinator wires works into sim.cpp.
#pragma once

#include <array>
#include <cstdint>
#include <deque>
#include <functional>
#include <map>
#include <optional>
#include <set>
#include <string>
#include <utility>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

#include "state.h"
#include "economy.h"
#include "grid.h"
#include "holders.h"
#include "js_map.h"

namespace sim {

struct WorksTables {
	struct {
		double start = 0.25, grow = 0.02, life = 120, spread = 0.06, spreadMin = 0.4, kindle = 3, douse = 0.025, push = 4, rubble = 3;
	} FIRE;
	struct {
		double iron = 1.5;
		Cost ironCost;
		double wet = 0.5, wetTicks = 6000, wetCost = 1;
	} FORT;
};
void load_works(const godot::Dictionary &t, WorksTables &out);

struct WorkSquad {
	int team = 0;
	std::string owner;
	std::vector<int> sites;
	int node = -1;
};

// W-215: a cart a gatherer's load goes on: where it stands, its hold, its free loads.
struct CartDrop {
	double x = 0, y = 0;
	Hold *hold = nullptr;
	double room = 0;
};

// The part of a sim unit the works drive.
struct Worker {
	int id = 0;
	double x = 0, y = 0, facing = 0;
	bool alive = true;
	WorkSquad *squad = nullptr;
	std::string job; // "gather" | "build" | "" (null)
	std::string carry; // "" null
	double load = 0;
	int wnode = -1, wsite = -1, wslot = -1, wfor = -1;
	bool working = false;
	double wgx = -1, wgy = -1;
	std::vector<double> wpath;
	int wpi = 0;
	bool wreq = false;
	// M5h forager nodes: yield multiplier by resource at delivery; herbs, flax. M5f: gather and build speed (nullopt 1).
	std::optional<Cost> gmul;
	bool herbs = false, flax = false;
	std::optional<double> wrate, brate;
};

// TS Act: [x, y] | null | 'here'.
struct Act {
	enum Kind { NONE, POINT, HERE } kind = NONE;
	double x = 0, y = 0;
	static Act none() { return {}; }
	static Act here() { return { HERE, 0, 0 }; }
	static Act at(double x, double y) { return { POINT, x, y }; }
	static Act at(std::pair<double, double> p) { return { POINT, p.first, p.second }; }
};

// What the works read of a RegionData (src/war/types.ts).
struct WorksRect {
	int x = 0, y = 0, w = 0, h = 0;
};
struct WorksObject {
	std::string id;
	double x = 0, y = 0;
};
struct WorksClaimPoint {
	double x = 0, y = 0;
	std::optional<double> r;
};
struct PrebuiltEntry {
	std::string type;
	double x = 0, y = 0;
	int rot = 0;
	std::vector<int> tiles;
	std::optional<double> hp;
	std::string state; // "" | "done" | "ruined"
	std::optional<int> claim;
	bool landmark = false;
	std::string art; // "" none
	double maxHp = 0; // 0: none
};
struct WorksRegion {
	std::string id;
	bool has_depth = false;
	double depth = 0;
	std::vector<WorksRect> noBuild;
	std::vector<WorksRect> safe;
	std::vector<WorksRect> yard; // M6d: where fighters walk out of a safe zone to (read by the sim only)
	std::vector<uint8_t> water; // per tile 0..2
	std::vector<uint8_t> terrain; // per tile: index into TERRAIN (src/war/region/compact.ts; godot/src/region/region.gd)
	std::vector<WorksObject> objects;
	std::vector<PrebuiltEntry> prebuilt;
	std::vector<WorksClaimPoint> claimPoints;
};

// M7a pre-built state (TS Pre).
struct Pre {
	int i = 0, zone = -1;
	bool landmark = false, ruin = false, gone = false;
	std::vector<double> ground;
	double fouled = 0, foulT = 0;
};

struct BridgeLine {
	std::vector<int> ids;
	int i = 0;
	std::string axis;
	std::array<int, 2> dir{ 0, 0 };
	int width = 1;
	std::string part; // "end0" | "end1" | "deck"
	double deck = 0;
	std::vector<double> rows;
};

struct Building {
	int id = 0;
	std::string type;
	const BuildingDef *def = nullptr;
	int team = 0, rot = 0;
	double x = 0, y = 0, w = 0, h = 0;
	std::vector<int> tiles; // flat tile x,y
	int tilesVer = 0; // saves: bumped whenever TS gives b.tiles a new array (snapshots and farm nodes share the old one)
	std::vector<int> ti; // tile indices
	std::string state; // BuildState
	double labour = 0, need = 0;
	Cost cost, delivered, incoming;
	double costSum = 0, hp = 0, maxHp = 0;
	std::vector<double> saved; // grid cost of its tiles before they closed
	int users = 0, node = -1;
	std::vector<int> slots, slotUser;
	bool cancelled = false;
	std::vector<double> base;
	std::array<double, 2> inside{ 0, 0 };
	int64_t insideKey = 0; // saves: the pieces of one wall share its inside array (0: its own)
	bool decked = false;
	int attach = -1, door = -1;
	struct Prev {
		std::string type;
		const BuildingDef *def;
		double maxHp, hp, need;
		Cost cost;
		double costSum;
		Cost delivered;
		int n;
	};
	std::optional<Prev> prev;
	double burn = 0, kindle = 0;
	bool rubble = false;
	int siege = -1;
	double push = 0;
	std::optional<BridgeLine> bridge;
	double fuel = 0;
	bool iron = false;
	double wet = 0;
	std::optional<Hold> hold;
	std::string owner;
	std::optional<Pre> pre;
	int lastBy = -1;
	bool mend = false;
	double credit = 0, raze = 0;
	bool staff = false;
	std::string access;
	double share = 0, fee = 0, lock = 0, lockTold = 0;
};

struct RepairK {
	double speed = 1, cost = 1;
};

// What the works need of the sim (the TS createWorks arguments and WorksHooks). The optional hooks default to what the
// TS does without them.
struct WorksHost {
	virtual ~WorksHost() = default;
	virtual std::vector<double> path(int team, double x0, double y0, double x1, double y1) = 0;
	virtual void evict(const std::vector<int> &tiles) = 0;
	virtual bool chance(double p) { return false; }
	virtual void fall(const std::vector<int> &tiles) {}
	virtual void spill(double x, double y, const Hold &hold, bool burnt) {}
	virtual void razed(const Building &b, int by) {}
	virtual bool immune(const Building &b) { return false; }
	virtual double douse(const Building &b) { return 1; }
	virtual void laboured(Worker &u, const Building &b, double secs) {}
	virtual RepairK repairK(const Building &b) { return {}; }
	virtual std::optional<CartDrop> cartDrop(WorkSquad &s) { return std::nullopt; }
};

struct PlaceResult {
	bool ok = false;
	std::string reason; // "" none
	std::vector<int> tiles;
};
struct WallPiece {
	std::string type;
	std::vector<int> tiles;
	bool ok = false;
	std::string reason;
};
struct WallPlan {
	bool ok = false;
	std::string reason;
	std::vector<WallPiece> pieces;
};
struct BridgePiece {
	std::string type, part;
	std::vector<int> tiles;
	std::vector<double> rows;
	bool ok = false;
};
struct BridgePlan {
	bool ok = false;
	std::string reason, axis;
	std::array<int, 2> dir{ 0, 0 };
	int width = 0;
	double span = 0, maxSpan = 0;
	std::vector<BridgePiece> pieces;
};
// Omit<WallOrder, 'kind' | 'squad'> and Omit<BridgeOrder, ...>; empty vectors are absent fields.
struct WallOrder {
	std::string material;
	std::vector<double> points, towers, gates, inside;
	bool has_towers = false, has_gates = false;
};
struct BridgeOrder {
	std::string material;
	std::vector<double> points;
	std::optional<double> width;
};

struct InfluenceMap {
	int w = 0, h = 0;
	std::vector<uint8_t> mask;
	int version = 0;
};

struct NodeSnap {
	int id;
	std::string res;
	double x, y, amount, max;
	std::optional<int> obj, building;
	bool guarded = false, rare = false;
};

struct BuildingSnap {
	int id = 0;
	std::string type;
	int team = 0;
	double x = 0, y = 0, w = 0, h = 0;
	int rot = 0;
	std::vector<int> tiles;
	int tilesVer = 0; // saves: TS tiles is the building's array of this version
	std::string state;
	double progress = 0, delivered = 0, hp = 0, maxHp = 0;
	int workers = 0, maxWorkers = 0;
	std::optional<double> tier, walk, depth;
	std::optional<int> attach;
	std::optional<std::vector<double>> steps;
	std::optional<std::array<int, 2>> door;
	std::optional<double> cap;
	std::optional<std::string> upgradeFrom;
	std::optional<double> burning;
	std::optional<bool> lit;
	std::optional<double> fuel;
	bool rubble = false;
	std::optional<int> siege;
	bool iron = false, wet = false;
	std::optional<double> push;
	std::optional<BridgeLine> bridge; // ids and i unused
	std::optional<Cost> goods;
	std::optional<int> items;
	std::optional<std::vector<HoldItem>> list;
	std::optional<Cost> tithe;
	std::optional<std::string> titheTo, owner;
	bool staffed = false;
	std::optional<std::string> access;
	std::optional<double> share, fee, lock, lockMax;
	bool pre = false, landmark = false;
	std::optional<std::string> art;
	bool ruin = false, fouled = false, mend = false;
	std::optional<double> razing;
	std::optional<Cost> waiting;
	std::optional<std::string> stalled;
	std::optional<int> stalls;
};

struct PreRow {
	int i = 0;
	double hp = 0;
	bool ruin = false, gone = false;
	int team = 0;
};

// A man the staff scan sees.
struct StaffMan {
	bool alive = false;
	double x = 0, y = 0;
	int team = 0;
};

class Works {
public:
	// saves (state.ts): the TS saveRoot as a graph, and the loadRoot of one (into a fresh sim)
	// worker: the Obj of a man (the sim's units); load: worker by id
	state::Val save(state::Graph &g, const std::function<state::Val(const Worker *)> &worker) const;
	void load(const state::Obj &o, const std::function<Worker *(const state::Val &)> &worker);
	// a building snapshot (vision's last-seen buildings) with the building's own tiles array when it is the same version
	state::Val saveSnap(state::Graph &g, const BuildingSnap &s) const;
	BuildingSnap loadSnap(const state::Obj &o) const;
	state::Obj *tilesObj(state::Graph &g, int id, int ver, const std::vector<int> &tiles) const;
	state::Obj *bridgeDir(state::Graph &g, int id) const;
	state::Obj *bridgeRows(state::Graph &g, int id) const;
	struct Node {
		int id = 0;
		std::string res;
		double x = 0, y = 0, amount = 0, max = 0, regrow = 0, rate = 0, slots = 0;
		int users = 0;
		std::vector<int> tiles;
		int tilesVer = -1; // saves: a building's node shares the building's tiles array of this version
		std::optional<int> obj, building;
		bool locked = false, hasLocked = false; // hasLocked (saves): TS n.locked was ever set
		std::optional<int> kiln;
		bool rare = false;
	};
	struct Claim {
		int team;
		double x, y, r;
	};
	struct Liege {
		std::string to;
		double pct;
	};

	Works(Grid &grid, const WorksRegion &region, WorksHost &host);

	void prebuild(int start);
	const std::vector<Building *> &prebuilt() const { return prebuilt_; }
	void set_fallback(int team);
	int fallback() const { return fallback_; }
	std::vector<int> near(double x, double y, double r) const;
	void reset_landmark();
	void landmark_capture(double share);
	bool landmark_restore(int team, const Cost &cost, double x, double y);
	std::vector<PreRow> pre_rows() const;
	struct PreRowIn {
		int i;
		double hp;
		bool ruin, gone;
	};
	void load_pre_rows(const std::vector<PreRowIn> &rows);
	bool mend(int id, int team);
	bool rebuild(int id, int team, int mobTeam);
	void vanish(int id);
	void foul(int id, double foulT, std::optional<double> until);
	const BridgeLine *bridge_at(int t) const;
	PlaceResult check_placement(int team, const std::string &type, double x, double y, int rot = 0);
	WallPlan check_wall(int team, const WallOrder &o);
	BridgePlan check_bridge(int team, const BridgeOrder &o);
	int place(int team, const std::string &type, double x, double y, int rot = 0, const std::string &owner = "");
	std::vector<int> place_wall(int team, const WallOrder &o);
	std::vector<int> place_bridge(int team, const BridgeOrder &o);
	void finish_bridges(int team);
	bool finish_site(int id);
	void damage(int id, double dmg, int by = -1);
	void set_job(Worker &u, const std::string &job);
	void release(Worker &u);
	void set_teams(const std::vector<int> &ids, int team);
	void claim(int team, double x, double y, std::optional<double> r = std::nullopt, bool replace = false);
	void add_stock(int team, const std::string &res, double n, const std::optional<std::pair<double, double>> &at = std::nullopt);
	// The store network (crafting's deps): pay `cost` where work stands, put its output in the nearest store.
	bool take_at(int team, double x, double y, const Cost &cost);
	std::vector<Hold *> sources_at(int team, double x, double y) { return sources(team, x, y); }
	void add_at(int team, double x, double y, const std::string &r, double n, const std::string &o);
	void add_at(int team, double x, double y, const std::string &r, double n) { add_at(team, x, y, r, n, region.id); }
	Cost have_at(int team, double x, double y);
	Hold *store_near(int team, double x, double y, double r);
	int net_at(int team, double x, double y);
	bool may_use(const Building &b, const std::string &owner, int team) const;
	void set_ties(std::function<bool(const std::string &, const std::string &)> fn) { ties = std::move(fn); }
	bool set_access(int id, const std::string &owner, const std::optional<std::string> &access, std::optional<double> share, std::optional<double> fee);
	Hold &till_of(int id) { return till_of(buildings[id]); }
	void pay_till(int id, const std::string &res, double n, const std::string &o) { pay_till(buildings[id], res, n, o); }
	JsMap<std::string, Liege> lieges; // a JS Map: insertion order (saved)
	std::vector<Hold *> owned_holds(const std::string &owner);
	void staff_scan(const std::vector<StaffMan> &men, int mob);
	std::pair<double, bool> break_lock(int id, double men, double secs);
	int store_net(int id);
	Hold *hold_of(int id);
	Hold &reserve_of(int team);
	const InfluenceMap &influence() const { return infl; }
	bool node_ok(int id, int team = -1, const std::string &owner = "") const;
	void lock_nodes(const std::vector<int> &ids, bool on);
	bool site_ok(int id, int team) const;
	bool cancel(int id);
	bool demolish(int id, int team);
	void perk_site(int id, double costCut, double hpUp);
	bool upgrade(int id, int team);
	const Building *piece(int id) const { return id >= 0 && id < int(buildings.size()) ? &buildings[id] : nullptr; }
	double dist2(int id, double x, double y) const;
	std::pair<double, double> nearest_tile(int id, double x, double y) const;
	std::vector<Spot> work_spots(int id) const;
	std::vector<double> ring_points(int id, int n, double x, double y) const;
	bool kindle(int id, double dt);
	void fire_hit(int id, double p);
	bool fortify(int team, int id, const std::string &fort);
	const Building *field_at(int t) const;
	bool douse(int id, double dt);
	int ladder_foot(int team, int x, int y) const;
	int raise_ladder(int team, int x, int y, int siege, const std::string &type = "ladder");
	bool push(int id, double dt);
	bool lit_near(int team, double x, double y, double z, std::optional<double> r = std::nullopt) const;
	double pitch(int team, double x, double y) { return have_at(team, x, y).get("pitch"); }
	double plat_cap(int id) const { return id >= 0 && id < int(buildings.size()) ? buildings[id].def->cap : 0; }
	int on_building(int t) const;
	std::vector<double> deck_points(int t, int n) const;
	Act work(Worker &u);
	void tick();
	const std::deque<Building> &all() const { return buildings; }
	std::vector<NodeSnap> resource_nodes() const;
	std::vector<BuildingSnap> building_snaps();
	// Per team (ascending, as a JS integer-keyed object): its strongroom and every standing store together.
	std::vector<std::pair<int, Cost>> stock_snap();
	int tick_count() const { return tick_; }

private:
	Grid &grid;
	const WorksRegion &region;
	WorksHost &host;
	int w, h;
	std::deque<Node> nodes; // stable references (regrowing holds pointers)
	std::vector<int32_t> nodeAt;
	std::vector<Node *> regrowing;
	std::deque<Building> buildings; // stable references (storeList, braziers, prebuilt, burning hold pointers)
	std::vector<Building *> braziers;
	std::vector<int32_t> occ;
	std::vector<uint8_t> noBuild;
	JsMap<int, Hold> reserve; // a JS Map: insertion order (saved; stockSnap's keys are JS integer keys: ascending)
	std::vector<Building *> storeList;
	std::vector<Claim> claims;
	InfluenceMap infl;
	std::vector<Worker *> pathQueue;
	JsMap<int, std::array<double, 3>> waits; // JS Maps and Sets: insertion order (saved)
	std::vector<Worker *> active; // a JS Set: insertion order
	JsMap<int, JsSet<int>> cutOff;
	JsSet<int> waitAt;
	int tick_ = 0;
	int fields = 0;
	double yieldK = 1;
	struct Net {
		int v;
		std::vector<int32_t> lab;
	};
	std::map<int, Net> nets; // lookup only
	std::vector<int32_t> netStack;
	int storeVer = 0;
	struct NetList {
		int v, s;
		std::vector<Building *> list;
	};
	std::map<std::pair<int, int>, NetList> netCache; // lookup only
	std::vector<int32_t> staffHead, staffNext;
	std::function<bool(const std::string &, const std::string &)> ties = [](const std::string &, const std::string &) { return false; };
	int fallback_;
	bool owning = false, needPaint = false;
	std::vector<Building *> prebuilt_;
	std::vector<Building *> burning;

	bool isCut(const Worker &u, int id) const;
	void cut(const Worker &u, int id);
	void unwait(Worker &u);
	void activeAdd(Worker *u);
	void activeDelete(Worker *u);
	const std::vector<int32_t> &labels(int team);
	bool standing(const Building &b) const;
	int storeNet(const Building &b);
	bool shared(const Building &b) const;
	const std::vector<Building *> &netStores(int team, int net);
	std::vector<Hold *> sources(int team, double x, double y);
	Hold &till_of(Building &b);
	void pay_till(Building &b, const std::string &res, double n, const std::string &o);
	bool hasTerms(const Building &b) const;
	void repaint();
	int zoneTeam(int z) const;
	int ownerOf(const Building &b) const;
	std::vector<int> gateTiles(const Building &b) const;
	void setTeam(Building &b, int team);
	void owners();
	std::string checkTiles(int team, const std::vector<int> &tiles, bool flat, bool anyTeam = false, const std::vector<std::pair<int, double>> *lets = nullptr) const;
	Building *ownSegment(int t, int team);
	std::vector<std::pair<int, double>> wallUnder(int team, const std::vector<int> &tiles);
	void giveWay(int team, const std::string &type, const std::vector<int> &tiles);
	void cutOut(Building &b, const std::vector<int> &drop);
	PlaceResult checkBrazier(int team, const std::vector<int> &tiles);
	int addBrazier(int team, const std::vector<int> &tiles);
	std::array<double, 2> innerStep(const std::vector<int> &line, std::array<double, 2> inside) const;
	std::array<double, 2> homeOf(int team) const;
	int add(int team, const std::string &type, const std::vector<int> &tiles, int rot, const std::optional<std::array<double, 2>> &inside = std::nullopt, int attach = -1, const std::string &owner = "");
	bool standable(int t, int team) const;
	bool onDeck(int t) const;
	std::vector<int> workSlots(const Building &b) const;
	bool ready(const Building &b) const;
	double deliveredShare(const Building &b) const;
	void waitOf(Building &b, BuildingSnap &s);
	void close(Building &b);
	Building *walkWall(int t, int team);
	std::vector<int> innerRow(const std::vector<int> &tiles, std::array<double, 2> inside, const std::set<int> &skip) const;
	struct AccessOf {
		std::string reason;
		int attach;
		std::vector<int> tiles;
	};
	AccessOf accessOf(int team, const std::string &type, const std::vector<int> &tiles);
	std::vector<double> steps(const Building &s) const;
	void ramp(Building &s);
	int doorOf(const Building &b) const;
	void raiseDeck(Building &b);
	void lowerDeck(Building &b);
	void bbox(Building &b);
	std::vector<Spot> spotsOf(const Building &b) const;
	void openInside(Building &b);
	void finish(Building &b);
	void destroy(Building &b, bool razed = false);
	void ruin(Building &b, bool spill = true);
	void razeNow(Building &b);
	double wetK(const Building &b) const;
	bool canBurn(const Building *b) const;
	void ignite(Building &b);
	std::vector<Building *> besides(const Building &b);
	void fireTick();
	double near2(const std::vector<int> &tiles, double x, double y) const;
	bool at(const std::vector<int> &tiles, const Worker &u) const;
	std::pair<double, double> spot(const std::vector<int> &tiles, const Worker &u, double cx, double cy) const;
	Act walkTo(Worker &u, double x, double y);
	Act walkTo(Worker &u, std::pair<double, double> p) { return walkTo(u, p.first, p.second); }
	std::vector<Building *> stores(int team);
	Building *nearestStore(const Worker &u);
	void leave(Worker &u);
	void dropRefunded(Worker &u);
	void takeNode(Worker &u, Node &n);
	bool holds(int team) const;
	bool shut(const Node &n, int team, const std::string &owner = "") const;
	Node *findNode(const std::string &res, double x, double y, double r, int first, int team, const std::string &owner = "");
	Act deliver(Worker &u);
	Act gather(Worker &u);
	bool unfinished(const Building &b) const;
	Cost fullCost(const Building &b);
	Act mendTick(Worker &u, Building &b);
	bool slotOk(const Building &b, int k) const;
	int freeSlot(const Building &b, const Worker &u) const;
	std::optional<std::pair<Building *, int>> pickSite(Worker &u);
	Act wait(Worker &u);
	Act toSlot(Worker &u, Building &b);
	void detour(Worker &u);
	Act build(Worker &u);
	std::string regionGood() const;
	void raise(Building &b);
};

} // namespace sim
