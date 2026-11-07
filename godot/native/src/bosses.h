// M7d landmark guardians (src/war/sim/bosses.ts), line for line: the boss AI with its phases, the boss gate, the kill,
// the 24 h respawn, the Bandit King's escape, raid scaling and the Rim Warden. GUARDIANS, MOVES, BOSS, RAID and WARDEN
// come from the exported table (src/war/sim/bosses) through SimData. A guardian's men are the sim's own Unit and Squad
// (sim.h); the sim drives it through BossHost, as the TS createBosses(region, host). Save and restore (saveRoot,
// loadRoot, ./state.ts) wait for the state port. bossPile (src/war/sim/bossLoot.ts) is boss_pile below.
#pragma once

#include <map>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

#include "state.h"
#include "js_map.h"
#include "depth.h"
#include "holders.h"
#include "item.h"
#include "sim.h"
#include "war_bosses.h"

namespace sim {

// A guardian's def (TS GDef).
struct GuardDef {
	std::string ai, cls;
	double hp = 0, dmg = 0, armor = 0, reach = 0, atk = 0, speed = 0, aggro = 0, leash = 0;
	struct Guard {
		std::string cls;
		double n = 0, hp = 0, dmg = 0, armor = 0;
	};
	std::optional<Guard> guard;
	struct Parts {
		double n = 0, hp = 0, dmg = 0;
	};
	std::optional<Parts> parts;
};

// MOVES, field for field.
struct BossMoves {
	struct { double every, r, share, knock; } sweep;
	struct { double every, len, half, share, reach; } breath;
	double perchFor, flight;
	struct { double r, share, knock, packs, pack, packHp, packDmg; } crash;
	struct { double dmg, atk; } enrage;
	struct { double every, water, head; } snatch;
	struct { double every, r; } headStrike;
	struct { double every, range, r, share, wood; } rock;
	struct { double every, r, mult; } smash;
	struct { double every, r, n; } triple;
	struct { double every, len, half, share; } goatBreath;
	struct { double at, hold, away; } postern;
	struct { double packs, n; } calls;
	double sounder;
	struct { double every, range, min, r, share, wood; } boulder;
	struct { double every, r, share, knock, gates, gateDmg; } stomp;
	struct { double every, r; } bite;
	struct { double every, range, w, share, knock, wind, min, through; } charge;
	struct { double every, wind, fly, range, min, r, share, knock; } dive;
	struct { double every, wind, fly, range, min, r, share, knock; } pounce;
	struct { double every, wind, r, n, knock, slow; } roar;
	struct { double every, wind, len, half, share, knock; } maul;
	struct { double every, wind, range, min, len, w, share, knock, stun, fly; } bull;
	struct { double delay, wind, reach, len, past, w, share, push, slow; } surge;
	double fx, stall;
};

struct BossSimTables {
	std::map<std::string, GuardDef> GUARDIANS; // looked up by id only
	BossMoves MOVES{};
	double BOSS_SLOW = 0.5;
	struct { double respawn = 864000, retry = 6000; } BOSS;
	struct {
		std::map<int, double> squads; // looked up by tier only
		double per = 0.1, max = 1.6, r = 30, every = 50;
	} RAID;
	struct { double every = 9000, band = 12, size = 8, telegraph = 100, share = 0.6; } WARDEN;
};
// tables["src/war/sim/bosses"] (absent: left empty)
void load_boss_sim_tables(const godot::Dictionary &tables, BossSimTables &out);

// What the guardians read of a RegionData (src/war/types.ts GuardianEntry, rim): the region type is the index.ts port's.
struct GuardianEntry {
	std::string boss;
	double x = 0, y = 0;
	std::vector<std::pair<double, double>> perches, heads;
	std::optional<std::pair<double, double>> postern, pit, flats;
};
struct BossRegion {
	DepthRegion depth; // id and own depth
	std::string rim; // '' none, 'N' | 'E' | 'S' | 'W'
	std::vector<GuardianEntry> guardians;
};

// Partial<WarStats> as the module writes it: the fields it sets.
struct StPatch {
	std::optional<double> maxHp, dmg, armor, reach, speed, block, range, ammo, rangedDmg, knock;
	std::optional<int> atkTicks;
	void apply(WarStats &s) const;
};

// The WarEvents it notes: bossPhase, bossFled, bossBack, bossSlain, wardenStrike.
struct BossNote {
	double t = 0;
	std::string kind, region, boss;
	int phase = 0; // bossPhase
	std::vector<std::string> killers; // bossSlain
	double x = 0, y = 0; // bossSlain, wardenStrike
	double w = 0, h = 0; // wardenStrike
	int hit = 0; // wardenStrike
};

// What the guardians need of the sim (TS BossHost). units() and squads() are indexed by id; units are written.
struct BossHost {
	double w = 0, h = 0;
	int mobTeam = 7, neutralTeam = 6;
	virtual ~BossHost() = default;
	virtual const std::vector<Unit *> &units() = 0;
	virtual const std::vector<Squad *> &squads() = 0;
	// A squad of the mob team of `count` men of sheet `cls` with these stats over a bear's (boss: its run, -1 a called pack).
	virtual int spawn(const std::string &cls, int count, double x, double y, const StPatch &st, int boss) = 0;
	virtual void order(const Order &o) = 0;
	virtual void hurt(Unit &u, double dmg, bool venom = false) = 0;
	virtual void knock(Unit &u, double fx, double fy, double tiles) = 0;
	virtual void slow(Unit &u, double ticks) = 0;
	virtual void place(Unit &u, double x, double y) = 0;
	virtual void vanish(Unit &u) = 0;
	virtual void burn(double x, double y, double r) = 0;
	// what: "wood" | "all" | "gate"
	virtual void smash(double x, double y, double r, double dmg, const std::string &what) = 0;
	virtual int water(double x, double y) = 0;
	virtual bool open(double x, double y) = 0;
	virtual double level(double x, double y) = 0;
	virtual bool claimed() = 0;
	virtual void gate(const std::string &id, bool alive) = 0;
	virtual void reset_landmark() = 0;
	virtual void note(const BossNote &e) = 0;
	virtual double range(double lo, double hi) = 0;
};

// BossSnap (src/war/types.ts), the view's guardian.
struct BossSnap {
	std::string id, name;
	int squad = -1, unit = -1;
	double x = 0, y = 0, hp = 0, maxHp = 0;
	int phase = 0;
	std::vector<double> phases;
	std::string state;
	double raid = 0, scale = 1;
	struct Parts {
		int alive = 0, total = 0;
	};
	std::optional<Parts> parts;
	std::optional<double> respawnIn;
	struct Fx {
		std::string kind;
		double x, y, tx, ty, r, t;
	};
	std::optional<Fx> fx;
	struct Tele {
		std::string kind;
		double x, y, tx, ty, r, in, of;
	};
	std::optional<Tele> tele;
	std::vector<int> hide; // empty: absent
};
struct WardenSnap {
	double x = 0, y = 0, w = 0, h = 0, in = 0;
};
struct BossMemo {
	std::string id, state;
	double left = 0;
};

class Bosses {
public:
	// saves (state.ts): the TS saveRoot as a graph, and the loadRoot of one (into a fresh sim)
	state::Val save(state::Graph &g) const;
	void load(const state::Obj &o);
	Bosses(const BossRegion &region, BossHost &host);

