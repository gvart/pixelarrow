// server/src/war/room.ts WarRoom (the core: see room.h), line for line; src/war/net/interest.ts visibleTo and
// src/war/net/economy.ts with it.
#include "room.h"

#include <algorithm>
#include <cmath>
#include <regex>

#include <godot_cpp/variant/string.hpp>

#include "js_json.h"
#include "js_math.h"
#include "sim_data.h"
#include "sim_events.h"
#include "snapshot.h"
#include "start.h"
#include "works_probe.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::PackedByteArray;
using godot::Variant;

static godot::String G(const std::string &s) { return godot::String::utf8(s.c_str()); }
static std::string S(const Variant &v) { return godot::String(v).utf8().get_data(); }
static bool dead(const Dictionary &u) { return S(u["state"]) == "dead"; }
static bool starts(const std::string &s, const char *p) { return s.rfind(p, 0) == 0; }

const std::vector<std::string> &Net::goods() {
	static const std::vector<std::string> g{ "food", "wood", "stone", "marble", "copper", "tin", "iron", "bronze", "silver", "salt", "pitch", "hides", "flax", "herbs",
		"charcoal", "leather", "linen", "oil", "coin", "dragonbone", "nereidPearl", "starIron", "asphodel", "titanBronze", "obsidian", "ration" };
	return g;
}

static std::string owner_of(int pid) { return "p:" + std::to_string(pid); }

// /^p:(\d+)$/ on an owner: its player id (-1: not a player's)
static int pid_of(const std::string &owner) {
	static const std::regex re("^p:(\\d+)$");
	std::smatch m;
	return std::regex_match(owner, m, re) ? std::stoi(m[1].str()) : -1;
}

// protocol.ts splitQuota
static std::vector<int> split_quota(int cap, int alliances) {
	const int base = cap / alliances, extra = cap - base * alliances;
	std::vector<int> out;
	for (int i = 0; i < alliances; i++) out.push_back(base + (i < extra ? 1 : 0));
	return out;
}

static Array ints(const std::vector<int> &v) {
	Array a;
	for (int x : v) a.push_back(x);
	return a;
}

static Array nums(const std::vector<double> &v) {
	Array a;
	for (double x : v) a.push_back(x);
	return a;
}

// the PlaceResult, WallPlan and BridgePlan objects in their TS key order (src/war/sim/works.ts)
static Dictionary place_dict(const PlaceResult &r) {
	Dictionary d;
	d["ok"] = r.ok;
	if (!r.reason.empty()) d["reason"] = G(r.reason);
	d["tiles"] = ints(r.tiles);
	return d;
}

static Dictionary wall_dict(const WallPlan &r) {
	Dictionary d;
	d["ok"] = r.ok;
	if (!r.reason.empty()) d["reason"] = G(r.reason);
	Array ps;
	for (const WallPiece &q : r.pieces) {
		Dictionary p;
		p["type"] = G(q.type);
		p["tiles"] = ints(q.tiles);
		p["ok"] = q.ok;
		if (!q.reason.empty()) p["reason"] = G(q.reason);
		ps.push_back(p);
	}
	d["pieces"] = ps;
	return d;
}

static Dictionary bridge_dict(const BridgePlan &r) {
	Dictionary d;
	d["ok"] = r.ok;
	if (!r.reason.empty()) d["reason"] = G(r.reason);
	d["axis"] = G(r.axis);
	d["dir"] = Array::make(r.dir[0], r.dir[1]);
	d["width"] = r.width;
	d["span"] = r.span;
	d["maxSpan"] = r.maxSpan;
	Array ps;
	for (const BridgePiece &q : r.pieces) {
		Dictionary p;
		p["type"] = G(q.type);
		p["part"] = G(q.part);
		p["tiles"] = ints(q.tiles);
		p["rows"] = nums(q.rows);
		p["ok"] = q.ok;
		ps.push_back(p);
	}
	d["pieces"] = ps;
	return d;
}

// ---------------------------------------------------------------- interest.ts

static std::optional<NetRect> interest_rect(const std::optional<NetRect> &cam, double margin = Net::CAMERA_MARGIN) {
	if (!cam) return std::nullopt;
	return NetRect{ std::min(cam->x0, cam->x1) - margin, std::min(cam->y0, cam->y1) - margin, std::max(cam->x0, cam->x1) + margin, std::max(cam->y0, cam->y1) + margin };
}

static bool in_net_rect(const std::optional<NetRect> &r, double x, double y) { return !r || (x >= r->x0 && x <= r->x1 && y >= r->y0 && y <= r->y1); }

// seesBoss: in the team's sight, or a living man of it within BOSS_NEAR tiles (squadOf: squad id -> its team)
static bool sees_boss(Sim &sim, const Array &units, const std::map<int, int> &teamOf, int team, double x, double y) {
	if (sim.vision.visible_to(team, x, y)) return true;
	const double N = Net::BOSS_NEAR;
	for (int64_t i = 0; i < units.size(); i++) {
		const Dictionary u = units[i];
		if (dead(u)) continue;
		const double ux = u["x"], uy = u["y"];
		if (!(std::abs(ux - x) < N && std::abs(uy - y) < N)) continue;
		const auto t = teamOf.find(int(u["squad"]));
		if (t != teamOf.end() && t->second == team && js::hypot(ux - x, uy - y) < N) return true;
	}
	return false;
}

static std::map<int, int> team_of(const Array &squads) {
	std::map<int, int> out;
	for (int64_t i = 0; i < squads.size(); i++) {
		const Dictionary s = squads[i];
		out[int(s["id"])] = int(s["team"]);
	}
	return out;
}

