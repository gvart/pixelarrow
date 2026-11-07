// M7a pre-built towns (src/war/sim/prebuilt.ts createTowns), line for line: the town pieces grouped by claim point,
// their standing, recruit pool, favour and prestige, ruin; the blessing of squads standing in a precinct; wells
// (upkeep relief, dousing, fouling); caches carried off. PREBUILT, BLESS, WELL, PRESTIGE_CAP and TOWN_RUIN come from the
// exported table src/war/sim/prebuilt through SimData.load ("src/war/sim/prebuilt").
//
// The pieces are works buildings (works.h Building with its Pre); the towns read them and call foul and vanish through
// PreWorks (WorksPre adapts the real Works), and read the sim's squads and units through PreHost.
#pragma once

#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>

#include "state.h"
#include "works.h"

namespace sim {

// Fields absent in the TS read 0 (every one is a number used as `?? 0` or truthiness, never 0 when set).
struct PreFn {
	double pop = 0, cap = 0, bless = 0, favour = 0, prestige = 0;
	bool well = false;
};
struct PrebuiltTables {
	std::unordered_map<std::string, PreFn> PREBUILT; // lookup only
	struct {
		double stand = 300, ticks = 9000, share = 0.05, heal = 1.15;
	} BLESS;
	struct {
		double rest = 12, upkeep = 0.8, douse = 2, by = 1.5, foul = 300, fouled = 18000;
	} WELL;
	double PRESTIGE_CAP = 2, TOWN_RUIN = 0.75;
	const PreFn *fn(const std::string &type) const {
		const auto it = PREBUILT.find(type);
		return it == PREBUILT.end() ? nullptr : &it->second;
	}
};
// tables["src/war/sim/prebuilt"] (absent: left as is)
void load_prebuilt_tables(const godot::Dictionary &tables, PrebuiltTables &out);

struct PreSquad {
	int id = 0, team = 0;
	double alive = 0, cx = 0, cy = 0;
	bool civ = false;
};
// A unit: where, alive, a civilian (TS `civ` truthy), his squad's team.
struct PreUnit {
	double x = 0, y = 0;
	bool alive = false, civ = false;
	int team = 0;
};

struct PreHost {
	virtual ~PreHost() = default;
	virtual std::vector<PreSquad> squads() = 0;
	virtual std::vector<PreUnit> units() = 0;
	int mob = 7;
};

// What the towns use of the works (createWorks' prebuilt, foul and vanish).
struct PreWorks {
	virtual ~PreWorks() = default;
	virtual const std::vector<Building *> &prebuilt() = 0;
	virtual void foul(int id, double foulT, std::optional<double> until) = 0;
	virtual void vanish(int id) = 0;
};
struct WorksPre : PreWorks {
	Works &w;
	explicit WorksPre(Works &w) : w(w) {}
	const std::vector<Building *> &prebuilt() override { return w.prebuilt(); }
	void foul(int id, double foulT, std::optional<double> until) override { w.foul(id, foulT, until); }
	void vanish(int id) override { w.vanish(id); }
};

struct TownSnap {
	int claim = -1, team = 0;
	double houses = 0, standing = 0, pool = 0, cap = 0, favour = 0, prestige = 0;
	bool ruined = false;
};

class Towns {
public:
	// saves (state.ts): the TS saveRoot as a graph, and the loadRoot of one (into a fresh sim)
	state::Val save(state::Graph &g) const;
	void load(const state::Obj &o);
	Towns(PreWorks &works, PreHost &host) : works(works), host(host) {}

	// saveRoot: stand and blessed as Map entries in insertion order, and the tick
	std::vector<std::pair<int, double>> stand; // squad id -> ticks in a precinct of its team
	std::vector<std::pair<int, double>> blessed_; // squad id -> blessed until tick
	double tick_ = 0;
	void load_root(double tick) { tick_ = tick; }

	std::vector<TownSnap> towns() const;
	struct Pop {
		double rate = 0, cap = 0;
	};
	Pop population(int team) const;
	double prestige(int team) const;
	double upkeep_at(int team, double x, double y) const;
	double douse(const Building &b) const;
	bool blessed(int squad) const;
	void tick(double t);

private:
	PreWorks &works;
	PreHost &host;
	bool working(const Building &b) const;
	bool well_ok(const Building &b) const;
};

} // namespace sim

namespace godot {

// GDScript face of the towns over a fake works and host (tests replay src/dev/vectors/prebuilt.ts through it): the
// pieces, squads and units of a scenario's start, its ops applied, the works calls recorded (["foul", id, foulT, until or
// null], ["vanish", id]).
class Towns : public RefCounted {
	GDCLASS(Towns, RefCounted)

public:
	struct Fake;
	std::unique_ptr<Fake> fake;
	std::unique_ptr<sim::Towns> towns;
	Towns();
	~Towns();

	static Ref<Towns> create(const Dictionary &start, int mob);
	void apply(const Array &ops);
	void tick(double t);
	Array take_calls();
	Dictionary probes() const; // towns, pop, upkeep, douse, blessed, root as the vectors write them

protected:
	static void _bind_methods();
};

} // namespace godot
