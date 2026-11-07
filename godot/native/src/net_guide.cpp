// src/war/net/guide.ts (see net_guide.h), line for line.
#include "net_guide.h"

#include <algorithm>
#include <cmath>
#include <limits>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/string.hpp>

#include "js_math.h"
#include "sim_data.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::Variant;

static std::string u8(const Variant &v) { return godot::String(v).utf8().get_data(); }

bool StrSet::has(const std::string &s) const { return std::find(v.begin(), v.end(), s) != v.end(); }
void StrSet::add(const std::string &s) {
	if (!has(s)) v.push_back(s);
}

static std::vector<std::pair<std::string, double>> record(const Dictionary &d) {
	std::vector<std::pair<std::string, double>> out;
	const Array ks = d.keys();
	for (int64_t i = 0; i < ks.size(); i++) out.push_back({ u8(ks[i]), double(d[ks[i]]) });
	return out;
}

void load_guide_tables(const Dictionary &t, GuideTables &out) {
	if (t.has("src/war/net/guide")) {
		const Dictionary g = t["src/war/net/guide"], paths = g["GUIDE_PATHS"];
		const Array ps = paths.keys();
		for (int64_t i = 0; i < ps.size(); i++) {
			const Array steps = paths[ps[i]];
			std::vector<GuideStep> &v = out.paths[u8(ps[i])];
			for (int64_t k = 0; k < steps.size(); k++) {
				const Dictionary s = steps[k];
				v.push_back({ u8(s["id"]), record(s["reward"]) });
			}
		}
		const Dictionary l = g["GUIDE_LAIR"], so = g["GUIDE_SOUL"];
		out.lair.kind = u8(l["kind"]);
		out.lair.count = l["count"];
		out.lair.at = l["at"];
		out.soul.at = so["at"];
		out.soul.level = so["level"];
		out.near = g["GUIDE_NEAR"];
		out.giverNear = g["GIVER_NEAR"];
		out.homeR = g["HOME_R"];
	}
	if (t.has("src/war/net/mastery")) out.masteryNear = Dictionary(Dictionary(t["src/war/net/mastery"])["MASTERY"])["near"];
	if (t.has("src/war/region/compact")) {
		const Array tr = Dictionary(t["src/war/region/compact"])["TERRAIN"];
		for (int64_t i = 0; i < tr.size(); i++) out.terrain.push_back(u8(tr[i]));
	}
	if (t.has("src/data/warStories")) {
		const Dictionary st = t["src/data/warStories"], all = st["STORIES"], by = st["PATH_STORIES"];
		const Array ks = all.keys();
		for (int64_t i = 0; i < ks.size(); i++) out.stories.emplace(u8(ks[i]), story_from(all[ks[i]]));
		const Array rs = by.keys();
		for (int64_t i = 0; i < rs.size(); i++) {
			const Dictionary per = by[rs[i]];
			const Array ps = per.keys();
			for (int64_t k = 0; k < ps.size(); k++) out.pathStories[u8(rs[i])].emplace(u8(ps[k]), story_from(per[ps[k]]));
		}
	}
	if (t.has("src/war/world/start")) {
		const Dictionary fs = Dictionary(t["src/war/world/start"])["FAMILIES"];
		const Array ks = fs.keys();
		for (int64_t i = 0; i < ks.size(); i++) {
			const Array s = Dictionary(fs[ks[i]])["start"];
			std::vector<std::string> &v = out.familyStart[u8(ks[i])];
			for (int64_t k = 0; k < s.size(); k++) v.push_back(u8(s[k]));
		}
	}
	if (t.has("src/data/warEncounters")) {
		const Dictionary r = Dictionary(t["src/data/warEncounters"])["ROBBERS"];
		out.robbers.id = u8(r["id"]);
		out.robbers.minLoads = r["minLoads"];
		out.robbers.chance = r["chance"];
	}
	if (t.has("src/war/world/events")) {
		const Dictionary e = t["src/war/world/events"], wk = e["WAKE"], st = e["STORM"];
		out.wake.hp = wk["hp"];
		out.wake.loot = wk["loot"];
		out.stormChance = st["chance"];
	}
}

static const GuideTables &G() { return data().guide; }

const Story *story_of(const std::string &region, const std::string &path) {
	if (!path.empty()) {
		const auto r = G().pathStories.find(region);
		if (r != G().pathStories.end()) {
			const auto s = r->second.find(path);
			if (s != r->second.end()) return &s->second;
		}
	}
	const auto s = G().stories.find(region);
	return s == G().stories.end() ? nullptr : &s->second;
}

