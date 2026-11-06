#include "bots.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <set>

#include "js_math.h"
#include "sim.h"
#include "sim_data.h"

namespace sim {

namespace {

constexpr double INF = std::numeric_limits<double>::infinity();
constexpr double AGGRO = 10;
constexpr double DISENGAGE = 18;
constexpr double ARRIVED = 3;
constexpr double HOLD_RADIUS = 8;
constexpr double LEASH = 6;
constexpr double SIEGE_NEAR = 12;
constexpr double STAND_OFF = 22;
constexpr double DEFEND_R = 24;
constexpr double ARCHER_R = 16;
constexpr double ACTIVE_MELEE = 4; // M5c: fire the squad active with a foe squad's centre this near
constexpr double ACTIVE_MISSILE = 14; // ... a volley this near
constexpr double BRAZIER_BACK = 1.5;
constexpr double BRAZIER_EVERY = 30;
constexpr int MEMORY = 100;
constexpr double RAID_REACH = 28;
constexpr double GUARD_R = 12;

double sq(double v) { return v * v; }

// A JS template literal's `${n}` for the order keys: only compared with each other, so any one-to-one spelling does.
std::string num(double v) {
	char b[32];
	std::snprintf(b, sizeof b, "%.17g", v);
	return b;
}

using Bld = Bots::Bld;
using Eng = Bots::Eng;

bool isCart(const Eng &e) { return (e.type == "handcart" || e.type == "wagon") && e.state != "destroyed"; }
bool isGate(const Bld &b) { return b.type == "woodGate" || b.type == "stoneGate"; }
bool isWall(const Bld &b) { return isGate(b) || b.type == "palisade" || b.type == "rampart" || b.type == "stoneWall" || b.type == "woodTower" || b.type == "stoneTower"; }
bool standing(const Bld &b) { return b.state == "done" || b.state == "damaged"; }
bool wood(const std::string &t) { return t == "palisade" || t == "rampart" || t == "woodGate" || t == "woodTower"; }

// Nearest footprint tile (x, y, squared distance to its centre) of b to (x,y).
std::array<double, 3> nearTile(const Bld &b, double x, double y) {
	std::array<double, 3> best{ b.x, b.y, INF };
	for (size_t i = 0; i + 1 < b.tiles.size(); i += 2) {
		const double d = sq(b.tiles[i] + 0.5 - x) + sq(b.tiles[i + 1] + 0.5 - y);
		if (d < best[2]) best = { b.tiles[i], b.tiles[i + 1], d };
	}
	return best;
}

template <class T, class F>
const T *nearest(const std::vector<const T *> &items, F d) {
	const T *best = nullptr;
	double bd = INF;
	for (const T *t : items) {
		const double v = d(*t);
		if (v < bd) bd = v, best = t;
	}
	return best;
}

template <class T, class P>
std::vector<const T *> filter(const std::vector<T> &items, P p) {
	std::vector<const T *> out;
	for (const T &t : items)
		if (p(t)) out.push_back(&t);
	return out;
}

bool onFoot(const std::string &p) { return p == "nostock" || p == "in" || p == "breach" || p == "fight" || p == "march" || p == "done"; }

Order orderOf(const std::string &kind, int squad) {
	Order o;
	o.kind = kind;
	o.squad = squad;
	o.has_squad = true;
	return o;
}

Order moveOf(int squad, double x, double y) {
	Order o = orderOf("move", squad);
	o.x = x;
	o.y = y;
	return o;
}

} // namespace

bool Bots::set(int squad, const Behaviour &b) {
	const std::string start = b.kind == "flank" ? "via" : b.kind == "attackMove" || b.kind == "hold" ? "march" : "start";
	if (!bots.count(squad)) order.push_back(squad);
	Bot bot;
	bot.b = b;
	bot.phase = start;
	bots[squad] = bot;
	return true;
}

void Bots::clear(int squad) {
	if (!bots.erase(squad)) return;
	order.erase(std::find(order.begin(), order.end(), squad));
}

void Bots::tick() {
	if (!bots.empty() && ticks % every == 0) think();
	ticks++;
}

Bots::Snap Bots::snapshot() const {
	Snap s;
	s.tick = sim->tick;
	for (const Squad *q : sim->squads)
		s.acts.push_back(q->act.empty() ? std::nullopt : std::optional<Act>(Act{ q->act, std::max(0.0, q->actReady - sim->tick), std::max(0.0, q->actUntil - sim->tick) }));
	s.units.reserve(sim->units.size());
	for (const Unit *u : sim->units) {
		Man m;
		m.id = u->id;
		m.squad = u->squad->id;
		m.x = u->x;
		m.y = u->y;
		m.dead = !u->alive;
		m.on = sim->works->on_building(sim->grid->tile_at(u->x, u->y));
		m.cls = u->cls;
		s.units.push_back(std::move(m));
	}
	for (const BuildingSnap &b : sim->works->building_snaps()) {
		Bld o;
		o.id = b.id;
		o.team = b.team;
		o.type = b.type;
		o.state = b.state;
		o.x = b.x;
		o.y = b.y;
		o.tiles.assign(b.tiles.begin(), b.tiles.end());
		o.rubble = b.rubble;
		o.burning = b.burning && *b.burning != 0;
		o.siege = b.siege;
		o.attach = b.attach;
		o.walk = b.walk.value_or(0);
		s.buildings.push_back(std::move(o));
	}
	for (const SiegeSnap &e : sim->siege->snaps(sim->tick)) {
		Eng o;
		o.id = e.id;
		o.team = e.team;
		o.crew = e.crew;
		o.type = e.type;
		o.state = e.state;
		o.x = e.x;
		o.y = e.y;
		o.burning = e.burning && *e.burning != 0;
		s.sieges.push_back(std::move(o));
	}
	return s;
}

std::vector<Bots::Centre> Bots::centres(const Snap &snap) const {
	std::vector<Centre> out(sim->squads.size());
	for (size_t i = 0; i < out.size(); i++) out[i].team = sim->squads[i]->team;
	for (const Man &u : snap.units) {
		if (u.dead) continue;
		Centre &c = out[u.squad];
		c.x += u.x;
		c.y += u.y;
		c.alive++;
	}
	for (Centre &c : out)
		if (c.alive) c.x /= c.alive, c.y /= c.alive;
	return out;
}

Bots::View Bots::viewOf(const Snap &snap, const std::vector<Centre> &cs, int team) {
	if (team == MOB_TEAM) return { cs, snap }; // W-72: the wild has no fog (a warlord's men see the field)
	std::map<int, Seen> &mem = memo[team];
	std::set<int> seen; // looked up by key only
	View v;
	v.snap.tick = snap.tick;
	v.snap.acts = snap.acts;
	for (const Man &u : snap.units) {
		if (cs[u.squad].team == team) {
			v.snap.units.push_back(u);
			continue;
		}
		if (u.dead || !sim->vision.visible_to(team, u.x, u.y)) continue;
		seen.insert(u.squad);
		v.snap.units.push_back(u);
	}
	v.cs.resize(cs.size());
	for (size_t id = 0; id < cs.size(); id++) {
		const Centre &c = cs[id];
		v.cs[id] = c;
		if (c.team == team || !c.alive) continue;
		if (seen.count(int(id))) {
			mem[int(id)] = { c.x, c.y, snap.tick };
			continue;
		}
		const auto m = mem.find(int(id));
		if (m != mem.end() && snap.tick - m->second.at <= MEMORY) v.cs[id].x = m->second.x, v.cs[id].y = m->second.y;
		else v.cs[id].alive = 0;
	}
	// its own buildings, then the foe ones as last seen (in the vision's Map order)
	for (const Bld &b : snap.buildings)
		if (b.team == team) v.snap.buildings.push_back(b);
	Vision::Team &vt = sim->vision.team(team);
	for (const int id : vt.seen_order) {
		const VisionBuilding &b = vt.seen.at(id);
		Bld o;
		o.id = b.id;
		o.team = b.team;
		o.type = b.type;
		o.state = b.state;
		o.x = b.x;
		o.y = b.y;
		o.tiles = b.tiles;
		o.rubble = b.rubble;
		o.burning = b.burning != 0;
		o.siege = b.siege;
		o.attach = b.attach;
		o.walk = b.walk.value_or(0);
		v.snap.buildings.push_back(std::move(o));
	}
	for (const Eng &e : snap.sieges)
		if (e.team == team || sim->vision.visible_to(team, e.x, e.y)) v.snap.sieges.push_back(e);
	return v;
}

void Bots::send(Bot &bot, const std::string &key, const Order &o) {
	if (bot.issued == key) return;
	bot.issued = key;
	sim->order(o);
}

void Bots::send(Bot &bot, const std::string &key, int squad, const std::string &kind, double x, double y, int target) {
	Order o = orderOf(kind, squad);
	o.x = x;
	o.y = y;
	o.target = target;
	send(bot, key, o);
}

int Bots::nearestEnemy(const std::vector<Centre> &cs, int team, double x, double y, double r) const {
	int best = -1;
	double bestD = r * r;
	for (size_t id = 0; id < cs.size(); id++) {
		const Centre &c = cs[id];
		if (!c.alive || c.team == team) continue;
		const double d = sq(c.x - x) + sq(c.y - y);
		if (d < bestD) {
			bestD = d;
			best = int(id);
		}
	}
	return best;
}

void Bots::attackMove(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, double x, double y) {
	if (bot.target >= 0 && size_t(bot.target) < cs.size()) {
		const Centre &t = cs[bot.target];
		if (t.alive && js::hypot(t.x - me.x, t.y - me.y) < DISENGAGE) return; // still fighting it
	}
	const int foe = nearestEnemy(cs, me.team, me.x, me.y, AGGRO);
	if (foe >= 0) {
		bot.target = foe;
		bot.phase = "fight";
		send(bot, "attack:" + std::to_string(foe), id, "attack", 0, 0, foe);
		return;
	}
	bot.target = -1;
	if (js::hypot(x - me.x, y - me.y) > ARRIVED) {
		bot.phase = "march";
		send(bot, "move:" + num(x) + "," + num(y), id, "move", x, y, -1);
	} else {
		bot.phase = "done";
		send(bot, "hold", id, "hold", 0, 0, -1);
	}
}

const Eng *Bots::engineFor(int id, Bot &bot, const Centre &me, const Snap &snap, const std::string &type) {
	const std::vector<Eng> &sg = snap.sieges;
	// TS `sg[bot.engine]`: the engine at that index of the (fog-filtered) list, as the TS reads it
	const Eng *e = bot.engine >= 0 && size_t(bot.engine) < sg.size() ? &sg[bot.engine] : nullptr;
	if (e && e->state == "destroyed") {
		bot.phase = "nostock"; // lost it: fight on foot
		return nullptr;
	}
	if (!e && bot.at) {
		const double ax = (*bot.at)[0], ay = (*bot.at)[1];
		for (const Eng &o : sg)
			if (o.type == type && o.team == me.team && o.state != "destroyed" && js::hypot(o.x - ax, o.y - ay) < 0.5) {
				e = &o;
				break;
			}
		if (e) bot.engine = e->id;
		else if (sim->squads[id]->order != "buildSiege") {
			bot.phase = "nostock"; // the build order was refused
			return nullptr;
		}
	}
	if (!e && !bot.at) {
		const Eng *idle = nearest(filter(sg, [&](const Eng &o) { return o.type == type && o.team == me.team && o.crew < 0 && o.state == "idle"; }), [&](const Eng &o) { return sq(o.x - me.x) + sq(o.y - me.y); });
		if (idle && js::hypot(idle->x - me.x, idle->y - me.y) < SIEGE_NEAR) bot.engine = idle->id, e = idle;
		else {
			bot.at = std::array<double, 2>{ std::floor(me.x) + 0.5, std::floor(me.y) + 0.5 };
			bot.phase = "build";
			Order o = orderOf("buildSiege", id);
			o.type = type;
			o.x = (*bot.at)[0];
			o.y = (*bot.at)[1];
			send(bot, "buildSiege:" + type, o);
			return nullptr;
		}
	}
	if (!e || e->state == "building") return nullptr;
	if (e->crew != id && e->state != "raised") {
		bot.phase = "crew";
		Order o = orderOf("crew", id);
		o.siege = e->id;
		send(bot, "crew:" + std::to_string(e->id) + ":" + std::to_string(ticks), o); // afresh each time (it may have been relieved)
		return nullptr;
	}
	return e;
}

const Eng *Bots::designFor(int id, Bot &bot, const Centre &me, const Snap &snap, const std::string &base, const std::string &want) {
	const std::string type = !want.empty() && !bot.plain ? want : base;
	if (type.empty()) return nullptr;
	const Eng *e = engineFor(id, bot, me, snap, type);
	if (!e && bot.phase == "nostock" && bot.engine < 0 && type != base) {
		bot.plain = true;
		bot.at.reset();
		if (!base.empty()) bot.phase = "start";
	}
	return e;
}

bool Bots::rollTo(int id, Bot &bot, const Eng &e, const std::vector<const Bld *> &walls, double dist, double x, double y) {
	const Bld *w = nearest(walls, [&](const Bld &b) { return nearTile(b, e.x, e.y)[2]; });
	double tx = x, ty = y;
	if (w) {
		const auto t = nearTile(*w, e.x, e.y);
		tx = t[0], ty = t[1];
	}
	const double d = js::hypot(e.x - tx - 0.5, e.y - ty - 0.5);
	if (d <= dist + ARRIVED) return true;
	const double k = dist / (d == 0 || std::isnan(d) ? 1 : d);
	const double gx = js::round(tx + 0.5 + (e.x - tx - 0.5) * k), gy = js::round(ty + 0.5 + (e.y - ty - 0.5) * k);
	send(bot, "roll:" + num(gx) + "," + num(gy), moveOf(id, gx, gy));
	return false;
}

bool Bots::scout(int id, Bot &bot, const Centre &me, const std::vector<Bld> &blds, double x, double y) {
	if (bot.engine >= 0 || bot.at) return false;
	for (const Bld &b : blds)
		if (b.team != me.team && isWall(b)) return false;
	bot.phase = "scout";
	send(bot, "scout:" + num(x) + "," + num(y), moveOf(id, x, y));
	return true;
}

void Bots::siegeRam(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap, double x, double y) {
	if (onFoot(bot.phase) && bot.phase != "breach") return attackMove(id, bot, me, cs, x, y);
	const std::vector<Bld> &blds = snap.buildings;
	if (scout(id, bot, me, blds, x, y)) return;
	bool breached = false;
	for (const Bld &b : blds)
		if (b.team != me.team && b.rubble && js::hypot(b.x - x, b.y - y) < DEFEND_R * 1.5) {
			breached = true;
			break;
		}
	const std::vector<const Bld *> foes = filter(blds, [&](const Bld &b) { return b.team != me.team && isWall(b) && standing(b); });
	if (bot.phase == "breach" || breached || foes.empty()) {
		if (bot.phase != "breach") send(bot, "uncrew", orderOf("uncrew", id));
		bot.phase = "in";
		return;
	}
	const Eng *e = designFor(id, bot, me, snap, "ram", bot.b.kind == "siegeRam" ? bot.b.engine : "");
	if (!e) {
		if (bot.phase == "nostock") attackMove(id, bot, me, cs, x, y);
		return;
	}
	std::vector<const Bld *> gates;
	for (const Bld *b : foes)
		if (isGate(*b)) gates.push_back(b);
	const Bld *gate = nearest(gates, [&](const Bld &b) { return sq(b.x - x) + sq(b.y - y); });
	if (!gate) gate = nearest(foes, [&](const Bld &b) { return nearTile(b, e->x, e->y)[2]; });
	bot.phase = "ram";
	Order o = orderOf("attackBuilding", id);
	o.building = gate->id;
	send(bot, "ram:" + std::to_string(gate->id), o);
}

void Bots::siegeLadder(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap, double x, double y) {
	const std::vector<Bld> &blds = snap.buildings;
	if (bot.phase == "up") {
		const Bld *l = nullptr, *wall = nullptr;
		for (const Bld &b : blds)
			if (b.siege && *b.siege == bot.engine && b.state != "destroyed") {
				l = &b;
				break;
			}
		if (l && l->attach)
			for (const Bld &b : blds)
				if (b.id == *l->attach) {
					wall = &b;
					break;
				}
		if (!l || !wall) bot.phase = "ladder"; // pushed off: raise it again
		else {
			int up = 0;
			for (const Man &u : snap.units)
				if (u.squad == id && !u.dead && u.on == wall->id) up++;
			if (up * 2 >= me.alive) bot.phase = "in";
			else {
				const auto t = nearTile(*wall, l->tiles[0] + 0.5, l->tiles[1] + 0.5);
				send(bot, "climb:" + std::to_string(l->id), moveOf(id, t[0] + 0.5, t[1] + 0.5));
				return;
			}
		}
	}
	if (onFoot(bot.phase)) return attackMove(id, bot, me, cs, x, y);
	if (scout(id, bot, me, blds, x, y)) return;
	const Eng *e = designFor(id, bot, me, snap, "siegeLadder", bot.b.kind == "siegeLadder" ? bot.b.engine : "");
	if (!e) {
		if (bot.phase == "nostock") attackMove(id, bot, me, cs, x, y);
		return;
	}
	if (e->state == "raised") {
		bot.phase = "up";
		return;
	}
	const std::vector<const Bld *> walls = filter(blds, [&](const Bld &b) { return b.team != me.team && b.walk > 0 && standing(b); });
	const Bld *w = nearest(walls, [&](const Bld &b) { return nearTile(b, e->x, e->y)[2]; });
	if (!w) {
		bot.phase = "in";
		return;
	}
	const auto t = nearTile(*w, e->x, e->y);
	bot.phase = "ladder";
	Order o = orderOf("raiseLadder", id);
	o.wallTile = { int(t[0]), int(t[1]) };
	send(bot, "raise:" + num(t[0]) + "," + num(t[1]) + ":" + std::to_string(e->crew), o);
}

void Bots::brazier(int id, Bot &bot, const Centre &me, const Snap &snap, double tx, double ty) {
	if (sim->fireBlock(*sim->squads[id]) != "noBrazier" || snap.tick - bot.brazier < BRAZIER_EVERY || !me.alive) return;
	// a different spot each try (a tile may be taken): turn round the centre
	const double a = js::atan2(me.y - ty, me.x - tx) + ((bot.tries % 5) - 2) * 0.5;
	const double r = bot.tries % 5 ? BRAZIER_BACK + 0.5 : BRAZIER_BACK;
	bot.brazier = snap.tick;
	bot.tries++;
	Order o;
	o.kind = "placeBuilding";
	o.team = me.team;
	o.type = "brazier";
	o.x = std::floor(me.x + js::cos(a) * r) + 0.5;
	o.y = std::floor(me.y + js::sin(a) * r) + 0.5;
	sim->order(o);
}

void Bots::siegeArchers(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap, double x, double y) {
	if (!bot.fire) {
		bot.fire = true;
		Order o = orderOf("fireArrows", id);
		o.on = true;
		sim->order(o);
	}
	// M5h3: behind a mantlet, rolled to bow range of the nearest foe wall
	if (bot.b.kind == "siegeArchers" && bot.b.engine == "mantlet" && !bot.plain && bot.phase != "nostock") {
		const std::vector<const Bld *> walls = filter(snap.buildings, [&](const Bld &b) { return b.team != me.team && isWall(b) && standing(b); });
		if (!walls.empty()) {
			const Eng *e = designFor(id, bot, me, snap, "", "mantlet");
			if (!e) {
				if (bot.phase == "nostock") bot.plain = true; // refused or lost: plain siege archers from now on
				return;
			}
			if (bot.phase == "covered" || rollTo(id, bot, *e, walls, ARCHER_R * 0.7, x, y)) {
				bot.phase = "covered";
				send(bot, "covered", orderOf("hold", id));
			} else bot.phase = "mantlet";
			return;
		}
	}
	int foe = -1;
	double fd = ARCHER_R * ARCHER_R; // foes up on the walls in reach
	for (const Man &u : snap.units) {
		if (u.dead || u.on < 0 || cs[u.squad].team == me.team) continue;
		const double d = sq(u.x - me.x) + sq(u.y - me.y);
		if (d < fd) fd = d, foe = u.squad;
	}
	if (foe >= 0) {
		bot.phase = "suppress";
		brazier(id, bot, me, snap, cs[foe].x, cs[foe].y);
		send(bot, "attack:" + std::to_string(foe), id, "attack", 0, 0, foe);
		return;
	}
	const std::vector<const Bld *> wd = filter(snap.buildings, [&](const Bld &b) { return b.team != me.team && wood(b.type) && standing(b) && !b.burning && js::hypot(b.x - x, b.y - y) < DEFEND_R * 1.5; });
	const Bld *w = nearest(wd, [&](const Bld &b) { return nearTile(b, me.x, me.y)[2]; });
	if (w) {
		bot.phase = "burn";
		brazier(id, bot, me, snap, w->x, w->y);
		Order o = orderOf("attackBuilding", id);
		o.building = w->id;
		send(bot, "burn:" + std::to_string(w->id), o);
		return;
	}
	attackMove(id, bot, me, cs, x, y);
}

void Bots::assault(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap, double x, double y) {
	if (onFoot(bot.phase)) return attackMove(id, bot, me, cs, x, y);
	const std::vector<Bld> &blds = snap.buildings;
	const auto dme = [&](const Bld &b) { return sq(b.x - me.x) + sq(b.y - me.y); };
	const Bld *breach = nearest(filter(blds, [&](const Bld &b) { return b.team != me.team && b.rubble && js::hypot(b.x - x, b.y - y) < DEFEND_R * 1.5; }), dme);
	if (breach) {
		if (js::hypot(breach->x - me.x, breach->y - me.y) < ARRIVED) bot.phase = "in";
		else {
			bot.phase = "breach-go";
			send(bot, "move:" + num(breach->x) + "," + num(breach->y), moveOf(id, breach->x, breach->y));
		}
		return;
	}
	const Bld *ladder = nearest(filter(blds, [&](const Bld &b) { return b.team == me.team && b.siege && b.state != "destroyed"; }), dme);
	const Bld *wall = nullptr;
	if (ladder && ladder->attach)
		for (const Bld &b : blds)
			if (b.id == *ladder->attach) {
				wall = &b;
				break;
			}
	if (ladder && wall) {
		bool on = false;
		for (const Man &u : snap.units)
			if (u.squad == id && !u.dead && u.on == wall->id) {
				on = true;
				break;
			}
		if (on) bot.phase = "in";
		else {
			const auto t = nearTile(*wall, ladder->tiles[0] + 0.5, ladder->tiles[1] + 0.5);
			bot.phase = "climb";
			send(bot, "climb:" + std::to_string(ladder->id), moveOf(id, t[0] + 0.5, t[1] + 0.5));
		}
		return;
	}
	// wait out of bow range, on the line from (x,y) to where it stands
	const double d = js::hypot(me.x - x, me.y - y);
	bot.phase = "wait";
	if (d < STAND_OFF - 2) {
		const double k = STAND_OFF / (d == 0 || std::isnan(d) ? 1 : d);
		const double wx = js::round(x + (me.x - x) * k), wy = js::round(y + (me.y - y) * k);
		send(bot, "wait:" + num(wx) + "," + num(wy), moveOf(id, wx, wy));
	}
}

void Bots::siegeBolts(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap, double x, double y) {
	if (onFoot(bot.phase)) return attackMove(id, bot, me, cs, x, y);
	const std::vector<Bld> &blds = snap.buildings;
	if (scout(id, bot, me, blds, x, y)) return;
	const Eng *e = designFor(id, bot, me, snap, "", "oxybeles");
	if (!e) {
		if (bot.phase == "nostock" || bot.plain) bot.phase = "nostock", attackMove(id, bot, me, cs, x, y);
		return;
	}
	const std::vector<const Bld *> walls = filter(blds, [&](const Bld &b) { return b.team != me.team && isWall(b) && standing(b); });
	if (bot.phase == "bolts" || rollTo(id, bot, *e, walls, data().siege.OXY.range * 0.6, x, y)) {
		bot.phase = "bolts";
		send(bot, "bolts", orderOf("hold", id));
	} else bot.phase = "roll";
}

void Bots::defendWalls(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap, double x, double y, double r) {
	const std::vector<Bld> &blds = snap.buildings;
	const auto near = [&](double px, double py) { return js::hypot(px - x, py - y) < r; };
	std::set<int> mine; // looked up only
	for (const Bld &b : blds)
		if (b.team == me.team) mine.insert(b.id);
	const auto dist = [&](double bx, double by) { return sq(bx - me.x) + sq(by - me.y); };
	const Bld *ladder = nearest(filter(blds, [&](const Bld &b) { return b.type == "ladder" && b.team != me.team && b.state != "destroyed" && near(b.x, b.y) && mine.count(b.attach.value_or(-1)); }), [&](const Bld &b) { return dist(b.x, b.y); });
	if (ladder) {
		bot.phase = "push";
		Order o = orderOf("pushLadder", id);
		o.ladder = ladder->id;
		send(bot, "push:" + std::to_string(ladder->id), o);
		return;
	}
	const int inside = nearestEnemy(cs, me.team, x, y, r / 2);
	if (inside >= 0) {
		bot.phase = "fight";
		send(bot, "attack:" + std::to_string(inside), id, "attack", 0, 0, inside);
		return;
	}
	int melee = 0;
	for (const Man &u : snap.units)
		if (u.squad == id && !u.dead && data().classes.of(u.cls).range == 0) melee++;
	const Eng *ram = melee * 2 > me.alive ? nearest(filter(snap.sieges, [&](const Eng &e) { return (e.type == "ram" || e.type == "coveredRam" || e.type == "siegeTower") && e.team != me.team && e.state != "destroyed" && !e.burning && near(e.x, e.y); }), [&](const Eng &e) { return dist(e.x, e.y); }) : nullptr;
	if (ram) {
		bot.phase = "sally";
		Order o = orderOf("ignite", id);
		o.siege = ram->id;
		send(bot, "ignite:" + std::to_string(ram->id), o);
		return;
	}
	const Bld *fire = nearest(filter(blds, [&](const Bld &b) { return b.team == me.team && b.burning && near(b.x, b.y); }), [&](const Bld &b) { return dist(b.x, b.y); });
	if (fire) {
		bot.phase = "douse";
		Order o = orderOf("extinguish", id);
		o.building = fire->id;
		send(bot, "douse:" + std::to_string(fire->id), o);
		return;
	}
	// man the walk nearest the nearest foe (or the centre)
	const int foe = nearestEnemy(cs, me.team, x, y, r * 2);
	const double fx = foe >= 0 ? cs[foe].x : x, fy = foe >= 0 ? cs[foe].y : y;
	const Bld *w = nearest(filter(blds, [&](const Bld &b) { return b.team == me.team && b.walk > 0 && standing(b) && b.type != "ladder" && near(b.x, b.y); }), [&](const Bld &b) { return nearTile(b, fx, fy)[2]; });
	if (!w) {
		bot.phase = "hold";
		send(bot, "hold", orderOf("hold", id));
		return;
	}
	const auto t = nearTile(*w, fx, fy);
	bot.phase = "walls";
	send(bot, "walls:" + std::to_string(w->id), moveOf(id, t[0] + 0.5, t[1] + 0.5));
}

void Bots::holdAt(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, double x, double y, double r) {
	const double away = js::hypot(x - me.x, y - me.y);
	const int foe = away > r + LEASH ? -1 : nearestEnemy(cs, me.team, x, y, r);
	if (foe >= 0) {
		bot.phase = "fight";
		send(bot, "attack:" + std::to_string(foe), id, "attack", 0, 0, foe);
	} else if (away > ARRIVED) {
		bot.phase = "march";
		send(bot, "move:" + num(x) + "," + num(y), id, "move", x, y, -1);
	} else {
		bot.phase = "hold";
		send(bot, "hold", id, "hold", 0, 0, -1);
	}
}

int Bots::guardsOf(const Snap &snap, const std::vector<Centre> &cs, int team, double x, double y) const {
	int n = 0;
	for (const Man &u : snap.units)
		if (!u.dead && size_t(u.squad) < cs.size() && cs[u.squad].team == team && sq(u.x - x) + sq(u.y - y) <= GUARD_R * GUARD_R) n++;
	return n;
}

bool Bots::pull(int id, Bot &bot, const Eng &e, double x, double y, const std::string &key) {
	if (e.crew != id) {
		bot.phase = "crew";
		Order o = orderOf("crew", id);
		o.siege = e.id;
		send(bot, "crew:" + std::to_string(e.id) + ":" + std::to_string(ticks / 50), o);
		return false;
	}
	if (js::hypot(e.x - x, e.y - y) <= ARRIVED) return true;
	bot.phase = "haul";
	send(bot, key + ":" + std::to_string(ticks / 100), moveOf(id, x, y)); // again now and then: a halt drops it
	return false;
}

void Bots::raider(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap, const Behaviour &b) {
	const double hx = b.x + b.w / 2, hy = b.y + b.h / 2;
	const std::vector<const Eng *> carts = filter(snap.sieges, isCart);
	const auto cartOf = [&](int cid) -> const Eng * {
		for (const Eng *e : carts)
			if (e->id == cid) return e;
		return nullptr;
	};
	// the cart it went for is ours now: it is the prize
	if (bot.cart >= 0) {
		const Eng *c = cartOf(bot.cart);
		if (c && c->team == me.team) bot.engine = c->id;
		if (!c || c->team == me.team) bot.cart = -1;
	}
	const Eng *prize = nullptr;
	if (bot.engine >= 0)
		for (const Eng *e : carts)
			if (e->id == bot.engine && e->team == me.team) {
				prize = e;
				break;
			}
	if (prize) {
		if (pull(id, bot, *prize, hx, hy, "home")) {
			bot.phase = "done";
			send(bot, "hold", orderOf("hold", id));
		}
		return;
	}
	bot.engine = -1;
	const double weak = b.weak ? *b.weak : std::max(3.0, std::floor(me.alive * 0.6)), reach = b.reach ? *b.reach : RAID_REACH;
	std::vector<const Eng *> preys;
	for (const Eng *e : carts)
		if (e->team != me.team && js::hypot(e->x - hx, e->y - hy) <= reach + std::max(b.w, b.h) / 2 && guardsOf(snap, cs, e->team, e->x, e->y) <= weak) preys.push_back(e);
	const Eng *prey = nearest(preys, [&](const Eng &e) { return sq(e.x - me.x) + sq(e.y - me.y); });
	if (prey) {
		bot.cart = prey->id;
		const int g = nearestEnemy(cs, me.team, prey->x, prey->y, GUARD_R);
		if (g >= 0) {
			bot.phase = "fight";
			send(bot, "attack:" + std::to_string(g), id, "attack", 0, 0, g);
		} else {
			bot.phase = "raid";
			send(bot, "raid:" + num(js::round(prey->x)) + "," + num(js::round(prey->y)), moveOf(id, prey->x, prey->y));
		}
		return;
	}
	holdAt(id, bot, me, cs, hx, hy, std::max(b.w, b.h) / 2 + 4);
	if (bot.phase == "hold") bot.phase = "wait";
}

void Bots::escort(int id, Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap, int cart) {
	const Eng *c = nullptr;
	for (const Eng &e : snap.sieges)
		if (e.id == cart && isCart(e)) {
			c = &e;
			break;
		}
	if (!c) {
		bot.phase = "done";
		send(bot, "hold", orderOf("hold", id));
	} else if (c->team == me.team) {
		bot.phase = "escort";
		if (sim->squads[id]->order != "escort") {
			Order o = orderOf("escort", id);
			o.cart = c->id;
			send(bot, "escort:" + std::to_string(c->id) + ":" + std::to_string(ticks), o);
		}
	} else {
		// taken: go and take it back (its new guards first)
		const int g = nearestEnemy(cs, me.team, c->x, c->y, GUARD_R);
		bot.phase = "retake";
		if (g >= 0) send(bot, "attack:" + std::to_string(g), id, "attack", 0, 0, g);
		else send(bot, "retake:" + num(js::round(c->x)) + "," + num(js::round(c->y)), moveOf(id, c->x, c->y));
	}
}

void Bots::haul(int id, Bot &bot, const Centre &me, const Snap &snap, const Behaviour &b) {
	const Eng *c = nullptr;
	for (const Eng &e : snap.sieges)
		if (e.id == b.cart && isCart(e)) {
			c = &e;
			break;
		}
	if (!c || c->team != me.team) {
		bot.phase = "lost";
		send(bot, "hold", orderOf("hold", id));
		return;
	}
	while (size_t(bot.tries) < b.path.size() && js::hypot(c->x - b.path[bot.tries][0], c->y - b.path[bot.tries][1]) <= ARRIVED) bot.tries++;
	if (size_t(bot.tries) >= b.path.size()) {
		bot.phase = "arrived";
		send(bot, "hold", orderOf("hold", id));
		return;
	}
	const auto &p = b.path[bot.tries];
	pull(id, bot, *c, p[0], p[1], "haul:" + std::to_string(bot.tries));
}

void Bots::think() {
	const Snap full = snapshot();
	const std::vector<Centre> all = centres(full);
	std::map<int, View> views; // looked up by team only
	for (const int id : order) {
		Bot &bot = bots.at(id);
		if (size_t(id) >= all.size() || !all[id].alive) continue;
		const int team = all[id].team;
		auto v = views.find(team);
		if (v == views.end()) v = views.emplace(team, viewOf(full, all, team)).first;
		const std::vector<Centre> &cs = v->second.cs;
		const Snap &snap = v->second.snap;
		const Centre me = cs[id];
		const Behaviour &b = bot.b;
		if (b.kind == "siegeRam") siegeRam(id, bot, me, cs, snap, b.x, b.y);
		else if (b.kind == "siegeLadder") siegeLadder(id, bot, me, cs, snap, b.x, b.y);
		else if (b.kind == "siegeArchers") siegeArchers(id, bot, me, cs, snap, b.x, b.y);
		else if (b.kind == "siegeBolts") siegeBolts(id, bot, me, cs, snap, b.x, b.y);
		else if (b.kind == "assault") assault(id, bot, me, cs, snap, b.x, b.y);
		else if (b.kind == "defendWalls") defendWalls(id, bot, me, cs, snap, b.x, b.y, b.has_radius ? b.radius : DEFEND_R);
		else if (b.kind == "attackMove") attackMove(id, bot, me, cs, b.x, b.y);
		else if (b.kind == "raider") raider(id, bot, me, cs, snap, b);
		else if (b.kind == "escort") escort(id, bot, me, cs, snap, b.cart);
		else if (b.kind == "haul") haul(id, bot, me, snap, b);
		else if (b.kind == "flank") {
			if (bot.phase == "via") {
				if (js::hypot(b.via[0] - me.x, b.via[1] - me.y) > ARRIVED) send(bot, "via", id, "move", b.via[0], b.via[1], -1);
				else bot.phase = "march";
			}
			if (bot.phase != "via") attackMove(id, bot, me, cs, b.x, b.y);
		} else if (b.kind == "hold") holdAt(id, bot, me, cs, b.x, b.y, b.has_radius ? b.radius : HOLD_RADIUS);
		useActive(id, bot, me, cs, snap);
	}
}

// M5c: a fighting bot fires its squad active once a foe is close (missiles: in bow range).
void Bots::useActive(int id, const Bot &bot, const Centre &me, const std::vector<Centre> &cs, const Snap &snap) {
	const std::optional<Act> *a = size_t(id) < snap.acts.size() ? &snap.acts[id] : nullptr;
	if (!a || !*a || (*a)->ready > 0 || (*a)->on > 0 || (bot.phase != "fight" && bot.phase != "suppress" && bot.phase != "walls" && bot.phase != "in")) return;
	if (nearestEnemy(cs, me.team, me.x, me.y, (*a)->skill == "volley" ? ACTIVE_MISSILE : ACTIVE_MELEE) >= 0) sim->order(orderOf("active", id));
}

} // namespace sim
