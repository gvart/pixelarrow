// P8 wave C, settlements and politics: what the region room reads of them (server/src/war/roomSettlements.ts
// RoomSettlement, the oaths, pacts, guard contracts and work sites the DO polls in) and what the DO books of them in D1
// (server/src/war/settlements.ts, oaths.ts, crown.ts, works.ts, favour.ts), behind SettleStore: one neutral interface,
// and MemorySettle, its offline reading in memory (src/dev/roomStore.ts is its TS twin, which the room vectors run;
// MemoryStore keeps one and dumps it with the persons). The small tables of src/war/net/works.ts and favour.ts are here
// (no data tables: the room test checks them against the TS through LocalRoom.constants).
//
// MemorySettle keeps the SQL rules over plain records, in insertion order: the alliance rolls and names, found (a
// settlement round a finished camp: too close to another, the map's refusal), the region's settlements as
// loadRegionSettlements reads them (members by since and pid, the lord's alliance, the lords of its overlords), report,
// logAttack (who hears), the centres re-keyed on a fresh field, oaths sworn and their rates (syncTies), the tribute
// held in buildings, pacts and truces (pactAttack breaks them), the crown's war goals' shares (bookFight), the alliance
// works (addLabour within each stage's need, openWorks, bonusesOf), favour (within its path and hour cap, the log
// trimmed, levelsOf), the guard contracts watched and the world's notes to players (notify). Left out, as REST or world
// rules (P11): settlement offers and truce bonds, swearing and the crown's votes, offices, treasury and payouts, the
// contracts' pay and the town boards.
#pragma once

#include <functional>
#include <optional>
#include <string>
#include <utility>
#include <variant>
#include <vector>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>

#include "sim.h"
#include "start.h"

