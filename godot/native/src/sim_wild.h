// The sim's hosts for the region's wild (src/war/sim/index.ts: the createMobs, createBosses, createRoam and createTowns
// hosts), wired in sim_wild.cpp. The mob and roam controllers read squads in their own shapes (MobSquad, RoamSquad): a
// mirror of the sim's squads, rebuilt in place whenever the sim may have changed since the last read (`dirty`), whose
// writes (the mobs' healing, roam's anger) go back to the sim's own squads and men (flush) before the next rebuild and
// whenever control returns to the sim.
#pragma once

#include <set>
#include <string>
#include <vector>

#include "bosses.h"
#include "mobs.h"
#include "prebuilt.h"
#include "roam.h"
#include "sim.h"

namespace sim {

// src/data/names.ts freeName (sim_wild.cpp)
std::string free_name_for(const std::string &culture, int start, const std::set<std::string> &taken);

struct SimMobHost : MobHost {
	Sim *s = nullptr;
	std::vector<MobSquad> mirror;
	std::vector<std::vector<double>> hp0; // each mirrored man's hp as read from the sim (a write shows as a change)
	bool dirty = true;
	void flush();
	std::vector<MobSquad> &squads() override;
	int spawn(const std::string &kind, double count, double x, double y, const SpawnScale &k) override;
	void order(const MobOrder &o) override;
	bool arrived(int id) override;
	std::vector<MobNode> nodes() override;
	void lock_nodes(const std::vector<int> &ids, bool on) override;
	void claim(int team, double x, double y, double r, std::optional<int> from) override;
	bool influenced(double x, double y) override;
	double range(double lo, double hi) override;
	void held(bool on) override;
	void captain_down(int lair, int by) override;
	std::vector<MobTower> towers() override;
	bool has_carts() const override { return true; }
	std::vector<MobCart> carts() override;
	void chief_down(int lair, const WarChief &chief, double x, double y, int by) override;
	void note(const MobNote &e) override; // W-67 mob FX
};

struct SimBossHost : BossHost {
	Sim *s = nullptr;
	const std::vector<Unit *> &units() override;
	const std::vector<Squad *> &squads() override;
	int spawn(const std::string &cls, int count, double x, double y, const StPatch &st, int boss) override;
	void order(const Order &o) override;
	void hurt(Unit &u, double dmg, bool venom = false) override;
	void knock(Unit &u, double fx, double fy, double tiles) override;
	void slow(Unit &u, double ticks) override;
	void place(Unit &u, double x, double y) override;
	void vanish(Unit &u) override;
	void burn(double x, double y, double r) override;
	void smash(double x, double y, double r, double dmg, const std::string &what) override;
	int water(double x, double y) override;
	bool open(double x, double y) override;
	double level(double x, double y) override;
	bool claimed() override;
	void gate(const std::string &id, bool alive) override;
	void reset_landmark() override;
	void note(const BossNote &e) override;
	double range(double lo, double hi) override;
};

struct SimRoamHost : RoamHost {
	Sim *s = nullptr;
	std::vector<RoamSquad> mirror;
	std::vector<int> angry0; // each mirrored squad's anger as read from the sim
	bool dirty = true;
	void flush();
	std::vector<RoamSquad> &squads() override;
	int spawn(int team, const std::string &owner, const std::string &cls, double count, double x, double y, const RoamScale &k) override;
	void order(const RoamOrder &o) override;
	bool arrived(int id) override;
	std::vector<double> route(bool cart, double x0, double y0, double x1, double y1) override;
	std::pair<double, double> open(double x, double y) override;
	int cart(double x, double y, const RoamGoods &goods) override;
	std::optional<RoamCart> cart_at(int id) override;
	void pay(const std::string &owner, int team, double x, double y, double coin) override;
	std::optional<std::pair<double, double>> fight_near(double x, double y, double r) override;
	void note(const RoamNote &e) override;
};

struct SimPreHost : PreHost {
	Sim *s = nullptr;
	std::vector<PreSquad> squads() override;
	std::vector<PreUnit> units() override;
};

} // namespace sim
