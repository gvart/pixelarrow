// Neutral-region fauna and region claiming (src/war/sim/mobs.ts), line for line: the lair controller (home, chase,
// return, flee, raid), the claim channel, bandit hosts (captain, towers, raids), chiefs and boss gates. MOBS, CLAIM,
// GUARD_R and the rest come from the exported table (src/war/sim/mobs) through SimData. The sim drives it through
// MobHost, as the TS createMobs(region, host). Save and restore (saveRoot/loadRoot, ./state.ts) wait for the state port.
#pragma once

#include <limits>
#include <map>
#include <optional>
#include <set>
#include <string>
#include <vector>

#include "depth.h"
#include "war_wild.h"

namespace sim {

struct MobDash {
	double min = 0, max = 0, ticks = 0, speed = 1, cd = 0, dmg = 1;
	std::optional<double> knock;
	bool once = false;
};

struct MobDef {
	std::string base;
	double hp = 1, dmg = 1, speed = 1;
	std::optional<double> atk, armor, block, reach, knock;
	bool venom = false;
	double count = 0, aggro = 0, leash = 0;
	bool passive = false;
	std::optional<double> skittish;
	std::optional<MobDash> dash;
	std::string cry; // '' none, 'howl' | 'roar'
};

struct MobTables {
	int MOB_TEAM = 7;
	std::string MOB_OWNER = "mob";
	std::map<std::string, MobDef> MOBS; // looked up by kind only
	std::vector<std::string> MOB_KINDS; // in TS key order
	double GUARD_R = 10, RESPAWN = 6000;
	struct {
		double ticks = 300, men = 3, at = 5, contest = 14, r = 20;
	} CLAIM;
};

// Unit class of a mob kind, and back ('' : not a mob).
std::string mob_class(const std::string &kind);
std::string mob_kind_of(const std::string &cls);
// W-221: who struck, in a line to the player: "6 wolves", "an ibex", "3 armed men".
std::string foes_word(const std::string &cls, int n);

// What the controller reads of a RegionData (src/war/types.ts): the region type itself is the index.ts port's.
struct LairEntry {
	std::string kind;
	double x = 0, y = 0;
	std::optional<double> count;
	bool captain = false;
	std::optional<std::string> chief;
};
struct ClaimEntry {
	double x = 0, y = 0;
	std::vector<int> lairs;
	std::optional<double> r;
};
struct MobRegion {
	DepthRegion depth; // id and own depth
	std::vector<LairEntry> lairs;
	std::vector<ClaimEntry> claimPoints;
};

struct MobUnit {
	int id = -1; // -1: absent (TS id?)
	double x = 0, y = 0, hp = 0, maxHp = 0;
	bool alive = false;
};
struct MobSquad {
	int id = 0;
	std::string owner;
	int team = 0;
	int alive = 0;
	bool civ = false;
	double cx = 0, cy = 0;
	std::vector<MobUnit> units;
	std::string order; // Order['kind']
	int target = -1;
	int claimPt = -1;
};

// The orders the controller gives (src/war/types.ts SquadOrder, the kinds it uses): kind and its fields.
struct MobOrder {
	std::string kind; // 'formation' | 'move' | 'attack' | 'hold' | 'attackBuilding'
	int squad = -1;
	double x = 0, y = 0; // move
	int target = -1; // attack
	int siege = -1; // attackBuilding
	std::string shape; // formation
};

struct SpawnScale {
	double hp = 1, dmg = 1;
	bool has_lead = false;
	struct {
		double hp = 1, dmg = 1;
		std::optional<double> armor;
	} lead;
};

struct BossGate {
	std::string id;
	bool alive = false;
};

// What spawn() reads of a NodeSnap.
struct MobNode {
	int id = 0;
	double x = 0, y = 0;
	bool has_obj = false;
};
struct MobTower {
	int id = 0;
	double x = 0, y = 0;
};
struct MobCart {
	int id = 0;
	double x = 0, y = 0;
	int team = 0;
};
struct MobNote {
	std::string kind; // 'mobCry' | 'mobScatter' | 'lairCleared'
	int lair = 0;
	std::string mob;
	double x = 0, y = 0;
};

// What the controller needs of the sim (TS MobHost). squads() is indexed by squad id; units are written (healing).
struct MobHost {
	double w = 0, h = 0;
	virtual ~MobHost() = default;
	virtual std::vector<MobSquad> &squads() = 0;
	virtual int spawn(const std::string &kind, double count, double x, double y, const SpawnScale &k) = 0;
	// Applied at once (this tick).
	virtual void order(const MobOrder &o) = 0;
	virtual bool arrived(int id) = 0;
	virtual std::vector<MobNode> nodes() = 0;
	virtual void lock_nodes(const std::vector<int> &ids, bool on) = 0;
	// from: the alliance that held the point (nullopt: unheld).
	virtual void claim(int team, double x, double y, double r, std::optional<int> from) = 0;
	virtual bool influenced(double x, double y) = 0;
	virtual double range(double lo, double hi) = 0;
	// The optional ones (TS `?`): absent is the default.
	virtual void held(bool on) {}
	virtual void captain_down(int lair, int by) {}
	virtual std::vector<MobTower> towers() { return {}; }
	virtual bool has_carts() const { return false; }
	virtual std::vector<MobCart> carts() { return {}; }
	virtual void chief_down(int lair, const WarChief &chief, double x, double y, int by) {}
	virtual void note(const MobNote &e) {}
};

struct ChiefSnap {
	std::string id, name, title;
	int unit = -1;
	bool alive = false;
	double scale = 1, tint = 0;
};
struct LairSnap {
	int id = 0;
	std::string kind;
	double x = 0, y = 0;
	int squad = -1;
	int alive = 0;
	double count = 0;
	std::string state;
	double aggro = 0, leash = 0, guard = 0;
	int nodes = 0;
	std::optional<bool> captain;
	std::optional<ChiefSnap> chief;
	std::optional<double> respawnIn;
};
struct ClaimSnap {
	int id = 0;
	double x = 0, y = 0;
	int team = -1, squad = -1;
	double progress = 0;
	std::vector<int> lairs;
	double men = 0, players = 0;
	std::string state;
	std::string taking; // '' absent
	int by = -1;
};

struct AddLair {
	std::string kind;
	double x = 0, y = 0;
	std::optional<double> count;
	bool lead = false;
	std::optional<std::string> chief;
};

class Mobs {
public:
	enum State { HOME, CHASE, RETURN, FLEE, RAID };

