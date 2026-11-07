// The strategic world (see world.h): server/src/war/world/world.ts, graph.ts and events.ts, line for line.
#include "world.h"

#include <algorithm>
#include <cmath>
#include <set>

#include <godot_cpp/variant/string.hpp>

#include "js_json.h"
#include "js_math.h"
#include "rng.h"
#include "room_cargo.h"
#include "season_clock.h"
#include "sim_data.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::String;
using godot::Variant;

static std::string S(const Variant &v) { return String(v).utf8().get_data(); }
static String G(const std::string &s) { return String::utf8(s.c_str()); }
static const WorldTables &T() { return data().world; }
static size_t N() { return T().HOMES.size(); }
static bool nil(const Variant &v) { return v.get_type() == Variant::NIL; }
static Array zeros() {
	Array a;
	for (size_t i = 0; i < N(); i++) a.push_back(0);
	return a;
}
static bool has(const std::vector<std::string> &v, const std::string &s) { return std::find(v.begin(), v.end(), s) != v.end(); }

void load_world_tables(const Dictionary &tables, WorldTables &out) {
	const auto strs = [](const Array &a) {
		std::vector<std::string> v;
		for (int64_t i = 0; i < a.size(); i++) v.push_back(S(a[i]));
		return v;
	};
	if (tables.has("src/war/world/regions")) {
		const Array rs = Dictionary(tables["src/war/world/regions"])["WORLD_REGIONS"];
		out.WORLD_REGIONS.clear();
		for (int64_t i = 0; i < rs.size(); i++) {
			const Dictionary d = rs[i], pos = d["pos"];
			out.WORLD_REGIONS.push_back({ S(d["id"]), S(d["name"]), S(d["role"]), nil(d.get("alliance", Variant())) ? -1 : int(d["alliance"]), double(pos["x"]), double(pos["y"]), strs(d["adj"]) });
		}
	}
	if (tables.has("src/war/world/graph")) out.EDGE_MS_PER_UNIT = Dictionary(tables["src/war/world/graph"])["EDGE_MS_PER_UNIT"];
	if (tables.has("src/war/world/alliances")) {
		const Dictionary a = tables["src/war/world/alliances"];
		const Array al = a["ALLIANCES"];
		out.HOMES.clear();
		for (int64_t i = 0; i < al.size(); i++) out.HOMES.push_back(S(Dictionary(al[i])["home"]));
		const Dictionary s = a["WAR_SEASON"];
		out.WAR_SEASON = { s["id"], s["travelScale"], s["offExitMsPerTile"], s["foeRadius"], s["lengthMs"], S(s["name"]) };
	}
	if (tables.has("src/war/world/events")) {
		const Dictionary e = tables["src/war/world/events"], ev = e["EVENTS"], rush = e["RUSH"], siege = e["SIEGE"], regs = e["EVENT_REGIONS"];
		out.EVENTS = { ev["every"], ev["jitter"], ev["minMs"], ev["maxMs"], ev["first"] };
		out.RUSH_perLoad = rush["perLoad"], out.RUSH_cap = rush["cap"], out.SIEGE_capture = siege["capture"], out.SIEGE_held = siege["held"];
		out.EVENT_KINDS = strs(e["EVENT_KINDS"]);
		out.EVENT_REGIONS.clear();
		for (const std::string &k : out.EVENT_KINDS) out.EVENT_REGIONS[k] = strs(regs[G(k)]);
	}
	if (tables.has("src/war/world/start")) out.PATH_IDS = strs(Dictionary(tables["src/war/world/start"])["PATH_IDS"]);
}

// ---------------------------------------------------------------- graph.ts

const WorldTables::Region *graph_region(const std::string &id) {
	for (const auto &r : T().WORLD_REGIONS)
		if (r.id == id) return &r;
	return nullptr;
}

bool adjacent(const std::string &a, const std::string &b) {
	const auto *r = graph_region(a);
	return r && has(r->adj, b);
}

static std::string side_to(const WorldTables::Region &from, const WorldTables::Region &to) {
	const double dx = to.x - from.x, dy = to.y - from.y;
	if (std::abs(dy) >= std::abs(dx)) return dy < 0 ? "N" : "S";
	return dx < 0 ? "W" : "E";
}

std::optional<WorldEdge> world_edge(const std::string &a, const std::string &b) {
	const auto *ra = graph_region(a), *rb = graph_region(b);
	if (!ra || !rb || !has(ra->adj, b)) return std::nullopt;
	const double d = js::hypot(rb->x - ra->x, rb->y - ra->y);
	return WorldEdge{ side_to(*ra, *rb), side_to(*rb, *ra), js::round((d * T().EDGE_MS_PER_UNIT) / 1000) * 1000 };
}

// ---------------------------------------------------------------- events.ts

double season_seed(double id, double startAt) {
	return double(hash_string(G("war-season:" + js::number_to_string(id) + ":" + js::number_to_string(startAt))));
}

