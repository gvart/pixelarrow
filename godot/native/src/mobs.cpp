#include "mobs.h"

#include <algorithm>
#include <cmath>

#include "js_math.h"
#include "sim_data.h"

namespace sim {

static const MobTables &T() { return data().mobs; }
static double sq2(double v) { return js::pow(v, 2); } // `v ** 2`
static constexpr double INF = std::numeric_limits<double>::infinity();

std::string mob_class(const std::string &kind) { return "mob_" + kind; }

std::string mob_kind_of(const std::string &cls) {
	if (cls.rfind("mob_", 0) != 0) return "";
	const std::string k = cls.substr(4);
	return T().MOBS.count(k) ? k : "";
}

std::string foes_word(const std::string &cls, int n) {
	const std::string k = mob_kind_of(cls);
	if (k.empty()) return n == 1 ? "an armed man" : std::to_string(n) + " armed men";
	if (n == 1) return std::string(k == "ibex" ? "an" : "a") + " " + k;
	static const std::map<std::string, std::string> PLURAL{ { "wolf", "wolves" }, { "harpy", "harpies" }, { "cyclops", "cyclopes" }, { "ibex", "ibexes" } };
	const auto it = PLURAL.find(k);
	return std::to_string(n) + " " + (it != PLURAL.end() ? it->second : k + "s");
}

static constexpr int AI_EVERY = 3; // ticks between a lair's decisions (staggered by lair id)
static constexpr double WANDER = 4; // tiles round the lair the pack mills about
static constexpr double WANDER_TICKS = 80; // ticks between wander moves (jittered)
static constexpr double HOME_R = 3; // the pack is home this near the lair
static constexpr double ASSIST = 20; // lairs of the same kind this near join a fight
static constexpr double REGEN = 0.04; // share of max hp regained per second, returning or idle at home
static constexpr double FLEE_TICKS = 60; // a fleeing herd runs this long before it heads home
static constexpr double RESPAWN_RETRY = 100; // ... and between tries while foes stand near it
static constexpr double RESPAWN_CLEAR = 20; // no foe this near the lair when it comes back

Mobs::Mobs(const MobRegion &r, MobHost &h) : rule(depth_rule(r.depth)), region(r), host(h), raidAt(data().depth.host.raid.every) {
	int id = 0;
	for (const ClaimEntry &c : region.claimPoints) {
		Claim k;
		k.id = id++;
		k.x = c.x;
		k.y = c.y;
		k.r = c.r ? *c.r : T().CLAIM.r;
		k.lairs = c.lairs;
		claims.push_back(k);
	}
}

MobSquad *Mobs::sq(int id) {
	auto &s = host.squads();
	return id >= 0 && id < int(s.size()) ? &s[id] : nullptr;
}

static void pack_hp(const MobSquad &s, double &hp, double &max) {
	hp = 0, max = 0;
	for (const MobUnit &u : s.units)
		if (u.alive) hp += u.hp, max += u.maxHp;
}

// Nearest foe (any team but `team`) unit within r of (x,y): [squad id, distance], [-1, Infinity] none.
std::pair<int, double> Mobs::nearest_foe(int team, double x, double y, double r) {
	int best = -1;
	double bd = r * r;
	for (const MobSquad &s : host.squads()) {
		if (s.team == team || s.alive == 0 || sq2(s.cx - x) + sq2(s.cy - y) > sq2(r + 30)) continue;
		for (const MobUnit &u : s.units) {
			if (!u.alive) continue;
			const double d = sq2(u.x - x) + sq2(u.y - y);
			if (d < bd) bd = d, best = s.id;
		}
	}
	return { best, best < 0 ? INF : std::sqrt(bd) };
}

void Mobs::spawn_lair(Lair &l) {
	const HostRules &H = data().depth.host;
	const double ghp = l.captain ? H.guard.hp : 1, gdmg = l.captain ? H.guard.dmg : 1;
	const ChiefKind *ck = l.chief ? chief_kind(l.chief->id) : nullptr;
	SpawnScale k;
	k.hp = rule.mob * ghp;
	k.dmg = rule.mob * gdmg;
	if (ck) {
		k.has_lead = true;
		k.lead.hp = ck->hp;
		k.lead.dmg = ck->dmg;
		k.lead.armor = ck->armor;
	} else if (l.captain || l.lead) {
		k.has_lead = true;
		k.lead.hp = H.captain.hp;
		k.lead.dmg = H.captain.dmg;
	}
	l.squad = host.spawn(l.kind, l.count, l.x, l.y, k);
	l.capAlive = l.captain;
	if (l.chief) l.chiefAlive = true;
	l.raidUntil = 0;
	if (l.def.base == "militia") host.order({ "formation", l.squad, 0, 0, -1, -1, "loose" });
	l.state = HOME;
	l.cleared = false;
	l.wanderAt = tick_ + 20 + std::fmod(l.id * 7, WANDER_TICKS);
	l.hpSeen = INF;
	l.foe = -1;
	if (!l.nodes.empty()) host.lock_nodes(l.nodes, true);
	if (l.post >= 0) host.order({ "move", l.squad, l.x, l.y }); // up onto its tower
	holding();
}

// The region is held while a host captain or the boss lives.
void Mobs::holding() {
	bool on = false;
	for (const BossGate &g : gates) on = on || g.alive;
	if (!on)
		for (const Lair &l : lairs) on = on || (l.captain && !l.cleared && l.capAlive);
	if (on != held_) {
		held_ = on;
		host.held(on);
	}
}

const Mobs::Claim *Mobs::zone_of(const Lair &l) const {
	for (const Claim &c : claims)
		if (std::find(c.lairs.begin(), c.lairs.end(), l.id) != c.lairs.end()) return &c;
	return nullptr;
}

void Mobs::go_home(Lair &l) {
	l.state = RETURN;
	l.foe = -1;
	host.order({ "move", l.squad, l.x, l.y });
}

void Mobs::aggro(Lair &l, int foe) {
	l.foe = foe;
	if (l.def.passive) {
		// run off away from the foe, about half the leash from the lair
		const MobSquad *f = sq(foe);
		const double dx = l.x - f->cx, dy = l.y - f->cy;
		double d = js::hypot(dx, dy);
		if (!(d != 0) || std::isnan(d)) d = 1; // `|| 1`
		const double k = l.def.leash * 0.5;
		const double x = std::min(host.w - 2, std::max(1.0, l.x + (dx / d) * k)), y = std::min(host.h - 2, std::max(1.0, l.y + (dy / d) * k));
		if (l.state != FLEE) {
			const MobSquad *s = sq(l.squad);
			host.note({ "mobScatter", l.id, l.kind, s->cx, s->cy });
		}
		l.state = FLEE;
		l.fleeUntil = tick_ + FLEE_TICKS;
		host.order({ "move", l.squad, x, y });
		return;
	}
	l.state = CHASE;
	host.order({ "attack", l.squad, 0, 0, foe });
}

void Mobs::heal(MobSquad &s) {
	for (MobUnit &u : s.units)
		if (u.alive) u.hp = std::min(u.maxHp, u.hp + u.maxHp * REGEN * 0.1 * AI_EVERY);
}

void Mobs::think(Lair &l) {
	const int MOB_TEAM = T().MOB_TEAM;
	MobSquad *s = sq(l.squad);
	if (l.capAlive && !(!s->units.empty() && s->units[0].alive)) {
		l.capAlive = false;
		host.captain_down(l.id, l.foe >= 0 ? sq(l.foe)->team : -1);
		holding();
	}
	s = sq(l.squad);
	if (l.chiefAlive && !(!s->units.empty() && s->units[0].alive)) {
		l.chiefAlive = false;
		const MobUnit *u = s->units.empty() ? nullptr : &s->units[0];
		host.chief_down(l.id, *l.chief, u ? u->x : s->cx, u ? u->y : s->cy, l.foe >= 0 ? sq(l.foe)->team : -1);
	}
	s = sq(l.squad);
	if (s->alive == 0) {
		l.cleared = true;
		l.capAlive = false;
		host.note({ "lairCleared", l.id, l.kind, l.x, l.y }); // W-81: an event on the tick (offline the mastery chip counts on events)
		l.respawnAt = tick_ + (l.chief ? chief_respawn(depth_of(region.depth)) : rule.respawn);
		holding();
		l.state = HOME;
		if (!l.nodes.empty()) host.lock_nodes(l.nodes, false);
		return;
	}
	const double dHome = js::hypot(s->cx - l.x, s->cy - l.y);
	double hp, max;
	pack_hp(*s, hp, max);
	const bool hurt = l.hpSeen != INF && hp < l.hpSeen - 1e-6; // W-208: a first look (a fresh or a healed pack) has nothing to compare with
	l.hpSeen = hp;
	if (l.state == RAID) {
		// M7c: a host's raid party at a cart: home once it is gone or the raid has run its time
		if (tick_ >= l.raidUntil || s->order != "attackBuilding") go_home(l);
		return;
	}
	if (l.state == HOME) {
		int foe = nearest_foe(MOB_TEAM, s->cx, s->cy, l.def.aggro).first;
		if (foe < 0 && hurt) foe = nearest_foe(MOB_TEAM, s->cx, s->cy, l.def.leash * 1.5).first; // shot at from further off
		if (foe >= 0) {
			if (!l.def.cry.empty()) host.note({ "mobCry", l.id, l.kind, s->cx, s->cy });
			aggro(l, foe);
			if (!l.def.passive)
				for (Lair &o : lairs)
					if (&o != &l && !o.cleared && o.kind == l.kind && o.state == HOME && js::hypot(o.x - l.x, o.y - l.y) < ASSIST) aggro(o, foe);
			return;
		}
		if (hp < max) heal(*s);
		if (l.post < 0 && tick_ >= l.wanderAt) {
			l.wanderAt = tick_ + js::round(WANDER_TICKS * host.range(0.6, 1.4));
			const double x = l.x + host.range(-WANDER, WANDER);
			const double y = l.y + host.range(-WANDER, WANDER);
			host.order({ "move", l.squad, x, y });
		}
	} else if (l.state == CHASE) {
		const MobSquad *f = l.foe >= 0 ? sq(l.foe) : nullptr;
		// past the leash, the foe gone, or a skittish pack bloodied (a chief's never breaks): back to the lair
		const double skittish = l.chiefAlive ? 0 : l.def.skittish.value_or(0);
		if (dHome > l.def.leash || !f || f->alive == 0 || s->order != "attack" || (skittish != 0 && hp < max * skittish)) {
			const int next = f && f->alive > 0 ? -1 : nearest_foe(MOB_TEAM, s->cx, s->cy, l.def.aggro).first;
			const bool broke = skittish != 0 && hp < max * skittish;
			if (next >= 0 && dHome <= l.def.leash && !broke) aggro(l, next);
			else {
				if (broke) host.note({ "mobScatter", l.id, l.kind, s->cx, s->cy });
				go_home(l);
			}
		} else if (s->target != l.foe) l.foe = s->target; // the sim's attack moved on to the nearest foe
	} else if (l.state == FLEE) {
		if (tick_ >= l.fleeUntil || host.arrived(l.squad)) {
			const int foe = nearest_foe(MOB_TEAM, s->cx, s->cy, l.def.aggro).first;
			if (foe >= 0 && tick_ < l.fleeUntil + FLEE_TICKS * 3) aggro(l, foe);
			else go_home(l);
		}
	} else {
		// return: marching home, no fight, healing
		heal(*s);
		if (dHome < HOME_R || host.arrived(l.squad)) {
			l.state = HOME;
			l.hpSeen = INF;
			l.wanderAt = tick_ + WANDER_TICKS;
			if (l.post >= 0) host.order({ "move", l.squad, l.x, l.y });
			else host.order({ "hold", l.squad });
		}
	}
}

void Mobs::respawn(Lair &l) {
	if (l.once || tick_ < l.respawnAt) return;
	const Claim *z = zone_of(l);
	if ((z && z->team >= 0) || host.influenced(l.x, l.y)) {
		l.respawnAt = tick_ + rule.respawn; // claimed ground: it stays clear (checked again later)
		return;
	}
	if (nearest_foe(T().MOB_TEAM, l.x, l.y, RESPAWN_CLEAR).first >= 0) {
		l.respawnAt = tick_ + RESPAWN_RETRY;
		return;
	}
	spawn_lair(l);
}

// The zone is open: no boss lives, and its guard lairs are cleared (herds never hold a zone); a zone with a host captain
// opens once every captain of it has fallen, his guard and the other lairs notwithstanding.
bool Mobs::zone_open(const Claim &c) const {
	for (const BossGate &g : gates)
		if (g.alive) return false;
	const auto at = [&](int i) -> const Lair * { return i >= 0 && i < int(lairs.size()) ? &lairs[i] : nullptr; };
	bool caps = false, all = true;
	for (int i : c.lairs)
		if (at(i) && at(i)->captain) {
			caps = true;
			all = all && (at(i)->cleared || !at(i)->capAlive);
		}
	if (caps) return all;
	for (int i : c.lairs)
		if (!(!at(i) || at(i)->cleared || at(i)->def.passive)) return false;
	return true;
}

// A fighting man of `team` stands within the point's radius (a held point's defenders: cleared before it is taken).
bool Mobs::defended(int team, const Claim &c) {
	for (const MobSquad &q : host.squads()) {
		if (q.team != team || q.alive == 0 || q.civ || sq2(q.cx - c.x) + sq2(q.cy - c.y) > sq2(c.r + 30)) continue;
		for (const MobUnit &u : q.units)
			if (u.alive && sq2(u.x - c.x) + sq2(u.y - c.y) <= c.r * c.r) return true;
	}
	return false;
}

// A squad channelling (or on its way to) claim point c.
bool Mobs::claiming(const MobSquad *s, const Claim &c) const { return s && s->alive > 0 && s->claimPt == c.id && s->order == "claimRegion"; }

void Mobs::channel(Claim &c) {
	const MobTables &M = T();
	MobSquad *s = c.squad >= 0 ? sq(c.squad) : nullptr;
	if (!claiming(s, c) && s) {
		// the lead fell or went: another squad of its team on the point carries on
		const int team = s->team;
		s = nullptr;
		for (MobSquad &q : host.squads())
			if (q.team == team && claiming(&q, c)) {
				s = &q;
				break;
			}
		if (s) c.squad = s->id;
	}
	if (!s || !claiming(s, c) || c.team == s->team) {
		c.squad = -1;
		c.progress = 0;
		c.contested = false;
		return;
	}
	// M7c: the team's men beside the banner (any of its squads), of enough players
	const int team = s->team;
	double men = 0, coming = 0;
	std::set<std::string> players; // only its size is read
	for (const MobSquad &q : host.squads()) {
		if (q.team != team || q.alive == 0) continue;
		if (claiming(&q, c)) coming += q.alive;
		if (sq2(q.cx - c.x) + sq2(q.cy - c.y) > sq2(M.CLAIM.at + 12)) continue;
		double here = 0;
		for (const MobUnit &u : q.units)
			if (u.alive && sq2(u.x - c.x) + sq2(u.y - c.y) <= M.CLAIM.at * M.CLAIM.at) here++;
		if (here != 0) men += here, players.insert(q.owner);
	}
	if (men < std::min(rule.claim.men, coming) || double(players.size()) < rule.claim.players) return; // on the way, or too few
	c.contested = nearest_foe(team, c.x, c.y, M.CLAIM.contest).first >= 0 || !zone_open(c) || (c.team >= 0 && defended(c.team, c));
	if (c.contested) {
		c.progress = 0;
		return;
	}
	if (++c.progress < rule.claim.ticks) return;
	const int from = c.team;
	c.team = team;
	c.squad = -1;
	c.progress = 0;
	host.claim(team, c.x, c.y, c.r, from >= 0 ? std::optional<int>(from) : std::nullopt);
	for (size_t i = 0; i < host.squads().size(); i++) {
		const MobSquad &q = host.squads()[i];
		if (q.team == team && claiming(&q, c)) host.order({ "hold", q.id });
	}
}

// M7c: every HOST.raid.every ticks a host lair (not the captain's) goes for the nearest foe cart in reach.
void Mobs::raid() {
	const HostRules &H = data().depth.host;
	raidAt = tick_ + H.raid.every;
	if (!held_ || !host.has_carts()) return;
	const std::vector<MobCart> carts = host.carts();
	Lair *best = nullptr;
	int cart = -1;
	double bd = sq2(H.raid.r);
	for (Lair &l : lairs) {
		if (l.captain || l.cleared || l.kind != "bandit" || l.state != HOME) continue;
		for (const MobCart &e : carts) {
			const double d = sq2(e.x - l.x) + sq2(e.y - l.y);
			if (d < bd) bd = d, best = &l, cart = e.id;
		}
	}
	if (!best) return;
	best->state = RAID;
	best->raidUntil = tick_ + H.raid.every / 3;
	MobOrder o{ "attackBuilding", best->squad };
	o.siege = cart;
	host.order(o);
}

ChiefSnap Mobs::chief_snap(const Lair &l, const MobSquad *s) {
	const WarChief &c = *l.chief;
	const ChiefKind *k = chief_kind(c.id);
	ChiefSnap o;
	o.id = c.id;
	o.name = c.name;
	o.title = c.title;
	o.unit = s && !s->units.empty() && s->units[0].id >= 0 ? s->units[0].id : -1;
	o.alive = !l.cleared && l.chiefAlive;
	o.scale = k->scale;
	o.tint = k->tint;
	return o;
}

void Mobs::set_boss(const std::optional<std::string> &id) {
	if (!id) gates.clear();
	else {
		BossGate *g = nullptr;
		for (BossGate &x : gates)
			if (x.id == *id) {
				g = &x;
				break;
			}
		if (g) g->alive = true;
		else gates.push_back({ *id, true });
	}
	holding();
}

void Mobs::boss_down(const std::optional<std::string> &id) {
	for (BossGate &g : gates)
		if (!id || g.id == *id) g.alive = false;
	holding();
}

void Mobs::grant(int i, int team) {
	if (i < 0 || i >= int(claims.size())) return;
	Claim &c = claims[i];
	if (c.team == team || team < 0) return;
	const int from = c.team;
	c.team = team;
	c.squad = -1;
	c.progress = 0;
	host.claim(team, c.x, c.y, c.r, from >= 0 ? std::optional<int>(from) : std::nullopt);
}

bool Mobs::claimed() const {
	for (const Claim &c : claims)
		if (c.team >= 0) return true;
	return false;
}

void Mobs::spawn() {
	if (spawned) return;
	spawned = true;
	const MobTables &M = T();
	const std::vector<MobNode> nodes = host.nodes();
	std::vector<Lair> added = std::move(lairs); // W-62: lairs added before keep their squads, after the region's (claim zones index those)
	lairs.clear();
	int id = 0;
	for (const LairEntry &d : region.lairs) {
		const MobDef &def = M.MOBS.at(d.kind);
		Lair l;
		if (!def.passive)
			for (const MobNode &n : nodes)
				if (n.has_obj && sq2(n.x - d.x) + sq2(n.y - d.y) <= M.GUARD_R * M.GUARD_R) l.nodes.push_back(n.id);
		const bool captain = d.captain && d.kind == "bandit";
		const WarChief *chief = d.chief ? war_chief(*d.chief) : nullptr;
		const ChiefKind *ck = chief ? chief_kind(chief->id) : nullptr;
		l.id = id++;
		l.kind = d.kind;
		l.def = def;
		l.x = d.x;
		l.y = d.y;
		l.count = d.count ? *d.count : captain ? 12 : ck ? ck->escort + 1 : def.count;
		if (chief && ck) l.chief = *chief;
		l.captain = captain;
		lairs.push_back(std::move(l));
	}
	// M7c: the host's other bandit lairs of a captain's zone stand on its towers, nearest first
	bool any_captain = false;
	for (const Lair &l : lairs) any_captain = any_captain || l.captain;
	const std::vector<MobTower> towers = any_captain ? host.towers() : std::vector<MobTower>{};
	std::set<int> taken; // membership only
	const auto at = [&](int i) -> Lair * { return i >= 0 && i < int(lairs.size()) ? &lairs[i] : nullptr; };
	for (const Claim &c : claims) {
		bool has_cap = false;
		for (int i : c.lairs) has_cap = has_cap || (at(i) && at(i)->captain);
		if (!has_cap) continue;
		for (int i : c.lairs) {
			Lair *l = at(i);
			if (!l || l->captain || l->kind != "bandit") continue;
			int best = -1;
			double bd = INF;
			for (int k = 0; k < int(towers.size()); k++) {
				const double d = sq2(towers[k].x - l->x) + sq2(towers[k].y - l->y);
				if (!taken.count(k) && d < bd) bd = d, best = k;
			}
			if (best < 0) continue;
			taken.insert(best);
			l->post = towers[best].id;
			l->x = towers[best].x;
			l->y = towers[best].y;
		}
	}
	for (Lair &l : lairs) spawn_lair(l);
	for (Lair &l : added) {
		l.id = int(lairs.size());
		lairs.push_back(std::move(l));
	}
}

bool Mobs::added() const {
	for (const Lair &l : lairs)
		if (l.once) return true;
	return false;
}

int Mobs::add(const AddLair &d) {
	const MobDef &def = T().MOBS.at(d.kind);
	const WarChief *chief = d.chief ? war_chief(*d.chief) : nullptr;
	const ChiefKind *ck = chief ? chief_kind(chief->id) : nullptr;
	Lair l;
	l.id = int(lairs.size());
	l.kind = d.kind;
	l.def = def;
	l.x = d.x;
	l.y = d.y;
	l.count = d.count ? *d.count : ck ? ck->escort + 1 : def.count;
	if (chief && ck) l.chief = *chief;
	l.once = true;
	l.lead = d.lead;
	lairs.push_back(std::move(l));
	spawn_lair(lairs.back());
	return lairs.back().id;
}

bool Mobs::start_claim(int squad, int point) {
	Claim *c = point >= 0 && point < int(claims.size()) ? &claims[point] : nullptr;
	const MobSquad *s = sq(squad);
	if (!c || !s || c->team == s->team || !zone_open(*c)) return false;
	c->squad = squad;
	c->progress = 0;
	c->contested = false;
	return true;
}

void Mobs::tick(double t) {
	tick_ = t;
	if (t >= raidAt) raid();
	for (Lair &l : lairs) {
		if (l.cleared) respawn(l);
		else if (std::fmod(t + l.id, AI_EVERY) == 0) think(l);
	}
	for (Claim &c : claims) channel(c);
}

static const char *state_name(Mobs::State s) {
	switch (s) {
		case Mobs::HOME: return "home";
		case Mobs::CHASE: return "chase";
		case Mobs::RETURN: return "return";
		case Mobs::FLEE: return "flee";
		default: return "raid";
	}
}

std::vector<LairSnap> Mobs::lair_snaps() {
	std::vector<LairSnap> out;
	for (const Lair &l : lairs) {
		const MobSquad *s = l.squad >= 0 ? sq(l.squad) : nullptr;
		LairSnap o;
		o.id = l.id;
		o.kind = l.kind;
		o.x = l.x;
		o.y = l.y;
		o.squad = l.squad;
		o.alive = l.cleared ? 0 : s ? s->alive : 0;
		o.count = l.count;
		o.state = l.cleared ? "cleared" : l.state == RAID ? "chase" : state_name(l.state);
		o.aggro = l.def.aggro;
		o.leash = l.def.leash;
		o.guard = l.def.passive ? 0 : T().GUARD_R;
		o.nodes = int(l.nodes.size());
		if (l.captain) o.captain = l.capAlive;
		if (l.chief) o.chief = chief_snap(l, s);
		if (l.cleared) o.respawnIn = std::max(0.0, l.respawnAt - tick_);
		out.push_back(std::move(o));
	}
	return out;
}

std::vector<ClaimSnap> Mobs::claim_snaps() {
	std::vector<ClaimSnap> out;
	for (const Claim &c : claims) {
		ClaimSnap o;
		o.id = c.id;
		o.x = c.x;
		o.y = c.y;
		o.team = c.team;
		o.squad = c.squad;
		o.progress = c.progress / rule.claim.ticks;
		o.lairs = c.lairs;
		o.men = rule.claim.men;
		o.players = rule.claim.players;
		o.state = c.team >= 0 ? "claimed" : !zone_open(c) ? "locked" : c.squad < 0 ? "open" : c.contested ? "contested" : "channel";
		// a held point being taken: the attacker's team and how the channel stands (progress and squad as above)
		if (c.team >= 0 && c.squad >= 0) {
			o.taking = !c.contested ? "channel" : defended(c.team, c) ? "defended" : "contested";
			const MobSquad *s = sq(c.squad);
			o.by = s ? s->team : -1;
		}
		out.push_back(std::move(o));
	}
	return out;
}

} // namespace sim
