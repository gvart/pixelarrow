#include "alliance_ai.h"

#include <algorithm>
#include <cmath>
#include <limits>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/string.hpp>

#include "economy.h"
#include "js_math.h"
#include "sim.h"
#include "sim_data.h"
#include "tunnel.h"

namespace sim {

static std::string a8(const godot::Variant &v) { return godot::String(v).utf8().get_data(); }
static godot::String ps(const std::string &s) { return godot::String::utf8(s.c_str()); }
static const AllyAiTables &A() { return data().ally; }
static double d2(double x0, double y0, double x1, double y1) { return js::pow(x0 - x1, 2) + js::pow(y0 - y1, 2); }
static constexpr double INF = std::numeric_limits<double>::infinity();

void load_ally_tables(const godot::Dictionary &tables, AllyAiTables &out) {
	if (tables.has("src/war/sim/allianceAi")) {
		const godot::Dictionary a = godot::Dictionary(tables["src/war/sim/allianceAi"])["ALLY_AI"];
		out.think = a["think"], out.players = a["players"], out.tickMs = a["tickMs"], out.muster = a["muster"];
		out.holdR = a["holdR"], out.siegeR = a["siegeR"], out.spot = a["spot"];
		out.classes.clear();
		const godot::Array cs = a["classes"];
		for (int64_t i = 0; i < cs.size(); i++) out.classes.push_back(a8(cs[i]));
		out.stock = Cost{};
		const godot::Dictionary st = a["stock"];
		const godot::Array ks = st.keys();
		for (int64_t i = 0; i < ks.size(); i++) out.stock.set(a8(ks[i]), st[ks[i]]);
		out.camp = a8(a["camp"]), out.store = a8(a["store"]);
	}
	if (tables.has("src/war/sim/aiSeason")) out.report = godot::Dictionary(godot::Dictionary(tables["src/war/sim/aiSeason"])["AI_SEASON"])["report"];
}

AiSnap ai_snap(Sim &s) {
	AiSnap o;
	o.tick = s.tick;
	o.units.reserve(s.units.size());
	for (const Unit *u : s.units) {
		o.byId[u->id] = o.units.size();
		o.units.push_back({ u->id, u->squad->id, u->x, u->y, !u->alive, u->cls });
	}
	for (const Squad *q : s.squads) {
		AiSnap::Squad x{ q->id, q->team, q->owner, q->order, {} };
		for (const Unit *u : q->units) x.units.push_back(u->id);
		o.squads.push_back(std::move(x));
	}
	// ...(region.lairs?.length || region.claimPoints?.length || mobs.added() ? { lairs, claims } : {})
	if (!s.mobRegion.lairs.empty() || !s.mobRegion.claimPoints.empty() || s.mobs->added()) {
		o.lairs = s.mobs->lair_snaps();
		o.claims = s.mobs->claim_snaps();
	}
	for (const BuildingSnap &b : s.works->building_snaps()) o.buildings.push_back({ b.id, b.team, b.type, b.state, b.x, b.y, b.ruin });
	o.stock = s.works->stock_snap();
	return o;
}

std::pair<double, double> entry_of(const std::vector<AiEntry> &entries, double w, double h, int team) {
	std::vector<const AiEntry *> sides;
	for (const AiEntry &e : entries)
		if (std::none_of(sides.begin(), sides.end(), [&](const AiEntry *x) { return x->side == e.side; })) sides.push_back(&e);
	if (sides.empty()) return { w / 2, h / 2 };
	const AiEntry &e = *sides[size_t(team) % sides.size()];
	return { e.x + e.w / 2, e.y + e.h / 2 };
}

AllianceAi::AllianceAi(Sim &s, Bots &b, const std::vector<AiEntry> &entries, int t) : team(t), sim(s), bots(b) {
	std::tie(ex, ey) = entry_of(entries, s.grid->w, s.grid->h, t);
	for (int k = 0; k < int(A().players); k++) owners.push_back("ai:" + std::to_string(t) + ":" + std::to_string(k));
	nextAt.assign(owners.size(), std::nullopt);
}

int AllianceAi::spawn(int k, double n) {
	const int id = sim.spawn_squad(owners[k], team, A().classes[size_t(k) % A().classes.size()], int(n), ex, ey);
	if (id >= 0) st.squads++;
	return id;
}

void AllianceAi::order(const godot::Dictionary &o) {
	st.orders++;
	sim.order(godot::order_from(o));
}

Behaviour *AllianceAi::setOf(int id) {
	for (auto &e : set)
		if (e.first == id) return &e.second;
	return nullptr;
}

// same(set.get(id), b): kind, x, y and radius (-1 when it has none)
void AllianceAi::behave(int id, const Behaviour &b) {
	Behaviour *a = setOf(id);
	if (a && a->kind == b.kind && a->x == b.x && a->y == b.y && (a->has_radius ? a->radius : -1) == (b.has_radius ? b.radius : -1)) return;
	if (a) *a = b; // Map.set on a key it has keeps its place
	else set.push_back({ id, b });
	st.bots++;
	bots.set(id, b);
}

void AllianceAi::unbot(int id) {
	const auto it = std::find_if(set.begin(), set.end(), [&](const auto &e) { return e.first == id; });
	if (it == set.end()) return;
	set.erase(it);
	bots.clear(id);
}

double AllianceAi::aliveOf(int id) const {
	const auto it = alive.find(id);
	return it != alive.end() ? it->second : 0;
}

std::optional<std::pair<double, double>> AllianceAi::centre(int id) const {
	double x = 0, y = 0, n = 0;
	if (id >= 0 && size_t(id) < snap->squads.size())
		for (int u : snap->squads[id].units) {
			const auto it = snap->byId.find(u);
			if (it == snap->byId.end()) continue;
			const AiSnap::Unit &m = snap->units[it->second];
			if (m.dead) continue;
			x += m.x;
			y += m.y;
			n++;
		}
	if (!n) return std::nullopt;
	return std::make_pair(x / n, y / n);
}

std::vector<int> AllianceAi::squadsOf(int k) const {
	std::vector<int> out;
	for (const AiSnap::Squad &q : snap->squads)
		if (q.owner == owners[k] && aliveOf(q.id) > 0) out.push_back(q.id);
	return out;
}

double AllianceAi::menOf(int k) const {
	double n = 0;
	for (int id : squadsOf(k)) n += aliveOf(id);
	return n;
}

void AllianceAi::raise(double now) {
	if (!started) {
		started = true;
		for (const auto &[r, n] : A().stock.kv) sim.addStock(team, r, n);
		for (int k = 0; k < int(A().players); k++) spawn(k, TUNNEL.floor);
		return;
	}
	for (int k = 0; k < int(A().players); k++) {
		TunnelState ts;
		ts.alive = menOf(k);
		ts.nextAt = nextAt[k];
		const TunnelSettle s = settle_tunnel(ts, now);
		nextAt[k] = s.nextAt;
		if (s.raise > 0 && spawn(k, s.raise) >= 0) st.raised += s.raise;
	}
}

bool AllianceAi::walled(double x, double y) const {
	const auto &B = data().economy.BUILDINGS;
	for (const AiSnap::Bld &b : snap->buildings) {
		if (b.team == team || b.team < 0 || b.team >= data().warlords.ALLIANCES) continue;
		const auto it = B.find(b.type);
		if (it == B.end() || it->second.wall.empty() || (b.state != "done" && b.state != "damaged") || b.ruin) continue;
		if (d2(b.x, b.y, x, y) <= js::pow(A().siegeR, 2)) return true;
	}
	return false;
}

std::pair<int, int> AllianceAi::pickTarget() const {
	const auto &cs = snap->claims;
	for (const ClaimSnap &c : cs)
		if (mine(c) && !c.taking.empty()) return { c.id, -1 };
	// the nearest free point first, then the nearest a foe holds, then the nearest locked one
	int best = -1, br = 3;
	double bd = INF;
	for (const ClaimSnap &c : cs) {
		if (mine(c)) continue;
		const int r = c.state == "locked" ? 2 : c.state == "claimed" ? 1 : 0;
		const double d = d2(c.x, c.y, ex, ey);
		if (r < br || (r == br && d < bd)) br = r, bd = d, best = c.id;
	}
	if (best < 0) {
		for (const ClaimSnap &c : cs)
			if (mine(c)) return { c.id, -1 };
		return { -1, -1 };
	}
	const ClaimSnap &c = cs[best];
	if (c.state != "locked") return { best, -1 };
	int lair = -1;
	double ld = INF;
	for (const LairSnap &l : snap->lairs) {
		if (std::find(c.lairs.begin(), c.lairs.end(), l.id) == c.lairs.end() || l.state == "cleared" || l.alive <= 0) continue;
		const double d = d2(l.x, l.y, ex, ey);
		if (d < ld) ld = d, lair = l.id;
	}
	return { best, lair };
}

static Behaviour beh(const std::string &kind, double x, double y, std::optional<double> radius = std::nullopt) {
	Behaviour b;
	b.kind = kind, b.x = x, b.y = y;
	if (radius) b.has_radius = true, b.radius = *radius;
	return b;
}

void AllianceAi::band(const std::vector<int> &ids) {
	const auto [t, lair] = pickTarget();
	st.target = t;
	if (t < 0 || ids.empty()) {
		st.doing = "none";
		return;
	}
	const ClaimSnap &c = snap->claims[t];
	// too few to go out: they muster at the entry (a point of its own is still held)
	double men = 0;
	for (int id : ids) men += aliveOf(id);
	if (!mine(c) && men < A().muster) {
		st.doing = "muster";
		for (int id : ids) behave(id, beh("hold", ex, ey, A().holdR));
		return;
	}
	if (lair >= 0) {
		const LairSnap *l = nullptr;
		for (const LairSnap &x : snap->lairs)
			if (x.id == lair) {
				l = &x;
				break;
			}
		st.doing = "lair";
		for (int id : ids) behave(id, beh("attackMove", l->x, l->y));
		return;
	}
	if (!mine(c) && walled(c.x, c.y)) {
		st.doing = "siege";
		for (size_t i = 0; i < ids.size(); i++) behave(ids[i], beh(i == 0 ? "siegeRam" : "assault", c.x, c.y));
		return;
	}
	if (mine(c)) {
		// held (or being taken: its holders fight off the takers round the banner)
		st.doing = "hold";
		for (int id : ids) behave(id, beh("hold", c.x, c.y, A().holdR));
		return;
	}
	// there: the biggest squad near the banner channels, the rest hold round it; else the band marches on it
	int lead = -1;
	for (int id : ids) {
		const auto p = centre(id);
		if (p && d2(p->first, p->second, c.x, c.y) <= js::pow(A().holdR, 2) && (lead < 0 || aliveOf(id) > aliveOf(lead))) lead = id;
	}
	st.doing = lead >= 0 ? "claim" : "march";
	for (int id : ids) {
		if (id != lead) behave(id, lead >= 0 ? beh("hold", c.x, c.y, A().holdR) : beh("attackMove", c.x, c.y));
		else if (snap->squads[id].order != "claimRegion") {
			unbot(id);
			godot::Dictionary o;
			o["kind"] = "claimRegion", o["squad"] = id, o["point"] = t;
			order(o);
		}
	}
}

std::pair<double, double> AllianceAi::spot(const std::string &type, double x, double y) {
	const auto wh = rotated(type, 0);
	const double x0 = std::floor(x - wh[0] / 2), y0 = std::floor(y - wh[1] / 2);
	for (double r = 2; r <= A().spot; r += 2) {
		for (double dy = -r; dy <= r; dy += 2)
			for (double dx = -r; dx <= r; dx += 2) {
				if (std::max(std::abs(dx), std::abs(dy)) != r) continue;
				if (sim.works->check_placement(team, type, x0 + dx, y0 + dy).ok) return { x0 + dx, y0 + dy };
			}
	}
	return { -1, -1 };
}

bool AllianceAi::build(const std::vector<int> &ids) {
	const ClaimSnap *held = nullptr;
	for (const ClaimSnap &c : snap->claims)
		if (mine(c) && c.taking.empty()) {
			held = &c;
			break;
		}
	if (!held || ids.empty()) return false;
	for (int id : ids) unbot(id);
	const AiSnap::Bld *camp = nullptr, *store = nullptr;
	for (const AiSnap::Bld &b : snap->buildings) {
		if (b.team != team || d2(b.x, b.y, held->x, held->y) > js::pow(A().spot + 6, 2)) continue;
		if (!camp && b.type == A().camp) camp = &b;
		if (!store && b.type == A().store) store = &b;
	}
	const AiSnap::Bld *open = nullptr;
	for (const AiSnap::Bld *b : { camp, store })
		if (b && b->state != "done" && b->state != "damaged") {
			open = b;
			break;
		}
	const auto lay = [&](const std::string &type, double x, double y) {
		const auto [sx, sy] = spot(type, x, y);
		if (sx < 0) return;
		st.laid++;
		godot::Dictionary o;
		o["kind"] = "placeBuilding", o["squad"] = ids[0], o["type"] = ps(type), o["x"] = sx, o["y"] = sy;
		order(o);
		for (size_t i = 1; i < ids.size(); i++) {
			godot::Dictionary m;
			m["kind"] = "move", m["squad"] = ids[i], m["x"] = sx, m["y"] = sy;
			order(m);
		}
	};
	if (!camp) return lay(A().camp, held->x, held->y), true;
	if (open) {
		for (int id : ids)
			if (snap->squads[id].order != "build") {
				godot::Dictionary o;
				o["kind"] = "build", o["squad"] = id, o["site"] = open->id;
				order(o);
			}
		return true;
	}
	double wood = 0;
	for (const auto &[t, c] : snap->stock)
		if (t == team) wood = c.get("wood");
	const double cost = data().economy.BUILDINGS.at(A().store).cost.get("wood");
	if (!store && wood >= cost) return lay(A().store, camp->x, camp->y), true;
	int node = -1;
	double nd = INF;
	for (const NodeSnap &n : sim.works->resource_nodes()) {
		if (n.res != "wood" || n.amount <= 0 || n.guarded) continue;
		const double d = d2(n.x, n.y, camp->x, camp->y);
		if (d < nd) nd = d, node = n.id;
	}
	if (node >= 0)
		for (int id : ids)
			if (snap->squads[id].order != "gather") {
				godot::Dictionary o;
				o["kind"] = "gather", o["squad"] = id, o["node"] = node;
				order(o);
			}
	return true;
}

void AllianceAi::tick(const std::shared_ptr<const AiSnap> &s) {
	if (std::fmod(s->tick, A().think) != 0) return;
	snap = s;
	alive.clear();
	for (const AiSnap::Unit &u : s->units)
		if (!u.dead && u.cls.rfind("civ_", 0) != 0) alive[u.squad] += 1;
	// the dead squad's bot runs on idle
	set.erase(std::remove_if(set.begin(), set.end(), [&](const auto &e) { return !aliveOf(e.first); }), set.end());
	raise(s->tick * A().tickMs);
	const std::vector<int> builder = squadsOf(0);
	std::vector<int> fighters;
	for (int k = 1; k < int(A().players); k++) {
		const auto q = squadsOf(k);
		fighters.insert(fighters.end(), q.begin(), q.end());
	}
	if (!build(builder)) fighters.insert(fighters.end(), builder.begin(), builder.end());
	std::sort(fighters.begin(), fighters.end());
	band(fighters);
}

double AllianceAi::men() const {
	double n = 0;
	for (size_t k = 0; k < owners.size(); k++) n += snap ? menOf(int(k)) : 0;
	return n;
}

double AllianceAi::present() const {
	double n = 0;
	for (size_t k = 0; k < owners.size(); k++)
		if (snap && menOf(int(k)) > 0) n++;
	return n;
}

} // namespace sim
