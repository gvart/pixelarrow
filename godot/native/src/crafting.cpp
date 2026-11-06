#include "crafting.h"

#include <algorithm>
#include <cmath>

#include "js_math.h"
#include "professions.h"
#include "sim_data.h"

namespace sim {

void load_crafting(const godot::Dictionary &t, CraftTables &o) {
	const godot::Dictionary c = t["CRAFT"];
	o.queue = c["queue"];
	o.batch = c["batch"];
	o.steward = c["steward"];
	o.alloy = c["alloy"];
	o.step = c["step"];
	o.share = c["share"];
	o.mw = c["mw"];
	o.worn = c["worn"];
	o.loss = c["loss"];
	o.floor = c["floor"];
	o.salvage = c["salvage"];
	o.goldsmith = c["goldsmith"];
}

const Recipe *item_recipe(const std::string &def) {
	const RecipeTables &T = data().recipes;
	// CIV_TOOLS[def] ? toolRecipe(def) : recipeFor(itemDef(def)): both are the RECIPES rows `tool:<id>` and `item:<id>`
	const auto it = T.RECIPES.find((T.CIV_TOOLS.count(def) ? "tool:" : "item:") + def);
	return it == T.RECIPES.end() ? nullptr : &it->second;
}

std::string crafter_refusal(const std::optional<std::string> &prof, const std::vector<std::string> &perks, const Recipe &r) {
	if (!prof || *prof != r.prof) return "class";
	const auto held = held_nodes(r.prof, perks);
	bool ok = held.count(r.node) > 0;
	for (const std::string &n : r.needs) ok = ok && held.count(n) > 0;
	return ok ? "" : "node";
}

std::optional<RepairCost> repair_cost(const Item &item, const Recipe &r) {
	const CraftTables &C = data().craft;
	const RecipeTables &T = data().recipes;
	const double mc = item.mc.value_or(100);
	if (mc <= C.floor || item.cond >= mc) return std::nullopt;
	const double steps = std::ceil((mc - item.cond) / C.step);
	std::string main = T.CIV_TOOLS.count(item.def) ? (r.inputs.empty() ? "" : r.inputs.kv[0].first) : T.CRAFTABLE.at(item.def).main;
	if (main.empty() && !r.inputs.empty()) main = r.inputs.kv[0].first;
	const double *have = r.inputs.find(main);
	const double n = std::max(1.0, js::round((have ? *have : 1) * C.share * steps));
	RepairCost out;
	out.inputs.set(main, n);
	out.secs = r.secs * C.share * steps * (item.q == 2 ? C.mw : 1);
	return out;
}

Fed fed_of(const std::string &dish, bool headCook) {
	const RecipeTables &T = data().recipes;
	const Dish &f = T.DISHES.at(dish);
	return Fed{
		std::max(f.inn, 1 / (1 + T.FED_CAP)), std::min(f.melee, T.FED_CAP), std::min(f.missile, T.FED_CAP), std::min(f.acc, T.FED_CAP),
		f.heal, js::round(f.mins * 600 * (headCook ? 1.5 : 1)),
	};
}

std::vector<Crafting::QOrder> *Crafting::queue(int id) {
	for (auto &e : queues)
		if (e.first == id) return &e.second;
	return nullptr;
}

const std::vector<Crafting::QOrder> *Crafting::queue(int id) const {
	for (const auto &e : queues)
		if (e.first == id) return &e.second;
	return nullptr;
}

Cost &Crafting::supply(int team) {
	for (auto &e : supplies)
		if (e.first == team) return e.second;
	supplies.emplace_back(team, Cost{});
	return supplies.back().second;
}

// Goods back to who paid, or out of the shop: his network there, or beside the building for a stranger.
void Crafting::give(const Placed &b, const std::optional<Payer> &payer, const std::string &res, double n) {
	if (payer && payer->team != b.team && deps_.out) deps_.out(b, *payer, res, n);
	else deps_.addAt(b.team, b.x, b.y, res, n);
}

struct Terms {
	double share, fee;
};
// The owner's terms on crafter c at b: nothing for the owner himself or a piece nobody owns.
static Terms terms_of(const Placed &b, const Crafter &c) {
	return b.owner && !b.owner->empty() && *b.owner != c.owner ? Terms{ b.share.value_or(0), b.fee.value_or(0) } : Terms{ 0, 0 };
}

// Pay for order x as c starts it: the inputs, the fee and (what cannot be split) the owner's share of the inputs.
bool Crafting::start(const Placed &b, QOrder &x, const Crafter &c) {
	const Goods inputs = inputs_of(x, c);
	const Terms t = terms_of(b, c);
	const bool split = x.kind == "craft" && !x.recipe->out.good.empty();
	Goods cut;
	if (t.share > 0 && !split)
		for (const auto &[k, v] : inputs.kv) cut.set(k, v * t.share);
	if (t.fee > 0) cut.set("coin", cut.get("coin") + t.fee);
	Goods cost = inputs;
	for (const auto &[k, v] : cut.kv) cost.set(k, cost.get(k) + v);
	const bool paid = c.team == b.team && cut.empty() ? deps_.takeAt(b.team, b.x, b.y, cost) : (deps_.pay && deps_.pay(b, c, cost));
	if (!paid) return false;
	if (deps_.till)
		for (const auto &[k, v] : cut.kv) deps_.till(b, k, v);
	x.taken = inputs;
	x.payer = Payer{ c.team, c.owner };
	return true;
}

bool Crafting::order(const CraftOrder &o, const Placed &b) {
	const CraftTables &C = data().craft;
	const RecipeTables &T = data().recipes;
	if (!b.def->workplace) return false;
	const auto &wp = *b.def->workplace;
	std::vector<QOrder> fresh, *qp = queue(b.id);
	std::vector<QOrder> &q = qp ? *qp : fresh;
	if (o.kind == "cancelCraft") {
		const auto i = std::find_if(q.begin(), q.end(), [&](const QOrder &x) { return x.id == o.order; });
		if (i == q.end()) return false;
		const QOrder x = *i;
		q.erase(i);
		if (x.taken)
			for (const auto &[k, v] : x.taken->kv) give(b, x.payer, k, v);
		return true;
	}
	if (double(q.size()) >= C.queue) return false;
	const Recipe *r = nullptr;
	double left;
	if (o.kind == "craft") {
		const auto it = T.RECIPES.find(o.recipe);
		r = it == T.RECIPES.end() ? nullptr : &it->second;
		if (!r || r->kind == "engine" || r->kind == "fort") return false; // engines and forts: built on site (M5h3)
		left = r->secs;
	} else {
		r = T.CRAFTABLE.count(o.item.def) ? item_recipe(o.item.def) : nullptr;
		if (!r) return false;
		std::optional<RepairCost> rc = o.kind == "repair" ? repair_cost(o.item, *r) : std::optional<RepairCost>(RepairCost{ {}, r->secs * C.share });
		if (!rc) return false;
		left = rc->secs;
	}
	if (r->at != wp.kind || (o.kind == "craft" && r->lv > wp.level)) return false; // any level of the chain mends and salvages
	QOrder x{ nextId++, o.kind == "craft" ? "craft" : o.kind, r, std::nullopt, std::nullopt, -1, left, left, std::nullopt, std::nullopt };
	if (o.kind != "craft") {
		x.item = o.item;
		x.owner = o.owner;
	}
	q.push_back(x);
	if (!qp) queues.emplace_back(b.id, std::move(fresh));
	return true;
}

Goods Crafting::inputs_of(const QOrder &x, const Crafter &c) const {
	if (x.kind == "salvage") return {};
	if (x.kind == "repair") return repair_cost(*x.item, *x.recipe)->inputs;
	const bool st = x.recipe->kind == "good" && held_nodes(x.recipe->prof, c.perks).count("steward");
	if (!st) return x.recipe->inputs;
	Goods out;
	for (const auto &[k, v] : x.recipe->inputs.kv) out.set(k, std::ceil(v * data().craft.steward));
	return out;
}

// An order is done: its output. Returns the XP of the job.
double Crafting::finish(const Placed &b, const QOrder &x, const Crafter &c, double tick) {
	const CraftTables &C = data().craft;
	const RecipeTables &T = data().recipes;
	const Recipe &r = *x.recipe;
	const int team = c.team;
	const auto held = held_nodes(r.prof, c.perks);
	const std::optional<Payer> payer = Payer{ c.team, c.owner };
	const auto ev = [&](const char *what, const Item &item, const std::string &owner) {
		deps_.emit(CraftedEvent{ tick, x.id, b.id, team, owner, c.pid, r.id, what, item });
	};
	if (x.kind == "repair") {
		const Item &it = *x.item;
		const double mc = it.mc.value_or(100) - (it.cond < C.worn ? C.loss : 0);
		Item out = it;
		out.cond = mc;
		if (mc < 100 || it.mc) out.mc = mc;
		ev("repair", out, *x.owner);
		return 1;
	}
	if (x.kind == "salvage") {
		const double share = held.count("goldsmith") ? C.goldsmith : C.salvage;
		for (const auto &[k, v] : r.inputs.kv)
			if (std::floor(v * share) > 0) give(b, payer, k, std::floor(v * share));
		ev("salvage", *x.item, *x.owner);
		return 1;
	}
	if (!r.out.item.empty() || !r.out.tool.empty()) {
		const std::optional<Item> &tool = c.tool;
		int ttier = 1;
		if (tool) {
			const auto t = T.CIV_TOOLS.find(tool->def);
			ttier = t == T.CIV_TOOLS.end() ? 1 : t->second;
		}
		GradeOpts go;
		go.level = c.level;
		go.toolTier = ttier;
		if (tool) go.toolRarity = tool->rarity;
		go.wpLevel = b.def->workplace->level;
		go.masterwork = held.count("masterwork") > 0;
		const int g = craft_grade(go);
		RollSeed seed;
		seed.str = js_int_str(deps_.seed) + "|" + std::to_string(b.id) + "|" + std::to_string(x.id);
		ev("craft", craft_roll(!r.out.item.empty() ? r.out.item : r.out.tool, g, seed, RollOpts{ held.count("masterwork") > 0, c.name }), c.owner);
		return r.xp;
	}
	if (r.kind == "cart") {
		if (deps_.cart) {
			Placed bt = b;
			bt.team = team;
			deps_.cart(bt, c.owner, r.out.engine, false);
		}
		return r.xp;
	}
	const auto bn = T.BATCH_NODES.find(r.kind);
	const bool batch = bn != T.BATCH_NODES.end() && held.count(bn->second);
	// M6a: coin is exact (1 silver : 20 coin), no batch bonus
	const double n = r.kind == "coin" ? r.out.n : r.out.n * (batch ? C.batch : 1) * (r.kind == "smelt" && held.count("alloy") ? C.alloy : 1) * (1 + c.bountiful);
	if (!r.out.good.empty()) {
		// W-89: the owner's share of the goods stays in his building
		const double cut = n * terms_of(b, c).share;
		if (cut > 0 && deps_.till) deps_.till(b, r.out.good, cut);
		give(b, payer, r.out.good, n - cut);
	} else if (!r.out.product.empty()) {
		Cost &s = supply(team);
		s.set(r.out.product, s.get(r.out.product) + n);
	}
	return r.xp;
}

std::vector<std::pair<int, double>> Crafting::work(const Placed &b, const std::vector<Crafter> &crafters, double sec, double tick) {
	std::vector<std::pair<int, double>> busy;
	const auto set = [&](int id, double v) {
		for (auto &e : busy)
			if (e.first == id) {
				e.second = v;
				return;
			}
		busy.emplace_back(id, v);
	};
	std::vector<QOrder> *qp = queue(b.id);
	if (!qp || qp->empty()) return busy;
	std::vector<QOrder> &q = *qp;
	const auto may = [&](const Crafter &c, const QOrder &o) { return o.kind == "craft" ? crafter_refusal(c.prof, c.perks, *o.recipe).empty() : c.prof && *c.prof == o.recipe->prof; };
	const auto rank = [&](const Crafter &c) {
		for (const QOrder &o : q)
			if (o.by == c.id) return 0;
		for (const QOrder &o : q)
			if (o.by < 0 && may(c, o)) return 1;
		return 2;
	};
	// [...crafters].sort((x, y) => rank(x) - rank(y)).slice(0, level): a stable sort; ranks do not change while sorting
	std::vector<std::pair<int, const Crafter *>> ranked;
	for (const Crafter &c : crafters) ranked.emplace_back(rank(c), &c);
	std::stable_sort(ranked.begin(), ranked.end(), [](const auto &x, const auto &y) { return x.first < y.first; });
	if (int(ranked.size()) > b.def->workplace->level) ranked.resize(b.def->workplace->level);
	const auto here = [&](int id) {
		for (const auto &e : ranked)
			if (e.second->id == id) return true;
		return false;
	};
	for (QOrder &x : q)
		if (x.by >= 0 && !here(x.by)) x.by = -1; // he left: the order waits for another
	for (const auto &e : ranked) {
		const Crafter &c = *e.second;
		QOrder *x = nullptr;
		for (QOrder &o : q)
			if (o.by == c.id) {
				x = &o;
				break;
			}
		if (!x) {
			for (QOrder &o : q) {
				if (!(o.by < 0 && may(c, o))) continue;
				if (o.recipe->kind == "cart") {
					Placed bt = b;
					bt.team = c.team;
					if (!(deps_.cart && deps_.cart(bt, c.owner, o.recipe->out.engine, true))) continue;
				}
				if (o.taken || start(b, o, c)) {
					x = &o;
					break;
				}
			}
			if (!x) continue;
			x->by = c.id;
		}
		set(c.id, 0);
		x->left -= sec * c.work;
		if (x->left > 1e-9) continue;
		const QOrder done = *x;
		q.erase(q.begin() + (x - q.data()));
		set(c.id, finish(b, done, c, tick));
	}
	return busy;
}

bool Crafting::drop(int id) {
	for (size_t i = 0; i < queues.size(); i++)
		if (queues[i].first == id) {
			queues.erase(queues.begin() + i);
			return true;
		}
	return false;
}

bool Crafting::has(int id) const {
	const auto *q = queue(id);
	return q && !q->empty();
}

std::optional<std::vector<QueueSnap>> Crafting::snaps(int id) const {
	const auto *q = queue(id);
	if (!q || q->empty()) return std::nullopt;
	std::vector<QueueSnap> out;
	for (const QOrder &x : *q) out.push_back(QueueSnap{ x.id, x.kind == "craft" ? x.recipe->id : x.item->def, x.kind, x.by, x.total > 0 ? std::min(1.0, 1 - x.left / x.total) : 1 });
	return out;
}

bool Crafting::use(int team, const std::string &p, double n) {
	Cost &s = supply(team);
	if (s.get(p) < n) return false;
	s.set(p, s.get(p) - n);
	return true;
}

} // namespace sim
