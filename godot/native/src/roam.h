// W-65 roaming life (src/war/sim/roam.ts), line for line: beast packs, bandit patrols, caravans and travellers on the
// sim's own orders, with their own Rng. ROAM, DENSITY, NATURE and ROAM_OWNER come from the exported table
// (src/war/sim/roam) through SimData. The sim drives it through RoamHost, as the TS createRoam(region, seed, host).
// Save and restore (saveRoot/loadRoot, ./state.ts) wait for the state port.
#pragma once

#include <deque>
#include <limits>
#include <map>
#include <optional>
#include <string>
#include <tuple>
#include <utility>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

#include "state.h"
#include "depth.h"
#include "mobs.h"
#include "rng.h"
#include "js_map.h"

namespace sim {

struct RoamNature {
	std::string react; // 'flee' | 'attack' | 'near' | 'weak'
	double size = 0, r = 0;
};
struct RoamDensity {
	double packs = 0, patrols = 0, caravans = 0, travellers = 0;
};
struct RoamTables {
	std::string ROAM_OWNER = "roam";
	struct {
		double think = 10, wake = 90, leg = 36;
		double rest[2] = { 300, 900 };
		double respawn = 6000, clear = 24, escortR = 14, escortShare = 0.3, escortMin = 6;
		struct {
			double base = 4, per = 2;
		} pay;
		double ambushR = 14, leash = 30, huntR = 22, territory = 28, drift = 2, fightR = 18, flee = 20, halt = 12;
	} ROAM;
	std::vector<RoamDensity> DENSITY;
	std::map<std::string, RoamNature> NATURE; // looked up by kind only
};
// tables: "src/war/sim/roam"
void load_roam_tables(const godot::Dictionary &tables, RoamTables &out);

// What the controller reads of a RegionData (src/war/types.ts).
struct RoamEntry {
	std::string side; // 'N' | 'E' | 'S' | 'W'
	double x = 0, y = 0, w = 0, h = 0;
};
struct RoamRect {
	double x = 0, y = 0, w = 0, h = 0;
};
struct RoamPrebuilt {
	double x = 0, y = 0;
	std::optional<int> claim;
	bool landmark = false;
};
struct RoamRegion {
	DepthRegion depth;
	std::vector<RoamEntry> entries;
	std::vector<LairEntry> lairs; // kind, x, y, captain
	std::vector<ClaimEntry> claimPoints; // x, y, lairs
	std::vector<RoamRect> safe;
	std::vector<RoamPrebuilt> prebuilt;
};

struct RoamUnit {
	double x = 0, y = 0, hp = 0, maxHp = 0;
	bool alive = false;
};
struct RoamSquad {
	int id = 0;
	std::string owner;
	int team = 0, alive = 0;
	double cx = 0, cy = 0;
	std::vector<RoamUnit> units;
	std::string order;
	int target = -1;
	bool civ = false, flee = false, meek = false;
	int angry = 0;
};
struct RoamCart {
	double x = 0, y = 0;
	int team = 0;
	bool alive = false, moving = false;
};
// The orders the controller gives (src/war/types.ts Order, the kinds it uses): kind and its fields.
struct RoamOrder {
	std::string kind; // 'move' | 'attack' | 'hold' | 'formation' | 'crew' | 'escort'
	int squad = -1;
	double x = 0, y = 0; // move
	int target = -1; // attack
	int siege = -1; // crew
	int cart = -1; // escort
	std::string shape; // formation
};
struct RoamScale {
	double hp = 1, dmg = 1;
};
using RoamGoods = std::vector<std::pair<std::string, double>>;
struct RoamNote {
	std::string kind; // 'caravanPaid' | 'caravanRobbed'
	std::string owner; // caravanPaid
	int team = 0;
	double coin = 0, x = 0, y = 0;
	int caravan = 0; // caravanRobbed
	double by = 0;
};

// What the controller needs of the sim (TS RoamHost). squads() is indexed by squad id; `angry` is written.
struct RoamHost {
	double w = 0, h = 0;
	virtual ~RoamHost() = default;
	virtual std::vector<RoamSquad> &squads() = 0;
	// A squad of `cls` (meek for NEUTRAL_TEAM), stats scaled by k; -1 when it cannot stand.
	virtual int spawn(int team, const std::string &owner, const std::string &cls, double count, double x, double y, const RoamScale &k) = 0;
	// Applied at once.
	virtual void order(const RoamOrder &o) = 0;
	virtual bool arrived(int id) = 0;
	// A walking (or cart) path as flat corner points, ending at the goal or as near as it gets.
	virtual std::vector<double> route(bool cart, double x0, double y0, double x1, double y1) = 0;
	// The nearest open point.
	virtual std::pair<double, double> open(double x, double y) = 0;
	// A wagon of NEUTRAL_TEAM, owner ROAM_OWNER, at (x,y) holding `goods`; its id.
	virtual int cart(double x, double y, const RoamGoods &goods) = 0;
	virtual std::optional<RoamCart> cart_at(int id) = 0;
	// Coin for `owner` beside his nearest squad (his alone for a while).
	virtual void pay(const std::string &owner, int team, double x, double y, double coin) = 0;
	// A man fighting within r of (x,y): where.
	virtual std::optional<std::pair<double, double>> fight_near(double x, double y, double r) = 0;
	virtual void note(const RoamNote &e) = 0;
};

struct RoamDef {
	std::string kind; // RoamKind
	std::optional<std::string> mob, cls;
	std::optional<double> count, guards;
	// The road (a pack: its home, then nothing), tiles; `at`: the waypoint it starts on (default 0).
	std::vector<std::pair<double, double>> route;
	std::optional<double> at;
	bool pilgrim = false;
};

struct RoamSnapOut {
	int id = 0;
	std::string kind;
	std::vector<int> squads;
	std::string state;
	std::string mob; // '' absent
	int cart = -1; // -1 absent
	bool pilgrim = false, asleep = false;
};

class Roam {
public:
	// saves (state.ts): the TS saveRoot as a graph, and the loadRoot of one (into a fresh sim)
	state::Val save(state::Graph &g) const;
	void load(const state::Obj &o);
	struct Group {
		int id = 0;
		std::string kind;
		std::optional<std::string> mob;
		std::string cls;
		double count = 0, guards = 0;
		int squad = -1, guard = -1, cart = -1;
		std::vector<double> route;
		double leg = 0;
		int dir = 1;
		double hx = 0, hy = 0;
		std::string state = "idle";
		double until = 0;
		int foe = -1;
		double fx = 0, fy = 0, stall = 0;
		bool asleep = false;
		double hpSeen = std::numeric_limits<double>::infinity();
		// Escort checks by owner (with his team): Object.keys(...).sort() order is the map's.
		JsMap<std::string, std::pair<double, int>> escort; // a JS object of owners: insertion order (saved)
		int routeOf = -1; // saves: the group whose route array this one shares (TS fall hands the caravan's to its travellers)
		double road = 0;
		bool dead = false;
		double respawnAt = 0;
		bool once = false, pilgrim = false;
	};

