// The region room (server/src/war/room.ts WarRoom) on the C++ sim, behind the messages of src/war/net/protocol.ts
// (docs/impl/godot-port.md P8, G-04), ported line for line. The core so far: joins (the dev `army` join; persons joins
// once the roster's persons come in), the alliance quota and its line, leave and the hold AI, orders and their checks,
// placement checks, the dev helpers, the camera rect, the tick (sim, bots, the snapshot, corpses, fights, the line),
// one binary frame per online player (codec.h, interest), and the JSON messages of the tick: the economy view
// (influence, fog, stock, town, allies, wild, nodes), souls, dropped goods, mob FX, hidden quest events, slain chiefs
// and guardian events. The rest of room.ts (guide, stories, encounters, settlements, warlords, holders and stows,
// hand-offs, transfers, musters, crafting deposits, the larder, peace, saves) is listed in the P8 entry by wave.
//
// What the Durable Object does round it (sockets, D1, storage) is not here: LocalRoom (local_room.h) is the local
// transport, and the room's outputs that the DO books in D1 (fights, crafted items, souls claimed...) wait for a
// storage interface (G-09).
#pragma once

#include <array>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <vector>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/packed_byte_array.hpp>
#include <godot_cpp/variant/variant.hpp>

#include "codec.h"
#include "js_map.h"
#include "sim.h"

namespace sim {

// src/war/net/protocol.ts and server/src/war/room.ts wire constants (protocol.ts is no data table; the room test checks
// them against the TS: godot/tests/sim/test_room.gd).
struct Net {
	static constexpr int NET_VERSION = 28, QUANT = 8, KEYFRAME_EVERY = 50, WILD_EVERY = 20, VISION = 28, CAMERA_MARGIN = 8, MAX_SQUADS = 3,
		DEFAULT_CAP = 600, ALLIANCES = 4, NODES_EVERY = 10, STORE_NEAR = 8, BOSS_NEAR = 40, CORPSE_TICKS = 300, FIGHT_QUIET = 100, HOLD_RADIUS = 10, HOME_CLAIM_R = 64,
		LABOUR_EVERY = 100; // src/war/net/works.ts
	static const std::vector<std::string> &goods();
};

// interest.ts Rect (a camera rect: corners, inclusive)
struct NetRect {
	double x0, y0, x1, y1;
};

// src/war/net/economy.ts EconomyFeed: one player's economy view, what he was told (so only changes go out). The room's
// WeakMaps keyed by the feed (wild, warlords, allies, secrets sent) are fields of it.
struct EconomyFeed {
	JsMap<int, std::string> sent;
	std::string infl;
	std::shared_ptr<std::vector<int>> last; // the runs last given (TS: by identity)
	std::string goods;
	std::string fogKey;
	bool synced = false;
	std::optional<std::string> wildSent, lordSent, allySent;
	bool secretSent = false;
};

struct RoomOpts {
	uint32_t seed = 1;
	int cap = Net::DEFAULT_CAP;
	std::vector<int> quotas; // empty: cap split evenly
	int keyframeEvery = Net::KEYFRAME_EVERY;
	bool allowArmy = true;
	std::optional<bool> allowDev;
	int fightQuiet = Net::FIGHT_QUIET;
	bool wild = false, roam = false;
	std::optional<int> home;
};

class Room {
public:
	struct Out {
		int pid;
		godot::Variant msg; // a Dictionary (a JSON message) or a PackedByteArray (a binary frame)
	};
	struct TickOut {
		std::vector<std::pair<int, godot::Dictionary>> admitted;
		std::map<int, std::vector<godot::Dictionary>> msgs;
		std::map<int, godot::PackedByteArray> frames;
	};

	Room(Sim &sim, Bots &bots, const godot::Dictionary &meta, const RoomOpts &o);

	int currentTick() const { return int(snap["tick"]); }
	int alive() const;
	int online() const;
	std::vector<int> squadsOf(int pid) const;
	godot::Dictionary quota() const;
	// the room.ts calls the local transport makes (regionDO.ts webSocketMessage)
	godot::Dictionary join(int sessionPid, const godot::Dictionary &m);
	void leave(int pid);
	std::string order(int pid, const godot::Dictionary &o); // "" taken, else the OrderError
	godot::Dictionary check(int pid, const godot::Dictionary &c);
	std::string dev(int pid, const godot::Dictionary &m);
	void view(int pid, const NetRect &r);
	TickOut tick();
	godot::Array settlementsFor(int pid) const { return godot::Array(); } // W-63: none until the settlements wave
	const godot::Dictionary &snapshot() const { return snap; }
	std::string refusal;

private:
	struct Player {
		int pid = 0, team = 0;
		bool online = false;
		std::optional<NetRect> cam;
		std::unique_ptr<DeltaEncoder> enc;
		std::shared_ptr<EconomyFeed> feed;
		int sinceKey = -1;
		double bytes = 0;
	};
	struct Group {
		std::string cls;
		int count = 0;
	};
	struct Waiting {
		int pid = 0, team = 0;
		std::vector<Group> groups;
	};

	Sim &sim;
	Bots &bots;
	godot::Dictionary meta;
	std::string regionId;
	int w = 0, h = 0;
	std::vector<int> per, live;
	JsMap<int, Player> players;
	std::vector<Waiting> queue;
	std::map<int, std::string> owners; // squad id -> owner (a sparse JS array: index order)
	std::map<int, int> teams;
	godot::Dictionary snap;
	int spawns = 0, keyEvery = Net::KEYFRAME_EVERY, lastTick = -1;
	std::map<int, int> diedAt;
	std::set<int> down;
	bool allowArmy = true, allowDev = true;
	int fightQuiet = Net::FIGHT_QUIET, lastBlow = -1;
	bool inFight = false;
	std::map<int, std::pair<int, std::shared_ptr<std::vector<int>>>> inflRuns, fogRuns;
	std::map<int, std::string> townSent;
	std::map<int, int> armies;
	std::map<int, PlayerPath> paths;

	godot::Dictionary admit(int pid, int team, const std::vector<Group> &groups);
	void dequeue(int pid);
	NetRect entry(const std::string &side) const;
	int spawn(const std::string &owner, int team, const Group &g, const std::optional<std::pair<double, double>> &at = std::nullopt, std::optional<std::string> side = std::nullopt);
	std::map<int, std::pair<double, double>> centres() const;
	std::vector<std::pair<int, godot::Dictionary>> drainQueue();
	std::map<int, std::vector<godot::Dictionary>> economy();
	std::vector<int> alliesOf(int pid) const;
	void endFight();
	void townRest(double secs);
	const std::string *ownerAt(int id) const;
};

} // namespace sim