// visibleTo: what one client (owner, team) gets this tick
static FrameInput visible_to(Sim &sim, const Dictionary &snap, const std::string &owner, int team, const std::optional<NetRect> &cam, const Array &newShots) {
	const auto r = interest_rect(cam);
	const Array squads = snap["squads"], units = snap["units"];
	std::map<int, Dictionary> squadOf;
	for (int64_t i = 0; i < squads.size(); i++) {
		const Dictionary s = squads[i];
		squadOf[int(s["id"])] = s;
	}
	const std::map<int, int> teams = team_of(squads);
	FrameInput f;
	std::set<int> bodies;
	const Array bosses = snap.get("bosses", Array());
	for (int64_t i = 0; i < bosses.size(); i++) {
		const Dictionary b = bosses[i];
		if (!sees_boss(sim, units, teams, team, b["x"], b["y"])) continue;
		f.bosses.push_back(b);
		bodies.insert(int(b["unit"]));
	}
	const godot::String me = G(owner);
	std::set<int> used;
	for (int64_t i = 0; i < units.size(); i++) {
		const Dictionary u = units[i];
		const auto s = squadOf.find(int(u["squad"]));
		if (s == squadOf.end()) continue;
		if (godot::String(s->second["owner"]) == me || bodies.count(int(u["id"])) || (sim.vision.visible_to(team, u["x"], u["y"]) && in_net_rect(r, u["x"], u["y"]))) {
			f.units.push_back(u);
			used.insert(int(s->second["id"]));
		}
	}
	for (int64_t i = 0; i < squads.size(); i++) {
		const Dictionary s = squads[i];
		if (used.count(int(s["id"])) || godot::String(s["owner"]) == me) f.squads.push_back(s);
	}
	const auto ok = [&](double x, double y) { return sim.vision.visible_to(team, x, y) && in_net_rect(r, x, y); };
	for (int64_t i = 0; i < newShots.size(); i++) {
		const Dictionary s = newShots[i];
		if (ok(s["x0"], s["y0"]) || ok(s["x1"], s["y1"])) f.shots.push_back(s);
	}
	const Array bs = snap.get("buildings", Array()), es = snap.get("sieges", Array()), ss = snap.get("souls", Array());
	for (int64_t i = 0; i < bs.size(); i++) {
		const Dictionary b = bs[i];
		if (int(b["team"]) == team || ok(b["x"], b["y"])) f.buildings.push_back(b);
	}
	for (int64_t i = 0; i < es.size(); i++) {
		const Dictionary e = es[i];
		if (int(e["team"]) == team || (e.has("owner") && godot::String(e["owner"]) == me) || ok(e["x"], e["y"])) f.sieges.push_back(e);
	}
	for (int64_t i = 0; i < ss.size(); i++) {
		const Dictionary x = ss[i];
		if (ok(x["x"], x["y"])) f.souls.push_back(x);
	}
	if (snap.has("warden")) {
		const Dictionary wd = snap["warden"];
		const double at[5][2] = { { 0, 0 }, { 1, 0 }, { 0, 1 }, { 1, 1 }, { 0.5, 0.5 } };
		const double wx = wd["x"], wy = wd["y"], ww = wd["w"], wh = wd["h"];
		for (const auto &p : at)
			if (sim.vision.visible_to(team, wx + p[0] * ww, wy + p[1] * wh)) {
				f.warden = wd;
				break;
			}
	}
	return f;
}

// ---------------------------------------------------------------- economy.ts

// storeNear: the nearest standing store of `team` within r of (x,y) (empty: none so near)
static Dictionary store_near(const Dictionary &cur, int team, double x, double y, double r = Net::STORE_NEAR) {
	Dictionary best;
	double bd = r * r;
	const Array bs = cur.get("buildings", Array());
	const auto &B = data().economy.BUILDINGS;
	for (int64_t i = 0; i < bs.size(); i++) {
		const Dictionary b = bs[i];
		const auto def = B.find(S(b["type"]));
		const std::string st = S(b["state"]);
		if (int(b["team"]) != team || def == B.end() || !def->second.store || (st != "done" && st != "damaged")) continue;
		const double bx = b["x"], by = b["y"], d = (bx - x) * (bx - x) + (by - y) * (by - y);
		if (d <= bd) bd = d, best = b;
	}
	return best;
}

// storeByMen: the store of `team` nearest to any of these living men, within STORE_NEAR (empty: none so near)
static Dictionary store_by_men(const Dictionary &cur, int team, const std::vector<Dictionary> &men) {
	Dictionary best;
	double bd = INFINITY;
	for (const Dictionary &u : men) {
		const Dictionary b = store_near(cur, team, u["x"], u["y"]);
		if (b.is_empty()) continue;
		const double dx = double(b["x"]) - double(u["x"]), dy = double(b["y"]) - double(u["y"]), d = dx * dx + dy * dy;
		if (d < bd) bd = d, best = b;
	}
	return best;
}

static std::vector<int> encode_influence(const std::vector<uint8_t> &mask, int team) {
	const int bit = 1 << team;
	std::vector<int> runs;
	int cur = 0, n = 0;
	for (uint8_t m : mask) {
		const int v = m & bit ? 1 : 0;
		if (v == cur) n++;
		else runs.push_back(n), cur = v, n = 1;
	}
	runs.push_back(n);
	return runs;
}

static std::vector<int> encode_fog(const std::vector<uint8_t> &state) {
	std::vector<int> runs;
	for (size_t i = 0; i < state.size();) {
		size_t j = i + 1;
		while (j < state.size() && state[j] == state[i]) j++;
		runs.push_back(state[i]);
		runs.push_back(int(j - i));
		i = j;
	}
	return runs;
}

static std::string joined(const std::vector<double> &row) {
	std::string k;
	for (size_t i = 0; i < row.size(); i++) k += (i ? "," : "") + js::number_to_string(row[i]);
	return k;
}

static std::string joined(const std::vector<int> &row) {
	std::string k;
	for (size_t i = 0; i < row.size(); i++) k += (i ? "," : "") + std::to_string(row[i]);
	return k;
}

// packNode: id, good (index into GOODS), x, y, amount (whole), max, flags (1 guarded, 2 rare), obj (-1 none), building (-1 none)
static std::vector<double> pack_node(const NodeSnap &n) {
	const auto &g = Net::goods();
	const auto at = std::find(g.begin(), g.end(), n.res);
	return { double(n.id), at == g.end() ? -1.0 : double(at - g.begin()), n.x, n.y, js::round(n.amount), n.max, double((n.guarded ? 1 : 0) | (n.rare ? 2 : 0)),
		double(n.obj.value_or(-1)), double(n.building.value_or(-1)) };
}

// ---------------------------------------------------------------- the room

Room::Room(Sim &s, Bots &b, const Dictionary &m, const RoomOpts &o) : sim(s), bots(b), meta(m) {
	regionId = S(m["id"]);
	w = int(m["w"]);
	h = int(m["h"]);
	per = o.quotas.empty() ? split_quota(o.cap, Net::ALLIANCES) : o.quotas;
	live.assign(per.size(), 0);
	keyEvery = o.keyframeEvery;
	allowArmy = o.allowArmy;
	allowDev = o.allowDev.value_or(allowArmy);
	fightQuiet = o.fightQuiet;
	seed = o.seed;
	home = o.home;
	// W-60, W-101: a soul joins only if the player's path lets him: of his people, and under his cap on his whole army
	// (D1); without a count from the DO (dev armies, tests) his fighters on this field
	sim.pathOf = [this](const std::string &owner) {
		const auto it = paths.find(pid_of(owner));
		return it == paths.end() ? NO_PATH : it->second;
	};
	sim.soulGate = [this](const std::string &owner, const std::string &cls) {
		const auto count = [&](bool civ) {
			int n = 0;
			const Array us = snap.get("units", Array());
			for (int64_t i = 0; i < us.size(); i++) {
				const Dictionary u = us[i];
				const auto o = owners.find(int(u["squad"]));
				if ((!dead(u) || u.has("down")) && o != owners.end() && o->second == owner && starts(S(u["cls"]), "civ_") == civ) n++;
			}
			return n;
		};
		const auto a = armies.find(pid_of(owner));
		const double soldiers = a != armies.end() ? a->second : count(false), workers = count(true);
		const std::string why = man_refusal(sim.pathFor(owner), cls, soldiers, workers);
		SoulGate g;
		g.ok = why.empty();
		g.have = data().civilians.CIV_CLASSES.count(cls) ? workers : soldiers;
		if (!why.empty()) g.why = why;
		return g;
	};
	// W-80: at the alliance's home, a man by a store of his tops his pack up from his own strongroom (storage, via larders)
	isHome = o.home.has_value();
	if (o.home) sim.larder = [this, home = *o.home](const std::string &owner, int team, double want) { return team == home ? draw(owner, want) : 0.0; };
	if (o.wild) sim.spawnMobs();
	if (o.roam) sim.spawnRoam();
	if (o.home) {
		// homeAnchor: the centre of its pre-built town (the map centre when it has none)
		const Array pre = meta.get("prebuilt", Array());
		double sx = 0, sy = 0;
		int n = 0;
		for (int64_t i = 0; i < pre.size(); i++) {
			const Dictionary p = pre[i];
			if (p.has("tiles")) continue;
			sx += double(p["x"]), sy += double(p["y"]), n++;
		}
		const double ax = n ? js::round(sx / n) + 0.5 : w / 2.0, ay = n ? js::round(sy / n) + 0.5 : h / 2.0;
		sim.claim(*o.home, ax, ay, double(Net::HOME_CLAIM_R));
	}
	snap = sim::snapshot(sim);
}

