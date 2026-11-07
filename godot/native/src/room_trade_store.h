// The holders' and trade's books (docs/impl/godot-port.md P8 wave B, G-09): what the region Durable Object keeps in D1
// for them, behind RoomStore::trade(), and MemoryTradeStore, its offline implementation in memory (MemoryStore's; its
// TS reading is src/dev/roomTrade.ts TradeBooks, which the room vectors run). The same SQL rules over plain records, in
// record insertion order: the home strongroom is MemoryStore's goods (its lots all of origin home: it keeps totals);
// every other holder (stalls, warehouses, tributes) keeps lots (good, origin, seal), taken oldest origin first; the
// stash's items by place, or by region while a workplace holds them (a mend); the crafted events applied (war_crafts);
// the region holds as the last save left them (war_region_holds); rented sites; each NPC town's purse and stock; the
// town board's jobs and heats; each player's alliance.
//
// Offline (left out, as online or world rules): renting through HTTP and the player market (a site is rented by the
// caller), a town holder's rent and tax (nobody holds a town), contracts and escrows, the anti-abuse gift log, tallies,
// stats, favour and trophies; oaths are wave C's (liegeOf none, tributeCut 0); newId counts his hires.
#pragma once

#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>

#include "holders.h"
#include "item.h"

namespace sim {

class MemoryStore;

// An ApiError (server/src/war/api.ts): the DO tells it as `<code>: <message>`. Empty code: none.
struct Why {
	std::string code, message;
	explicit operator bool() const { return !code.empty(); }
	void set(const std::string &c, const std::string &m) {
		if (code.empty()) code = c, message = m;
	}
};

struct GoodLot {
	std::string res, origin;
	double seal = 0, amount = 0;
};
struct HoldRow {
	std::string ref, kind;
	int pid = 0, team = 0;
	Cost goods;
	std::vector<Item> items;
};
// a board job (war_board_jobs): band a Band object (empty: null), state taken | ready
struct JobRow {
	int id = 0, pid = 0;
	std::string town, kind, entry;
	int errand = 0;
	std::string goal;
	std::optional<std::string> giver, story;
	std::string state = "taken";
	std::optional<double> target;
	godot::Dictionary band;
	std::optional<double> x, y;
	double done = 0, need = 0;
	std::optional<std::string> toTown, res;
	double n = 0, coin = 0, points = 0;
};
// a deal planned against the books: what it moves, and its write
struct Plan {
	double n = 0, coin = 0;
	std::function<void()> apply;
};

class TradeStore {
public:
	virtual ~TradeStore() = default;
	// holders.ts: totals by good (rounded), n of res into a holder, `cost` planned out of its unsealed lots (refused:
	// no_<good>, `<what> lack ...`), the planned lots taken, the loads it fills (market.ts loadsIn), M6e the region's
	// holds saved
	virtual Cost goodsAt(const std::string &place) = 0;
	virtual void put(const std::string &place, const std::string &res, double n, const std::string &origin = "home", double seal = 0) = 0;
	virtual std::vector<GoodLot> planTake(const std::string &place, const Cost &cost, Why &why, const std::string &what = "You") = 0;
	virtual void takeLots(const std::string &place, const std::vector<GoodLot> &taken) = 0;
	virtual double loadsIn(const std::string &place) = 0;
	virtual void saveHolds(const std::string &region, const std::vector<HoldRow> &rows) = 0;
	// the stash: an item in a holder for pid; the items of `uids` at a place (record order; nullopt: one is not there),
	// taken out; crafting.ts takeForMend (his strongroom item to a workplace in region), returnMends, keepMends,
	// applyCrafts (each crafted event once: repair home as made, salvage gone)
	virtual void placeItem(int pid, const std::string &place, const Item &item) = 0;
	virtual std::optional<std::vector<Item>> itemsAt(const std::string &place, const std::vector<std::string> &uids) = 0;
	virtual void dropItems(const std::string &place, const std::vector<std::string> &uids) = 0;
	virtual std::optional<Item> takeForMend(int pid, const std::string &uid, const std::string &region) = 0;
	virtual void returnMends(const std::string &region, const std::vector<std::string> &uids) = 0;
	virtual void keepMends(const std::string &region, const std::vector<std::string> &uids) = 0;
	virtual int applyCrafts(const std::string &region, const std::string &run, const godot::Array &crafted) = 0;
	// market.ts: a site rented (its id), his open site of kind here (at home a warehouse is his strongroom)
	virtual std::string rentSite(int pid, const std::string &town, const std::string &kind, double now, Why &why) = 0;
	virtual std::string site(int pid, const std::string &town, const std::string &kind, double now, Why &why) = 0;
	// npcMarket.ts books: the town's view, a sale to it, a buy, coin paid in, a pay-out (pay: of the purse), stock moved
	virtual godot::Dictionary npcView(const std::string &town, double now, Why &why) = 0;
	virtual Plan planSell(const std::string &town, const std::string &res, double want, double now, Why &why) = 0;
	virtual Plan planBuy(const std::string &town, const std::string &res, double want, double have, double now, Why &why) = 0;
	virtual std::function<void()> planPay(const std::string &town, double coin, double now) = 0;
	virtual Plan planPayOut(const std::string &town, const std::function<double(double)> &pay, double now) = 0;
	virtual std::function<void()> planStock(const std::string &town, const std::string &res, double by, double now, Why &why) = 0;
	// members, oaths, persons
	virtual std::optional<int> allianceOf(int pid) = 0;
	virtual void setAlliance(int pid, int alliance) = 0;
	virtual bool isHomeOf(int pid, const std::string &town) = 0;
	virtual std::optional<int> liegeOf(int pid) = 0;
	virtual double tributeCut(int pid, double coin) = 0;
	virtual int workerCount(int pid) = 0;
	virtual std::string newId(int pid) = 0;
	// townBoard.ts books: his jobs (record order), one of his (refused: not_found), a new one, dropped, his heats here
	// (kill, build, trade), set, W-185 his Kills done by the wild's deeds (lair keys): ready, how many
	virtual std::vector<JobRow *> jobsOf(int pid) = 0;
	virtual JobRow *jobOf(int pid, int id, Why &why) = 0;
	virtual JobRow &addJob(const JobRow &j) = 0;
	virtual void dropJob(int id) = 0;
	virtual std::map<std::string, double> heatsOf(int pid, const std::string &town, double now) = 0;
	virtual void setHeat(int pid, const std::string &town, const std::string &kind, double heat, double at) = 0;
	virtual int boardDeeds(int pid, const std::string &town, const std::vector<std::string> &lairs) = 0;
};

class MemoryTradeStore : public TradeStore {
public:
	explicit MemoryTradeStore(MemoryStore &s) : s(s) {}
	Cost goodsAt(const std::string &place) override;
	void put(const std::string &place, const std::string &res, double n, const std::string &origin = "home", double seal = 0) override;
	std::vector<GoodLot> planTake(const std::string &place, const Cost &cost, Why &why, const std::string &what = "You") override;
	void takeLots(const std::string &place, const std::vector<GoodLot> &taken) override;
	double loadsIn(const std::string &place) override;
	void saveHolds(const std::string &region, const std::vector<HoldRow> &rows) override;
	void placeItem(int pid, const std::string &place, const Item &item) override;
	std::optional<std::vector<Item>> itemsAt(const std::string &place, const std::vector<std::string> &uids) override;
	void dropItems(const std::string &place, const std::vector<std::string> &uids) override;
	std::optional<Item> takeForMend(int pid, const std::string &uid, const std::string &region) override;
	void returnMends(const std::string &region, const std::vector<std::string> &uids) override;
	void keepMends(const std::string &region, const std::vector<std::string> &uids) override;
	int applyCrafts(const std::string &region, const std::string &run, const godot::Array &crafted) override;
	std::string rentSite(int pid, const std::string &town, const std::string &kind, double now, Why &why) override;
	std::string site(int pid, const std::string &town, const std::string &kind, double now, Why &why) override;
	godot::Dictionary npcView(const std::string &town, double now, Why &why) override;
	Plan planSell(const std::string &town, const std::string &res, double want, double now, Why &why) override;
	Plan planBuy(const std::string &town, const std::string &res, double want, double have, double now, Why &why) override;
	std::function<void()> planPay(const std::string &town, double coin, double now) override;
	Plan planPayOut(const std::string &town, const std::function<double(double)> &pay, double now) override;
	std::function<void()> planStock(const std::string &town, const std::string &res, double by, double now, Why &why) override;
	std::optional<int> allianceOf(int pid) override;
	void setAlliance(int pid, int alliance) override;
	bool isHomeOf(int pid, const std::string &town) override;
	std::optional<int> liegeOf(int) override { return std::nullopt; }
	double tributeCut(int, double) override { return 0; }
	int workerCount(int pid) override;
	std::string newId(int pid) override;
	std::vector<JobRow *> jobsOf(int pid) override;
	JobRow *jobOf(int pid, int id, Why &why) override;
	JobRow &addJob(const JobRow &j) override;
	void dropJob(int id) override;
	std::map<std::string, double> heatsOf(int pid, const std::string &town, double now) override;
	void setHeat(int pid, const std::string &town, const std::string &kind, double heat, double at) override;
	int boardDeeds(int pid, const std::string &town, const std::vector<std::string> &lairs) override;

