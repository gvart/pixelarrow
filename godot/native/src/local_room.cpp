// The local transport round the room (see local_room.h).
#include "local_room.h"

#include <algorithm>
#include <set>

#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/variant/string.hpp>

#include "js_json.h"
#include "sim_data.h"

namespace godot {

static std::string S(const Variant &v) { return String(v).utf8().get_data(); }
static bool num(const Dictionary &d, const char *k) { return d.has(k) && (d[k].get_type() == Variant::INT || d[k].get_type() == Variant::FLOAT); }

// parseClientMsg, its shape only: the message types and the fields the room reads (the zod schema's bounds: its own wave)
static bool parse(const Dictionary &m) {
	if (m.get("t", Variant()).get_type() != Variant::STRING) return false;
	const std::string t = S(m["t"]);
	if (t == "join") return num(m, "v") && m.get("region", Variant()).get_type() == Variant::STRING && num(m, "playerId") && num(m, "team") && int(m["team"]) >= 0 && int(m["team"]) < sim::Net::ALLIANCES;
	if (t == "order") return m.get("o", Variant()).get_type() == Variant::DICTIONARY && Dictionary(m["o"]).get("kind", Variant()).get_type() == Variant::STRING;
	if (t == "view") return num(m, "x0") && num(m, "y0") && num(m, "x1") && num(m, "y1");
	if (t == "ping") return num(m, "c");
	if (t == "check") {
		const std::string k = S(m.get("kind", ""));
		return num(m, "id") && (k == "building" || k == "wall" || k == "bridge");
	}
	if (t == "dev") {
		const std::string op = S(m.get("op", ""));
		return op == "stock" || op == "claim" || op == "spawn" || op == "skip";
	}
	// known, handled by the waves to come (the P8 entry): mend, stow, handoff, npc, board, guide, story, encounter
	static const std::set<std::string> LATER = { "mend", "stow", "handoff", "npc", "board", "guide", "story", "encounter" };
	return LATER.count(t) > 0;
}

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
	return r;
}

void LocalRoom::conn(int p) {
	if (std::find(conns.begin(), conns.end(), p) == conns.end()) conns.push_back(p);
}

void LocalRoom::tell(int p, const Variant &m) { out.push_back(Array::make(p, m)); }

void LocalRoom::send_as(int p, const Dictionary &m) {
	conn(p);
	sim::Room &r = *room;
	if (!parse(m)) {
		Dictionary e;
		e["t"] = "error";
		e["code"] = "parse";
		return tell(p, e);
	}
	const std::string t = S(m["t"]);
	const auto settlements = [&] {
		Dictionary s;
		s["t"] = "settlements";
		s["list"] = r.settlementsFor(p);
		return s;
	};
	if (t == "join") {
		const Dictionary res = r.join(p, m);
		tell(p, res);
		if (S(res["t"]) == "welcome") tell(p, settlements());
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
	}
}

void LocalRoom::tick() {
	const sim::Room::TickOut res = room->tick();
	for (int p : conns) {
		for (const auto &[ap, m] : res.admitted)
			if (ap == p) {
				tell(p, m);
				if (S(m["t"]) == "welcome") {
					Dictionary s;
					s["t"] = "settlements";
					s["list"] = room->settlementsFor(p);
					tell(p, s);
				}
			}
		const auto ms = res.msgs.find(p);
		if (ms != res.msgs.end())
			for (const Dictionary &m : ms->second) tell(p, m);
		const auto f = res.frames.find(p);
		if (f != res.frames.end()) tell(p, f->second);
	}
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
	return c;
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
	ClassDB::bind_static_method("LocalRoom", D_METHOD("constants"), &LocalRoom::constants);
	ClassDB::bind_static_method("LocalRoom", D_METHOD("js_json", "v"), &LocalRoom::js_json);
}

} // namespace godot
