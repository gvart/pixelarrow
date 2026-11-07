// LocalRoom: the region room (room.h) on a local Sim with no network (docs/impl/godot-port.md P8, G-04, G-09). It
// stands where server/src/war/regionDO.ts stands round WarRoom online: a client message in (send: the local player;
// send_as: any player, the AI's or a test's), the room's tick, and the server messages out in a queue (take), as the
// sockets would carry them: per client in the order each first spoke, a Dictionary for a JSON message and a
// PackedByteArray for a binary frame. What the DO adds round the room (sockets, auth, abuse, chat, the world DO, the
// gate) is not here; what it keeps in D1 and DO storage is the room store's (room_store.h, G-09: a MemoryStore here).
//
// The local transport, as src/dev/vectors/room.ts TsLocal (which the Godot test replays):
//  - send: the message parsed as parseClientMsg parses it (room_parse.h: the zod schema, its stripped output), then join /
//    order / view / ping / check / dev / guide / story / encounter as webSocketMessage handles them. A persons join
//    claims its men from the store first (refused: released). A welcome is followed by the world events (once any were
//    set), the settlements list, then in the DO's order his path and army from the store, his guide, his larder, his
//    story and encounters (guideStart, storyStart, encounterStart, each from its save in the store; mastery is D1's)
//    and the muster of his men lying here (W-98); a dev class army (no men in the store) gets only his guide, story
//    and encounters. pong carries no `ms` (wall clock); idle is alive() == 0.
//  - close: the player's socket went away (room.leave); dropped joins are released.
//  - tick: one room tick, its books into the store (fights, faded souls, raids, soul claims, larder draws, as the DO
//    writes them to D1), then per client: his admitted message (a welcome from the line: his guide, story, encounters,
//    then the settlements), his tick messages, his binary frame; then the tick's guide, story and encounter saves into
//    the store. What the tick handed the DO is kept for the caller (books).
//  - call_op: what the DO and the world call on the room (seed, depart, arrive, muster, hired, levelUp, setPath,
//    spawnSoul, save, restore), with the store round it as TsLocal.call.
//  - set_world_events: the world's RPC (worldEvents): the events running here now onto the room, a guardian woken once
//    per boss wake, every client told.
// The store's clock is the room's: tick * 100 ms (regionDO.ts TICK_MS).
#pragma once

#include <functional>
#include <map>
#include <memory>
#include <set>
#include <string>
#include <vector>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>

#include "room.h"
#include "room_store.h"
#include "sim.h"

namespace godot {

class LocalRoom : public RefCounted {
	GDCLASS(LocalRoom, RefCounted)

	Ref<Sim> sim;
	std::unique_ptr<sim::Room> room;
	std::unique_ptr<sim::MemoryStore> store = std::make_unique<sim::MemoryStore>();
	Dictionary opts;
	std::vector<int> conns;
	Array out;
	Dictionary books;
	std::string saved;
	int pid = 1;
	Dictionary worldEv;
	Variant woke;

	void conn(int p);
	void tell(int p, const Variant &m);
	void welcomed(int p, const std::function<void()> &between = nullptr);
	Dictionary world_msg() const;
	double now() const { return room->currentTick() * 100.0; }
	bool wake(const sim::StoredSoul &s);
	void flush();
	void muster(int p);
	static sim::RoomOpts room_opts(const Ref<Sim> &s, const Dictionary &o);

	// wave C (local_settle.cpp), regionDO.ts round the settlements and politics. The DO's own memory (an eviction starts
	// it over): sockets open, each player's settlements view as last sent, the pieces and tithes as last reported, the
	// lairs as favourTick last saw them, the labour favour owed (favour.ts BUILT)
	std::set<int> live;
	std::map<int, std::string> settleSent, persistSent;
	std::string heldKey;
	std::map<int, std::string> lairsSeen;
	std::map<int, double> builtOwed;
	void loadSettlements();
	void sendSettlements(int p, bool fresh = false);
	void restoreSettlements();
	void reportSettlements(bool all);
	void reportTithes();
	void pollPeace();
	void politics(const sim::Room::TickOut &res);
	void settleReset();
	bool settleOp(const std::string &op, const Array &a, Variant &res); // false: not a wave C op
	static void settleConstants(Dictionary &c);

public:
	// sim: a fresh Sim (Sim.create; its seed is the room's); opts: room.ts RoomOptions (cap, quotas, keyframeEvery,
	// allowArmy, allowDev, fightQuiet, wild, roam, home) and pid, the local player (default 1)
	static Ref<LocalRoom> create(const Ref<Sim> &sim, const Dictionary &opts);
	void send(const Dictionary &msg) { send_as(pid, msg); }
	void send_as(int pid, const Dictionary &msg);
	// his socket went away (regionDO.ts webSocketClose): his squads hold where they stand (W-07)
	void close(int pid);
	void tick();
	// a call the DO or the world makes on the room, or a store seed (op and args as src/dev/vectors/room.ts); its
	// result as TS has it. Its messages (a welcome) go to take().
	Variant call_op(const String &op, const Array &args);
	// the store as JSON (room_store.h MemoryStore::dump)
	Dictionary store_dump() const { return store->dump(); }
	// the server messages since the last take: [pid, Dictionary | PackedByteArray] each
	Array take();
	Dictionary snapshot() const;
	int current_tick() const { return room->currentTick(); }
	// what the last tick handed the DO, each non-empty one (room.ts tick): fights, raided, souls, faded, guided, storied,
	// met, wild, larder, gathered, warlord
	Dictionary get_books() const { return books; }
	void set_world_events(const Array &events, const Variant &next, double now);
	void set_warlord_age(double days) { room->setWarlordAge(days); }
	Variant warlord_memory() const { return room->warlordMemory(); }
	void recall_warlords(const Dictionary &m) { room->recallWarlords(m); }
	Dictionary memory() { return room->memory(); }
	void recall(const Dictionary &m, double elapsed) { room->recall(m, elapsed); }
	Dictionary summary() { return room->summary(); }
	int present() const { return room->present(); }
	double boss_loot() const { return room->bossLoot(); }
	// W-197: he came over the border with `loads` of goods (room.encounters.road; the transfers' arrival calls it)
	void road(int pid, double loads, const String &key) { room->encountersRoad(pid, loads, key.utf8().get_data()); }
	// parseClientMsg (room_parse.h): the stripped message, nil when refused
	static Variant parse(const Variant &raw);
	// the wire constants (room.h Net; MAX_SQUAD from the soldiers' table)
	static Dictionary constants();
	// JSON.stringify as V8 writes it (js_json.h): the test compares messages by it, key order and numbers as TS has them
	static String js_json(const Variant &v);

protected:
	static void _bind_methods();
};

} // namespace godot