const std::vector<GuideStep> &guide_steps(const std::string &path) {
	static const std::vector<GuideStep> NONE;
	const auto it = G().paths.find(path.empty() ? "warrior" : path);
	return it == G().paths.end() ? NONE : it->second;
}

XY home_anchor(const Dictionary &meta) {
	const Array pre = meta.get("prebuilt", Array());
	double sx = 0, sy = 0;
	int n = 0;
	for (int64_t i = 0; i < pre.size(); i++) {
		const Dictionary p = pre[i];
		if (p.has("tiles")) continue;
		sx += double(p["x"]), sy += double(p["y"]), n++;
	}
	if (!n) return { double(meta["w"]) / 2, double(meta["h"]) / 2 };
	return { js::round(sx / n) + 0.5, js::round(sy / n) + 0.5 };
}

// src/war/view/entry.ts entrySpot
XY entry_spot(const Dictionary &meta, int team) {
	static const char *SIDES[4] = { "N", "E", "S", "W" };
	const std::string side = SIDES[team % 4];
	const double w = meta["w"], h = meta["h"];
	const double mx = side == "N" || side == "S" ? w / 2 : side == "W" ? 0 : w, my = side == "N" ? 0 : side == "S" ? h : h / 2;
	const Array es = meta.get("entries", Array());
	const auto d = [&](const Dictionary &e) { return js::pow(double(e["x"]) + double(e["w"]) / 2 - mx, 2) + js::pow(double(e["y"]) + double(e["h"]) / 2 - my, 2); };
	Dictionary e;
	for (int64_t i = 0; i < es.size() && e.is_empty(); i++)
		if (u8(Dictionary(es[i])["side"]) == side) e = es[i];
	if (e.is_empty() && es.size()) { // [...entries].sort(by d)[0]: the first of the nearest
		int64_t best = 0;
		for (int64_t k = 1; k < es.size(); k++)
			if (d(es[k]) < d(es[best])) best = k;
		e = es[best];
	}
	if (e.is_empty()) return { w / 2, h / 2 };
	return { double(e["x"]) + double(e["w"]) / 2, double(e["y"]) + double(e["h"]) / 2 };
}

static const std::vector<std::string> &adj_of(const std::string &id) {
	static const std::vector<std::string> NONE;
	for (const auto &r : data().warlords.WORLD_REGIONS)
		if (r.id == id) return r.adj;
	return NONE;
}

static std::optional<Dictionary> entry_on(const Dictionary &meta, const std::string &side) {
	if (side.empty()) return std::nullopt;
	const Array es = meta.get("entries", Array());
	for (int64_t i = 0; i < es.size(); i++)
		if (u8(Dictionary(es[i])["side"]) == side) return Dictionary(es[i]);
	return std::nullopt;
}

std::optional<GuideNext> guide_next(const std::string &home, const Dictionary &meta) {
	const XY town = home_anchor(meta);
	std::optional<GuideNext> best;
	double bd = INFINITY;
	for (const std::string &id : adj_of(home)) {
		const Story *story = story_of(id);
		const auto ent = entry_on(meta, edge_side(home, id));
		if (!story || !ent) continue;
		const XY exit{ double((*ent)["x"]) + double((*ent)["w"]) / 2, double((*ent)["y"]) + double((*ent)["h"]) / 2 };
		const double d = js::hypot(exit.x - town.x, exit.y - town.y);
		if (d < bd) bd = d, best = GuideNext{ id, story->giver.name, exit };
	}
	return best;
}

std::optional<GuideHand> guide_hand(const std::string &id, const Dictionary &meta, const std::string &path) {
	if (const Story *story = story_of(id, path)) return GuideHand{ story->giver.name, { story->giver.at.x, story->giver.at.y }, std::nullopt };
	const auto n = guide_next(id, meta);
	if (!n) return std::nullopt;
	return GuideHand{ n->giver, n->exit, n->region };
}