const std::string *Room::ownerAt(int id) const {
	const auto it = owners.find(id);
	return it == owners.end() ? nullptr : &it->second;
}

godot::Dictionary Room::quota() const {
	Dictionary q;
	int cap = 0;
	for (int p : per) cap += p;
	q["cap"] = cap;
	q["per"] = ints(per);
	q["live"] = ints(live);
	return q;
}

int Room::alive() const {
	int n = 0;
	for (int l : live) n += l;
	return n;
}

int Room::online() const {
	int n = 0;
	for (const auto &[pid, p] : players)
		if (p.online) n++;
	return n;
}

std::vector<int> Room::squadsOf(int pid) const {
	const std::string me = owner_of(pid);
	std::vector<int> out;
	const Array sq = snap.get("squads", Array()), us = snap.get("units", Array());
	for (const auto &[id, o] : owners) {
		if (o != me) continue;
		if (id >= sq.size()) { // spawned since the last snapshot: alive
			out.push_back(id);
			continue;
		}
		const Array su = Dictionary(sq[id])["units"];
		for (int64_t k = 0; k < su.size(); k++) {
			const int u = su[k];
			if (u >= us.size() || !dead(us[u])) {
				out.push_back(id);
				break;
			}
		}
	}
	return out;
}

godot::Dictionary Room::join(int sessionPid, const Dictionary &m, const std::vector<std::vector<WarPerson>> *persons) {
	const auto refuse = [](const char *reason, const std::optional<std::string> &detail = std::nullopt) {
		Dictionary d;
		d["t"] = "refused";
		d["reason"] = reason;
		if (detail) d["detail"] = G(*detail);
		return d;
	};
	if (int(m["v"]) != Net::NET_VERSION) return refuse("version", "server speaks v" + std::to_string(Net::NET_VERSION));
	if (S(m["region"]) != regionId) return refuse("region", "this room is " + regionId);
	if (int(m["playerId"]) != sessionPid) return refuse("player", "playerId is not the signed-in player");
	const int ownTeam = m["team"];
	if (ownTeam >= int(per.size())) return refuse("team");
	// W-63: the banner by ground: tied to a settlement here, his men fly its lord's alliance; else his own (m.team)
	const std::optional<int> banner = bannerTeam(sessionPid);
	const int team = banner ? *banner : ownTeam;
	Dictionary mj = m.duplicate(false); // the join as the line keeps it: under his banner
	mj["team"] = team;
	const auto p = players.find(sessionPid);
	if (p != players.end() && p->second.team != team) return refuse("team", "already in alliance " + std::to_string(p->second.team));
	own[sessionPid] = ownTeam; // only once past the alliance check: a refused ask must not turn his men
	if (m.has("squads") == m.has("army")) return refuse("army", "send squads (person ids) or, in dev, an army");
	if (m.has("army") && !allowArmy) return refuse("army", "class armies are dev only: join with person ids");
	const Array army = m.get("army", Array());
	for (int64_t i = 0; i < army.size(); i++) {
		const std::string cls = S(Dictionary(army[i])["cls"]);
		if (!data().civilians.CLASS_IDS.count(cls)) return refuse("army", "unknown class " + cls);
	}
	const std::vector<int> have = squadsOf(sessionPid);
	// a rejoin: the squads still stand here (offline hold); they go back under the player's control
	if (p != players.end() && !p->second.online && !have.empty()) return admit(sessionPid, team, {});
	std::vector<Group> groups;
	if (m.has("squads")) {
		const Array ids = m["squads"];
		bool ok = persons && int64_t(persons->size()) == ids.size();
		for (int64_t i = 0; ok && i < ids.size(); i++) ok = int64_t((*persons)[i].size()) == Array(ids[i]).size() && !(*persons)[i].empty();
		if (!ok) return refuse("army", "soldiers not loaded");
		for (const auto &g : *persons) groups.push_back({ g[0].hero.cls.value_or("militia"), int(g.size()), g });
	} else
		for (int64_t i = 0; i < army.size(); i++) {
			const Dictionary g = army[i];
			groups.push_back({ S(g["cls"]), int(g["count"]) });
		}
	if (int(have.size() + groups.size()) > Net::MAX_SQUADS) return refuse("squads", "at most " + std::to_string(Net::MAX_SQUADS) + " squads per player");
	int need = 0;
	for (const Group &g : groups) need += g.count;
	if (need > per[team]) return refuse("quota", "army of " + std::to_string(need) + " is bigger than the alliance quota " + std::to_string(per[team]));
	dequeue(sessionPid);
	if (!groups.empty() && (std::any_of(queue.begin(), queue.end(), [&](const Waiting &w) { return w.team == team; }) || live[team] + need > per[team])) { // W-66: a watcher (no squad) never waits
		queue.push_back({ sessionPid, team, groups, mj });
		int pos = 0;
		for (const Waiting &w : queue)
			if (w.team == team) pos++;
		Dictionary q;
		q["t"] = "queued";
		q["reason"] = "quota";
		q["pos"] = pos;
		q["need"] = need;
		q["quota"] = quota();
		return q;
	}
	return admit(sessionPid, team, groups);
}

void Room::dequeue(int pid) {
	// the player's waiting join leaves the line; its persons are released
	for (const Waiting &w : queue)
		if (w.pid == pid)
			for (const Group &g : w.groups)
				if (g.persons)
					for (const WarPerson &x : *g.persons) released.push_back(x.id);
	queue.erase(std::remove_if(queue.begin(), queue.end(), [&](const Waiting &w) { return w.pid == pid; }), queue.end());
}

godot::Dictionary Room::admit(int pid, int team, const std::vector<Group> &groups) {
	if (!players.count(pid)) {
		Player np;
		np.pid = pid;
		np.team = team;
		np.online = true;
		players[pid] = std::move(np);
	}
	Player &p = players.at(pid);
	p.online = true;
	if (!p.enc) {
		p.enc = std::make_unique<DeltaEncoder>();
		p.sinceKey = -1;
		p.feed = std::make_shared<EconomyFeed>();
	}
	for (int id : squadsOf(pid)) bots.clear(id);
	for (const Group &g : groups) spawn(owner_of(pid), team, g);
	Dictionary you, out;
	you["id"] = pid;
	you["team"] = team;
	out["t"] = "welcome";
	out["v"] = Net::NET_VERSION;
	out["region"] = G(regionId);
	out["you"] = you;
	out["squads"] = ints(squadsOf(pid));
	out["tick"] = currentTick();
	out["quota"] = quota();
	return out;
}

