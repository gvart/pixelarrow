// The NPC towns' rules (src/war/net/npcMarket.ts, W-140..W-145, W-180, W-196), line for line, with what they read of
// the world (src/war/world/graph.ts hops, worldRegion, homeOf; src/war/world/alliances; src/war/world/season's market
// towns). The numbers come from the exported tables src/data/warNpcTowns, src/war/world/regions, alliances and season
// (SimData.load). Pure: all state comes in, time is the caller's clock (the room's local trade: local_trade.cpp).
#pragma once

#include <optional>
#include <string>
#include <utility>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

namespace sim {

struct MarketTables {
	struct Region {
		std::string id, name, role;
		std::vector<std::pair<std::string, double>> res; // the table's key order
		std::vector<std::string> adj;
	};
	std::vector<Region> regions; // WORLD_REGIONS order (WORLD_IDS)
	std::vector<std::pair<int, std::string>> homes; // ALLIANCES id -> home
	std::vector<std::string> frontier; // FRONTIER_TOWNS
	std::string omphalos;
	std::vector<std::pair<std::string, double>> base; // NPC_BASE (key order)
	std::vector<std::pair<std::string, std::vector<std::string>>> roleGoods; // NPC_ROLE_GOODS
	std::vector<std::pair<std::string, double>> hire; // NPC_HIRE
	std::vector<std::pair<std::string, double>> carts; // NPC_CARTS
	double reach = 14;
	struct {
		double at = 0.62, per = 0.45, far = 4, made = 1.7;
	} distance;
	struct {
		double made = 800, land = 500;
	} par;
	struct {
		double slope = 0.3, min = 0.5, max = 1.5, edge = 0.06, recoverHours = 4;
	} price;
	struct {
		double start = 4000, mintSilver = 5, cap = 4000, thin = 0.25;
	} purse;
	struct {
		double hours = 3, chance = 0.6, shortK = 1.7, glut = 0.6;
	} swing;
};
// tables["src/data/warNpcTowns"], ["src/war/world/regions"], ["src/war/world/alliances"], ["src/war/world/season"]
void load_market_tables(const godot::Dictionary &tables, MarketTables &out);

// src/war/world/graph.ts
const MarketTables::Region *world_region(const std::string &id);
bool is_world_region(const std::string &id);
double hops(const std::string &a, const std::string &b); // Infinity when cut off
std::string home_of(int alliance); // "" for none

struct NpcGoodRule {
	std::string res;
	double base = 0, par = 0;
};
struct NpcSwing {
	std::string town, res, kind; // short | glut
	double until = 0;
};

const std::vector<NpcGoodRule> &npc_goods(const std::string &town);
const NpcGoodRule *npc_good(const std::string &town, const std::string &res);
std::vector<NpcSwing> npc_swings(const std::string &town, double now);
std::optional<NpcGoodRule> npc_rule_now(const std::string &town, const std::string &res, double now);
std::vector<NpcSwing> npc_news(const std::string &town, double now);
double stock_after(double stock, double par, double ms);
double thin_purse(double nominal, double purse);
double pay_for(const NpcGoodRule &g, double stock, double n, double purse);
double cost_of(const NpcGoodRule &g, double stock, double n);
double sellable(const NpcGoodRule &g, double stock, double want, double purse);
double buyable(const NpcGoodRule &g, double stock, double want, double coin);
double npc_day(double now);
double purse_after(double coin, double days);
// npcShown: {town, purse, goods: [NpcOffer], news: [NpcSwing]} as the TS object; stock: by good
godot::Dictionary npc_shown(const std::string &town, double purse, const std::vector<std::pair<std::string, double>> &stock, double realPurse, double now);
// NPC_HIRE, NPC_CARTS (nullopt: not there)
std::optional<double> npc_hire(const std::string &cls);
std::optional<double> npc_cart(const std::string &type);

} // namespace sim
