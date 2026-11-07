// index.ts snapshot(), line for line (see snapshot.h).
#include "snapshot.h"

#include <cmath>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/string.hpp>

#include "bosses.h"
#include "civilians.h"
#include "crafting.h"
#include "holders.h"
#include "js_math.h"
#include "landmarks.h"
#include "mobs.h"
#include "prebuilt.h"
#include "roam.h"
#include "sim_data.h"
#include "souls.h"
#include "town_level.h"
#include "trade.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::Variant;

static godot::String G(const std::string &s) { return godot::String::utf8(s.c_str()); }

static Dictionary cost_dict(const Cost &c) {
	Dictionary d;
	for (const auto &[k, v] : c.kv) d[G(k)] = v;
	return d;
}

static Array item_rows(const std::vector<HoldItem> &l) {
	Array out;
	for (const HoldItem &it : l) {
		Dictionary e;
		e["uid"] = G(it.uid);
		e["def"] = G(it.def);
		e["rarity"] = G(it.rarity);
		if (it.q) e["q"] = *it.q;
		out.push_back(e);
	}
	return out;
}

static Array int_rows(const std::vector<int> &v) {
	Array a;
	for (int x : v) a.push_back(x);
	return a;
}

static Dictionary unit_snap(Sim &s, Unit &u) {
	const int tick = s.tick;
	// in reach of a foe still standing, or the blow just dealt felled it
	const bool atk = u.alive && u.striking && ((u.tgt && u.tgt->alive) || u.swingAt == tick - 1 || u.squad->task.has_value());
	const int t = s.grid->tile_at(u.x, u.y);
	const int on = s.works->on_building(t);
	Dictionary d;
	d["id"] = u.id;
	d["squad"] = u.squad->id;
	d["x"] = u.x;
	d["y"] = u.y;
	d["facing"] = u.facing;
	d["hp"] = u.hp;
	d["maxHp"] = u.maxHp;
	d["cls"] = G(u.cls);
	d["z"] = double(s.grid->height[t]);
	if (on >= 0) d["on"] = on;
	d["state"] = !u.alive ? "dead" : atk ? "attack" : u.working ? (u.job.empty() ? godot::String("build") : G(u.job)) : u.moving ? "move" : "idle";
	if (u.alive && u.doing) d["task"] = u.doing;
	if (!u.alive) d["wounded"] = u.wounded;
	if (u.downAt) d["down"] = true;
	if (u.person) {
		d["pid"] = G(u.person->id);
		d["level"] = u.person->hero.level;
	}
	if (u.person && u.person->scars && *u.person->scars) d["scars"] = *u.person->scars;
	if (u.alive && u.civAt) {
		const std::string clip = civ_clip(u.civ);
		if (!clip.empty()) d["work"] = G(clip);
	}
	if (u.alive && u.squad->flee) d["flee"] = true;
	if (u.alive && u.load > 0) {
		d["carry"] = G(u.carry);
		d["load"] = u.load;
	}
	if (u.alive && u.pack && loads(*u.pack) > 1e-9) d["pack"] = loads(*u.pack);
	if (u.alive && u.tag > tick) d["tag"] = u.tag - tick;
	if (u.alive && u.squad->team != MOB_TEAM) d["sat"] = js::round(u.sat);
	if (u.alive && u.back) d["back"] = true;
	if (atk) {
		d["ready"] = std::max(0.0, u.cd - 1);
		if (u.swingAt >= 0) d["swing"] = tick - 1 - u.swingAt;
	}
	return d;
}

