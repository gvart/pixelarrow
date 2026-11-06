// The W-53 regroup (detach, join, regroup, move), the W-63 turns (turnSquad, standDown, rebanner), the capture of a held
// claim point, the micro `man` order and the W-153 oath (setLiege) of the live war sim (src/war/sim/index.ts), line
// for line, as Sim members.
#include <algorithm>
#include <cmath>
#include <set>

#include "js_math.h"
#include "sim.h"
#include "sim_data.h"

namespace sim {

namespace {

constexpr double INF = std::numeric_limits<double>::infinity();
constexpr double RAMP_FROM = 0.6; // as sim.cpp
constexpr int SQUAD_MAX = 12; // soldiers.ts SQUAD_MAX
constexpr double BACK_DIST = 7; // TS BACK.dist

double sq(double v) { return v * v; }

} // namespace

// A new squad of s's owner and team takes these living units of s, holding where they stand (W-53: in the slot of an
// emptied squad of the same owner and team, if any, so regrouping does not grow the squad list). Bandages split by men.
Squad *Sim::detach(Squad &s, const std::vector<Unit *> &picked) {
	if (picked.empty()) return nullptr;
	double x = 0;
	double y = 0;
	for (Unit *u : picked) x += u->x, y += u->y;
	const auto [ax, ay] = openPoint(x / double(picked.size()), y / double(picked.size()));
	Squad *old = nullptr;
	for (Squad *q : squads)
		if (q->spare && q->owner == s.owner && q->team == s.team) {
			old = q;
			break;
		}
	const int bandages = int(std::floor((double(s.bandages) * double(picked.size())) / std::max(1, s.alive)));
	Squad ns = s; // {...s, ...}
	ns.id = old ? old->id : int(squads.size());
	ns.units = old ? old->units : std::vector<Unit *>{};
	ns.alive = 0;
	ns.ax = ax, ns.ay = ay, ns.cx = ax, ns.cy = ay;
	ns.side = 0;
	ns.ramp = RAMP_FROM;
	ns.path.clear();
	ns.pi = 0;
	ns.order = "hold";
	ns.target = -1;
	ns.goal.reset();
	ns.near.clear();
	ns.sites.clear();
	ns.node = -1;
	ns.fixed.reset();
	ns.col.reset();
	ns.siege = -1;
	ns.task.reset();
	ns.claimPt = -1;
	ns.spare = false;
	ns.flee = false;
	ns.calm = 0;
	ns.resume.reset();
	ns.cartDrop = -1;
	ns.atEase = 0;
	ns.work = -1;
	ns.bandages = bandages;
	ns.xfer.reset();
	ns.escort = -1;
	ns.salv.reset();
	ns.soul = -1;
	ns.slot_ok = false; // formSlot's cache (a pure function of the anchor, facing, side and offsets) starts afresh
	s.bandages -= bandages;
	Squad *n = old;
	if (old) *old = ns;
	else {
		n = new Squad(ns);
		squads.push_back(n);
	}
	moveMen(s, *n, picked);
	if (s.order == "gather" || s.order == "build")
		for (Unit *u : picked) works->set_job(*u, "");
	scanNear();
	return n;
}

// Living units of s join t (merge, regroup): they drop their jobs and take up t's work order; s, emptied, holds and is spare.
void Sim::join(Squad &s, Squad &t, const std::vector<Unit *> &picked) {
	for (Unit *u : picked)
		if (!u->job.empty()) works->set_job(*u, "");
	moveMen(s, t, picked);
	if (t.order == "gather" || t.order == "build")
		for (Unit *u : picked) works->set_job(*u, t.order);
	if (s.alive > 0) return;
	s.order = "hold";
	s.path.clear();
	s.goal.reset();
	s.spare = s.siege < 0;
	t.bandages = std::min(SQUAD_MAX, t.bandages + s.bandages);
	s.bandages = 0;
}

// W-53: living men `ids` of lead's owner and team (in any of his squads) gathered for one order: soldiers and civilians
// apart, at most SQUAD_MAX a squad. Within each: the biggest squad given whole is the host and takes the rest in; with
// none whole the biggest share leaves its squad as a new one. Men left behind keep their order.
std::vector<Squad *> Sim::regroup(Squad &lead, const std::vector<int> &ids) {
	std::set<const Unit *> seen; // only looked up
	std::vector<Unit *> kinds[2];
	for (int id : ids) {
		Unit *u = id >= 0 && size_t(id) < units.size() ? units[id] : nullptr;
		if (!u || !u->alive || seen.count(u) || u->squad->owner != lead.owner || u->squad->team != lead.team) continue;
		seen.insert(u);
		kinds[u->squad->civ ? 1 : 0].push_back(u);
	}
	std::vector<Squad *> out;
	for (const std::vector<Unit *> &kind : kinds)
		for (size_t k = 0; k < kind.size(); k += SQUAD_MAX) {
			std::vector<std::pair<Squad *, std::vector<Unit *>>> from; // a JS Map: insertion order
			for (size_t i = k; i < std::min(kind.size(), k + SQUAD_MAX); i++) {
				Unit *u = kind[i];
				auto it = std::find_if(from.begin(), from.end(), [&](const auto &e) { return e.first == u->squad; });
				if (it == from.end()) from.push_back({ u->squad, { u } });
				else it->second.push_back(u);
			}
			Squad *host = nullptr;
			size_t most = 0;
			bool any = false;
			for (size_t i = 0; i < from.size(); i++) {
				Squad *q = from[i].first;
				const size_t n = from[i].second.size();
				if (int(n) == q->alive && (!host || q->alive > host->alive)) host = q;
				if (!any || n > from[most].second.size()) most = i, any = true;
			}
			if (!host) {
				host = detach(*from[most].first, from[most].second);
				from.erase(from.begin() + ptrdiff_t(most));
			}
			for (auto &[q, us] : from)
				if (q != host) join(*q, *host, us);
			out.push_back(host);
		}
	return out;
}

// Living units leave s for t (and take up t's work order, if any); both re-form.
void Sim::moveMen(Squad &s, Squad &t, const std::vector<Unit *> &picked) {
	const std::set<const Unit *> set(picked.begin(), picked.end()); // only looked up
	s.units.erase(std::remove_if(s.units.begin(), s.units.end(), [&](Unit *u) { return set.count(u) > 0; }), s.units.end());
	s.alive -= int(picked.size());
	for (Unit *u : picked) {
		u->squad = &t;
		u->Worker::squad = &t;
		u->back = false;
		u->settled = false;
		u->own.clear();
		u->wp = 0;
		u->tgt = nullptr;
		t.units.push_back(u);
	}
	t.alive += int(picked.size());
	t.spare = false;
	if (s.alive > 0) reslot(s);
	reslot(t);
}

// W-63: squad s fights under `team` from now (WarBuildSim.turnSquad).
bool Sim::turnSquad(int id, int team) {
	Squad *sp = id >= 0 && size_t(id) < squads.size() ? squads[id] : nullptr;
	if (!sp || sp->alive == 0 || sp->team == team || team < 0) return false;
	Squad &s = *sp;
	// its own business drops first (as a stop order would), the crew leaves its engine
	if (s.siege >= 0) uncrew(s);
	dropJobs(s);
	s.xfer.reset();
	s.escort = -1;
	s.salv.reset();
	s.task.reset();
	s.claimPt = -1;
	s.soul = -1;
	s.work = -1;
	s.sites.clear();
	s.node = -1;
	s.flee = false;
	s.resume.reset();
	s.order = "hold";
	s.path.clear();
	s.pi = 0;
	s.goal.reset();
	s.target = -1;
	s.fixed.reset();
	std::tie(s.ax, s.ay) = openPoint(s.cx, s.cy);
	s.team = team;
	s.spare = false;
	for (Unit *u : s.units) u->tgt = nullptr, u->fighting = false, u->striking = false, u->own.clear(), u->wp = 0, u->settled = false;
	// squads now of its team stop fighting it; every man aiming at a friend drops his mark
	for (Squad *q : squads) {
		if (q == &s || q->team != team) continue;
		if (q->target == s.id) {
			q->target = -1;
			if (q->order == "attack") q->order = "hold", q->path.clear(), q->goal.reset();
		}
	}
	for (Unit *u : units)
		if (u->tgt && u->tgt->squad->team == u->squad->team) u->tgt = nullptr;
	scanNear(); // friends now foes see it at once
	return true;
}

// Civilians of another team at work in buildings `ids` (they changed hands to `team`) stand down.
void Sim::standDown(const std::vector<int> &ids, int team) {
	for (Squad *s : squads)
		if (s->order == "civWork" && std::find(ids.begin(), ids.end(), s->work) != ids.end() && s->team != team)
			s->order = "hold", s->work = -1, s->fixed.reset(), s->path.clear(), s->goal.reset();
}

// W-63: the town round centre piece `centre` goes to `team` (WarBuildSim.rebanner).
std::vector<int> Sim::rebanner(int centre, int team) {
	townLv->measure();
	const TownLevel *t = townLv->town(centre);
	if (!t || t->team == team || team < 0) return {};
	const std::vector<int> ids = townLv->members(centre);
	works->set_teams(ids, team);
	standDown(ids, team);
	townLv->measure();
	return ids;
}

// A claim point held by `from` taken by `team` (mobs.h): its pre-built pieces follow the point (works), and every built
// piece of `from` within its radius r goes to `team` at the hp it has, stores with their goods; a piece of a town whose
// centre stands outside the radius stays with its town (a W-63 settlement follows its own banner: rebanner).
void Sim::capture(int from, int team, double x, double y, double r) {
	townLv->measure();
	std::vector<int> ids;
	for (const Building &b : works->all()) {
		if (b.pre || b.cancelled || b.team != from || b.state == "destroyed" || sq(b.x - x) + sq(b.y - y) > r * r) continue;
		const TownLevel *t = townLv->town_at(from, b.x, b.y);
		if (t && sq(t->x - x) + sq(t->y - y) > r * r) continue;
		ids.push_back(b.id);
	}
	works->set_teams(ids, team);
	standDown(ids, team);
	townLv->measure();
}

// micro: one man of s falls back, swaps to the rear rank or rejoins his slot (Order kind 'man').
void Sim::manOrder(Squad &s, int id, const std::string &act) {
	Unit *up = id >= 0 && size_t(id) < units.size() ? units[id] : nullptr;
	if (!up || !up->alive || up->squad != &s || s.civ || up->pin || !up->civ.empty()) return;
	Unit &u = *up;
	const auto loose = [](Unit &m) { m.settled = false, m.best = INF, m.stall = 0, m.own.clear(), m.oi = 0, m.wp = 0; };
	if (act == "fallBack") {
		if (!u.job.empty()) works->set_job(u, "");
		u.back = true;
		u.tgt = nullptr;
		u.fighting = u.striking = false;
		loose(u);
		backPoint(u);
		return;
	}
	if (act == "rejoin") {
		if (!u.back) return;
		u.back = false;
		loose(u);
		return;
	}
	// rear: the slot of the nearest man (across the block) in its rearmost rank, if he is not in it already
	u.back = false;
	loose(u);
	const int n = int(s.offsets.size() / 2);
	const auto fwd = [&](const Unit &m) { return m.slot < n ? s.offsets[size_t(m.slot) * 2] : 0.0; };
	const auto side = [&](const Unit &m) { return m.slot < n ? s.offsets[size_t(m.slot) * 2 + 1] : 0.0; };
	double rear = INF;
	for (Unit *m : s.units)
		if (m->alive) rear = std::min(rear, fwd(*m));
	if (fwd(u) < rear + 0.5) return;
	Unit *w = nullptr;
	for (Unit *m : s.units) {
		if (!m->alive || m == &u || m->back || fwd(*m) >= rear + 0.5) continue;
		if (!w || std::abs(side(*m) - side(u)) < std::abs(side(*w) - side(u))) w = m;
	}
	if (!w) return;
	std::swap(u.slot, w->slot);
	loose(*w);
}

// W-153: the room's oath order: he pays `to` from now; what is set aside follows a new liege, or goes back to him.
void Sim::setLiege(const std::string &owner, const std::optional<std::string> &to, double pct) {
	const auto l = works->lieges.find(owner);
	const std::optional<double> was = tithe_seal(l != works->lieges.end() ? std::optional<std::string>(l->second.to) : std::nullopt), now = tithe_seal(to);
	if (to && !to->empty()) works->lieges[owner] = { *to, pct };
	else works->lieges.erase(owner);
	if (!was || was == now) return;
	const auto reseal = [&](Hold *h) {
		if (!h) return;
		for (Lot &lot : h->lots)
			if (lot.s == was) lot.s = now;
	};
	for (Hold *h : works->owned_holds(owner)) reseal(h);
	for (Unit *u : units)
		if (u->squad->owner == owner) reseal(u->pack ? &*u->pack : nullptr);
	for (Hold *h : siege->cart_holds(owner)) reseal(h);
}

} // namespace sim
