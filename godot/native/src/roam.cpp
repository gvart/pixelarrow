#include "roam.h"

#include <algorithm>
#include <cmath>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/string.hpp>

#include "js_math.h"
#include "recipes.h"
#include "sim_data.h"

namespace sim {

static const RoamTables &RT() { return data().roam; }
static double p2(double v) { return js::pow(v, 2); } // `v ** 2`
static constexpr double INF = std::numeric_limits<double>::infinity();
static const double NaN = std::numeric_limits<double>::quiet_NaN();

void load_roam_tables(const godot::Dictionary &tables, RoamTables &out) {
	if (!tables.has("src/war/sim/roam")) return;
	const godot::Dictionary t = tables["src/war/sim/roam"], r = t["ROAM"];
	out.ROAM_OWNER = godot::String(t["ROAM_OWNER"]).utf8().get_data();
	auto &R = out.ROAM;
	R.think = r["think"];
	R.wake = r["wake"];
	R.leg = r["leg"];
	const godot::Array rest = r["rest"];
	R.rest[0] = rest[0];
	R.rest[1] = rest[1];
	R.respawn = r["respawn"];
	R.clear = r["clear"];
	R.escortR = r["escortR"];
	R.escortShare = r["escortShare"];
	R.escortMin = r["escortMin"];
	const godot::Dictionary pay = r["pay"];
	R.pay.base = pay["base"];
	R.pay.per = pay["per"];
	R.ambushR = r["ambushR"];
	R.leash = r["leash"];
	R.huntR = r["huntR"];
	R.territory = r["territory"];
	R.drift = r["drift"];
	R.fightR = r["fightR"];
	R.flee = r["flee"];
	R.halt = r["halt"];
	const godot::Array den = t["DENSITY"];
	out.DENSITY.clear();
	for (int64_t i = 0; i < den.size(); i++) {
		const godot::Dictionary d = den[i];
		out.DENSITY.push_back({ d["packs"], d["patrols"], d["caravans"], d["travellers"] });
	}
	const godot::Dictionary nat = t["NATURE"];
	const godot::Array ks = nat.keys();
	for (int64_t i = 0; i < ks.size(); i++) {
		const godot::Dictionary n = nat[ks[i]];
		out.NATURE[godot::String(ks[i]).utf8().get_data()] = { godot::String(n["react"]).utf8().get_data(), n["size"], n["r"] };
	}
}

static const char *const LOADS[] = { "food", "wood", "stone", "salt", "oil", "iron", "copper", "hides", "flax", "herbs" }; // Object.values(LOADS)
static const char *const TRAVELLERS[] = { "civ_forager", "civ_merchant", "civ_cook", "civ_smith" };
static constexpr double IN = 14;
static constexpr double ROAM_PI = 3.141592653589793; // Math.PI

Roam::Roam(const RoamRegion &r, double seed, RoamHost &h)
		: region(r), host(h), rng(to_uint32(seed * 2654435761.0 + 0x6f616d)), depth(depth_of(r.depth)), rule(depth_rule(r.depth)) {
	// --- the region's places: entries (a little inside), towns, bandit camps, lairs by kind ---
	for (const RoamEntry &e : region.entries) {
		const double cx = e.x + e.w / 2, cy = e.y + e.h / 2;
		const std::pair<double, double> p = e.side == "N" ? std::make_pair(cx, e.y + e.h + IN)
				: e.side == "S"								  ? std::make_pair(cx, e.y - IN)
				: e.side == "W"								  ? std::make_pair(e.x + e.w + IN, cy)
															  : std::make_pair(e.x - IN, cy);
		entries.push_back(int(pts.size()));
		pts.push_back({ clamp_x(p.first), clamp_y(p.second) });
	}
	const auto &lairs = region.lairs;
	std::vector<bool> hosted(region.claimPoints.size(), false);
	for (size_t i = 0; i < region.claimPoints.size(); i++)
		for (int l : region.claimPoints[i].lairs)
			if (l >= 0 && l < int(lairs.size()) && lairs[l].captain) hosted[i] = true;
	for (const RoamRect &s : region.safe) {
		towns.push_back(int(pts.size()));
		pts.push_back({ s.x + s.w / 2, s.y + s.h / 2 });
	}
	for (size_t i = 0; i < region.claimPoints.size(); i++) {
		const ClaimEntry &c = region.claimPoints[i];
		if (hosted[i]) continue;
		bool some = false;
		for (const RoamPrebuilt &p : region.prebuilt)
			if (!p.landmark && ((p.claim && *p.claim == int(i)) || (!p.claim && js::hypot(p.x - c.x, p.y - c.y) < 25))) {
				some = true;
				break;
			}
		if (!some) continue;
		towns.push_back(int(pts.size()));
		pts.push_back({ c.x, c.y });
	}
	std::vector<std::string> kinds;
	for (const LairEntry &l : lairs) {
		if (l.kind == "bandit" && !l.captain) camps.push_back({ l.x, l.y });
		if (l.kind != "bandit" && std::find(kinds.begin(), kinds.end(), l.kind) == kinds.end()) kinds.push_back(l.kind);
	}
	beasts = kinds.size();
}

RoamSquad *Roam::sq(int id) {
	auto &s = host.squads();
	return id >= 0 && id < int(s.size()) ? &s[id] : nullptr;
}
bool Roam::live(int id) {
	const RoamSquad *s = sq(id);
	return (s ? s->alive : 0) > 0;
}

// Players' squads (not the wild's, not roaming folk), living; cached per tick.
const std::vector<int> &Roam::players() {
	if (realAt != tick_) {
		realAt = tick_;
		real.clear();
		const int MOB_TEAM = data().mobs.MOB_TEAM, NEUTRAL_TEAM = data().economy.NEUTRAL_TEAM;
		for (const RoamSquad &s : host.squads())
			if (s.alive > 0 && s.team != MOB_TEAM && s.team != NEUTRAL_TEAM) real.push_back(s.id);
	}
	return real;
}

static bool near_(const RoamSquad &s, double x, double y, double r) { return p2(s.cx - x) + p2(s.cy - y) <= r * r; }

bool Roam::any_player(double x, double y, double r) {
	for (int id : players())
		if (near_(*sq(id), x, y, r)) return true;
	return false;
}

// The nearest squad foe to s within r (by centre): the wild's foes are every other team; roaming folk's the angry ones.
RoamSquad *Roam::foe_of(const RoamSquad &s, double r) {
	const int MOB_TEAM = data().mobs.MOB_TEAM;
	RoamSquad *best = nullptr;
	double bd = r * r;
	for (RoamSquad &o : host.squads()) {
		if (o.alive == 0 || o.team == s.team) continue;
		if (s.team == MOB_TEAM ? false : o.team != MOB_TEAM && !((s.angry >> o.team) & 1)) continue;
		const double d = p2(o.cx - s.cx) + p2(o.cy - s.cy);
		if (d < bd) bd = d, best = &o;
	}
	return best;
}

static void hp_of(const RoamSquad &s, double &hp, double &max) {
	hp = 0, max = 0;
	for (const RoamUnit &u : s.units)
		if (u.alive) hp += u.hp, max += u.maxHp;
}

double Roam::clamp_x(double x) const { return std::max(2.0, std::min(host.w - 3, x)); }
double Roam::clamp_y(double y) const { return std::max(2.0, std::min(host.h - 3, y)); }

void Roam::move(int id, double x, double y) {
	const auto [px, py] = host.open(clamp_x(x), clamp_y(y));
	RoamOrder o;
	o.kind = "move";
	o.squad = id;
	o.x = px;
	o.y = py;
	host.order(o);
}

std::pair<double, double> Roam::wp(const Group &g, double i) const {
	const auto at = [&](double k) { return k >= 0 && k < double(g.route.size()) ? g.route[size_t(k)] : NaN; }; // undefined past the end
	return { at(i * 2), at(i * 2 + 1) };
}

// The road from a to b as waypoints ROAM.leg apart (nullopt: no way there).
std::optional<std::vector<double>> Roam::road(std::pair<double, double> a, std::pair<double, double> b, bool cart) {
	const auto key = std::make_tuple(cart, a.first, a.second, b.first, b.second);
	const auto hit = roads.find(key);
	if (hit != roads.end()) return hit->second;
	const double LEG = RT().ROAM.leg;
	const auto [ax, ay] = host.open(a.first, a.second);
	const auto [bx, by] = host.open(b.first, b.second);
	const std::vector<double> p = host.route(cart, ax, ay, bx, by);
	const size_t n = p.size();
	std::optional<std::vector<double>> out;
	if (n >= 4 && js::hypot(p[n - 2] - bx, p[n - 1] - by) < 6) {
		std::vector<double> o{ p[0], p[1] };
		double acc = 0;
		for (size_t i = 2; i < n; i += 2) {
			const double x0 = p[i - 2], y0 = p[i - 1], x1 = p[i], y1 = p[i + 1], d = js::hypot(x1 - x0, y1 - y0);
			double t = 0;
			while (d - t + acc >= LEG) {
				t += LEG - acc;
				acc = 0;
				o.push_back(x0 + ((x1 - x0) * t) / d);
				o.push_back(y0 + ((y1 - y0) * t) / d);
			}
			acc += d - t;
		}
		if (acc > LEG / 3 || o.size() < 4) {
			o.push_back(p[n - 2]);
			o.push_back(p[n - 1]);
		} else {
			o[o.size() - 2] = p[n - 2];
			o[o.size() - 1] = p[n - 1];
		}
		out = std::move(o);
	}
	roads[key] = out;
	return out;
}

Roam::Group Roam::blank(const RoamDef &d, const std::vector<double> &route) const {
	Group g;
	g.id = int(groups.size());
	g.kind = d.kind;
	g.mob = d.mob;
	g.cls = d.cls ? *d.cls : "";
	g.count = d.count ? *d.count : 0;
	g.guards = d.guards ? *d.guards : 0;
	g.route = route;
	g.hx = route.size() > 0 ? route[0] : NaN;
	g.hy = route.size() > 1 ? route[1] : NaN;
	g.pilgrim = d.pilgrim;
	return g;
}

RoamGoods Roam::goods() {
	std::vector<std::string> kinds(std::begin(LOADS), std::end(LOADS));
	const std::string a = kinds[size_t(std::floor(rng.next() * double(kinds.size())))];
	std::vector<std::string> rest;
	for (const std::string &k : kinds)
		if (k != a) rest.push_back(k);
	const std::string b = rest[size_t(std::floor(rng.next() * double(rest.size())))];
	const double na = 20 + js::round(20 * rng.next());
	const double nb = 10 + js::round(10 * rng.next());
	return { { a, na }, { b, nb }, { "coin", 3 + depth } };
}

// Stand the group's men (and wagon) up at waypoint `at` (a pack: at home).
void Roam::raise(Group &g, double at) {
	const int MOB_TEAM = data().mobs.MOB_TEAM, NEUTRAL_TEAM = data().economy.NEUTRAL_TEAM;
	const auto [x, y] = g.kind == "pack" ? std::make_pair(g.hx, g.hy) : wp(g, at);
	const bool wild = g.kind == "pack" || g.kind == "patrol";
	const RoamScale k = wild ? RoamScale{ rule.mob, rule.mob } : RoamScale{ 1, 1 };
	g.dead = false;
	g.squad = host.spawn(wild ? MOB_TEAM : NEUTRAL_TEAM, wild ? data().mobs.MOB_OWNER : RT().ROAM_OWNER, g.cls, g.count, x, y, k);
	g.guard = -1;
	g.cart = -1;
	if (g.squad < 0) {
		g.dead = true;
		g.respawnAt = tick_ + RT().ROAM.respawn;
		return;
	}
	if (g.kind == "pack" || g.kind == "patrol") host.order({ "formation", g.squad, 0, 0, -1, -1, -1, "loose" });
	if (g.kind == "traveller") host.order({ "formation", g.squad, 0, 0, -1, -1, -1, "column" });
	if (g.kind == "caravan") {
		g.cart = host.cart(x, y, goods());
		host.order({ "crew", g.squad, 0, 0, -1, g.cart });
		if (g.guards > 0) {
			g.guard = host.spawn(NEUTRAL_TEAM, RT().ROAM_OWNER, depth >= 1 ? "hoplite" : "militia", g.guards, x - 2, y - 2, k);
			if (g.guard >= 0) host.order({ "escort", g.guard, 0, 0, -1, -1, g.cart });
		}
	}
	g.leg = at;
	g.dir = at >= legs(g) - 1 && g.kind != "pack" ? -1 : 1;
	g.state = g.kind == "pack" ? "idle" : "walk";
	g.until = tick_ + 20 + double((g.id * 37) % 60);
	g.foe = -1;
	g.asleep = false;
	g.hpSeen = INF;
	g.escort.clear();
	g.road = 0;
	if (g.kind != "pack") next(g);
}

// On to the next waypoint (the first issue of a leg too).
void Roam::go(Group &g) {
	const auto [x, y] = wp(g);
	if (g.kind == "caravan") {
		if (live(g.squad)) host.order({ "move", g.squad, x, y }); // the driver rolls the wagon there
	} else move(g.squad, x, y);
}

// The waypoint after this one; at the road's end a rest, then back.
void Roam::next(Group &g) {
	const double n = legs(g);
	if (n < 2) return;
	const double i = g.leg + g.dir;
	if (i < 0 || i >= n) {
		arrive(g);
		g.dir = g.dir == 1 ? -1 : 1;
		g.state = "rest";
		const double lo = RT().ROAM.rest[0], hi = RT().ROAM.rest[1];
		g.until = tick_ + js::round(lo + (hi - lo) * rng.next());
		if (g.kind == "caravan" && live(g.squad)) host.order({ "hold", g.squad });
		return;
	}
	g.leg = i;
	g.state = "walk";
	go(g);
}

// The nearest waypoint ahead of the group: the walk goes on from there.
void Roam::rejoin(Group &g, double x, double y) {
	double best = g.leg, bd = INF;
	for (double i = 0; i < legs(g); i++) {
		const double d = p2(g.route[size_t(i * 2)] - x) + p2(g.route[size_t(i * 2 + 1)] - y);
		if (d < bd) bd = d, best = i;
	}
	g.leg = best;
	g.state = "walk";
	go(g);
}

// A caravan at its road's end: coin to the players who escorted it most of the way.
void Roam::arrive(Group &g) {
	if (g.kind != "caravan") return;
	const std::optional<RoamCart> c = host.cart_at(g.cart);
	if (c && c->alive && c->team == data().economy.NEUTRAL_TEAM) {
		const auto &R = RT().ROAM;
		const double need = std::max(R.escortMin, R.escortShare * g.road);
		for (const auto &[owner, e] : std::map<std::string, std::pair<double, int>>(g.escort.begin(), g.escort.end())) {
			const auto [n, team] = e;
			if (n < need) continue;
			const RoamSquad *gs = sq(g.guard), *ms = sq(g.squad);
			const int angry = (gs ? gs->angry : 0) | (ms ? ms->angry : 0);
			if ((angry >> team) & 1) continue;
			const double coin = R.pay.base + R.pay.per * depth;
			host.pay(owner, team, c->x, c->y, coin);
			RoamNote nt;
			nt.kind = "caravanPaid";
			nt.owner = owner;
			nt.team = team;
			nt.coin = coin;
			nt.x = c->x;
			nt.y = c->y;
			host.note(nt);
		}
	}
	g.escort.clear();
	g.road = 0;
}

// Gone: wiped out, or a caravan without its wagon (its survivors walk on as travellers); back later unless `once`.
void Roam::fall(Group &g) {
	if (g.kind == "caravan") {
		for (const int id : { g.squad, g.guard }) {
			if (!live(id)) continue;
			RoamDef d;
			d.kind = "traveller";
			Group t = blank(d, g.route);
			t.routeOf = g.routeOf >= 0 ? g.routeOf : g.id;
			t.squad = id;
			t.leg = g.leg;
			t.dir = g.dir;
			t.once = true;
			t.state = "walk";
			t.cls = "";
			groups.push_back(t);
			const RoamSquad *s = sq(id);
			rejoin(groups.back(), s->cx, s->cy);
		}
	}
	g.dead = true;
	g.squad = g.guard = g.cart = -1;
	g.respawnAt = tick_ + RT().ROAM.respawn;
}

void Roam::sleep(Group &g) {
	g.asleep = true;
	if (g.kind == "caravan" && live(g.squad)) host.order({ "hold", g.squad });
}
// world-fill: asleep, a calm group drifts: no foe looked at, the walk or the grazing goes on slowly.
void Roam::drift(Group &g, RoamSquad *s) {
	if (!s || g.kind == "caravan") return;
	if (g.kind == "pack") return calm_pack(g, s->id, RT().ROAM.drift);
	if (g.state == "rest") {
		if (tick_ >= g.until) next(g);
	} else if (host.arrived(s->id)) next(g);
}
void Roam::wake(Group &g) {
	g.asleep = false;
	if (g.kind == "pack") g.state = "idle", g.until = tick_;
	else if (g.state == "walk") go(g);
}
// Calm states: a group may fall asleep in them.
bool Roam::calm(const Group &g) const {
	return g.state == "idle" || g.state == "graze" || g.state == "roam" || g.state == "walk" || g.state == "rest";
}

void Roam::chase(Group &g, const RoamSquad &s, const RoamSquad &foe) {
	if (g.state != "chase" && g.state != "ambush") g.fx = s.cx, g.fy = s.cy;
	g.state = g.kind == "patrol" ? "ambush" : "chase";
	g.foe = foe.id;
	RoamOrder o;
	o.kind = "attack";
	o.squad = s.id;
	o.target = foe.id;
	host.order(o);
}
void Roam::run(Group &g, const RoamSquad &s, double fx, double fy, double until) {
	const double dx = s.cx - fx, dy = s.cy - fy;
	double d = js::hypot(dx, dy);
	if (!(d != 0) || std::isnan(d)) d = 1; // `|| 1`
	g.state = "flee";
	g.until = tick_ + until;
	const double F = RT().ROAM.flee;
	move(s.id, s.cx + (dx / d) * F, s.cy + (dy / d) * F);
}
void Roam::back(Group &g, const RoamSquad &s) {
	g.state = "return";
	g.foe = -1;
	if (g.kind == "pack") move(s.id, g.hx, g.hy);
	else {
		rejoin(g, s.cx, s.cy);
		g.state = "return";
	}
}
// A chase is over: the foe down or gone, too far from where it began, or (skittish kinds) bloodied.
bool Roam::chase_over(Group &g, const RoamSquad &s, double hp, double max) {
	const RoamSquad *f = sq(g.foe);
	bool bloodied = false;
	if (g.mob) {
		const auto it = data().mobs.MOBS.find(*g.mob);
		bloodied = it != data().mobs.MOBS.end() && it->second.skittish && *it->second.skittish != 0 && hp < max * 0.5;
	}
	return !f || f->alive == 0 || s.order != "attack" || js::hypot(s.cx - g.fx, s.cy - g.fy) > RT().ROAM.leash || bloodied || (g.mob && *g.mob == "wolf" && hp < max * 0.35);
}

void Roam::pack(Group &g, int sid) {
	const auto &R = RT().ROAM;
	RoamSquad *s = sq(sid);
	double hp, max;
	hp_of(*s, hp, max);
	const bool hurt = g.hpSeen != INF && hp < g.hpSeen - 1e-6;
	g.hpSeen = hp;
	const RoamNature &nat = RT().NATURE.at(g.mob ? *g.mob : "wolf");
	if (g.state == "chase") {
		if (chase_over(g, *s, hp, max)) back(g, *s);
		return;
	}
	if (g.state == "flee") {
		if (tick_ >= g.until || host.arrived(s->id)) back(g, *s);
		return;
	}
	if (g.state == "return") {
		if (host.arrived(s->id) || near_(*s, g.hx, g.hy, 4)) g.state = "idle", g.until = tick_ + 60;
		else if (hurt && nat.react != "flee") {
			const RoamSquad *f = foe_of(*s, R.leash);
			if (f) chase(g, *s, *f);
		}
		return;
	}
	// calm or stalking: what is near?
	const RoamSquad *f = foe_of(*s, std::max(nat.r, R.huntR));
	const double d = f ? js::hypot(f->cx - s->cx, f->cy - s->cy) : INF;
	const bool weak = !!f && f->alive <= s->alive * 2;
	if (f && nat.react == "flee" && (d <= nat.r || hurt)) return run(g, *s, f->cx, f->cy, 80);
	if (f && hurt) return chase(g, *s, *f);
	if (f && d <= nat.r) {
		if (nat.react == "attack" || nat.react == "near" || weak) return chase(g, *s, *f);
		return run(g, *s, f->cx, f->cy, 60); // a wolf pack outnumbered keeps away
	}
	if (f && nat.react == "weak" && weak && d <= R.huntR) {
		// stalk: close in at a walk, the attack comes within r
		g.state = "hunt";
		const double dd = d != 0 && !std::isnan(d) ? d : 1; // `d || 1`
		move(s->id, f->cx + ((s->cx - f->cx) / dd) * (nat.r - 2), f->cy + ((s->cy - f->cy) / dd) * (nat.r - 2));
		return;
	}
	if (g.state == "hunt") g.state = "idle", g.until = tick_; // the quarry got away
	calm_pack(g, sid, 1);
}

// A calm pack's day (k: its pace stretched, asleep): after a walk a rest; then graze, roam, or move on to another lair of the kind.
void Roam::calm_pack(Group &g, int sid, double k) {
	const auto range = [&](double lo, double hi) { return lo + (hi - lo) * rng.next(); };
	if (tick_ < g.until) return;
	const RoamSquad *s = sq(sid);
	if (g.state != "idle") {
		g.state = "idle";
		g.until = tick_ + js::round(range(120, 360) * k);
		return;
	}
	const double r = rng.next();
	if (r < 0.55) {
		g.state = "graze";
		g.until = tick_ + js::round(range(40, 90) * k);
		const double x = s->cx + range(-4, 4);
		const double y = s->cy + range(-4, 4);
		move(s->id, x, y);
		return;
	}
	if (r < 0.9 || !g.mob) {
		g.state = "roam";
		g.until = tick_ + 400 * k;
		const double a = range(0, ROAM_PI * 2), d = range(0.3, 1) * RT().ROAM.territory;
		move(s->id, g.hx + js::cos(a) * d, g.hy + js::sin(a) * d);
		return;
	}
	std::vector<const LairEntry *> others;
	for (const LairEntry &l : region.lairs)
		if (l.kind == *g.mob && js::hypot(l.x - g.hx, l.y - g.hy) > 8 && js::hypot(l.x - g.hx, l.y - g.hy) < 140) others.push_back(&l);
	const LairEntry *o = !others.empty() ? others[size_t(std::floor(rng.next() * double(others.size())))] : nullptr;
	g.state = "roam";
	g.until = tick_ + 1200 * k;
	if (o) g.hx = o->x, g.hy = o->y;
	const double x = g.hx + range(-6, 6);
	const double y = g.hy + range(-6, 6);
	move(s->id, x, y);
}

void Roam::patrol(Group &g, int sid) {
	const auto &R = RT().ROAM;
	RoamSquad *s = sq(sid);
	double hp, max;
	hp_of(*s, hp, max);
	const bool hurt = g.hpSeen != INF && hp < g.hpSeen - 1e-6;
	g.hpSeen = hp;
	if (g.state == "ambush") {
		if (chase_over(g, *s, hp, max)) back(g, *s);
		return;
	}
	if (g.state == "return") {
		if (host.arrived(s->id)) {
			g.state = "walk";
			go(g);
		}
		return;
	}
	const RoamSquad *f = foe_of(*s, hurt ? R.leash : R.ambushR);
	if (f && (hurt || f->alive <= s->alive + 2 || f->civ || f->meek)) return chase(g, *s, *f);
	if (g.state == "rest") {
		if (tick_ >= g.until) next(g);
		return;
	}
	if (host.arrived(s->id)) next(g);
}

void Roam::caravan(Group &g, int sid) {
	const int MOB_TEAM = data().mobs.MOB_TEAM, NEUTRAL_TEAM = data().economy.NEUTRAL_TEAM;
	const auto &R = RT().ROAM;
	const std::optional<RoamCart> c = host.cart_at(g.cart);
	RoamSquad *guard = sq(g.guard), *s = sq(sid);
	if (!c || !c->alive || !s || s->alive == 0) {
		// broken up: by a player's men (its grudge says who) it was robbed; by the wild, it was just lost
		const int grudge = (s ? s->angry : 0) | (guard ? guard->angry : 0);
		if (grudge) {
			RoamNote nt;
			nt.kind = "caravanRobbed";
			nt.caravan = g.id;
			nt.by = js::log2(double(grudge & -grudge));
			host.note(nt);
		}
		return fall(g);
	}
	if (c->team != NEUTRAL_TEAM) {
		// robbed: its guards and driver turn on the takers
		for (RoamSquad *q : { s, guard })
			if (q && q->alive > 0) q->angry |= 1 << c->team;
		RoamNote nt;
		nt.kind = "caravanRobbed";
		nt.caravan = g.id;
		nt.by = c->team;
		host.note(nt);
		return fall(g);
	}
	// one grudge for all of it
	const int angry = s->angry | (guard ? guard->angry : 0);
	s->angry = angry;
	if (guard) guard->angry = angry;
	// a foe of the caravan at the wagon: it halts (the guards fight, the driver may run with it); then on again
	bool threat = false;
	for (const RoamSquad &o : host.squads()) {
		if (o.alive == 0 || o.team == NEUTRAL_TEAM || !near_(o, c->x, c->y, R.halt)) continue;
		if (o.team == MOB_TEAM || (angry >> o.team) & 1) threat = true;
	}
	if (threat || s->flee) {
		if (g.state == "walk") {
			g.state = "halt";
			if (!s->flee) host.order({ "hold", s->id });
		}
		return;
	}
	if (g.state == "halt") return rejoin(g, c->x, c->y);
	if (g.state == "rest") {
		if (tick_ >= g.until) next(g);
		return;
	}
	// on the road: who walks beside it
	g.road++;
	for (const int pid : players()) {
		const RoamSquad &p = *sq(pid);
		if (!near_(p, c->x, c->y, R.escortR) || (angry >> p.team) & 1) continue;
		auto it = g.escort.find(p.owner);
		std::pair<double, int> &e = it == g.escort.end() ? (g.escort[p.owner] = std::make_pair(0.0, p.team)) : it->second;
		e.first++;
		e.second = p.team;
	}
	// the wagon done with its leg (there, or as near as carts get): on to the next; the driver held (or he ran): drive on;
	// stuck (the ground ahead closed to carts) a while: on to the next waypoint by a fresh path
	const double stuck = c->moving && js::hypot(c->x - g.fx, c->y - g.fy) < 0.05 ? ++g.stall : (g.stall = 0);
	g.fx = c->x;
	g.fy = c->y;
	if (!c->moving || stuck >= 6) {
		g.stall = 0;
		if (s->order == "move") next(g);
		else go(g);
	}
}

void Roam::traveller(Group &g, int sid) {
	const RoamSquad *s = sq(sid);
	if (s->flee) {
		g.state = "flee";
		g.until = tick_ + 30;
		return;
	}
	const auto fight = host.fight_near(s->cx, s->cy, RT().ROAM.fightR);
	if (fight && g.state != "flee") return run(g, *s, fight->first, fight->second, 80);
	if (g.state == "flee") {
		if (tick_ >= g.until && !fight) rejoin(g, s->cx, s->cy);
		return;
	}
	if (g.state == "rest") {
		if (tick_ >= g.until) next(g);
		return;
	}
	if (host.arrived(s->id)) next(g);
}

void Roam::think(Group &g) {
	const auto &R = RT().ROAM;
	if (g.dead) {
		if (g.once || tick_ < g.respawnAt) return;
		const auto [x, y] = g.kind == "pack" ? std::make_pair(g.hx, g.hy) : wp(g, 0);
		if (any_player(x, y, R.clear)) {
			g.respawnAt = tick_ + 100;
			return;
		}
		raise(g, 0);
		return;
	}
	RoamSquad *s = sq(g.squad);
	if (g.kind != "caravan" && (!s || s->alive == 0)) {
		g.dead = true;
		g.respawnAt = tick_ + R.respawn;
		return;
	}
	const std::optional<RoamCart> c = g.kind == "caravan" ? host.cart_at(g.cart) : std::nullopt;
	const auto [x, y] = c ? std::make_pair(c->x, c->y) : s ? std::make_pair(s->cx, s->cy) : std::make_pair(g.hx, g.hy);
	const bool awake = any_player(x, y, R.wake);
	if (!awake && calm(g)) {
		if (!g.asleep) sleep(g);
		drift(g, s);
		return;
	}
	if (g.asleep) wake(g);
	if (g.kind == "pack") pack(g, g.squad);
	else if (g.kind == "patrol") patrol(g, g.squad);
	else if (g.kind == "caravan") caravan(g, g.squad);
	else traveller(g, g.squad);
}

// A group from its definition, raised at once.
int Roam::add(const RoamDef &d) {
	std::vector<double> flat;
	for (const auto &[x, y] : d.route) flat.push_back(x), flat.push_back(y);
	Group g = blank(d, flat);
	if (d.kind == "pack") {
		g.mob = d.mob ? *d.mob : "wolf";
		g.cls = mob_class(*g.mob);
		const double size = RT().NATURE.at(*g.mob).size;
		g.count = d.count ? *d.count : (depth == 0 ? std::ceil(size / 2) : size); // world-fill: a home's packs are half
	} else if (d.kind == "patrol") {
		g.mob = "bandit";
		g.cls = mob_class("bandit");
		g.count = d.count ? *d.count : std::min(7.0, 4 + depth);
	} else if (d.kind == "caravan") {
		g.cls = "civ_merchant";
		g.count = 1;
		g.guards = d.guards ? *d.guards : (depth >= 2 ? 4 : 3);
	} else {
		g.cls = d.cls ? *d.cls : TRAVELLERS[g.id % 4];
		g.count = d.count ? *d.count : 2 + (g.id % 2);
	}
	groups.push_back(g);
	Group &in = groups.back();
	raise(in, std::max(0.0, std::min(legs(in) - 1, d.at ? *d.at : 0)));
	return in.id;
}

// The region's roaming life by its depth and places (deterministic: the roam Rng).
void Roam::populate() {
	const RoamDensity &n = RT().DENSITY[size_t(depth)];
	std::vector<int> ends = entries;
	ends.insert(ends.end(), towns.begin(), towns.end());
	const auto range = [&](double lo, double hi) { return lo + (hi - lo) * rng.next(); };
	const auto pick_road = [&](const std::vector<int> &from, const std::vector<int> &to, bool cart) -> std::optional<std::vector<double>> {
		for (int k = 0; k < 6; k++) {
			const size_t ia = size_t(std::floor(rng.next() * double(from.size())));
			const int a = ia < from.size() ? from[ia] : -1; // undefined: an empty list
			std::vector<int> rest;
			for (int p : to)
				if (p != a) rest.push_back(p);
			const size_t ib = size_t(std::floor(rng.next() * double(rest.size())));
			const int b = ib < rest.size() ? rest[ib] : -1;
			if (a < 0 || b < 0 || js::hypot(pts[a].first - pts[b].first, pts[a].second - pts[b].second) < 40) continue;
			const auto r = road(pts[a], pts[b], cart);
			if (r) return r;
		}
		return std::nullopt;
	};
	const auto as_def = [&](const std::string &kind, const std::vector<double> &r) {
		RoamDef d;
		d.kind = kind;
		for (size_t i = 0; i < r.size() / 2; i++) d.route.push_back({ r[i * 2], r[i * 2 + 1] });
		d.at = std::floor(range(0, double(r.size()) / 2 - 1));
		return d;
	};
	// beast packs round the lairs of the region's fauna (none where it has none)
	if (beasts) {
		std::vector<const LairEntry *> homes;
		for (const LairEntry &l : region.lairs)
			if (l.kind != "bandit") homes.push_back(&l);
		for (int i = 0; i < n.packs; i++) {
			const LairEntry &h = *homes[size_t(std::fmod(i * 3 + std::floor(range(0, double(homes.size()))), double(homes.size())))];
			const double a = range(0, ROAM_PI * 2), k = range(12, RT().ROAM.territory);
			const auto [x, y] = host.open(clamp_x(h.x + js::cos(a) * k), clamp_y(h.y + js::sin(a) * k));
			RoamDef d;
			d.kind = "pack";
			d.mob = h.kind;
			d.route = { { x, y } };
			const int id = add(d);
			groups[id].hx = h.x;
			groups[id].hy = h.y;
		}
	}
	// bandit patrols: camp to the nearest road entry (deeper in, any town or entry to an entry)
	const double patrols = !camps.empty() ? n.patrols : depth >= 2 ? n.patrols : 0;
	for (int i = 0; i < patrols && !entries.empty(); i++) {
		std::optional<std::vector<double>> r;
		if (!camps.empty()) {
			const auto c = camps[size_t(i) % camps.size()];
			std::vector<int> byDist = entries;
			std::stable_sort(byDist.begin(), byDist.end(), [&](int a, int b) {
				return js::hypot(pts[a].first - c.first, pts[a].second - c.second) - js::hypot(pts[b].first - c.first, pts[b].second - c.second) < 0;
			});
			for (size_t k = 0; k < std::min<size_t>(2, byDist.size()); k++)
				if ((r = road(c, pts[byDist[k]], false))) break;
		} else r = pick_road(ends, entries, false);
		if (r) add(as_def("patrol", *r));
	}
	// merchant caravans: an entry to a town, else to another entry
	for (int i = 0; i < n.caravans && !entries.empty(); i++) {
		const auto r = pick_road(entries, !towns.empty() ? towns : entries, true);
		if (r) add(as_def("caravan", *r));
	}
	// travellers, pilgrims deep in
	for (int i = 0; i < n.travellers && ends.size() > 1; i++) {
		const auto r = pick_road(ends, ends, false);
		if (!r) continue;
		RoamDef d = as_def("traveller", *r);
		if (depth >= 3) d.cls = "civ_physician", d.pilgrim = true;
		add(d);
	}
}

void Roam::spawn() {
	if (on) return;
	on = true;
	populate();
}

int Roam::add_group(const RoamDef &d) {
	on = true;
	return add(d);
}

void Roam::provoke(int team, std::optional<int> squad, std::optional<int> cart) {
	if (team < 0 || team == data().mobs.MOB_TEAM || team == data().economy.NEUTRAL_TEAM) return;
	for (const Group &g : groups) {
		if (g.dead || g.kind == "pack" || g.kind == "patrol") continue;
		if ((squad && (g.squad == *squad || g.guard == *squad)) || (cart && *cart >= 0 && g.cart == *cart)) {
			for (const int id : { g.squad, g.guard }) {
				RoamSquad *q = sq(id);
				if (q) q->angry |= 1 << team;
			}
		}
	}
}

void Roam::tick(double t) {
	tick_ = t;
	if (!on) return;
	for (size_t i = 0; i < groups.size(); i++)
		if (std::fmod(t + groups[i].id, RT().ROAM.think) == 0) think(groups[i]);
}

std::vector<RoamSnapOut> Roam::snaps() const {
	std::vector<RoamSnapOut> out;
	for (const Group &g : groups) {
		if (g.dead) continue;
		RoamSnapOut s;
		s.id = g.id;
		s.kind = g.kind;
		s.squads = g.guard >= 0 ? std::vector<int>{ g.squad, g.guard } : std::vector<int>{ g.squad };
		s.state = g.state;
		if (g.mob && g.kind == "pack") s.mob = *g.mob;
		s.cart = g.cart;
		s.pilgrim = g.pilgrim;
		s.asleep = g.asleep;
		out.push_back(s);
	}
	return out;
}

} // namespace sim