// walkSteps: steps a man walks from `from` to every tile (-1: no way there), as the TS reads its typed arrays (a start
// pushed past the map reads undefined: a NaN height lets every step by, a NaN distance stores 0)
static std::vector<int32_t> walk_steps(const Dictionary &meta, const godot::PackedByteArray &cells, XY from) {
	const int w = meta["w"], h = meta["h"], n = w * h;
	const auto &TR = G().terrain;
	const int rock = int(std::find(TR.begin(), TR.end(), "rock") - TR.begin());
	std::vector<uint8_t> ok(n);
	std::vector<int> height(n);
	for (int t = 0; t < n; t++) {
		const int c = cells[t * 2] | (cells[t * 2 + 1] << 8);
		height[t] = c & 15;
		ok[t] = (c >> 7) == 2 || ((c >> 4) & 7) == rock ? 0 : 1;
	}
	const Array b = meta.get("blocked", Array());
	for (int64_t k = 0; k + 1 < b.size(); k += 2) {
		const int s = b[k], len = b[k + 1];
		std::fill(ok.begin() + std::max(0, std::min(n, s)), ok.begin() + std::max(0, std::min(n, s + len)), 0);
	}
	std::vector<int32_t> dist(n, -1), q(n);
	const auto okAt = [&](long t) { return t >= 0 && t < n && ok[t]; };
	long start = long(std::floor(from.y)) * w + long(std::floor(from.x));
	for (int k = 1; !okAt(start) && k < 40; k++) start += w;
	int head = 0, tail = 0;
	const bool inMap = start >= 0 && start < n;
	std::vector<long> wide; // a start off the map is queued as it is (the Int32Array keeps no such value: it never is)
	if (inMap) {
		q[tail++] = int(start);
		dist[start] = 0;
	}
	const auto visit = [&](long t, bool tIn) {
		const long x = ((t % w) + w) % w;
		for (long nb : { x > 0 ? t - 1 : -1L, x < w - 1 ? t + 1 : -1L, t - w, t + w }) {
			if (nb < 0 || nb >= n || dist[nb] >= 0 || !ok[nb] || (tIn && std::abs(height[nb] - height[t]) > 1)) continue;
			dist[nb] = tIn ? dist[t] + 1 : 0;
			q[tail++] = int(nb);
		}
	};
	if (!inMap) visit(start, false);
	while (head < tail) visit(q[head++], true);
	return dist;
}

GuideSpots guide_spots(const Dictionary &meta, const godot::PackedByteArray &cells, int team) {
	const XY entry = entry_spot(meta, team), home = home_anchor(meta);
	const std::vector<int32_t> dist = walk_steps(meta, cells, entry);
	const int w = meta["w"];
	const double dx = home.x - entry.x, dy = home.y - entry.y, len0 = js::hypot(dx, dy), len = len0 ? len0 : 1;
	const auto along = [&](double d) -> XY {
		long best = -1;
		double bs = INFINITY;
		for (size_t t = 0; t < dist.size(); t++) {
			if (dist[t] != d) continue;
			const double px = double(t % w) + 0.5 - entry.x, py = double(int32_t(t / w)) + 0.5 - entry.y, ahead = (px * dx + py * dy) / len;
			const double off = std::abs(px * dy - py * dx) / len + (ahead < 0 ? 1000 : 0);
			if (off < bs) bs = off, best = long(t);
		}
		return best < 0 ? entry : XY{ double(best % w) + 0.5, std::floor(double(best) / w) + 0.5 };
	};
	return { entry, home, along(G().soul.at), along(G().lair.at) };
}

bool guide_open(const GuideSave *g, const std::string &path) {
	if (!g) return true;
	if (g->hidden) return false;
	for (const GuideStep &s : guide_steps(path))
		if (std::find(g->done.begin(), g->done.end(), s.id) == g->done.end()) return true;
	return false;
}

std::optional<GuideSave> guide_save_from(const Variant &v) {
	if (v.get_type() != Variant::DICTIONARY) return std::nullopt;
	const Dictionary d = v;
	GuideSave s;
	const Array done = d.get("done", Array());
	for (int64_t i = 0; i < done.size(); i++) s.done.push_back(u8(done[i]));
	s.hidden = d.get("hidden", false).booleanize();
	return s;
}

Dictionary guide_save_dict(const GuideSave &s) {
	Dictionary d;
	d["v"] = s.v;
	Array done;
	for (const std::string &x : s.done) done.push_back(godot::String::utf8(x.c_str()));
	d["done"] = done;
	if (s.hidden) d["hidden"] = true;
	return d;
}

GuideWatch watch_for(const std::string &path, const Dictionary &meta, int team, const std::string &owner, const std::string &home, const std::optional<XY> &lair) {
	const bool abroad = path == "trader" && u8(meta["id"]) != home;
	const auto hand = abroad ? std::nullopt : guide_hand(u8(meta["id"]), meta, path);
	GuideWatch w;
	w.team = team;
	w.owner = owner;
	if (path.empty() || path == "warrior") w.lair = lair;
	if (hand) w.next = hand->at;
	w.nextR = hand && !hand->road ? G().giverNear : G().near;
	if (abroad) w.town = npc_spot(meta);
	return w;
}

void watch_events(GuideWatch &w, const std::vector<Dictionary> &evs) {
	for (const Dictionary &e : evs) {
		const std::string k = u8(e["kind"]);
		if (k != "soulClaimed" && !(k == "soulRefused" && u8(e.get("why", "")) == "full")) continue;
		if (e.has("owner") && u8(e["owner"]) == w.owner) w.flags.add("soul"); // online: the owner is always set
	}
}