	void spawn();
	void hit(int i, const std::string &owner, double d);
	void struck(int i);
	void down(const std::string &id, double left, bool away = false);
	void wake(double k);
	std::vector<BossMemo> memo() const;
	void hurt_boss(const std::string &id, double dmg, const std::string &owner = "dev", std::optional<int> part = std::nullopt);
	void tick(double t);
	std::vector<BossSnap> snaps();
	std::optional<WardenSnap> warden_snap() const;
	bool any() const;

private:
	enum Ai { DRAKON, SCYLLA, BRONTES, GYGES, CHIMERA, KING, MAENADS, TITAN, RIVER, BRUTE, BOAR, GRIFFIN, LION, BEAR, MINOTAUR };
	struct Fly {
		double x0, y0, x1, y1, t0, t1;
		std::string then; // 'perch' | 'land' | 'crash' | 'charge' | 'dive' | 'pounce' | 'wall'
	};
	struct Tele {
		std::string kind;
		double x, y, tx, ty, r, t0, go, at;
		bool held, wall;
	};
	struct RunFx {
		std::string kind;
		double x, y, tx, ty, r, at;
	};
	struct Run {
		int i = 0;
		std::string id;
		Ai ai = BRUTE;
		double x = 0, y = 0;
		int sq = -1, parts = -1;
		std::vector<int> called;
		int main = -1, phase = 0;
		std::string state = "idle";
		double scale = 1, raid = 0;
		double next = 0, next2 = 0;
		int perch = 0;
		double perchAt = 0;
		std::optional<Fly> fly;
		std::optional<Tele> tele;
		double stun = 0, surge = 0;
		double fleeAt = -1, respawnAt = 0;
		double guardN = -1;
		double hitAt = 0;
		JsMap<std::string, double> dmg; // a JS object of owners: insertion order (saved)
		bool hasHitAt = false; // saves: TS hitAt was ever set (the literal has none)
		std::string last;
		std::optional<RunFx> fx;
	};
	struct Warden {
		double x, y, w, h, at;
	};