NetRect Room::entry(const std::string &side) const {
	const Array es = meta.get("entries", Array());
	const double mx = side == "N" ? w / 2.0 : side == "S" ? w / 2.0 : side == "W" ? 0.0 : double(w);
	const double my = side == "N" ? 0.0 : side == "S" ? double(h) : side == "W" ? h / 2.0 : h / 2.0;
	const auto d = [&](const Dictionary &x) {
		const double ex = double(x["x"]) + double(x["w"]) / 2 - mx, ey = double(x["y"]) + double(x["h"]) / 2 - my;
		return ex * ex + ey * ey;
	};
	Dictionary e;
	for (int64_t i = 0; i < es.size() && e.is_empty(); i++)
		if (S(Dictionary(es[i])["side"]) == side) e = es[i];
	if (e.is_empty() && es.size()) { // the nearest (a stable sort's first)
		int64_t best = 0;
		for (int64_t k = 1; k < es.size(); k++)
			if (d(es[k]) < d(es[best])) best = k;
		e = es[best];
	}
	if (e.is_empty()) return { 0, 0, double(w), double(h) };
	const double x = e["x"], y = e["y"];
	return { x, y, x + double(e["w"]), y + double(e["h"]) };
}

int Room::spawn(const std::string &owner, int team, const Group &g, const std::optional<std::pair<double, double>> &at, std::optional<std::string> side) {
	static const char *SIDES[4] = { "N", "E", "S", "W" };
	const NetRect r = entry(side.value_or(SIDES[team % 4]));
	const double ex = r.x0, ey = r.y0, ew = r.x1 - r.x0, eh = r.y1 - r.y0;
	// squads spread over the entry on a 6-tile grid round its centre
	const int k = spawns++;
	const double ox = ((k % 5) - 2) * 6, oy = (((k / 5) % 5) - 2) * 6;
	const double cx = ex + ew / 2, cy = ey + eh / 2;
	double x = std::min(ex + ew - 1, std::max(ex + 1, cx + ox)), y = std::min(ey + eh - 1, std::max(ey + 1, cy + oy));
	if (!at && !(sim.grid->line_cost(cx, cy, x, y, 0) < INFINITY)) x = cx, y = cy; // a spot cut off from the entry's middle may be a pocket with no way out
	std::optional<std::vector<WarPerson>> persons;
	if (g.persons) persons.emplace(g.persons->begin(), g.persons->begin() + std::min(g.persons->size(), size_t(data().soldiers.ARMY_MAX)));
	const int count = persons ? int(persons->size()) : std::min(g.count, data().soldiers.ARMY_MAX);
	const int id = sim.spawn_squad(owner, team, g.cls, count, at ? at->first : x, at ? at->second : y, persons ? &*persons : nullptr);
	owners[id] = owner;
	teams[id] = team;
	live[team] += count;
	return id;
}

void Room::leave(int pid) {
	dequeue(pid);
	if (!players.count(pid)) return;
	Player &p = players.at(pid);
	p.online = false;
	p.enc.reset();
	const auto cs = centres();
	const Array sq = snap.get("squads", Array());
	for (int id : squadsOf(pid)) {
		if (id < sq.size()) {
			const std::string o = S(Dictionary(sq[id])["order"]);
			if (o == "civWork" || o == "gather" || o == "build") continue; // W-97: at work: he keeps his last order
		}
		const auto c = cs.find(id);
		if (c == cs.end()) continue;
		Behaviour b;
		b.kind = "hold";
		b.x = c->second.first;
		b.y = c->second.second;
		b.has_radius = true;
		b.radius = Net::HOLD_RADIUS;
		bots.set(id, b);
	}
}

std::map<int, std::pair<double, double>> Room::centres() const {
	std::map<int, std::array<double, 3>> sum;
	const Array us = snap.get("units", Array());
	for (int64_t i = 0; i < us.size(); i++) {
		const Dictionary u = us[i];
		if (dead(u)) continue;
		auto &s = sum[int(u["squad"])];
		s[0] += double(u["x"]), s[1] += double(u["y"]), s[2]++;
	}
	std::map<int, std::pair<double, double>> out;
	for (const auto &[id, s] : sum) out[id] = { s[0] / s[2], s[1] / s[2] };
	return out;
}

// the unit of that id as the last snapshot shows it (by index first, as room.ts looks)
static Dictionary unit_in(const Dictionary &snap, int id) {
	const Array us = snap.get("units", Array());
	if (id >= 0 && id < us.size() && int(Dictionary(us[id])["id"]) == id) return us[id];
	for (int64_t i = 0; i < us.size(); i++)
		if (int(Dictionary(us[i])["id"]) == id) return us[i];
	return Dictionary();
}

static Dictionary find_id(const Array &a, int id) {
	for (int64_t i = 0; i < a.size(); i++)
		if (int(Dictionary(a[i])["id"]) == id) return a[i];
	return Dictionary();
}

