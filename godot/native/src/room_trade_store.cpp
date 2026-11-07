// MemoryTradeStore: the holders' and trade's D1 books in memory, as src/dev/roomTrade.ts TradeBooks (see
// room_trade_store.h).
#include "room_trade_store.h"

#include <algorithm>
#include <cmath>

#include <godot_cpp/variant/string.hpp>

#include "js_math.h"
#include "npc_market.h"
#include "room_store.h"
#include "roster.h"
#include "sim_data.h"
#include "town_board.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::Variant;

namespace {
constexpr double EPS = 1e-6, DAY = 86'400'000;
const std::string HOME = "home";
std::string S(const Variant &v) { return godot::String(v).utf8().get_data(); }
godot::String G(const std::string &s) { return godot::String::utf8(s.c_str()); }
double round3(double n) { return js::round(n * 1000) / 1000; }
std::string strongroom(int pid) { return "sr:" + std::to_string(pid); }
bool digits(const std::string &s, size_t from) { return s.size() > from && std::all_of(s.begin() + from, s.end(), [](char c) { return c >= '0' && c <= '9'; }); }
// /^sr:\d+$/: his strongroom's pid, else -1
int sr_pid(const std::string &place) { return place.compare(0, 3, "sr:") == 0 && digits(place, 3) ? std::stoi(place.substr(3)) : -1; }
int owner_pid(const std::string &o) { return o.compare(0, 2, "p:") == 0 && digits(o, 2) ? std::stoi(o.substr(2)) : -1; }
std::string N(double v) { return js::number_to_string(v); }
Variant opt(const std::optional<std::string> &v) { return v ? Variant(G(*v)) : Variant(); }
Variant opt(const std::optional<double> &v) { return v ? Variant(*v) : Variant(); }
std::optional<std::string> ostr(const Dictionary &d, const char *k) { return d.get(k, Variant()).get_type() == Variant::NIL ? std::nullopt : std::optional<std::string>(S(d[k])); }
std::optional<double> onum(const Dictionary &d, const char *k) { return d.get(k, Variant()).get_type() == Variant::NIL ? std::nullopt : std::optional<double>(double(d[k])); }

// market.ts townOf: a market town's sites (offline nobody holds a town)
struct Town {
	int stalls = 0, warehouses = 0;
	std::optional<int> home;
};
std::optional<Town> town_of(const std::string &id) {
	const MarketTables &m = data().market;
	if (std::find(m.frontier.begin(), m.frontier.end(), id) != m.frontier.end()) return Town{ 6, 6, std::nullopt };
	if (id == m.omphalos) return Town{ 10, 4, std::nullopt };
	for (const auto &[a, home] : m.homes)
		if (home == id) return Town{ 12, 0, a };
	return std::nullopt;
}

Dictionary lot_row(const GoodLot &l) {
	Dictionary d;
	d["res"] = G(l.res);
	d["origin"] = G(l.origin);
	d["seal"] = l.seal;
	d["amount"] = l.amount;
	return d;
}
Array item_rows(const std::vector<Item> &items) {
	Array a;
	for (const Item &it : items) a.push_back(item_full_to(it));
	return a;
}
} // namespace

MemoryStore::MemoryStore() : books(std::make_unique<MemoryTradeStore>(*this)) {}
MemoryStore::~MemoryStore() = default;
TradeStore &MemoryStore::trade() { return *books; }

// ---------------------------------------------------------------- holders.ts

std::vector<GoodLot> *MemoryTradeStore::placeLots(const std::string &place, bool make) {
	for (auto &[k, v] : places)
		if (k == place) return &v;
	if (!make) return nullptr;
	places.emplace_back(place, std::vector<GoodLot>{});
	return &places.back().second;
}