	struct Lair {
		int id = 0;
		std::string kind;
		MobDef def;
		double x = 0, y = 0, count = 0;
		int squad = -1;
		State state = HOME;
		bool cleared = false;
		double respawnAt = 0;
		std::vector<int> nodes;
		double wanderAt = 0, fleeUntil = 0, hpSeen = std::numeric_limits<double>::infinity();
		int foe = -1;
		bool captain = false, capAlive = false;
		int post = -1;
		double raidUntil = 0;
		bool lead = false, once = false;
		std::optional<WarChief> chief;
		bool chiefAlive = false;
	};
	struct Claim {
		int id = 0;
		double x = 0, y = 0, r = 0;
		std::vector<int> lairs;
		int team = -1, squad = -1;
		double progress = 0;
		bool contested = false;
	};

	Mobs(const MobRegion &region, MobHost &host);

	void set_boss(const std::optional<std::string> &id);
	void boss_down(const std::optional<std::string> &id);
	const BossGate *boss() const { return gates.empty() ? nullptr : &gates[0]; }
	const std::vector<BossGate> &bosses() const { return gates; }
	void grant(int i, int team);
	bool claimed() const;
	bool held() const { return held_; }
	const DepthRule &rule;
	void spawn();
	bool added() const;
	int add(const AddLair &d);
	bool start_claim(int squad, int point);
	const Claim *claim_point(int i) const { return i >= 0 && i < int(claims.size()) ? &claims[i] : nullptr; }
	void tick(double t);
	std::vector<LairSnap> lair_snaps();
	std::vector<ClaimSnap> claim_snaps();

private:
	const MobRegion region;
	MobHost &host;
	std::vector<Lair> lairs;
	std::vector<BossGate> gates;
	bool held_ = false;
	double raidAt;
	std::vector<Claim> claims;
	bool spawned = false;
	double tick_ = 0;

	MobSquad *sq(int id);
	std::pair<int, double> nearest_foe(int team, double x, double y, double r);
	void spawn_lair(Lair &l);
	void holding();
	const Claim *zone_of(const Lair &l) const;
	void go_home(Lair &l);
	void aggro(Lair &l, int foe);
	void heal(MobSquad &s);
	void think(Lair &l);
	void respawn(Lair &l);
	bool zone_open(const Claim &c) const;
	bool defended(int team, const Claim &c);
	bool claiming(const MobSquad *s, const Claim &c) const;
	void channel(Claim &c);
	void raid();
	ChiefSnap chief_snap(const Lair &l, const MobSquad *s);
};

} // namespace sim