static Dictionary squad_snap(Sim &s, Squad &q) {
	const int tick = s.tick;
	Dictionary d;
	d["id"] = q.id;
	d["owner"] = G(q.owner);
	d["team"] = q.team;
	Array us;
	for (const Unit *u : q.units) us.push_back(u->id);
	d["units"] = us;
	d["order"] = G(q.order);
	if (!q.act.empty()) {
		Dictionary a;
		a["skill"] = G(q.act);
		a["ready"] = std::max(0.0, q.actReady - tick);
		a["on"] = std::max(0.0, q.actUntil - tick);
		d["active"] = a;
	}
	if (q.civ) d["civ"] = true;
	if (q.flee) d["flee"] = true;
	if (q.order == "gather" && q.cartDrop >= 0) d["cartDrop"] = q.cartDrop;
	if (q.fedUntil > tick) {
		d["fed"] = true;
		if (!q.dish.empty()) d["dish"] = G(q.dish);
	}
	if (q.bandages > 0) d["bandages"] = q.bandages;
	if (q.theriacUntil > tick) d["theriac"] = true;
	if (s.towns->blessed(q.id)) d["blessed"] = true;
	if (q.team != MOB_TEAM && q.team != NEUTRAL_TEAM && !q.civ) {
		double m = 0;
		for (const Unit *u : q.units)
			if (u->alive && u->pack) m += std::floor(amount(*u->pack, "ration")) + std::floor(amount(*u->pack, "food"));
		d["meals"] = m; // W-79: the HUD warns when the packs run low
	}
	if (!q.units.empty()) {
		const WarStats &st = q.units[0]->st;
		if (st.range > 0 && st.missile == ARROW) {
			const std::string why = s.fireBlock(q);
			Dictionary f;
			f["on"] = q.fire;
			f["available"] = why.empty();
			if (!why.empty()) f["reason"] = G(why);
			d["fireArrows"] = f;
		}
	}
	return d;
}

static const char *missile_name(Missile m) { return m == STONE ? "stone" : m == JAVELIN ? "javelin" : "arrow"; }

static Dictionary boss_snap(const BossSnap &b) {
	Dictionary d;
	d["id"] = G(b.id);
	d["name"] = G(b.name);
	d["squad"] = b.squad;
	d["unit"] = b.unit;
	d["x"] = b.x;
	d["y"] = b.y;
	d["hp"] = b.hp;
	d["maxHp"] = b.maxHp;
	d["phase"] = b.phase;
	Array ph;
	for (double v : b.phases) ph.push_back(v);
	d["phases"] = ph;
	d["state"] = G(b.state);
	d["raid"] = b.raid;
	d["scale"] = b.scale;
	if (b.parts) {
		Dictionary p;
		p["alive"] = b.parts->alive;
		p["total"] = b.parts->total;
		d["parts"] = p;
	}
	if (b.respawnIn) d["respawnIn"] = *b.respawnIn;
	if (b.fx) {
		Dictionary f;
		f["kind"] = G(b.fx->kind);
		f["x"] = b.fx->x;
		f["y"] = b.fx->y;
		f["tx"] = b.fx->tx;
		f["ty"] = b.fx->ty;
		f["r"] = b.fx->r;
		f["t"] = b.fx->t;
		d["fx"] = f;
	}
	if (b.tele) {
		Dictionary f;
		f["kind"] = G(b.tele->kind);
		f["x"] = b.tele->x;
		f["y"] = b.tele->y;
		f["tx"] = b.tele->tx;
		f["ty"] = b.tele->ty;
		f["r"] = b.tele->r;
		f["in"] = b.tele->in;
		f["of"] = b.tele->of;
		d["tele"] = f;
	}
	if (!b.hide.empty()) d["hide"] = int_rows(b.hide);
	return d;
}

static Dictionary lair_snap(const LairSnap &l) {
	Dictionary d;
	d["id"] = l.id;
	d["kind"] = G(l.kind);
	d["x"] = l.x;
	d["y"] = l.y;
	d["squad"] = l.squad;
	d["alive"] = l.alive;
	d["count"] = l.count;
	d["state"] = G(l.state);
	d["aggro"] = l.aggro;
	d["leash"] = l.leash;
	d["guard"] = l.guard;
	d["nodes"] = l.nodes;
	if (l.captain) d["captain"] = *l.captain;
	if (l.chief) {
		Dictionary c;
		c["id"] = G(l.chief->id);
		c["name"] = G(l.chief->name);
		c["title"] = G(l.chief->title);
		c["unit"] = l.chief->unit;
		c["alive"] = l.chief->alive;
		c["scale"] = l.chief->scale;
		c["tint"] = l.chief->tint;
		d["chief"] = c;
	}
	if (l.respawnIn) d["respawnIn"] = *l.respawnIn;
	return d;
}

static Dictionary claim_snap(const ClaimSnap &c) {
	Dictionary d;
	d["id"] = c.id;
	d["x"] = c.x;
	d["y"] = c.y;
	d["team"] = c.team;
	d["squad"] = c.squad;
	d["progress"] = c.progress;
	d["lairs"] = int_rows(c.lairs);
	d["men"] = c.men;
	d["players"] = c.players;
	d["state"] = G(c.state);
	if (!c.taking.empty()) {
		d["taking"] = G(c.taking);
		d["by"] = c.by;
	}
	return d;
}

