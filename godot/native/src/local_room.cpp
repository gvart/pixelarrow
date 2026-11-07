// The local transport round the room (see local_room.h).
#include "local_room.h"

#include <algorithm>
#include <cmath>
#include <functional>
#include <set>

#include <godot_cpp/classes/json.hpp>
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/variant/string.hpp>

#include "grid.h"
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
	r->opts = o;
	r->pid = int(o.get("pid", 1));
	r->room = std::make_unique<sim::Room>(*s->s, *s->bots, s->meta, room_opts(s, o));
	r->room->run = "r"; // offline: one run (TsLocal's)
	r->room->epoch = S(o.get("epoch", "e"));
	r->room->startLife(s->cells, s->built, bool(o.get("warlords", false)));
	return r;
}

sim::RoomOpts LocalRoom::room_opts(const Ref<Sim> &s, const Dictionary &o) {
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
	return opts;
}

// regionDO.ts wakeIn: a named soul wakes in this room's sim (false: no shrine here)
bool LocalRoom::wake(const sim::StoredSoul &s) {
	std::optional<std::pair<std::string, double>> bar;
	if (s.bar) bar = { "p:" + std::to_string(s.bar->first), std::ceil(s.bar->second / 100) };
	return sim->s->spawnNamedSoul(s.person, std::ceil(s.lifeMs / 100), bar);
}

// dropped joins: their men go home
void LocalRoom::flush() { store->release(S(sim->meta["id"]), room->takeReleased()); }

// regionDO.ts muster: his men off the field here fall in (no room: they stay claimed, off the field)
void LocalRoom::muster(int p) {
	sim::Room &r = *room;
	const std::string region = S(sim->meta["id"]);
	const auto here = r.personsHere();
	const sim::WakeSoul wk = [this](const sim::StoredSoul &s) { return wake(s); };
	const auto ids = store->offField(p, region, here, now(), wk);
	if (ids.empty()) return;
	const auto got = store->claimForJoin(p, region, { ids }, here, now(), wk);
	if (std::holds_alternative<std::string>(got)) return;
	const auto m = r.muster(p, std::get<0>(got)[0]);
	if (m.ok && !m.msg.is_empty()) tell(p, m.msg);
}

void LocalRoom::close(int p) {
	room->leave(p);
	flush();
	live.erase(p);
}

void LocalRoom::conn(int p) {
	if (std::find(conns.begin(), conns.end(), p) == conns.end()) conns.push_back(p);
	live.insert(p);
}

void LocalRoom::tell(int p, const Variant &m) { out.push_back(Array::make(p, m)); }

