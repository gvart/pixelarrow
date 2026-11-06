// M6 trade of the live region war sim (src/war/sim/index.ts: holders, porters, carts, escorts, piles, safe zones):
// inSafe, holderAt, byHolder, mayTake, mayOpen, mayPut, owedHere, bringsTithe, drawOf, putOf, takeHolds, crewCart,
// tradeOrder, lockedTo, tradeTick, salvTick, escortTick, safeTick, walkSquadOut and safeEntry, line for line, as Sim
// members. The holders and piles themselves are holders.h and trade.h.
#include <algorithm>
#include <cmath>
#include <limits>

#include "js_math.h"
#include "sim.h"
#include "sim_data.h"

namespace sim {

namespace {

constexpr double INF = std::numeric_limits<double>::infinity();
constexpr double DT = 0.1; // as sim.cpp
constexpr int SCAN = 5;
constexpr int REPATH_TICKS = 20;

double sq(double v) { return v * v; }

const TradeTables &TR() { return data().trade; }

// titheSeal of an owner as the TS holds it ("" is no owner: undefined)
std::optional<double> sealOf(const std::string &owner) { return owner.empty() ? std::nullopt : tithe_seal(owner); }

} // namespace

bool Sim::inSafe(double x, double y) const {
	if (!anySafe) return false;
	const int t = grid->tile_at(x, y);
	return t >= 0 && safeMask[t] == 1;
}

std::optional<HolderAt> Sim::holderAt(const HolderRef &ref) {
	if (ref.building) {
		const Building *b = works->piece(*ref.building);
		Hold *hd = works->hold_of(*ref.building);
		if (!b || !hd) return std::nullopt;
		// a chest's loads: its own, plus its owner's town perk where it stands
		const double cap = b->def->chest ? b->def->chest + townLv->perk_at(b->team, b->x, b->y).store : b->def->store ? INF : 0;
		return HolderAt{ hd, b->x, b->y, b->def->store || b->def->cache ? "store" : "chest", b->team, b->owner, cap, b->id };
	}
	if (ref.cart) {
		SiegeEngine *e = siege->get(*ref.cart);
		if (!e || !e->hold || e->state == "destroyed") return std::nullopt;
		return HolderAt{ &*e->hold, e->x, e->y, "cart", e->team, e->owner, siege->cart_cap(e->id), e->id };
	}
	if (ref.pile) {
		Pile *p = piles->get(*ref.pile);
		if (!p) return std::nullopt;
		return HolderAt{ &p->hold, p->x, p->y, "pile", -1, "", 0, p->id };
	}
	return std::nullopt;
}

bool Sim::byHolder(const HolderAt &h, double x, double y, double r) const {
	return h.kind == "store" || h.kind == "chest" ? works->dist2(h.id, x, y) <= r * r : sq(h.x - x) + sq(h.y - y) <= r * r;
}

bool Sim::mayTake(Squad &s, const HolderAt &h) {
	if (h.kind == "pile") return piles->open(*piles->get(h.id), s.owner, tick); // E3: a fallen man's kit, his owner's for a while
	if (h.kind == "cart") return h.owner == s.owner;
	if (h.kind == "store" && works->piece(h.id)->def->cache) return !inSafe(h.x, h.y); // M7a: a town's cache: anyone's
	if (owedHere(s, h)) return true; // W-153: his tribute, set aside there
	if (mayOpen(s, h)) return true;
	if (inSafe(h.x, h.y) || h.team == s.team) return false;
	// W-91: a foe, with nobody of its side at it: only its door is left (tradeTick breaks it first)
	const double r = data().economy.CHEST.guard;
	for (Unit *u : units)
		if (u->alive && (h.kind == "chest" ? u->squad->owner == h.owner : u->squad->team == h.team) && sq(u->x - h.x) + sq(u->y - h.y) <= r * r) return false;
	return true;
}

bool Sim::mayOpen(Squad &s, const HolderAt &h) {
	const Building &b = *works->piece(h.id);
	return h.kind == "chest" && !b.def->house ? h.owner == s.owner : works->may_use(b, s.owner, s.team);
}

bool Sim::mayPut(Squad &s, const HolderAt &h) {
	return h.kind == "store" || h.kind == "chest" ? !works->piece(h.id)->def->cache && (mayOpen(s, h) || bringsTithe(s, h)) : h.kind != "pile" && h.owner == s.owner;
}

bool Sim::owedHere(Squad &s, const HolderAt &h) {
	const std::optional<double> seal = sealOf(s.owner);
	if (!seal || !(h.kind == "store" || h.kind == "chest") || h.owner == s.owner) return false;
	for (const Lot &l : h.hold->lots)
		if (l.s == seal && l.n > 1e-9) return true;
	return false;
}

bool Sim::bringsTithe(Squad &s, const HolderAt &h) {
	const std::optional<double> seal = sealOf(h.owner);
	const int c = crewCart(s);
	if (!seal) return false;
	const auto has = [&](const std::optional<Hold> &x) {
		if (!x) return false;
		for (const Lot &l : x->lots)
			if (l.s == seal && l.n > 1e-9) return true;
		return false;
	};
	if (c >= 0 && has(siege->get(c)->hold)) return true;
	for (Unit *u : s.units)
		if (u->alive && has(u->pack)) return true;
	return false;
}

std::optional<Draw> Sim::drawOf(Squad &s, const HolderAt &h, const Xfer &x) {
	if (h.kind == "pile" || ((h.kind == "store" || h.kind == "chest") && h.team != s.team && !mayOpen(s, h)))
		return Draw{ [](const Lot &) { return true; }, [](const Lot &l) { return is_tithe(l) ? std::nullopt : l.s; }, false };
	if (owedHere(s, h)) {
		const std::optional<double> seal = sealOf(s.owner);
		return Draw{ [seal](const Lot &l) { return l.s == seal; }, [](const Lot &) { return std::optional<double>(); }, true };
	}
	if (x.send) return Draw{ [](const Lot &l) { return is_tithe(l); }, [](const Lot &l) { return l.s; }, true };
	return std::nullopt;
}

std::optional<Draw> Sim::putOf(Squad &s, const HolderAt &h) {
	const std::optional<double> seal = h.kind == "store" || h.kind == "chest" ? sealOf(h.owner) : std::nullopt;
	if (!seal) return std::nullopt;
	const bool open = mayOpen(s, h);
	return Draw{ [seal, open](const Lot &l) { return l.s == seal || (open && !l.s); }, [](const Lot &) { return std::optional<double>(); }, false };
}

std::vector<Hold *> Sim::takeHolds(Squad &s, const HolderAt &h) {
	const Building *b = h.kind == "store" && h.team == s.team ? works->piece(h.id) : nullptr;
	if (b && (b->owner.empty() || b->access == "alliance" || b->access == "anyone")) return { h.hold, &works->reserve_of(h.team) };
	return { h.hold };
}

int Sim::crewCart(Squad &s) { return s.siege >= 0 && siege->is_cart(s.siege) && siege->get(s.siege)->crew == s.id ? s.siege : -1; }

void Sim::tradeOrder(Squad &s, const Order &o) {
	const auto stopWork = [&]() {
		dropJobs(s);
		s.task.reset();
		s.claimPt = -1;
		s.xfer.reset();
		s.escort = -1;
		s.salv.reset();
	};
	if (o.kind == "escort") {
		const int cart = o.cart ? *o.cart : -1;
		const SiegeEngine *e = siege->get(cart);
		if (s.civ || !e || !siege->is_cart(cart) || e->state == "destroyed" || e->team != s.team) return;
		stopWork();
		if (s.siege >= 0) uncrew(s);
		s.escort = cart;
		s.order = "escort";
		s.target = -1;
		s.fixed.reset();
		requestPath(s, e->x, e->y);
		return;
	}
	if (o.kind == "salvagePile") {
		Pile *p = piles->get(o.pile);
		if (!p || !piles->open(*p, s.owner, tick)) return;
		bool item = false, smith = false;
		for (const Item &it : p->hold.items)
			if (it.uid == o.uid) item = true;
		for (Unit *u : s.units)
			if (u->alive && u->civ == "smith") smith = true;
		if (!item || !smith) return;
		stopWork();
		if (s.siege >= 0) uncrew(s);
		s.salv = Salv{ o.pile, o.uid, 0 };
		s.order = "salvagePile";
		s.fixed.reset();
		requestPath(s, p->x, p->y);
		return;
	}
	const HolderRef &ref = o.kind == "load" ? o.from : o.to;
	const std::optional<HolderAt> h = holderAt(ref);
	if (!h || (o.kind == "load" ? !mayTake(s, *h) : !mayPut(s, *h))) return;
	stopWork();
	Xfer x;
	x.ref = ref;
	x.dir = o.kind;
	x.res = o.res;
	x.n = o.kind == "load" ? o.n.value_or(INF) : INF;
	x.send = o.kind == "load" && o.send;
	s.xfer = x;
	s.order = o.kind;
	const int c = crewCart(s);
	if (c >= 0) {
		siege->move(c, h->x, h->y); // the cart rolls up to it; the crew stays with the cart
		return;
	}
	if (s.siege >= 0) uncrew(s);
	std::vector<double> pts = h->kind == "store" || h->kind == "chest" ? works->ring_points(h->id, std::max(1, s.alive), s.cx, s.cy) : std::vector<double>{};
	if (!pts.empty()) s.fixed = pts;
	else s.fixed.reset();
	if (!pts.empty()) requestPath(s, pts[0], pts[1]);
	else requestPath(s, h->x, h->y);
}

bool Sim::lockedTo(Squad &s, const HolderAt &h, std::optional<int> id) {
	const Building *b = id ? works->piece(*id) : nullptr;
	if (!b || b->lock <= 0 || mayOpen(s, h) || owedHere(s, h) || b->def->cache) return false;
	int men = 0;
	for (Unit *u : s.units)
		if (u->alive && byHolder(h, u->x, u->y, std::max(TR().PILE.reach + 0.5, TR().CART.reach))) men++;
	if (!men) return true;
	const auto r = works->break_lock(b->id, men, TR().PORTER.every * DT);
	// the 'lockAttacked' and 'lockBroken' notes: no event log yet
	if (r.first > 0) return true;
	return false;
}

void Sim::tradeTick() {
	const double kit = data().food.HUNGER.kit;
	const TradeTables &T = TR();
	for (Squad *sp : squads) {
		Squad &s = *sp;
		if (s.alive == 0) continue;
		bool laden = false; // W-79: his own few rations weigh nothing
		for (Unit *u : s.units)
			if (u->alive && u->pack && loads(*u->pack) - std::min(amount(*u->pack, "ration"), kit) / per_load(std::string("ration")) > 1e-9) {
				laden = true;
				break;
			}
		s.laden = laden;
		if (s.salv) salvTick(s);
		if (!s.xfer || (tick + s.id) % int(T.PORTER.every)) continue;
		Xfer &x = *s.xfer;
		const std::optional<HolderAt> hh = holderAt(x.ref);
		const bool load = x.dir == "load";
		const auto end = [&]() {
			s.xfer.reset();
			s.order = "hold";
		};
		if (!hh || (load ? !mayTake(s, *hh) : !mayPut(s, *hh))) {
			end();
			continue;
		}
		const HolderAt &h = *hh;
		const bool pile = h.kind == "pile";
		const int c = crewCart(s);
		const std::optional<Draw> draw = load ? drawOf(s, h, x) : std::nullopt;
		if (load && lockedTo(s, h, x.ref.building)) continue; // W-91: at the door first
		if (c >= 0) {
			SiegeEngine &e = *siege->get(c);
			if (!byHolder(h, e.x, e.y, T.CART.reach)) {
				if (e.mode == "none") siege->move(c, h.x, h.y);
				continue;
			}
			int n = 0;
			for (Unit *u : s.units)
				if (u->alive && sq(u->x - e.x) + sq(u->y - e.y) <= 9) n++;
			const double room = load ? siege->cart_cap(c) - loads(*e.hold) : h.cap - loads(*h.hold);
			const double amt = std::min(std::min(std::max(1, n) * T.PORTER.loads, room), x.n / per_load(x.res));
			double moved = 0;
			if (load && draw) moved = move(*h.hold, *e.hold, amt, x.res, pile ? 1 : INF, false, &*draw);
			else if (load)
				for (Hold *src : takeHolds(s, h)) moved += move(*src, *e.hold, amt - moved, x.res, INF);
			else {
				const std::optional<Draw> put = putOf(s, h);
				moved = move(*e.hold, *h.hold, amt, x.res, INF, true, put ? &*put : nullptr);
			}
			x.n -= moved * per_load(x.res);
			if (moved <= 1e-9) end();
			continue;
		}
		bool pending = false;
		double moved = 0;
		std::vector<Unit *> out, spare;
		// W-55: he still has something to move here (goods to put down, room to take more)
		const auto busy = [&](Unit &u) { return load ? !u.pack || loads(*u.pack) < T.PORTER.loads - 1e-9 : u.pack && loads(*u.pack) > 1e-9; };
		for (Unit *up : s.units) {
			Unit &u = *up;
			if (!u.alive) continue;
			if (!byHolder(h, u.x, u.y, T.PILE.reach + 0.5)) {
				pending = true;
				if (busy(u)) out.push_back(&u);
				continue;
			}
			if (!busy(u)) spare.push_back(&u);
			if (!u.pack) u.pack = new_hold();
			Hold &pack = *u.pack;
			if (load) {
				const double amt = std::min(T.PORTER.loads - loads(pack), x.n / per_load(x.res));
				double m = 0;
				const size_t was = pack.items.size();
				if (draw) m = move(*h.hold, pack, amt, x.res, pile ? 1 : INF, false, &*draw);
				else
					for (Hold *src : takeHolds(s, h)) m += move(*src, pack, amt - m, x.res, INF);
				if (pile && pack.items.size() > was) {
					std::vector<Item> &got = loot[s.team];
					for (size_t k = was; k < pack.items.size(); k++) got.push_back(pack.items[k]);
					// the 'pickup' note: no event log yet
				}
				x.n -= m * per_load(x.res);
				moved += m;
			} else {
				const std::optional<Draw> put = putOf(s, h);
				moved += move(pack, *h.hold, std::min(loads(pack), h.cap - loads(*h.hold)), x.res, INF, true, put ? &*put : nullptr);
			}
		}
		if (!pending && moved <= 1e-9) end();
		// W-55: a man with goods kept off the holder by the crowd at its ring swaps standing points with one beside it who
		// has nothing left to move
		if (s.fixed)
			for (size_t k = 0; k < std::min(out.size(), spare.size()); k++) {
				Unit &a = *out[k], &b = *spare[k];
				std::swap(a.slot, b.slot);
				a.settled = b.settled = false;
				a.best = b.best = INF;
				a.stall = b.stall = 0;
			}
	}
}

void Sim::salvTick(Squad &s) {
	Salv &v = *s.salv;
	Pile *p = piles->get(v.pile);
	int i = -1;
	if (p)
		for (size_t k = 0; k < p->hold.items.size(); k++)
			if (p->hold.items[k].uid == v.uid) {
				i = int(k);
				break;
			}
	if (!p || i < 0) {
		s.salv.reset();
		s.order = "hold";
		return;
	}
	const double r = TR().PILE.reach + 0.5;
	bool at = false;
	for (Unit *u : s.units)
		if (u->alive && u->civ == "smith" && sq(u->x - p->x) + sq(u->y - p->y) <= r * r) at = true;
	if (!at) return;
	p->salv = ++v.t;
	if (v.t < TR().PILE.salvage) return;
	const Item it = p->hold.items[i];
	p->hold.items.erase(p->hold.items.begin() + i);
	const Recipe *rc = item_recipe(it.def);
	// at least one of its main material (a small item would round to nothing)
	if (rc) {
		int j = 0;
		for (const auto &[k, n] : rc->inputs.kv) {
			const double got = std::max(j == 0 ? 1.0 : 0.0, js::round(n * data().craft.salvage));
			if (got > 0) p->hold.lots.push_back(Lot{ k, got, region.id, std::nullopt });
			j++;
		}
	}
	p->salv = 0;
	p->until = std::max(p->until, double(tick + 1));
	s.salv.reset();
	s.order = "hold";
}

void Sim::escortTick(Squad &s) {
	const SiegeEngine *e = siege->get(s.escort);
	if (!e || e->state == "destroyed" || e->team != s.team) {
		s.escort = -1;
		s.order = "hold";
		return;
	}
	const auto &ESCORT = TR().ESCORT;
	const double far = sq(s.cx - e->x) + sq(s.cy - e->y);
	if (s.target >= 0) {
		Squad &t = *squads[s.target];
		if (t.alive == 0 || far > ESCORT.leash * ESCORT.leash || sq(t.cx - e->x) + sq(t.cy - e->y) > ESCORT.leash * ESCORT.leash) s.target = -1;
		else return chase(s, t);
	}
	Squad *best = nullptr;
	double bd = ESCORT.engage * ESCORT.engage;
	for (Squad *o : s.near) {
		const double d = sq(o->cx - e->x) + sq(o->cy - e->y);
		if (o->team != s.team && o->alive > 0 && !inSafe(o->cx, o->cy) && d <= bd) bd = d, best = o;
	}
	if (best) {
		s.target = best->id;
		s.repathAt = tick;
		return chase(s, *best);
	}
	// keep a column round the cart: walk up to it when it pulls away
	if (sq(s.ax - e->x) + sq(s.ay - e->y) > ESCORT.ring * ESCORT.ring && !s.goal && tick >= s.repathAt) {
		requestPath(s, e->x - js::cos(e->facing) * 2, e->y - js::sin(e->facing) * 2);
		s.repathAt = tick + REPATH_TICKS;
	}
}

void Sim::safeTick() {
	for (Squad *sp : squads) {
		Squad &s = *sp;
		if (s.alive == 0) continue;
		bool out = false;
		for (Unit *u : s.units) {
			if (!u->alive) continue;
			if (inSafe(u->x, u->y)) {
				u->safeT += SCAN;
				if (u->civ.empty() && u->safeT > TR().SAFE.fighter) out = true;
			} else u->safeT = 0;
		}
		if (out) walkSquadOut(s);
	}
}

void Sim::walkSquadOut(Squad &s) {
	std::optional<std::pair<double, double>> best;
	double bd = INF;
	for (const WorksRect &r : region.yard) {
		const double x = r.x + r.w / 2.0, y = r.y + r.h / 2.0, d = sq(x - s.cx) + sq(y - s.cy);
		if (d < bd) bd = d, best = std::make_pair(x, y);
	}
	if (!best) {
		const WorksRect *z = nullptr;
		for (const WorksRect &r : region.safe)
			if (in_rect(Rect{ double(r.x), double(r.y), double(r.w), double(r.h) }, s.cx, s.cy)) {
				z = &r;
				break;
			}
		if (!z) return;
		best = std::make_pair(z->x + z->w / 2.0, std::min(double(grid->h - 1), double(z->y + z->h + 3)));
	}
	if (s.siege >= 0) uncrew(s);
	Order o;
	o.kind = "move";
	o.squad = s.id;
	o.has_squad = true;
	o.x = best->first;
	o.y = best->second;
	apply(o);
	for (Unit *u : s.units) u->safeT = 0;
}

bool Sim::safeEntry(Unit &u) {
	if (u.tag > tick) return false;
	int n = 0;
	for (Unit *o : units)
		if (o->alive && o->squad->owner == u.squad->owner && inSafe(o->x, o->y)) n++;
	return n < TR().SAFE.units;
}

} // namespace sim
