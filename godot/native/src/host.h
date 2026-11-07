// The host loop round one region's sim, as the sandbox (src/war/view/worker.ts tick) and the region room
// (server/src/war/room.ts tick) run it: each tick the sim steps, then its bots, then the region's rival warlords
// (src/war/sim/warlords.ts) think on that tick's snapshot. SimWarlordsHost is the director's view of the real sim and
// bots (the calls the TS makes on WarBuildSim and Bots); warlords_snap is what it reads of sim.snapshot().
#pragma once

#include <memory>
#include <vector>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>

#include "sim.h"
#include "sim_data.h"
#include "warlords.h"

namespace sim {

struct SimWarlordsHost : WarlordsHost {
	Sim *s = nullptr;
	Bots *bots = nullptr;
	double influence_w() override;
	int influence_at(double t) override;
	int spawn_wild(const std::string &owner, const std::string &kind, double count, double x, double y, const SpawnScale &k) override;
	void drop_pile(double x, double y, const std::vector<Lot> &lots, const std::vector<Item> &items) override;
	void order(const WarlordOrder &o) override;
	void drop_squad(int squad) override;
	void bot_set(int squad, const Behaviour &b) override;
	void bot_clear(int squad) override;
};

// What the warlords read of sim.snapshot() (index.ts snapshot: units, squads, buildings, sieges, claims).
WarlordsSnap warlords_snap(Sim &s);

} // namespace sim

namespace godot {

class Sim;

// GDScript face of the host loop: WarHost.create(sim); start_warlords as the sandbox's 'warlords' message does; step()
// is one host tick (sim, bots, warlords). The warlords' notes pile up until warlord_notes() drains them.
class WarHost : public RefCounted {
	GDCLASS(WarHost, RefCounted)

public:
	Ref<Sim> sim;
	sim::SimWarlordsHost lordHost;
	std::unique_ptr<sim::WarlordsRegion> lordRegion;
	std::unique_ptr<sim::Warlords> lords;
	std::vector<sim::WarlordNote> notes;

	static Ref<WarHost> create(const Ref<Sim> &sim);
	// worker.ts 'warlords': createWarlords(region, sim, bots, 1), setAge, setPlayers, raid (seconds; null: none) raidNow(raid * 10).
	// False: the region lies in no warlord's domain.
	bool start_warlords(double age, double players, const Variant &raid);
	void step();
	// The warlords' notes since the last call (WarEvent 'warlord' as [t, what, warlord, name, text, x, y, place, team, in]).
	Array warlord_notes();
	Array warlord_snaps() const;
	double warlord_men() const { return lords ? lords->men() : 0; }

protected:
	static void _bind_methods();
};

} // namespace godot