std::vector<GoodLot> MemoryTradeStore::lotsOf(const std::string &place) {
	std::vector<GoodLot> out;
	const int pid = sr_pid(place);
	if (pid >= 0) {
		for (const auto &[res, n] : s.goodsOf(pid).kv)
			if (n > 0) out.push_back({ res, HOME, 0, n });
	} else if (const auto *ls = placeLots(place, false))
		for (const GoodLot &l : *ls)
			if (l.amount > 0) out.push_back(l);
	std::stable_sort(out.begin(), out.end(), [](const GoodLot &a, const GoodLot &b) {
		if (a.res != b.res) return a.res < b.res;
		if (a.origin != b.origin) return a.origin < b.origin;
		return a.seal - b.seal < 0;
	});
	return out;
}

Cost MemoryTradeStore::goodsAt(const std::string &place) {
	Cost out;
	for (const GoodLot &l : lotsOf(place)) out.set(l.res, round3(out.get(l.res) + l.amount));
	return out;
}

void MemoryTradeStore::put(const std::string &place, const std::string &res, double n, const std::string &origin, double seal) {
	const int pid = sr_pid(place);
	if (pid >= 0) {
		Cost g = s.goodsOf(pid);
		g.set(res, g.get(res) + n);
		s.setGoods(pid, g);
		return;
	}
	std::vector<GoodLot> &ls = *placeLots(place, true);
	for (GoodLot &l : ls)
		if (l.res == res && l.origin == origin && l.seal == seal) return void(l.amount += n);
	ls.push_back({ res, origin, seal, n });
}

std::vector<GoodLot> MemoryTradeStore::planTake(const std::string &place, const Cost &cost, Why &why, const std::string &what) {
	const std::vector<GoodLot> lots = lotsOf(place);
	std::vector<GoodLot> taken;
	for (const auto &[res, want] : cost.kv) {
		if (!(want > 0)) continue;
		double left = want;
		for (const GoodLot &l : lots) {
			if (l.res != res || l.seal || left <= EPS) continue;
			const double k = std::min(l.amount, left);
			if (k <= EPS) continue;
			taken.push_back({ res, l.origin, 0, k });
			left -= k;
		}
		if (left > EPS) {
			why.set("no_" + res, what + " lack " + N(round3(left)) + " " + res);
			return {};
		}
	}
	return taken;
}

void MemoryTradeStore::takeLots(const std::string &place, const std::vector<GoodLot> &taken) {
	const int pid = sr_pid(place);
	for (const GoodLot &t : taken) {
		if (pid >= 0) {
			Cost g = s.goodsOf(pid);
			const double was = g.get(t.res);
			g.set(t.res, was - t.amount < EPS ? 0 : was - t.amount);
			s.setGoods(pid, g);
			continue;
		}
		for (GoodLot &l : *placeLots(place, true))
			if (l.res == t.res && l.origin == t.origin && l.seal == t.seal) {
				l.amount = l.amount - t.amount < EPS ? 0 : l.amount - t.amount;
				break;
			}
	}
}

double MemoryTradeStore::loadsIn(const std::string &place) {
	double a = 0, n = 0;
	for (const auto &[r, k] : goodsAt(place).kv) a = a + k / per_load(r);
	for (const StashRow &r : items)
		if (r.place == place) n++;
	return a + n / data().holders.ITEMS_PER_LOAD;
}

void MemoryTradeStore::saveHolds(const std::string &region, const std::vector<HoldRow> &rows) {
	std::vector<HoldRow> kept = rows;
	for (HoldRow &r : kept)
		for (auto &[k, v] : r.goods.kv) v = round3(v);
	for (auto &[k, v] : holds)
		if (k == region) return void(v = kept);
	holds.emplace_back(region, kept);
}

// ---------------------------------------------------------------- items (the stash)

void MemoryTradeStore::placeItem(int pid, const std::string &place, const Item &item) {
	for (StashRow &r : items)
		if (r.uid == item.uid) {
			r.pid = pid, r.item = item, r.place = place, r.region.reset();
			return;
		}
	items.push_back({ item.uid, pid, item, place, std::nullopt });
}

