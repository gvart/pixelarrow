// The offline world layer (see local_world.h): src/dev/localWorld.ts TsWorld, line for line.
#include "local_world.h"

#include <algorithm>
#include <cmath>

#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/variant/packed_string_array.hpp>

#include "grid.h"
#include "host.h"
#include "js_json.h"
#include "roster.h"
#include "sim_data.h"
#include "warlords.h"

namespace godot {

static std::string S(const Variant &v) { return String(v).utf8().get_data(); }
static String G(const std::string &s) { return String::utf8(s.c_str()); }
// regionDO.ts: a room reports to the world every REPORT_TICKS (when its summary changed); a day of the warlords' age
static constexpr int REPORT_TICKS = 50, LORD_AGE_TICKS = 600;
static constexpr double DAY_MS = 86400000;

LocalWorld::Here *LocalWorld::here(const std::string &id) {
	for (Here &h : rooms)
		if (h.id == id) return &h;
	return nullptr;
}

Ref<LocalWorld> LocalWorld::create(const Array &specs, const Dictionary &o) {
	Ref<LocalWorld> w;
	ERR_FAIL_COND_V_MSG(!SimData::loaded(), w, "LocalWorld.create: SimData.load first");
	w.instantiate();
	w->msPerTick = double(o.get("ms_per_tick", 100));
	sim::WorldTables::Season season = sim::data().world.WAR_SEASON;
	const Dictionary so = o.get("season", Dictionary());
	if (so.has("id")) season.id = so["id"];
	if (so.has("travelScale")) season.travelScale = so["travelScale"];
	if (so.has("offExitMsPerTile")) season.offExitMsPerTile = so["offExitMsPerTile"];
	if (so.has("foeRadius")) season.foeRadius = so["foeRadius"];
	if (so.has("lengthMs")) season.lengthMs = so["lengthMs"];
	w->world = std::make_unique<sim::World>(sim::fresh_world(double(o.get("start", 0)), season), season);
	w->lordsFrom = Dictionary(w->world->st["season"])["startAt"];
	// each region's grid as it was given: a fresh room (a rollover) starts from it, not from the one its sim built on
	for (int64_t i = 0; i < specs.size(); i++) {
		Dictionary s = Dictionary(specs[i]).duplicate();
		const Ref<Grid> g = s["grid"];
		ERR_FAIL_COND_V_MSG(g.is_null(), Ref<LocalWorld>(), "LocalWorld.create: a room without a grid");
		Ref<Grid> copy;
		copy.instantiate();
		copy->g = g->g;
		s["grid"] = copy;
		w->specs.push_back(s);
	}
	w->store = std::make_shared<sim::MemoryStore>();
	w->build();
	return w;
}

// Every room fresh (regionDO.ts ensure: its warlords' clock from the season's start, the world's events on it).
void LocalWorld::build() {
	rooms.clear();
	for (int64_t i = 0; i < specs.size(); i++) {
		const Dictionary s = specs[i];
		const Ref<Grid> pristine = s["grid"];
		Ref<Grid> g;
		g.instantiate();
		g->g = pristine->g;
		const Ref<Sim> sm = Sim::create(g, s["meta"], s["cells"], int64_t(s["seed"]));
		Here h;
		h.id = S(s["id"]);
		h.room = LocalRoom::create(sm, s.get("opts", Dictionary()));
		h.room->share_store(store);
		if (s.has("held")) {
			Dictionary m = h.room->memory();
			m["claims"] = s["held"];
			h.room->recall(m, 0);
		}
		if (h.room->has_warlords()) h.room->set_warlord_age((now() - lordsFrom) / DAY_MS);
		std::vector<sim::AiEntry> entries;
		const Array es = sm->meta.get("entries", Array());
		for (int64_t k = 0; k < es.size(); k++) {
			const Dictionary e = es[k];
			entries.push_back({ S(e["side"]), e["x"], e["y"], e["w"], e["h"] });
		}
		const Array ai = s.get("ai", Array());
		for (int64_t k = 0; k < ai.size(); k++) h.ais.push_back(std::make_unique<sim::AllianceAi>(*sm->s, *sm->bots, entries, int(ai[k])));
		rooms.push_back(std::move(h));
	}
	announce();
}

// the room's messages since its last take onto the world's queue, as [region, pid, message]
void LocalWorld::drain(Here &h) {
	const Array a = h.room->take();
	for (int64_t i = 0; i < a.size(); i++) {
		const Array m = a[i];
		out.push_back(Array::make(G(h.id), m[0], m[1]));
	}
}

Dictionary LocalWorld::Ports::depart(const std::string &from, int pid, const std::string &side, const std::string &to, double foeRadius) {
	Here *h = w->here(from);
	if (!h) {
		Dictionary e;
		e["error"] = "region";
		e["detail"] = G(from);
		return e;
	}
	const Dictionary r = h->room->world_depart(pid, side, to, foeRadius);
	if (r.has("error")) return r;
	w->report(*h, true);
	return r;
}

Dictionary LocalWorld::Ports::arrive(const std::string &to, int pid, int alliance, const Array &ids, const std::string &side, const Variant &lost, const Variant &cargo) {
	Here *h = w->here(to);
	if (!h) {
		Dictionary e;
		e["error"] = "unavailable";
		return e;
	}
	std::vector<std::string> v;
	for (int64_t i = 0; i < ids.size(); i++) v.push_back(S(ids[i]));
	const Dictionary res = h->room->world_arrive(pid, alliance, v, side, lost.get_type() == Variant::DICTIONARY ? Dictionary(lost) : Dictionary(), cargo.get_type() == Variant::DICTIONARY ? Dictionary(cargo) : Dictionary());
	w->drain(*h);
	if (res.has("ok")) w->report(*h, true);
	return res;
}

// room.ts lordReport: the room's lords in world times (from: when the warlords' age counts from)
static Array lord_report(const Array &lords, double from, double now) {
	Array out;
	for (int64_t i = 0; i < lords.size(); i++) {
		const Dictionary l = lords[i];
		Dictionary x;
		const Array ks = l.keys();
		for (int64_t k = 0; k < ks.size(); k++)
			if (S(ks[k]) != "raid" && S(ks[k]) != "fell") x[ks[k]] = l[ks[k]];
		if (l.has("raid")) {
			Dictionary r;
			r["at"] = now + double(l["raid"]) * 1000;
			x["raid"] = r;
		}
		if (l.has("fell")) x["backAt"] = from + (double(l["fell"]) + sim::data().warlords.WARLORD.back) * 86400000;
		out.push_back(x);
	}
	return out;
}

// regionDO.ts report: what the map shows of this region, when it changed (every REPORT_TICKS; force: at once)
void LocalWorld::report(Here &h, bool force) {
	if (!sim::graph_region(h.id) || (!force && h.room->current_tick() % REPORT_TICKS != 0)) return;
	const Dictionary sum = h.room->summary();
	const std::string s = sim::js_stringify(sum);
	if (s == h.reported) return;
	h.reported = s;
	Dictionary rep = sum.duplicate();
	if (sum.has("lords")) {
		rep.erase("lords");
		rep["lords"] = lord_report(sum["lords"], lordsFrom, now());
	}
	world->report(h.id, rep, now());
}

// W-62: every room hears the running and next world events (worldDO.ts announce; regionDO.ts worldEvents)
void LocalWorld::announce() {
	const double t = now();
	const Array events = world->activeEvents(t);
	const Variant next = world->nextEvent(t);
	for (const auto &r : sim::data().world.WORLD_REGIONS) {
		Here *h = here(r.id);
		if (!h) continue;
		h->room->set_world_events(events, next, t);
		drain(*h);
	}
}

void LocalWorld::step() {
	tick++;
	const double t = now();
	const sim::AllyAiTables &A = sim::data().ally;
	for (Here &h : rooms) {
		h.room->tick();
		drain(h);
		// W-72 proposal (regionDO.ts tellFallen): a lord fallen here is told to the other rooms of his domain
		const Array notes = h.room->get_books().get("warlord", Array());
		for (int64_t i = 0; i < notes.size(); i++) {
			const Dictionary n = notes[i];
			if (S(n["what"]) != "fallen") continue;
			const std::string id = S(n["warlord"]);
			const sim::WarlordDef *w = nullptr;
			for (const auto &d : sim::data().warlords.WARLORDS)
				if (d.id == id) w = &d;
			if (!w) continue;
			const double at = (t - lordsFrom) / DAY_MS;
			for (const std::string &x : sim::warlord_domain(*w)) {
				Here *o = here(x);
				if (x == h.id || !o) continue;
				auto f = std::find_if(o->fallen.begin(), o->fallen.end(), [&](const auto &e) { return e.first == w->id; });
				if (f != o->fallen.end() && f->second >= at) continue;
				if (f != o->fallen.end()) f->second = at;
				else o->fallen.emplace_back(w->id, at);
				o->room->warlord_fell(w->id, at);
			}
		}
		if (h.room->has_warlords() && h.room->current_tick() % LORD_AGE_TICKS == 0) h.room->set_warlord_age((t - lordsFrom) / DAY_MS);
		// M7f: a temple or shrine razed costs the razer's alliance score
		if (sim::graph_region(h.id))
			for (int a : h.room->sacrilege) world->sacrilege(a, t);
		// the alliance AIs think on the sim as the tick left it (their snapshot is only read on a think tick)
		if (!h.ais.empty()) {
			sim::Sim &s = *h.room->get_sim()->s;
			if (s.tick % int(A.think) == 0) {
				const auto snap = std::make_shared<const sim::AiSnap>(sim::ai_snap(s));
				for (const auto &ai : h.ais) ai->tick(snap);
			}
		}
		report(h);
	}
	const bool over = Dictionary(world->st["season"])["ended"].get_type() != Variant::NIL;
	const Variant at = over ? Variant(t) : world->nextAlarm();
	if (at.get_type() != Variant::NIL && double(at) <= t) alarm(t);
}

// worldDO.ts arrive: events first (one closing with the season still closes), the season, arrivals, then the rollover or the news
void LocalWorld::alarm(double t) {
	const sim::World::EventTick ev = world->eventTick(t);
	world->advance(t);
	world->due(t, ports);
	if (Dictionary(world->st["season"])["ended"].get_type() != Variant::NIL) rollover(t);
	else if (ev.changed) announce();
}

// worldDO.ts rollover (W-62, W-96): the board kept (no D1: no ladders, no banners), every room anew, the store wiped, the next season
void LocalWorld::rollover(double t) {
	const Dictionary s = world->st["season"];
	const Variant rv = s["ended"];
	if (rv.get_type() == Variant::NIL) return;
	const Dictionary r = rv;
	Dictionary board = r.duplicate();
	board["season"] = s["id"];
	board["startAt"] = s["startAt"];
	Array ev;
	const Array src = s.has("event") && s["event"].get_type() != Variant::NIL ? Array(s["event"]) : Array();
	const Array sc = r["scores"];
	for (int64_t i = 0; i < (src.size() ? src.size() : sc.size()); i++) ev.push_back(src.size() ? std::floor(double(src[i])) : 0.0);
	board["event"] = ev;
	Dictionary ladders;
	for (const std::string &p : sim::data().world.PATH_IDS) ladders[G(p)] = Array();
	board["ladders"] = ladders;
	board["banners"] = 0;
	store = std::make_shared<sim::MemoryStore>();
	world->st["last"] = board;
	world->newSeason(t);
	lordsFrom = Dictionary(world->st["season"])["startAt"];
	build();
}

Dictionary LocalWorld::transfer(int pid, const Dictionary &o) {
	const Dictionary t = world->transfer(pid, store->politics().allianceOf(pid).value_or(-1), o, now(), ports, false);
	Dictionary m;
	if (t.has("error")) {
		m["t"] = "error";
		m["code"] = t["error"];
		if (t.has("detail")) m["detail"] = t["detail"];
	} else {
		m["t"] = "transferred";
		m["transit"] = sim::snap_of(t);
	}
	return m;
}

void LocalWorld::set_online(int pid, bool on) {
	if (!on) {
		live.erase(pid);
		return;
	}
	live.insert(pid);
	world->wake(pid, now());
}

Dictionary LocalWorld::snapshot(int pid) {
	const size_t n = sim::data().world.HOMES.size();
	std::vector<double> members(n, 0), clans(n, 0);
	for (const auto &[p, a] : store->politics().allianceList())
		if (a >= 0 && size_t(a) < n) members[size_t(a)]++;
	const Dictionary snap = world->snapshot(pid, store->politics().allianceOf(pid).value_or(-1), members, clans, now());
	Dictionary m;
	m["t"] = "world";
	const Array ks = snap.keys();
	for (int64_t i = 0; i < ks.size(); i++) m[ks[i]] = snap[ks[i]];
	m["crests"] = Array();
	return m;
}

void LocalWorld::send(const String &region, int pid, const Dictionary &msg) {
	Here *h = here(S(region));
	if (!h) return;
	h->room->send_as(pid, msg);
	drain(*h);
}

Array LocalWorld::take() {
	const Array a = out;
	out = Array();
	return a;
}

void LocalWorld::seed(int pid, int alliance, const Array &persons) {
	for (int64_t i = 0; i < persons.size(); i++) store->add(pid, sim::war_person_from(persons[i]));
	store->politics().setAlliance(pid, alliance);
}

Ref<LocalRoom> LocalWorld::room(const String &region) {
	Here *h = here(S(region));
	return h ? h->room : Ref<LocalRoom>();
}

PackedStringArray LocalWorld::room_ids() const {
	PackedStringArray a;
	for (const Here &h : rooms) a.push_back(G(h.id));
	return a;
}

Array LocalWorld::ai_stats(const String &region) {
	Array out;
	Here *h = here(S(region));
	if (!h) return out;
	for (const auto &ai : h->ais) {
		const sim::AllianceAiStats st = ai->stats();
		Dictionary d;
		d["raised"] = st.raised, d["squads"] = st.squads, d["orders"] = st.orders, d["bots"] = st.bots;
		d["target"] = st.target, d["doing"] = sim::ps(st.doing), d["laid"] = st.laid;
		d["men"] = ai->men(), d["present"] = ai->present();
		out.push_back(d);
	}
	return out;
}

Dictionary LocalWorld::constants() {
	const sim::WorldTables &T = sim::data().world;
	Dictionary c, cargo;
	c["FAVOUR_CARRIED"] = LocalRoom::FAVOUR_CARRIED;
	cargo["wagon"] = T.CARGO_wagon;
	cargo["porter"] = T.CARGO_porter;
	c["CARGO_TRAVEL"] = cargo;
	c["RETRY_MS"] = T.RETRY_MS;
	c["HAUL_RETRY_MS"] = T.HAUL_RETRY_MS;
	c["REPORT_TICKS"] = REPORT_TICKS;
	return c;
}

void LocalWorld::_bind_methods() {
	ClassDB::bind_static_method("LocalWorld", D_METHOD("constants"), &LocalWorld::constants);
	ClassDB::bind_static_method("LocalWorld", D_METHOD("create", "rooms", "opts"), &LocalWorld::create);
	ClassDB::bind_method(D_METHOD("step"), &LocalWorld::step);
	ClassDB::bind_method(D_METHOD("transfer", "pid", "order"), &LocalWorld::transfer);
	ClassDB::bind_method(D_METHOD("set_online", "pid", "on"), &LocalWorld::set_online);
	ClassDB::bind_method(D_METHOD("snapshot", "pid"), &LocalWorld::snapshot);
	ClassDB::bind_method(D_METHOD("send", "region", "pid", "msg"), &LocalWorld::send);
	ClassDB::bind_method(D_METHOD("take"), &LocalWorld::take);
	ClassDB::bind_method(D_METHOD("seed", "pid", "alliance", "persons"), &LocalWorld::seed);
	ClassDB::bind_method(D_METHOD("state"), &LocalWorld::state);
	ClassDB::bind_method(D_METHOD("room", "region"), &LocalWorld::room);
	ClassDB::bind_method(D_METHOD("room_ids"), &LocalWorld::room_ids);
	ClassDB::bind_method(D_METHOD("ai_stats", "region"), &LocalWorld::ai_stats);
	ClassDB::bind_method(D_METHOD("store_dump"), &LocalWorld::store_dump);
	ClassDB::bind_method(D_METHOD("get_tick"), &LocalWorld::get_tick);
	ClassDB::bind_method(D_METHOD("get_now"), &LocalWorld::get_now);
}

} // namespace godot