Array season_events(double seed, double startAt, double endAt) {
	const auto &E = T().EVENTS;
	Mulberry rng(uint32_t(int64_t(seed ? seed : 1)));
	Array out;
	std::vector<std::string> cycle;
	std::string last;
	double at = startAt + E.first + js::round(0 + (E.jitter - 0) * rng.next());
	while (at < endAt) {
		if (cycle.empty()) {
			cycle = T().EVENT_KINDS;
			for (size_t i = cycle.size() - 1; i > 0; i--) {
				const size_t j = size_t(std::floor(rng.next() * double(i + 1)));
				std::swap(cycle[i], cycle[j]);
			}
		}
		const std::string kind = cycle.front();
		cycle.erase(cycle.begin());
		std::vector<std::string> pool;
		for (const std::string &r : T().EVENT_REGIONS.at(kind))
			if (r != last) pool.push_back(r);
		const std::string region = pool[size_t(std::floor(rng.next() * double(pool.size())))];
		const double len = js::round(E.minMs + rng.next() * (E.maxMs - E.minMs));
		const double endEv = std::min(at + len, endAt);
		Dictionary e;
		e["id"] = out.size();
		e["kind"] = G(kind);
		e["region"] = G(region);
		e["startAt"] = at;
		e["endAt"] = endEv;
		out.push_back(e);
		last = region;
		at = endEv + E.every - (E.minMs + E.maxMs) / 2 + js::round(-E.jitter + (E.jitter - -E.jitter) * rng.next());
	}
	return out;
}

Array active_events(const Array &list, double now) {
	Array out;
	for (int64_t i = 0; i < list.size(); i++) {
		const Dictionary e = list[i];
		if (double(e["startAt"]) <= now && now < double(e["endAt"])) out.push_back(e);
	}
	return out;
}

Variant next_event(const Array &list, double now) {
	for (int64_t i = 0; i < list.size(); i++)
		if (double(Dictionary(list[i])["startAt"]) > now) return list[i];
	return Variant();
}

// ---------------------------------------------------------------- world.ts

static double bundle_loads_of(const Variant &b) { return bundle_loads(bundle_from(b)); }

double cargo_loads(const Variant &cv) {
	if (cv.get_type() != Variant::DICTIONARY) return 0;
	const Dictionary c = cv, packs = c.get("packs", Dictionary());
	double a = 0, b = 0;
	const Array vs = packs.values();
	for (int64_t i = 0; i < vs.size(); i++) a = a + bundle_loads_of(vs[i]);
	const Array carts = c.get("carts", Array());
	for (int64_t i = 0; i < carts.size(); i++) b = b + bundle_loads_of(carts[i]);
	return a + b;
}

// cargoGoods: what a convoy carries, by good (rounded to 1/1000 as it adds up), and its items
static void cargo_goods(const Variant &cv, Dictionary &goods, int64_t &items) {
	items = 0;
	if (cv.get_type() != Variant::DICTIONARY) return;
	const Dictionary c = cv;
	Array bs = Dictionary(c.get("packs", Dictionary())).values();
	bs.append_array(c.get("carts", Array()));
	for (int64_t i = 0; i < bs.size(); i++) {
		const Dictionary b = bs[i];
		const Array lots = b["lots"];
		for (int64_t k = 0; k < lots.size(); k++) {
			const Dictionary l = lots[k];
			const Variant r = l["r"];
			goods[r] = js::round((double(goods.get(r, 0)) + double(l["n"])) * 1000) / 1000;
		}
		items += Array(b["items"]).size();
	}
}

// the slowest cart of a cargo ("": none)
static std::string slowest(const Variant &cv) {
	if (cv.get_type() != Variant::DICTIONARY) return "";
	const Array carts = Dictionary(cv).get("carts", Array());
	for (int64_t i = 0; i < carts.size(); i++)
		if (S(Dictionary(carts[i])["type"]) == "wagon") return "wagon";
	return carts.size() ? S(Dictionary(carts[0])["type"]) : "";
}

double cargo_factor(const Variant &c) {
	if (slowest(c) == "wagon") return T().CARGO_wagon;
	return cargo_loads(c) > 1e-9 ? T().CARGO_porter : 1;
}

static Dictionary fresh_region(const std::string &id) {
	const auto *r = graph_region(id);
	Dictionary d;
	d["id"] = G(id);
	d["owner"] = r->role == "home" ? r->alliance : -1;
	d["claims"] = zeros();
	d["live"] = zeros();
	d["contested"] = false;
	d["besieged"] = false;
	return d;
}

static Dictionary fresh_regions() {
	Dictionary d;
	for (const auto &r : T().WORLD_REGIONS) d[G(r.id)] = fresh_region(r.id);
	return d;
}