std::optional<std::vector<Item>> MemoryTradeStore::itemsAt(const std::string &place, const std::vector<std::string> &uids) {
	std::vector<std::string> want; // [...new Set(uids)]
	for (const std::string &u : uids)
		if (std::find(want.begin(), want.end(), u) == want.end()) want.push_back(u);
	std::vector<Item> out;
	for (const StashRow &r : items)
		if (r.place == place && std::find(want.begin(), want.end(), r.uid) != want.end()) out.push_back(r.item);
	if (out.size() != want.size()) return std::nullopt;
	return out;
}

void MemoryTradeStore::dropItems(const std::string &place, const std::vector<std::string> &uids) {
	items.erase(std::remove_if(items.begin(), items.end(), [&](const StashRow &r) { return r.place == place && std::find(uids.begin(), uids.end(), r.uid) != uids.end(); }), items.end());
}

std::optional<Item> MemoryTradeStore::takeForMend(int pid, const std::string &uid, const std::string &region) {
	for (StashRow &r : items)
		if (r.uid == uid && r.pid == pid && r.place == strongroom(pid)) {
			r.region = region;
			r.place.reset();
			return r.item;
		}
	return std::nullopt;
}

void MemoryTradeStore::returnMends(const std::string &region, const std::vector<std::string> &uids) {
	for (StashRow &r : items)
		if (r.region == region && std::find(uids.begin(), uids.end(), r.uid) != uids.end()) r.region.reset(), r.place = strongroom(r.pid);
}

void MemoryTradeStore::keepMends(const std::string &region, const std::vector<std::string> &uids) {
	for (StashRow &r : items)
		if (r.region == region && std::find(uids.begin(), uids.end(), r.uid) == uids.end()) r.region.reset(), r.place = strongroom(r.pid);
}

int MemoryTradeStore::applyCrafts(const std::string &region, const std::string &run, const Array &crafted) {
	int n = 0;
	for (int64_t i = 0; i < crafted.size(); i++) {
		const Dictionary e = crafted[i];
		const int pid = owner_pid(S(e["owner"]));
		if (pid < 0) continue;
		const std::string id = region + ":" + run + ":" + N(double(e["order"]));
		if (std::find(crafts.begin(), crafts.end(), id) != crafts.end()) continue;
		crafts.push_back(id);
		const Dictionary item = e["item"];
		const std::string what = S(e["what"]), uid = S(item["uid"]);
		if (what == "repair") {
			for (StashRow &r : items)
				if (r.uid == uid && r.pid == pid && r.region == region) {
					r.item = item_from(item), r.region.reset(), r.place = strongroom(pid);
					break;
				}
		} else if (what == "salvage")
			items.erase(std::remove_if(items.begin(), items.end(), [&](const StashRow &r) { return r.uid == uid && r.pid == pid && r.region == region; }), items.end());
		n++;
	}
	return n;
}

// ---------------------------------------------------------------- market.ts sites

std::string MemoryTradeStore::rentSite(int pid, const std::string &town, const std::string &kind, double now, Why &why) {
	const std::optional<Town> t = town_of(town);
	if (!t) return why.set("not_market", town + " is no market town"), "";
	if (kind == "warehouse" && t->home) return why.set("no_warehouse", "At home your goods are in your strongroom"), "";
	const std::string id = (kind == "stall" ? "st:" : "wh:") + town + ":" + std::to_string(pid);
	int n = 0;
	for (const SiteRow &x : sites) {
		if (x.id == id) return why.set("rented", "You rent a " + kind + " here already"), "";
		if (x.town == town && x.kind == kind) n++;
	}
	if (n >= (kind == "stall" ? t->stalls : t->warehouses)) return why.set("no_site", "Every " + kind + " in " + town + " is taken"), "";
	sites.push_back({ id, kind, pid, town, now + DAY });
	return id;
}

std::string MemoryTradeStore::site(int pid, const std::string &town, const std::string &kind, double now, Why &why) {
	const std::optional<Town> t = town_of(town);
	if (!t) return why.set("not_market", town + " is no market town"), "";
	const std::string id = kind == "stall" ? "st:" + town + ":" + std::to_string(pid) : t->home ? strongroom(pid) : "wh:" + town + ":" + std::to_string(pid);
	if (id.compare(0, 3, "sr:") == 0) return id;
	for (SiteRow &x : sites)
		if (x.id == id) {
			if (x.paidTo.value_or(now) < now) x.paidTo = now; // settleRent with no holder
			return id;
		}
	return why.set("no_" + kind, "You rent no " + kind + " in " + town), "";
}