Dictionary snapshot(Sim &s) {
	const int tick = s.tick;
	Dictionary out;
	out["tick"] = tick;
	Array units;
	for (Unit *u : s.units) units.push_back(unit_snap(s, *u));
	out["units"] = units;
	Array squads;
	for (Squad *q : s.squads) squads.push_back(squad_snap(s, *q));
	out["squads"] = squads;
	Array shots;
	for (const Sim::Shot &sh : s.shots) {
		Dictionary d;
		d["x0"] = sh.x0;
		d["y0"] = sh.y0;
		d["x1"] = sh.x1;
		d["y1"] = sh.y1;
		d["t0"] = sh.t0;
		d["t1"] = sh.t1;
		d["z0"] = sh.z0;
		d["z1"] = sh.z1;
		d["by"] = sh.by;
		d["kind"] = missile_name(sh.kind);
		if (sh.fire) d["fire"] = true;
		shots.push_back(d);
	}
	for (const SiegeShot &sh : s.siege->shots()) {
		Dictionary d;
		d["x0"] = sh.x0;
		d["y0"] = sh.y0;
		d["x1"] = sh.x1;
		d["y1"] = sh.y1;
		d["t0"] = sh.t0;
		d["t1"] = sh.t1;
		d["z0"] = sh.z0;
		d["z1"] = sh.z1;
		d["by"] = sh.by;
		d["kind"] = G(sh.kind);
		d["siege"] = sh.siege;
		shots.push_back(d);
	}
	out["shots"] = shots;
	Array buildings;
	for (const BuildingSnap &b : s.works->building_snaps()) {
		Dictionary d = snapDict(b);
		const auto it = data().economy.BUILDINGS.find(b.type);
		if (it != data().economy.BUILDINGS.end() && it->second.workplace) {
			const auto q = s.crafting->snaps(b.id);
			if (q) {
				Array qs;
				for (const QueueSnap &x : *q) {
					Dictionary e;
					e["id"] = x.id;
					e["recipe"] = G(x.recipe);
					e["kind"] = G(x.kind);
					e["by"] = x.by;
					e["progress"] = x.progress;
					qs.push_back(e);
				}
				d["queue"] = qs;
			}
		}
		buildings.push_back(d);
	}
	out["buildings"] = buildings;
	// Record<number, ...>: integer keys, so JS lists them ascending
	{
		auto st = s.works->stock_snap();
		std::sort(st.begin(), st.end(), [](const auto &a, const auto &b) { return a.first < b.first; });
		Dictionary stock;
		for (const auto &[team, c] : st) stock[godot::String::num_int64(team)] = cost_dict(c);
		out["stock"] = stock;
	}
	out["influenceVersion"] = s.works->influence().version;
	Array sieges;
	for (const SiegeSnap &e : s.siege->snaps(tick)) sieges.push_back(siegeSnapDict(e));
	out["sieges"] = sieges;
	if (!s.mobRegion.lairs.empty() || !s.mobRegion.claimPoints.empty() || s.mobs->added()) {
		Array lairs, claims;
		for (const LairSnap &l : s.mobs->lair_snaps()) lairs.push_back(lair_snap(l));
		for (const ClaimSnap &c : s.mobs->claim_snaps()) claims.push_back(claim_snap(c));
		out["lairs"] = lairs;
		out["claims"] = claims;
	}
	if (s.bosses->any()) {
		Array bs;
		for (const BossSnap &b : s.bosses->snaps()) bs.push_back(boss_snap(b));
		out["bosses"] = bs;
		if (const auto w = s.bosses->warden_snap()) {
			Dictionary d;
			d["x"] = w->x;
			d["y"] = w->y;
			d["w"] = w->w;
			d["h"] = w->h;
			d["in"] = w->in;
			out["warden"] = d;
		}
	}
	if (!s.region.prebuilt.empty()) {
		Array ts;
		for (const TownSnap &t : s.towns->towns()) {
			Dictionary o;
			o["claim"] = t.claim;
			o["team"] = t.team;
			o["houses"] = t.houses;
			o["standing"] = t.standing;
			o["pool"] = t.pool;
			o["cap"] = t.cap;
			o["favour"] = t.favour;
			o["prestige"] = t.prestige;
			o["ruined"] = t.ruined;
			ts.push_back(o);
		}
		out["towns"] = ts;
	}
	if (s.landmarks->any()) {
		if (const auto l = s.landmarks->snap()) {
			Dictionary d;
			d["id"] = G(l->id);
			d["holder"] = l->holder;
			d["state"] = G(l->state);
			d["hp"] = l->hp;
			d["ruined"] = l->ruined;
			d["pieces"] = l->pieces;
			d["men"] = l->men;
			d["foes"] = l->foes;
			d["garrisoned"] = l->garrisoned;
			out["landmark"] = d;
		}
	}
	if (s.souls->any()) {
		Array ss;
		for (const SoulSnap &v : s.souls->snaps(tick)) {
			Dictionary d;
			d["id"] = v.id;
			d["x"] = v.x;
			d["y"] = v.y;
			d["cls"] = G(v.cls);
			d["level"] = v.level;
			d["site"] = G(v.site);
			d["left"] = v.left;
			if (v.claim) (d["claim"] = *v.claim), (d["team"] = v.team);
			if (v.contested) d["contested"] = true;
			if (v.name) d["name"] = G(*v.name);
			if (v.bar) {
				Dictionary b;
				b["owner"] = G(v.bar->first);
				b["at"] = v.bar->second;
				d["bar"] = b;
			}
			ss.push_back(d);
		}
		out["souls"] = ss;
	}
	if (s.roam->any()) {
		Array rs;
		for (const RoamSnapOut &g : s.roam->snaps()) {
			Dictionary d;
			d["id"] = g.id;
			d["kind"] = G(g.kind);
			d["squads"] = int_rows(g.squads);
			d["state"] = G(g.state);
			if (!g.mob.empty()) d["mob"] = G(g.mob);
			if (g.cart >= 0) d["cart"] = g.cart;
			if (g.pilgrim) d["pilgrim"] = true;
			if (g.asleep) d["asleep"] = true;
			rs.push_back(d);
		}
		out["roam"] = rs;
	}
	{
		Array tl;
		for (const TownLevel &v : s.townLv->save_root()) {
			Dictionary d;
			d["id"] = v.centre;
			d["team"] = v.team;
			d["level"] = v.level;
			d["name"] = G(data().town.levels[v.level].name);
			d["x"] = v.x;
			d["y"] = v.y;
			d["r"] = data().town.r;
			d["variety"] = v.variety;
			d["stone"] = v.stone;
			d["closed"] = v.closed;
			d["stoneWalls"] = v.stoneWalls;
			Array next;
			for (const std::string &n : next_needs(v.level, { v.variety, v.stone, v.closed, v.stoneWalls })) next.push_back(G(n));
			d["next"] = next;
			tl.push_back(d);
		}
		if (tl.size()) out["townLevels"] = tl;
	}
	if (!s.crafting->supplies.empty()) {
		auto sp = s.crafting->supplies;
		std::sort(sp.begin(), sp.end(), [](const auto &a, const auto &b) { return a.first < b.first; });
		Dictionary d;
		for (const auto &[team, c] : sp) d[godot::String::num_int64(team)] = cost_dict(c);
		out["supplies"] = d;
	}
	if (!s.piles->piles.empty()) {
		Array ps;
		const double salvage = data().trade.PILE.salvage;
		for (const Pile &p : s.piles->piles) {
			Dictionary d;
			d["id"] = p.id;
			d["x"] = p.x;
			d["y"] = p.y;
			Cost g;
			d["goods"] = cost_dict(totals(p.hold, g));
			d["items"] = int(p.hold.items.size());
			if (!p.hold.items.empty()) d["list"] = item_rows(item_list(p.hold));
			d["loads"] = loads(p.hold);
			d["left"] = p.until - tick;
			if (p.salv > 0) d["salvage"] = p.salv / salvage;
			if (p.claim && p.claim->until > tick) {
				Dictionary c;
				c["owner"] = G(p.claim->owner);
				c["name"] = G(p.claim->name);
				c["left"] = p.claim->until - tick;
				d["claim"] = c;
			}
			ps.push_back(d);
		}
		out["piles"] = ps;
	}
	return out;
}

} // namespace sim
