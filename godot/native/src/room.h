// The region room (server/src/war/room.ts WarRoom) on the C++ sim, behind the messages of src/war/net/protocol.ts
// (docs/impl/godot-port.md P8, G-04), ported line for line. The core so far: joins (the dev `army` join and persons
// joins, released persons), the alliance quota and its line, leave and the hold AI, orders and their checks,
// placement checks, the dev helpers, the camera rect, the tick (sim, bots, the snapshot, corpses, fights, the line),
// one binary frame per online player (codec.h, interest), and the JSON messages of the tick: the economy view
// (influence, fog, stock, town, allies, wild, nodes), souls, dropped goods, mob FX, hidden quest events, slain chiefs
// and guardian events. Wave A (room_persons.cpp): fight reports and honours, level-ups, soul claims, captives, the
// larder, transfers (depart, arrive, muster, hired) and saveState / restore. Wave D, the region's life (guide, stories,
// encounters, warlords, world events, memory, summary, the wild's deeds and tasks), is room_life.cpp. The rest of
// room.ts (settlements, holders and stows, hand-offs, crafting deposits, peace) is listed in the P8 entry by wave.
//
// What the Durable Object does round it (sockets, D1, storage) is not here: LocalRoom (local_room.h) is the local
// transport, and the room's outputs that the DO books in D1 (fights, souls claimed, larder draws...) go to the room
// store (room_store.h, G-09).
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
#include "settle.h"
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

struct RoomLife; // wave D (room_life.cpp): the guide, stories, encounters, warlords, world events, the wild's deeds and tasks
struct RoomPolitics; // wave C (room_settle.cpp): settlements, oaths, pacts, works, town jobs

class Room {
public:
	struct Out {
		int pid;
		godot::Variant msg; // a Dictionary (a JSON message) or a PackedByteArray (a binary frame)
	};
	// the persons' wave (room_persons.cpp): a finished fight's report (its id the DO books it under), a soul claimed
	// (the DO writes the new man), a transfer out, a muster or hire
	struct Fight {
		std::string id;
		FightReport report;
	};
	struct SoulClaim {
		int pid = 0, squad = 0, unit = 0;
		godot::Dictionary person;
	};
	struct Departed {
		std::string error, detail; // "": gone
		std::vector<std::string> ids;
		double off = 0;
		std::vector<std::pair<std::string, double>> lost;
		std::optional<Fight> fight;
		std::optional<godot::Dictionary> cargo; // TransitCargo
	};
	struct Arrived {
		std::string error; // "": in ('full' | 'team' | 'squads')
		int squad = -1;
		godot::Dictionary msg; // empty: null
	};
	struct Mustered {
		bool ok = false; // false: null (no room now)
		godot::Dictionary msg; // empty: null
	};
	struct TickOut {
		std::vector<std::pair<int, godot::Dictionary>> admitted;
		std::map<int, std::vector<godot::Dictionary>> msgs;
		std::map<int, godot::PackedByteArray> frames;
		// what the DO books (room.ts tick): guide steps done, story and encounter runs moved (GuideDone, StoryDone,
		// EncounterDone as their TS objects), the wild's deeds (WildDeed), the tasks' tallies ([pid, metric, n], each
		// LABOUR_EVERY) and the warlords' notes
		godot::Array guided, storied, met, wild, gathered, warlord;
		std::vector<Fight> fights;
		std::vector<SoulClaim> souls;
		std::vector<int> raided;
		std::vector<std::string> faded;
		std::vector<std::pair<int, Cost>> larder;
		godot::Dictionary peace, settle; // wave C: room.ts Peace and SettleOut as their TS objects (empty: null)
	};
	// saveState: the RoomState JSON text, its head (all but sim and bots) and the sim's and bots' texts in it
	struct Saved {
		std::string text, sim, bots;
		godot::Dictionary head;
	};

	Room(Sim &sim, Bots &bots, const godot::Dictionary &meta, const RoomOpts &o);
	~Room();