// ---------------------------------------------------------------- npcMarket.ts books

MemoryTradeStore::Purse MemoryTradeStore::purseOf(const std::string &town, double now, std::optional<double> &read) {
	const double today = npc_day(now);
	for (const auto &[k, r] : npc)
		if (k == town) {
			const double purse = purse_after(r.purse, today - r.day);
			read = r.purse;
			return { purse, today, r.minted + purse - r.purse };
		}
	read.reset();
	return { data().market.purse.start, today, 0 };
}

std::vector<std::pair<std::string, double>> MemoryTradeStore::stocksOf(const std::string &town, double now) {
	std::vector<std::pair<std::string, double>> out;
	for (const NpcGoodRule &g : npc_goods(town)) {
		const StockRow *r = nullptr;
		for (const StockRow &x : stock)
			if (x.town == town && x.res == g.res) {
				r = &x;
				break;
			}
		out.emplace_back(g.res, r ? stock_after(r->stock, g.par, now - r->at) : g.par);
	}
	return out;
}

void MemoryTradeStore::setPurse(const std::string &town, const Purse &p, double coin) {
	for (auto &[k, r] : npc)
		if (k == town) return void(r = { coin, p.day, p.minted });
	npc.emplace_back(town, Purse{ coin, p.day, p.minted });
}

void MemoryTradeStore::setStock(const std::string &town, const std::string &res, double st, double now) {
	for (StockRow &r : stock)
		if (r.town == town && r.res == res) return void((r.stock = st, r.at = now));
	stock.push_back({ town, res, st, now });
}

Dictionary MemoryTradeStore::npcView(const std::string &town, double now, Why &why) {
	if (npc_goods(town).empty()) return why.set("no_town", town + " is no town"), Dictionary();
	std::optional<double> read;
	const Purse p = purseOf(town, now, read);
	return npc_shown(town, std::floor(p.purse), stocksOf(town, now), p.purse, now);
}

namespace {
double stock_of(const std::vector<std::pair<std::string, double>> &st, const std::string &res) {
	for (const auto &[k, v] : st)
		if (k == res) return v;
	return 0;
}
} // namespace

Plan MemoryTradeStore::planSell(const std::string &town, const std::string &res, double want, double now, Why &why) {
	const std::optional<NpcGoodRule> g = npc_rule_now(town, res, now);
	if (!g) return why.set("not_traded", "This town does not deal in " + res), Plan{};
	std::optional<double> read;
	const Purse p = purseOf(town, now, read);
	const double st = stock_of(stocksOf(town, now), res);
	const double n = sellable(*g, st, want, p.purse), coin = pay_for(*g, st, n, p.purse);
	if (!(n > 0) || !(coin > 0)) return why.set("purse_empty", "The town has no coin left to pay you"), Plan{};
	return { n, coin, [this, town, res, p, coin, st, n, now] { setPurse(town, p, p.purse - coin), setStock(town, res, st + n, now); } };
}

Plan MemoryTradeStore::planBuy(const std::string &town, const std::string &res, double want, double have, double now, Why &why) {
	const std::optional<NpcGoodRule> g = npc_rule_now(town, res, now);
	if (!g) return why.set("not_traded", "This town does not deal in " + res), Plan{};
	std::optional<double> read;
	const Purse p = purseOf(town, now, read);
	const double st = stock_of(stocksOf(town, now), res);
	const double n = buyable(*g, st, want, have), coin = cost_of(*g, st, n);
	if (!(n > 0)) return st < 0.01 ? why.set("sold_out", "The town has none left") : why.set("no_coin", "You carry too little coin"), Plan{};
	return { n, coin, [this, town, res, p, coin, st, n, now] { setPurse(town, p, p.purse + coin), setStock(town, res, st - n, now); } };
}