Dictionary fresh_season(double id, double now, const WorldTables::Season &cfg) {
	Dictionary s;
	s["id"] = id;
	s["startAt"] = now;
	s["endAt"] = now + cfg.lengthMs;
	s["scores"] = zeros();
	s["accruedAt"] = now;
	s["hegemony"] = Variant();
	s["ended"] = Variant();
	s["seed"] = season_seed(id, now);
	s["evAt"] = now;
	return s;
}

Dictionary fresh_world(double now, const WorldTables::Season &cfg) {
	Dictionary w;
	w["v"] = 2;
	w["seq"] = 0;
	w["regions"] = fresh_regions();
	w["transit"] = Array();
	w["season"] = fresh_season(cfg.id, now, cfg);
	return w;
}

Dictionary snap_of(const Dictionary &t) {
	Dictionary d;
	for (const char *k : { "id", "from", "to", "men", "departAt", "arriveAt", "state" }) d[k] = t[k];
	return d;
}

World::World(const Dictionary &s, const WorldTables::Season &cfg) : st(s), season(cfg) {}

static Dictionary SEASON(const Dictionary &st) { return st["season"]; }
static Dictionary REGIONS(const Dictionary &st) { return st["regions"]; }
static Array TRANSIT(const Dictionary &st) { return st["transit"]; }

// Object.values(st.regions) as the score reads them (ScoredRegion)
static std::vector<ClockRegion> scored(const Dictionary &regions) {
	std::vector<ClockRegion> out;
	const Array vs = regions.values();
	for (int64_t i = 0; i < vs.size(); i++) {
		const Dictionary r = vs[i];
		ClockRegion c;
		c.id = S(r["id"]);
		c.owner = int(r["owner"]);
		const Array live = r["live"];
		for (int64_t k = 0; k < live.size(); k++) c.live.push_back(double(live[k]));
		if (r.has("landmark")) {
			const Dictionary lm = r["landmark"];
			c.hasLandmark = true, c.holder = int(lm["holder"]), c.garrisoned = bool(lm["garrisoned"]);
		}
		if (r.has("prestige")) {
			const Array p = r["prestige"];
			for (int64_t k = 0; k < p.size(); k++) c.prestige.push_back(double(p[k]));
		}
		c.ruined = bool(r.get("ruined", false));
		out.push_back(c);
	}
	return out;
}

double World::seasonEndsAt() const {
	const Dictionary s = SEASON(st);
	const Variant h = s["hegemony"];
	return !nil(h) ? std::min(double(s["endAt"]), double(Dictionary(h)["since"]) + data().season.HEGEMONY.ms) : double(s["endAt"]);
}

Variant World::advance(double now) {
	Dictionary s = SEASON(st);
	if (!nil(s["ended"])) return Variant();
	const double end = seasonEndsAt(), to = std::min(now, end);
	if (to > double(s["accruedAt"])) {
		const std::vector<double> rates = alliance_rates(scored(REGIONS(st)));
		const double h = (to - double(s["accruedAt"])) / data().season.HOUR_MS;
		const Array was = s["scores"];
		Array sc;
		for (int64_t i = 0; i < was.size(); i++) sc.push_back(double(was[i]) + rates[size_t(i)] * h);
		s["scores"] = sc;
		s["accruedAt"] = to;
	}
	if (now < end) return Variant();
	const Variant hv = s["hegemony"];
	const int heg = !nil(hv) && double(Dictionary(hv)["since"]) + data().season.HEGEMONY.ms <= double(s["endAt"]) ? int(Dictionary(hv)["alliance"]) : -1;
	const Array sc = s["scores"];
	double best = -INFINITY;
	for (int64_t i = 0; i < sc.size(); i++) best = std::max(best, double(sc[i]));
	std::vector<int> top;
	for (int64_t i = 0; i < sc.size(); i++)
		if (double(sc[i]) == best) top.push_back(int(i));
	Dictionary e;
	e["at"] = end;
	e["reason"] = heg >= 0 ? "hegemony" : "time";
	e["winner"] = heg >= 0 ? Variant(heg) : top.size() == 1 ? Variant(top[0]) : Variant();
	Array fl;
	for (int64_t i = 0; i < sc.size(); i++) fl.push_back(std::floor(double(sc[i])));
	e["scores"] = fl;
	s["ended"] = e;
	return e;
}

void World::checkHegemony(double now) {
	Dictionary s = SEASON(st);
	if (!nil(s["ended"])) return;
	const int h = hegemon(scored(REGIONS(st)));
	const Variant cur = s["hegemony"];
	if (h < 0) s["hegemony"] = Variant();
	else if (nil(cur) || int(Dictionary(cur)["alliance"]) != h) {
		Dictionary x;
		x["alliance"] = h;
		x["since"] = now;
		s["hegemony"] = x;
	}
}

void World::newSeason(double now) {
	st["regions"] = fresh_regions();
	st["transit"] = Array();
	st["hauls"] = Array();
	st["season"] = fresh_season(double(SEASON(st)["id"]) + 1, now, season);
}

