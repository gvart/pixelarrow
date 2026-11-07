#include "bosses.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <set>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/string.hpp>

#include "js_math.h"
#include "rng.h"
#include "sim_data.h"

namespace sim {

static constexpr double PI = 3.141592653589793;
static double sq2(double v) { return js::pow(v, 2); }

// ---------------------------------------------------------------- tables

static std::string bstr(const godot::Variant &v) { return godot::String(v).utf8().get_data(); }

void load_boss_sim_tables(const godot::Dictionary &tables, BossSimTables &t) {
	if (!tables.has("src/war/sim/bosses")) return;
	const godot::Dictionary m = tables["src/war/sim/bosses"];
	const godot::Dictionary gs = m["GUARDIANS"];
	for (const godot::Variant &k : godot::Array(gs.keys())) {
		const godot::Dictionary d = gs[k];
		GuardDef g;
		g.ai = bstr(d["ai"]);
		g.cls = bstr(d["cls"]);
		g.hp = d["hp"];
		g.dmg = d["dmg"];
		g.armor = d["armor"];
		g.reach = d["reach"];
		g.atk = d["atk"];
		g.speed = d["speed"];
		g.aggro = d["aggro"];
		g.leash = d["leash"];
		if (d.has("guard")) {
			const godot::Dictionary x = d["guard"];
			g.guard = GuardDef::Guard{ bstr(x["cls"]), x["n"], x["hp"], x["dmg"], x["armor"] };
		}
		if (d.has("parts")) {
			const godot::Dictionary x = d["parts"];
			g.parts = GuardDef::Parts{ x["n"], x["hp"], x["dmg"] };
		}
		t.GUARDIANS[bstr(k)] = g;
	}
	const godot::Dictionary mv = m["MOVES"];
	const auto o = [&](const char *k) -> godot::Dictionary { return mv[k]; };
	BossMoves &M = t.MOVES;
	{ const auto d = o("sweep"); M.sweep = { d["every"], d["r"], d["share"], d["knock"] }; }
	{ const auto d = o("breath"); M.breath = { d["every"], d["len"], d["half"], d["share"], d["reach"] }; }
	M.perchFor = mv["perchFor"];
	M.flight = mv["flight"];
	{ const auto d = o("crash"); M.crash = { d["r"], d["share"], d["knock"], d["packs"], d["pack"], d["packHp"], d["packDmg"] }; }
	{ const auto d = o("enrage"); M.enrage = { d["dmg"], d["atk"] }; }
	{ const auto d = o("snatch"); M.snatch = { d["every"], d["water"], d["head"] }; }
	{ const auto d = o("headStrike"); M.headStrike = { d["every"], d["r"] }; }
	{ const auto d = o("rock"); M.rock = { d["every"], d["range"], d["r"], d["share"], d["wood"] }; }
	{ const auto d = o("smash"); M.smash = { d["every"], d["r"], d["mult"] }; }
	{ const auto d = o("triple"); M.triple = { d["every"], d["r"], d["n"] }; }
	{ const auto d = o("goatBreath"); M.goatBreath = { d["every"], d["len"], d["half"], d["share"] }; }
	{ const auto d = o("postern"); M.postern = { d["at"], d["hold"], d["away"] }; }
	{ const auto d = o("calls"); M.calls = { d["packs"], d["n"] }; }
	M.sounder = mv["sounder"];
	{ const auto d = o("boulder"); M.boulder = { d["every"], d["range"], d["min"], d["r"], d["share"], d["wood"] }; }
	{ const auto d = o("stomp"); M.stomp = { d["every"], d["r"], d["share"], d["knock"], d["gates"], d["gateDmg"] }; }
	{ const auto d = o("bite"); M.bite = { d["every"], d["r"] }; }
	{ const auto d = o("charge"); M.charge = { d["every"], d["range"], d["w"], d["share"], d["knock"], d["wind"], d["min"], d["through"] }; }
	{ const auto d = o("dive"); M.dive = { d["every"], d["wind"], d["fly"], d["range"], d["min"], d["r"], d["share"], d["knock"] }; }
	{ const auto d = o("pounce"); M.pounce = { d["every"], d["wind"], d["fly"], d["range"], d["min"], d["r"], d["share"], d["knock"] }; }
	{ const auto d = o("roar"); M.roar = { d["every"], d["wind"], d["r"], d["n"], d["knock"], d["slow"] }; }
	{ const auto d = o("maul"); M.maul = { d["every"], d["wind"], d["len"], d["half"], d["share"], d["knock"] }; }
	{ const auto d = o("bull"); M.bull = { d["every"], d["wind"], d["range"], d["min"], d["len"], d["w"], d["share"], d["knock"], d["stun"], d["fly"] }; }
	{ const auto d = o("surge"); M.surge = { d["delay"], d["wind"], d["reach"], d["len"], d["past"], d["w"], d["share"], d["push"], d["slow"] }; }
	M.fx = mv["fx"];
	M.stall = mv["stall"];
	t.BOSS_SLOW = m["BOSS_SLOW"];
	const godot::Dictionary b = m["BOSS"];
	t.BOSS.respawn = b["respawn"];
	t.BOSS.retry = b["retry"];
	const godot::Dictionary r = m["RAID"];
	const godot::Dictionary rs = r["squads"];
	for (const godot::Variant &k : godot::Array(rs.keys())) t.RAID.squads[godot::String(k).to_int()] = rs[k];
	t.RAID.per = r["per"];
	t.RAID.max = r["max"];
	t.RAID.r = r["r"];
	t.RAID.every = r["every"];
	const godot::Dictionary w = m["WARDEN"];
	t.WARDEN = { w["every"], w["band"], w["size"], w["telegraph"], w["share"] };
}

static const BossSimTables &T() { return data().boss_sim; }
static const BossMoves &MV() { return data().boss_sim.MOVES; }

void StPatch::apply(WarStats &s) const {
	if (maxHp) s.maxHp = *maxHp;
	if (dmg) s.dmg = *dmg;
	if (armor) s.armor = *armor;
	if (reach) s.reach = *reach;
	if (atkTicks) s.atkTicks = *atkTicks;
	if (speed) s.speed = *speed;
	if (block) s.block = *block;
	if (range) s.range = *range;
	if (ammo) s.ammo = *ammo;
	if (rangedDmg) s.rangedDmg = *rangedDmg;
	if (knock) s.knock = *knock, s.hasKnock = true;
}

static Order move_order(int squad, double x, double y) {
	Order o;
	o.kind = "move";
	o.squad = squad;
	o.has_squad = true;
	o.x = x;
	o.y = y;
	return o;
}
static Order attack_order(int squad, int target) {
	Order o;
	o.kind = "attack";
	o.squad = squad;
	o.has_squad = true;
	o.target = target;
	return o;
}

// ---------------------------------------------------------------- createBosses

Bosses::Ai Bosses::ai_of(const std::string &s) {
	static const std::pair<const char *, Ai> names[] = { { "drakon", DRAKON }, { "scylla", SCYLLA }, { "brontes", BRONTES }, { "gyges", GYGES },
		{ "chimera", CHIMERA }, { "king", KING }, { "maenads", MAENADS }, { "titan", TITAN }, { "river", RIVER }, { "brute", BRUTE }, { "boar", BOAR },
		{ "griffin", GRIFFIN }, { "lion", LION }, { "bear", BEAR }, { "minotaur", MINOTAUR } };
	for (const auto &[n, a] : names)
		if (s == n) return a;
	return BRUTE;
}

Bosses::Bosses(const BossRegion &region_, BossHost &host_) : region(region_), host(host_), entries(region.guardians) {
	wardenAt = T().WARDEN.every;
	rim = !region.rim.empty() && depth_of(region.depth) == 4 && region.depth.id != "omphalos" ? region.rim : "";
}

bool Bosses::foe(const Squad &s) const { return s.team != host.mobTeam && s.team != host.neutralTeam && s.team >= 0; }

// Living foe men within r of (x,y).
std::vector<Unit *> Bosses::foes_in(double x, double y, double r) {
	std::vector<Unit *> out;
	for (Squad *s : host.squads()) {
		if (!foe(*s) || s->alive == 0 || sq2(s->cx - x) + sq2(s->cy - y) > sq2(r + 20)) continue;
		for (Unit *u : s->units)
			if (u->alive && sq2(u->x - x) + sq2(u->y - y) <= r * r) out.push_back(u);
	}
	return out;
}

Unit *Bosses::nearest_foe(double x, double y, double r) {
	Unit *best = nullptr;
	double bd = r * r;
	for (Unit *u : foes_in(x, y, r)) {
		const double d = sq2(u->x - x) + sq2(u->y - y);
		if (d < bd) bd = d, best = u;
	}
	return best;
}

// The foe man within r with the most of his side round him.
Unit *Bosses::densest(double x, double y, double r, double min) {
	std::vector<Unit *> fs;
	for (Unit *u : foes_in(x, y, r))
		if (!min || sq2(u->x - x) + sq2(u->y - y) >= min * min) fs.push_back(u);
	Unit *best = nullptr;
	int bn = -1;
	for (Unit *u : fs) {
		int n = 0;
		for (Unit *o : fs)
			if (sq2(o->x - u->x) + sq2(o->y - u->y) <= 9) n++;
		if (n > bn) bn = n, best = u;
	}
	return best;
}

void Bosses::fx(Run &r, const std::string &kind, double x, double y, double tx, double ty, double rad) { r.fx = RunFx{ kind, x, y, tx, ty, rad, tick_ }; }

Unit *Bosses::body(const Run &r) {
	const auto &us = host.units();
	return r.main >= 0 && r.main < int(us.size()) ? us[r.main] : nullptr;
}

Squad *Bosses::sq_of(int id) {
	const auto &ss = host.squads();
	return id >= 0 && id < int(ss.size()) ? ss[id] : nullptr;
}

const GuardDef &Bosses::def(const Run &r) const {
	const auto it = T().GUARDIANS.find(r.id);
	return it != T().GUARDIANS.end() ? it->second : T().GUARDIANS.at("moor_bear");
}

std::vector<Unit *> Bosses::units(const Run &r) {
	std::vector<Unit *> out;
	if (Squad *s = sq_of(r.sq)) out.insert(out.end(), s->units.begin(), s->units.end());
	if (Squad *s = sq_of(r.parts)) out.insert(out.end(), s->units.begin(), s->units.end());
	return out;
}

// The pool its bar shows: the body (Scylla too), or every head (the Chimera).
std::vector<Unit *> Bosses::pool(const Run &r) {
	if (r.ai == CHIMERA) {
		Squad *s = sq_of(r.sq);
		return s ? s->units : std::vector<Unit *>{};
	}
	Unit *b = body(r);
	return b ? std::vector<Unit *>{ b } : std::vector<Unit *>{};
}

std::pair<double, double> Bosses::hp_of(const Run &r) {
	double hp = 0, max = 0;
	for (Unit *u : pool(r)) hp += u->alive ? u->hp : 0, max += u->maxHp;
	return { hp, max };
}

int Bosses::parts_alive(const Run &r) {
	Squad *s = sq_of(r.parts);
	return s ? s->alive : 0;
}

// Strike every foe man in a set: a share of his max hp (min 1), thrown back from (fx,fy).
void Bosses::blast(const std::vector<Unit *> &us, double share, double fx0, double fy0, double knock, bool venom) {
	for (Unit *u : us) {
		if (!u->alive) continue;
		host.hurt(*u, std::max(1.0, u->maxHp * share), venom);
		if (knock && u->alive) host.knock(*u, fx0, fy0, knock);
	}
}

// Foe men in the cone from (x,y) towards (tx,ty), len long, half-angle `half`.
std::vector<Unit *> Bosses::cone(double x, double y, double tx, double ty, double len, double half) {
	const double a = js::atan2(ty - y, tx - x);
	std::vector<Unit *> out;
	for (Unit *u : foes_in(x, y, len)) {
		const double d = js::hypot(u->x - x, u->y - y);
		if (d < 0.5) {
			out.push_back(u);
			continue;
		}
		double da = std::abs(js::atan2(u->y - y, u->x - x) - a);
		if (da > PI) da = 2 * PI - da;
		if (da <= half) out.push_back(u);
	}
	return out;
}

void Bosses::breathe(Run &r, Unit &u, const Unit &t, double len, double half, double share) {
	double d = js::hypot(t.x - u.x, t.y - u.y);
	if (!d) d = 1;
	const double ex = u.x + ((t.x - u.x) / d) * len, ey = u.y + ((t.y - u.y) / d) * len;
	u.facing = js::atan2(t.y - u.y, t.x - u.x);
	blast(cone(u.x, u.y, t.x, t.y, len, half), share, u.x, u.y);
	for (int k = 1; k <= 3; k++) host.burn(u.x + ((ex - u.x) * k) / 3, u.y + ((ey - u.y) * k) / 3, 1 + k * half * (len / 3) * 0.5);
	fx(r, "breath", u.x, u.y, ex, ey, len * js::tan(half));
}

// A foe squad the guardian can come to blows with on the tiers.
bool Bosses::on_tier(const Squad &s, const Squad &o) {
	const Unit *me = nullptr;
	for (Unit *u : s.units)
		if (u->alive) {
			me = u;
			break;
		}
	if (!me) return false;
	const double z = host.level(me->x, me->y);
	for (Unit *u : o.units)
		if (u->alive && std::abs(host.level(u->x, u->y) - z) <= 1) return true;
	return false;
}

// Hold home ground: take on the nearest foe squad within aggro on its own tier, back home past the leash.
void Bosses::engage(Squad *s, double hx, double hy, double aggro, double leash, Run *r) {
	if (!s || s->alive == 0) return;
	const double d = js::hypot(s->cx - hx, s->cy - hy);
	if (r && d > 3 && tick_ - r->hitAt > MV().stall) {
		// out there and no blow struck either way for a while: home
		r->hitAt = tick_, r->hasHitAt = true;
		host.order(move_order(s->id, hx, hy));
		return;
	}
	if (d > leash) {
		if (s->order != "move") host.order(move_order(s->id, hx, hy));
		return;
	}
	if (s->order == "move" && d > 3) return; // on its way home
	Squad *tgt = s->target >= 0 && s->target < int(host.squads().size()) ? host.squads()[s->target] : nullptr;
	if (s->order == "attack" && tgt && tgt->alive > 0 && (std::fmod(tick_, 50) != 0 || on_tier(*s, *tgt))) return;
	int best = -1;
	double bd = aggro * aggro;
	for (Squad *o : host.squads()) {
		if (!foe(*o) || o->alive == 0) continue;
		const double e = sq2(o->cx - s->cx) + sq2(o->cy - s->cy);
		if (e < bd && on_tier(*s, *o)) bd = e, best = o->id;
	}
	if (best >= 0) host.order(attack_order(s->id, best));
	else if (s->order == "attack" || d > 3) host.order(move_order(s->id, hx, hy));
}

void Bosses::pin(Unit &u, bool on, int aloft) {
	u.pin = on;
	u.aloft = aloft;
}

void Bosses::fly_to(Run &r, double x1, double y1, double ticks, const std::string &then) {
	Unit &u = *body(r);
	r.fly = Fly{ u.x, u.y, x1, y1, tick_, tick_ + ticks, then };
	r.state = "flight";
	pin(u, true, 1);
	u.facing = js::atan2(y1 - u.y, x1 - u.x);
}

// Called packs come from (x,y): `n` squads of `count`, hp and damage x over the sheet's base.
void Bosses::call(Run &r, const std::string &cls, const std::string &kind, double n, double count, double x, double y, double hpk, double dmgk) {
	for (int k = 0; k < n; k++) {
		const double a = (2 * PI * k) / n + 0.6, px = x + js::cos(a) * 3, py = y + js::sin(a) * 3;
		StPatch base;
		if (kind == "wolf") base.maxHp = 22 * hpk, base.dmg = 5.4 * dmgk, base.speed = 1.6, base.reach = 1.9, base.atkTicks = 8, base.armor = 2;
		else if (kind == "drake") base.maxHp = 68 * hpk, base.dmg = 12.6 * dmgk, base.speed = 1.45, base.reach = 1.4, base.atkTicks = 11, base.armor = 3;
		else base.maxHp = 90 * hpk, base.dmg = 14 * dmgk, base.speed = 1.3, base.reach = 1.4, base.atkTicks = 10, base.armor = 2;
		const int id = host.spawn(cls, int(count), px, py, base, -1);
		if (id >= 0) r.called.push_back(id);
	}
}

// --- spawning ---
void Bosses::spawn_run(Run &r, double guardN) {
	const GuardianEntry &e = entries[r.i];
	const GuardDef &g = def(r);
	StPatch st;
	st.maxHp = g.hp, st.dmg = g.dmg, st.armor = g.armor, st.reach = g.reach, st.atkTicks = int(js::round(g.atk * 10)), st.speed = g.speed;
	st.block = 0, st.range = 0, st.ammo = 0, st.rangedDmg = 0, st.knock = 0;
	r.called.clear();
	r.parts = -1;
	r.phase = 0;
	r.state = "idle";
	r.scale = 1;
	r.raid = 0;
	r.fly.reset();
	r.fleeAt = -1;
	r.dmg.clear();
	r.last = "";
	r.fx.reset();
	r.hitAt = tick_, r.hasHitAt = true;
	r.next = tick_ + 30;
	r.next2 = tick_ + 45;
	r.perch = 0;
	r.perchAt = 0;
	r.tele.reset();
	r.stun = 0;
	r.surge = 0;
	if (r.ai == CHIMERA) {
		StPatch p = st;
		p.maxHp = g.parts->hp, p.dmg = g.parts->dmg;
		r.sq = host.spawn(g.cls, int(g.parts->n), e.x, e.y, p, r.i);
		Squad &s = *sq_of(r.sq);
		if (s.units.size() > 2) s.units[2]->venom = true; // the serpent's bite
		r.main = s.units[0]->id;
	} else {
		const double n = g.guard ? (guardN >= 0 ? guardN : g.guard->n) : 0;
		r.guardN = n;
		r.sq = host.spawn(g.cls, int(1 + n), e.x, e.y, st, r.i);
		Squad &s = *sq_of(r.sq);
		r.main = s.units[0]->id;
		if (g.guard)
			for (size_t k = 1; k < s.units.size(); k++) {
				Unit &u = *s.units[k];
				u.cls = g.guard->cls;
				StPatch gp;
				gp.maxHp = g.guard->hp, gp.dmg = g.guard->dmg, gp.armor = g.guard->armor, gp.reach = 1.4, gp.atkTicks = 12, gp.speed = g.speed;
				gp.apply(u.st);
				u.stKey = st_fresh();
				u.maxHp = u.hp = g.guard->hp;
			}
	}
	Unit &u = *body(r);
	if (r.ai == SCYLLA) {
		// the heads along the cliff, the body in the cave mouth (shut while 3+ heads live)
		std::vector<std::pair<double, double>> hs = e.heads;
		if (hs.empty())
			for (int k = 0; k < g.parts->n; k++) hs.push_back({ e.x + js::cos((k / g.parts->n) * PI) * 4, e.y + js::sin((k / g.parts->n) * PI) * 4 });
		StPatch p = st;
		p.maxHp = g.parts->hp, p.dmg = g.parts->dmg, p.reach = MV().headStrike.r;
		r.parts = host.spawn(g.cls, int(hs.size()), e.x, e.y, p, r.i);
		const std::vector<Unit *> heads = sq_of(r.parts)->units;
		for (size_t k = 0; k < heads.size(); k++) host.place(*heads[k], hs[k].first, hs[k].second), pin(*heads[k], true);
		pin(u, true);
		u.immune = true;
	}
	// where it starts: Drakon in the yard, Brontes and the Titan on their perch, Gyges in chains, Scylla in her cave
	if ((r.ai == BRONTES || r.ai == TITAN) && e.perches.size()) host.place(u, e.perches[0].first, e.perches[0].second), pin(u, true, r.ai == TITAN ? 0 : 1), r.state = "perch";
	else if (r.ai == BRONTES || r.ai == TITAN || r.ai == GYGES) pin(u, true);
	host.gate(r.id, true);
}

// --- per AI ---
void Bosses::enter(Run &r, int p) {
	const GuardianEntry &e = entries[r.i];
	Unit &u = *body(r);
	const GuardDef &g = def(r);
	BossNote n;
	n.t = tick_;
	n.kind = "bossPhase";
	n.region = region.depth.id;
	n.boss = r.id;
	n.phase = p;
	host.note(n);
	// a move wound up is lost in the phase change
	if (r.tele && !r.fly) {
		if (r.tele->held) pin(u, false);
		r.tele.reset();
	}
	switch (r.ai) {
		case DRAKON:
			if (p == 1) {
				// up onto the keep roof
				const auto [px, py] = e.perches.size() ? e.perches[0] : std::pair<double, double>{ e.x, e.y };
				r.perch = 0;
				fly_to(r, px, py, MV().flight, "perch");
			} else if (p == 2) fly_to(r, e.x, e.y, js::round(MV().flight * 0.6), "crash");
			break;
		case SCYLLA:
			if (p == 1) {
				// she drags herself onto the flats, open to every blade
				pin(u, false);
				u.immune = false;
				const auto [fx0, fy0] = e.flats ? *e.flats : std::pair<double, double>{ e.x, e.y };
				host.order(move_order(r.sq, fx0, fy0));
				r.state = "fight";
			}
			break;
		case BRONTES:
			if (p == 1) fly_to(r, e.x, e.y, 10, "land");
			{
				StPatch k;
				k.knock = 2;
				k.apply(u.st);
				u.stKey = st_fresh();
			}
			break;
		case GYGES:
			if (p == 1) {
				pin(u, false);
				StPatch k;
				k.knock = 2;
				k.apply(u.st);
				u.stKey = st_fresh();
				r.state = "fight";
			}
			break;
		case KING:
			if (p == 2 && e.postern) {
				r.state = "flee";
				host.order(move_order(r.sq, e.postern->first, e.postern->second));
			}
			break;
		case MAENADS:
			if (p == 1) {
				StPatch k;
				k.dmg = g.dmg * MV().enrage.dmg;
				k.apply(u.st);
				u.stKey = st_fresh();
				call(r, "mob_maenad", "", MV().calls.packs, MV().calls.n, e.x, e.y, 1, 1);
			}
			break;
		case BOAR:
			if (p == 1) {
				StPatch k;
				k.dmg = g.dmg * MV().enrage.dmg, k.atkTicks = int(std::max(1.0, js::round(g.atk * 10 * MV().enrage.atk)));
				k.apply(u.st);
				u.stKey = st_fresh();
				call(r, "mob_boar", "boar", MV().calls.packs, MV().sounder, e.x, e.y, 1, 1);
			}
			break;
		case TITAN:
			if (p == 1) {
				pin(u, false);
				if (e.perches.size()) host.place(u, e.x, e.y);
				r.state = "fight";
			}
			break;
		case RIVER:
			if (p == 1) {
				// in the channels: only a man on a ford reaches him
				u.venom = true;
				const auto [cx, cy] = e.flats ? *e.flats : std::pair<double, double>{ e.x, e.y };
				host.place(u, cx, cy);
				pin(u, true, 2);
				r.state = "perch";
				r.surge = tick_ + MV().surge.delay;
			} else if (p == 2) {
				u.venom = false;
				pin(u, false);
				host.place(u, e.x, e.y);
				StPatch k;
				k.knock = 3;
				k.apply(u.st);
				u.stKey = st_fresh();
				r.state = "fight";
				r.surge = tick_ + MV().surge.delay;
			}
			break;
		default:;
	}
}

// Foe men within w of the segment (x,y)-(tx,ty).
std::vector<Unit *> Bosses::band(double x, double y, double tx, double ty, double w) {
	double d = js::hypot(tx - x, ty - y);
	if (!d) d = 1;
	std::vector<Unit *> out;
	for (Unit *m : foes_in(x, y, d + w)) {
		const double k = ((m->x - x) * (tx - x) + (m->y - y) * (ty - y)) / (d * d);
		if (k >= 0 && k <= 1 && js::hypot(x + (tx - x) * k - m->x, y + (ty - y) * k - m->y) <= w) out.push_back(m);
	}
	return out;
}

// W-67: wind a move up: braced where it stands, facing its mark, the mark on the ground.
void Bosses::wind_up(Run &r, Unit &u, const std::string &kind, double tx, double ty, double rad, double go, std::optional<double> at, bool wall) {
	const double a = at ? *at : go;
	const bool held = !u.pin;
	if (held) pin(u, true, 0);
	if (tx != u.x || ty != u.y) u.facing = js::atan2(ty - u.y, tx - u.x);
	r.tele = Tele{ kind, u.x, u.y, tx, ty, rad, tick_, tick_ + go, tick_ + a, held, wall };
}

// The end of a straight run of `len` from u through (tx,ty): where the ground stops it, and whether it was stopped short.
Bosses::RunEnd Bosses::run_to(const Unit &u, double tx, double ty, double len) {
	double d = js::hypot(tx - u.x, ty - u.y);
	if (!d) d = 1;
	const double ux = (tx - u.x) / d, uy = (ty - u.y) / d, z = host.level(u.x, u.y);
	double x = u.x, y = u.y;
	for (double s = 0.5; s <= len + 1e-9; s += 0.5) {
		const double nx = u.x + ux * s, ny = u.y + uy * s;
		if (!host.open(nx, ny) || std::abs(host.level(nx, ny) - z) > 1) return { x, y, true };
		x = nx, y = ny;
	}
	return { x, y, false };
}

// A charge through the ranks to the densest foe within MOVES.charge.range.
void Bosses::gore(Run &r, Unit &u) {
	r.next = tick_ + MV().charge.every;
	Unit *t = densest(u.x, u.y, MV().charge.range);
	if (!t || !host.open(t->x, t->y)) return;
	const double d = js::hypot(t->x - u.x, t->y - u.y);
	const RunEnd end = run_to(u, t->x, t->y, std::max(MV().charge.min, d + MV().charge.through));
	if (js::hypot(end.x - u.x, end.y - u.y) < 1) return;
	wind_up(r, u, "charge", end.x, end.y, MV().charge.w, MV().charge.wind);
}

// The Griffin's mark: the densest of the foe's missile men within reach (not at its feet), else of any.
Unit *Bosses::back_rank(const Unit &u, double range, double min) {
	std::vector<Unit *> fs, bows;
	for (Unit *m : foes_in(u.x, u.y, range))
		if (sq2(m->x - u.x) + sq2(m->y - u.y) >= min * min && host.open(m->x, m->y)) fs.push_back(m);
	for (Unit *m : fs)
		if (m->st.range > 0) bows.push_back(m);
	const std::vector<Unit *> &pick = bows.size() ? bows : fs;
	Unit *best = nullptr;
	int bn = -1;
	for (Unit *m : pick) {
		int n = 0;
		for (Unit *o : fs)
			if (sq2(o->x - m->x) + sq2(o->y - m->y) <= 9) n++;
		if (n > bn) bn = n, best = m;
	}
	return best;
}

// The nearest foe man between min and max tiles away (the Lion's pounce).
Unit *Bosses::nearest_between(const Unit &u, double min, double max) {
	Unit *best = nullptr;
	double bd = max * max;
	for (Unit *m : foes_in(u.x, u.y, max)) {
		const double d = sq2(m->x - u.x) + sq2(m->y - u.y);
		if (d >= min * min && d < bd && host.open(m->x, m->y)) bd = d, best = m;
	}
	return best;
}

// The move wound up goes: a leap takes off, the rest land now on what is in the mark.
void Bosses::launch(Run &r, Unit &u) {
	const Tele t = *r.tele;
	if (t.kind == "dive" || t.kind == "pounce") {
		fly_to(r, t.tx, t.ty, std::max(1.0, t.at - tick_), t.kind);
		return;
	}
	r.tele.reset();
	if (t.held) pin(u, false);
	if (t.kind == "charge") {
		const bool bull = r.ai == MINOTAUR;
		blast(band(t.x, t.y, t.tx, t.ty, t.r), bull ? MV().bull.share : MV().charge.share, t.x, t.y, bull ? MV().bull.knock : MV().charge.knock);
		fx(r, "charge", t.x, t.y, t.tx, t.ty, t.r);
		fly_to(r, t.tx, t.ty, bull ? MV().bull.fly : 6, t.wall ? "wall" : "land");
		u.aloft = 0;
	} else if (t.kind == "roar") {
		for (Unit *m : foes_in(u.x, u.y, t.r)) host.knock(*m, u.x, u.y, MV().roar.knock), host.slow(*m, MV().roar.slow);
		fx(r, "roar", u.x, u.y, u.x, u.y, t.r);
	} else if (t.kind == "maul") {
		blast(cone(t.x, t.y, t.tx, t.ty, t.r, MV().maul.half), MV().maul.share, t.x, t.y, MV().maul.knock);
		fx(r, "maul", t.x, t.y, t.tx, t.ty, t.r);
	} else if (t.kind == "surge") {
		// the wave throws the men in its band back along it and staggers them
		double d = js::hypot(t.tx - t.x, t.ty - t.y);
		if (!d) d = 1;
		const double ux = (t.tx - t.x) / d, uy = (t.ty - t.y) / d;
		for (Unit *m : band(t.x, t.y, t.tx, t.ty, t.r)) {
			host.hurt(*m, std::max(1.0, m->maxHp * MV().surge.share));
			if (m->alive) host.knock(*m, m->x - ux, m->y - uy, MV().surge.push), host.slow(*m, MV().surge.slow);
		}
		fx(r, "surge", t.x, t.y, t.tx, t.ty, t.r);
	}
}

void Bosses::think(Run &r) {
	const GuardianEntry &e = entries[r.i];
	Unit &u = *body(r);
	const GuardDef &g = def(r);
	Squad *s = sq_of(r.sq);
	const BossMoves &M = MV();
	const double tick = tick_;
	// a flight in the air: the body glides; where it lands, the move it makes
	if (r.fly) {
		const Fly f = *r.fly;
		const double k = std::min(1.0, (tick - f.t0) / std::max(1.0, f.t1 - f.t0));
		host.place(u, f.x0 + (f.x1 - f.x0) * k, f.y0 + (f.y1 - f.y0) * k);
		if (k < 1) return;
		r.fly.reset();
		if (f.then == "perch") pin(u, true, 1), r.state = "perch", r.perchAt = tick, r.next = tick + 10;
		else {
			pin(u, false);
			r.state = "fight";
			if (f.then == "crash") {
				// crashes down into the yard, enraged; the drakes come from the bone pit
				blast(foes_in(u.x, u.y, M.crash.r), M.crash.share, u.x, u.y, M.crash.knock);
				fx(r, "crash", u.x, u.y, u.x, u.y, M.crash.r);
				StPatch k2;
				k2.dmg = g.dmg * M.enrage.dmg, k2.atkTicks = int(std::max(1.0, js::round(g.atk * 10 * M.enrage.atk))), k2.knock = 1;
				k2.apply(u.st);
				u.stKey = st_fresh();
				const auto [px, py] = e.pit ? *e.pit : std::pair<double, double>{ e.x, e.y };
				call(r, "mob_drake", "drake", M.crash.packs, M.crash.pack, px, py, M.crash.packHp, M.crash.packDmg);
			} else if (f.then == "charge") {
				blast(foes_in(u.x, u.y, M.charge.w * 2), M.charge.share, f.x0, f.y0, M.charge.knock);
			} else if (f.then == "dive" || f.then == "pounce") {
				// W-67: the leap lands on its mark: the men still in it knocked down
				const bool dive = f.then == "dive";
				const double share = dive ? M.dive.share : M.pounce.share, knock = dive ? M.dive.knock : M.pounce.knock;
				const double rad = r.tele ? r.tele->r : dive ? M.dive.r : M.pounce.r;
				blast(foes_in(u.x, u.y, rad), share, u.x, u.y, knock);
				fx(r, f.then, f.x0, f.y0, u.x, u.y, rad);
				r.tele.reset();
			} else if (f.then == "wall") {
				// W-67: the Minotaur's charge into a wall: stunned a moment
				pin(u, true);
				r.stun = tick + M.bull.stun;
				fx(r, "wall", u.x, u.y, u.x, u.y, 1);
			}
		}
		return;
	}
	if (r.stun) {
		if (tick < r.stun) return;
		r.stun = 0;
		pin(u, false);
	}
	// W-67: a move wound up: braced till it goes
	if (r.tele) {
		if (tick >= r.tele->go) launch(r, u);
		return;
	}
	switch (r.ai) {
		case DRAKON:
			if (r.state == "perch") {
				if (tick >= r.next) {
					Unit *t = densest(u.x, u.y, M.breath.reach);
					if (t) breathe(r, u, *t, M.breath.len, M.breath.half, M.breath.share);
					r.next = tick + M.breath.every;
				}
				// from tower to tower
				const auto &ps = e.perches;
				if (ps.size() > 1 && tick - r.perchAt >= M.perchFor) {
					r.perch = (r.perch + 1) % int(ps.size());
					fly_to(r, ps[r.perch].first, ps[r.perch].second, M.flight, "perch");
				}
				return;
			}
			engage(s, e.x, e.y, g.aggro, g.leash, &r);
			if (tick >= r.next) {
				r.next = tick + (r.phase == 2 ? 60 : M.sweep.every);
				const std::vector<Unit *> near = foes_in(u.x, u.y, M.sweep.r);
				if (near.size()) blast(near, M.sweep.share, u.x, u.y, M.sweep.knock), fx(r, "sweep", u.x, u.y, u.x, u.y, M.sweep.r);
			}
			break;
		case SCYLLA: {
			Squad *heads = sq_of(r.parts);
			u.immune = parts_alive(r) > 2;
			if (r.phase == 0 && tick >= r.next2) {
				// the body strikes from the cave mouth
				r.next2 = tick + js::round(g.atk * 10);
				Unit *t = nearest_foe(u.x, u.y, g.reach + 0.5);
				if (t) host.hurt(*t, g.dmg);
			} else if (r.phase == 1) engage(s, e.flats ? e.flats->first : e.x, e.flats ? e.flats->second : e.y, g.aggro, g.leash, &r);
			if (heads && std::fmod(tick, M.headStrike.every) == std::fmod(r.i, M.headStrike.every))
				for (Unit *h : heads->units) {
					if (!h->alive) continue;
					Unit *t = nearest_foe(h->x, h->y, M.headStrike.r);
					if (t) host.hurt(*t, h->st.dmg), h->facing = js::atan2(t->y - h->y, t->x - h->x), fx(r, "smash", h->x, h->y, t->x, t->y, 1);
				}
			if (heads && heads->alive > 0 && tick >= r.next) {
				// a man near the water is snatched
				r.next = tick + M.snatch.every;
				Unit *best = nullptr;
				double bd = std::numeric_limits<double>::infinity();
				for (Unit *h : heads->units) {
					if (!h->alive) continue;
					for (Unit *t : foes_in(h->x, h->y, M.snatch.head)) {
						const double d = sq2(t->x - h->x) + sq2(t->y - h->y);
						if (d < bd && near_water(t->x, t->y, M.snatch.water)) bd = d, best = t;
					}
				}
				if (best) fx(r, "snatch", u.x, u.y, best->x, best->y, 1), host.hurt(*best, best->hp + 1);
			}
			break;
		}
		case BRONTES:
			if (r.state == "perch") {
				if (tick >= r.next) {
					r.next = tick + M.rock.every;
					Unit *t = densest(u.x, u.y, M.rock.range);
					if (t) {
						u.facing = js::atan2(t->y - u.y, t->x - u.x);
						const double tx = t->x, ty = t->y;
						blast(foes_in(tx, ty, M.rock.r), M.rock.share, tx, ty);
						host.smash(t->x, t->y, M.rock.r + 0.5, M.rock.wood, "wood");
						fx(r, "rock", u.x, u.y, t->x, t->y, M.rock.r);
					}
				}
				return;
			}
			engage(s, e.x, e.y, g.aggro, g.leash, &r);
			if (r.phase == 1 && tick >= r.next && nearest_foe(u.x, u.y, u.st.reach + 0.5)) {
				// his blows hit buildings too, his own walls not spared
				r.next = tick + M.smash.every;
				host.smash(u.x, u.y, M.smash.r, u.st.dmg * M.smash.mult, "all");
				fx(r, "smash", u.x, u.y, u.x, u.y, M.smash.r);
			}
			break;
		case GYGES:
			if (r.phase == 0) {
				// in chains: three blows at once at three men in reach
				if (tick >= r.next) {
					r.next = tick + M.triple.every;
					std::vector<Unit *> near = foes_in(u.x, u.y, M.triple.r);
					std::stable_sort(near.begin(), near.end(), [&](const Unit *a, const Unit *b) {
						const double c = sq2(a->x - u.x) + sq2(a->y - u.y) - (sq2(b->x - u.x) + sq2(b->y - u.y));
						return c ? c < 0 : a->id - b->id < 0;
					});
					if (near.size() > size_t(M.triple.n)) near.resize(size_t(M.triple.n));
					for (Unit *t : near) host.hurt(*t, g.dmg);
					if (near.size()) fx(r, "sweep", u.x, u.y, near[0]->x, near[0]->y, M.triple.r), u.facing = js::atan2(near[0]->y - u.y, near[0]->x - u.x), r.state = "fight";
					else r.state = "idle";
				}
				return;
			}
			engage(s, e.x, e.y, g.aggro, g.leash, &r);
			break;
		case CHIMERA: {
			engage(s, e.x, e.y, g.aggro, g.leash, &r);
			Unit *goat = s && s->units.size() > 1 ? s->units[1] : nullptr;
			if (goat && goat->alive && tick >= r.next) {
				r.next = tick + M.goatBreath.every;
				Unit *t = nearest_foe(goat->x, goat->y, M.goatBreath.len);
				if (t) breathe(r, *goat, *t, M.goatBreath.len, M.goatBreath.half, M.goatBreath.share);
			}
			break;
		}
		case KING: {
			if (r.state == "flee") {
				const auto [px, py] = *e.postern;
				if (js::hypot(u.x - px, u.y - py) <= M.postern.at || (s && js::hypot(s->cx - px, s->cy - py) <= M.postern.at)) {
					if (r.fleeAt < 0) r.fleeAt = tick;
					if (tick - r.fleeAt >= M.postern.hold) escape(r);
				} else if (s && s->order != "move") host.order(move_order(r.sq, px, py));
				return;
			}
			const double k = r.phase == 0 ? 1 : 1.5;
			engage(s, e.x, e.y, g.aggro * k, g.leash * k, &r);
			break;
		}
		case MAENADS:
			engage(s, e.x, e.y, g.aggro, g.leash, &r);
			break;
		case TITAN:
			if (r.phase == 0) {
				if (tick >= r.next) {
					r.next = tick + M.boulder.every;
					Unit *t = densest(u.x, u.y, M.boulder.range, M.boulder.min); // no throw at his own feet
					if (t) {
						u.facing = js::atan2(t->y - u.y, t->x - u.x);
						const double tx = t->x, ty = t->y;
						blast(foes_in(tx, ty, M.boulder.r), M.boulder.share, tx, ty);
						host.smash(t->x, t->y, M.boulder.r, M.boulder.wood, "wood");
						fx(r, "boulder", u.x, u.y, t->x, t->y, M.boulder.r);
						r.state = "fight";
					}
				}
				return;
			}
			engage(s, e.x, e.y, g.aggro, g.leash, &r);
			if (tick >= r.next) {
				r.next = tick + M.stomp.every;
				const std::vector<Unit *> near = foes_in(u.x, u.y, M.stomp.r);
				if (near.size()) blast(near, M.stomp.share, u.x, u.y, M.stomp.knock), fx(r, "stomp", u.x, u.y, u.x, u.y, M.stomp.r);
				host.smash(u.x, u.y, M.stomp.gates, M.stomp.gateDmg, "gate");
			}
			break;
		case RIVER:
			if (r.surge && tick >= r.surge && r.phase >= 1) {
				// W-67: the surge, once a phase from P2: a wave at the densest of them
				Unit *t = densest(u.x, u.y, M.surge.reach);
				if (t) {
					r.surge = 0;
					double d = js::hypot(t->x - u.x, t->y - u.y);
					if (!d) d = 1;
					const double len = std::min(M.surge.reach, std::max(M.surge.len, d + M.surge.past)); // rolls out past the men it is aimed at
					wind_up(r, u, "surge", u.x + ((t->x - u.x) / d) * len, u.y + ((t->y - u.y) / d) * len, M.surge.w, M.surge.wind);
					return;
				}
			}
			if (r.phase == 1) {
				if (tick >= r.next) {
					r.next = tick + M.bite.every;
					Unit *t = nearest_foe(u.x, u.y, M.bite.r);
					if (t) host.hurt(*t, g.dmg, true), u.facing = js::atan2(t->y - u.y, t->x - u.x), r.state = "perch";
				}
				return;
			}
			engage(s, e.x, e.y, g.aggro, g.leash, &r);
			if (r.phase == 2 && tick >= r.next) gore(r, u); // the bull charges through the ranks
			break;
		case BOAR:
			engage(s, e.x, e.y, g.aggro, g.leash, &r);
			if (r.state == "fight" && tick >= r.next) gore(r, u);
			break;
		case GRIFFIN:
			// W-67: dives on the back ranks
			engage(s, e.x, e.y, g.aggro, g.leash, &r);
			if (r.state == "fight" && tick >= r.next) {
				r.next = tick + M.dive.every;
				Unit *t = back_rank(u, M.dive.range, M.dive.min);
				if (t) wind_up(r, u, "dive", t->x, t->y, M.dive.r, M.dive.wind, M.dive.wind + M.dive.fly);
			}
			break;
		case LION:
			// W-67: roars the press round it back; pounces on the nearest man a few strides off
			engage(s, e.x, e.y, g.aggro, g.leash, &r);
			if (r.state != "fight") break;
			if (tick >= r.next2 && foes_in(u.x, u.y, M.roar.r).size() >= M.roar.n) {
				r.next2 = tick + M.roar.every;
				wind_up(r, u, "roar", u.x, u.y, M.roar.r, M.roar.wind);
			} else if (tick >= r.next) {
				Unit *t = nearest_between(u, M.pounce.min, M.pounce.range);
				if (t) r.next = tick + M.pounce.every, wind_up(r, u, "pounce", t->x, t->y, M.pounce.r, M.pounce.wind, M.pounce.wind + M.pounce.fly);
			}
			break;
		case BEAR:
			// W-67: rears up and mauls the men before it
			engage(s, e.x, e.y, g.aggro, g.leash, &r);
			if (r.state == "fight" && tick >= r.next) {
				Unit *t = nearest_foe(u.x, u.y, M.maul.len);
				if (t) {
					r.next = tick + M.maul.every;
					double d = js::hypot(t->x - u.x, t->y - u.y);
					if (!d) d = 1;
					wind_up(r, u, "maul", u.x + ((t->x - u.x) / d) * M.maul.len, u.y + ((t->y - u.y) / d) * M.maul.len, M.maul.len, M.maul.wind);
				}
			}
			break;
		case MINOTAUR:
			// W-67: a bull's charge in a straight line through a squad (stunned if a wall stops it)
			engage(s, e.x, e.y, g.aggro, g.leash, &r);
			if (r.state == "fight" && tick >= r.next) {
				Unit *t = densest(u.x, u.y, M.bull.range);
				if (t) {
					r.next = tick + M.bull.every;
					const RunEnd end = run_to(u, t->x, t->y, M.bull.len);
					if (js::hypot(end.x - u.x, end.y - u.y) >= M.bull.min) wind_up(r, u, "charge", end.x, end.y, M.bull.w, M.bull.wind, M.bull.wind, end.wall);
				}
			}
			break;
		default:
			engage(s, e.x, e.y, g.aggro, g.leash, &r);
	}
	if (s && s->order == "attack" && r.state == "idle") r.state = "fight";
}

bool Bosses::near_water(double x, double y, double r) {
	for (double dy = -r; dy <= r; dy += 1)
		for (double dx = -r; dx <= r; dx += 1)
			if (dx * dx + dy * dy <= r * r && host.water(x + dx, y + dy) > 0) return true;
	return false;
}

void Bosses::escape(Run &r) {
	// the King slips out by the postern with what is left of his guard: back in an hour with half of it
	Squad *s = sq_of(r.sq);
	double left = 0;
	if (s) {
		for (Unit *u : s->units) left += u->alive ? 1 : 0;
		left -= 1;
	}
	if (s)
		for (Unit *u : s->units)
			if (u->alive) host.vanish(*u);
	r.state = "away";
	r.respawnAt = tick_ + MV().postern.away;
	const GuardDef &g = def(r);
	r.guardN = std::max(0.0, std::ceil(std::max(left, g.guard ? g.guard->n : 0) / 2));
	BossNote n;
	n.t = tick_;
	n.kind = "bossFled";
	n.region = region.depth.id;
	n.boss = r.id;
	host.note(n);
}

void Bosses::slay(Run &r) {
	Unit &u = *body(r);
	r.state = "slain";
	r.respawnAt = tick_ + T().BOSS.respawn;
	r.fly.reset();
	r.tele.reset();
	std::vector<std::pair<std::string, double>> es(r.dmg.begin(), r.dmg.end());
	std::stable_sort(es.begin(), es.end(), [](const auto &a, const auto &b) {
		const double c = b.second - a.second;
		return c ? c < 0 : a.first < b.first;
	});
	BossNote n;
	if (!r.last.empty()) n.killers.push_back(r.last);
	for (const auto &[o, _] : es)
		if (o != r.last) n.killers.push_back(o);
	n.t = tick_;
	n.kind = "bossSlain";
	n.region = region.depth.id;
	n.boss = r.id;
	n.x = u.x;
	n.y = u.y;
	host.note(n);
	// the linked heads go down with the body
	if (Squad *p = sq_of(r.parts))
		for (Unit *h : p->units)
			if (h->alive) host.vanish(*h);
	host.gate(r.id, false);
}

void Bosses::scale_for(Run &r) {
	// raid scaling: more foe squads near than the tier's raid make it tougher (never weaker again)
	Unit &u = *body(r);
	std::set<int> seen; // only its size shows
	for (Unit *t : foes_in(u.x, u.y, T().RAID.r)) seen.insert(t->squad->id);
	r.raid = double(seen.size());
	const WarBoss *b = war_boss(r.id);
	const int tier = b ? b->tier : 1;
	const auto it = T().RAID.squads.find(tier);
	const double k = std::min(T().RAID.max, 1 + T().RAID.per * std::max(0.0, r.raid - (it != T().RAID.squads.end() ? it->second : 3)));
	if (k <= r.scale + 1e-9) return;
	const double f = k / r.scale;
	const GuardDef &g = def(r);
	for (Unit *m : units(r)) {
		if (g.guard && m->cls == g.guard->cls) continue;
		m->maxHp *= f;
		m->hp *= f;
		m->st.maxHp = m->maxHp;
		m->stKey = st_fresh();
	}
	r.scale = k;
}

double Bosses::share_of(const Run &r) {
	const auto [hp, max] = hp_of(r);
	return max > 0 ? hp / max : 0;
}

bool Bosses::dead(const Run &r) {
	if (r.ai == CHIMERA) {
		Squad *s = sq_of(r.sq);
		return (s ? s->alive : 0) == 0;
	}
	Unit *b = body(r);
	return !(b && b->alive);
}

// --- the Rim Warden ---
void Bosses::warden_tick() {
	if (rim.empty()) return;
	const auto &W = T().WARDEN;
	if (!warden && tick_ >= wardenAt) {
		const double band = W.band, size = W.size, along = rim == "N" || rim == "S" ? host.w : host.h;
		int best = -1;
		int bn = -1;
		const auto rect = [&](int k) -> Warden {
			const double a = k * size, o = std::floor((band - size) / 2);
			return rim == "N" ? Warden{ a, o, size, size, 0 } : rim == "S" ? Warden{ a, host.h - band + o, size, size, 0 } : rim == "W" ? Warden{ o, a, size, size, 0 } : Warden{ host.w - band + o, a, size, size, 0 };
		};
		const int n = int(std::floor(along / size));
		for (int k = 0; k < n; k++) {
			const Warden q = rect(k);
			const int c = int(foes_in(q.x + size / 2, q.y + size / 2, size * 0.71).size());
			if (c > bn) bn = c, best = k;
		}
		if (bn == 0) best = int(std::min(double(n - 1), std::floor(host.range(0, n))));
		Warden q = rect(best);
		q.at = tick_ + W.telegraph;
		warden = q;
	}
	if (warden && tick_ >= warden->at) {
		const Warden q = *warden;
		std::vector<Unit *> hit;
		for (Unit *u : foes_in(q.x + q.w / 2, q.y + q.h / 2, q.w))
			if (u->x >= q.x && u->x < q.x + q.w && u->y >= q.y && u->y < q.y + q.h) hit.push_back(u);
		blast(hit, W.share, 0, 0);
		BossNote n;
		n.t = tick_;
		n.kind = "wardenStrike";
		n.x = q.x;
		n.y = q.y;
		n.w = q.w;
		n.h = q.h;
		n.hit = int(hit.size());
		host.note(n);
		warden.reset();
		wardenAt = tick_ + W.every - W.telegraph;
	}
}

// A blow of `owner` dealt d to a unit of guardian run `i` (the killers' list).
void Bosses::hit(int i, const std::string &owner, double d) {
	if (i < 0 || i >= int(runs.size())) return;
	Run &r = runs[i];
	if (r.state == "slain" || r.state == "away") return;
	r.dmg[owner] = (r.dmg.count(owner) ? r.dmg[owner] : 0) + d;
	r.last = owner;
	r.hitAt = tick_, r.hasHitAt = true;
}

// Wake the region's guardians (once): each holds the region's claim points shut while it lives.
void Bosses::spawn() {
	if (spawned) return;
	spawned = true;
	for (size_t i = 0; i < entries.size(); i++) {
		const GuardianEntry &e = entries[i];
		if (!war_boss(e.boss)) continue;
		const auto it = T().GUARDIANS.find(e.boss);
		const GuardDef &g = it != T().GUARDIANS.end() ? it->second : T().GUARDIANS.at("moor_bear");
		Run r;
		r.i = int(i);
		r.id = e.boss;
		r.ai = ai_of(g.ai);
		r.x = e.x;
		r.y = e.y;
		runs.push_back(r);
		spawn_run(runs.back());
	}
}

// A blow by a man of guardian run `i` landed on a foe.
void Bosses::struck(int i) {
	if (i >= 0 && i < int(runs.size())) runs[i].hitAt = tick_, runs[i].hasHitAt = true;
}

static bool gone_state(const std::string &s) { return s == "slain" || s == "away"; }

void Bosses::down(const std::string &id, double left, bool away) {
	Run *r = nullptr;
	for (Run &x : runs)
		if (x.id == id && !gone_state(x.state)) {
			r = &x;
			break;
		}
	if (!r) return;
	std::vector<int> ids = { r->sq, r->parts };
	ids.insert(ids.end(), r->called.begin(), r->called.end());
	for (int sid : ids)
		if (Squad *s = sq_of(sid))
			for (Unit *u : s->units)
				if (u->alive) host.vanish(*u);
	r->called.clear();
	r->fly.reset();
	r->tele.reset();
	r->state = away ? "away" : "slain";
	r->respawnAt = tick_ + std::max(0.0, js::round(left));
	const GuardDef &g = def(*r);
	if (away) r->guardN = std::ceil((g.guard ? g.guard->n : 0) / 2);
	else host.gate(r->id, false);
}

void Bosses::wake(double k) {
	for (Run &r : runs) {
		if (gone_state(r.state)) {
			if (!(r.state == "slain" && host.claimed())) {
				const bool back = r.state == "slain";
				spawn_run(r, back ? -1 : r.guardN);
				if (back) host.reset_landmark();
				BossNote n;
				n.t = tick_;
				n.kind = "bossBack";
				n.region = region.depth.id;
				n.boss = r.id;
				host.note(n);
			} else continue;
		}
		if (dead(r) || !(k > 1)) continue;
		const GuardDef &g = def(r);
		for (Unit *m : units(r)) {
			if (g.guard && m->cls == g.guard->cls) continue;
			m->maxHp *= k;
			m->hp *= k;
			m->st.maxHp = m->maxHp;
			m->stKey = st_fresh();
		m->stKey = st_fresh();
		}
		r.scale *= k;
	}
}

std::vector<BossMemo> Bosses::memo() const {
	std::vector<BossMemo> out;
	for (const Run &r : runs) out.push_back({ r.id, r.state, gone_state(r.state) ? std::max(0.0, r.respawnAt - tick_) : 0 });
	return out;
}

void Bosses::hurt_boss(const std::string &id, double dmg, const std::string &owner, std::optional<int> part) {
	Run *r = nullptr;
	for (Run &x : runs)
		if (x.id == id && !gone_state(x.state)) {
			r = &x;
			break;
		}
	if (!r) return;
	Unit *u = nullptr;
	if (!part) {
		for (Unit *m : pool(*r))
			if (m->alive) {
				u = m;
				break;
			}
	} else if (Squad *s = r->ai == SCYLLA ? sq_of(r->parts) : sq_of(r->sq)) {
		if (*part >= 0 && *part < int(s->units.size())) u = s->units[*part];
	}
	if (!u || !u->alive || u->immune) return;
	const double d = std::min(dmg, u->hp);
	hit(r->i, owner, d);
	host.hurt(*u, dmg);
}

void Bosses::tick(double t) {
	tick_ = t;
	warden_tick();
	for (Run &r : runs) {
		if (gone_state(r.state)) {
			if (tick_ < r.respawnAt) continue;
			if (r.state == "slain" && host.claimed()) {
				r.respawnAt = tick_ + T().BOSS.retry; // held: never back while it is
				continue;
			}
			const bool back = r.state == "slain";
			spawn_run(r, back ? -1 : r.guardN);
			if (back) host.reset_landmark();
			BossNote n;
			n.t = tick_;
			n.kind = "bossBack";
			n.region = region.depth.id;
			n.boss = r.id;
			host.note(n);
			continue;
		}
		if (dead(r)) {
			slay(r);
			continue;
		}
		const WarBoss *b = war_boss(r.id);
		const std::vector<double> ph = b ? b->phases : std::vector<double>{ 1 };
		const double sh = share_of(r);
		int p = r.phase;
		while (p + 1 < int(ph.size()) && sh < ph[p + 1]) p++;
		while (r.phase < p) enter(r, ++r.phase);
		if (std::fmod(tick_ + r.i, T().RAID.every) == 0) scale_for(r);
		think(r);
		if (r.ai == DRAKON || r.ai == MAENADS || r.ai == BOAR)
			for (int c : r.called) engage(sq_of(c), r.x, r.y, 20, 40);
	}
}

std::vector<BossSnap> Bosses::snaps() {
	std::vector<BossSnap> out;
	for (const Run &r : runs) {
		Unit *u = body(r);
		const auto [hp, max] = hp_of(r);
		const WarBoss *b = war_boss(r.id);
		Squad *s = sq_of(r.sq);
		BossSnap o;
		if (r.ai == SCYLLA) {
			Squad *p = sq_of(r.parts);
			o.parts = BossSnap::Parts{ parts_alive(r), p ? int(p->units.size()) : 0 };
		} else if (r.ai == CHIMERA) o.parts = BossSnap::Parts{ s ? s->alive : 0, s ? int(s->units.size()) : 0 };
		const bool gone = gone_state(r.state);
		if (r.ai == CHIMERA && s) {
			bool first = true;
			for (Unit *m : s->units)
				if (m->alive) {
					if (!first) o.hide.push_back(m->id);
					first = false;
				}
		}
		o.id = r.id;
		o.name = b ? b->name : r.id;
		o.squad = r.sq;
		o.unit = r.main;
		o.x = u ? u->x : r.x;
		o.y = u ? u->y : r.y;
		o.hp = gone ? 0 : hp;
		o.maxHp = max;
		o.phase = r.phase;
		o.phases = b ? b->phases : std::vector<double>{ 1 };
		o.state = r.state;
		o.raid = r.raid;
		o.scale = r.scale;
		if (gone) o.respawnIn = std::max(0.0, r.respawnAt - tick_);
		if (r.fx && tick_ - r.fx->at < MV().fx) o.fx = BossSnap::Fx{ r.fx->kind, r.fx->x, r.fx->y, r.fx->tx, r.fx->ty, r.fx->r, tick_ - r.fx->at };
		if (r.tele && !gone) o.tele = BossSnap::Tele{ r.tele->kind, r.tele->x, r.tele->y, r.tele->tx, r.tele->ty, r.tele->r, std::max(0.0, r.tele->at - tick_), r.tele->at - r.tele->t0 };
		out.push_back(o);
	}
	return out;
}

std::optional<WardenSnap> Bosses::warden_snap() const {
	if (!warden) return std::nullopt;
	return WardenSnap{ warden->x, warden->y, warden->w, warden->h, std::max(0.0, warden->at - tick_) };
}

bool Bosses::any() const { return entries.size() > 0 || !rim.empty(); }

// ---------------------------------------------------------------- bossLoot.ts

static std::string js_num(double v) {
	char b[32];
	if (v == std::floor(v) && std::abs(v) < 1e15) snprintf(b, sizeof b, "%.0f", v);
	else snprintf(b, sizeof b, "%.17g", v); // a kill's tick is whole
	return b;
}

BossPile boss_pile(const std::string &region, const std::string &run, const BossNote &e) {
	BossPile out;
	out.x = e.x;
	out.y = e.y;
	if (!war_boss(e.boss)) return out;
	const std::string key = region + ":" + run + ":" + js_num(e.t) + ":" + e.boss;
	const uint32_t h = hash_string(godot::String::utf8((key + ":items").c_str()));
	Mulberry rng(h ? h : 1);
	IdSource ids;
	const std::vector<BossDrop> drops = boss_loot(e.boss, key);
	for (size_t i = 0; i < drops.size(); i++) {
		Item it = make_item(rng, ids, drops[i].def, drops[i].rarity);
		it.uid = "boss:" + key + ":" + std::to_string(i);
		out.items.push_back(drops[i].trophy ? as_trophy(it, e.boss) : it); // W-73: the guardian's trophy
	}
	for (const BossGood &g : boss_goods(e.boss)) out.lots.push_back({ g.r, g.n, region, std::nullopt });
	return out;
}

} // namespace sim