	Roam(const RoamRegion &region, double seed, RoamHost &host);

	// Start the region's roaming life (once).
	void spawn();
	// One more group (tests, tools); its id. Turns the controller on without populating the region.
	int add_group(const RoamDef &d);
	bool any() const { return !groups.empty(); }
	// A player's order on a roaming squad or wagon: an attack angers the whole group at his team.
	void provoke(int team, std::optional<int> squad, std::optional<int> cart);
	void tick(double t);
	std::vector<RoamSnapOut> snaps() const;

private:
	const RoamRegion region;
	RoamHost &host;
	Mulberry rng;
	double depth;
	const DepthRule &rule;
	std::deque<Group> groups; // pushed to while iterated (fall): references stay valid
	bool on = false;
	double tick_ = 0;
	double realAt = -1;
	std::vector<int> real; // squad ids
	// the region's places: entries and towns as points (identity is the index), bandit camps, beast kinds
	std::vector<std::pair<double, double>> pts;
	std::vector<int> entries, towns;
	std::vector<std::pair<double, double>> camps;
	size_t beasts = 0;
	std::map<std::tuple<bool, double, double, double, double>, std::optional<std::vector<double>>> roads; // a cache: order cannot show

	RoamSquad *sq(int id);
	bool live(int id);
	const std::vector<int> &players();
	bool any_player(double x, double y, double r);
	RoamSquad *foe_of(const RoamSquad &s, double r);
	double clamp_x(double x) const;
	double clamp_y(double y) const;
	void move(int id, double x, double y);
	std::pair<double, double> wp(const Group &g, double i) const;
	std::pair<double, double> wp(const Group &g) const { return wp(g, g.leg); }
	double legs(const Group &g) const { return double(g.route.size()) / 2; }
	std::optional<std::vector<double>> road(std::pair<double, double> a, std::pair<double, double> b, bool cart);
	Group blank(const RoamDef &d, const std::vector<double> &route) const;
	RoamGoods goods();
	void raise(Group &g, double at);
	void go(Group &g);
	void next(Group &g);
	void rejoin(Group &g, double x, double y);
	void arrive(Group &g);
	void fall(Group &g);
	void sleep(Group &g);
	void drift(Group &g, RoamSquad *s);
	void wake(Group &g);
	bool calm(const Group &g) const;
	void chase(Group &g, const RoamSquad &s, const RoamSquad &foe);
	void run(Group &g, const RoamSquad &s, double fx, double fy, double until);
	void back(Group &g, const RoamSquad &s);
	bool chase_over(Group &g, const RoamSquad &s, double hp, double max);
	void pack(Group &g, int sid);
	void calm_pack(Group &g, int sid, double k);
	void patrol(Group &g, int sid);
	void caravan(Group &g, int sid);
	void traveller(Group &g, int sid);
	void think(Group &g);
	int add(const RoamDef &d);
	void populate();
};

} // namespace sim
