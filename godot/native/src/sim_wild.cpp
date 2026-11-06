// The region's wild wired into the live war sim (src/war/sim/index.ts: createMobs, createSecrets, createBosses,
// createRoam, createTowns, createLandmarks and createSouls with their hosts; spawnWild, knock, the mob claim, and the
// api's spawnMobs, spawnRoam, spawnSoul and hurtBoss), line for line.
#include <algorithm>
#include <cmath>
#include <set>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/string.hpp>

#include "js_math.h"
#include "sim.h"
#include "sim_data.h"
#include "sim_wild.h"

namespace sim {

namespace {

constexpr double INF = std::numeric_limits<double>::infinity();
constexpr int SQUAD_MAX = 12; // soldiers.ts SQUAD_MAX
// stub until the paths port: NO_PATH's limits, the most any path has (start.ts PATHS: cap 12, workers 6)
constexpr int NO_PATH_CAP = 12, NO_PATH_WORKERS = 6;

double sq(double v) { return v * v; }
double dist2(const Squad &a, double bx, double by) { return sq(a.cx - bx) + sq(a.cy - by); }
std::string s8(const godot::Variant &v) { return godot::String(v).utf8().get_data(); }
std::optional<double> opt_d(const godot::Dictionary &d, const char *k) {
	return d.has(k) && d[k].get_type() != godot::Variant::NIL ? std::optional<double>(double(d[k])) : std::nullopt;
}
std::optional<std::string> opt_s(const godot::Dictionary &d, const char *k) {
	return d.has(k) && d[k].get_type() != godot::Variant::NIL ? std::optional<std::string>(s8(d[k])) : std::nullopt;
}
std::pair<double, double> pt(const godot::Variant &v) {
	const godot::Array a = v;
	return { double(a[0]), double(a[1]) };
}
std::vector<std::pair<double, double>> pts(const godot::Dictionary &d, const char *k) {
	std::vector<std::pair<double, double>> out;
	if (!d.has(k)) return out;
	const godot::Array a = d[k];
	for (int64_t i = 0; i < a.size(); i++) out.push_back(pt(a[i]));
	return out;
}

DepthRegion depth_region(const godot::Dictionary &meta) {
	DepthRegion d;
	d.id = s8(meta["id"]);
	d.has_depth = meta.has("depth") && meta["depth"].get_type() != godot::Variant::NIL;
	if (d.has_depth) d.depth = meta["depth"];
	return d;
}

std::vector<LairEntry> lairs_of(const godot::Dictionary &meta) {
	std::vector<LairEntry> out;
	const godot::Array lairs = meta.get("lairs", godot::Array());
	for (int64_t i = 0; i < lairs.size(); i++) {
		const godot::Dictionary d = lairs[i];
		LairEntry e;
		e.kind = s8(d["kind"]);
		e.x = d["x"];
		e.y = d["y"];
		e.count = opt_d(d, "count");
		e.captain = d.get("captain", false);
		e.chief = opt_s(d, "chief");
		out.push_back(e);
	}
	return out;
}

std::vector<ClaimEntry> claims_of(const godot::Dictionary &meta) {
	std::vector<ClaimEntry> out;
	const godot::Array cps = meta.get("claimPoints", godot::Array());
	for (int64_t i = 0; i < cps.size(); i++) {
		const godot::Dictionary d = cps[i];
		ClaimEntry c;
		c.x = d["x"];
		c.y = d["y"];
		const godot::Array l = d.get("lairs", godot::Array());
		for (int64_t k = 0; k < l.size(); k++) c.lairs.push_back(int(l[k]));
		c.r = opt_d(d, "r");
		out.push_back(c);
	}
	return out;
}

BossRegion boss_region_of(const godot::Dictionary &meta) {
	BossRegion r;
	r.depth = depth_region(meta);
	r.rim = meta.has("rim") && meta["rim"].get_type() != godot::Variant::NIL ? s8(meta["rim"]) : "";
	const godot::Array gs = meta.get("guardians", godot::Array());
	for (int64_t i = 0; i < gs.size(); i++) {
		const godot::Dictionary d = gs[i];
		GuardianEntry e;
		e.boss = s8(d["boss"]);
		e.x = d["x"];
		e.y = d["y"];
		e.perches = pts(d, "perches");
		e.heads = pts(d, "heads");
		if (d.has("postern")) e.postern = pt(d["postern"]);
		if (d.has("pit")) e.pit = pt(d["pit"]);
		if (d.has("flats")) e.flats = pt(d["flats"]);
		r.guardians.push_back(e);
	}
	return r;
}

RoamRegion roam_region_of(const godot::Dictionary &meta) {
	RoamRegion r;
	r.depth = depth_region(meta);
	const godot::Array es = meta.get("entries", godot::Array());
	for (int64_t i = 0; i < es.size(); i++) {
		const godot::Dictionary e = es[i];
		r.entries.push_back({ s8(e["side"]), e["x"], e["y"], e["w"], e["h"] });
	}
	r.lairs = lairs_of(meta);
	r.claimPoints = claims_of(meta);
	const godot::Variant sv = meta.get("safe", godot::Variant());
	if (sv.get_type() == godot::Variant::ARRAY) {
		const godot::Array safe = sv;
		for (int64_t i = 0; i < safe.size(); i++) {
			const godot::Dictionary s = safe[i];
			r.safe.push_back({ s["x"], s["y"], s["w"], s["h"] });
		}
	}
	const godot::Array pre = meta.get("prebuilt", godot::Array());
	for (int64_t i = 0; i < pre.size(); i++) {
		const godot::Dictionary b = pre[i];
		RoamPrebuilt e;
		e.x = b["x"];
		e.y = b["y"];
		const std::optional<double> cl = opt_d(b, "claim");
		if (cl) e.claim = int(*cl);
		e.landmark = b.get("landmark", false);
		r.prebuilt.push_back(e);
	}
	return r;
}

// src/data/names.ts freeName
const std::vector<std::string> SUFFIX{ "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X" };
std::string free_name(const std::string &culture, int start, const std::set<std::string> &taken) {
	const auto it = data().names.find(culture);
	if (it == data().names.end() || it->second.empty()) return "";
	const std::vector<std::string> &list = it->second;
	const int n = int(list.size());
	std::vector<std::string> sfx{ "" };
	sfx.insert(sfx.end(), SUFFIX.begin(), SUFFIX.end());
	for (const std::string &suffix : sfx)
		for (int k = 0; k < n; k++) {
			const std::string name = list[size_t((start + k) % n)] + (suffix.empty() ? "" : " " + suffix);
			if (!taken.count(name)) return name;
		}
	return list[size_t(start % n)] + " " + std::to_string(taken.size() + 1);
}

// (seed >>> 0).toString(36)
std::string base36(uint32_t v) {
	if (v == 0) return "0";
	std::string s;
	while (v) {
		const int d = int(v % 36);
		s.insert(s.begin(), char(d < 10 ? '0' + d : 'a' + d - 10));
		v /= 36;
	}
	return s;
}

} // namespace

// --- the mob controller's host ---

void SimMobHost::flush() {
	for (size_t i = 0; i < mirror.size() && i < s->squads.size(); i++) {
		Squad &q = *s->squads[i];
		const MobSquad &m = mirror[i];
		for (size_t k = 0; k < m.units.size() && k < q.units.size(); k++)
			if (m.units[k].hp != hp0[i][k]) q.units[k]->hp = m.units[k].hp, hp0[i][k] = m.units[k].hp;
	}
}

std::vector<MobSquad> &SimMobHost::squads() {
	if (!dirty) return mirror;
	flush();
	dirty = false;
	if (mirror.capacity() < s->squads.size()) mirror.reserve(s->squads.size() + 256); // grows only here
	mirror.resize(s->squads.size());
	hp0.resize(s->squads.size());
	for (size_t i = 0; i < s->squads.size(); i++) {
		const Squad &q = *s->squads[i];
		MobSquad &m = mirror[i];
		m.id = q.id;
		m.owner = q.owner;
		m.team = q.team;
		m.alive = q.alive;
		m.civ = q.civ;
		m.cx = q.cx;
		m.cy = q.cy;
		m.order = q.order;
		m.target = q.target;
		m.claimPt = q.claimPt;
		m.units.resize(q.units.size());
		hp0[i].resize(q.units.size());
		for (size_t k = 0; k < q.units.size(); k++) {
			const Unit &u = *q.units[k];
			m.units[k] = { u.id, u.x, u.y, u.hp, u.maxHp, u.alive };
			hp0[i][k] = u.hp;
		}
	}
	return mirror;
}

int SimMobHost::spawn(const std::string &kind, double count, double x, double y, const SpawnScale &k) {
	flush();
	dirty = true;
	return s->spawnWild(data().mobs.MOB_OWNER, kind, count, x, y, k);
}

static Order order_of(const std::string &kind, int squad) {
	Order o;
	o.kind = kind;
	o.squad = squad;
	o.has_squad = true;
	return o;
}

void SimMobHost::order(const MobOrder &m) {
	flush();
	dirty = true;
	Order o = order_of(m.kind, m.squad);
	o.x = m.x;
	o.y = m.y;
	o.target = m.target;
	o.shape = m.shape;
	if (m.kind == "attackBuilding" && m.siege >= 0) o.siege = m.siege;
	s->apply(o);
}

bool SimMobHost::arrived(int id) { return !s->squads[id]->goal && s->squads[id]->pi >= double(s->squads[id]->path.size()) / 2; }

std::vector<MobNode> SimMobHost::nodes() {
	std::vector<MobNode> out;
	for (const NodeSnap &n : s->works->resource_nodes()) out.push_back({ n.id, n.x, n.y, n.obj.has_value() });
	return out;
}

void SimMobHost::lock_nodes(const std::vector<int> &ids, bool on) { s->works->lock_nodes(ids, on); }

void SimMobHost::claim(int team, double x, double y, double r, std::optional<int> from) {
	flush();
	dirty = true;
	s->mobClaim(team, x, y, r, from);
}

bool SimMobHost::influenced(double x, double y) { return s->works->influence().mask[s->grid->tile_at(x, y)] != 0; }

double SimMobHost::range(double lo, double hi) { return lo + (hi - lo) * s->rng.next(); }

void SimMobHost::held(bool on) { s->works->set_fallback(on ? MOB_TEAM : NEUTRAL_TEAM); }

std::vector<MobTower> SimMobHost::towers() {
	std::vector<MobTower> out;
	for (const Building *b : s->works->prebuilt())
		if (b->def->wall == "tower" && (b->team == MOB_TEAM || b->team == NEUTRAL_TEAM) && (b->state == "done" || b->state == "damaged")) out.push_back({ b->id, b->x, b->y });
	return out;
}

std::vector<MobCart> SimMobHost::carts() {
	std::vector<MobCart> out;
	for (const SiegeSnap &e : s->siege->snaps(s->tick))
		if (is_cart_type(e.type) && e.state != "destroyed" && e.team != MOB_TEAM) out.push_back({ e.id, e.x, e.y, e.team });
	return out;
}

// world-fill: a chief's loot falls where he did (src/data/warBosses.ts chiefLoot); stub until the chief loot port (CHIEF_KINDS'
// loot is not in the C++ tables): no pile, and the event log is not ported
void SimMobHost::chief_down(int, const WarChief &, double, double, int) {}

// A wild squad of `owner` (lairs: MOB_OWNER; W-72 warlords: theirs) on MOB_TEAM, scaled as a lair's.
int Sim::spawnWild(const std::string &owner, const std::string &kind, double count, double x, double y, const SpawnScale &k) {
	const int id = spawn_squad(owner, MOB_TEAM, mob_class(kind), int(count), x, y);
	// M7c: depth and the host's elite guard over the kind's stats; a captain leads (the first man)
	if (id >= 0 && size_t(id) < squads.size()) {
		const std::vector<Unit *> &us = squads[id]->units;
		for (size_t i = 0; i < us.size(); i++) {
			Unit &u = *us[i];
			const double hp = k.hp * (i == 0 && k.has_lead ? k.lead.hp : 1), dmg = k.dmg * (i == 0 && k.has_lead ? k.lead.dmg : 1);
			const double armor = i == 0 ? (k.has_lead ? k.lead.armor.value_or(0) : 0) : 0;
			if (hp == 1 && dmg == 1 && !armor) continue;
			u.st.maxHp = u.st.maxHp * hp;
			u.st.dmg = u.st.dmg * dmg;
			u.st.rangedDmg = u.st.rangedDmg * dmg;
			u.st.armor = u.st.armor + armor;
			u.maxHp = u.hp = u.st.maxHp;
		}
	}
	// W-65: a bandit captain (a host's or a story's named foe) wears the captain's sheet; his stats stay as set above
	if (k.has_lead && kind == "bandit" && id >= 0 && size_t(id) < squads.size() && !squads[id]->units.empty()) squads[id]->units[0]->cls = "mob_bandit_captain";
	return id;
}

// The mobs' claim: works.claim, the capture of a held point, and the objective of the squad that channelled it.
void Sim::mobClaim(int team, double x, double y, double r, std::optional<int> from) {
	works->claim(team, x, y, r, from.has_value());
	if (from) capture(*from, team, x, y, r);
	// M5d: the squad that channelled it (the nearest of the team on a claim order) has an objective
	Squad *best = nullptr;
	for (Squad *q : squads)
		if (q->team == team && q->claimPt >= 0 && q->alive > 0 && (!best || dist2(*q, x, y) < dist2(*best, x, y))) best = q;
	if (best) objective(*best, "claim");
}

// --- the guardians' host ---

const std::vector<Unit *> &SimBossHost::units() { return s->units; }
const std::vector<Squad *> &SimBossHost::squads() { return s->squads; }

int SimBossHost::spawn(const std::string &cls, int count, double x, double y, const StPatch &st, int boss) {
	const int id = s->spawn_squad(data().mobs.MOB_OWNER, MOB_TEAM, "mob_bear", count, x, y);
	if (id < 0 || size_t(id) >= s->squads.size()) return id;
	for (Unit *u : s->squads[id]->units) {
		u->cls = cls;
		st.apply(u->st);
		u->maxHp = u->hp = u->st.maxHp;
		u->boss = boss;
		u->beast = false;
	}
	s->squads[id]->speed = s->squads[id]->units[0]->st.speed;
	return id;
}

void SimBossHost::order(const Order &o) { s->apply(o); }

void SimBossHost::hurt(Unit &t, double dmg, bool venom) {
	if (venom && t.squad->theriacUntil <= s->tick) t.venomUntil = s->tick + data().civilians.VENOM.ticks;
	s->hurt(t, dmg);
}

void SimBossHost::knock(Unit &u, double fx, double fy, double tiles) { s->knock(u, fx, fy, tiles); }

void SimBossHost::slow(Unit &u, double ticks) { u.slowUntil = std::max(u.slowUntil, s->tick + ticks); }

void SimBossHost::place(Unit &t, double x, double y) {
	t.x = t.ox = x;
	t.y = t.oy = y;
}

void SimBossHost::vanish(Unit &t) {
	if (!t.alive) return;
	t.alive = false;
	t.hp = 0;
	t.reported = true;
	t.tgt = nullptr;
	t.squad->alive--;
	s->addReslot(*t.squad);
}

void SimBossHost::burn(double x, double y, double r) {
	for (int b : s->works->near(x, y, r)) s->works->fire_hit(b, 1);
}

void SimBossHost::smash(double x, double y, double r, double dmg, const std::string &what) {
	for (int id : s->works->near(x, y, r)) {
		const Building *b = s->works->piece(id);
		if (!b || b->state == "destroyed" || (what == "wood" && b->def->material != "wood") || (what == "gate" && b->def->wall != "gate")) continue;
		s->works->damage(id, dmg, MOB_TEAM);
	}
}

int SimBossHost::water(double x, double y) {
	const Grid &g = *s->grid;
	return x < 0 || y < 0 || x >= g.w || y >= g.h ? 0 : s->region.water[size_t(g.tile_at(x, y))];
}

bool SimBossHost::open(double x, double y) {
	const Grid &g = *s->grid;
	return x >= 0 && y >= 0 && x < g.w && y < g.h && double(g.cost[size_t(g.tile_at(x, y))]) > 0;
}

double SimBossHost::level(double x, double y) {
	const Grid &g = *s->grid;
	return g.height[size_t(g.tile_at(std::min(double(g.w - 1), std::max(0.0, x)), std::min(double(g.h - 1), std::max(0.0, y))))];
}

bool SimBossHost::claimed() { return s->mobs->claimed(); }

void SimBossHost::gate(const std::string &id, bool alive) {
	s->mobHost->dirty = true;
	if (alive) s->mobs->set_boss(id);
	else s->mobs->boss_down(id);
	s->mobHost->flush();
}

void SimBossHost::reset_landmark() {
	s->works->reset_landmark();
	s->landmarks->reset();
}

// the event log is not ported; a slain guardian is kept for the slayers' deeds at the next report (TS note)
void SimBossHost::note(const BossNote &e) {
	if (e.kind == "bossSlain") s->slain.push_back(e.boss);
}

double SimBossHost::range(double lo, double hi) { return lo + (hi - lo) * s->rng.next(); }

// M7d: knocked from (fx, fy) `tiles` tiles back, in three steps that stop at what blocks.
void Sim::knock(Unit &t, double fx, double fy, double tiles) {
	const double d0 = js::hypot(t.x - fx, t.y - fy), d = d0 != 0 && !std::isnan(d0) ? d0 : 1, k = tiles / 3;
	grid->team = t.squad->team;
	for (int i = 0; i < 3; i++) {
		const double kx = ((t.x - fx) / d) * k;
		tryMove(t, kx != 0 && !std::isnan(kx) ? kx : k, ((t.y - fy) / d) * k);
	}
	t.settled = false;
}

// --- roaming life's host ---

void SimRoamHost::flush() {
	for (size_t i = 0; i < mirror.size() && i < s->squads.size(); i++)
		if (mirror[i].angry != angry0[i]) s->squads[i]->angry = mirror[i].angry, angry0[i] = mirror[i].angry;
}

std::vector<RoamSquad> &SimRoamHost::squads() {
	if (!dirty) return mirror;
	flush();
	dirty = false;
	if (mirror.capacity() < s->squads.size()) mirror.reserve(s->squads.size() + 256); // grows only here
	mirror.resize(s->squads.size());
	angry0.resize(s->squads.size());
	for (size_t i = 0; i < s->squads.size(); i++) {
		const Squad &q = *s->squads[i];
		RoamSquad &m = mirror[i];
		m.id = q.id;
		m.owner = q.owner;
		m.team = q.team;
		m.alive = q.alive;
		m.cx = q.cx;
		m.cy = q.cy;
		m.order = q.order;
		m.target = q.target;
		m.civ = q.civ;
		m.flee = q.flee;
		m.meek = q.meek;
		m.angry = angry0[i] = q.angry;
		m.units.resize(q.units.size());
		for (size_t k = 0; k < q.units.size(); k++) {
			const Unit &u = *q.units[k];
			m.units[k] = { u.x, u.y, u.hp, u.maxHp, u.alive };
		}
	}
	return mirror;
}

int SimRoamHost::spawn(int team, const std::string &owner, const std::string &cls, double count, double x, double y, const RoamScale &k) {
	flush();
	dirty = true;
	const int id = s->spawn_squad(owner, team, cls, int(count), x, y);
	if (id >= 0 && (k.hp != 1 || k.dmg != 1))
		for (Unit *u : s->squads[id]->units) {
			u->st.maxHp = u->st.maxHp * k.hp;
			u->st.dmg = u->st.dmg * k.dmg;
			u->st.rangedDmg = u->st.rangedDmg * k.dmg;
			u->maxHp = u->hp = u->st.maxHp;
		}
	return id;
}

void SimRoamHost::order(const RoamOrder &m) {
	flush();
	dirty = true;
	Order o = order_of(m.kind, m.squad);
	o.x = m.x;
	o.y = m.y;
	o.target = m.target;
	o.shape = m.shape;
	if (m.kind == "crew") o.siege = m.siege;
	if (m.kind == "escort") o.cart = m.cart;
	s->apply(o);
}

bool SimRoamHost::arrived(int id) { return !s->squads[id]->goal && s->squads[id]->pi >= double(s->squads[id]->path.size()) / 2; }

std::vector<double> SimRoamHost::route(bool cart, double x0, double y0, double x1, double y1) {
	Grid &g = *s->grid;
	g.team = NEUTRAL_TEAM;
	g.engine = g.cart = cart;
	std::vector<double> p = s->cornerPath(x0, y0, x1, y1);
	g.engine = g.cart = false;
	return p;
}

std::pair<double, double> SimRoamHost::open(double x, double y) { return s->openPoint(x, y); }

int SimRoamHost::cart(double x, double y, const RoamGoods &goods) {
	dirty = true;
	const int id = s->siege->cart(NEUTRAL_TEAM, data().roam.ROAM_OWNER, "wagon", x, y);
	std::vector<Lot> lots;
	for (const auto &[r, n] : goods) lots.push_back({ r, n, s->region.id, std::nullopt });
	put_lots(*s->siege->get(id)->hold, lots);
	return id;
}

std::optional<RoamCart> SimRoamHost::cart_at(int id) {
	const SiegeEngine *e = s->siege->get(id);
	if (!e) return std::nullopt;
	return RoamCart{ e->x, e->y, e->team, s->siege->alive(id), e->goal.has_value() };
}

void SimRoamHost::pay(const std::string &owner, int team, double x, double y, double coin) {
	Squad *best = nullptr;
	for (Squad *q : s->squads)
		if (q->owner == owner && q->team == team && q->alive > 0 && (!best || dist2(*q, x, y) < dist2(*best, x, y))) best = q;
	const std::pair<double, double> p = best ? s->openPoint(best->cx + 1, best->cy + 1) : std::make_pair(x, y);
	const PileClaim claim{ owner, "Caravan pay", double(s->tick) + data().trade.CLAIM_TICKS };
	s->piles->drop(p.first, p.second, { Lot{ "coin", coin, s->region.id, std::nullopt } }, {}, s->tick, 0, &claim);
}

std::optional<std::pair<double, double>> SimRoamHost::fight_near(double x, double y, double r) {
	for (const Unit *u : s->units)
		if (u->alive && u->fighting && sq(u->x - x) + sq(u->y - y) <= r * r) return std::make_pair(u->x, u->y);
	return std::nullopt;
}

// --- the towns' host ---

std::vector<PreSquad> SimPreHost::squads() {
	std::vector<PreSquad> out;
	for (const Squad *q : s->squads) out.push_back({ q->id, q->team, double(q->alive), q->cx, q->cy, q->civ });
	return out;
}

std::vector<PreUnit> SimPreHost::units() {
	std::vector<PreUnit> out;
	for (const Unit *u : s->units) out.push_back({ u->x, u->y, u->alive, !u->civ.empty(), u->squad->team });
	return out;
}

// --- the wiring (createSim, after the crafting queues) ---

void Sim::wireWild(const godot::Dictionary &meta) {
	mobRegion.depth = depth_region(meta);
	early = depth_of(mobRegion.depth) <= data().depth.early.depth; // W-79: this region spares the wild's falls
	mobRegion.lairs = lairs_of(meta);
	mobRegion.claimPoints = claims_of(meta);
	mobHost = std::make_unique<SimMobHost>();
	mobHost->s = this;
	mobHost->w = grid->w;
	mobHost->h = grid->h;
	mobs = std::make_unique<Mobs>(mobRegion, *mobHost);

	// world-fill: the region's hidden quests (secrets.h), run per player on the story runner
	storyRegion.id = region.id;
	storyRegion.w = grid->w;
	storyRegion.h = grid->h;
	storyRegion.cost = grid->cost;
	storyRegion.npc = npc_spot(meta);
	SecretHost sh;
	sh.squads = [this]() -> const std::vector<SecretSquad> & {
		secretSquads.resize(squads.size());
		for (size_t i = 0; i < squads.size(); i++) {
			const Squad &q = *squads[i];
			SecretSquad &o = secretSquads[i];
			o.id = q.id;
			o.team = q.team;
			o.alive = q.alive;
			o.owner = q.owner;
			o.civ = q.civ;
			o.cx = q.cx;
			o.cy = q.cy;
			o.units.resize(q.units.size());
			for (size_t k = 0; k < q.units.size(); k++) {
				const Unit &u = *q.units[k];
				o.units[k] = { u.id, u.x, u.y, u.alive, u.cls };
			}
		}
		return secretSquads;
	};
	sh.lairs = [this]() {
		mobHost->dirty = true;
		std::vector<StorySnap::Lair> out;
		for (const LairSnap &l : mobs->lair_snaps()) out.push_back({ l.x, l.y, l.state });
		mobHost->flush();
		return out;
	};
	sh.souls = [this]() {
		std::vector<StorySnap::Soul> out;
		for (const SoulSnap &so : souls->snaps(tick)) out.push_back({ so.id, so.x, so.y });
		return out;
	};
	sh.add_lair = [this](const LairAsk &d) {
		mobHost->dirty = true;
		mobs->add({ d.kind, d.x, d.y, d.count, d.lead, d.chief });
		mobHost->flush();
	};
	sh.spawn_soul = [this](double x, double y, const std::string &cls, double level) { spawnSoul(x, y, cls, level, "lair"); };
	sh.give = [this](const std::string &owner, const std::string &name, double x, double y, const std::vector<std::pair<std::string, double>> &goods, const std::vector<Item> &items) {
		std::vector<Lot> lots;
		for (const auto &[r, n] : goods)
			if (n > 0) lots.push_back({ r, n, region.id, std::nullopt });
		const PileClaim claim{ owner, name, double(tick) + data().trade.CLAIM_TICKS };
		piles->drop(x, y, lots, items, tick, 0, &claim);
	};
	sh.note = [](const SecretEvent &) {}; // the event log: not ported
	secrets = std::make_unique<Secrets>(meta, storyRegion, std::move(sh));

	// M7d: the region's guardians (bosses.h)
	bossRegion = std::make_unique<BossRegion>(boss_region_of(meta));
	bossHost = std::make_unique<SimBossHost>();
	bossHost->s = this;
	bossHost->w = grid->w;
	bossHost->h = grid->h;
	bossHost->mobTeam = MOB_TEAM;
	bossHost->neutralTeam = NEUTRAL_TEAM;
	bosses = std::make_unique<Bosses>(*bossRegion, *bossHost);

	// W-65: the region's roaming life (roam.h): packs, bandit patrols, caravans and travellers on the sim's own orders
	roamRegion = roam_region_of(meta);
	roamHost = std::make_unique<SimRoamHost>();
	roamHost->s = this;
	roamHost->w = grid->w;
	roamHost->h = grid->h;
	roam = std::make_unique<Roam>(roamRegion, double(seed), *roamHost);

	// M7a: the region's pre-built pieces and their functions (prebuilt.h)
	worksPre = std::make_unique<WorksPre>(*works);
	preHost = std::make_unique<SimPreHost>();
	preHost->s = this;
	preHost->mob = MOB_TEAM;
	towns = std::make_unique<Towns>(*worksPre, *preHost);
}

// createLandmarks (after works.prebuild) and createSouls (after the hunger helpers), as createSim orders them.
static void wire_landmarks(Sim &s) {
	LmWorks w;
	w.prebuilt = [&s]() -> const std::vector<LmPiece> & {
		const std::vector<Building *> &pre = s.works->prebuilt();
		s.lmPieces.resize(pre.size()); // in place: the pieces' count never changes, so pointers into it hold
		for (size_t i = 0; i < pre.size(); i++) {
			const Building &b = *pre[i];
			LmPiece &p = s.lmPieces[i];
			p.team = b.team;
			p.x = b.x;
			p.y = b.y;
			p.hp = b.hp;
			p.maxHp = b.maxHp;
			p.tiles.assign(b.tiles.begin(), b.tiles.end());
			p.state = b.state;
			p.landmark = b.pre && b.pre->landmark;
			p.gone = b.pre && b.pre->gone;
			p.ruin = b.pre && b.pre->ruin;
		}
		return s.lmPieces;
	};
	w.landmark_capture = [&s](double share) { s.works->landmark_capture(share); };
	w.landmark_restore = [&s](int team, const LmGoods &cost, double x, double y) {
		Cost c;
		for (const auto &[k, v] : cost) c.set(k, v);
		return s.works->landmark_restore(team, c, x, y);
	};
	LmHost h;
	h.units = [&s]() -> const std::vector<LmUnit> & {
		s.lmUnits.resize(s.units.size());
		for (size_t i = 0; i < s.units.size(); i++) {
			const Unit &u = *s.units[i];
			LmUnit &o = s.lmUnits[i];
			o.x = u.x;
			o.y = u.y;
			o.alive = u.alive;
			o.civ = u.civ;
			o.team = u.squad->team;
			o.person.reset();
			if (u.person) o.person = LmUnit::Person{ u.person->hero.level, u.person->hero.perks };
		}
		return s.lmUnits;
	};
	h.squad = [&s](int id) -> const LmSquad * {
		if (id < 0 || size_t(id) >= s.squads.size()) return nullptr;
		const Squad &q = *s.squads[id];
		s.lmSquad.team = q.team;
		s.lmSquad.units.clear();
		for (const Unit *u : q.units) {
			LmUnit o{ u->x, u->y, u->alive, u->civ, q.team, std::nullopt };
			if (u->person) o.person = LmUnit::Person{ u->person->hero.level, u->person->hero.perks };
			s.lmSquad.units.push_back(o);
		}
		return &s.lmSquad;
	};
	h.guarded = [&s]() { return s.guarded(); };
	h.real = [](int team) { return team >= 0 && team != NEUTRAL_TEAM && team != MOB_TEAM; };
	h.note = [](const LmEvent &) {}; // the event log: not ported
	s.landmarks = std::make_unique<Landmarks>(s.region.id, std::move(w), std::move(h));
}

static void wire_souls(Sim &s, const godot::Dictionary &meta) {
	SoulHost h;
	h.chance_at = [&s](double x, double y) { return s.townLv->souls_at(x, y); };
	h.men = [&s]() -> const std::vector<SoulMan> & {
		s.soulMen.clear();
		for (const Unit *u : s.units)
			if (u->alive) s.soulMen.push_back({ u->x, u->y, u->squad->team, u->squad->id, u->squad->soul, u->squad->owner, !u->civ.empty() });
		return s.soulMen;
	};
	h.gate = [&s](const std::string &owner, const std::string &cls) {
		if (s.soulGate) return s.soulGate(owner, cls);
		int soldiers = 0, workers = 0;
		for (const Unit *u : s.units)
			if ((u->alive || u->downAt) && u->squad->owner == owner) {
				if (!u->civ.empty()) workers++;
				else soldiers++;
			} // W-81: a man down will rise
		// manRefusal(NO_PATH, cls, ...): stub until the paths port (NO_PATH may hold any class: household or full)
		const bool civ = !civ_job(cls).empty();
		std::optional<std::string> why;
		if (civ) {
			if (workers >= NO_PATH_WORKERS) why = "household";
		} else if (soldiers >= NO_PATH_CAP) why = "full";
		SoulGate g;
		g.ok = !why;
		g.have = civ ? workers : soldiers;
		g.why = why;
		return g;
	};
	h.join = [&s](const Soul &so, int squad) -> std::optional<SoulJoin> {
		Squad *into = squad >= 0 && size_t(squad) < s.squads.size() ? s.squads[squad] : nullptr;
		if (!into || into->alive == 0 || into->alive >= SQUAD_MAX) return std::nullopt;
		const std::string cls = data().roster.CLASSES.count(so.cls) ? so.cls : "militia";
		std::set<std::string> taken;
		for (const Unit *u : s.units)
			if (u->alive && u->person && u->squad->owner == into->owner) taken.insert(u->person->hero.name);
		const std::string id = ("soul-" + s.region.id + "-" + base36(s.seed) + "-" + std::to_string(so.id)).substr(0, 40);
		PersonOpts o;
		o.level = so.level;
		WarPerson person = make_person(id, cls, o);
		// W-68: a named soul joins as himself: stub until the named souls are wired (spawnNamedSoul): every soul is fresh
		person.hero.name = free_name(data().roster.CLASSES.at(cls).culture, so.id, taken);
		const std::vector<WarPerson> ps{ person };
		const int sq = s.spawn_squad(into->owner, into->team, cls, 1, so.x, so.y, &ps);
		if (sq < 0) return std::nullopt;
		const int unit = s.squads[sq]->units[0]->id;
		Order m;
		m.kind = "merge";
		m.squad = sq;
		m.has_squad = true;
		m.into = squad;
		s.apply(m);
		SoulJoin j;
		j.unit = unit;
		j.person = { person.id, person.hero.name, person.hero.cls, person.hero.level };
		return j;
	};
	h.stop = [&s](const std::string &owner, int id) {
		for (Squad *q : s.squads)
			if (q->owner == owner && q->soul == id) q->soul = -1;
	};
	h.emit = [](const SoulEvent &) {}; // the event log: not ported
	s.souls = std::make_unique<Souls>(soul_region(meta), s.seed, std::move(h));
}

void Sim::wireLandmarks() { wire_landmarks(*this); }
void Sim::wireSouls(const godot::Dictionary &meta) { wire_souls(*this, meta); }

bool Sim::guarded() const {
	for (const BossMemo &g : bosses->memo())
		if (g.state != "slain" && g.state != "away") return true;
	return false;
}

// M7d: a man in a ford or wading in at its edge (a tile of one beside him): he reaches what lurks in the channel.
bool Sim::atFord(double x, double y) const {
	for (int dy = -1; dy <= 1; dy++)
		for (int dx = -1; dx <= 1; dx++) {
			const int tx = int(std::floor(x)) + dx, ty = int(std::floor(y)) + dy;
			if (tx >= 0 && ty >= 0 && tx < grid->w && ty < grid->h && region.water[size_t(ty) * grid->w + tx] == 1) return true;
		}
	return false;
}

// The wild's ticks of step (souls, mobs, roam, secrets, bosses, towns), in index.ts order.
void Sim::wildTick() {
	souls->tick(tick);
	mobHost->dirty = true;
	mobs->tick(tick);
	mobHost->flush();
	roamHost->dirty = true;
	roam->tick(tick);
	roamHost->flush();
	secrets->tick(tick);
	bosses->tick(tick);
	towns->tick(tick);
}

void Sim::spawnMobs() {
	mobHost->dirty = true;
	mobs->spawn();
	mobHost->flush();
	bosses->spawn();
}

void Sim::spawnRoam() {
	roamHost->dirty = true;
	roam->spawn();
	roamHost->flush();
}

int Sim::spawnSoul(double x, double y, const std::string &cls, double level, const std::string &site) { return souls->spawn(x, y, cls, level, site, tick); }

void Sim::hurtBoss(const std::string &id, double dmg, const std::string &owner, std::optional<int> part) { bosses->hurt_boss(id, dmg, owner, part); }

} // namespace sim