	int currentTick() const { return int(snap["tick"]); }
	int alive() const;
	int online() const;
	std::vector<int> squadsOf(int pid) const;
	godot::Dictionary quota() const;
	// the room.ts calls the local transport makes (regionDO.ts webSocketMessage)
	// persons: the join's squads loaded from storage, one list per m.squads entry; needed unless it is a rejoin
	godot::Dictionary join(int sessionPid, const godot::Dictionary &m, const std::vector<std::vector<WarPerson>> *persons = nullptr);
	void leave(int pid);
	std::string order(int pid, const godot::Dictionary &o); // "" taken, else the OrderError
	godot::Dictionary check(int pid, const godot::Dictionary &c);
	std::string dev(int pid, const godot::Dictionary &m);
	void view(int pid, const NetRect &r);
	TickOut tick();
	godot::Array settlementsFor(int pid) const; // W-63 (room_settle.cpp)
	const godot::Dictionary &snapshot() const { return snap; }
	std::string refusal;
	std::string run; // M5h4: the region run (crafted event keys; saved)
	std::string epoch = "e"; // RoomOptions.epoch: fight ids `${region}:${epoch}:${tick}` (online: the DO's start)

	// the persons (room_persons.cpp): the DO's calls round a join, the transfers, musters and hires, the larder, the
	// paths and levels, a level-up spend, and the save and restore
	bool spawnsNew(int pid) const;
	std::set<std::string> personsHere() const;
	std::vector<std::string> takeReleased() { return std::exchange(released, {}); }
	Departed depart(int pid, const std::string &side, double foeRadius);
	Arrived arrive(int pid, int team, const std::vector<WarPerson> &persons, const std::string &side, const std::vector<std::pair<std::string, double>> &lost, const godot::Dictionary &cargo);
	Mustered muster(int pid, const std::vector<WarPerson> &persons);
	Mustered hired(int pid, const std::vector<WarPerson> &persons);
	std::vector<int> playerIds() const;
	void setLarder(int pid, const Cost &goods);
	void setPath(int pid, const PlayerPath &way);
	void setLevel(int pid, double level);
	void setArmy(int pid, int n) { armies[pid] = n; }
	std::string levelUp(const std::string &id, const std::vector<std::pair<std::string, double>> &attrs, const std::optional<std::string> &skill); // 'ok' | 'absent' | a refusal
	Saved saveState(const std::string &simText) const; // simText: Sim.save (the host has the fresh sim it diffs against)
	// into a fresh room (wild and roam off) on a fresh sim: the state saved, the persons storage still has deployed here
	bool restore(const godot::Dictionary &head, const std::string &simText, const std::string &botsText, const std::set<std::string> &persons, std::string &why);

	// ---- wave D, the region's life (room_life.cpp), as room.ts names them
	// what the TS constructor makes of the region beyond the sim (cells and the fresh grid: the guide's spots, the
	// encounters' and stories' ground); `warlords`: RoomOptions.warlords
	void startLife(const godot::PackedByteArray &cells, const Grid &fresh, bool warlords);
	// a welcomed player's guide, story, encounters (his saves; home: his home region, "" the alliance's): the message
	// to send him (nil: none here)
	godot::Variant startGuide(int pid, const godot::Variant &save, const std::string &home = "");
	godot::Variant startStory(int pid, const godot::Variant &save);
	godot::Variant startEncounters(int pid, const godot::Variant &save);
	void storyChoose(int pid, const std::string &option);
	void encounterChoose(int pid, const std::string &option);
	godot::Variant guideHide(int pid); // room.guide.hide: his save (nil: no run)
	godot::Variant guideSaveOf(int pid) const; // room.guide.saveOf
	void guideMark(int pid, const std::string &step); // a step done outside the sim (a deal with a town)
	void guideDeparted(int pid, const std::string &to);
	void encountersRoad(int pid, double loads, const std::string &key); // W-197: robbers wait for him?
	void storyTrade(int pid, const std::string &op, double coin, double abroad);
	void setWorldEvents(const godot::Array &evs);
	double bossLoot() const; // W-62: a slain guardian's rare goods times this (WAKE.loot during a boss wake)
	void wakeGuardians();
	void setWarlordAge(double days);
	godot::Variant warlordMemory() const;
	void recallWarlords(const godot::Dictionary &m);
	// RoomState.warlords (the director's exportState; nil: no warlords here) and back (restore)
	godot::Variant warlordsState() const;
	void loadWarlords(const godot::Dictionary &st);
	void warlordFell(const std::string &id, double at);
	int present() const;
	godot::Dictionary memory();
	void recall(const godot::Dictionary &m, double elapsed);
	godot::Dictionary summary();