StrSet done_now(GuideWatch &w, const Dictionary &s) {
	StrSet out = w.flags;
	const Array blds = s.get("buildings", Array()), squads = s["squads"], units = s["units"];
	const auto owner = [](const Dictionary &b) { return b.has("owner") ? u8(b["owner"]) : std::string(); };
	const auto mine = [&](const Dictionary &b) { return int(b["team"]) == w.team && !b.get("pre", false).booleanize() && (w.owner.empty() || owner(b) == w.owner); };
	if (!w.seen) {
		w.seen = true;
		for (int64_t i = 0; i < blds.size(); i++)
			if (int(Dictionary(blds[i])["team"]) == w.team) w.had.insert(int(Dictionary(blds[i])["id"]));
	}
	std::set<int> own;
	for (int64_t i = 0; i < squads.size(); i++) {
		const Dictionary q = squads[i];
		if (int(q["team"]) == w.team && (w.owner.empty() || u8(q.get("owner", "")) == w.owner)) own.insert(int(q["id"]));
	}
	std::vector<Dictionary> men;
	std::set<int> ids;
	for (int64_t i = 0; i < units.size(); i++) {
		const Dictionary u = units[i];
		if (own.count(int(u["squad"])) && u8(u["state"]) != "dead") men.push_back(u), ids.insert(int(u["id"]));
	}
	const auto near = [&](double x, double y, double r) {
		for (const Dictionary &u : men)
			if (js::hypot(double(u["x"]) - x, double(u["y"]) - y) < r) return true;
		return false;
	};
	const auto nearOn = [&](double x, double y) { return w.owner.empty() || near(x, y, G().near); };
	for (const Dictionary &u : men) {
		const std::string c = u.has("carry") ? u8(u["carry"]) : "";
		if ((c == "wood" || c == "stone") && double(u.get("load", 0)) > 0) {
			out.add("gather");
			break;
		}
	}
	if (w.lair) {
		// every lair at the spot cleared (a later player's fresh pair stands where the first one fell)
		const Array ls = s.get("lairs", Array());
		int n = 0;
		bool all = true;
		for (int64_t i = 0; i < ls.size(); i++) {
			const Dictionary l = ls[i];
			if (!(js::hypot(double(l["x"]) - w.lair->x, double(l["y"]) - w.lair->y) < 0.5)) continue;
			n++;
			all = all && u8(l["state"]) == "cleared";
		}
		if (n && all && nearOn(w.lair->x, w.lair->y)) out.add("lair");
	}
	for (int64_t i = 0; i < blds.size(); i++) {
		const Dictionary b = blds[i];
		if (!mine(b)) continue;
		if (u8(b["state"]) == "done" && !w.had.count(int(b["id"])) && nearOn(b["x"], b["y"])) out.add(u8(b["type"]) == "privateHouse" ? "house" : "build");
		// the access step: he changed who may use a building of his (the card's setting)
		const std::string now = b.has("access") ? u8(b["access"]) : "";
		const auto was = w.access.find(int(b["id"]));
		if (was != w.access.end() && was->second != now) w.flags.add("access"), out.add("access");
		w.access[int(b["id"])] = now;
	}
	// a workplace going: his own with a man at it, or any where a man of his has an order running
	const auto &B = data().economy.BUILDINGS;
	for (int64_t i = 0; i < blds.size(); i++) {
		const Dictionary b = blds[i];
		const auto def = B.find(u8(b["type"]));
		if (u8(b["state"]) != "done" || def == B.end() || !def->second.workplace) continue;
		bool by = false;
		const Array q = b.get("queue", Array());
		for (int64_t k = 0; k < q.size() && !by; k++) by = ids.count(int(Dictionary(q[k]).get("by", -1)));
		if ((mine(b) && b.get("staffed", false).booleanize()) || by) {
			out.add("work");
			break;
		}
	}
	const Array es = s.get("sieges", Array());
	for (int64_t i = 0; i < es.size(); i++) {
		const Dictionary e = es[i];
		if ((!w.owner.empty() ? owner(e) == w.owner : int(e["team"]) == w.team) && double(e.get("loads", 0)) > 0) {
			out.add("load");
			break;
		}
	}
	if (w.town && near(w.town->x, w.town->y, data().room.npcReach)) out.add("carry");
	if (out.has("sell")) out.add("carry");
	if (out.has("carry")) out.add("load"); // goods carried in on men's backs do as well
	if (w.next && near(w.next->x, w.next->y, w.nextR)) out.add("next"); // W-73: at the exit; W-170: at the giver
	return out;
}

} // namespace sim