std::string Room::order(int pid, const Dictionary &o) {
	const auto pit = players.find(pid);
	if (pit == players.end() || !pit->second.online) return "notJoined";
	const Player &p = pit->second;
	const std::string me = owner_of(pid), kind = S(o["kind"]);
	const bool hasSquad = o.has("squad");
	const int squad = hasSquad ? int(o["squad"]) : -1;
	const auto mine = [&](int id) { const std::string *ow = ownerAt(id); return ow && *ow == me; };
	if (hasSquad && !mine(squad)) return "notOwner";
	// W-53: every man named must be his (in any of his squads), as the last snapshot shows him
	if (o.has("units")) {
		const Array ids = o["units"];
		for (int64_t i = 0; i < ids.size(); i++) {
			const Dictionary u = unit_in(snap, int(ids[i]));
			if (u.is_empty() || !mine(int(u["squad"]))) return "notOwner";
		}
	}
	static const std::set<std::string> SITE = { "cancelSite", "placeBuilding", "placeWall", "placeBridge", "upgrade", "demolish", "craft", "cancelCraft", "fortify", "setAccess" };
	if (!hasSquad && !SITE.count(kind)) return "bad";
	const auto inside = [&](double x, double y) { return x >= 0 && y >= 0 && x < w && y < h; };
	const auto allIn = [&](const char *key) {
		if (!o.has(key)) return true;
		const Array a = o[key];
		for (int64_t i = 0; i < a.size(); i++) {
			const double v = a[i];
			if (!((i % 2 ? v < h : v < w) && v >= 0)) return false;
		}
		return true;
	};
	const Array bs = snap.get("buildings", Array());
	const auto ownSite = [&](int id) { const Dictionary b = find_id(bs, id); return !b.is_empty() && int(b["team"]) == p.team; };
	const auto mayUse = [&](int id) { const Building *b = sim.works->piece(id); return b && sim.works->may_use(*b, me, p.team); };
	const auto cart = [&](int id) {
		const Array es = snap.get("sieges", Array());
		for (int64_t i = 0; i < es.size(); i++) {
			const Dictionary e = es[i];
			if (int(e["id"]) == id && e.has("owner") && S(e["state"]) != "destroyed") return e;
		}
		return Dictionary();
	};
	const auto pile = [&](int id) { return !find_id(snap.get("piles", Array()), id).is_empty(); };
	// M6: a holder that exists; `put`: one the player may put into (his chest or cart, his team's store)
	const auto holder = [&](const Dictionary &hd, bool put) {
		if (hd.has("pile")) return !put && pile(hd["pile"]);
		if (hd.has("cart")) {
			const Dictionary c = cart(hd["cart"]);
			return !c.is_empty() && (!put || S(c["owner"]) == me);
		}
		Dictionary b;
		if (hd.has("building"))
			for (int64_t i = 0; i < bs.size() && b.is_empty(); i++)
				if (int(Dictionary(bs[i])["id"]) == int(hd["building"]) && Dictionary(bs[i]).has("goods")) b = bs[i];
		if (b.is_empty()) return false;
		const BuildingDef &def = data().economy.BUILDINGS.at(S(b["type"]));
		return !put || (def.chest && !def.house ? b.has("owner") && S(b["owner"]) == me : mayUse(b["id"]));
	};
	// W-89: a building a player owns is his to tear down or change; what its access lets him in to, he may work
	const auto notHis = [&](int id) { const Dictionary b = find_id(bs, id); return !b.is_empty() && b.has("owner") && !S(b["owner"]).empty() && S(b["owner"]) != me; };
	const auto shut = [&](int id) -> std::string {
		if (find_id(bs, id).is_empty()) return "badTarget";
		refusal = "Its owner keeps it closed to you";
		return "notAllowed";
	};
	if (kind == "attack") {
		const int t = o["target"];
		const auto tm = teams.find(t);
		if (!ownerAt(t) || (tm != teams.end() && tm->second == p.team)) return "badTarget";
	} else if (kind == "merge") {
		if (!mine(o["into"]) || int(o["into"]) == squad) return "notOwner";
	} else if (kind == "man") {
		// micro: a living man of that squad, as the last snapshot shows him
		const Dictionary u = unit_in(snap, o["unit"]);
		if (u.is_empty() || int(u["squad"]) != squad || dead(u)) return "badTarget";
	} else if (kind == "move" || kind == "attackMove" || kind == "placeBuilding" || kind == "buildSiege") {
		if (!inside(o["x"], o["y"])) return "bad";
	} else if (kind == "placeWall") {
		if (!allIn("points") || !allIn("towers") || !allIn("gates") || !allIn("inside")) return "bad";
	} else if (kind == "placeBridge" || kind == "raiseLadder") {
		if (!allIn(kind == "placeBridge" ? "points" : "wallTile")) return "bad";
	} else if (kind == "cancelSite") {
		if (!ownSite(o["site"])) return "badTarget";
	} else if (kind == "setAccess") {
		const Dictionary b = find_id(bs, o["building"]);
		if (notHis(o["building"]) || b.is_empty() || !b.has("owner") || S(b["owner"]).empty()) return "notOwner";
	} else if (kind == "civWork" || kind == "craft") { // M5h: a workplace his team's, or (W-89) one whose owner lets him in
		if (!mayUse(o["building"])) return shut(o["building"]);
	} else if (kind == "upgrade" || kind == "demolish" || kind == "build" || kind == "cancelCraft" || kind == "fortify") { // M5h3: a building of his team
		if (!ownSite(kind == "build" ? o["site"] : o["building"])) return "badTarget";
		if ((kind == "upgrade" || kind == "demolish") && notHis(o["building"])) return "notOwner";
	} else if (kind == "load") {
		if (!holder(o["from"], false)) return "badTarget";
	} else if (kind == "unload") {
		if (!holder(o["to"], true)) return "badTarget";
	} else if (kind == "escort") {
		const Dictionary c = cart(o["cart"]);
		if (c.is_empty() || int(c["team"]) != p.team) return "badTarget";
	} else if (kind == "salvagePile") {
		if (!pile(o["pile"])) return "badTarget";
	} else if (kind == "claimRegion") { // W-64: a pact or truce with the point's holder forbids taking it (room_settle.cpp)
		const Array cl = snap.get("claims", Array());
		const int at = o["point"], holder = at >= 0 && at < cl.size() ? int(Dictionary(cl[at])["team"]) : -1;
		const std::string pact = holder >= 0 && holder != p.team ? pactWith(p.team, holder) : "";
		const char *name = SettleTables::allianceName(holder);
		if (!pact.empty()) return refusal = "A " + pact + " with " + (name ? name : "its holder") + " is in force: its claim points may not be taken", "atPeace";
	}
	// W-63: building on a settlement's ground: its lord off others' plots, a citizen on his own plot (room_settle.cpp)
	if (const auto why = groundRefusal(pid, p.team, o)) return refusal = *why, "notYourGround";
	if (kind == "placeBuilding" && (S(o["type"]) == "camp" || S(o["type"]) == "fort")) pendingCamps.push_back({ pid, p.team, S(o["type"]), o["x"], o["y"], currentTick() });
	Dictionary sent = o.duplicate(true);
	if (kind == "setAccess") sent["owner"] = G(me);
	else if (kind == "craft") sent["team"] = p.team, sent["by"] = G(me);
	else if (!hasSquad && kind != "cancelSite") sent["team"] = p.team;
	if (hasSquad) bots.clear(squad);
	sim.order(godot::order_from(sent));
	return "";
}

godot::Dictionary Room::check(int pid, const Dictionary &c) {
	const auto p = players.find(pid);
	Variant result;
	if (p != players.end()) {
		const int team = p->second.team;
		const std::string kind = S(c["kind"]);
		if (kind == "building") result = place_dict(sim.works->check_placement(team, S(c["type"]), c["x"], c["y"], int(c.get("rot", 0))));
		else if (kind == "wall") result = wall_dict(sim.works->check_wall(team, wall_order_of(c)));
		else result = bridge_dict(sim.works->check_bridge(team, bridge_order_of(c)));
	}
	Dictionary out;
	out["t"] = "checked";
	out["id"] = c["id"];
	out["result"] = result;
	return out;
}

std::string Room::dev(int pid, const Dictionary &m) {
	if (!allowDev) return "forbidden";
	const auto pit = players.find(pid);
	if (pit == players.end()) return "notJoined";
	const Player &p = pit->second;
	const std::string op = S(m["op"]);
	if (op == "stock") sim.addStock(p.team, S(m["res"]), m["n"]);
	else if (op == "claim") sim.claim(p.team, m["x"], m["y"], m.has("r") ? std::optional<double>(double(m["r"])) : std::nullopt);
	else if (op == "spawn") {
		const int team = m["team"];
		if (!data().civilians.CLASS_IDS.count(S(m["cls"])) || team >= int(per.size())) return "bad";
		const bool mine = team == p.team;
		const std::pair<double, double> at{ std::max(1.0, std::min(double(w - 2), double(m["x"]))), std::max(1.0, std::min(double(h - 2), double(m["y"]))) };
		const int id = spawn(mine ? owner_of(pid) : "bot", team, { S(m["cls"]), int(m["count"]) }, at);
		if (!mine) {
			Behaviour b;
			b.kind = "hold";
			b.x = at.first;
			b.y = at.second;
			b.has_radius = true;
			b.radius = Net::HOLD_RADIUS;
			bots.set(id, b);
		}
	} else
		for (int i = 0; i < int(m["ticks"]); i++) {
			sim.step();
			bots.tick();
		}
	return "";
}