namespace sim {

struct Plot {
	double x0 = 0, y0 = 0, x1 = 0, y1 = 0;
};
// roomSettlements.ts TieMember (role: lord | citizen | garrison)
struct SettleMember {
	int pid = 0;
	std::string role;
	std::optional<Plot> plot;
};
// roomSettlements.ts RoomSettlement (team: the lord's alliance, none this season: nullopt)
struct RoomSettle {
	int id = 0, centre = 0;
	double x = 0, y = 0, r = 0;
	std::string name;
	int lord = 0;
	std::string lordName;
	std::optional<int> team;
	double level = 0;
	std::optional<int> overlord;
	double tribute = 0;
	std::vector<int> overlordLords;
	std::vector<SettleMember> members;
};
struct Oath {
	int vassal = 0, lord = 0;
	double pct = 0;
};
// a pact or truce in force between alliances (room.ts RoomPact; kind: pact | truce)
struct PactIn {
	int a = 0, b = 0;
	std::string kind;
};
// W-61 a taken guard contract the room watches
struct GuardWatch {
	int id = 0, team = 0, taker = 0;
	double men = 0;
};

// src/war/net/works.ts and favour.ts, server/src/war/settlements.ts SETTLE, favour.ts, src/data/warTownBoard.ts
// labourFavour, src/data/warFeudal.ts rateDefault
struct WorkStage {
	Cost goods;
	double labour = 0; // man-hours
	std::optional<double> repairCost, sight, travel, tasks;
	std::vector<std::string> keys; // the bonus's keys in its order
};
struct SettleTables {
	static constexpr int SETTLE_EVERY = 10, ATTACK_COOLDOWN = 3000, WORK_R = 10, LAIR_NEAR = 20, LAND_TICKS = 6000, FAVOUR_LOG = 20, FAVOUR_MAX = 12, BUILT_LUMP = 10;
	static constexpr double SETTLE_R = 24, SETTLE_PRESENCE = 6, SETTLE_NAME_MAX = 32, LABOUR_FAVOUR = 0.6, RATE_DEFAULT = 10;
	static constexpr double EARN_LAIR = 40, EARN_BUILT = 0.03, EARN_LAND_CLAIM = 1, EARN_LAND_CLAIMS_CAP = 3, EARN_LAND_REGION = 2;
	// the works in WORKS order, then the wonder, each its stages
	static const std::vector<std::pair<std::string, std::vector<WorkStage>>> &works();
	static const std::vector<WorkStage> *stagesOf(const std::string &id);
	static double favourXp(int level); // FAVOUR_XP[level]
	static int favourLevel(double xp);
	static const std::vector<std::pair<std::string, std::string>> &pays(); // PAYS: reason, the one path it pays
	static const std::vector<std::pair<std::string, double>> &hourCap(); // HOUR_CAP
	static godot::Dictionary constants(); // as src/dev/vectors/room.ts settleConsts
	// src/war/world/alliances.ts ALLIANCES: name, home region and quadrant (nullptr: no such alliance)
	static const char *allianceName(int a);
	static const char *allianceHome(int a);
	static const char *allianceQuadrant(int a);
};

// persons.ts fightTally: each player's men's kills in the fight (players in the order the report first names them)
std::vector<std::pair<int, double>> fight_kills(const FightReport &r);

class SettleStore {
public:
	struct Attack {
		std::vector<int> tell, broken;
	};
	struct PactBreak {
		std::vector<int> broken, tell;
		std::string text;
	};
	struct PactRec {
		int id = 0, a = 0, b = 0;
		std::string kind, state;
		std::optional<double> endsAt;
		std::optional<int> brokenBy;
	};
	virtual ~SettleStore() = default;
	// his alliance this season (none: nullopt)
	virtual std::optional<int> allianceOf(int pid) = 0;
	// the players of an alliance this season (war_alliance_members, in its order)
	virtual std::vector<int> membersOf(int alliance) = 0;
	// roomSettlements.ts loadRegionSettlements
	virtual std::vector<RoomSettle> regionSettlements(const std::string &region) = 0;
	// settlements.ts found: the settlement's id, else why not (mapOk: the map's refusal of the circle, "" none)
	virtual std::variant<int, std::string> found(const std::string &region, int centre, double x, double y, int lord, const std::function<std::string(double, double, double)> &mapOk, double now) = 0;
	// settlements.ts report: town level, what persists (JSON text), tended now
	virtual void report(int id, std::optional<double> level, const std::optional<std::string> &persist, bool tended, double now) = 0;
	virtual Attack logAttack(int by, int victim, double now) = 0;
	// regionDO.ts restoreSettlements: the old centres off, the new ones (settlement, centre)
	virtual void rekey(const std::string &region, const std::vector<std::pair<int, int>> &moved) = 0;
	// the region's settlements' persisted pieces (JSON text), by id
	virtual std::vector<std::pair<int, std::string>> persisted(const std::string &region) = 0;
	virtual std::vector<Oath> sworn() = 0;
	// oaths.ts reportHeld: the region's tribute rows (room.ts titheReports) replace its last
	virtual void reportHeld(const std::string &region, const godot::Array &rows) = 0;
	virtual std::vector<PactRec> pactsOf() = 0;
	virtual PactBreak pactAttack(int by, int victim, double now) = 0;
	// crown.ts bookFight: kills by player as fightTally gives them (its order)
	virtual void bookFight(const std::string &region, const std::vector<std::pair<int, double>> &tally, double now) = 0;
	// works.ts addLabour: man-seconds by player (ascending); the labour put in
	virtual double addLabour(int alliance, const std::string &work, const std::vector<std::pair<int, double>> &by, double now) = 0;
	virtual std::vector<std::string> openWorks(int alliance) = 0;
	virtual std::vector<std::pair<int, Sim::TeamBonus>> bonusesOf() = 0;
	virtual void addFavour(int pid, double amount, const std::string &reason, double now) = 0;
	virtual std::vector<std::pair<int, double>> levelsOf(const std::vector<int> &pids) = 0;
	virtual std::vector<GuardWatch> guardsIn(const std::string &region) = 0;
	// WarWorldDO.notify: the world's note to these players
	virtual void notify(const std::vector<int> &pids, const godot::Dictionary &msg) = 0;
};

class MemorySettle : public SettleStore {
public:
	// the stored path of a player (none: nullopt), for favour's PAYS and the levels
	explicit MemorySettle(std::function<std::optional<PlayerPath>(int)> pathOf) : pathOf(std::move(pathOf)) {}

