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
#include "alliance_ai.h"
#include "season_clock.h"

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

// index.ts memory() and recall(m, elapsed): what a region room keeps of its sim between visits.
struct RegionMemory {
	std::vector<PreRow> pieces;
	std::vector<int> claims; // by claim point; -1: nobody
	std::vector<BossMemo> guardians;
	std::pair<bool, bool> landmark; // captured, restored
};
RegionMemory sim_memory(Sim &s);
// aiSeason.ts summary: claim points held and living fighting men per alliance.
struct RoomSummary {
	std::vector<double> claims, live;
};
RoomSummary room_summary(const AiSnap &snap);
godot::String ps(const std::string &s);
void sim_recall(Sim &s, const RegionMemory &m, double elapsed);

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
	// the headless AI-vs-AI season (start_season)
	std::vector<std::unique_ptr<sim::AllianceAi>> ais;
	std::unique_ptr<sim::SeasonClock> clock;

	static Ref<WarHost> create(const Ref<Sim> &sim);
	// worker.ts 'warlords': createWarlords(region, sim, bots, 1), setAge, setPlayers, raid (seconds; null: none) raidNow(raid * 10).
	// False: the region lies in no warlord's domain.
	bool start_warlords(double age, double players, const Variant &raid);
	// aiSeason.ts createAiSeason on this sim (fresh): spawnMobs, the held claim points recalled (an Array by point, -1
	// nobody; null: none), the warlords on `seed` at `age`, one alliance AI per alliance and the clock (0, length_ms).
	void start_season(double seed, double length_ms, double age, const Variant &held);
	// One host tick; with a season, true once it has ended (then nothing steps).
	bool step();
	// The season: each alliance AI's stats with men and present; the clock (scores, accruedAt, hegemony, ended, owners,
	// claims of this region); the snapshot's claim points [id, team, state, squad, progress, taking or null] and engines
	// [id, type, team, x, y, state, hp].
	Array ai_stats() const;
	Dictionary clock_state() const;
	Array claim_rows() const;
	Array siege_rows() const;
	// The warlords' notes since the last call (WarEvent 'warlord' as [t, what, warlord, name, text, x, y, place, team, in]).
	Array warlord_notes();
	Array warlord_snaps() const;
	double warlord_men() const { return lords ? lords->men() : 0; }

protected:
	static void _bind_methods();
};

} // namespace godot