Array World::events() {
	const Dictionary s = SEASON(st);
	const double seed = nil(s.get("seed", Variant())) ? season_seed(s["id"], s["startAt"]) : double(s["seed"]);
	const auto key = std::make_tuple(seed, double(s["startAt"]), double(s["endAt"]));
	if (schedKey != key) schedKey = key, sched = season_events(seed, s["startAt"], s["endAt"]);
	return sched;
}

Array World::activeEvents(double now) { return !nil(SEASON(st)["ended"]) ? Array() : active_events(events(), now); }

Variant World::nextEvent(double now) {
	const Variant e = !nil(SEASON(st)["ended"]) ? Variant() : next_event(events(), now);
	return !nil(e) && double(Dictionary(e)["startAt"]) < seasonEndsAt() ? e : Variant();
}

Variant World::eventIn(const std::string &region, const std::string &kind, double now) {
	const Array a = activeEvents(now);
	for (int64_t i = 0; i < a.size(); i++) {
		const Dictionary e = a[i];
		if (S(e["region"]) == region && S(e["kind"]) == kind) return e;
	}
	return Variant();
}

Variant World::nextEventAt() {
	const Dictionary s = SEASON(st);
	if (!nil(s["ended"])) return Variant();
	const double after = nil(s.get("evAt", Variant())) ? double(s["startAt"]) : double(s["evAt"]), end = seasonEndsAt();
	Variant at;
	const Array list = events();
	for (int64_t i = 0; i < list.size(); i++) {
		const Dictionary e = list[i];
		const double sa = e["startAt"], ea = e["endAt"];
		const Variant x = sa > after ? Variant(sa) : ea > after ? Variant(ea) : Variant();
		if (!nil(x) && double(x) <= end && (nil(at) || double(x) < double(at))) at = x;
		if (sa > after) break;
	}
	return at;
}

World::EventTick World::eventTick(double now) {
	Dictionary s = SEASON(st);
	EventTick out;
	if (!nil(s["ended"])) return out;
	const double after = nil(s.get("evAt", Variant())) ? double(s["startAt"]) : double(s["evAt"]), to = std::min(now, seasonEndsAt());
	if (to <= after) return out;
	const Array list = events();
	for (int64_t i = 0; i < list.size(); i++) {
		const Dictionary e = list[i];
		const double sa = e["startAt"], ea = e["endAt"];
		if (sa > after && sa <= to && ea > to) out.started.push_back(e);
	}
	for (int64_t i = 0; i < list.size(); i++) {
		const Dictionary e = list[i];
		const double sa = e["startAt"], ea = e["endAt"];
		if (ea > after && ea <= to && sa <= to) out.ended.push_back(e);
	}
	s["evAt"] = to;
	for (int64_t i = 0; i < out.ended.size(); i++) {
		const Dictionary e = out.ended[i];
		if (S(e["kind"]) != "landmarkSiege") continue;
		const Dictionary regions = REGIONS(st);
		const Variant r = regions.get(e["region"], Variant());
		if (nil(r) || !Dictionary(r).has("landmark")) continue;
		const Dictionary lm = Dictionary(r)["landmark"];
		if (int(lm["holder"]) >= 0 && bool(lm["garrisoned"])) eventScore(int(lm["holder"]), T().SIEGE_held, e["endAt"]);
	}
	out.changed = out.started.size() > 0 || out.ended.size() > 0;
	return out;
}

void World::eventScore(int a, double pts, double now) {
	advance(now);
	Dictionary s = SEASON(st);
	if (!nil(s["ended"]) || !(pts > 0) || a < 0 || size_t(a) >= N()) return;
	if (!s.has("event") || nil(s["event"])) s["event"] = zeros();
	Array ev = s["event"];
	ev[a] = double(ev[a]) + pts;
}

Variant World::region(const std::string &id) const { return REGIONS(st).get(G(id), Variant()); }

// rep.claims[i] ?? 0 for each alliance
static Array per_alliance(const Variant &v) {
	const Array a = nil(v) ? Array() : Array(v);
	Array out;
	for (size_t i = 0; i < N(); i++) out.push_back(int64_t(i) < a.size() && !nil(a[int64_t(i)]) ? a[int64_t(i)] : Variant(0));
	return out;
}

