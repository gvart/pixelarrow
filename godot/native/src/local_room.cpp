// The local transport round the room (see local_room.h).
#include "local_room.h"

#include <algorithm>
#include <set>

#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/variant/string.hpp>

#include "js_json.h"
#include "room_parse.h"
#include "sim_data.h"

namespace godot {

static std::string S(const Variant &v) { return String(v).utf8().get_data(); }

Ref<LocalRoom> LocalRoom::create(const Ref<Sim> &s, const Dictionary &o) {
	Ref<LocalRoom> r;
	ERR_FAIL_COND_V_MSG(s.is_null(), r, "LocalRoom.create: no sim");
	r.instantiate();
	r->sim = s;
	sim::RoomOpts opts;
	opts.seed = uint32_t(int64_t(s->seed));
	opts.cap = int(o.get("cap", sim::Net::DEFAULT_CAP));
	if (o.has("quotas")) {
		const Array q = o["quotas"];
		for (int64_t i = 0; i < q.size(); i++) opts.quotas.push_back(int(q[i]));
	}
	opts.keyframeEvery = int(o.get("keyframeEvery", sim::Net::KEYFRAME_EVERY));
	opts.allowArmy = bool(o.get("allowArmy", true));
	if (o.has("allowDev")) opts.allowDev = bool(o["allowDev"]);
	opts.fightQuiet = int(o.get("fightQuiet", sim::Net::FIGHT_QUIET));
	opts.wild = bool(o.get("wild", false));
	opts.roam = bool(o.get("roam", false));
	if (o.has("home")) opts.home = int(o["home"]);
	r->pid = int(o.get("pid", 1));
	r->room = std::make_unique<sim::Room>(*s->s, *s->bots, s->meta, opts);
	r->room->startLife(s->cells, s->built, bool(o.get("warlords", false)));
	return r;
}

void LocalRoom::conn(int p) {
	if (std::find(conns.begin(), conns.end(), p) == conns.end()) conns.push_back(p);
}

void LocalRoom::tell(int p, const Variant &m) { out.push_back(Array::make(p, m)); }

// regionDO.ts guideStart, storyStart, encounterStart (masteryStart: D1's, none here), each from the local store
void LocalRoom::welcomed(int p) {
	sim::Room &r = *room;
	const Variant had = guides.get(p, Variant());
	const Variant g = r.startGuide(p, had);
	// W-79: a new player's rations are packed: his save is kept at once, so they are packed only once
	if (had.get_type() == Variant::NIL) {
		const Variant fresh = r.guideSaveOf(p);
		if (fresh.get_type() != Variant::NIL) guides[p] = fresh;
	}
	if (g.get_type() != Variant::NIL) tell(p, g);
	const Variant st = r.startStory(p, stories.get(p, Variant()));
	if (st.get_type() != Variant::NIL) tell(p, st);
	const Variant en = r.startEncounters(p, encounters.get(p, Variant()));
	if (en.get_type() != Variant::NIL) tell(p, en);
}

Dictionary LocalRoom::settlements(int p) const {
	Dictionary s;
	s["t"] = "settlements";
	s["list"] = room->settlementsFor(p);
	return s;
}

Dictionary LocalRoom::world_msg() const {
	Dictionary w;
	w["t"] = "worldEvents";
	w["events"] = worldEv["events"];
	w["next"] = worldEv["next"];
	return w;
}

void LocalRoom::send_as(int p, const Dictionary &raw) {
	conn(p);
	sim::Room &r = *room;
	const std::optional<Dictionary> parsed = sim::parse_client_msg(raw);
	if (!parsed) {
		Dictionary e;
		e["t"] = "error";
		e["code"] = "parse";
		return tell(p, e);
	}
	const Dictionary m = *parsed;
	const std::string t = S(m["t"]);
	if (t == "join") {
		const Dictionary res = r.join(p, m);
		tell(p, res);
		if (S(res["t"]) == "welcome") {
			if (!worldEv.is_empty()) tell(p, world_msg()); // W-62
			tell(p, settlements(p)); // W-63
			welcomed(p);
		}
	} else if (t == "order") {
		const Dictionary o = m["o"];
		const std::string err = r.order(p, o);
		if (!err.empty()) {
			Dictionary e;
			e["t"] = "error";
			e["code"] = String::utf8(err.c_str());
			e["detail"] = err == "notYourGround" || err == "atPeace" ? String::utf8(r.refusal.c_str()) : String(o["kind"]);
			tell(p, e);
		}
	} else if (t == "view") r.view(p, { m["x0"], m["y0"], m["x1"], m["y1"] });
	else if (t == "ping") {
		Dictionary e;
		e["t"] = "pong";
		e["c"] = m["c"];
		e["tick"] = r.currentTick();
		e["idle"] = r.alive() == 0;
		tell(p, e);
	} else if (t == "check") tell(p, r.check(p, m));
	else if (t == "dev") {
		const std::string err = r.dev(p, m);
		if (!err.empty()) {
			Dictionary e;
			e["t"] = "error";
			e["code"] = String::utf8(err.c_str());
			e["detail"] = String::utf8(("dev " + S(m["op"]) + (err == "forbidden" ? ": needs DEV_AUTH=1" : "")).c_str());
			tell(p, e);
		}
	} else if (t == "guide") {
		const Variant g = r.guideHide(p);
		if (g.get_type() != Variant::NIL) guides[p] = g;
	} else if (t == "story") r.storyChoose(p, S(m["option"])); // W-65
	else if (t == "encounter") r.encounterChoose(p, S(m["option"])); // W-65
}

void LocalRoom::tick() {
	const sim::Room::TickOut res = room->tick();
	for (int p : conns) {
		for (const auto &[ap, m] : res.admitted)
			if (ap == p) {
				tell(p, m);
				if (S(m["t"]) == "welcome") {
					welcomed(p); // W-62, W-65: in from the line
					tell(p, settlements(p)); // W-63
				}
			}
		const auto ms = res.msgs.find(p);
		if (ms != res.msgs.end())
			for (const Dictionary &m : ms->second) tell(p, m);
		const auto f = res.frames.find(p);
		if (f != res.frames.end()) tell(p, f->second);
	}
	// what the DO books (regionDO.ts outputs): the saves into the local store, the rest to the caller
	for (int64_t i = 0; i < res.guided.size(); i++) guides[Dictionary(res.guided[i])["pid"]] = Dictionary(res.guided[i])["save"];
	for (int64_t i = 0; i < res.storied.size(); i++) stories[Dictionary(res.storied[i])["pid"]] = Dictionary(res.storied[i])["save"];
	for (int64_t i = 0; i < res.met.size(); i++) encounters[Dictionary(res.met[i])["pid"]] = Dictionary(res.met[i])["save"];
	books = Dictionary();
	const std::pair<const char *, const Array *> named[] = { { "guided", &res.guided }, { "storied", &res.storied }, { "met", &res.met }, { "wild", &res.wild }, { "gathered", &res.gathered }, { "warlord", &res.warlord } };
	for (const auto &[k, a] : named)
		if (a->size()) books[k] = *a;
}

void LocalRoom::set_world_events(const Array &events, const Variant &next, double now) {
	worldEv = Dictionary();
	worldEv["events"] = events;
	worldEv["next"] = next;
	// applyEvents: the events running in this region now onto the room; a guardian wakes once per event
	const std::string region = S(sim->meta["id"]);
	Array mine;
	Variant wake;
	for (int64_t i = 0; i < events.size(); i++) {
		const Dictionary e = events[i];
		if (S(e["region"]) == region && double(e["startAt"]) <= now && now < double(e["endAt"])) {
			mine.push_back(e);
			if (wake.get_type() == Variant::NIL && S(e["kind"]) == "bossWake") wake = e["startAt"];
		}
	}
	room->setWorldEvents(mine);
	if (wake.get_type() != Variant::NIL && woke != wake) {
		room->wakeGuardians();
		woke = wake;
	}
	for (int p : conns) tell(p, world_msg());
}

Array LocalRoom::take() {
	const Array a = out;
	out = Array();
	return a;
}

Dictionary LocalRoom::snapshot() const { return room->snapshot(); }

Dictionary LocalRoom::saves() const {
	Dictionary d;
	d["guide"] = guides;
	d["story"] = stories;
	d["encounter"] = encounters;
	return d;
}

Dictionary LocalRoom::constants() {
	using N = sim::Net;
	Dictionary c;
	c["NET_VERSION"] = N::NET_VERSION;
	c["QUANT"] = N::QUANT;
	c["KEYFRAME_EVERY"] = N::KEYFRAME_EVERY;
	c["WILD_EVERY"] = N::WILD_EVERY;
	c["VISION"] = N::VISION;
	c["CAMERA_MARGIN"] = N::CAMERA_MARGIN;
	c["MAX_SQUAD"] = sim::data().soldiers.ARMY_MAX;
	c["MAX_SQUADS"] = N::MAX_SQUADS;
	c["DEFAULT_CAP"] = N::DEFAULT_CAP;
	c["ALLIANCES"] = N::ALLIANCES;
	c["NODES_EVERY"] = N::NODES_EVERY;
	c["STORE_NEAR"] = N::STORE_NEAR;
	c["BOSS_NEAR"] = N::BOSS_NEAR;
	c["LABOUR_EVERY"] = N::LABOUR_EVERY;
	c["CORPSE_TICKS"] = N::CORPSE_TICKS;
	c["FIGHT_QUIET"] = N::FIGHT_QUIET;
	c["HOME_CLAIM_R"] = N::HOME_CLAIM_R;
	Array g;
	for (const std::string &x : N::goods()) g.push_back(String::utf8(x.c_str()));
	c["GOODS"] = g;
	return c;
}

Variant LocalRoom::parse(const Variant &raw) {
	const std::optional<Dictionary> m = sim::parse_client_msg(raw);
	return m ? Variant(*m) : Variant();
}

String LocalRoom::js_json(const Variant &v) { return String::utf8(sim::js_stringify(v).c_str()); }

void LocalRoom::_bind_methods() {
	ClassDB::bind_static_method("LocalRoom", D_METHOD("create", "sim", "opts"), &LocalRoom::create);
	ClassDB::bind_method(D_METHOD("send", "msg"), &LocalRoom::send);
	ClassDB::bind_method(D_METHOD("send_as", "pid", "msg"), &LocalRoom::send_as);
	ClassDB::bind_method(D_METHOD("close", "pid"), &LocalRoom::close);
	ClassDB::bind_method(D_METHOD("tick"), &LocalRoom::tick);
	ClassDB::bind_method(D_METHOD("take"), &LocalRoom::take);
	ClassDB::bind_method(D_METHOD("snapshot"), &LocalRoom::snapshot);
	ClassDB::bind_method(D_METHOD("current_tick"), &LocalRoom::current_tick);
	ClassDB::bind_method(D_METHOD("books"), &LocalRoom::get_books);
	ClassDB::bind_method(D_METHOD("saves"), &LocalRoom::saves);
	ClassDB::bind_method(D_METHOD("set_world_events", "events", "next", "now"), &LocalRoom::set_world_events);
	ClassDB::bind_method(D_METHOD("set_warlord_age", "days"), &LocalRoom::set_warlord_age);
	ClassDB::bind_method(D_METHOD("warlord_memory"), &LocalRoom::warlord_memory);
	ClassDB::bind_method(D_METHOD("recall_warlords", "memory"), &LocalRoom::recall_warlords);
	ClassDB::bind_method(D_METHOD("memory"), &LocalRoom::memory);
	ClassDB::bind_method(D_METHOD("recall", "memory", "elapsed"), &LocalRoom::recall);
	ClassDB::bind_method(D_METHOD("summary"), &LocalRoom::summary);
	ClassDB::bind_method(D_METHOD("present"), &LocalRoom::present);
	ClassDB::bind_method(D_METHOD("boss_loot"), &LocalRoom::boss_loot);
	ClassDB::bind_method(D_METHOD("road", "pid", "loads", "key"), &LocalRoom::road);
	ClassDB::bind_static_method("LocalRoom", D_METHOD("parse", "raw"), &LocalRoom::parse);
	ClassDB::bind_static_method("LocalRoom", D_METHOD("constants"), &LocalRoom::constants);
	ClassDB::bind_static_method("LocalRoom", D_METHOD("js_json", "v"), &LocalRoom::js_json);
}

} // namespace godot