// regionDO.ts guideStart, storyStart, encounterStart (masteryStart: D1's, none here), each from its save in the store;
// between: what the DO does between the guide and the story (a join's setLarder)
void LocalRoom::welcomed(int p, const std::function<void()> &between) {
	sim::Room &r = *room;
	const Variant had = store->saveOf("guide", p);
	const Variant g = r.startGuide(p, had);
	// W-79: a new player's rations are packed: his save is kept at once, so they are packed only once
	if (had.get_type() == Variant::NIL) {
		const Variant fresh = r.guideSaveOf(p);
		if (fresh.get_type() != Variant::NIL) store->keep("guide", p, fresh);
	}
	if (g.get_type() != Variant::NIL) tell(p, g);
	if (between) between();
	const Variant st = r.startStory(p, store->saveOf("story", p));
	if (st.get_type() != Variant::NIL) tell(p, st);
	const Variant en = r.startEncounters(p, store->saveOf("encounter", p));
	if (en.get_type() != Variant::NIL) tell(p, en);
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
		loadSettlements(); // W-63: the settlements as they stand now: the room flies his banner by ground
		const std::string region = S(sim->meta["id"]);
		std::optional<std::vector<std::vector<sim::WarPerson>>> persons;
		std::vector<std::vector<std::string>> squads;
		if (m.has("squads")) {
			const Array sq = m["squads"];
			for (int64_t i = 0; i < sq.size(); i++) {
				std::vector<std::string> ids;
				const Array a = sq[i];
				for (int64_t k = 0; k < a.size(); k++) ids.push_back(S(a[k]));
				squads.push_back(ids);
			}
		}
		if (m.has("squads") && S(m["region"]) == region && r.spawnsNew(p)) {
			const auto got = store->claimForJoin(p, region, squads, r.personsHere(), now(), [this](const sim::StoredSoul &s) { return wake(s); });
			if (const std::string *why = std::get_if<std::string>(&got)) {
				Dictionary e;
				e["t"] = "refused";
				e["reason"] = "army";
				e["detail"] = String::utf8(why->c_str());
				return tell(p, e);
			}
			persons = std::get<0>(got);
		}
		const Dictionary res = r.join(p, m, persons ? &*persons : nullptr);
		tell(p, res);
		if (S(res["t"]) == "welcome") {
			if (!worldEv.is_empty()) tell(p, world_msg()); // W-62
			sendSettlements(p, true); // W-63
		}
		if (S(res["t"]) == "refused" && persons) {
			std::vector<std::string> all;
			for (const auto &s : squads) all.insert(all.end(), s.begin(), s.end());
			store->release(region, all);
		}
		// the DO's D1 reads (path, army, larder, muster) for a persons join; a dev class army has no men in the store, so
		// the room counts his field (as a DO with no D1)
		if (S(res["t"]) == "welcome" && m.has("squads")) {
			r.setPath(p, store->path(p));
			r.setArmy(p, store->armyCount(p));
			welcomed(p, [&] { r.setLarder(p, store->goodsOf(p)); });
			muster(p);
		} else if (S(res["t"]) == "welcome") welcomed(p);
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
		if (g.get_type() != Variant::NIL) store->keep("guide", p, g);
	} else if (t == "story") r.storyChoose(p, S(m["option"])); // W-65
	else if (t == "encounter") r.encounterChoose(p, S(m["option"])); // W-65
}