World::Reported World::report(const std::string &id, const Dictionary &rep, double now) {
	Reported res;
	const auto *w = graph_region(id);
	Dictionary regions = REGIONS(st);
	const Variant curv = regions.get(G(id), Variant());
	if (!w || nil(curv)) return res;
	const Dictionary cur = curv;
	// the old owners score up to now
	const Variant ended = advance(now);
	const Array claims = per_alliance(rep["claims"]), live = per_alliance(rep["live"]);
	double best = -INFINITY;
	for (int64_t i = 0; i < claims.size(); i++) best = std::max(best, double(claims[i]));
	std::vector<int> leaders;
	for (int64_t i = 0; i < claims.size(); i++)
		if (double(claims[i]) == best && double(claims[i]) > 0) leaders.push_back(int(i));
	const int leader = leaders.size() == 1 ? leaders[0] : -1;
	int owner = cur["owner"];
	bool rejected = false;
	if (w->role == "home") {
		owner = w->alliance;
		rejected = leader >= 0 && leader != owner;
	} else if (leader >= 0) owner = leader;
	std::vector<int> present, foes;
	for (int64_t i = 0; i < live.size(); i++)
		if (double(live[i]) > 0) present.push_back(int(i));
	for (int a : present)
		if (a != owner) foes.push_back(a);
	bool claiming = false;
	const Array ch = rep.get("channel", Array());
	for (int64_t i = 0; i < ch.size(); i++)
		if (double(ch[i]) > 0 && int(i) != owner) claiming = true;
	const bool contested = owner >= 0 ? !foes.empty() || claiming : present.size() >= 2;
	bool claimsFoe = false;
	for (int64_t i = 0; i < claims.size(); i++)
		if (double(claims[i]) > 0 && int(i) != owner) claimsFoe = true;
	const bool besieged = w->role == "home" && (!foes.empty() || claiming || claimsFoe);
	Dictionary next;
	next["id"] = G(id);
	next["owner"] = owner;
	next["claims"] = claims;
	next["live"] = live;
	next["contested"] = contested;
	next["besieged"] = besieged;
	// M7f: the landmark, favour and prestige, a ruined town (season score; the map's landmark icons)
	if (rep.has("landmark") && !nil(rep["landmark"])) {
		const Dictionary lm = rep["landmark"];
		const int h = lm["holder"];
		Dictionary l;
		l["id"] = lm["id"];
		l["holder"] = h >= 0 && size_t(h) < N() ? h : -1;
		l["guardian"] = lm["guardian"];
		l["state"] = lm["state"];
		l["hp"] = lm["hp"];
		l["garrisoned"] = lm["garrisoned"];
		if (lm.has("back")) l["backAt"] = now + double(lm["back"]) * 60000;
		next["landmark"] = l;
	}
	if (rep.has("prestige")) {
		const Array p = rep["prestige"];
		bool some = false;
		for (int64_t i = 0; i < p.size(); i++)
			if (double(p[i]) > 0) some = true;
		if (some) next["prestige"] = per_alliance(p);
	}
	if (bool(rep.get("ruined", false))) next["ruined"] = true;
	if (rep.has("lords") && Array(rep["lords"]).size()) {
		const Array ls = rep["lords"];
		Array out;
		for (int64_t i = 0; i < ls.size(); i++) {
			const Dictionary l = ls[i];
			Dictionary x;
			x["id"] = String(l["id"]);
			x["holds"] = int64_t(int32_t(int64_t(double(l["holds"]))));
			x["men"] = int64_t(int32_t(int64_t(double(l["men"]))));
			if (l.has("raid") && !nil(l["raid"])) {
				Dictionary r;
				r["at"] = double(Dictionary(l["raid"])["at"]);
				x["raid"] = r;
			}
			if (l.has("backAt")) x["backAt"] = double(l["backAt"]);
			out.push_back(x);
		}
		next["lords"] = out;
	}
	// W-62: a landmark taken while its siege runs scores its captor
	const int was = cur.has("landmark") ? int(Dictionary(cur["landmark"])["holder"]) : -1, holder = next.has("landmark") ? int(Dictionary(next["landmark"])["holder"]) : -1;
	if (holder >= 0 && holder != was && !nil(eventIn(id, "landmarkSiege", now))) eventScore(holder, T().SIEGE_capture, now);
	const bool changed = js_stringify(next) != js_stringify(cur);
	regions[G(id)] = next;
	if (changed) checkHegemony(now);
	res.rejected = rejected;
	res.changed = changed || !nil(ended);
	res.ended = ended;
	return res;
}

void World::sacrilege(int a, double now) {
	advance(now);
	Dictionary s = SEASON(st);
	if (!nil(s["ended"]) || a < 0 || size_t(a) >= N()) return;
	Array sc = s["scores"];
	sc[a] = double(sc[a]) - data().season.LIVING.sacrilege;
}

void World::setTravel(int a, double k) {
	if (a < 0 || size_t(a) >= N()) return;
	Dictionary s = SEASON(st);
	if (!s.has("travel") || nil(s["travel"])) {
		Array t;
		for (size_t i = 0; i < N(); i++) t.push_back(1);
		s["travel"] = t;
	}
	Array t = s["travel"];
	t[a] = k;
}

static Dictionary error(const std::string &code, const std::string &detail) {
	Dictionary e;
	e["error"] = G(code);
	e["detail"] = G(detail);
	return e;
}