void Room::view(int pid, const NetRect &r) {
	const auto p = players.find(pid);
	if (p != players.end()) p->second.cam = r;
}

std::vector<int> Room::alliesOf(int pid) const {
	const auto pit = players.find(pid);
	if (pit == players.end()) return {};
	std::set<int> out;
	for (const auto &[id, o] : owners) {
		const int m = pid_of(o), n = m >= 0 ? m : pid;
		const auto t = teams.find(id);
		// under his banner, or an alliance at peace with it (W-64: a pact or truce in force)
		if (n != pid && !out.count(n) && t != teams.end() && (t->second == pit->second.team || !pactWith(pit->second.team, t->second).empty())) out.insert(n);
	}
	return { out.begin(), out.end() };
}

FightReport Room::endFight() {
	FightReport report = sim.endFight();
	honour(report);
	return report;
}

std::vector<std::pair<int, Dictionary>> Room::drainQueue() {
	std::vector<std::pair<int, Dictionary>> out;
	std::set<int> blocked;
	std::vector<Waiting> rest;
	for (const Waiting &wt : std::vector<Waiting>(queue)) {
		int need = 0;
		for (const Group &g : wt.groups) need += g.count;
		if (blocked.count(wt.team) || live[wt.team] + need > per[wt.team]) {
			blocked.insert(wt.team);
			rest.push_back(wt);
			continue;
		}
		out.emplace_back(wt.pid, admit(wt.pid, wt.team, wt.groups));
	}
	queue = rest;
	return out;
}

// W-194: hurt men standing at the town with no foe near get well (room.ts townRest, on peace()'s LABOUR_EVERY)
void Room::townRest(double secs) {
	double ax = w / 2.0, ay = h / 2.0;
	const Array safe = meta.get("safe", Array()), pre = meta.get("prebuilt", Array());
	bool found = false;
	if (safe.size()) {
		const Dictionary c = safe[0];
		ax = double(c["x"]) + double(c["w"]) / 2, ay = double(c["y"]) + double(c["h"]) / 2, found = true;
	}
	for (const char *type : { "stall", "well", "board", "storehouse", "cottage" }) {
		if (found) break;
		double sx = 0, sy = 0;
		int n = 0;
		for (int64_t i = 0; i < pre.size(); i++) {
			const Dictionary p = pre[i];
			if (S(p["type"]) == type) sx += double(p["x"]), sy += double(p["y"]), n++;
		}
		if (n) ax = sx / n, ay = sy / n, found = true;
	}
	if (!found && pre.size()) ax = Dictionary(pre[0])["x"], ay = Dictionary(pre[0])["y"];
	const RoomTables &T = data().room;
	const double r2 = T.npcReach * T.npcReach, foe2 = T.restFoeR * T.restFoeR;
	const Array us = snap["units"], sq = snap["squads"];
	const auto squadTeam = [&](int s) { return s < sq.size() ? Variant(Dictionary(sq[s])["team"]) : Variant(); };
	std::vector<Dictionary> liveU, men;
	for (int64_t i = 0; i < us.size(); i++)
		if (!dead(us[i])) liveU.push_back(us[i]);
	for (const Dictionary &u : liveU) {
		const int s = u["squad"];
		const double dx = double(u["x"]) - ax, dy = double(u["y"]) - ay;
		if (double(u["hp"]) < double(u["maxHp"]) && s < sq.size() && starts(S(Dictionary(sq[s])["owner"]), "p:") && dx * dx + dy * dy <= r2) men.push_back(u);
	}
	std::set<int> ids;
	for (const Dictionary &u : men) {
		bool foe = false;
		for (const Dictionary &o : liveU) {
			const double dx = double(o["x"]) - double(u["x"]), dy = double(o["y"]) - double(u["y"]);
			if (squadTeam(o["squad"]) != squadTeam(u["squad"]) && dx * dx + dy * dy <= foe2) {
				foe = true;
				break;
			}
		}
		if (!foe) ids.insert(int(u["id"]));
	}
	// index.ts tend
	const double share = T.restPerSec * secs;
	if (!ids.empty())
		for (Unit *u : sim.units)
			if (u->alive && ids.count(u->id)) u->hp = std::min(u->maxHp, u->hp + u->maxHp * share);
}

