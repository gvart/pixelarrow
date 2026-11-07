// The event log (index.ts `note` and `events`) and the WarEvent shapes (sim_events.h).
#include "sim_events.h"

#include <godot_cpp/variant/array.hpp>

#include "js_math.h"
#include "sim.h"

namespace sim {

namespace {

constexpr size_t LOG_MAX = 5000;

godot::Dictionary goods_of(const std::vector<std::pair<std::string, double>> &g) {
	godot::Dictionary d;
	for (const auto &[k, v] : g) d[gstr(k)] = v;
	return d;
}

} // namespace

godot::Dictionary ev(double t, const char *kind) {
	godot::Dictionary d;
	d["t"] = t;
	d["kind"] = kind;
	return d;
}

godot::Dictionary ev_of(const CraftedEvent &e) {
	godot::Dictionary d = ev(e.t, "crafted");
	d["order"] = e.order;
	d["building"] = e.building;
	d["team"] = e.team;
	d["owner"] = gstr(e.owner);
	if (e.pid) d["pid"] = gstr(*e.pid);
	d["recipe"] = gstr(e.recipe);
	d["what"] = gstr(e.what);
	d["item"] = item_to_dict(e.item);
	return d;
}

godot::Dictionary ev_of(const SecretEvent &e) {
	godot::Dictionary d = ev(e.t, "secret");
	d["what"] = gstr(e.what);
	d["quest"] = gstr(e.quest);
	d["owner"] = gstr(e.owner);
	d["team"] = e.team;
	d["title"] = gstr(e.title);
	d["text"] = gstr(e.text);
	d["x"] = e.x;
	d["y"] = e.y;
	if (e.goods) d["goods"] = goods_of(*e.goods);
	if (e.to) {
		godot::Dictionary to;
		to["x"] = e.to->x;
		to["y"] = e.to->y;
		to["label"] = gstr(e.to->label);
		d["to"] = to;
	}
	return d;
}

godot::Dictionary ev_of(const LmEvent &e) {
	godot::Dictionary d = ev(e.t, e.kind == "landmark" ? "landmark" : "landmarkRefused");
	d["id"] = gstr(e.id);
	if (e.kind == "landmark") {
		d["state"] = gstr(e.state);
		d["holder"] = e.holder;
	} else {
		d["squad"] = e.squad;
		d["why"] = gstr(e.why);
	}
	return d;
}

godot::Dictionary ev_of(const BossNote &e) {
	godot::Dictionary d;
	d["t"] = e.t;
	d["kind"] = gstr(e.kind);
	if (e.kind == "wardenStrike") {
		d["x"] = e.x;
		d["y"] = e.y;
		d["w"] = e.w;
		d["h"] = e.h;
		d["hit"] = e.hit;
		return d;
	}
	d["region"] = gstr(e.region);
	d["boss"] = gstr(e.boss);
	if (e.kind == "bossPhase") d["phase"] = e.phase;
	if (e.kind == "bossSlain") {
		godot::Array k;
		for (const std::string &o : e.killers) k.push_back(gstr(o));
		d["killers"] = k;
		d["x"] = e.x;
		d["y"] = e.y;
	}
	return d;
}

godot::Dictionary ev_of(double t, const MobNote &e) {
	godot::Dictionary d;
	d["t"] = t;
	d["kind"] = gstr(e.kind);
	d["lair"] = e.lair;
	d["mob"] = gstr(e.mob);
	d["x"] = e.x;
	d["y"] = e.y;
	return d;
}

godot::Dictionary ev_of(double t, const RoamNote &e) {
	godot::Dictionary d;
	d["t"] = t;
	d["kind"] = gstr(e.kind);
	if (e.kind == "caravanPaid") {
		d["owner"] = gstr(e.owner);
		d["team"] = e.team;
		d["coin"] = e.coin;
		d["x"] = e.x;
		d["y"] = e.y;
	} else {
		d["caravan"] = e.caravan;
		d["by"] = e.by;
	}
	return d;
}

godot::Dictionary ev_of(const SoulEvent &e) {
	godot::Dictionary d;
	d["t"] = e.t;
	d["kind"] = gstr(e.kind);
	d["soul"] = e.soul;
	if (e.kind == "soulClaimed" || e.kind == "soulRefused") {
		d["squad"] = e.squad;
		d["owner"] = gstr(e.owner);
	}
	if (e.kind == "soulClaimed") {
		d["unit"] = e.unit;
		godot::Dictionary p;
		p["id"] = gstr(e.person->id);
		p["name"] = gstr(e.person->name);
		if (e.person->cls) p["cls"] = gstr(*e.person->cls);
		p["level"] = e.person->level;
		d["person"] = p;
	}
	if (e.kind == "soulRefused") {
		d["have"] = e.have;
		d["why"] = gstr(e.why);
	}
	if (e.kind == "soulLost") d["team"] = e.team;
	if (e.pid) d["pid"] = gstr(*e.pid);
	return d;
}

// M5e: building b holds captives: a fort or camp of a team, standing.
bool Sim::holds(const Building *b) const {
	return b && (b->type == "fort" || b->type == "camp") && !b->cancelled && b->state != "foundation" && b->state != "destroyed";
}

// M5e: every HOLD.every ticks: a holding building that fell, or one that a foe soldier (not fauna, not a civilian) reached
// within HOLD.r tiles with no soldier of its team within HOLD.r, is raided (at most once per HOLD.cooldown).
void Sim::raidScan() {
	constexpr double R = 4, COOLDOWN = 600; // index.ts HOLD.r, HOLD.cooldown
	for (int id = 0;; id++) {
		const Building *b = works->piece(id);
		if (!b) break;
		if (!(b->type == "fort" || b->type == "camp") || b->cancelled) continue;
		if (b->state == "destroyed") {
			if (std::find(fallen.begin(), fallen.end(), id) == fallen.end()) {
				fallen.push_back(id);
				godot::Dictionary e = ev(tick, "raid");
				e["building"] = id;
				e["team"] = b->team;
				e["fell"] = true;
				note(e);
			}
			continue;
		}
		const auto at = std::find_if(raidAt.begin(), raidAt.end(), [&](const auto &e) { return e.first == id; });
		if (!holds(b) || (at != raidAt.end() && tick - at->second < COOLDOWN)) continue;
		std::optional<int> by;
		bool own = false;
		const double far = js::pow(R + std::max(b->w, b->h), 2);
		for (const Unit *u : units) {
			const int tm = u->squad->team;
			if (!u->alive || !u->civ.empty() || tm == MOB_TEAM || js::pow(u->x - b->x, 2) + js::pow(u->y - b->y, 2) > far || works->dist2(id, u->x, u->y) > R * R) continue;
			if (tm == b->team) {
				own = true;
				break;
			}
			if (!by) by = tm;
		}
		if (!by || own) continue;
		if (at != raidAt.end()) at->second = tick;
		else raidAt.emplace_back(id, tick);
		godot::Dictionary e = ev(tick, "raid");
		e["building"] = id;
		e["team"] = b->team;
		e["by"] = *by;
		e["fell"] = false;
		note(e);
	}
}

void Sim::note(const godot::Dictionary &e) {
	if (evlog.size() < LOG_MAX) evlog.push_back(e);
	if (godot::String(e["kind"]) == "bossSlain") slain.push_back(godot::String(e["boss"]).utf8().get_data()); // E3: slayers' deeds at the next report
}

} // namespace sim
