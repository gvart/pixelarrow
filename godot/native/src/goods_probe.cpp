#include "goods_probe.h"

#include <map>

#include <godot_cpp/core/class_db.hpp>

#include "crafting.h"
#include "economy.h"
#include "holders.h"
#include "sim_data.h"
#include "trade.h"

namespace godot {

using sim::Cost;
using sim::Hold;
using sim::Item;
using sim::Lot;

static std::string S(const Variant &v) { return String(v).utf8().get_data(); }
static String G(const std::string &s) { return String::utf8(s.c_str()); }
static std::optional<std::string> opt_s(const Dictionary &d, const char *k) { return d.has(k) && d[k].get_type() != Variant::NIL ? std::optional<std::string>(S(d[k])) : std::nullopt; }

static Item item_of(const Dictionary &d) {
	Item it;
	it.uid = S(d["uid"]);
	it.def = S(d["def"]);
	it.rarity = S(d["rarity"]);
	it.cond = d["cond"];
	if (d.has("paint")) {
		const Dictionary p = d["paint"];
		it.paint = sim::ItemPaint{ opt_s(p, "emblem"), opt_s(p, "field"), opt_s(p, "ink") };
	}
	it.aff = opt_s(d, "aff");
	it.pow = opt_s(d, "pow");
	if (d.has("q")) it.q = int(d["q"]);
	if (d.has("mc")) it.mc = double(d["mc"]);
	it.mk = opt_s(d, "mk");
	it.tr = opt_s(d, "tr");
	return it;
}

static Dictionary item_dict(const Item &it) {
	Dictionary d;
	d["uid"] = G(it.uid);
	d["def"] = G(it.def);
	d["rarity"] = G(it.rarity);
	d["cond"] = it.cond;
	if (it.paint) {
		Dictionary p;
		if (it.paint->emblem) p["emblem"] = G(*it.paint->emblem);
		if (it.paint->field) p["field"] = G(*it.paint->field);
		if (it.paint->ink) p["ink"] = G(*it.paint->ink);
		d["paint"] = p;
	}
	if (it.aff) d["aff"] = G(*it.aff);
	if (it.pow) d["pow"] = G(*it.pow);
	if (it.q) d["q"] = *it.q;
	if (it.mc) d["mc"] = *it.mc;
	if (it.mk) d["mk"] = G(*it.mk);
	if (it.tr) d["tr"] = G(*it.tr);
	return d;
}

static Array lot_arr(const Lot &l) {
	Array a;
	a.push_back(G(l.r));
	a.push_back(l.n);
	a.push_back(G(l.o));
	if (l.s) a.push_back(*l.s);
	return a;
}

static Lot lot_of(const Array &a) {
	Lot l{ S(a[0]), a[1], S(a[2]), std::nullopt };
	if (a.size() > 3) l.s = double(a[3]);
	return l;
}

static Array entries(const Cost &c) {
	Array out;
	for (const auto &[k, v] : c.kv) {
		Array e;
		e.push_back(G(k));
		e.push_back(v);
		out.push_back(e);
	}
	return out;
}

static Cost cost_entries(const Array &a) {
	Cost c;
	for (int64_t i = 0; i < a.size(); i++) c.set(S(Array(a[i])[0]), double(Array(a[i])[1]));
	return c;
}

template <typename T>
static Array ints(const std::vector<T> &v) {
	Array a;
	for (const T &x : v) a.push_back(x);
	return a;
}

// ------------------------------------------------------------------ economy

Dictionary GoodsProbe::economy(const Dictionary &vec) {
	Dictionary out;
	Array bs;
	for (const std::string &t : sim::data().economy.types) {
		const sim::BuildingDef &d = sim::building(t);
		const auto r0 = sim::rotated(t, 0), r1 = sim::rotated(t, 1);
		Array row;
		row.push_back(G(t));
		row.push_back(Array::make(r0[0], r0[1]));
		row.push_back(Array::make(r1[0], r1[1]));
		row.push_back(sim::lock_of(d));
		row.push_back(sim::needs_person(t, d));
		bs.push_back(row);
	}
	out["buildings"] = bs;
	Array rects;
	const Array rin = vec["rects"];
	for (int64_t i = 0; i < rin.size(); i++) {
		const Array r = rin[i];
		rects.push_back(Array::make(r[0], r[1], r[2], r[3], ints(sim::rect_tiles(r[0], r[1], r[2], r[3]))));
	}
	out["rects"] = rects;
	Array lines;
	const Array lin = vec["lines"];
	for (int64_t i = 0; i < lin.size(); i++) {
		const Array pts = Array(lin[i])[0];
		std::vector<double> p;
		for (int64_t k = 0; k < pts.size(); k++) p.push_back(pts[k]);
		lines.push_back(Array::make(pts, ints(sim::line_tiles(p))));
	}
	out["lines"] = lines;
	return out;
}

Dictionary GoodsProbe::building(const String &type) {
	const sim::BuildingDef &d = sim::building(S(type));
	Dictionary o;
	o["w"] = d.w;
	o["h"] = d.h;
	o["hp"] = d.hp;
	o["cost"] = entries(d.cost);
	o["labour"] = d.labour;
	o["workers"] = d.workers;
	o["influence"] = d.influence;
	o["material"] = G(d.material);
	if (d.store) o["store"] = true;
	if (!d.wall.empty()) o["wall"] = G(d.wall);
	if (d.perTile) o["perTile"] = true;
	if (d.yields) o["yields"] = Array::make(G(d.yields->res), d.yields->max, d.yields->regrow, d.yields->rate);
	if (d.tier) o["tier"] = d.tier;
	if (d.walk) o["walk"] = d.walk;
	if (d.cap) o["cap"] = d.cap;
	if (d.depth) o["depth"] = d.depth;
	if (!d.access.empty()) o["access"] = G(d.access);
	if (d.door) o["door"] = true;
	if (d.burnable) o["burnable"] = true;
	if (d.bridge) o["bridge"] = true;
	if (d.upgrade) o["upgrade"] = Array::make(G(d.upgrade->to), entries(d.upgrade->cost), d.upgrade->labour);
	if (d.brazier) o["brazier"] = true;
	if (!d.field.empty()) o["field"] = G(d.field);
	if (d.workplace) {
		Array spots;
		if (d.workplace->spots)
			for (const auto &s : *d.workplace->spots) spots.push_back(Array::make(s[0], s[1], s[2], s[3]));
		o["workplace"] = Array::make(G(d.workplace->kind), d.workplace->level, spots);
	}
	if (d.chest) o["chest"] = d.chest;
	if (d.prebuilt) o["prebuilt"] = true;
	if (d.cache) o["cache"] = d.cache;
	if (d.house) o["house"] = true;
	return o;
}

// ------------------------------------------------------------------ holders

static Array holds_state(const std::vector<Hold> &hs) {
	Array out;
	for (const Hold &h : hs) {
		Dictionary d;
		Array lots, items;
		for (const Lot &l : h.lots) lots.push_back(lot_arr(l));
		for (const Item &i : h.items) items.push_back(G(i.uid));
		d["lots"] = lots;
		d["items"] = items;
		out.push_back(d);
	}
	return out;
}

// The named draws of src/dev/vectors/holders.ts DRAWS.
static sim::Draw draw_named(const std::string &name) {
	if (name == "payTithe") return sim::Draw{ [](const Lot &l) { return sim::is_tithe(l) && *l.s == -2; }, [](const Lot &) { return std::optional<double>(); }, true };
	if (name == "setTithe") return sim::Draw{ [](const Lot &l) { return !sim::is_tithe(l) && !l.s; }, [](const Lot &) { return std::optional<double>(-5); }, false };
	return sim::Draw{ [](const Lot &) { return true; }, [](const Lot &l) { return l.s; }, false };
}

Dictionary GoodsProbe::holders(const Dictionary &vec) {
	std::vector<Hold> holds(4);
	const Array goods = vec["goods"], steps = vec["steps"];
	Array outs;
	for (int64_t k = 0; k < steps.size(); k++) {
		const Dictionary s = steps[k];
		const std::string op = S(s["op"]);
		const int a = int(s["a"]);
		Dictionary o;
		if (op == "put") {
			sim::put(holds[a], S(s["g"]), s["n"], S(s["o"]), s.has("s") ? std::optional<double>(double(s["s"])) : std::nullopt);
		} else if (op == "putLots") {
			std::vector<Lot> lots;
			const Array la = s["lots"];
			for (int64_t i = 0; i < la.size(); i++) lots.push_back(lot_of(la[i]));
			sim::put_lots(holds[a], lots);
		} else if (op == "take") {
			Array t;
			for (const Lot &l : sim::take(holds[a], S(s["g"]), s["n"])) t.push_back(lot_arr(l));
			o["out"] = t;
		} else if (op == "takeFrom") {
			const Array hs = s["hs"];
			std::vector<Hold *> ps;
			for (int64_t i = 0; i < hs.size(); i++) ps.push_back(&holds[int(hs[i])]);
			o["out"] = sim::take_from(ps, cost_entries(s["cost"]));
		} else if (op == "move") {
			const sim::Draw d = s.has("draw") ? draw_named(S(s["draw"])) : sim::Draw{};
			o["out"] = sim::move(holds[a], holds[int(s["b"])], s["max"], s.has("r") ? std::optional<std::string>(S(s["r"])) : std::nullopt,
					s.has("maxItems") ? double(s["maxItems"]) : std::numeric_limits<double>::infinity(), s["unsealed"], s.has("draw") ? &d : nullptr);
		} else if (op == "items") {
			const Array its = s["items"];
			for (int64_t i = 0; i < its.size(); i++) holds[a].items.push_back(item_of(its[i]));
		} else if (op == "spoil") {
			sim::spoil(holds[a], s["share"]);
		}
		const Hold &h = holds[a];
		Dictionary q;
		Array am;
		for (int64_t i = 0; i < goods.size(); i++) am.push_back(sim::amount(h, S(goods[i])));
		q["amount"] = am;
		Cost tot;
		q["totals"] = entries(sim::totals(h, tot));
		q["loads"] = sim::loads(h);
		q["empty"] = sim::empty(h);
		q["tithe"] = entries(sim::tithe_in(h).value_or(Cost{}));
		Array list;
		for (const sim::HoldItem &i : sim::item_list(h, 3)) {
			Dictionary d;
			d["uid"] = G(i.uid);
			d["def"] = G(i.def);
			d["rarity"] = G(i.rarity);
			if (i.q) d["q"] = *i.q;
			list.push_back(d);
		}
		q["list"] = list;
		o["q"] = q;
		o["holds"] = holds_state(holds);
		outs.push_back(o);
	}
	Dictionary out;
	out["steps"] = outs;
	Array pl, seals;
	const Array pin = vec["perLoad"], sin = vec["seals"];
	for (int64_t i = 0; i < pin.size(); i++) {
		const Variant g = Array(pin[i])[0];
		pl.push_back(Array::make(g, sim::per_load(g.get_type() == Variant::NIL ? std::nullopt : std::optional<std::string>(S(g)))));
	}
	for (int64_t i = 0; i < sin.size(); i++) {
		const Variant o = Array(sin[i])[0];
		const auto seal = sim::tithe_seal(o.get_type() == Variant::NIL ? std::nullopt : std::optional<std::string>(S(o)));
		seals.push_back(Array::make(o, seal ? Variant(*seal) : Variant()));
	}
	out["perLoad"] = pl;
	out["seals"] = seals;
	return out;
}

// ------------------------------------------------------------------ trade

static Dictionary pile_dict(const sim::Pile &p) {
	Dictionary d;
	d["id"] = p.id;
	d["x"] = p.x;
	d["y"] = p.y;
	d["until"] = p.until;
	d["salv"] = p.salv;
	d["by"] = p.by;
	if (p.claim) d["claim"] = Array::make(G(p.claim->owner), G(p.claim->name), p.claim->until);
	Array lots, items;
	for (const Lot &l : p.hold.lots) lots.push_back(lot_arr(l));
	for (const Item &i : p.hold.items) items.push_back(G(i.uid));
	d["lots"] = lots;
	d["items"] = items;
	return d;
}

Dictionary GoodsProbe::trade(const Dictionary &vec, const Array &safe_in) {
	std::vector<sim::Rect> safe;
	for (int64_t i = 0; i < safe_in.size(); i++) {
		const Dictionary r = safe_in[i];
		safe.push_back(sim::Rect{ r["x"], r["y"], r["w"], r["h"] });
	}
	sim::Piles piles(safe_in.is_empty() ? std::nullopt : std::optional<std::vector<sim::Rect>>(safe));
	const Array owners = vec["owners"], got = vec["got"], steps = vec["steps"];
	Array outs;
	for (int64_t k = 0; k < steps.size(); k++) {
		const Dictionary s = steps[k];
		const std::string op = S(s["op"]);
		Dictionary o;
		if (op == "drop") {
			std::vector<Lot> lots;
			std::vector<Item> items;
			const Array la = s["lots"], ia = s["items"];
			for (int64_t i = 0; i < la.size(); i++) lots.push_back(lot_of(la[i]));
			for (int64_t i = 0; i < ia.size(); i++) items.push_back(Item{ S(ia[i]), "xiphos", "common", 50 });
			std::optional<sim::PileClaim> claim;
			if (s.has("claim")) {
				const Array c = s["claim"];
				claim = sim::PileClaim{ S(c[0]), S(c[1]), c[2] };
			}
			const sim::Pile *p = piles.drop(s["x"], s["y"], lots, items, s["tick"], s["spoilt"], claim ? &*claim : nullptr);
			o["out"] = p ? Variant(p->id) : Variant();
		} else if (op == "open") {
			Array opens, g;
			for (const sim::Pile &p : piles.piles) {
				Array row;
				for (int64_t i = 0; i < owners.size(); i++) row.push_back(piles.open(p, S(owners[i]), s["tick"]));
				opens.push_back(row);
			}
			for (int64_t i = 0; i < got.size(); i++) {
				const sim::Pile *p = piles.get(int(got[i]));
				g.push_back(p ? Variant(p->id) : Variant());
			}
			o["opens"] = opens;
			o["got"] = g;
		} else if (op == "tick") {
			piles.tick(s["tick"]);
		} else {
			piles.load_root(int(s["nextId"]));
		}
		Array ps;
		for (const sim::Pile &p : piles.piles) ps.push_back(pile_dict(p));
		o["piles"] = ps;
		outs.push_back(o);
	}
	Dictionary out;
	out["steps"] = outs;
	Array rects;
	const Array rin = vec["rects"];
	const sim::Rect s0 = safe[0];
	std::vector<sim::Rect> gates;
	const Array ga = Dictionary(safe_in[0]).get("gates", Array());
	for (int64_t i = 0; i < ga.size(); i++) {
		const Dictionary r = ga[i];
		gates.push_back(sim::Rect{ r["x"], r["y"], r["w"], r["h"] });
	}
	for (int64_t i = 0; i < rin.size(); i++) {
		const double x = Array(rin[i])[0], y = Array(rin[i])[1];
		rects.push_back(Array::make(x, y, sim::in_rect(s0, x, y), sim::in_rects(&safe, x, y), sim::in_rects(nullptr, x, y), sim::in_rects(&gates, x, y)));
	}
	out["rects"] = rects;
	return out;
}

// ------------------------------------------------------------------ crafting

static sim::Crafter crafter_of(const Dictionary &d) {
	sim::Crafter c;
	c.id = int(d["id"]);
	c.prof = opt_s(d, "prof");
	c.level = int(d["level"]);
	const Array perks = d["perks"];
	for (int64_t i = 0; i < perks.size(); i++) c.perks.push_back(S(perks[i]));
	if (d.has("tool")) c.tool = item_of(d["tool"]);
	c.work = d["work"];
	c.bountiful = d["bountiful"];
	c.owner = S(d["owner"]);
	c.name = S(d["name"]);
	c.pid = opt_s(d, "pid");
	c.team = int(d["team"]);
	return c;
}

Dictionary GoodsProbe::crafting_rules(const Dictionary &rules) {
	Dictionary out;
	Array rolls;
	const Array rin = rules["rolls"];
	for (int64_t i = 0; i < rin.size(); i++) {
		const Array r = rin[i];
		const Dictionary o = r[3];
		sim::RollSeed seed;
		if (r[2].get_type() == Variant::STRING) seed.str = S(r[2]);
		else seed.num = r[2];
		sim::RollOpts ro{ o.get("masterwork", false), opt_s(o, "maker") };
		rolls.push_back(item_dict(sim::craft_roll(S(r[0]), int(r[1]), seed, ro)));
	}
	out["rolls"] = rolls;
	Array grades;
	const Array gin = rules["grades"];
	for (int64_t i = 0; i < gin.size(); i++) {
		const Dictionary o = Array(gin[i])[0];
		sim::GradeOpts g;
		g.level = int(o["level"]);
		if (o.has("toolTier")) g.toolTier = int(o["toolTier"]);
		g.toolRarity = opt_s(o, "toolRarity");
		if (o.has("wpLevel")) g.wpLevel = int(o["wpLevel"]);
		g.masterwork = o.get("masterwork", false);
		g.specialty = o.get("specialty", false);
		grades.push_back(sim::craft_grade(g));
	}
	out["grades"] = grades;
	Array recipes;
	const Array rcin = rules["recipes"];
	for (int64_t i = 0; i < rcin.size(); i++) {
		const sim::Recipe *r = sim::item_recipe(S(Array(rcin[i])[0]));
		recipes.push_back(r ? Variant(G(r->id)) : Variant());
	}
	out["recipes"] = recipes;
	Array repairs;
	const Array rpin = rules["repairs"];
	for (int64_t i = 0; i < rpin.size(); i++) {
		const Array r = rpin[i];
		const auto rc = sim::repair_cost(item_of(r[0]), sim::data().recipes.RECIPES.at(S(r[1])));
		if (!rc) {
			repairs.push_back(Variant());
			continue;
		}
		Dictionary d, in;
		for (const auto &[k, v] : rc->inputs.kv) in[G(k)] = v;
		d["inputs"] = in;
		d["secs"] = rc->secs;
		repairs.push_back(d);
	}
	out["repairs"] = repairs;
	Array refusals;
	const Array rfin = rules["refusals"];
	for (int64_t i = 0; i < rfin.size(); i++) {
		const Array r = rfin[i];
		std::vector<std::string> perks;
		const Array pa = r[1];
		for (int64_t k = 0; k < pa.size(); k++) perks.push_back(S(pa[k]));
		const std::string why = sim::crafter_refusal(S(r[0]), perks, sim::data().recipes.RECIPES.at(S(r[2])));
		refusals.push_back(why.empty() ? Variant() : Variant(G(why)));
	}
	out["refusals"] = refusals;
	Array fed;
	const Array fin = rules["fed"];
	for (int64_t i = 0; i < fin.size(); i++) {
		const Array r = fin[i];
		const sim::Fed f = sim::fed_of(S(r[0]), r[1]);
		Dictionary d;
		d["inn"] = f.inn;
		d["melee"] = f.melee;
		d["missile"] = f.missile;
		d["acc"] = f.acc;
		d["heal"] = f.heal;
		d["ticks"] = f.ticks;
		fed.push_back(d);
	}
	out["fed"] = fed;
	return out;
}

// The logging deps of src/dev/vectors/crafting.ts fakeDeps: per-team stocks, per-owner packs, at most 2 carts a player.
struct FakeDeps {
	Cost stock0, pack0;
	std::vector<std::pair<int, Cost>> stocks; // Map insertion order
	std::vector<std::pair<std::string, Cost>> packs;
	std::map<std::string, int> carts; // looked up only
	Array log;