Room::TickOut Room::tick() {
	sim.step();
	bots.tick();
	snap = sim::snapshot(sim);
	TickOut out;
	lifeLords(out); // W-72 proposal: the warlords think on this snapshot (their spawns show from the next)
	const std::vector<Dictionary> evs = sim.events();
	tradeTick(out, evs); // crafted items into chests (deposit), a slain guardian's loot pile, mends freed (room_trade.cpp)
	personsTick(out, evs); // M5e raids, W-68 faded souls, the forts stormed
	live.assign(per.size(), 0);
	const Array sq = snap["squads"], us = snap["units"];
	for (int64_t i = 0; i < sq.size(); i++) {
		const Dictionary s = sq[i];
		owners[int(s["id"])] = S(s["owner"]);
		teams[int(s["id"])] = int(s["team"]);
	}
	lifeGather(); // W-62 E7, W-172: what the tasks count from the field
	const int tk = snap["tick"];
	Array wire;
	bool blow = false;
	const bool jobs = townWorking();
	for (int64_t i = 0; i < us.size(); i++) {
		const Dictionary u = us[i];
		const int id = u["id"];
		const bool isDead = dead(u);
		if (S(u["state"]) == "attack") blow = true;
		// W-79 early mercy: a man down who gets up is no corpse; one who stays down for good is a fall to report
		if (!isDead && diedAt.count(id)) diedAt.erase(id);
		if (u.has("down")) down.insert(id);
		else if (down.erase(id) && isDead) blow = true;
		if (isDead) {
			if (!diedAt.count(id)) blow = true, diedAt[id] = tk;
			if (tk - diedAt[id] < Net::CORPSE_TICKS) wire.push_back(u);
			continue;
		}
		wire.push_back(jobs ? atTownWork(u) : u); // W-205 town jobs (room_settle.cpp)
		const auto t = teams.find(int(u["squad"]));
		if (t != teams.end() && t->second < int(live.size())) live[t->second]++;
	}
	if (blow) lastBlow = tk, inFight = true;
	else if (inFight && tk - lastBlow >= fightQuiet) {
		inFight = false;
		FightReport report = endFight(); // the report (persons, loot) goes to storage (G-09)
		if (!report.persons.empty() || !report.loot.empty()) out.fights.push_back({ regionId + ":" + epoch + ":" + std::to_string(tk), std::move(report) });
	}
	out.admitted = drainQueue();
	const bool seen = online() > 0;
	if (seen) {
		Dictionary view = snap.duplicate(false);
		view["units"] = wire;
		const Array shots = snap.get("shots", Array());
		Array fresh;
		for (int64_t i = 0; i < shots.size(); i++)
			if (double(Dictionary(shots[i])["t0"]) > lastTick) fresh.push_back(shots[i]);
		for (auto &[pid, p] : players) {
			if (!p.online || !p.enc) continue;
			const bool key = p.sinceKey < 0 || p.sinceKey + 1 >= keyEvery;
			p.sinceKey = key ? 0 : p.sinceKey + 1;
			FrameInput f = visible_to(sim, view, owner_of(pid), p.team, p.cam, key ? shots : fresh);
			f.tick = tk;
			const PackedByteArray b = p.enc->encode(f, key);
			p.bytes += b.size();
			out.frames[pid] = b;
		}
	}
	out.msgs = economy();
	const auto tell = [&](int pid, const Dictionary &m) { out.msgs[pid].push_back(m); };
	const auto on = [&](int pid) { const auto p = players.find(pid); return p != players.end() && p->second.online; };
	// W-60: souls claimed (the DO writes the new men) or refused, told to the player who went for him
	for (const Dictionary &e : evs) {
		const std::string k = S(e["kind"]);
		if (k != "soulClaimed" && k != "soulRefused") continue;
		const int pid = pid_of(S(e["owner"]));
		if (pid < 0) continue;
		Dictionary m;
		m["t"] = "soul";
		if (k == "soulClaimed") {
			// the event's person is his man's (TS e.person is u.person; the C++ event keeps only his name and class)
			const int unit = e["unit"];
			const Dictionary person = unit >= 0 && unit < int(sim.units.size()) && sim.units[unit]->person ? war_person_to(*sim.units[unit]->person) : Dictionary(e["person"]);
			const Dictionary hero = person.get("hero", Dictionary());
			out.souls.push_back({ pid, int(e["squad"]), unit, person });
			if (armies.count(pid)) armies[pid]++;
			if (!on(pid)) continue;
			m["state"] = "claimed";
			m["soul"] = e["soul"];
			m["squad"] = e["squad"];
			m["pid"] = person["id"];
			m["cls"] = hero["cls"];
			m["level"] = hero["level"];
			m["name"] = hero["name"];
			tell(pid, m);
		} else if (on(pid)) {
			m["state"] = "refused";
			m["soul"] = e["soul"];
			m["squad"] = e["squad"];
			m["have"] = e["have"];
			m["why"] = e["why"];
			tell(pid, m);
		}
	}
	lifeMessages(out, evs); // W-62 guide, W-65 stories and encounters
	// W-221: a man of his fell and what he carried lies on the ground: he is told, not left to find it out
	for (const Dictionary &e : evs) {
		if (S(e["kind"]) != "fall" || !e.has("dropped") || e["dropped"].get_type() != Variant::DICTIONARY) continue;
		const Dictionary u = find_id(us, e["unit"]);
		if (u.is_empty()) continue;
		const Dictionary s = find_id(sq, u["squad"]);
		const int pid = s.is_empty() ? -1 : pid_of(S(s["owner"])); // pidOfUnit
		if (pid < 0 || !on(pid)) continue;
		Dictionary m;
		m["t"] = "dropped";
		m.merge(Dictionary(e["dropped"]));
		tell(pid, m);
	}
	// W-67: mob FX events (a beast's burst, a lair's cry, a pack scattering) to the players whose camera rect holds them
	std::vector<Dictionary> mobFx;
	for (const Dictionary &e : evs) {
		const std::string k = S(e["kind"]);
		if (k == "mobDash" || k == "mobCry" || k == "mobScatter") mobFx.push_back(e);
	}
	if (!mobFx.empty())
		for (const auto &[pid, p] : players) {
			if (!p.online) continue;
			const auto r = interest_rect(p.cam);
			Array ev;
			for (const Dictionary &e : mobFx)
				if (!r || (double(e["x"]) >= r->x0 && double(e["x"]) <= r->x1 && double(e["y"]) >= r->y0 && double(e["y"]) <= r->y1)) ev.push_back(e);
			if (ev.size()) {
				Dictionary m;
				m["t"] = "mobFx";
				m["ev"] = ev;
				tell(pid, m);
			}
		}
	// world-fill: hidden quest events to the player whose quest it is
	for (const Dictionary &e : evs) {
		if (S(e["kind"]) != "secret") continue;
		const int pid = pid_of(S(e["owner"]));
		if (pid < 0 || !on(pid)) continue;
		Dictionary m;
		m["t"] = "secret";
		m["ev"] = Array::make(e);
		tell(pid, m);
	}
	for (const Dictionary &e : evs)
		if (S(e["kind"]) == "chiefSlain" && int(e["by"]) >= 0)
			for (const auto &[pid, p] : players)
				if (p.online && p.team == int(e["by"])) {
					Dictionary m;
					m["t"] = "secret";
					m["ev"] = Array::make(e);
					tell(pid, m);
				}
	// W-67: guardian events to the players whose team sees the guardian (where it stands, or fell) or the struck patch
	std::vector<Dictionary> bossEv;
	for (const Dictionary &e : evs) {
		const std::string k = S(e["kind"]);
		if (k == "bossPhase" || k == "bossSlain" || k == "bossFled" || k == "bossBack" || k == "wardenStrike") bossEv.push_back(e);
	}
	if (!bossEv.empty() && seen) {
		const std::map<int, int> tm = team_of(sq);
		const Array bosses = snap.get("bosses", Array());
		for (const auto &[pid, p] : players) {
			if (!p.online) continue;
			const int team = p.team;
			const auto sees = [&](double x, double y) { return sim.vision.visible_to(team, x, y); };
			Array ev;
			for (const Dictionary &e : bossEv) {
				bool hit;
				if (S(e["kind"]) == "wardenStrike") {
					const double x = e["x"], y = e["y"], ew = e["w"], eh = e["h"];
					hit = sees(x + ew / 2, y + eh / 2) || sees(x, y) || sees(x + ew, y + eh);
				} else {
					const Dictionary b = [&] {
						for (int64_t i = 0; i < bosses.size(); i++)
							if (Dictionary(bosses[i])["id"] == e["boss"]) return Dictionary(bosses[i]);
						return Dictionary();
					}();
					const bool slainAt = S(e["kind"]) == "bossSlain" && e.has("x") && e.has("y") && e["x"].get_type() != Variant::NIL && e["y"].get_type() != Variant::NIL;
					const Dictionary at = slainAt ? e : b;
					hit = !at.is_empty() && sees_boss(sim, us, tm, team, at["x"], at["y"]);
				}
				if (hit) ev.push_back(e);
			}
			if (ev.size()) {
				Dictionary m;
				m["t"] = "bossEv";
				m["ev"] = ev;
				tell(pid, m);
			}
		}
	}
	lifeLordMessages(out); // W-72 proposal: warlord notes; a raid's warning and the raid itself to the target team only
	// W-63: camps to found, attacks on settlements; messages owed since the last tick (a banner changed)
	campsTick(); // settleTick: who placed each camp (saved), then the rest (room_settle.cpp)
	out.settle = settleTick();
	flushLater(out);
	lastTick = tk;
	lifeBooks(out, evs); // what the DO books: guide, stories, encounters, the wild's deeds, the tasks' tallies
	out.larder = drainDrawn();
	out.peace = peace(); // W-61: townRest, labour, guards, works, town jobs (room_settle.cpp)
	return out;
}