Dictionary World::transfer(int pid, int alliance, const Dictionary &o, double now, WorldPorts &ports, bool safe) {
	if (alliance < 0) return error("noAlliance", "join an alliance first");
	const std::string from = S(o["from"]), to = S(o["to"]);
	if (!graph_region(from) || !graph_region(to)) return error("region", "unknown region");
	const std::optional<WorldEdge> e = world_edge(from, to);
	if (!e) return error("notAdjacent", from + " does not border " + to);
	Array transit = TRANSIT(st);
	for (int64_t i = 0; i < transit.size(); i++)
		if (int(Dictionary(transit[i])["pid"]) == pid) return error("onRoad", "your group is on the road");
	const Dictionary out = ports.depart(from, pid, e->sideA, to, season.foeRadius);
	if (out.has("error")) return out;
	const Dictionary s = SEASON(st);
	const Variant travel = s.get("travel", Variant());
	const double k = nil(travel) ? 1 : double(Array(travel)[alliance]);
	const Variant cargo = out.get("cargo", Variant());
	const double ms = js::round((e->ms * season.travelScale + double(out["off"]) * season.offExitMsPerTile) * cargo_factor(cargo) * k);
	const Array ids = out["ids"];
	st["seq"] = int64_t(st["seq"]) + 1;
	Dictionary t;
	t["id"] = st["seq"];
	t["pid"] = pid;
	t["alliance"] = alliance;
	t["from"] = G(from);
	t["to"] = G(to);
	t["side"] = G(e->sideB);
	t["ids"] = ids;
	if (out.has("lost") && !nil(out["lost"]) && Dictionary(out["lost"]).size()) t["lost"] = out["lost"];
	t["men"] = ids.size();
	t["departAt"] = now;
	t["arriveAt"] = now + ms;
	t["state"] = "moving";
	if (!nil(cargo)) t["cargo"] = cargo;
	const Array path = o.get("path", Array());
	if (path.size()) t["path"] = path.duplicate();
	if (safe) t["safe"] = safe;
	transit.push_back(t);
	if (st.has("hauls") && Array(st["hauls"]).size()) { // his latest order stands
		const Array hs = st["hauls"];
		Array keep;
		for (int64_t i = 0; i < hs.size(); i++)
			if (int(Dictionary(hs[i])["pid"]) != pid) keep.push_back(hs[i]);
		st["hauls"] = keep;
	}
	return t;
}

bool World::wake(int pid, double now) {
	bool woke = false;
	const Array hs = st.get("hauls", Array());
	for (int64_t i = 0; i < hs.size(); i++) {
		Dictionary h = hs[i];
		if (int(h["pid"]) == pid && bool(h.get("held", false))) h["held"] = false, h["retryAt"] = now, woke = true;
	}
	return woke;
}