	template <typename K>
	static Cost &at(std::vector<std::pair<K, Cost>> &m, const K &k, const Cost &init) {
		for (auto &e : m)
			if (e.first == k) return e.second;
		m.emplace_back(k, init);
		return m.back().second;
	}
	Cost &stock(int t) { return at(stocks, t, stock0); }
	Cost &pack(const std::string &o) { return at(packs, o, pack0); }
	static bool pay(Cost &s, const Cost &cost) {
		for (const auto &[k, v] : cost.kv)
			if (s.get(k) < v) return false;
		for (const auto &[k, v] : cost.kv) s.set(k, s.get(k) - v);
		return true;
	}
};

static Dictionary event_dict(const sim::CraftedEvent &e) {
	Dictionary d;
	d["t"] = e.t;
	d["kind"] = "crafted";
	d["order"] = e.order;
	d["building"] = e.building;
	d["team"] = e.team;
	d["owner"] = G(e.owner);
	if (e.pid) d["pid"] = G(*e.pid);
	d["recipe"] = G(e.recipe);
	d["what"] = G(e.what);
	d["item"] = item_dict(e.item);
	return d;
}

Array GoodsProbe::crafting_run(const Dictionary &run) {
	FakeDeps f;
	f.stock0 = cost_entries(run["stock0"]);
	f.pack0 = cost_entries(run["pack0"]);
	const bool full = run["full"];
	sim::CraftDeps deps;
	deps.seed = run["seed"];
	deps.takeAt = [&](int team, double x, double y, const Cost &cost) {
		const bool ok = FakeDeps::pay(f.stock(team), cost);
		f.log.push_back(Array::make("takeAt", team, x, y, entries(cost), ok));
		return ok;
	};
	deps.addAt = [&](int team, double x, double y, const std::string &res, double n) {
		Cost &s = f.stock(team);
		s.set(res, s.get(res) + n);
		f.log.push_back(Array::make("addAt", team, x, y, G(res), n));
	};
	deps.emit = [&](const sim::CraftedEvent &e) { f.log.push_back(Array::make("emit", event_dict(e))); };
	if (full) {
		deps.pay = [&](const sim::Placed &b, const sim::Crafter &c, const Cost &cost) {
			const bool ok = FakeDeps::pay(c.team == b.team ? f.stock(c.team) : f.pack(c.owner), cost);
			f.log.push_back(Array::make("pay", b.id, c.id, entries(cost), ok));
			return ok;
		};
		deps.till = [&](const sim::Placed &b, const std::string &res, double n) { f.log.push_back(Array::make("till", b.id, G(res), n)); };
		deps.out = [&](const sim::Placed &b, const sim::Payer &p, const std::string &res, double n) { f.log.push_back(Array::make("out", b.id, p.team, G(p.owner), G(res), n)); };
		deps.cart = [&](const sim::Placed &b, const std::string &owner, const std::string &type, bool check) {
			const int n = f.carts.count(owner) ? f.carts[owner] : 0;
			const bool ok = n < 2;
			if (ok && !check) f.carts[owner] = n + 1;
			f.log.push_back(Array::make("cart", b.id, b.team, G(owner), G(type), check, ok));
			return ok;
		};
	}
	sim::Crafting crafting(deps);
	std::vector<sim::Placed> placed;
	const Array pin = run["placed"];
	for (int64_t i = 0; i < pin.size(); i++) {
		const Dictionary p = pin[i];
		sim::Placed b;
		b.id = int(p["id"]);
		b.team = int(p["team"]);
		b.def = &sim::building(S(p["def"]));
		b.x = p["x"];
		b.y = p["y"];
		b.owner = opt_s(p, "owner");
		if (p.has("share")) b.share = double(p["share"]);
		if (p.has("fee")) b.fee = double(p["fee"]);
		placed.push_back(b);
	}
	const auto placed_of = [&](int id) -> const sim::Placed & {
		for (const auto &b : placed)
			if (b.id == id) return b;
		return placed[0];
	};
	std::map<int, sim::Crafter> crafters; // by id, looked up only
	const Array cin = run["crafters"];
	for (int64_t i = 0; i < cin.size(); i++) {
		const sim::Crafter c = crafter_of(cin[i]);
		crafters[c.id] = c;
	}
	Array outs;
	const Array steps = run["steps"];
	for (int64_t k = 0; k < steps.size(); k++) {
		const Dictionary s = steps[k];
		const std::string op = S(s["op"]);
		f.log.clear();
		Dictionary o;
		int bid = s.has("b") ? int(s["b"]) : 0;
		if (op == "order") {
			const Dictionary od = s["o"];
			sim::CraftOrder co;
			co.kind = S(od["kind"]);
			co.team = int(od["team"]);
			co.building = int(od["building"]);
			if (od.has("recipe")) co.recipe = S(od["recipe"]);
			if (od.has("order")) co.order = int(od["order"]);
			if (od.has("owner")) co.owner = S(od["owner"]);
			if (od.has("item")) co.item = item_of(od["item"]);
			o["out"] = crafting.order(co, placed_of(bid));
		} else if (op == "work") {
			std::vector<sim::Crafter> at;
			const Array ids = s["crafters"];
			for (int64_t i = 0; i < ids.size(); i++) at.push_back(crafters.at(int(ids[i])));
			Array busy;
			for (const auto &[id, xp] : crafting.work(placed_of(bid), at, s["sec"], s["tick"])) busy.push_back(Array::make(id, xp));
			o["out"] = busy;
		} else if (op == "use") {
			o["out"] = crafting.use(int(s["team"]), S(s["p"]), s["n"]);
		} else {
			o["out"] = crafting.drop(bid);
		}
		o["log"] = f.log.duplicate();
		Array has;
		for (const auto &b : placed) has.push_back(crafting.has(b.id));
		o["has"] = has;
		const auto snaps = crafting.snaps(bid);
		if (snaps) {
			Array sa;
			for (const sim::QueueSnap &q : *snaps) {
				Dictionary d;
				d["id"] = q.id;
				d["recipe"] = G(q.recipe);
				d["kind"] = G(q.kind);
				d["by"] = q.by;
				d["progress"] = q.progress;
				sa.push_back(d);
			}
			o["snaps"] = sa;
		} else o["snaps"] = Variant();
		Array sup, st, pk;
		for (const auto &[t, c] : crafting.supplies) sup.push_back(Array::make(t, entries(c)));
		for (const auto &[t, c] : f.stocks) st.push_back(Array::make(t, entries(c)));
		for (const auto &[ow, c] : f.packs) pk.push_back(Array::make(G(ow), entries(c)));
		o["supplies"] = sup;
		o["stocks"] = st;
		o["packs"] = pk;
		outs.push_back(o);
	}
	return outs;
}

void GoodsProbe::_bind_methods() {
	ClassDB::bind_static_method("GoodsProbe", D_METHOD("economy", "vec"), &GoodsProbe::economy);
	ClassDB::bind_static_method("GoodsProbe", D_METHOD("building", "type"), &GoodsProbe::building);
	ClassDB::bind_static_method("GoodsProbe", D_METHOD("holders", "vec"), &GoodsProbe::holders);
	ClassDB::bind_static_method("GoodsProbe", D_METHOD("trade", "vec", "safe"), &GoodsProbe::trade);
	ClassDB::bind_static_method("GoodsProbe", D_METHOD("crafting_rules", "rules"), &GoodsProbe::crafting_rules);
	ClassDB::bind_static_method("GoodsProbe", D_METHOD("crafting_run", "run"), &GoodsProbe::crafting_run);
}

} // namespace godot