	// ---- wave C, settlements and politics (room_settle.cpp), as room.ts names them: what the DO polls in (the region's
	// settlements, the oaths and pacts in force, the guard contracts watched, the home's open works, town jobs) and reads
	// back (the settlements' reports, the tribute held, presence, store goods); restorePieces lays a settlement down
	// again on a fresh field (its centre's new id)
	void setSettlements(const std::vector<RoomSettle> &list);
	void setOaths(const std::vector<Oath> &list);
	void setPacts(const std::vector<PactIn> &list);
	godot::Array settlementReports() const;
	godot::Array titheReports() const;
	std::optional<int> restorePieces(int team, double x, double y, double r, const godot::Array &pieces);
	bool presence(int pid, int id) const;
	godot::Dictionary storeGoods(int id);
	void setGuards(const std::vector<GuardWatch> &list);
	void setWorks(int team, const std::vector<std::string> &ids);
	void watchTownJob(int id, int pid, double x, double y);
	void unwatchTownJob(int id);
	std::vector<int> pathPlayers() const;
	// W-195 a band a town contract asked for (the contracts' board is not here yet: none)
	bool townBandIs(int) const { return false; }

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
		std::optional<std::vector<WarPerson>> persons;
	};
	struct Waiting {
		int pid = 0, team = 0;
		std::vector<Group> groups;
		godot::Dictionary join; // the JoinMsg (saved)
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
	JsMap<int, PlayerPath> paths;
	// the persons' wave: person ids let go (dropped joins), teams that took a fort in the fight (honours), the players'
	// own alliances (W-63), W-80 the larders and what was drawn from them (JS Maps: insertion order)
	std::vector<std::string> released;
	JsSet<int> stormed;
	JsMap<int, int> own;
	JsMap<int, std::pair<double, double>> larders, drawn; // food, ration
	bool isHome = false;
	// W-63: camps and forts placed, until their site shows (settleTick), and who placed each (saved)
	struct PendingCamp {
		int pid = 0, team = 0;
		std::string type;
		double x = 0, y = 0;
		int tick = 0;
	};
	std::vector<PendingCamp> pendingCamps;
	JsMap<int, int> campBy;
	void campsTick();
	std::vector<Group> parts(const std::vector<WarPerson> &persons) const;
	double draw(const std::string &owner, double want);
	std::vector<std::pair<int, Cost>> drainDrawn();
	void honour(FightReport &report);
	void recount();
	void personsTick(TickOut &out, const std::vector<godot::Dictionary> &evs);

	godot::Dictionary admit(int pid, int team, const std::vector<Group> &groups);
	void dequeue(int pid);
	NetRect entry(const std::string &side) const;
	int spawn(const std::string &owner, int team, const Group &g, const std::optional<std::pair<double, double>> &at = std::nullopt, std::optional<std::string> side = std::nullopt);
	std::map<int, std::pair<double, double>> centres() const;
	std::vector<std::pair<int, godot::Dictionary>> drainQueue();
	std::map<int, std::vector<godot::Dictionary>> economy();
	std::vector<int> alliesOf(int pid) const;
	FightReport endFight();
	void townRest(double secs);
	const std::string *ownerAt(int id) const;
	// wave D hooks in tick() and economy() (room_life.cpp)
	std::shared_ptr<RoomLife> life; // shared: deleted where RoomLife is whole
	uint32_t seed = 1; // RoomOptions.seed and .home, as the life reads them
	std::optional<int> home;
	void lifeLords(TickOut &out);
	void lifeGather();
	void lifeMessages(TickOut &out, const std::vector<godot::Dictionary> &evs);
	void lifeLordMessages(TickOut &out);
	void lifeBooks(TickOut &out, const std::vector<godot::Dictionary> &evs);
	void lifeFeed(Player &p, std::map<int, std::vector<godot::Dictionary>> &out, godot::Dictionary &lords, std::string &lordKey);
	// wave C hooks (room_settle.cpp): the settlements, pacts, oaths, town jobs and works the room holds (made on first use)
	mutable std::shared_ptr<RoomPolitics> pol_;
	RoomPolitics &P() const;
	std::optional<int> bannerTeam(int pid) const;
	std::string pactWith(int a, int b) const; // "pact" | "truce" | "" none
	void tellLater(int pid, const godot::Dictionary &m);
	void roomOrder(const godot::Dictionary &o);
	std::optional<std::string> groundRefusal(int pid, int team, const godot::Dictionary &o);
	godot::Dictionary settleTick(); // after campsTick, every SETTLE_EVERY: camps to found, attacks, claims being taken
	void flushLater(TickOut &out);
	godot::Dictionary peace(); // every LABOUR_EVERY: townRest, then the labour, guards, works and town jobs
	bool townWorking() const;
	godot::Dictionary atTownWork(const godot::Dictionary &u) const;
	void settleSave(godot::Dictionary &settle) const;
	void settleLoad(const godot::Dictionary &settle);
};

} // namespace sim