std::function<void()> MemoryTradeStore::planPay(const std::string &town, double coin, double now) {
	std::optional<double> read;
	const Purse p = purseOf(town, now, read);
	return [this, town, p, coin] { setPurse(town, p, p.purse + coin); };
}

Plan MemoryTradeStore::planPayOut(const std::string &town, const std::function<double(double)> &pay, double now) {
	std::optional<double> read;
	const Purse p = purseOf(town, now, read);
	const double coin = std::max(0.0, std::min(p.purse, pay(p.purse)));
	return { 0, coin, [this, town, p, coin] {
				if (coin > 0) setPurse(town, p, p.purse - coin);
			} };
}

std::function<void()> MemoryTradeStore::planStock(const std::string &town, const std::string &res, double by, double now, Why &why) {
	const auto st = stocksOf(town, now);
	const auto it = std::find_if(st.begin(), st.end(), [&](const auto &x) { return x.first == res; });
	if (it == st.end()) return why.set("not_traded", "This town does not deal in " + res), nullptr;
	const double was = it->second;
	if (was + by < -EPS) return why.set("sold_out", "The town has too little left to send"), nullptr;
	return [this, town, res, was, by, now] { setStock(town, res, std::max(0.0, was + by), now); };
}

// ---------------------------------------------------------------- members, oaths, persons

std::optional<int> MemoryTradeStore::allianceOf(int pid) {
	for (const auto &[p, a] : allies)
		if (p == pid) return a;
	return std::nullopt;
}

void MemoryTradeStore::setAlliance(int pid, int alliance) {
	for (auto &[p, a] : allies)
		if (p == pid) return void(a = alliance);
	allies.emplace_back(pid, alliance);
}

bool MemoryTradeStore::isHomeOf(int pid, const std::string &town) {
	const std::optional<int> a = allianceOf(pid);
	return !is_world_region(town) || (a && home_of(*a) == town);
}

int MemoryTradeStore::workerCount(int pid) {
	int n = 0;
	for (const MemoryStore::Rec &r : s.recs)
		if (r.pid == pid && (r.state == "active" || r.state == "wounded" || r.state == "training") && r.person.hero.cls.value_or("").rfind("civ_", 0) == 0) n++;
	return n;
}

std::string MemoryTradeStore::newId(int pid) { return "w" + std::to_string(pid) + "-" + std::to_string(++hires); }

// ---------------------------------------------------------------- townBoard.ts books

std::vector<JobRow *> MemoryTradeStore::jobsOf(int pid) {
	std::vector<JobRow *> out;
	for (auto &j : jobs)
		if (j->pid == pid) out.push_back(j.get());
	return out;
}

JobRow *MemoryTradeStore::jobOf(int pid, int id, Why &why) {
	for (auto &j : jobs)
		if (j->id == id && j->pid == pid) return j.get();
	why.set("not_found", "You do not hold that");
	return nullptr;
}

JobRow &MemoryTradeStore::addJob(const JobRow &j) {
	auto row = std::make_unique<JobRow>(j);
	row->id = nextJob++;
	row->state = "taken";
	row->done = 0;
	jobs.push_back(std::move(row));
	return *jobs.back();
}

void MemoryTradeStore::dropJob(int id) {
	jobs.erase(std::remove_if(jobs.begin(), jobs.end(), [&](const auto &j) { return j->id == id; }), jobs.end());
}

std::map<std::string, double> MemoryTradeStore::heatsOf(int pid, const std::string &town, double now) {
	std::map<std::string, double> out{ { "kill", 0 }, { "build", 0 }, { "trade", 0 } };
	for (const HeatRow &r : heat)
		if (r.pid == pid && r.town == town) out[r.kind] = heat_after(r.heat, now - r.at);
	return out;
}

void MemoryTradeStore::setHeat(int pid, const std::string &town, const std::string &kind, double h, double at) {
	for (HeatRow &r : heat)
		if (r.pid == pid && r.town == town && r.kind == kind) return void((r.heat = h, r.at = at));
	heat.push_back({ pid, town, kind, h, at });
}

