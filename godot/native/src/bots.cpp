#include "bots.h"

#include <algorithm>
#include <cstdio>
#include <set>

#include "js_math.h"
#include "sim.h"

namespace sim {

namespace {

constexpr double AGGRO = 10;
constexpr double DISENGAGE = 18;
constexpr double ARRIVED = 3;
constexpr double HOLD_RADIUS = 8;
constexpr double LEASH = 6;
constexpr int MEMORY = 100;

double sq(double v) { return v * v; }

// A JS template literal's `${n}` for the order keys: only compared with each other, so any one-to-one spelling does.
std::string num(double v) {
	char b[32];
	std::snprintf(b, sizeof b, "%.17g", v);
	return b;
}

} // namespace

bool Bots::set(int squad, const Behaviour &b) {
	if (b.kind != "attackMove" && b.kind != "hold" && b.kind != "flank") return false; // stub until siege and trade ports
	const std::string start = b.kind == "flank" ? "via" : "march";
	if (!bots.count(squad)) order.push_back(squad);
	bots[squad] = Bot{ b, start, "", -1 };
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

std::vector<Bots::Centre> Bots::centres() const {
	std::vector<Centre> out(sim->squads.size());
	for (size_t i = 0; i < out.size(); i++) out[i].team = sim->squads[i]->team;
	for (const Unit *u : sim->units) {
		if (!u->alive) continue;
		Centre &c = out[u->squad->id];
		c.x += u->x;
		c.y += u->y;
		c.alive++;
	}
	for (Centre &c : out)
		if (c.alive) c.x /= c.alive, c.y /= c.alive;
	return out;
}

std::vector<Bots::Centre> Bots::viewOf(const std::vector<Centre> &cs, int team) {
	if (team == MOB_TEAM) return cs;
	std::map<int, Seen> &mem = memo[team];
	std::set<int> seen; // looked up by key only
	for (const Unit *u : sim->units) {
		if (cs[u->squad->id].team == team) continue;
		if (!u->alive || !sim->vision.visible_to(team, u->x, u->y)) continue;
		seen.insert(u->squad->id);
	}
	std::vector<Centre> known(cs.size());
	for (size_t id = 0; id < cs.size(); id++) {
		const Centre &c = cs[id];
		known[id] = c;
		if (c.team == team || !c.alive) continue;
		if (seen.count(int(id))) {
			mem[int(id)] = { c.x, c.y, sim->tick };
			continue;
		}
		const auto m = mem.find(int(id));
		if (m != mem.end() && sim->tick - m->second.at <= MEMORY) known[id].x = m->second.x, known[id].y = m->second.y;
		else known[id].alive = 0;
	}
	// stub until works and siege ports: the buildings last seen and the engines in sight (the field behaviours read neither)
	return known;
}

void Bots::send(Bot &bot, const std::string &key, int squad, const std::string &kind, double x, double y, int target) {
	if (bot.issued == key) return;
	bot.issued = key;
	Order o;
	o.kind = kind;
	o.squad = squad;
	o.has_squad = true;
	o.x = x;
	o.y = y;
	o.target = target;
	sim->order(o);
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
		if (t.alive && js::hypot(t.x - me.x, t.y - me.y) < DISENGAGE) return;
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

void Bots::think() {
	const std::vector<Centre> all = centres();
	std::map<int, std::vector<Centre>> views; // looked up by team only
	for (const int id : order) {
		Bot &bot = bots.at(id);
		if (size_t(id) >= all.size() || !all[id].alive) continue;
		const int team = all[id].team;
		auto v = views.find(team);
		if (v == views.end()) v = views.emplace(team, viewOf(all, team)).first;
		const std::vector<Centre> &cs = v->second;
		const Centre me = cs[id];
		const Behaviour &b = bot.b;
		if (b.kind == "attackMove") attackMove(id, bot, me, cs, b.x, b.y);
		else if (b.kind == "flank") {
			if (bot.phase == "via") {
				if (js::hypot(b.via[0] - me.x, b.via[1] - me.y) > ARRIVED) send(bot, "via", id, "move", b.via[0], b.via[1], -1);
				else bot.phase = "march";
			}
			if (bot.phase != "via") attackMove(id, bot, me, cs, b.x, b.y);
		} else if (b.kind == "hold") holdAt(id, bot, me, cs, b.x, b.y, b.has_radius ? b.radius : HOLD_RADIUS);
		// stub until skills and roster ports: useActive (class spawns hold no squad active)
	}
}

} // namespace sim