	std::optional<int> allianceOf(int pid) override;
	std::vector<int> membersOf(int alliance) override;
	std::vector<RoomSettle> regionSettlements(const std::string &region) override;
	std::variant<int, std::string> found(const std::string &region, int centre, double x, double y, int lord, const std::function<std::string(double, double, double)> &mapOk, double now) override;
	void report(int id, std::optional<double> level, const std::optional<std::string> &persist, bool tended, double now) override;
	Attack logAttack(int by, int victim, double now) override;
	void rekey(const std::string &region, const std::vector<std::pair<int, int>> &moved) override;
	std::vector<std::pair<int, std::string>> persisted(const std::string &region) override;
	std::vector<Oath> sworn() override;
	void reportHeld(const std::string &region, const godot::Array &rows) override;
	std::vector<PactRec> pactsOf() override;
	PactBreak pactAttack(int by, int victim, double now) override;
	void bookFight(const std::string &region, const std::vector<std::pair<int, double>> &tally, double now) override;
	double addLabour(int alliance, const std::string &work, const std::vector<std::pair<int, double>> &by, double now) override;
	std::vector<std::string> openWorks(int alliance) override;
	std::vector<std::pair<int, Sim::TeamBonus>> bonusesOf() override;
	void addFavour(int pid, double amount, const std::string &reason, double now) override;
	std::vector<std::pair<int, double>> levelsOf(const std::vector<int> &pids) override;
	std::vector<GuardWatch> guardsIn(const std::string &region) override;
	void notify(const std::vector<int> &pids, const godot::Dictionary &msg) override;

	// seeds (what REST, the crown and the season sweep leave in D1), as src/dev/vectors/room.ts calls them
	void ally(int pid, int alliance, const std::string &name);
	int addSettlement(const godot::Dictionary &s); // {region, centre, x, y, r, name, lord, level?, persist?}
	void addMember(int settlement, int pid, const std::string &role, const std::optional<Plot> &plot, double now);
	void swear(int vassal, int lord, std::optional<double> pct);
	int addPact(int a, int b, const std::string &kind, std::optional<double> endsAt);
	int addOrder(int alliance, const std::string &kind, const std::string &region, double expiresAt);
	void addGuard(const std::string &region, const GuardWatch &w);
	void giveWork(int alliance, const std::string &work, const Cost &goods);
	// his level by favour (none: nullopt)
	std::optional<double> favourLevelOf(int pid) const;

	// the keys src/dev/roomStore.ts dumps (settlements ... news) into `out`, and back
	void dump(godot::Dictionary &out) const;
	void load(const godot::Dictionary &d);

private:
	struct SettleRec {
		int id = 0;
		std::string region;
		int centre = 0;
		double x = 0, y = 0, r = 0;
		std::string name;
		int lord = 0;
		double level = 0;
		std::optional<int> overlord;
		double tribute = 0, tendedAt = 0;
		std::string persist;
	};
	struct MemberRec {
		int settlement = 0, pid = 0;
		std::string role;
		std::optional<Plot> plot;
		double since = 0;
	};
	struct OrderRec {
		int id = 0, alliance = 0;
		std::string kind, region, state;
		double expiresAt = 0;
	};
	struct WorkRec {
		int alliance = 0;
		std::string work;
		Cost goods;
		double labour = 0;
		int stage = 0;
		std::optional<double> doneAt;
	};
	struct FavourRec {
		int pid = 0;
		double xp = 0, level = 1, landHour = 0, landN = 0;
	};
	struct LogRec {
		int pid = 0;
		double at = 0, amount = 0;
		std::string reason;
	};
	std::function<std::optional<PlayerPath>(int)> pathOf;
	std::vector<std::pair<int, int>> alliances; // a Map: insertion order
	std::vector<std::pair<int, std::string>> names;
	std::vector<SettleRec> settles;
	std::vector<MemberRec> members;
	godot::Array settleLog, held, news;
	std::vector<std::pair<int, int>> oaths; // vassal, lord
	std::vector<std::pair<int, double>> rates;
	std::vector<PactRec> pacts;
	std::vector<OrderRec> orders;
	struct Share {
		int order = 0, pid = 0;
		double share = 0;
	};
	std::vector<Share> shares;
	std::vector<WorkRec> works;
	struct Gift {
		int alliance = 0;
		std::string work;
		int pid = 0;
		double labour = 0;
	};
	std::vector<Gift> gifts;
	std::vector<std::pair<int, double>> stats; // pid, labour
	std::vector<FavourRec> favour;
	std::vector<LogRec> favourLog;
	std::vector<std::pair<std::string, GuardWatch>> guards;
	int nextSettle = 1;

	SettleRec *settlement(int id);
	std::vector<SettleRec *> overlords(SettleRec &s);
	void syncTies(int pid);
	WorkRec *work(int alliance, const std::string &id);
	void finish(int alliance, const std::string &id, double now);
	void favourOf(int pid, double n, const std::string &reason, double now);
	std::string nameOf(int pid) const;
};

} // namespace sim