int MemoryTradeStore::boardDeeds(int pid, const std::string &town, const std::vector<std::string> &lairs) {
	std::vector<double> ks;
	for (const std::string &k : lairs) ks.push_back(std::stod(k)); // Number(d.key)
	if (ks.empty()) return 0;
	int n = 0;
	for (auto &j : jobs)
		if (j->pid == pid && j->town == town && j->kind == "kill" && j->state == "taken" && j->target && std::find(ks.begin(), ks.end(), *j->target) != ks.end()) j->state = "ready", j->done = 1, n++;
	return n;
}

// ---------------------------------------------------------------- the dump

Dictionary MemoryTradeStore::dump() const {
	Array is, ps, cs, hs, ss, ns, sts, js, he, al;
	for (const StashRow &r : items) {
		Dictionary d;
		d["uid"] = G(r.uid);
		d["pid"] = r.pid;
		d["item"] = item_full_to(r.item);
		d["place"] = opt(r.place);
		d["region"] = opt(r.region);
		is.push_back(d);
	}
	for (const auto &[k, ls] : places) {
		Array a;
		for (const GoodLot &l : ls) a.push_back(lot_row(l));
		ps.push_back(Array::make(G(k), a));
	}
	for (const std::string &c : crafts) cs.push_back(G(c));
	for (const auto &[region, rows] : holds) {
		Array a;
		for (const HoldRow &r : rows) {
			Dictionary d;
			d["ref"] = G(r.ref);
			d["kind"] = G(r.kind);
			d["pid"] = r.pid;
			d["team"] = r.team;
			d["goods"] = cost_to(r.goods);
			d["items"] = item_rows(r.items);
			a.push_back(d);
		}
		hs.push_back(Array::make(G(region), a));
	}
	for (const SiteRow &x : sites) {
		Dictionary d;
		d["id"] = G(x.id);
		d["kind"] = G(x.kind);
		d["pid"] = x.pid;
		d["town"] = G(x.town);
		d["paidTo"] = opt(x.paidTo);
		ss.push_back(d);
	}
	for (const auto &[town, p] : npc) {
		Dictionary d;
		d["purse"] = p.purse;
		d["day"] = p.day;
		d["minted"] = p.minted;
		ns.push_back(Array::make(G(town), d));
	}
	for (const StockRow &r : stock) {
		Dictionary d;
		d["town"] = G(r.town);
		d["res"] = G(r.res);
		d["stock"] = r.stock;
		d["at"] = r.at;
		sts.push_back(d);
	}
	for (const auto &jp : jobs) {
		const JobRow &j = *jp;
		Dictionary d;
		d["id"] = j.id;
		d["pid"] = j.pid;
		d["town"] = G(j.town);
		d["kind"] = G(j.kind);
		d["entry"] = G(j.entry);
		d["errand"] = j.errand;
		d["goal"] = G(j.goal);
		d["giver"] = opt(j.giver);
		d["story"] = opt(j.story);
		d["state"] = G(j.state);
		d["target"] = opt(j.target);
		d["band"] = j.band.is_empty() ? Variant() : Variant(j.band);
		d["x"] = opt(j.x);
		d["y"] = opt(j.y);
		d["done"] = j.done;
		d["need"] = j.need;
		d["toTown"] = opt(j.toTown);
		d["res"] = opt(j.res);
		d["n"] = j.n;
		d["coin"] = j.coin;
		d["points"] = j.points;
		js.push_back(d);
	}
	for (const HeatRow &r : heat) {
		Dictionary d;
		d["pid"] = r.pid;
		d["town"] = G(r.town);
		d["kind"] = G(r.kind);
		d["heat"] = r.heat;
		d["at"] = r.at;
		he.push_back(d);
	}
	for (const auto &[p, a] : allies) al.push_back(Array::make(p, a));
	Dictionary out;
	out["items"] = is;
	out["places"] = ps;
	out["crafts"] = cs;
	out["holds"] = hs;
	out["sites"] = ss;
	out["npc"] = ns;
	out["stock"] = sts;
	out["jobs"] = js;
	out["heat"] = he;
	out["allies"] = al;
	Dictionary counters;
	counters["nextJob"] = nextJob;
	counters["hires"] = hires;
	out["tradeCounters"] = counters;
	return out;
}