bool World::due(double now, WorldPorts &ports) {
	bool changed = false;
	const auto keyOf = [](const Dictionary &t) { return S(t["to"]) + "|" + std::to_string(int(t["alliance"])); };
	const auto isDue = [&](const Dictionary &t) { return (S(t["state"]) == "moving" ? double(t["arriveAt"]) : double(t.get("retryAt", 0))) <= now; };
	// a line still waiting for its retry holds back newcomers to the same region and alliance
	std::set<std::string> blocked;
	std::vector<Dictionary> dueList;
	{
		const Array transit = TRANSIT(st);
		for (int64_t i = 0; i < transit.size(); i++) {
			const Dictionary t = transit[i];
			if (S(t["state"]) == "queued" && !isDue(t)) blocked.insert(keyOf(t));
		}
		for (int64_t i = 0; i < transit.size(); i++)
			if (isDue(transit[i])) dueList.push_back(transit[i]);
	}
	std::stable_sort(dueList.begin(), dueList.end(), [](const Dictionary &a, const Dictionary &b) {
		const double d = double(a["arriveAt"]) - double(b["arriveAt"]);
		return d != 0 ? d < 0 : int64_t(a["id"]) < int64_t(b["id"]);
	});
	const auto queue = [&](Dictionary &t) {
		if (S(t["state"]) != "queued") t["state"] = "queued", changed = true;
		t["retryAt"] = now + T().RETRY_MS;
	};
	for (Dictionary &t : dueList) {
		const std::string key = keyOf(t);
		if (blocked.count(key)) {
			queue(t);
			continue;
		}
		const Dictionary r = ports.arrive(S(t["to"]), t["pid"], t["alliance"], t["ids"], S(t["side"]), t.get("lost", Variant()), t.get("cargo", Variant()));
		const bool ok = r.has("ok");
		if (ok || S(r.get("error", "")) == "gone") {
			const Array transit = TRANSIT(st);
			Array keep;
			for (int64_t i = 0; i < transit.size(); i++)
				if (int64_t(Dictionary(transit[i])["id"]) != int64_t(t["id"])) keep.push_back(transit[i]); // ids are unique: x !== t
			st["transit"] = keep;
			changed = true;
			// W-62: a caravan rush at its market scores the convoy's loads
			const double loads = ok ? cargo_loads(t.get("cargo", Variant())) : 0;
			if (loads > 1e-9 && !nil(eventIn(S(t["to"]), "caravanRush", now))) eventScore(t["alliance"], std::min(T().RUSH_cap, std::ceil(loads * T().RUSH_perLoad)), now);
			// a haul: the next leg leaves at once, if he is online (below)
			if (ok && t.has("path") && Array(t["path"]).size()) {
				if (!st.has("hauls")) st["hauls"] = Array();
				Dictionary h;
				h["pid"] = t["pid"];
				h["alliance"] = t["alliance"];
				h["at"] = t["to"];
				h["path"] = t["path"];
				h["retryAt"] = now;
				if (bool(t.get("safe", false))) h["safe"] = true;
				Array(st["hauls"]).push_back(h);
			}
			continue;
		}
		blocked.insert(key);
		queue(t);
	}
	// haul legs due: sent on, or tried again later
	const Array hauls = st.get("hauls", Array()).duplicate(); // [...hauls]: the same legs
	for (int64_t i = 0; i < hauls.size(); i++) {
		Dictionary h = hauls[i];
		if (bool(h.get("held", false)) || double(h["retryAt"]) > now) continue;
		changed = true;
		if (!ports.online(h["pid"])) {
			h["held"] = true; // W-97: no new leg while he is offline
			continue;
		}
		const Array path = h["path"];
		Dictionary o;
		o["from"] = h["at"];
		o["to"] = path[0];
		if (path.size() > 1) o["path"] = path.slice(1);
		const Dictionary out = transfer(h["pid"], h["alliance"], o, now, ports, bool(h.get("safe", false)));
		const std::string err = S(out.get("error", ""));
		if (out.has("error") && err != "notOwner" && err != "notAdjacent" && err != "region") h["retryAt"] = now + T().HAUL_RETRY_MS;
		else { // a player has one haul at most (a leg's transfer drops his others): x !== h is by player
			const Array hs = st["hauls"];
			Array keep;
			for (int64_t k = 0; k < hs.size(); k++)
				if (int(Dictionary(hs[k])["pid"]) != int(h["pid"])) keep.push_back(hs[k]);
			st["hauls"] = keep;
		}
	}
	return changed;
}

Variant World::nextDue() {
	Variant at;
	const Array hs = st.get("hauls", Array());
	for (int64_t i = 0; i < hs.size(); i++) {
		const Dictionary h = hs[i];
		if (!bool(h.get("held", false)) && (nil(at) || double(h["retryAt"]) < double(at))) at = double(h["retryAt"]);
	}
	const Array transit = TRANSIT(st);
	for (int64_t i = 0; i < transit.size(); i++) {
		const Dictionary t = transit[i];
		const double x = S(t["state"]) == "moving" ? double(t["arriveAt"]) : double(t.get("retryAt", t["arriveAt"]));
		if (nil(at) || x < double(at)) at = x;
	}
	return at;
}

Variant World::nextAlarm() {
	std::vector<double> xs;
	for (const Variant &x : { nextDue(), nextEventAt(), !nil(SEASON(st)["ended"]) ? Variant() : Variant(seasonEndsAt()) })
		if (!nil(x)) xs.push_back(double(x));
	return xs.empty() ? Variant() : Variant(*std::min_element(xs.begin(), xs.end()));
}

Array World::personsInTransit() const {
	Array out;
	std::set<std::string> seen;
	const Array transit = TRANSIT(st);
	for (int64_t i = 0; i < transit.size(); i++) {
		const Array ids = Dictionary(transit[i])["ids"];
		for (int64_t k = 0; k < ids.size(); k++)
			if (seen.insert(S(ids[k])).second) out.push_back(ids[k]);
	}
	return out;
}

Dictionary World::snapshot(int pid, int alliance, const std::vector<double> &members, const std::vector<double> &clans, double now) {
	const Array regions = REGIONS(st).values(), transit = TRANSIT(st);
	Array alliances;
	for (size_t a = 0; a < N(); a++) {
		Dictionary x;
		double owned = 0, soldiers = 0, inTransit = 0;
		for (int64_t i = 0; i < regions.size(); i++) {
			const Dictionary r = regions[i];
			if (int(r["owner"]) == int(a)) owned++;
			const Array live = r["live"];
			soldiers = soldiers + (int64_t(a) < live.size() ? double(live[int64_t(a)]) : 0);
		}
		for (int64_t i = 0; i < transit.size(); i++) {
			const Dictionary t = transit[i];
			if (int(t["alliance"]) == int(a)) inTransit = inTransit + double(t["men"]);
		}
		x["id"] = int64_t(a);
		x["members"] = a < members.size() ? members[a] : 0;
		x["clans"] = a < clans.size() ? clans[a] : 0;
		x["regions"] = owned;
		x["soldiers"] = soldiers;
		x["inTransit"] = inTransit;
		alliances.push_back(x);
	}
	Dictionary you;
	you["id"] = pid;
	you["alliance"] = alliance < 0 ? Variant() : Variant(alliance);
	Array mine;
	for (int64_t i = 0; i < transit.size(); i++)
		if (int(Dictionary(transit[i])["pid"]) == pid) mine.push_back(snap_of(transit[i]));
	Dictionary evs;
	evs["active"] = activeEvents(now);
	evs["next"] = nextEvent(now);
	Dictionary out;
	out["season"] = SEASON(st)["id"];
	out["score"] = seasonSnap(now);
	out["at"] = now;
	out["you"] = you;
	out["alliances"] = alliances;
	out["regions"] = regions;
	out["transit"] = mine;
	out["convoys"] = convoys(pid, alliance);
	out["boards"] = Dictionary();
	out["events"] = evs;
	out["last"] = st.get("last", Variant());
	return out;
}

