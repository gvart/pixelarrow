// LocalRoom: the region room (room.h) on a local Sim with no network (docs/impl/godot-port.md P8, G-04, G-09). It
// stands where server/src/war/regionDO.ts stands round WarRoom online: a client message in (send: the local player;
// send_as: any player, the AI's or a test's), the room's tick, and the server messages out in a queue (take), as the
// sockets would carry them: per client in the order each first spoke, a Dictionary for a JSON message and a
// PackedByteArray for a binary frame. What the DO adds round the room (sockets, auth, abuse, chat, the world DO, the
// gate) is not here; what it keeps in D1 and DO storage is the room store's (room_store.h, G-09: a MemoryStore here).
//
// The local transport, as src/dev/vectors/room.ts TsLocal (which the Godot test replays):
//  - send: the message checked as parseClientMsg would (its shape: a full port of the zod schema is its own wave),
//    then join / order / view / ping / check / dev as webSocketMessage handles them. A welcome is followed by the
//    settlements list. pong carries no `ms` (wall clock); idle is alive() == 0 (the local loop never rests). A persons
//    join claims its men from the store first (refused: released); a welcome sets his path, army and larder from the
//    store and musters his men lying here (W-98).
//  - close: the player's socket went away (room.leave); dropped joins are released.
//  - tick: one room tick, its books into the store (fights, faded souls, raids, soul claims, larder draws, as the DO
//    writes them to D1), then per client: his admitted message (a welcome from the line, with its settlements), his
//    tick messages, his binary frame.
//  - call_op: what the DO and the world call on the room (seed, depart, arrive, muster, hired, levelUp, setPath,
//    spawnSoul, save, restore), with the store round it as TsLocal.call.
// The store's clock is the room's: tick * 100 ms (regionDO.ts TICK_MS).
#pragma once

#include <memory>
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

	void conn(int p);
	void tell(int p, const Variant &m);
	double now() const { return room->currentTick() * 100.0; }
	bool wake(const sim::StoredSoul &s);
	void flush();
	void muster(int p);
	static sim::RoomOpts room_opts(const Ref<Sim> &s, const Dictionary &o);

public:
	// sim: a fresh Sim (Sim.create; its seed is the room's); opts: room.ts RoomOptions (cap, quotas, keyframeEvery,
	// allowArmy, allowDev, fightQuiet, wild, roam, home) and pid, the local player (default 1)
	static Ref<LocalRoom> create(const Ref<Sim> &sim, const Dictionary &opts);
	void send(const Dictionary &msg) { send_as(pid, msg); }
	void send_as(int pid, const Dictionary &msg);
	// his socket went away (regionDO.ts webSocketClose): his squads hold where they stand (W-07)
	void close(int pid);
	void tick();
	// what the last tick handed the store ({fights, souls, raided, faded, larder}; empty when it handed nothing)
	Dictionary tick_books() const { return books; }
	// a call the DO or the world makes on the room, or a store seed (op and args as src/dev/vectors/room.ts); its
	// result as TS has it. Its messages (a welcome) go to take().
	Variant call_op(const String &op, const Array &args);
	// the store as JSON (room_store.h MemoryStore::dump)
	Dictionary store_dump() const { return store->dump(); }
	// the server messages since the last take: [pid, Dictionary | PackedByteArray] each
	Array take();
	Dictionary snapshot() const;
	int current_tick() const { return room->currentTick(); }
	// the wire constants (room.h Net; MAX_SQUAD from the soldiers' table)
	static Dictionary constants();
	// JSON.stringify as V8 writes it (js_json.h): the test compares messages by it, key order and numbers as TS has them
	static String js_json(const Variant &v);

protected:
	static void _bind_methods();
};

} // namespace godot