std::map<int, std::vector<Dictionary>> Room::economy() {
	std::map<int, std::vector<Dictionary>> out;
	std::vector<Player *> on;
	for (auto &[pid, p] : players)
		if (p.online && p.feed) on.push_back(&p);
	if (on.empty()) return out;
	const InfluenceMap &infl = sim.works->influence();
	std::optional<std::vector<NodeSnap>> nodes;
	Dictionary wild, lords;
	std::string wildKey, lordKey;
	const int tk = snap["tick"];
	const auto push = [&](int pid, const Dictionary &m) { out[pid].push_back(m); };
	for (Player *pp : on) {
		Player &p = *pp;
		EconomyFeed &feed = *p.feed;
		auto c = inflRuns.find(p.team);
		if (c == inflRuns.end() || c->second.first != infl.version) {
			inflRuns[p.team] = { infl.version, std::make_shared<std::vector<int>>(encode_influence(infl.mask, p.team)) };
			c = inflRuns.find(p.team);
		}
		// feed.influence: the runs when they differ from what he has
		const auto &runs = c->second.second;
		if (runs != feed.last) {
			feed.last = runs;
			const std::string key = joined(*runs);
			if (key != feed.infl) {
				feed.infl = key;
				Dictionary m;
				m["t"] = "influence";
				m["team"] = p.team;
				m["w"] = infl.w;
				m["h"] = infl.h;
				m["v"] = infl.version;
				m["runs"] = ints(*runs);
				push(p.pid, m);
			}
		}
		// W-39: his team's fog grid when it changed (the shroud; the snapshot is already filtered by it)
		Vision::Team &fg = sim.vision.team(p.team);
		const std::string fogKey = std::to_string(p.team) + ":" + std::to_string(fg.version);
		if (fogKey != feed.fogKey) {
			feed.fogKey = fogKey;
			auto fc = fogRuns.find(p.team);
			if (fc == fogRuns.end() || fc->second.first != fg.version) {
				fogRuns[p.team] = { fg.version, std::make_shared<std::vector<int>>(encode_fog(fg.state)) };
				fc = fogRuns.find(p.team);
			}
			Dictionary m;
			m["t"] = "fog";
			m["team"] = p.team;
			m["w"] = sim.vision.cells.cw;
			m["h"] = sim.vision.cells.ch;
			m["cell"] = VISION.cell;
			m["v"] = fg.version;
			m["runs"] = ints(*fc->second.second);
			push(p.pid, m);
		}
		// W-60: the store his men stand next to, only it (storeByMen; feed.stock: when store or goods changed)
		{
			const std::vector<int> mineV = squadsOf(p.pid);
			const std::set<int> mine(mineV.begin(), mineV.end());
			std::vector<Dictionary> men;
			const Array us = snap["units"];
			for (int64_t i = 0; i < us.size(); i++) {
				const Dictionary u = us[i];
				if (mine.count(int(u["squad"])) && !dead(u)) men.push_back(u);
			}
			const Dictionary store = store_by_men(snap, p.team, men);
			Dictionary goods;
			if (store.has("goods")) {
				const Dictionary g = store["goods"];
				const Array ks = g.keys();
				for (int64_t i = 0; i < ks.size(); i++) {
					const double v = g[ks[i]];
					if (v && std::floor(v) > 0) goods[ks[i]] = std::floor(v);
				}
			}
			const Variant id = store.is_empty() ? Variant() : store["id"];
			const std::string key = js_stringify(id) + "|" + js_stringify(goods);
			if (key != feed.goods) {
				feed.goods = key;
				Dictionary m;
				m["t"] = "stock";
				m["team"] = p.team;
				m["store"] = id;
				m["goods"] = goods;
				push(p.pid, m);
			}
		}
		// W-61: his team's town level here, when it changed
		{
			Variant town;
			const Array tl = snap.get("townLevels", Array());
			for (int64_t i = 0; i < tl.size(); i++)
				if (int(Dictionary(tl[i])["team"]) == p.team) {
					town = tl[i];
					break;
				}
			const std::string k = js_stringify(town);
			const auto ts = townSent.find(p.pid);
			if (ts == townSent.end() || ts->second != k) {
				townSent[p.pid] = k;
				Dictionary m;
				m["t"] = "town";
				m["team"] = p.team;
				m["town"] = town;
				push(p.pid, m);
			}
		}
		// the players whose men are his friends; on join and when it changed
		if (!feed.allySent || tk % Net::WILD_EVERY == 0) {
			const std::vector<int> players = alliesOf(p.pid);
			const std::string k = joined(players);
			if (feed.allySent != k) {
				feed.allySent = k;
				Dictionary m;
				m["t"] = "allies";
				m["players"] = ints(players);
				push(p.pid, m);
			}
		}
		// W-65: the neutral state (lairs, claim points) the binary frames leave out; on join and when it changed
		if (snap.has("lairs") || snap.has("claims") || snap.has("roam")) {
			if (!feed.wildSent || tk % Net::WILD_EVERY == 0) {
				if (wild.is_empty()) {
					wild["t"] = "wild";
					wild["lairs"] = snap.get("lairs", Array());
					wild["claims"] = snap.get("claims", Array());
					if (snap.has("roam")) wild["roam"] = snap["roam"];
					if (snap.has("piles") && Array(snap["piles"]).size()) wild["piles"] = snap["piles"];
					wildKey = js_stringify(wild);
				}
				if (feed.wildSent != wildKey) {
					feed.wildSent = wildKey;
					push(p.pid, wild);
				}
			}
		}
		// W-76 proposal: his open hidden quest steps (their markers), on join
		if (!feed.secretSent) {
			feed.secretSent = true;
			Array ev;
			if (sim.secrets)
				for (const SecretEvent &e : sim.secrets->open(owner_of(p.pid))) ev.push_back(ev_of(e));
			if (ev.size()) {
				Dictionary m;
				m["t"] = "secret";
				m["ev"] = ev;
				push(p.pid, m);
			}
		}
		lifeFeed(p, out, lords, lordKey); // W-72 proposal: the region's warlords; on join and when it changed
		if (tk % Net::NODES_EVERY && feed.synced) continue;
		// feed.nodes: a node sent (or updated) only while his team sees it; on a (re)join every node on explored ground
		if (!nodes) nodes = sim.works->resource_nodes();
		Vision::Team &g = sim.vision.team(p.team);
		const int gw = sim.vision.cells.cw, gh = sim.vision.cells.ch, cell = VISION.cell;
		const auto explored = [&](double x, double y) {
			const int cx = int(std::floor(x / cell)), cy = int(std::floor(y / cell));
			return cx >= 0 && cy >= 0 && cx < gw && cy < gh && g.state[cy * gw + cx] > 0;
		};
		Array rows;
		std::set<int> here;
		for (const NodeSnap &n : *nodes) {
			here.insert(n.id);
			if (!(sim.vision.visible_to(p.team, n.x, n.y) || (!feed.synced && explored(n.x, n.y)))) continue;
			const std::vector<double> row = pack_node(n);
			const std::string key = joined(row);
			const auto s = feed.sent.find(n.id);
			if (s != feed.sent.end() && s->second == key) continue;
			feed.sent[n.id] = key;
			rows.push_back(nums(row));
		}
		feed.synced = true;
		std::vector<int> gone;
		for (const auto &[id, k] : feed.sent)
			if (!here.count(id)) gone.push_back(id);
		for (int id : gone) feed.sent.erase(id);
		if (rows.size() || !gone.empty()) {
			Dictionary m;
			m["t"] = "nodes";
			m["rows"] = rows;
			if (!gone.empty()) m["gone"] = ints(gone);
			push(p.pid, m);
		}
	}
	return out;
}

} // namespace sim
