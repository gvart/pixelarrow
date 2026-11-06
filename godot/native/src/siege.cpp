#include "siege.h"

#include <algorithm>
#include <cmath>

#include <godot_cpp/variant/array.hpp>

#include "economy.h"
#include "js_math.h"
#include "sim_data.h"
#include "works.h"

namespace sim {

using godot::Dictionary;
using godot::String;

void load_siege(const Dictionary &t, SiegeTables &o) {
	const Dictionary s = t["SIEGE"];
	const godot::Array ks = s.keys();
	for (int64_t i = 0; i < ks.size(); i++) {
		const Dictionary d = s[ks[i]];
		SiegeDef def;
		def.hp = d["hp"];
		def.cost = cost_of(d["cost"]);
		def.labour = d["labour"];
		def.crew = d["crew"];
		def.speed = d["speed"];
		if (d.has("node")) def.node = String(d["node"]).utf8().get_data();
		o.SIEGE[String(ks[i]).utf8().get_data()] = def;
	}
	const Dictionary a = t["CART_ARMOR"];
	const godot::Array ak = a.keys();
	for (int64_t i = 0; i < ak.size(); i++) o.CART_ARMOR[String(ak[i]).utf8().get_data()] = a[ak[i]];
	const Dictionary ram = t["RAM"], th = t["THROWER"], la = t["LADDER"], ma = t["MANTLET"], co = t["COVERED"], ox = t["OXY"], to = t["TOWER"], no = t["NODE"];
	o.RAM = { ram["reach"], ram["ticks"], ram["dmg"], ram["stone"], ram["cover"] };
	o.THROWER = { th["min"], th["range"], th["reload"], th["deploy"], th["dmg"], th["speed"], th["acc"], th["scatter"], th["splash"], th["splashDmg"] };
	o.LADDER = { la["raise"], la["pushed"], la["fall"] };
	o.MANTLET = { ma["cover"], ma["r"], ma["side"] };
	o.COVERED = { co["cover"], co["fire"] };
	o.OXY = { ox["range"], ox["min"], ox["reload"], ox["dmg"], ox["ap"], ox["pierce"], ox["width"], ox["speed"], ox["past"] };
	o.TOWER = { to["dock"] };
	o.NODE = { no["sapper"], no["archimedes"] };
}

static const SiegeTables &T() { return data().siege; }
static const auto &FIRE() { return data().works.FIRE; }
static const auto &CART() { return data().trade.CART; }

static constexpr double DT = 0.1;
static constexpr double ENGINE_FIRE_LIFE = 90;
static constexpr double CREW_R = 2.5; // crew this near the engine count as beside it
static constexpr double ARRIVE = 0.3;
static constexpr double PI = 3.141592653589793;
static double sq(double v) { return js::pow(v, 2); } // `v ** 2`

Siege::Siege(Works &works, Mulberry &rng, SiegeHost &hooks) : works(works), rng(rng), hooks(hooks) {}

// M6b: loads a cart holds (a wagon whose crew holds Pack Mules: PACK_MULES).
double Siege::cartCap(const SiegeEngine &e) {
	const auto &L = data().trade.CART_LOADS;
	double base;
	if (e.type == "wagon" && e.crew >= 0 && hooks.crewNode(e.crew, "packMules")) base = data().trade.PACK_MULES;
	else {
		const auto it = L.find(e.type);
		base = it != L.end() ? it->second : 0;
	}
	return base + hooks.cartFx(e.owner).cartLoads;
}
int Siege::crewHere(const SiegeEngine &e) { return e.crew >= 0 ? hooks.crewNear(e.crew, e.x, e.y, e.type == "wagon" ? CART().driver : CREW_R) : 0; }
// Crew it needs (Artillerist: a stone thrower one less).
double Siege::need(const SiegeEngine &e) const { return e.def->crew - (e.type == "stoneThrower" && has(e.team, "artillerist") ? 1 : 0); }
double Siege::dmgK(const SiegeEngine &e) const { return has(e.team, "sapper") ? T().NODE.sapper : 1; }
double Siege::rangeK(const SiegeEngine &e) const { return e.tower && has(e.team, "archimedes") ? T().NODE.archimedes : 1; }
double Siege::fireK(const SiegeEngine &e) const { return e.type == "coveredRam" ? T().COVERED.fire : 1; }
bool Siege::targetOk(const SiegeEngine &e) const {
	const Building *b = works.piece(e.target);
	return !!b && b->state != "destroyed" && !b->cancelled && b->state != "foundation";
}

void Siege::damage_(SiegeEngine &e, double dmg) {
	if (!alive_(&e)) return;
	e.hp -= dmg;
	if (e.hp > 0) return;
	e.hp = 0;
	e.state = "destroyed";
	const bool burnt = e.burn > 0;
	e.burn = 0;
	e.mode = "none";
	if (e.hold) {
		hooks.wreck(e, burnt); // M6c: its cargo to a pile
		e.hold = new_hold();
	}
	if (e.type == "siegeTower" && e.ladder >= 0) works.damage(e.ladder, INFINITY); // its bridge goes with it
}

void Siege::goTo(SiegeEngine &e, double x, double y) {
	if (e.goal && std::abs((*e.goal)[0] - x) < 0.5 && std::abs((*e.goal)[1] - y) < 0.5) return;
	e.goal = std::array<double, 2>{ x, y };
	e.path.clear();
	e.pi = 0;
	e.stop.clear();
}

// Roll along the path at the crew's pace; true once at the goal.
bool Siege::roll(SiegeEngine &e, int n) {
	if (!e.goal) return true;
	if (js::hypot((*e.goal)[0] - e.x, (*e.goal)[1] - e.y) < ARRIVE) return true;
	if (e.path.empty()) {
		if (pathsLeft <= 0) return false;
		pathsLeft--;
		std::optional<std::vector<double>> cp;
		if (cart_(e)) cp = hooks.cartPath(e.team, e.x, e.y, (*e.goal)[0], (*e.goal)[1]);
		e.path = cp ? std::move(*cp) : hooks.path(e.team, e.x, e.y, (*e.goal)[0], (*e.goal)[1]);
		e.pi = 1;
	}
	// M6b: a handcart with one puller goes at half pace; a halted cart waits
	const bool lone = e.type == "handcart" && n == 1;
	if (n < need(e) && !lone) {
		if (cart_(e) && ++e.lag > CART().crewLag) e.stop = "crew";
		return false;
	}
	e.lag = 0;
	if (cart_(e) && e.halt > tickNow) e.stop = "foe";
	if (e.state == "deployed" || (cart_(e) && e.halt > tickNow)) return false;
	if (cart_(e)) e.stop.clear();
	double budget = e.def->speed * DT * (lone ? 0.5 : 1) * (cart_(e) ? 1 + hooks.cartFx(e.owner).cartSpeed : 1);
	while (budget > 0 && e.pi * 2 < int(e.path.size())) {
		const double tx = e.path[e.pi * 2], ty = e.path[e.pi * 2 + 1];
		const double dx = tx - e.x, dy = ty - e.y, d = js::hypot(dx, dy);
		if (d > 1e-6) e.facing = js::atan2(dy, dx);
		const double d1 = d != 0 && d == d ? d : 1; // `d || 1`
		const double k = cart_(e) ? hooks.cartCost(e.x, e.y, dx / d1, dy / d1).value_or(0) : 0;
		if (cart_(e) && k <= 0) { // the ground ahead is closed to carts: it stops here and says so (W-216)
			e.goal.reset();
			e.stop = "ground";
			settle(e);
			return true;
		}
		const double step = budget / (cart_(e) ? k : std::max(0.5, hooks.cost(e.x + (dx / d1) * 0.5, e.y + (dy / d1) * 0.5)));
		if (step >= d) {
			e.x = tx;
			e.y = ty;
			e.pi++;
			budget -= d;
		} else {
			e.x += (dx / d) * step;
			e.y += (dy / d) * step;
			budget = 0;
		}
	}
	e.state = "move";
	if (e.pi * 2 >= int(e.path.size())) {
		if (cart_(e) && js::hypot((*e.goal)[0] - e.x, (*e.goal)[1] - e.y) > CART().short_) e.stop = "ground"; // W-216
		e.goal.reset(); // as near as it gets
		return true;
	}
	return false;
}

void Siege::settle(SiegeEngine &e) {
	if (e.state == "move" || e.state == "attack") e.state = e.type == "stoneThrower" && e.prog >= 1 ? "deployed" : "idle";
}

void Siege::ram(SiegeEngine &e, int n, int tick) {
	const auto &RAM = T().RAM;
	if (e.cd > 0) e.cd--;
	if (works.dist2(e.target, e.x, e.y) > RAM.reach * RAM.reach) {
		if (!e.goal) {
			const std::vector<double> p = works.ring_points(e.target, 1, e.x, e.y);
			if (p.empty()) return void(e.mode = "none");
			goTo(e, p[0], p[1]);
		}
		if (roll(e, n) && works.dist2(e.target, e.x, e.y) > RAM.reach * RAM.reach) e.mode = "none"; // cannot get there
		return;
	}
	const auto [tx, ty] = works.nearest_tile(e.target, e.x, e.y);
	e.facing = js::atan2(ty - e.y, tx - e.x);
	e.goal.reset();
	if (n < need(e)) return settle(e);
	e.state = "attack";
	if (e.cd > 0) return;
	e.cd = RAM.ticks;
	e.swingAt = tick;
	works.damage(e.target, RAM.dmg * dmgK(e) * (works.piece(e.target)->def->material == "stone" ? RAM.stone : 1), e.team);
}

void Siege::thrower(SiegeEngine &e, int n, int tick) {
	const auto &TH = T().THROWER;
	if (e.cd > 0) e.cd--;
	const auto [tx, ty] = works.nearest_tile(e.target, e.x, e.y);
	const double d = js::hypot(tx - e.x, ty - e.y), range = TH.range * rangeK(e);
	if (d > range || d < TH.min) {
		if (e.tower) return void(e.mode = "none"); // on a tower: it shoots from there or not at all
		if (e.state == "deployed" || e.state == "packing") return pack(e, n);
		const double k = (range * 0.8) / (d != 0 && d == d ? d : 1);
		if (!e.goal) goTo(e, tx + (e.x - tx) * k, ty + (e.y - ty) * k);
		if (roll(e, n)) {
			const double d2 = js::hypot(tx - e.x, ty - e.y);
			if (d2 > range || d2 < TH.min) e.mode = "none";
		}
		return;
	}
	e.goal.reset();
	if (e.state != "deployed") return deploy_(e, n);
	e.facing = js::atan2(ty - e.y, tx - e.x);
	if (n < need(e) || e.cd > 0) return;
	e.cd = TH.reload;
	e.swingAt = tick;
	const bool hit = rng.next() < TH.acc * (1 - 0.4 * (d / range));
	double lx = tx, ly = ty;
	if (!hit) {
		const double a = 0 + (PI * 2 - 0) * rng.next(), r = 1 + (TH.scatter - 1) * rng.next();
		lx += js::cos(a) * r, ly += js::sin(a) * r;
	}
	const double at = tick + std::max(1.0, js::round(d / TH.speed / DT));
	boulders.push_back(Boulder{ at, lx, ly, e.target, hit, TH.dmg * dmgK(e) });
	shots_.push_back(SiegeShot{ e.x, e.y, lx, ly, double(tick), at, 0, 0, -1 - e.id, "stone", e.id });
}

void Siege::deploy_(SiegeEngine &e, int n) {
	if (e.state == "deployed") return;
	e.state = "deploying";
	if (n >= need(e)) e.prog = std::min(1.0, e.prog + 1 / T().THROWER.deploy);
	if (e.prog >= 1) e.state = "deployed";
}
// Packs up; idle once packed.
void Siege::pack(SiegeEngine &e, int n) {
	if (e.state != "deployed" && e.state != "packing") return;
	e.state = "packing";
	if (n >= need(e)) e.prog = std::max(0.0, e.prog - 1 / T().THROWER.deploy);
	if (e.prog <= 0) e.state = "idle";
}

void Siege::ladder(SiegeEngine &e, int n) {
	const int wx = (*e.wall)[0], wy = (*e.wall)[1];
	const int foot = works.ladder_foot(e.team, wx, wy);
	if (foot < 0) return void(e.mode = "none");
	const int W = works.influence().w;
	const double fx = (foot % W) + 0.5, fy = std::floor(double(foot) / W) + 0.5;
	goTo(e, fx, fy);
	if (!roll(e, n)) return;
	if (js::hypot(fx - e.x, fy - e.y) > 0.8) return void(e.mode = "none");
	e.facing = js::atan2(wy + 0.5 - e.y, wx + 0.5 - e.x);
	e.state = "raising";
	if (n < need(e)) return;
	const bool tower = e.type == "siegeTower";
	e.prog = std::min(1.0, e.prog + 1 / (tower ? T().TOWER.dock : T().LADDER.raise));
	if (e.prog < 1) return;
	const int id = works.raise_ladder(e.team, wx, wy, e.id, tower ? "towerBridge" : "ladder");
	if (id < 0) return (void)((e.mode = "none"), (e.state = "idle"), (e.prog = 0));
	e.ladder = id;
	e.target = works.piece(id)->attach;
	e.state = "raised";
	e.mode = "none";
	e.x = fx;
	e.y = fy;
	e.crew = -1; // the crew is free to climb
}

// M5h3 oxybeles: standing and crewed, a bolt at the nearest foe man in sight in range.
void Siege::bolt(SiegeEngine &e, int n, int tick) {
	const auto &OXY = T().OXY;
	if (e.cd > 0) e.cd--;
	if (n < need(e) || e.cd > 0) return;
	const double range = OXY.range * rangeK(e);
	const auto f = hooks.foe(e.team, e.x, e.y, range);
	if (!f) return;
	const double dx = (*f)[0] - e.x, dy = (*f)[1] - e.y, d = js::hypot(dx, dy);
	if (d < OXY.min) return;
	const double reach = std::min(range, d + OXY.past);
	const double x1 = e.x + (dx / d) * reach, y1 = e.y + (dy / d) * reach;
	e.facing = js::atan2(dy, dx);
	e.cd = OXY.reload;
	e.swingAt = tick;
	const double at = tick + std::max(1.0, js::round(d / OXY.speed / DT));
	bolts.push_back(Bolt{ at, e.team, e.x, e.y, x1, y1, OXY.dmg * dmgK(e) });
	shots_.push_back(SiegeShot{ e.x, e.y, x1, y1, double(tick), at, 0, 0, -1 - e.id, "bolt", e.id });
}

int Siege::build(int team, const std::string &type, double x, double y) {
	const SiegeDef &def = T().SIEGE.at(type);
	if (!def.node.empty() && !has(team, def.node)) return -1; // M5h3: no engineer with the design
	const bool tower = (type == "oxybeles" || type == "stoneThrower") && has(team, "archimedes") && hooks.stoneTower(team, x, y);
	if ((!tower && !hooks.open(x, y)) || !works.take_at(team, x, y, def.cost)) return -1;
	SiegeEngine e;
	e.id = int(engines.size());
	e.type = type;
	e.def = &def;
	e.team = team;
	e.x = x;
	e.y = y;
	e.hp = def.hp * 0.1;
	e.maxHp = def.hp;
	e.state = "building";
	e.mode = "none";
	e.tower = tower;
	engines.push_back(std::move(e));
	if (type == "mantlet") mantlets++;
	return int(engines.size()) - 1;
}

int Siege::cart(int team, const std::string &owner, const std::string &type, double x, double y) {
	const SiegeDef &def = T().SIEGE.at(type);
	const double hp = def.hp * (1 + hooks.cartFx(owner).cartHp);
	SiegeEngine e;
	e.id = int(engines.size());
	e.type = type;
	e.def = &def;
	e.team = team;
	e.x = x;
	e.y = y;
	e.hp = hp;
	e.maxHp = hp;
	e.state = "idle";
	e.labour = def.labour;
	e.mode = "none";
	e.owner = owner;
	e.hold = new_hold();
	engines.push_back(std::move(e));
	return int(engines.size()) - 1;
}

int Siege::carts(const std::optional<std::string> &owner, std::optional<int> team) const {
	int n = 0;
	for (const SiegeEngine &e : engines)
		if (cart_(e) && alive_(&e) && (!owner || e.owner == *owner) && (!team || e.team == *team)) n++;
	return n;
}

// dt worker-seconds of labour on engine id; false when it is not being built (done or gone).
bool Siege::labour(int id, double dt) {
	SiegeEngine *e = id >= 0 && id < int(engines.size()) ? &engines[id] : nullptr;
	if (!alive_(e) || e->state != "building") return false;
	e->labour = std::min(e->def->labour, e->labour + dt);
	e->hp = e->maxHp * std::max(0.1, e->labour / e->def->labour);
	if (e->labour >= e->def->labour) e->state = "idle";
	return true;
}

std::optional<std::pair<std::string, Hold>> Siege::stow(int id) {
	SiegeEngine *e = id >= 0 && id < int(engines.size()) ? &engines[id] : nullptr;
	if (!alive_(e) || !cart_(*e)) return std::nullopt;
	Hold hold = e->hold ? *e->hold : new_hold();
	e->hold = new_hold();
	e->state = "destroyed";
	e->stowed = true; // W-217: no wreck stands where it was: it went with him
	e->hp = 0;
	e->mode = "none";
	e->crew = -1;
	return std::make_pair(e->type, std::move(hold));
}

std::vector<Hold *> Siege::cart_holds(const std::string &owner) {
	std::vector<Hold *> out;
	for (SiegeEngine &e : engines)
		if (alive_(&e) && cart_(e) && e.owner == owner && e.hold) out.push_back(&*e.hold);
	return out;
}

void Siege::set_owner(int id, int team, const std::string &owner) {
	SiegeEngine *e = id >= 0 && id < int(engines.size()) ? &engines[id] : nullptr;
	if (!alive_(e) || !cart_(*e)) return;
	e->team = team;
	e->owner = owner;
	e->crew = -1;
	e->mode = "none";
	e->cap = 0;
	e->capT = -1;
	e->capO.clear();
}

// Squad `crew` takes the engine (of its team, built, not raised); false if it cannot.
bool Siege::crew(int id, int crew, int team) {
	SiegeEngine *e = id >= 0 && id < int(engines.size()) ? &engines[id] : nullptr;
	if (!built_(e) || e->team != team || e->state == "raised") return false;
	e->crew = crew;
	return true;
}

void Siege::uncrew(int id) {
	if (id < 0 || id >= int(engines.size())) return;
	SiegeEngine &e = engines[id];
	e.crew = -1;
	e.mode = "none";
	e.goal.reset();
	e.stop.clear();
	settle(e);
}

void Siege::move(int id, double x, double y) {
	SiegeEngine *e = id >= 0 && id < int(engines.size()) ? &engines[id] : nullptr;
	if (!built_(e) || e->state == "raised" || e->tower) return;
	e->mode = "move";
	goTo(*e, x, y);
}

void Siege::hold(int id) {
	SiegeEngine *e = id >= 0 && id < int(engines.size()) ? &engines[id] : nullptr;
	if (!built_(e)) return;
	e->mode = "none";
	e->goal.reset();
	e->stop.clear();
	settle(*e);
}

bool Siege::attack(int id, int building) {
	SiegeEngine *e = id >= 0 && id < int(engines.size()) ? &engines[id] : nullptr;
	if (!built_(e) || (!isRam(*e) && e->type != "stoneThrower") || !works.piece(building) || works.piece(building)->team == e->team) return false;
	e->mode = "attack";
	e->target = building;
	e->goal.reset();
	return true;
}

void Siege::deploy(int id, bool packUp) {
	SiegeEngine *e = id >= 0 && id < int(engines.size()) ? &engines[id] : nullptr;
	if (!built_(e) || e->type != "stoneThrower") return;
	e->mode = packUp ? "pack" : "deploy";
	e->goal.reset();
}

bool Siege::raise(int id, double x, double y) {
	SiegeEngine *e = id >= 0 && id < int(engines.size()) ? &engines[id] : nullptr;
	if (!built_(e) || (e->type != "siegeLadder" && e->type != "siegeTower") || e->state == "raised" || works.ladder_foot(e->team, int(std::floor(x)), int(std::floor(y))) < 0) return false;
	e->mode = "raise";
	e->wall = std::array<int, 2>{ int(std::floor(x)), int(std::floor(y)) };
	e->prog = 0;
	return true;
}

// True while the engine has work (crew should stay with it, not fight).
bool Siege::busy(int id) {
	const SiegeEngine *e = get(id);
	if (built_(e) && cart_(*e) && e->halt > tickNow) return false; // W-218: a halted cart's crew fights
	return built_(e) && (e->mode != "none" || (e->type == "oxybeles" && e->crew >= 0)); // an oxybeles' crew serves it
}

bool Siege::kindle(int id, double dt) {
	SiegeEngine *e = id >= 0 && id < int(engines.size()) ? &engines[id] : nullptr;
	if (!alive_(e)) return false;
	if (e->burn > 0) return true;
	e->kindle += dt * fireK(*e);
	if (e->kindle >= FIRE().kindle) e->burn = FIRE().start;
	return true;
}

// M5h3: share of missiles a crew man at (x,y) within r of engine id dodges under its roof (ram, covered ram), 0 else.
double Siege::roof(int id, double x, double y, double r) const {
	const SiegeEngine *e = get(id);
	if (!alive_(e) || !isRam(*e) || sq(e->x - x) + sq(e->y - y) > r * r) return 0;
	return e->type == "coveredRam" ? T().COVERED.cover : T().RAM.cover;
}

// M5h3: share of a missile from (sx,sy) a man of `team` at (x,y) dodges behind a mantlet of his team (0 none).
double Siege::cover(int team, double x, double y, double sx, double sy) const {
	if (!mantlets) return 0;
	const auto &M = T().MANTLET;
	for (const SiegeEngine &e : engines) {
		if (e.type != "mantlet" || e.team != team || !built_(&e)) continue;
		const double c = js::cos(e.facing), sn = js::sin(e.facing);
		const double rx = x - e.x, ry = y - e.y, along = rx * c + ry * sn, perp = std::abs(ry * c - rx * sn);
		if (along > 0.5 || along < -M.r || perp > M.side) continue;
		if ((sx - e.x) * c + (sy - e.y) * sn > 0) return M.cover;
	}
	return 0;
}

bool Siege::douse(int id, double dt) {
	SiegeEngine *e = id >= 0 && id < int(engines.size()) ? &engines[id] : nullptr;
	if (!alive_(e) || e->burn <= 0) return false;
	e->burn = std::max(0.0, e->burn - FIRE().douse * dt);
	if (e->burn <= 0) e->kindle = 0;
	return true;
}

// Crew standing points (flat x,y) for n men: two files along its sides, back to front.
std::vector<double> Siege::crew_points(int id, int n) {
	const SiegeEngine &e = engines[id];
	const double c = js::cos(e.facing), s = js::sin(e.facing);
	std::vector<double> out;
	for (int k = 0; k < n; k++) {
		const double side = k % 2 ? 1 : -1, row = std::floor(k / 2.0);
		// a mantlet's men stand behind it, in its cover
		const double along = e.type == "mantlet" ? -0.7 - row * 0.8 : 0.9 - row * 0.9, perp = side * (e.type == "siegeLadder" || e.type == "mantlet" ? 0.55 : 0.8);
		const double x = e.x + c * along - s * perp, y = e.y + s * along + c * perp;
		// a point over a cliff from the engine is no place beside it: its crew would walk the long way round to get there
		if (hooks.open(x, y) && hooks.walkable(e.x, e.y, x, y)) out.push_back(x), out.push_back(y);
		else out.push_back(e.x), out.push_back(e.y);
	}
	return out;
}

// Per tick, after the units moved.
void Siege::tick(int tick) {
	pathsLeft = 2;
	tickNow = tick;
	for (size_t i = 0; i < engines.size(); i++) {
		SiegeEngine &e = engines[i];
		if (!alive_(&e)) continue;
		if (cart_(e) && tick % 5 == 0) {
			// M6b: halt while a foe is near; taken by a foe beside it with none of its team near
			if (hooks.foeNear(e.team, e.x, e.y, CART().halt) || (e.crew >= 0 && hooks.crewHit(e.crew))) e.halt = tick + CART().resume; // W-218: bitten, they stop and fight
			const auto by = hooks.taker(e);
			if (by && by->first == e.capT && by->second == e.capO) e.cap += 5;
			else (e.cap = by ? 5 : 0), (e.capT = by ? by->first : -1), (e.capO = by ? by->second : "");
			if (by && e.cap >= CART().capture) {
				e.team = by->first;
				e.owner = by->second;
				if (e.hold)
					for (Lot &l : e.hold->lots)
						if (is_tithe(l)) l = Lot{ l.r, l.n, l.o, std::nullopt }; // W-153: seized, tribute is plain loot
				e.crew = -1;
				e.mode = "none";
				e.goal.reset();
				e.cap = 0;
				e.capT = -1;
				e.halt = 0;
				hooks.captured(e, by->second);
			}
		}
		if (e.burn > 0) {
			e.burn = std::min(1.0, e.burn + FIRE().grow * DT);
			damage_(e, (e.burn * e.maxHp * DT * fireK(e)) / ENGINE_FIRE_LIFE);
			if (!alive_(&e)) continue;
		}
		if (e.state == "building") continue;
		if (e.state == "raised") {
			const Building *l = works.piece(e.ladder);
			if (!l || l->state == "destroyed") {
				// pushed off: it lies at the foot, damaged
				e.ladder = -1;
				e.state = "idle";
				e.prog = 0;
				if (e.type != "siegeTower") damage_(e, e.maxHp * T().LADDER.pushed); // a tower whose bridge burnt stands on
			}
			continue;
		}
		const int n = crewHere(e);
		if (e.mode == "attack" && !targetOk(e)) e.mode = "none";
		if (e.mode == "none") {
			settle(e);
			if (e.type == "oxybeles") bolt(e, n, tick);
		} else if (e.mode == "move") {
			if (e.state == "deployed" || e.state == "packing") pack(e, n);
			else if (roll(e, n)) (e.mode = "none"), settle(e);
		} else if (e.mode == "attack") isRam(e) ? ram(e, n, tick) : thrower(e, n, tick);
		else if (e.mode == "raise") ladder(e, n);
		else if (e.mode == "deploy") {
			deploy_(e, n);
			if (e.state == "deployed") e.mode = "none";
		} else if (e.mode == "pack") {
			pack(e, n);
			if (e.state == "idle") e.mode = "none";
		}
	}
	for (int i = int(boulders.size()) - 1; i >= 0; i--) {
		const Boulder b = boulders[i];
		if (b.at > tick) continue;
		boulders.erase(boulders.begin() + i);
		if (b.hit) works.damage(b.target, b.dmg);
		hooks.splash(b.x, b.y, T().THROWER.splash, T().THROWER.splashDmg, 0.5);
	}
	for (int i = int(bolts.size()) - 1; i >= 0; i--) {
		const Bolt b = bolts[i];
		if (b.at > tick) continue;
		bolts.erase(bolts.begin() + i);
		hooks.pierce(b.team, b.x0, b.y0, b.x1, b.y1, T().OXY.width, b.dmg, T().OXY.ap, T().OXY.pierce);
	}
	if (!shots_.empty()) {
		std::vector<SiegeShot> keep;
		for (const SiegeShot &sh : shots_)
			if (sh.t1 > tick) keep.push_back(sh);
		shots_ = std::move(keep);
	}
}

std::vector<SiegeSnap> Siege::snaps(int tick) {
	std::vector<SiegeSnap> out;
	for (const SiegeEngine &e : engines) {
		if (e.stowed) continue;
		SiegeSnap s;
		s.id = e.id;
		s.type = e.type;
		s.team = e.team;
		s.x = e.x;
		s.y = e.y;
		s.facing = e.facing;
		s.hp = e.hp;
		s.maxHp = e.maxHp;
		s.state = e.state;
		s.progress = e.state == "building" ? e.labour / e.def->labour : e.state == "raising" || e.state == "deploying" || e.state == "packing" ? e.prog : e.state == "deployed" ? 1 : 0;
		s.crew = e.crew;
		s.crewNeed = need(e);
		s.crewHere = alive_(&e) ? crewHere(e) : 0;
		if (e.swingAt >= 0) s.reload = e.cd, s.swing = tick - 1 - e.swingAt;
		if (e.target >= 0 && (e.mode == "attack" || e.state == "raised")) s.target = e.target;
		if (e.burn > 0) s.burning = e.burn;
		if (e.ladder >= 0) s.ladder = e.ladder;
		if (!e.stop.empty()) s.stopped = e.stop;
		if (e.hold) {
			s.cart = true;
			s.owner = e.owner;
			totals(*e.hold, s.cargo);
			s.items = int(e.hold->items.size());
			if (!e.hold->items.empty()) s.list = item_list(*e.hold);
			s.loads = loads(*e.hold);
			s.cap = cartCap(e);
			s.halted = e.halt > tick;
			if (e.cap > 0) s.capture = std::min(1.0, e.cap / CART().capture);
		}
		out.push_back(std::move(s));
	}
	return out;
}

} // namespace sim