void LocalRoom::tick() {
	sim::Room &r = *room;
	const sim::Room::TickOut res = r.tick();
	const std::string region = S(sim->meta["id"]);
	const sim::WakeSoul wk = [this](const sim::StoredSoul &s) { return wake(s); };
	// the tick's books into the store, as regionDO.ts writes them to D1
	for (const auto &f : res.fights) {
		if (store->applyFight(f.id, region, f.report, now())) store->politics().bookFight(region, sim::fight_kills(f.report), now()); // W-64: the crown's war goals' shares
		std::vector<int> held; // the owners of men taken captive (in order of first)
		for (const auto &x : f.report.persons)
			if (x.state == "captive") {
				const int q = std::stoi(x.owner.substr(2));
				if (std::find(held.begin(), held.end(), q) == held.end()) held.push_back(q);
			}
		for (int q : held) r.setArmy(q, store->armyCount(q));
	}
	for (const std::string &id : res.faded) store->fade(id);
	store->freeRaided(region, res.raided, now(), wk);
	for (const auto &c : res.souls) {
		const sim::WarPerson p = sim::war_person_from(c.person);
		if (!store->claimSoul(c.pid, p, region)) sim->s->dropPersons({ p.id });
		r.setArmy(c.pid, store->armyCount(c.pid));
	}
	for (const auto &[p, goods] : res.larder) {
		store->take(p, goods);
		r.setLarder(p, store->goodsOf(p));
	}
	for (int p : conns) {
		for (const auto &[ap, m] : res.admitted)
			if (ap == p) {
				tell(p, m);
				if (S(m["t"]) == "welcome") {
					welcomed(p); // W-62, W-65: in from the line
					sendSettlements(p, true); // W-63
				}
			}
		const auto ms = res.msgs.find(p);
		if (ms != res.msgs.end())
			for (const Dictionary &m : ms->second) tell(p, m);
		const auto f = res.frames.find(p);
		if (f != res.frames.end()) tell(p, f->second);
	}
	politics(res); // wave C: the settlements' and the peace's books, the polls (local_settle.cpp)
	// the guide, story and encounter saves of the tick into the store (regionDO.ts outputs)
	const std::pair<const char *, const Array *> kept[] = { { "guide", &res.guided }, { "story", &res.storied }, { "encounter", &res.met } };
	for (const auto &[kind, a] : kept)
		for (int64_t i = 0; i < a->size(); i++) store->keep(kind, int(Dictionary((*a)[i])["pid"]), Dictionary((*a)[i])["save"]);
	// what the tick handed the DO, each non-empty one, in room.ts tick's order
	Array fs, ss, rs, fd, ld;
	for (const auto &f : res.fights) {
		Dictionary d;
		d["id"] = String::utf8(f.id.c_str());
		d["report"] = sim::fight_report_to(f.report);
		fs.push_back(d);
	}
	for (const auto &c : res.souls) {
		Dictionary d;
		d["pid"] = c.pid;
		d["person"] = c.person["id"];
		d["squad"] = c.squad;
		d["unit"] = c.unit;
		ss.push_back(d);
	}
	for (int b : res.raided) rs.push_back(b);
	for (const std::string &id : res.faded) fd.push_back(String::utf8(id.c_str()));
	for (const auto &[p, goods] : res.larder) {
		Dictionary d;
		d["pid"] = p;
		d["goods"] = sim::cost_to(goods);
		ld.push_back(d);
	}
	books = Dictionary();
	const std::pair<const char *, const Array *> named[] = { { "fights", &fs }, { "raided", &rs }, { "souls", &ss }, { "faded", &fd }, { "guided", &res.guided }, { "storied", &res.storied },
		{ "met", &res.met }, { "wild", &res.wild }, { "larder", &ld }, { "gathered", &res.gathered }, { "warlord", &res.warlord } };
	for (const auto &[k, a] : named)
		if (a->size()) books[k] = *a;
	if (!res.peace.is_empty()) books["peace"] = res.peace; // wave C
	if (!res.settle.is_empty()) books["settle"] = res.settle;
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

// The top-level keys of a JSON object text and each value's raw text (a save's sim and bots go to their own decoders,
// exact: Godot's JSON reads numbers as floats). False: not an object.
static bool top_keys(const std::string &t, const std::function<void(const std::string &, const std::string &)> &f) {
	size_t i = 0;
	const auto ws = [&] {
		while (i < t.size() && (t[i] == ' ' || t[i] == '\n' || t[i] == '\r' || t[i] == '\t')) i++;
	};
	const auto str = [&]() -> bool { // past a string at t[i] == '"'
		for (i++; i < t.size(); i++) {
			if (t[i] == '\\') i++;
			else if (t[i] == '"') return ++i, true;
		}
		return false;
	};
	ws();
	if (i >= t.size() || t[i] != '{') return false;
	i++;
	for (;;) {
		ws();
		if (i < t.size() && t[i] == '}') return true;
		if (i >= t.size() || t[i] != '"') return false;
		const size_t k0 = i;
		if (!str()) return false;
		const Variant key = JSON::parse_string(String::utf8(t.substr(k0, i - k0).c_str()));
		ws();
		if (i >= t.size() || t[i] != ':') return false;
		i++;
		ws();
		const size_t v0 = i;
		int depth = 0;
		for (; i < t.size(); i++) {
			const char c = t[i];
			if (c == '"') {
				if (!str()) return false;
				i--;
			} else if (c == '{' || c == '[') depth++;
			else if (c == '}' || c == ']') {
				if (depth == 0) break;
				depth--;
			} else if (c == ',' && depth == 0) break;
		}
		size_t v1 = i;
		while (v1 > v0 && (t[v1 - 1] == ' ' || t[v1 - 1] == '\n')) v1--;
		f(S(key), t.substr(v0, v1 - v0));
		if (i < t.size() && t[i] == ',') i++;
	}
}

static std::vector<std::string> strs(const Array &a) {
	std::vector<std::string> v;
	for (int64_t i = 0; i < a.size(); i++) v.push_back(S(a[i]));
	return v;
}

static Array str_array(const std::vector<std::string> &v) {
	Array a;
	for (const std::string &x : v) a.push_back(String::utf8(x.c_str()));
	return a;
}

Variant LocalRoom::call_op(const String &op_, const Array &a) {
	sim::Room &r = *room;
	const std::string op = S(op_), region = S(sim->meta["id"]);
	const sim::WakeSoul wk = [this](const sim::StoredSoul &s) { return wake(s); };
	const auto persons = [&](const std::vector<std::string> &ids) {
		std::vector<sim::WarPerson> out;
		for (const std::string &id : ids)
			if (const auto *x = store->rec(id)) out.push_back(x->person);
		return out;
	};
	if (op == "seed") {
		const int p = a[0];
		const Array ps = a[1];
		const std::optional<std::string> at = a[3].get_type() == Variant::NIL ? std::nullopt : std::optional<std::string>(S(a[3]));
		for (int64_t i = 0; i < ps.size(); i++) store->add(p, sim::war_person_from(ps[i]), at);
		if (a[2].get_type() == Variant::DICTIONARY) store->setGoods(p, sim::cost_from(a[2]));
		return Variant();
	}
	if (op == "depart") {
		const sim::Room::Departed d = r.depart(int(a[0]), S(a[1]), double(a[2]));
		Dictionary res;
		if (!d.error.empty()) {
			res["error"] = String::utf8(d.error.c_str());
			res["detail"] = String::utf8(d.detail.c_str());
			return res;
		}
		if (d.fight) store->applyFight(d.fight->id, region, d.fight->report, now());
		store->release(region, d.ids);
		Dictionary lost;
		for (const auto &[id, n] : d.lost) lost[String::utf8(id.c_str())] = n;
		res["ids"] = str_array(d.ids);
		res["off"] = d.off;
		res["lost"] = lost;
		if (d.fight) {
			Dictionary f;
			f["id"] = String::utf8(d.fight->id.c_str());
			f["report"] = sim::fight_report_to(d.fight->report);
			res["fight"] = f;
		}
		if (d.cargo) res["cargo"] = *d.cargo;
		return res;
	}
	if (op == "arrive") {
		const int p = a[0];
		const std::vector<std::string> ids = strs(a[2]);
		std::vector<std::pair<std::string, double>> lost;
		const Dictionary l = a[4];
		const Array ks = l.keys();
		for (int64_t i = 0; i < ks.size(); i++) lost.emplace_back(S(ks[i]), double(l[ks[i]]));
		const sim::Room::Arrived got = r.arrive(p, int(a[1]), persons(ids), S(a[3]), lost, a[5].get_type() == Variant::DICTIONARY ? Dictionary(a[5]) : Dictionary());
		Dictionary res;
		if (!got.error.empty()) {
			res["error"] = String::utf8(got.error.c_str());
			return res;
		}
		store->place(region, ids);
		if (!got.msg.is_empty()) tell(p, got.msg);
		res["squad"] = got.squad;
		return res;
	}
	if (op == "muster") return muster(int(a[0])), Variant();
	if (op == "hired") {
		const int p = a[0];
		const auto got = store->claimForJoin(p, region, { strs(a[1]) }, r.personsHere(), now(), wk);
		if (const std::string *why = std::get_if<std::string>(&got)) return String::utf8(why->c_str());
		const sim::Room::Mustered m = r.hired(p, std::get<0>(got)[0]);
		if (m.ok && !m.msg.is_empty()) tell(p, m.msg);
		return m.ok ? Variant("ok") : Variant();
	}
	if (op == "levelUp") {
		std::vector<std::pair<std::string, double>> attrs;
		const Dictionary d = a[1];
		const Array ks = d.keys();
		for (int64_t i = 0; i < ks.size(); i++) attrs.emplace_back(S(ks[i]), double(d[ks[i]]));
		const std::optional<std::string> skill = a[2].get_type() == Variant::NIL ? std::nullopt : std::optional<std::string>(S(a[2]));
		return String::utf8(r.levelUp(S(a[0]), attrs, skill).c_str());
	}
	if (op == "setPath") {
		const sim::PlayerPath way = sim::player_path_from(a[1]);
		store->setPath(int(a[0]), way);
		r.setPath(int(a[0]), way);
		return Variant();
	}
	if (op == "spawnSoul") return sim->s->spawnSoul(double(a[0]), double(a[1]), S(a[2]), double(a[3]), "shrine");
	if (op == "save") {
		const sim::Room::Saved st = r.saveState(sim->save().utf8().get_data());
		saved = st.text;
		Dictionary res;
		res["sha"] = String::utf8(st.text.c_str()).sha256_text();
		res["len"] = int64_t(st.text.size());
		res["head"] = st.head;
		res["sim"] = String::utf8(st.sim.c_str()).sha256_text();
		res["bots"] = String::utf8(st.bots.c_str()).sha256_text();
		store->saveRoom(region, saved);
		return res;
	}
	if (op == "restore") {
		// regionDO.ts: a fresh room on a fresh sim (wild and roam off), the save in, the persons still deployed here
		const std::string text = store->loadRoom(region);
		std::string simText, botsText, rest = "{";
		if (!top_keys(text, [&](const std::string &k, const std::string &v) {
				if (k == "sim") simText = v;
				else if (k == "bots") botsText = v;
				else rest += (rest.size() > 1 ? "," : "") + sim::js_stringify(String::utf8(k.c_str())) + ":" + v;
			})) {
			ERR_PRINT("LocalRoom.restore: a malformed save");
			return Variant();
		}
		bool ok = false;
		const Variant parsed = sim::js_parse(rest + "}", ok); // exact numbers (a warlords' age)
		if (!ok || parsed.get_type() != Variant::DICTIONARY) {
			ERR_PRINT("LocalRoom.restore: a malformed save");
			return Variant();
		}
		const Dictionary head = parsed;
		std::vector<std::string> pids = strs(head.get("pids", Array()));
		std::set<std::string> here;
		for (const sim::WarPerson &p : store->deployed(region, pids)) here.insert(p.id);
		Ref<Grid> g;
		g.instantiate();
		g->g = sim->built;
		Ref<Sim> fresh = Sim::create(g, sim->meta, sim->cells, sim->seed);
		Dictionary o = opts.duplicate();
		o["wild"] = false;
		o["roam"] = false;
		auto next = std::make_unique<sim::Room>(*fresh->s, *fresh->bots, fresh->meta, room_opts(fresh, o));
		next->run = "r";
		next->epoch = room->epoch;
		next->startLife(fresh->cells, fresh->built, bool(o.get("warlords", false)));
		std::string why;
		if (!next->restore(head, simText, botsText, here, why)) {
			ERR_PRINT(String::utf8(("LocalRoom.restore: " + why).c_str()));
			return Variant();
		}
		room = std::move(next);
		sim = fresh;
		flush();
		// an eviction: the DO's memory starts over; ensure() polls the settlements into the restored room
		settleReset();
		loadSettlements();
		return Variant();
	}
	Variant res;
	if (settleOp(op, a, res)) return res; // wave C: store seeds and the DO's calls round the settlements
	ERR_PRINT(String::utf8(("LocalRoom.call_op: unknown op " + op).c_str()));
	return Variant();
}

Array LocalRoom::take() {
	const Array a = out;
	out = Array();
	return a;
}

Dictionary LocalRoom::snapshot() const { return room->snapshot(); }

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
	settleConstants(c); // wave C
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
	ClassDB::bind_method(D_METHOD("call_op", "op", "args"), &LocalRoom::call_op);
	ClassDB::bind_method(D_METHOD("store_dump"), &LocalRoom::store_dump);
	ClassDB::bind_method(D_METHOD("snapshot"), &LocalRoom::snapshot);
	ClassDB::bind_method(D_METHOD("current_tick"), &LocalRoom::current_tick);
	ClassDB::bind_method(D_METHOD("books"), &LocalRoom::get_books);
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