Array World::convoys(int pid, int alliance) {
	const Dictionary regions = REGIONS(st);
	const auto liveOf = [&](const Dictionary &r) {
		const Array live = r["live"];
		return alliance >= 0 && alliance < live.size() ? double(live[alliance]) : 0.0;
	};
	const auto here = [&](const std::string &id) {
		const Variant r = regions.get(G(id), Variant());
		return alliance >= 0 && !nil(r) && liveOf(r) > 0;
	};
	const auto near = [&](const std::string &id) {
		if (here(id)) return true;
		const Array vs = regions.values();
		for (int64_t i = 0; i < vs.size(); i++) {
			const Dictionary r = vs[i];
			if (S(r["id"]) != id && adjacent(S(r["id"]), id) && alliance >= 0 && liveOf(r) > 0) return true;
		}
		return false;
	};
	Array out;
	const Array transit = TRANSIT(st);
	for (int64_t i = 0; i < transit.size(); i++) {
		const Dictionary t = transit[i];
		const bool safe = bool(t.get("safe", false));
		if (!(int(t["pid"]) == pid || int(t["alliance"]) == alliance || (safe ? here(S(t["to"])) : near(S(t["from"])) || near(S(t["to"]))))) continue;
		Dictionary c = snap_of(t);
		const Variant cargo = t.get("cargo", Variant());
		c["alliance"] = t["alliance"];
		const std::string cart = slowest(cargo);
		if (!cart.empty()) c["cart"] = G(cart);
		c["loads"] = js::round(cargo_loads(cargo) * 100) / 100;
		Dictionary goods;
		int64_t items = 0;
		cargo_goods(cargo, goods, items);
		c["goods"] = goods;
		c["items"] = items;
		c["mine"] = int(t["pid"]) == pid;
		out.push_back(c);
	}
	return out;
}

Dictionary World::seasonSnap(double now) {
	const Dictionary s = SEASON(st), regions = REGIONS(st);
	const std::vector<double> rates = alliance_rates(scored(regions));
	const bool over = !nil(s["ended"]);
	const double end = seasonEndsAt(), accrued = s["accruedAt"], to = over ? accrued : std::max(accrued, std::min(now, end));
	const double h = (to - accrued) / data().season.HOUR_MS;
	const auto owner = [&](const std::string &id) { return regions.has(G(id)) ? int(Dictionary(regions[G(id)])["owner"]) : -1; };
	Dictionary out;
	out["id"] = s["id"];
	out["startAt"] = s["startAt"];
	out["endAt"] = s["endAt"];
	out["left"] = over ? 0 : std::max(0.0, end - now);
	Array scores;
	if (over) scores = Array(Dictionary(s["ended"])["scores"]).duplicate();
	else {
		const Array sc = s["scores"];
		for (int64_t i = 0; i < sc.size(); i++) scores.push_back(std::floor(double(sc[i]) + rates[size_t(i)] * h));
	}
	out["scores"] = scores;
	Array rs;
	for (double r : rates) rs.push_back(r);
	out["rates"] = rs;
	out["omphalos"] = owner(data().season.OMPHALOS);
	Dictionary towns;
	for (const std::string &t : data().season.FRONTIER_TOWNS) towns[G(t)] = owner(t);
	out["towns"] = towns;
	const Variant hg = s["hegemony"];
	if (!nil(hg) && !over) {
		Dictionary x = Dictionary(hg).duplicate();
		x["endsAt"] = double(Dictionary(hg)["since"]) + data().season.HEGEMONY.ms;
		out["hegemony"] = x;
	} else out["hegemony"] = Variant();
	out["ended"] = s["ended"];
	if (s.has("event") && !nil(s["event"])) {
		const Array ev = s["event"];
		Array fl;
		for (int64_t i = 0; i < ev.size(); i++) fl.push_back(std::floor(double(ev[i])));
		out["event"] = fl;
	}
	return out;
}

} // namespace sim
