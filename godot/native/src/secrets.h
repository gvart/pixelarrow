// World-fill hidden quests (src/war/sim/secrets.ts), line for line: who stands near an unfound spot, the runner's small
// snapshot, one StoryRun (stories.h) per player and spot, its saves, and the `secret` events its notes become. THINK and
// NEAR are module consts in TS (not exported) and are spelt out here.
//
// The host gives squads in SecretSquad form (what secrets reads of a sim squad) and the snapshot's lairs and souls in
// the StorySnap shapes the runner reads.
#pragma once

#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>

#include "stories.h"

namespace sim {

constexpr double SECRET_THINK = 10;
inline const double SECRET_NEAR = STORY_R.talk + 14;

struct SecretSquad {
	int id = 0, team = 0, alive = 0;
	std::string owner;
	bool civ = false;
	double cx = 0, cy = 0;
	struct Unit {
		std::optional<int> id;
		double x = 0, y = 0;
		bool alive = false;
		std::optional<std::string> cls;
	};
	std::vector<Unit> units;
};

// a `secret` WarEvent
struct SecretEvent {
	double t = 0;
	std::string what, quest, owner, title, text;
	int team = 0;
	double x = 0, y = 0;
	std::optional<std::vector<std::pair<std::string, double>>> goods;
	struct To {
		double x = 0, y = 0;
		std::string label;
	};
	std::optional<To> to;
};

struct SecretHost {
	std::function<const std::vector<SecretSquad> &()> squads;
	std::function<std::vector<StorySnap::Lair>()> lairs;
	std::function<std::vector<StorySnap::Soul>()> souls;
	std::function<void(const LairAsk &)> add_lair;
	std::function<void(double x, double y, const std::string &cls, double level)> spawn_soul;
	std::function<void(const std::string &owner, const std::string &name, double x, double y, const std::vector<std::pair<std::string, double>> &goods, const std::vector<Item> &items)> give;
	std::function<void(const SecretEvent &)> note;
};

struct SecretSave {
	StorySave save;
	int team = 0;
};
// saveRoot: the saves by `${quest index}|${owner}` (a JS object of non-index keys: insertion order) and the tick
struct SecretsRoot {
	std::vector<std::pair<std::string, SecretSave>> saves;
	double tick = 0;
};

class Secrets {
public:
	// meta: the region's JSON (hiddenStories); region: what the runner reads of it (stories.h)
	Secrets(const godot::Dictionary &meta, const StoryRegion &region, SecretHost host);
	SecretsRoot save_root() const { return { saves, tick_ }; }
	// TS loadRoot sets the tick and drops the runs; the saves come back in place through the state's graph decode, so
	// here they come with the root
	void load_root(const SecretsRoot &o);
	const std::vector<Story> &stories() const { return stories_; }
	std::vector<SecretEvent> open(const std::string &owner);
	const StorySave *save(int n, const std::string &owner) const;
	void tick(double t);

private:
	const StoryRegion &region;
	SecretHost host;
	std::vector<Story> stories_;
	std::vector<std::pair<std::string, SecretSave>> saves;
	std::map<std::string, std::unique_ptr<StoryRun>> runs; // a Map read by key only
	double tick_ = 0;

	SecretSave *save_at(const std::string &key);
	StoryRun &run(int n, const std::string &owner, int team);
	StorySnap look(const std::vector<std::string> &owners) const;
	void tell(int n, const std::string &owner, int team, const std::vector<StoryNote> &notes);
	SecretEvent next_line(const Story &story, const StorySpots &spots, const StorySave &save, const std::string &owner, int team, const std::string &text) const;
};

} // namespace sim

namespace godot {

// GDScript face of the hidden quests (tests replay the TS vectors through it). set_world(squads, lairs, souls) as the
// TS host shapes; every host call is recorded: ["addLair", {...}], ["spawnSoul", x, y, cls, level], ["give", owner,
// name, x, y, goods, items], ["note", event].
class Secrets : public RefCounted {
	GDCLASS(Secrets, RefCounted)

public:
	sim::StoryRegion region;
	std::vector<sim::SecretSquad> squads;
	std::vector<sim::StorySnap::Lair> lairs;
	std::vector<sim::StorySnap::Soul> souls;
	Array calls;
	std::unique_ptr<sim::Secrets> s;

	static Ref<Secrets> create(const Dictionary &meta, const Ref<Grid> &grid);
	void set_world(const Array &squads, const Array &lairs, const Array &souls);
	Array take_calls();
	void tick(double t) { s->tick(t); }
	Array open(const String &owner);
	Variant save(int n, const String &owner) const;
	int stories() const { return int(s->stories().size()); }
	Dictionary save_root() const;
	void load_root(const Dictionary &o);

protected:
	static void _bind_methods();
};

} // namespace godot