	// the books as src/dev/roomTrade.ts dumps them ({items, places, crafts, holds, sites, npc, stock, jobs, heat, allies}),
	// plus its counters; and back
	godot::Dictionary dump() const;
	void load(const godot::Dictionary &d);

private:
	struct StashRow {
		std::string uid;
		int pid = 0;
		Item item;
		std::optional<std::string> place, region;
	};
	struct SiteRow {
		std::string id, kind;
		int pid = 0;
		std::string town;
		std::optional<double> paidTo;
	};
	struct Purse {
		double purse = 0, day = 0, minted = 0;
	};
	struct StockRow {
		std::string town, res;
		double stock = 0, at = 0;
	};
	struct HeatRow {
		int pid = 0;
		std::string town, kind;
		double heat = 0, at = 0;
	};
	MemoryStore &s;
	std::vector<std::pair<std::string, std::vector<GoodLot>>> places;
	std::vector<StashRow> items;
	std::vector<std::string> crafts;
	std::vector<std::pair<std::string, std::vector<HoldRow>>> holds;
	std::vector<SiteRow> sites;
	std::vector<std::pair<std::string, Purse>> npc;
	std::vector<StockRow> stock;
	std::vector<std::unique_ptr<JobRow>> jobs; // stable rows: a held job is changed in place
	std::vector<HeatRow> heat;
	std::vector<std::pair<int, int>> allies;
	int nextJob = 1, hires = 0;

	std::vector<GoodLot> lotsOf(const std::string &place);
	std::vector<GoodLot> *placeLots(const std::string &place, bool make);
	Purse purseOf(const std::string &town, double now, std::optional<double> &read);
	std::vector<std::pair<std::string, double>> stocksOf(const std::string &town, double now);
	void setPurse(const std::string &town, const Purse &p, double coin);
	void setStock(const std::string &town, const std::string &res, double stock, double now);
};

} // namespace sim
