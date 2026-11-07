// LocalWorld: the offline world layer (docs/impl/godot-port.md P11), the C++ of src/dev/localWorld.ts TsWorld line for
// line. It stands where WarWorldDO (server/src/war/world/worldDO.ts) stands round the World (world.h), with the region
// rooms as LocalRooms (local_room.h, the regionDO.ts round each room) on one store (the D1 of all of them), and no
// sockets, storage or alarms:
//  - rooms: the regions given, each a LocalRoom on a fresh Sim of its own seed and options, in the order given; they all
//    tick in step (one world tick is one tick of every room). A region with no room is away (a transfer there waits:
//    unavailable).
//  - clock: now = tick * ms_per_tick (season time; the rooms' and the store's clocks stay tick * 100 ms).
//  - step(): room by room, its tick; a warlord fallen there told to the other rooms of his domain; the warlords' age every
//    600 ticks; temples razed off the razer's score; the room's alliance AIs (alliance_ai.h) on its sim and bots; its
//    report to the world every REPORT_TICKS when its summary changed. Then the world's alarm when due: world events
//    opened and closed, the season advanced, arrivals and haul legs, then the rollover (a season over: the board kept,
//    every room anew, the store wiped, the next season) or the rooms told the events.
//  - transfer(pid, {from, to, path?}): the world socket's answer, {t: 'transferred', transit} or {t: 'error', code,
//    detail}; his alliance is the store's (seed). set_online: W-97, a player back online wakes his haul.
//  - snapshot(pid): the world map message {t: 'world', season, score, at, you, alliances, regions, transit, convoys,
//    boards, events, last, crests} (src/war/net/world.ts WorldSnapshot; members per alliance from the store).
//  - send(region, pid, msg): a client message to a room; take(): every message out since the last take, as
//    [region, pid, Dictionary | PackedByteArray] in the order they were sent.
#pragma once

#include <memory>
#include <set>
#include <string>
#include <utility>
#include <vector>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>

#include "alliance_ai.h"
#include "local_room.h"
#include "room_store.h"
#include "world.h"

namespace godot {

class LocalWorld : public RefCounted {
	GDCLASS(LocalWorld, RefCounted)

	struct Here {
		std::string id;
		Ref<LocalRoom> room;
		std::vector<std::unique_ptr<sim::AllianceAi>> ais;
		std::string reported;
		std::vector<std::pair<std::string, double>> fallen; // warlordFell's memory (DO storage): by lord, the age he fell at
	};
	Array specs;
	std::vector<Here> rooms;
	std::shared_ptr<sim::MemoryStore> store;
	std::unique_ptr<sim::World> world;
	double msPerTick = 100;
	int64_t tick = 0;
	std::set<int> live; // W-97: who has a socket
	double lordsFrom = 0;
	Array out;

	double now() const { return double(tick) * msPerTick; }
	Here *here(const std::string &id);
	void build();
	void drain(Here &h);
	void report(Here &h, bool force = false);
	void announce();
	void alarm(double now);
	void rollover(double now);

	// the rooms as the world reaches them (worldDO.ts ports)
	struct Ports : sim::WorldPorts {
		LocalWorld *w = nullptr;
		Dictionary depart(const std::string &from, int pid, const std::string &side, const std::string &to, double foeRadius) override;
		Dictionary arrive(const std::string &to, int pid, int alliance, const Array &ids, const std::string &side, const Variant &lost, const Variant &cargo) override;
		bool online(int pid) override { return w->live.count(pid) > 0; }
	} ports;

public:
	LocalWorld() { ports.w = this; }

	// rooms: [{id, seed, opts, ai?: [teams], held?: [by claim point, -1 nobody], grid, meta, cells}] (grid, meta and cells
	// as Sim.create takes them; Region.load_id(id) gives them); opts: {ms_per_tick?, season?: {lengthMs, travelScale,
	// offExitMsPerTile, foeRadius}, start?}
	static Ref<LocalWorld> create(const Array &rooms, const Dictionary &opts);
	// what the C++ keeps of favour.ts, world.ts and regionDO.ts (no data tables): checked against the TS by test_world.gd
	static Dictionary constants();
	void step();
	Dictionary transfer(int pid, const Dictionary &order);
	void set_online(int pid, bool on);
	Dictionary snapshot(int pid);
	void send(const String &region, int pid, const Dictionary &msg);
	Array take();
	// a player's men into the store (away, at home) and his alliance (the store seeds the DO's D1 rows would be)
	void seed(int pid, int alliance, const Array &persons);
	// looks: the world state (WorldState, a copy), a room (null: none there), the room ids in order, a room's alliance AIs
	// (stats with men and present), the store as JSON, the world tick and its season time
	Dictionary state() const { return world->st.duplicate(true); }
	Ref<LocalRoom> room(const String &region);
	PackedStringArray room_ids() const;
	Array ai_stats(const String &region);
	Dictionary store_dump() const { return store->dump(); }
	int64_t get_tick() const { return tick; }
	double get_now() const { return now(); }

protected:
	static void _bind_methods();
};

} // namespace godot