	const BossRegion region;
	BossHost &host;
	const std::vector<GuardianEntry> &entries;
	std::vector<Run> runs;
	std::optional<Warden> warden;
	double wardenAt;
	bool spawned = false;
	double tick_ = 0;
	std::string rim;

	static Ai ai_of(const std::string &s);
	bool foe(const Squad &s) const;
	std::vector<Unit *> foes_in(double x, double y, double r);
	Unit *nearest_foe(double x, double y, double r);
	Unit *densest(double x, double y, double r, double min = 0);
	void fx(Run &r, const std::string &kind, double x, double y, double tx, double ty, double rad);
	Unit *body(const Run &r);
	Squad *sq_of(int id);
	const GuardDef &def(const Run &r) const;
	std::vector<Unit *> units(const Run &r);
	std::vector<Unit *> pool(const Run &r);
	std::pair<double, double> hp_of(const Run &r);
	int parts_alive(const Run &r);
	void blast(const std::vector<Unit *> &us, double share, double fx0, double fy0, double knock = 0, bool venom = false);
	std::vector<Unit *> cone(double x, double y, double tx, double ty, double len, double half);
	void breathe(Run &r, Unit &u, const Unit &t, double len, double half, double share);
	bool on_tier(const Squad &s, const Squad &o);
	void engage(Squad *s, double hx, double hy, double aggro, double leash, Run *r = nullptr);
	void pin(Unit &u, bool on, int aloft = 0);
	void fly_to(Run &r, double x1, double y1, double ticks, const std::string &then);
	void call(Run &r, const std::string &cls, const std::string &kind, double n, double count, double x, double y, double hpk, double dmgk);
	void spawn_run(Run &r, double guardN = -1);
	void enter(Run &r, int p);
	std::vector<Unit *> band(double x, double y, double tx, double ty, double w);
	void wind_up(Run &r, Unit &u, const std::string &kind, double tx, double ty, double rad, double go, std::optional<double> at = std::nullopt, bool wall = false);
	struct RunEnd {
		double x, y;
		bool wall;
	};
	RunEnd run_to(const Unit &u, double tx, double ty, double len);
	void gore(Run &r, Unit &u);
	Unit *back_rank(const Unit &u, double range, double min);
	Unit *nearest_between(const Unit &u, double min, double max);
	void launch(Run &r, Unit &u);
	void think(Run &r);
	bool near_water(double x, double y, double r);
	void escape(Run &r);
	void slay(Run &r);
	void scale_for(Run &r);
	double share_of(const Run &r);
	bool dead(const Run &r);
	void warden_tick();
};

// bossPile (src/war/sim/bossLoot.ts): the pile of a kill (the same kill, the same pile); `run` names the room or sandbox run.
struct BossPile {
	double x = 0, y = 0;
	std::vector<Lot> lots;
	std::vector<Item> items;
};
BossPile boss_pile(const std::string &region, const std::string &run, const BossNote &e);

} // namespace sim
