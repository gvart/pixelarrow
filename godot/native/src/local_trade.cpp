// The DO's handlers of the holders and trade round the room (docs/impl/godot-port.md P8 wave B), over the store's trade
// books (room_trade_store.h), line for line as src/dev/roomTrade.ts TradeDo reads server/src/war/regionDO.ts: mend, stow
// (stowTribute, stowContract), npc (npcMarket.ts npcDeal), board (townBoard.ts boardView, boardOrder), boardReady and
// handoff; and the tick's crafted events, mends freed and board deeds.
#include "local_room.h"

#include <algorithm>
#include <cmath>
#include <limits>

#include <godot_cpp/variant/string.hpp>

#include "holders.h"
#include "js_math.h"
#include "npc_market.h"
#include "room_trade_store.h"
#include "roster.h"
#include "sim_data.h"
#include "sim_wild.h"
#include "snapshot.h"
#include "net_guide.h"
#include "start.h"
#include "stories.h"
#include "town_board.h"

namespace godot {

namespace {
constexpr double EPS = 1e-6, SITE_LOADS = 20; // market.ts SITE
std::string S(const Variant &v) { return String(v).utf8().get_data(); }
String G(const std::string &s) { return String::utf8(s.c_str()); }
std::string N(double v) { return js::number_to_string(v); }
std::string strongroom(int pid) { return "sr:" + std::to_string(pid); }
std::string tribute_place(const std::string &town, int payer) { return "tr:" + town + ":" + std::to_string(payer); }
std::vector<std::string> strs(const Variant &v) {
	std::vector<std::string> out;
	if (v.get_type() != Variant::ARRAY) return out;
	const Array a = v;
	for (int64_t i = 0; i < a.size(); i++) out.push_back(S(a[i]));
	return out;
}
Array str_array(const std::vector<std::string> &v) {
	Array a;
	for (const std::string &x : v) a.push_back(G(x));
	return a;
}
sim::Cost goods_of(const Dictionary &m) { return m.has("goods") ? sim::cost_from(m["goods"]) : sim::Cost{}; }
sim::Room::Carrier from_of(const Dictionary &m) {
	sim::Room::Carrier c;
	if (m.has("squad")) c.squad = int(m["squad"]);
	else if (m.has("cart")) c.cart = int(m["cart"]);
	return c;
}
Dictionary error(const std::string &code, const std::string &detail) {
	Dictionary e;
	e["t"] = "error";
	e["code"] = G(code);
	e["detail"] = G(detail);
	return e;
}
// TradeDo.err: an ApiError told
Dictionary refused(const sim::Why &w) { return error("badTarget", w.code + ": " + w.message); }
// the coin, unsealed, in the slots
double held_of(const std::vector<sim::CargoSlot> &slots, const std::string &res) {
	double a = 0;
	for (const sim::CargoSlot &s : slots) {
		double b = 0;
		for (const sim::Lot &l : s.hold->lots)
			if (l.r == res && !l.s) b = b + l.n;
		a = a + b;
	}
	return a;
}
sim::Lot lot_out(const sim::GoodLot &l, std::optional<double> seal) { return { l.res, l.amount, l.origin, seal }; }
Dictionary stowed(const std::string &dir, const std::string &site, const sim::Cost &goods, int items) {
	Dictionary d;
	d["t"] = "stowed";
	d["dir"] = G(dir);
	d["site"] = G(site);
	d["goods"] = sim::cost_to(goods);
	d["items"] = items;
	return d;
}
} // namespace

// regionDO.ts mend: the stash item to the workplace, then into the room's queue; refused: straight back
void LocalRoom::trade_mend(int p, const Dictionary &m) {
	sim::Room &r = *room;
	sim::TradeStore &t = store->trade();
	const std::string region = S(sim->meta["id"]);
	const std::optional<sim::Item> item = t.takeForMend(p, S(m["uid"]), region);
	if (!item) return tell(p, error("badTarget", "no such item in your stash"));
	const std::string err = r.mend(p, S(m["kind"]), int(m["building"]), *item);
	if (!err.empty()) {
		t.returnMends(region, { item->uid });
		tell(p, error(err, S(m["kind"])));
	}
}

// regionDO.ts stow (M6f): goods and items between his packs (or cart) and his site here
void LocalRoom::trade_stow(int p, const Dictionary &m) {
	sim::Room &r = *room;
	sim::TradeStore &t = store->trade();
	const std::string region = S(sim->meta["id"]), site = S(m["site"]), dir = S(m["dir"]);
	const sim::Room::Carrier from = from_of(m);
	if (!r.carrier(p, from)) return tell(p, error("notOwner", "stow"));
	if (site == "contract") {
		// stowContract (M6g): contracts are posted over HTTP, so offline there is none
		if (!r.inCourt(p, from)) return tell(p, error("badTarget", "not_in_court: Bring them into the market court"));
		return tell(p, error("badTarget", "not_found: No contract " + (m.has("contract") ? N(m["contract"]) : std::string("undefined"))));
	}
	if (site == "tribute") {
		// stowTribute (W-153): a payer's tribute set aside at this town, onto someone's back
		const int payer = m.has("of") ? int(m["of"]) : p;
		if (dir != "out") return tell(p, error("badTarget", "tribute: only out"));
		if (!r.inCourt(p, from)) return tell(p, error("badTarget", "not_in_court: Bring them into the market court"));
		const std::optional<int> lord = t.liegeOf(payer);
		if (!lord || (m.has("of") && *lord != p)) return tell(p, error("badTarget", "not_sworn: Nothing is owed to you here"));
		const std::string place = tribute_place(region, payer);
		const std::optional<double> seal = m.has("of") ? std::nullopt : std::optional<double>(-*lord);
		sim::Why why;
		const sim::Cost want = goods_of(m);
		const auto taken = t.planTake(place, want.empty() ? t.goodsAt(place) : want, why);
		if (why) return tell(p, error("badTarget", why.code + ": " + why.message));
		t.takeLots(place, taken);
		sim::Bundle b;
		for (const sim::GoodLot &l : taken) b.lots.push_back(lot_out(l, seal));
		const sim::Bundle rest = r.giveCargo(p, from, b);
		for (const sim::Lot &l : rest.lots) t.put(place, l.r, l.n, l.o);
		Dictionary d = stowed("out", place, sim::bundle_goods(b), 0);
		if (!rest.lots.empty()) d["left"] = sim::cost_to(sim::bundle_goods(rest));
		return tell(p, d);
	}
	sim::Why why;
	std::string id;
	if (site == "strongroom") {
		if (sim::is_world_region(region)) {
			const std::optional<int> a = t.allianceOf(p);
			if (!a || sim::home_of(*a) != region) why.set("not_home", "Your strongroom is at home");
		}
		id = strongroom(p);
	} else {
		if (!r.inCourt(p, from)) why.set("not_in_court", "Bring them into the market court");
		else id = t.site(p, region, site, now(), why);
	}
	if (why) return tell(p, refused(why));
	const sim::Cost goods = goods_of(m);
	const std::vector<std::string> uids = strs(m.get("uids", Variant()));
	if (dir == "in") {
		const std::optional<sim::Bundle> b = r.takeCargo(p, from, goods, uids);
		if (!b) return tell(p, error("badTarget", "they do not carry that"));
		if (id.compare(0, 3, "wh:") == 0 && t.loadsIn(id) + sim::bundle_loads(*b) > SITE_LOADS + 1e-6) {
			r.giveCargo(p, from, *b);
			return tell(p, error("badTarget", "warehouse_full: A warehouse holds " + N(SITE_LOADS) + " loads"));
		}
		for (const sim::Lot &l : b->lots) t.put(id, l.r, l.n, l.o, l.s.value_or(0));
		for (const sim::Item &it : b->items) t.placeItem(p, id, it);
		tell(p, stowed("in", id, sim::bundle_goods(*b), int(b->items.size())));
		if (site == "strongroom") r.setLarder(p, store->goodsOf(p)); // W-80
		return;
	}
	const auto taken = t.planTake(id, goods, why);
	if (why) return tell(p, refused(why));
	const std::optional<std::vector<sim::Item>> rows = t.itemsAt(id, uids);
	if (!rows) return tell(p, error("badTarget", "no_item: An item is not there"));
	t.takeLots(id, taken);
	t.dropItems(id, uids);
	sim::Bundle b;
	for (const sim::GoodLot &l : taken) b.lots.push_back(lot_out(l, l.seal ? std::optional<double>(l.seal) : std::nullopt));
	b.items = *rows;
	const sim::Bundle rest = r.giveCargo(p, from, b);
	for (const sim::Lot &l : rest.lots) t.put(id, l.r, l.n, l.o, l.s.value_or(0));
	for (const sim::Item &it : rest.items) t.placeItem(p, id, it);
	Dictionary d = stowed("out", id, sim::bundle_goods(b), int(b.items.size() - rest.items.size()));
	if (!rest.lots.empty()) d["left"] = sim::cost_to(sim::bundle_goods(rest));
	tell(p, d);
	if (site == "strongroom") r.setLarder(p, store->goodsOf(p)); // W-80
}

// npcMarket.ts takeCoin: his coin from the packs at the town, and at home from his strongroom too (the packs' coin is
// taken at once, the strongroom's on apply)
std::function<void()> LocalRoom::take_coin(const std::vector<sim::CargoSlot> &slots, double coin, bool home, int p, sim::Why &why) {
	sim::TradeStore &t = store->trade();
	const double pack = std::min(coin, held_of(slots, "coin")), rest = coin - pack;
	if (rest > 1e-6 && !home) return why.set("no_coin", "It costs " + N(coin) + " coin: your men at the town carry " + N(std::floor(pack))), nullptr;
	const std::string id = strongroom(p);
	sim::Cost c;
	c.set("coin", rest);
	const std::vector<sim::GoodLot> taken = rest > 1e-6 ? t.planTake(id, c, why, "Your strongroom") : std::vector<sim::GoodLot>{};
	if (why) return nullptr;
	if (pack > 0) {
		sim::Cost k;
		k.set("coin", pack);
		sim::cargo_take_out(slots, k);
	}
	return [&t, id, taken] { t.takeLots(id, taken); };
}

// npcMarket.ts npcGive: a bundle into the packs and carts at the town; what does not fit is set down at their feet
void LocalRoom::npc_give(const std::vector<sim::CargoSlot> &slots, const sim::Bundle &b) {
	const sim::Bundle rest = sim::cargo_fill(slots, b);
	if (!rest.lots.empty()) sim->s->piles->drop(slots[0].x, slots[0].y, rest.lots, {}, sim->s->tick);
}

// regionDO.ts npc (W-143..W-145): a deal with this region's NPC town, told; a hired man falls in
void LocalRoom::trade_npc(int p, const Dictionary &m) {
	sim::Room &r = *room;
	sim::TradeStore &t = store->trade();
	const std::string town = S(sim->meta["id"]), op = S(m["op"]);
	const double at = now();
	sim::Why why;
	const auto fail = [&] { tell(p, refused(why)); };
	if (sim::npc_goods(town).empty()) return why.set("no_town", "There is no town here"), fail();
	const std::vector<sim::CargoSlot> slots = r.npcSlots(p);
	if (slots.empty()) return why.set("not_present", "Your men must stand at the town"), fail();
	const bool home = t.isHomeOf(p, town);
	Dictionary done;
	done["t"] = "npcDone";
	done["op"] = G(op);
	if (op == "sell") {
		const std::string res = S(m["res"]);
		const double have = held_of(slots, res), want = std::min(m.has("n") ? double(m["n"]) : have, have);
		if (!(want > 1e-6)) return why.set("no_goods", "Your men carry no " + res), fail();
		const sim::Plan plan = t.planSell(town, res, want, at, why);
		if (why) return fail();
		sim::Cost c;
		c.set(res, plan.n);
		const sim::Bundle b = *sim::cargo_take_out(slots, c);
		double far = 0;
		for (const sim::Lot &l : b.lots)
			if (l.o != town && !(home && l.o == "home")) far = far + l.n;
		const double abroad = std::floor((plan.coin * far) / plan.n), cut = t.tributeCut(p, plan.coin), kept = plan.coin - cut;
		plan.apply();
		if (home) t.put(strongroom(p), "coin", kept, town);
		if (cut > 0) t.put(tribute_place(town, p), "coin", cut);
		if (!home) npc_give(slots, { { { "coin", kept, town, std::nullopt } }, {} });
		r.storyTrade(p, "sell", plan.coin, abroad);
		done["coin"] = plan.coin;
		done["res"] = G(res);
		done["n"] = plan.n;
		if (cut > 0) done["tribute"] = cut;
		return tell(p, done);
	}
	if (op == "buy") {
		const std::string res = S(m["res"]);
		const double roomFor = sim::cargo_room(slots) * sim::per_load(res), want = std::min(m.has("n") ? double(m["n"]) : roomFor, roomFor);
		if (!(want > 1e-6)) return why.set("no_room", "Your men and carts here have no room"), fail();
		const double bank = home ? t.goodsAt(strongroom(p)).get("coin") : 0;
		const sim::Plan plan = t.planBuy(town, res, want, held_of(slots, "coin") + bank, at, why);
		if (why) return fail();
		const auto pay = take_coin(slots, plan.coin, home, p, why);
		if (why) return fail();
		plan.apply();
		pay();
		npc_give(slots, { { { res, plan.n, town, std::nullopt } }, {} });
		r.storyTrade(p, "buy", plan.coin, 0);
		done["coin"] = plan.coin;
		done["res"] = G(res);
		done["n"] = plan.n;
		return tell(p, done);
	}
	if (op == "hire") {
		const std::string cls = S(m["cls"]);
		const std::optional<double> cost = sim::npc_hire(cls);
		if (!cost) return why.set("bad_request", "Nobody here hires out as " + cls), fail();
		const std::string no = sim::man_refusal(store->path(p), cls, store->armyCount(p), t.workerCount(p));
		if (no == "family") return why.set("wrong_family", "A worker is not of your people"), fail();
		if (no == "locked") return why.set("class_locked", "A worker will not follow you yet: a higher level first"), fail();
		if (!no.empty()) return no == "household" ? why.set("household_full", "Your household is full") : why.set("army_full", "Your army is full"), fail();
		const auto pay = take_coin(slots, *cost, home, p, why);
		if (why) return fail();
		const std::string id = t.newId(p);
		sim::WarPerson man = sim::make_person(id, cls);
		const auto &classes = sim::data().roster.CLASSES;
		const auto ci = classes.find(cls);
		const std::string culture = ci != classes.end() ? ci->second.culture : classes.at("militia").culture;
		man.hero.name = sim::free_name_for(culture, int(std::fmod(at, 97)), {});
		const auto paid = t.planPay(town, *cost, at);
		pay();
		paid();
		store->add(p, man, town);
		const auto got = store->claimForJoin(p, town, { { id } }, r.personsHere(), at, [this](const sim::StoredSoul &s) { return wake(s); });
		sim::Room::Mustered fell;
		if (!std::holds_alternative<std::string>(got)) fell = r.hired(p, std::get<0>(got)[0]); // no room now: he waits off the field
		r.storyTrade(p, "hire", *cost, 0);
		done["coin"] = *cost;
		tell(p, done);
		if (fell.ok && !fell.msg.is_empty() && open.count(p)) tell(p, fell.msg);
		return;
	}
	const std::string type = S(m["cart"]);
	const double cost = sim::npc_cart(type).value_or(0);
	if (double(r.cartsOf(p).size()) >= sim::cart_cap(store->path(p).path)) return why.set("carts_full", "You keep as many carts as your path allows"), fail();
	const auto pay = take_coin(slots, cost, home, p, why);
	if (why) return fail();
	const auto paid = t.planPay(town, cost, at);
	pay();
	paid();
	r.giveCart(p, type);
	r.storyTrade(p, "cart", cost, 0);
	done["coin"] = cost;
	tell(p, done);
}

// regionDO.ts chainOver (W-190): his chain at this town is over, or he has none here
bool LocalRoom::chain_over(int p) {
	if (!sim::story_of(S(sim->meta["id"]), store->path(p).path)) return true;
	const Variant s = store->saveOf("story", p);
	return s.get_type() == Variant::DICTIONARY && bool(Dictionary(s).get("done", false));
}

// townBoard.ts boardView: the board at this town as he reads it, his men `men`
Dictionary LocalRoom::board_view(int p, const std::vector<sim::BoardMan> &men, bool chainOver, sim::Why &why) {
	sim::TradeStore &t = store->trade();
	const Dictionary &meta = sim->meta;
	const std::string town = S(meta["id"]);
	const double at = now();
	if (sim::npc_goods(town).empty()) return why.set("no_town", town + " is no town"), Dictionary();
	const sim::PlayerPath way = store->path(p);
	const double level = way.level.value_or(1);
	std::vector<sim::BoardMan> fighters, whole;
	for (const sim::BoardMan &m : men)
		if (m.cls.rfind("civ_", 0) != 0) fighters.push_back(m), whole.push_back({ m.cls, m.level, std::nullopt });
	const double wholeS = sim::army_strength(whole, level), army = sim::army_strength(fighters, level);
	const std::map<std::string, double> heats = t.heatsOf(p, town, at);
	const Dictionary npc = t.npcView(town, at, why);
	if (why) return Dictionary();
	const std::vector<sim::JobRow *> jobs = t.jobsOf(p);
	const double win = sim::board_window(at);
	const sim::Story *chain = way.path.empty() ? nullptr : sim::story_of(town, way.path);
	sim::BoardFor f;
	f.army = wholeS;
	f.path = way.path;
	f.killHeat = heats.at("kill");
	f.errand = chainOver;
	if (chain) f.giver = chain->giver.name;
	const Array entries = sim::board_entries(meta, win, f);
	std::set<std::string> held;
	for (const sim::JobRow *j : jobs)
		if (j->town == town) held.insert(j->entry);
	const auto opt = [](const std::optional<double> &v) { return v ? Variant(*v) : Variant(); };
	const auto ostr = [](const std::optional<std::string> &v) { return v ? Variant(G(*v)) : Variant(); };
	Array js;
	for (const sim::JobRow *j : jobs) {
		Dictionary d;
		d["id"] = j->id;
		d["kind"] = G(j->kind);
		d["town"] = G(j->town);
		d["goal"] = G(j->goal);
		d["state"] = G(j->state);
		d["done"] = j->done;
		d["need"] = j->need;
		d["x"] = opt(j->x);
		d["y"] = opt(j->y);
		d["toTown"] = ostr(j->toTown);
		d["res"] = ostr(j->res);
		d["n"] = j->n;
		d["coin"] = j->coin;
		d["points"] = j->points;
		d["errand"] = j->errand != 0;
		d["giver"] = ostr(j->giver);
		d["story"] = ostr(j->story);
		js.push_back(d);
	}
	Dictionary v;
	v["town"] = G(town);
	v["purse"] = npc["purse"];
	v["until"] = sim::window_end(win);
	v["lines"] = sim::board_lines(entries, army, way.path, [&](const std::string &k) { return heats.at(k); }, npc["purse"], held, sim::depth_of(meta));
	v["jobs"] = js;
	return v;
}

// regionDO.ts board (W-184..W-190): an order at this town's board, answered with what he reads after it
void LocalRoom::trade_board(int p, const Dictionary &m) {
	sim::Room &r = *room;
	sim::TradeStore &t = store->trade();
	const std::string town = S(sim->meta["id"]), op = S(m["op"]);
	const double at = now();
	const bool chainOver = chain_over(p);
	sim::Why why;
	const auto fail = [&] { tell(p, refused(why)); };
	const auto done = [&](const Dictionary &paid) {
		const Dictionary view = board_view(p, r.armyOf(p), chainOver, why);
		if (why) return fail();
		Dictionary d;
		d["t"] = "boardView";
		d["view"] = view;
		if (!paid.is_empty()) d["paid"] = paid;
		tell(p, d);
	};
	if (op == "view") return done({});
	const std::vector<sim::CargoSlot> slots = r.npcSlots(p);
	const auto seal = [](int id) { return sim::TOWN_SEAL + id; };
	if (op == "take") {
		if (slots.empty()) return why.set("not_present", "Your men must stand at the town"), fail();
		if (double(t.jobsOf(p).size()) >= sim::data().board.hold) return why.set("board_full", "You hold " + N(sim::data().board.hold) + " already: finish or drop one"), fail();
		const Dictionary view = board_view(p, r.armyOf(p), chainOver, why);
		if (why) return fail();
		Dictionary e;
		const Array lines = view["lines"];
		for (int64_t i = 0; i < lines.size(); i++)
			if (m.has("entry") && S(Dictionary(lines[i])["id"]) == S(m["entry"])) {
				e = lines[i];
				break;
			}
		if (e.is_empty()) return why.set("gone", "That line is gone from the board"), fail();
		if (bool(e["held"])) return why.set("held", "You hold that one already"), fail();
		const std::string kind = S(e["kind"]);
		if (kind == "trade" && sim::cargo_room(slots) < double(e["loads"]) - 1e-6) return why.set("no_room", "It takes " + N(e["loads"]) + " loads of room in the packs and carts here"), fail();
		std::function<void()> stock;
		if (kind == "trade") {
			stock = t.planStock(town, S(e["res"]), -double(e["n"]), at, why);
			if (why) return fail();
		}
		std::optional<sim::Room::TownBand> band;
		if (e.has("band")) band = r.townBand(e["band"], std::to_string(p) + ":" + S(e["id"]));
		sim::JobRow j;
		j.pid = p, j.town = town, j.kind = kind, j.entry = S(e["id"]), j.errand = S(e["size"]) == "errand" ? 1 : 0, j.goal = S(e["goal"]);
		if (e.has("giver")) j.giver = S(e["giver"]);
		if (e.has("story")) j.story = S(e["story"]);
		if (band) j.target = band->lair;
		if (e.has("band")) j.band = Dictionary(e["band"]).duplicate(true);
		if (band) j.x = band->x, j.y = band->y;
		else if (e.has("site")) j.x = double(Dictionary(e["site"])["x"]), j.y = double(Dictionary(e["site"])["y"]);
		j.need = kind == "build" ? double(e["labour"]) : kind == "trade" ? double(e["n"]) : 1;
		if (e.has("toTown")) j.toTown = S(e["toTown"]);
		if (e.has("res")) j.res = S(e["res"]);
		j.n = e.has("n") ? double(e["n"]) : 0;
		j.coin = e["coin"];
		j.points = e["points"];
		const sim::JobRow &row = t.addJob(j);
		if (stock) {
			stock();
			sim::cargo_fill(slots, { { { S(e["res"]), double(e["n"]), town, seal(row.id) } }, {} });
		}
		if (kind == "build") r.watchTownJob({ row.id, p, double(Dictionary(e["site"])["x"]), double(Dictionary(e["site"])["y"]) });
		return done({});
	}
	sim::JobRow *j = t.jobOf(p, m.has("job") ? int(m["job"]) : -1, why);
	if (why) return fail();
	if (op == "deliver") {
		if (j->kind != "trade" || j->state != "taken") return why.set("not_load", "You carry no load under that"), fail();
		if (j->toTown != town) return why.set("wrong_town", "It goes to " + j->toTown.value_or("null")), fail();
		if (slots.empty()) return why.set("not_present", "Your men must stand at the town"), fail();
		const sim::Bundle b = sim::cargo_take_sealed(slots, seal(j->id));
		double n = 0;
		for (const sim::Lot &l : b.lots) n = n + l.n;
		if (!(n > 1e-6)) return why.set("no_load", "The load is lost"), fail();
		const auto put = t.planStock(town, j->res.value_or(""), n, at, why);
		if (why) {
			std::vector<sim::CargoSlot> wide = slots;
			for (sim::CargoSlot &s : wide) s.cap = std::numeric_limits<double>::infinity();
			sim::cargo_fill(wide, b);
			return fail();
		}
		put();
		if (j->state == "taken") j->state = "ready", j->done = n;
		return done({});
	}
	if (op == "drop") {
		// W-192: a load goes back where it came from
		if (j->kind == "trade" && j->state == "taken") {
			if (town != j->town || slots.empty()) return why.set("wrong_town", "Bring the load back to the board to drop it"), fail();
			double n = 0;
			for (const sim::Lot &l : sim::cargo_take_sealed(slots, seal(j->id)).lots) n = n + l.n;
			if (n > 1e-6) {
				const auto put = t.planStock(town, j->res.value_or(""), n, at, why);
				if (why) return fail();
				put();
			}
		}
		const int id = j->id;
		const bool build = j->kind == "build";
		t.dropJob(id);
		if (build) r.unwatchTownJob(id);
		return done({});
	}
	if (j->town != town) return why.set("wrong_town", "Hand it in at " + j->town), fail();
	if (slots.empty()) return why.set("not_present", "Your men must stand at the town"), fail();
	if (j->state != "ready") return why.set("not_done", "It is not done yet"), fail();
	const sim::PlayerPath way = store->path(p);
	const std::string kind = j->kind;
	const double heat = t.heatsOf(p, town, at).at(kind);
	const double share = kind == "trade" && j->n > 0 ? std::min(1.0, j->done / j->n) : 1, coin = j->coin * share, points = j->points * share;
	const sim::Plan pay = t.planPayOut(town, [&](double purse) { return sim::quote_pay(kind, coin, points, way.path, heat, purse).coin; }, at);
	const double gain = sim::quote_pay(kind, coin, points, way.path, heat, std::numeric_limits<double>::infinity()).points;
	const bool home = t.isHomeOf(p, town);
	t.dropJob(j->id);
	pay.apply();
	t.setHeat(p, town, kind, heat + 1, at);
	if (home && pay.coin > 0) t.put(strongroom(p), "coin", pay.coin, town);
	if (!home && pay.coin > 0) npc_give(slots, { { { "coin", pay.coin, town, std::nullopt } }, {} });
	Dictionary paid;
	paid["coin"] = pay.coin;
	paid["points"] = gain;
	done(paid);
}

// regionDO.ts boardReady (W-185): a contract of his came ready: told
void LocalRoom::board_ready(int p) {
	if (!open.count(p)) return;
	sim::Why why;
	const Dictionary view = board_view(p, room->armyOf(p), chain_over(p), why);
	if (why) return;
	Dictionary d;
	d["t"] = "boardView";
	d["view"] = view;
	tell(p, d);
}

// regionDO.ts handoff (M6g): the window; both confirmed, the swap at once (online the M6i checks first: abuse.ts)
void LocalRoom::trade_handoff(int p, const Dictionary &m) {
	sim::Room &r = *room;
	const std::string op = S(m["op"]);
	std::optional<sim::Room::HandoffHalf> half;
	if (op == "offer") half = sim::Room::HandoffHalf{ from_of(m), goods_of(m), strs(m.get("uids", Variant())) };
	const sim::Room::HandoffGot got = r.handoff(p, int(m["with"]), op, half);
	if (!got.error.empty()) return tell(p, error(got.error, "handoff: " + got.detail));
	const sim::Room::HandoffWindow &w = got.window;
	const auto say = [&](const std::function<Dictionary(int)> &msg) {
		for (int q : { w.a, w.b })
			if (open.count(q)) tell(q, msg(q == w.a ? w.b : w.a));
	};
	const auto base = [](int with, const char *state) {
		Dictionary d;
		d["t"] = "handoff";
		d["with"] = with;
		d["state"] = state;
		return d;
	};
	if (op == "cancel") return say([&](int o) {
		Dictionary d = base(o, "closed");
		d["why"] = "cancelled";
		return d;
	});
	Dictionary halves;
	for (const auto &[k, h] : w.halves) {
		Dictionary x;
		x["goods"] = sim::cost_to(h.goods);
		x["uids"] = str_array(h.uids);
		halves[G(std::to_string(k))] = x;
	}
	if (!got.ready) {
		Array ok;
		for (int x : w.ok) ok.push_back(x);
		return say([&](int o) {
			Dictionary d = base(o, "open");
			d["halves"] = halves;
			d["ok"] = ok;
			d["until"] = w.until;
			return d;
		});
	}
	const std::string err = r.swapHandoff(w.a, w.b);
	if (!err.empty()) return say([&](int o) {
		Dictionary d = base(o, "closed");
		d["why"] = G(err);
		return d;
	});
	say([&](int o) {
		Dictionary d = base(o, "done");
		d["halves"] = halves;
		return d;
	});
}

// the tick's books of the holders and trade (regionDO.ts outputs): crafted items written back, mends freed
void LocalRoom::trade_books(const sim::Room::TickOut &res) {
	const std::string region = S(sim->meta["id"]);
	store->trade().applyCrafts(region, room->run, res.crafted);
	store->trade().returnMends(region, res.freed);
}

// W-185: his Kills done by the wild's deeds: ready, and told
void LocalRoom::trade_deeds(const sim::Room::TickOut &res) {
	const std::string region = S(sim->meta["id"]);
	std::vector<std::pair<int, std::vector<std::string>>> by; // a JS Map: in order of first
	for (int64_t i = 0; i < res.wild.size(); i++) {
		const Dictionary x = res.wild[i];
		const int p = x["pid"];
		auto e = std::find_if(by.begin(), by.end(), [&](const auto &b) { return b.first == p; });
		if (e == by.end()) e = by.insert(by.end(), { p, {} });
		if (S(x["kind"]) == "lair") e->second.push_back(S(x["key"]));
	}
	for (const auto &[p, lairs] : by)
		if (store->trade().boardDeeds(p, region, lairs)) board_ready(p);
}

// the wave-B ops (TsLocal.call): items into his stash, a rented site, a look at the snapshot, a guardian hurt
bool LocalRoom::trade_op(const std::string &op, const Array &a, Variant &res) {
	if (op == "stash") {
		const Array items = a[1];
		for (int64_t i = 0; i < items.size(); i++) store->trade().placeItem(int(a[0]), strongroom(int(a[0])), sim::item_from(items[i]));
		return true;
	}
	if (op == "rent") {
		sim::Why why;
		const std::string id = store->trade().rentSite(int(a[0]), S(a[1]), S(a[2]), now(), why);
		res = why ? Variant() : Variant(G(id));
		if (why) ERR_PRINT(G("LocalRoom rent: " + why.code));
		return true;
	}
	if (op == "snap") {
		res = room->snapshot().get(a[0], Variant());
		return true;
	}
	if (op == "hurtBoss") {
		sim->s->hurtBoss(S(a[0]), double(a[1]), S(a[2]));
		return true;
	}
	return false;
}

// M6e: the region's holds for the stash screen (saveRegionHolds) after a save
void LocalRoom::trade_saved() { store->trade().saveHolds(S(sim->meta["id"]), room->holdRows()); }

// a restored room's workplaces hold only its mends (keepMends)
void LocalRoom::trade_restored() { store->trade().keepMends(S(sim->meta["id"]), room->mendUids()); }

} // namespace godot
