// The room's storage (docs/impl/godot-port.md G-09): one neutral interface for what the region Durable Object keeps for
// a room online (D1: the persons book of server/src/war/persons.ts and captives.ts, the home strongroom's goods the
// larder reads; DO storage: the room's save), and MemoryStore, its offline implementation in memory with a JSON file
// (FileAccess) under it. LocalRoom (local_room.h) drives the room through it as regionDO.ts drives WarRoom through D1.
//
// MemoryStore keeps the SQL rules over plain records, in record insertion order (src/dev/roomStore.ts is its TS reading,
// which the room vectors run): claimForJoin (listed twice, not his, not fit, already in the field; the claim marks his
// region), release, applyFight (once per fight id: XP and tallies, wounded HEAL.field, captives held by the captor's
// first player up to HOLD_MAX a fort, the dead lose their gear, a battle honour, deeds and scars), claimSoul (a named
// soul moves to the claimer; a new man under his path's cap), fade, freeRaided and the captives due (toSouls: souls wake
// in the room, else fade), armyCount, offField, deployed and the strongroom's goods. Left out, as world or economy rules
// (P11): upkeep and its debts, the group's road and home checks, the memorial, the boards' tallies and favour.
#pragma once

#include <functional>
#include <optional>
#include <set>
#include <string>
#include <variant>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

#include "holders.h"
#include "roster.h"
#include "sim.h"
#include "start.h"

namespace sim {

// A named soul to wake (captives.ts NamedSoul): bar, the player barred from him for `ms` (pid, ms).
struct StoredSoul {
	WarPerson person;
	double lifeMs = 0;
	std::optional<std::pair<int, double>> bar;
};
// Wakes a soul in the room (regionDO.ts wakeIn); false: no shrine there (he fades).
using WakeSoul = std::function<bool(const StoredSoul &)>;

class RoomStore {
public:
	virtual ~RoomStore() = default;
	// persons.ts claimForJoin: the men of `squads` for a join (person lists, one per squad), else the refusal's detail
	virtual std::variant<std::vector<std::vector<WarPerson>>, std::string> claimForJoin(int pid, const std::string &region, const std::vector<std::vector<std::string>> &squads,
		const std::set<std::string> &inRoom, double now, const WakeSoul &wake) = 0;
	// let go of men claimed here (a dropped join, a transfer out)
	virtual void release(const std::string &region, const std::vector<std::string> &ids) = 0;
	// men of his who arrived here over a border (the world's transfer write)
	virtual void place(const std::string &region, const std::vector<std::string> &ids) = 0;
	// W-98: his fit men lying here, off the field (a muster)
	virtual std::vector<std::string> offField(int pid, const std::string &region, const std::set<std::string> &inRoom, double now, const WakeSoul &wake) = 0;
	// a restore's check: the men of `ids` still deployed here, by id (record order)
	virtual std::vector<WarPerson> deployed(const std::string &region, const std::vector<std::string> &ids) = 0;
	// a fight written back once per id (false: already written)
	virtual bool applyFight(const std::string &id, const std::string &region, const FightReport &report, double now) = 0;
	// W-60: a soul claimed in the field becomes his man (false: refused, he leaves the field)
	virtual bool claimSoul(int pid, const WarPerson &person, const std::string &region) = 0;
	// W-68: a named soul faded or the wild took him
	virtual void fade(const std::string &id) = 0;
	// M5e: the captives held at these buildings go free (raided or fallen); how many
	virtual int freeRaided(const std::string &region, const std::vector<int> &buildings, double at, const WakeSoul &wake) = 0;
	// W-60: his fighters (the soul gate's count)
	virtual int armyCount(int pid) = 0;
	// W-85: his path
	virtual PlayerPath path(int pid) = 0;
	// W-80: his home strongroom's goods, and what his men drew from it (never below zero)
	virtual Cost goodsOf(int pid) = 0;
	virtual void take(int pid, const Cost &goods) = 0;
	// the room's save (DO storage); "" none
	virtual void saveRoom(const std::string &region, const std::string &text) = 0;
	virtual std::string loadRoom(const std::string &region) = 0;
};

class MemoryStore : public RoomStore {
public:
	struct Rec {
		std::string id;
		int pid = 0;
		std::string state; // active | wounded | captive | dead | training | retired | soul | faded
		std::optional<std::string> region, heldAt;
		std::optional<double> until, barUntil;
		std::optional<int> captor, captorPid, heldFort, barPid;
		WarPerson person;
	};

	std::variant<std::vector<std::vector<WarPerson>>, std::string> claimForJoin(int pid, const std::string &region, const std::vector<std::vector<std::string>> &squads,
		const std::set<std::string> &inRoom, double now, const WakeSoul &wake) override;
	void release(const std::string &region, const std::vector<std::string> &ids) override;
	void place(const std::string &region, const std::vector<std::string> &ids) override;
	std::vector<std::string> offField(int pid, const std::string &region, const std::set<std::string> &inRoom, double now, const WakeSoul &wake) override;
	std::vector<WarPerson> deployed(const std::string &region, const std::vector<std::string> &ids) override;
	bool applyFight(const std::string &id, const std::string &region, const FightReport &report, double now) override;
	bool claimSoul(int pid, const WarPerson &person, const std::string &region) override;
	void fade(const std::string &id) override;
	int freeRaided(const std::string &region, const std::vector<int> &buildings, double at, const WakeSoul &wake) override;
	int armyCount(int pid) override { return count(pid, false); }
	PlayerPath path(int pid) override;
	Cost goodsOf(int pid) override;
	void take(int pid, const Cost &goods) override;
	void saveRoom(const std::string &region, const std::string &text) override;
	std::string loadRoom(const std::string &region) override;

	// seeding: a new man of his, active (at home: region none); his goods; his path
	void add(int pid, const WarPerson &p, const std::optional<std::string> &region = std::nullopt);
	void setGoods(int pid, const Cost &goods);
	void setPath(int pid, const PlayerPath &way);
	const Rec *rec(const std::string &id) const;

	// the store as JSON ({persons, fights, goods} as src/dev/roomStore.ts dumps it, plus paths and rooms), back, and on disk
	godot::Dictionary dump() const;
	void load(const godot::Dictionary &d);
	bool write(const godot::String &file) const;
	bool read(const godot::String &file);

private:
	std::vector<Rec> recs;
	std::vector<std::string> fights;
	std::vector<std::pair<int, Cost>> goods; // a Map: insertion order
	std::vector<std::pair<int, PlayerPath>> paths;
	std::vector<std::pair<std::string, std::string>> rooms;

	Rec *find(const std::string &id);
	int count(int pid, bool civ, bool activeOnly = false) const;
	void settle(int pid, double now, const WakeSoul &wake);
	int toSouls(const std::vector<Rec *> &rows, double now, const WakeSoul &wake);
};

// FightReport and PersonResult as their TS JSON (src/war/types.ts), and back
godot::Dictionary person_result_to(const PersonResult &x);
PersonResult person_result_from(const godot::Dictionary &d);
godot::Dictionary fight_report_to(const FightReport &r);
FightReport fight_report_from(const godot::Dictionary &d);
godot::Dictionary player_path_to(const PlayerPath &p);
godot::Dictionary cost_to(const Cost &c);
Cost cost_from(const godot::Dictionary &d);

} // namespace sim
