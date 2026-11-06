// M7f landmark state (src/war/sim/landmarks.ts), line for line: who holds the region's landmark, the capture damage, the
// restore and the garrison. Tables through SimData: "landmarks" (src/war/sim/landmarks: LANDMARK), "war_landmarks"
// (src/data/warLandmarks: LANDMARKS) and "professions" (src/data/professions: PROF_ROOT, PROF_NODES, for heldNodes).
//
// Works (works.ts, not ported yet) owns the pieces and the capture and restore themselves: LmPiece is just what this
// module reads of a pre-built Piece, and LmWorks the three works calls it makes, so the sim step wires them later.
#pragma once

#include <functional>
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

namespace sim {

using LmGoods = std::vector<std::pair<std::string, double>>; // a Partial<Record<..., number>> in key order

struct Landmark {
	std::string id, name, region;
	std::optional<std::string> rare;
	LmGoods bulk, rare_goods; // restore.bulk, restore.rare
	double engineer = 8;
};
struct LandmarkTables {
	double capture = 0, garrison = 0, every = 0; // LANDMARK
	std::vector<Landmark> list; // LANDMARKS order (find)
};
void load_landmark_tables(const godot::Dictionary &tables, LandmarkTables &out);

const Landmark *landmark_of_region(const std::string &region);
LmGoods restore_cost(const std::string &id);
bool can_lead(const Landmark &lm, double level, const std::vector<std::string> *perks);

// What landmarks reads of a pre-built works Piece (pre.landmark, pre.gone, pre.ruin).
struct LmPiece {
	int team = 0;
	double x = 0, y = 0, hp = 0, maxHp = 0;
	std::vector<double> tiles; // flat x, y
	std::string state;
	bool landmark = false, gone = false, ruin = false;
};
struct LmWorks {
	std::function<const std::vector<LmPiece> &()> prebuilt;
	std::function<void(double share)> landmark_capture;
	std::function<bool(int team, const LmGoods &cost, double x, double y)> landmark_restore;
};

struct LmUnit {
	double x = 0, y = 0;
	bool alive = false;
	std::string civ; // "" none (the TS civ is falsy or a profession id)
	int team = 0; // squad.team
	struct Person {
		double level = 0;
		std::optional<std::vector<std::string>> perks;
	};
	std::optional<Person> person;
};
struct LmSquad {
	int team = 0;
	std::vector<LmUnit> units;
};
// landmark {t, id, state, holder} or landmarkRefused {t, id, squad, why}
struct LmEvent {
	std::string kind;
	double t = 0;
	std::string id, state, why;
	int holder = 0, squad = 0;
};
struct LmHost {
	std::function<const std::vector<LmUnit> &()> units;
	std::function<const LmSquad *(int squad)> squad; // host.squads[squad] (null: none)
	std::function<bool()> guarded;
	std::function<bool(int team)> real;
	std::function<void(const LmEvent &)> note;
};

struct LandmarkSnap {
	std::string id, state;
	int holder = -1, ruined = 0, pieces = 0, men = 0, foes = 0;
	double hp = 0;
	bool garrisoned = false;
};
struct LandmarksRoot {
	bool captured = false, restored = false;
	int holder = -1, men = 0, foes = 0;
	std::string state = "guarded";
};

class Landmarks {
public:
	Landmarks(const std::string &region_id, LmWorks works, LmHost host);
	bool any() const;
	LandmarksRoot save_root() const { return { captured, restored, holder, men, foes, state }; }
	void load_root(const LandmarksRoot &o);
	void tick(double t);
	void reset() { captured = restored = false; }
	void remember(bool c, bool r) { captured = c, restored = r; }
	std::pair<bool, bool> flags() const { return { captured, restored }; }
	bool restore(int squad, double t);
	std::optional<LandmarkSnap> snap() const;

private:
	const Landmark *lm;
	LmWorks works;
	LmHost host;
	bool captured = false, restored = false;
	int holder = -1, men = 0, foes = 0;
	std::string state = "guarded";
	bool has_box = false;
	double box[4] = { 0, 0, 0, 0 };

	std::vector<const LmPiece *> pieces() const;
	void bounds();
	int holder_now() const;
	std::string state_now() const;
	const LmPiece *keep() const;
	void update(double t);
};

} // namespace sim

namespace godot {

// GDScript face of the landmark state (tests replay the TS vectors through it). The pieces come once with set_base
// ([{x, y, tiles, maxHp, landmark}]) and then as changes ([index, team, hp, state, ruin, gone]); the world with
// set_world({dyn: changes, squads: [{team, units} or null], extra: more units, guarded, real: [teams]}) (units: the
// squads' men, then the extra); works answers (`answers`) are popped in call order: ["capture", changes] and
// ["restore", ok, changes]. Every works call and note is recorded: ["capture", share], ["restore", team, cost, x, y],
// ["note", event].
class Landmarks : public RefCounted {
	GDCLASS(Landmarks, RefCounted)

public:
	std::vector<sim::LmPiece> prebuilt;
	std::vector<sim::LmUnit> units;
	std::vector<std::optional<sim::LmSquad>> squads;
	bool guarded = false;
	std::vector<int> real;
	Array answers, calls;
	std::unique_ptr<sim::Landmarks> l;

	std::string region;

	static Ref<Landmarks> create(const String &region_id);
	// a fresh landmark state on the same works and host, with this one's root (createLandmarks, then loadRoot(saveRoot()))
	void reload();
	Dictionary flags() const;
	void set_base(const Array &pieces);
	void set_world(const Dictionary &w);
	void set_answers(const Array &a) { answers = a.duplicate(); }
	Array take_calls();
	bool any() const { return l->any(); }
	void tick(double t) { l->tick(t); }
	void reset() { l->reset(); }
	void remember(bool c, bool r) { l->remember(c, r); }
	Dictionary save_root() const;
	void load_root(const Dictionary &o);
	bool restore(int squad, double t) { return l->restore(squad, t); }
	Variant snap() const;

	static bool can_lead(const String &id, double level, const Variant &perks);
	static Dictionary restore_cost(const String &id);
	static Variant landmark_of_region(const String &region);

protected:
	static void _bind_methods();
};

} // namespace godot
