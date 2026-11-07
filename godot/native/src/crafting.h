// Crafting queues of the war sim (src/war/sim/crafting.ts), line for line: one queue per workplace, crafter slots by
// level, inputs paid as an order starts (the owner's terms on strangers), one seeded roll per item at completion.
// The CRAFT constants come from the exported table src/war/sim/crafting (SimData.load "crafting").
// The `crafted` WarEvent is CraftedEvent here; the sim core wraps it into its event list.
#pragma once

#include <functional>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

#include "state.h"
#include "economy.h"
#include "holders.h"
#include "item.h"
#include "recipes.h"

namespace sim {

struct CraftTables {
	double queue = 5, batch = 1.5, steward = 0.8, alloy = 1.2, step = 10, share = 0.1, mw = 0.75, worn = 50, loss = 5, floor = 50, salvage = 0.3, goldsmith = 0.6;
};
void load_crafting(const godot::Dictionary &t, CraftTables &out);

// A civilian at work at a workplace, as the queue sees him.
struct Crafter {
	int id = 0;
	std::optional<std::string> prof; // null: no profession
	int level = 1;
	std::vector<std::string> perks;
	std::optional<Item> tool;
	double work = 1, bountiful = 0;
	std::string owner, name;
	std::optional<std::string> pid;
	int team = 0;
};

struct Placed {
	int id = 0, team = 0;
	const BuildingDef *def = nullptr;
	double x = 0, y = 0;
	std::optional<std::string> owner;
	std::optional<double> share, fee;
};

struct Payer {
	int team;
	std::string owner;
};

// src/war/types.ts CraftOrder: kind "craft" (recipe), "cancelCraft" (order), "repair" / "salvage" (owner, item).
struct CraftOrder {
	std::string kind;
	int team = 0, building = 0;
	std::string recipe;
	int order = 0;
	std::string owner;
	Item item;
};

// src/war/types.ts WarEvent { kind: 'crafted' }.
struct CraftedEvent {
	double t;
	int order, building, team;
	std::string owner;
	std::optional<std::string> pid;
	std::string recipe, what;
	Item item;
};

// src/war/types.ts QueueSnap.
struct QueueSnap {
	int id;
	std::string recipe, kind;
	int by;
	double progress;
};

struct CraftDeps {
	double seed = 0;
	std::function<bool(int team, double x, double y, const Cost &cost)> takeAt;
	std::function<void(int team, double x, double y, const std::string &res, double n)> addAt;
	std::function<bool(const Placed &b, const Crafter &c, const Goods &cost)> pay;           // optional
	std::function<void(const Placed &b, const std::string &res, double n)> till;             // optional
	std::function<void(const Placed &b, const Payer &payer, const std::string &res, double n)> out; // optional
	std::function<void(const CraftedEvent &ev)> emit;
	std::function<bool(const Placed &b, const std::string &owner, const std::string &type, bool check)> cart; // optional
};

// The recipe an item is made by (items and tools; null: a drop-only item).
const Recipe *item_recipe(const std::string &def);
// Why `c` may not make `r` ("" : he may): "class" or "node".
std::string crafter_refusal(const std::optional<std::string> &prof, const std::vector<std::string> &perks, const Recipe &r);
struct RepairCost {
	Goods inputs;
	double secs;
};
std::optional<RepairCost> repair_cost(const Item &item, const Recipe &r);

// The fed record a dish gives (clamped to FED_CAP a combat stat) and how many ticks it lasts (Head Cook: x1.5).
struct Fed {
	double inn, melee, missile, acc, heal, ticks;
};
Fed fed_of(const std::string &dish, bool headCook = false);

class Crafting {
public:
	// saves (state.ts): the TS saveRoot as a graph, and the loadRoot of one (into a fresh sim)
	state::Val save(state::Graph &g) const;
	void load(const state::Obj &o);
	struct QOrder {
		int id;
		std::string kind; // craft | repair | salvage
		const Recipe *recipe;
		std::optional<Item> item;
		std::optional<std::string> owner;
		int by;
		double left, total;
		std::optional<Goods> taken;
		std::optional<Payer> payer;
	};

	explicit Crafting(CraftDeps deps) : deps_(std::move(deps)) {}

	bool order(const CraftOrder &o, const Placed &b);
	// Crafters busy this batch, with the XP each earned, in Map insertion order.
	std::vector<std::pair<int, double>> work(const Placed &b, const std::vector<Crafter> &crafters, double sec, double tick);
	bool drop(int id);
	bool has(int id) const;
	std::optional<std::vector<QueueSnap>> snaps(int id) const;
	Cost &supply(int team);
	bool use(int team, const std::string &p, double n);

	// Map<building id, orders> and Map<team, supplies> in insertion order (saveRoot).
	std::vector<std::pair<int, std::vector<QOrder>>> queues;
	std::vector<std::pair<int, Cost>> supplies;
	int nextId = 1;

private:
	CraftDeps deps_;

	std::vector<QOrder> *queue(int id);
	const std::vector<QOrder> *queue(int id) const;
	void give(const Placed &b, const std::optional<Payer> &payer, const std::string &res, double n);
	bool start(const Placed &b, QOrder &x, const Crafter &c);
	Goods inputs_of(const QOrder &x, const Crafter &c) const;
	double finish(const Placed &b, const QOrder &x, const Crafter &c, double tick);
};

} // namespace sim