void MemoryTradeStore::load(const Dictionary &d) {
	places.clear(), items.clear(), crafts.clear(), holds.clear(), sites.clear(), npc.clear(), stock.clear(), jobs.clear(), heat.clear(), allies.clear();
	for (const Variant &v : Array(d.get("items", Array()))) {
		const Dictionary x = v;
		items.push_back({ S(x["uid"]), int(x["pid"]), item_from(x["item"]), ostr(x, "place"), ostr(x, "region") });
	}
	for (const Variant &v : Array(d.get("places", Array()))) {
		const Array x = v;
		std::vector<GoodLot> ls;
		for (const Variant &l : Array(x[1])) {
			const Dictionary o = l;
			ls.push_back({ S(o["res"]), S(o["origin"]), o["seal"], o["amount"] });
		}
		places.emplace_back(S(x[0]), ls);
	}
	for (const Variant &v : Array(d.get("crafts", Array()))) crafts.push_back(S(v));
	for (const Variant &v : Array(d.get("holds", Array()))) {
		const Array x = v;
		std::vector<HoldRow> rows;
		for (const Variant &r : Array(x[1])) {
			const Dictionary o = r;
			HoldRow h{ S(o["ref"]), S(o["kind"]), int(o["pid"]), int(o["team"]), cost_from(o["goods"]), {} };
			for (const Variant &it : Array(o["items"])) h.items.push_back(item_from(it));
			rows.push_back(h);
		}
		holds.emplace_back(S(x[0]), rows);
	}
	for (const Variant &v : Array(d.get("sites", Array()))) {
		const Dictionary x = v;
		sites.push_back({ S(x["id"]), S(x["kind"]), int(x["pid"]), S(x["town"]), onum(x, "paidTo") });
	}
	for (const Variant &v : Array(d.get("npc", Array()))) {
		const Array x = v;
		const Dictionary p = x[1];
		npc.emplace_back(S(x[0]), Purse{ p["purse"], p["day"], p["minted"] });
	}
	for (const Variant &v : Array(d.get("stock", Array()))) {
		const Dictionary x = v;
		stock.push_back({ S(x["town"]), S(x["res"]), x["stock"], x["at"] });
	}
	for (const Variant &v : Array(d.get("jobs", Array()))) {
		const Dictionary x = v;
		auto j = std::make_unique<JobRow>();
		j->id = x["id"], j->pid = x["pid"], j->town = S(x["town"]), j->kind = S(x["kind"]), j->entry = S(x["entry"]), j->errand = x["errand"], j->goal = S(x["goal"]);
		j->giver = ostr(x, "giver"), j->story = ostr(x, "story"), j->state = S(x["state"]), j->target = onum(x, "target");
		if (x.get("band", Variant()).get_type() == Variant::DICTIONARY) j->band = x["band"];
		j->x = onum(x, "x"), j->y = onum(x, "y"), j->done = x["done"], j->need = x["need"], j->toTown = ostr(x, "toTown"), j->res = ostr(x, "res");
		j->n = x["n"], j->coin = x["coin"], j->points = x["points"];
		jobs.push_back(std::move(j));
	}
	for (const Variant &v : Array(d.get("heat", Array()))) {
		const Dictionary x = v;
		heat.push_back({ int(x["pid"]), S(x["town"]), S(x["kind"]), x["heat"], x["at"] });
	}
	for (const Variant &v : Array(d.get("allies", Array()))) allies.emplace_back(int(Array(v)[0]), int(Array(v)[1]));
	const Dictionary c = d.get("tradeCounters", Dictionary());
	nextJob = int(c.get("nextJob", 1));
	hires = int(c.get("hires", 0));
}

} // namespace sim
