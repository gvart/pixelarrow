#include "stories.h"

#include <algorithm>
#include <cmath>

#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/core/error_macros.hpp>

#include "js_math.h"
#include "rng.h"
#include "sim_data.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::Variant;

static std::string utf8(const Variant &v) { return godot::String(v).utf8().get_data(); }
static godot::String gs(const std::string &s) { return godot::String::utf8(s.c_str()); }
static bool has(const Dictionary &d, const char *k) { return d.has(k) && d[k].get_type() != Variant::NIL; }

StorySave new_save(const Story &s) {
	StorySave v;
	v.story = s.id;
	return v;
}

// ---------------------------------------------------------------- spots

XY npc_spot(const Dictionary &meta) {
	const Array safe = meta.get("safe", Array());
	if (safe.size()) {
		const Dictionary c = safe[0];
		return { double(c["x"]) + double(c["w"]) / 2, double(c["y"]) + double(c["h"]) / 2 };
	}
	const Array pre = meta.get("prebuilt", Array());
	for (const char *type : { "stall", "well", "board", "storehouse", "cottage" }) {
		double sx = 0, sy = 0;
		int n = 0;
		for (int64_t i = 0; i < pre.size(); i++) {
			const Dictionary p = pre[i];
			if (utf8(p["type"]) != type) continue;
			sx = sx + double(p["x"]);
			sy = sy + double(p["y"]);
			n++;
		}
		if (n) return { sx / n, sy / n };
	}
	if (pre.size()) {
		const Dictionary p = pre[0];
		return { p["x"], p["y"] };
	}
	return { double(meta["w"]) / 2, double(meta["h"]) / 2 };
}

XY snap_open(const StoryRegion &r, Pt p) {
	const std::vector<float> &m = r.cost;
	const int x0 = int(std::max(0.0, std::min(double(r.w - 1), std::floor(p.x))));
	const int y0 = int(std::max(0.0, std::min(double(r.h - 1), std::floor(p.y))));
	for (int d = 0; d <= 16; d++) {
		int best = -1;
		double bd = std::numeric_limits<double>::infinity();
		for (int y = y0 - d; y <= y0 + d; y++)
			for (int x = x0 - d; x <= x0 + d; x++) {
				if (x < 0 || y < 0 || x >= r.w || y >= r.h || (std::abs(x - x0) != d && std::abs(y - y0) != d) || !(double(m[y * r.w + x]) > 0)) continue;
				const double dd = js::pow(x - x0, 2) + js::pow(y - y0, 2);
				if (dd < bd) bd = dd, best = y * r.w + x;
			}
		if (best >= 0) return { (best % r.w) + 0.5, std::floor(double(best) / r.w) + 0.5 };
	}
	return { x0 + 0.5, y0 + 0.5 };
}

StorySpots story_spots(const StoryRegion &r, const Story &s) {
	StorySpots out;
	out.giver = snap_open(r, s.giver.at);
	for (const StoryStep &st : s.steps) {
		const StoryTrigger &t = st.trigger;
		std::vector<XY> v;
		if (t.kind == Trigger::Talk) v = { out.giver };
		else if (t.kind == Trigger::Track)
			for (const Pt &p : t.marks) v.push_back(snap_open(r, p));
		else if (t.kind == Trigger::Choice || t.kind == Trigger::Built) {
		} else if (t.kind == Trigger::Trade) v = { snap_open(r, r.npc) };
		else v = { snap_open(r, t.at) };
		out.steps[st.id] = v;
	}
	return out;
}

const StoryStep *step_of(const Story &s, const StorySave *save) {
	if (!save || save->done || !save->at) return nullptr;
	for (const StoryStep &x : s.steps)
		if (x.id == *save->at) return &x;
	return nullptr;
}

// next: absent is the step's own (then the next in the list); "end": the chain ends
const StoryStep *story_after(const Story &s, const StoryStep &st, const std::optional<std::string> &nx) {
	const std::optional<std::string> next = nx ? nx : st.next;
	if (next && *next == "end") return nullptr;
	if (next && !next->empty()) {
		for (const StoryStep &x : s.steps)
			if (x.id == *next) return &x;
		return nullptr;
	}
	const size_t i = size_t(&st - s.steps.data()) + 1;
	return i < s.steps.size() ? &s.steps[i] : nullptr;
}

std::vector<const StoryStep *> story_path(const Story &s, const StorySave *save) {
	std::vector<const StoryStep *> out;
	for (const StoryStep *st = s.steps.empty() ? nullptr : &s.steps[0]; st && out.size() < s.steps.size();) {
		out.push_back(st);
		if (st->trigger.kind == Trigger::Choice) {
			const StoryOption *o = &st->trigger.options[0];
			if (save) {
				const auto pk = save->picks.find(st->id);
				if (pk != save->picks.end())
					for (const StoryOption &x : st->trigger.options)
						if (x.id == pk->second) {
							o = &x;
							break;
						}
			}
			st = story_after(s, *st, o->next ? o->next : std::optional<std::string>("end"));
		} else st = story_after(s, *st, std::nullopt);
	}
	return out;
}

std::optional<Item> story_item(const Story &s, const std::string &step, const std::string &owner, const std::optional<StoryReward> &r) {
	if (!r || !r->item) return std::nullopt;
	const std::string key = s.region + ":" + s.id + ":" + step + ":" + owner;
	const uint32_t h = hash_string(gs(key));
	Mulberry rng(h ? h : 1);
	IdSource ids;
	Item it = make_item(rng, ids, r->item->def, r->item->rarity);
	it.uid = "story:" + key;
	return it;
}

// ---------------------------------------------------------------- the runner

bool rescued(const StorySnap &s, const std::vector<StoryEvent> &evs, const std::set<int> &souls, const StoryMe &me) {
	for (const StoryEvent &e : evs) {
		if ((e.kind != "soulClaimed" && e.kind != "soulRefused") || !souls.count(e.soul)) continue;
		if (me.online()) {
			if (e.owner && *e.owner == *me.owner) return true;
			continue;
		}
		for (const StorySnap::Squad &q : s.squads)
			if (q.id == e.squad) {
				if (q.team == me.team) return true;
				break;
			}
	}
	return false;
}

StoryRun::StoryRun(const StoryRegion &region, Story story, const std::optional<StorySave> &sv, StoryMe me, StoryHost host) :
		region(region), story(std::move(story)), me(std::move(me)), host(std::move(host)) {
	spots = story_spots(region, this->story);
	save = sv ? *sv : new_save(this->story);
}

std::vector<const StorySnap::Unit *> StoryRun::men(const StorySnap &s) const {
	std::set<int> own; // membership only
	for (const StorySnap::Squad &q : s.squads)
		if (q.team == me.team && (!me.online() || q.owner == *me.owner)) own.insert(q.id);
	std::vector<const StorySnap::Unit *> out;
	for (const StorySnap::Unit &u : s.units)
		if (own.count(u.squad) && u.state != "dead" && u.cls.rfind("civ_", 0) != 0) out.push_back(&u);
	return out;
}

XY StoryRun::centre(const StorySnap &s, XY orr) const {
	const auto m = men(s);
	if (m.empty()) return orr;
	double sx = 0, sy = 0;
	for (const auto *u : m) sx = sx + u->x;
	for (const auto *u : m) sy = sy + u->y;
	return { sx / m.size(), sy / m.size() };
}

void StoryRun::pay(const StorySnap &s, const std::string &step, const std::optional<StoryReward> &r, XY at) {
	if (r && (r->goods || r->item || r->soul)) host.give(*r, centre(s, at), story_item(story, step, owner(), r));
}

void StoryRun::advance(const StorySnap &s, const StoryStep *next, std::vector<StoryNote> &notes) {
	save.n = 0;
	seen = false;
	asked = -std::numeric_limits<double>::infinity();
	souls.clear();
	if (next) {
		save.at = next->id;
		return;
	}
	save.at = std::nullopt;
	save.done = true;
	pay(s, "end", story.reward, spots.giver);
	StoryNote n;
	n.kind = "end";
	n.reward = story.reward;
	notes.push_back(n);
}

void StoryRun::finish(const StorySnap &s, const StoryStep &st, std::vector<StoryNote> &notes) {
	const auto it = spots.steps.find(st.id);
	const XY at = it != spots.steps.end() && !it->second.empty() ? it->second[0] : spots.giver;
	pay(s, st.id, st.reward, at);
	StoryNote n;
	n.kind = "step";
	n.step = st.id;
	n.reward = st.reward;
	notes.push_back(n);
	advance(s, story_after(story, st, std::nullopt), notes);
}

void StoryRun::ensure(const StorySnap &s, const StoryStep &st) {
	const StoryTrigger &t = st.trigger;
	const auto it = spots.steps.find(st.id);
	if (it == spots.steps.end() || it->second.empty() || (t.kind != Trigger::Clear && t.kind != Trigger::Rescue)) return;
	const XY p = it->second[0];
	if (t.kind == Trigger::Clear) {
		for (const StorySnap::Lair &l : s.lairs)
			if (js::hypot(l.x - p.x, l.y - p.y) < 0.5 && l.state != "cleared") {
				seen = true;
				return;
			}
		if (seen || s.tick - asked < STORY_RESPAWN) return;
		asked = s.tick;
		LairAsk d;
		d.kind = t.mob;
		d.x = p.x;
		d.y = p.y;
		if (t.chief) d.chief = t.chief;
		else d.count = t.count;
		d.lead = t.lead;
		host.add_lair(d);
		return;
	}
	bool any = false;
	for (const StorySnap::Soul &x : s.souls)
		if (js::hypot(x.x - p.x, x.y - p.y) < STORY_R.soul) {
			souls.insert(x.id);
			any = true;
		}
	if (any || s.tick - asked < STORY_RESPAWN) return;
	asked = s.tick;
	host.spawn_soul(p.x, p.y, t.cls, t.level);
}

std::vector<StoryNote> StoryRun::tick(const StorySnap &s, const std::vector<StoryEvent> &evs) {
	std::vector<StoryNote> notes;
	if (save.done) return notes;
	const auto ms = men(s);
	auto near = [&](XY p, double r) {
		for (const auto *u : ms)
			if (js::hypot(u->x - p.x, u->y - p.y) < r) return true;
		return false;
	};
	if (!save.at) {
		// not begun: his men reach the giver
		if (!near(spots.giver, STORY_R.talk)) return notes;
		save.at = story.steps[0].id;
		StoryNote n;
		n.kind = "start";
		notes.push_back(n);
	}
	for (int guard = 0; guard < 8; guard++) {
		const StoryStep *st = step();
		if (!st) break;
		const StoryTrigger &t = st->trigger;
		const auto it = spots.steps.find(st->id);
		const std::vector<XY> ps = it != spots.steps.end() ? it->second : std::vector<XY>();
		ensure(s, *st);
		bool done = false;
		if (t.kind == Trigger::Talk) done = near(spots.giver, STORY_R.talk);
		else if (t.kind == Trigger::Reach) done = near(ps[0], STORY_R.reach);
		else if (t.kind == Trigger::Track) {
			while (save.n < double(ps.size()) && near(ps[size_t(save.n)], STORY_R.mark)) {
				save.n++;
				StoryNote n;
				n.kind = "step";
				n.step = st->id + "#" + std::to_string(int64_t(save.n));
				notes.push_back(n);
			}
			done = save.n >= double(ps.size());
		} else if (t.kind == Trigger::Clear) {
			int found = 0;
			bool all = true;
			for (const StorySnap::Lair &l : s.lairs)
				if (js::hypot(l.x - ps[0].x, l.y - ps[0].y) < 0.5) {
					found++;
					if (l.state != "cleared") all = false;
				}
			done = seen && found > 0 && all && near(ps[0], STORY_R.near);
		} else if (t.kind == Trigger::Rescue) done = rescued(s, evs, souls, me);
		else if (t.kind == Trigger::Built) {
			for (const StorySnap::Building &b : s.buildings)
				if (b.type == t.type && b.state == "done" && b.team == me.team && !b.pre && (!me.online() || (b.has_owner && b.owner == *me.owner))) {
					done = true;
					break;
				}
		}
		if (!done) break;
		finish(s, *st, notes);
	}
	return notes;
}

std::vector<StoryNote> StoryRun::trade(const StorySnap &s, const std::string &op, double coin, double abroad) {
	const StoryStep *st = step();
	std::vector<StoryNote> notes;
	if (!st || st->trigger.kind != Trigger::Trade || st->trigger.op != op) return notes;
	const StoryTrigger &t = st->trigger;
	const double need = t.coin.value_or(1);
	save.n += !t.coin ? 1 : t.abroad ? abroad : coin;
	if (save.n < need) {
		StoryNote n;
		n.kind = "count";
		n.n = save.n;
		notes.push_back(n);
	} else finish(s, *st, notes);
	return notes;
}

std::optional<std::vector<StoryNote>> StoryRun::choose(const StorySnap &s, const std::string &option) {
	const StoryStep *st = step();
	if (!st || st->trigger.kind != Trigger::Choice) return std::nullopt;
	const StoryOption *o = nullptr;
	for (const StoryOption &x : st->trigger.options)
		if (x.id == option) {
			o = &x;
			break;
		}
	if (!o) return std::nullopt;
	std::vector<StoryNote> notes;
	save.picks[st->id] = o->id;
	pay(s, st->id + ":" + o->id, o->reward, spots.giver);
	StoryNote n;
	n.kind = "step";
	n.step = st->id;
	n.option = o->id;
	n.reward = o->reward;
	notes.push_back(n);
	advance(s, story_after(story, *st, o->next ? o->next : std::optional<std::string>("end")), notes);
	return notes;
}

// ---------------------------------------------------------------- hidden quests

void load_story_tables(const Dictionary &tables, StoryTables &out) {
	if (tables.has("war_chiefs")) {
		const Array a = tables["war_chiefs"];
		for (int64_t i = 0; i < a.size(); i++) {
			const Dictionary c = a[i];
			out.chiefs.push_back({ utf8(c["id"]), utf8(c["name"]), utf8(c["kind"]) });
		}
	}
	if (tables.has("world_regions")) {
		const Array a = tables["world_regions"];
		for (int64_t i = 0; i < a.size(); i++) {
			const Dictionary w = a[i], pos = w["pos"];
			out.world.push_back({ utf8(w["id"]), utf8(w["biome"]), pos["x"], pos["y"] });
		}
	}
	if (tables.has("region_depth")) {
		const Dictionary d = tables["region_depth"];
		const Array ks = d.keys();
		for (int64_t i = 0; i < ks.size(); i++) out.region_depth[utf8(ks[i])] = d[ks[i]];
	}
	if (tables.has("hidden")) {
		const Array a = tables["hidden"];
		for (int64_t i = 0; i < a.size(); i++) {
			const Dictionary h = a[i];
			out.hidden.push_back({ utf8(h["id"]), utf8(h["find"]) });
		}
	}
	if (tables.has("hidden_text")) {
		const Dictionary d = tables["hidden_text"];
		const Array ks = d.keys();
		for (int64_t i = 0; i < ks.size(); i++) {
			const Dictionary by = d[ks[i]];
			const Array lands = by.keys();
			for (int64_t k = 0; k < lands.size(); k++) {
				const Dictionary t = by[lands[k]];
				out.text[utf8(ks[i])][utf8(lands[k])] = { utf8(t["title"]), utf8(t["hook"]), utf8(t["backstory"]), utf8(t["story"]), utf8(t["end"]) };
			}
		}
	}
}

std::string land_of(const std::string &id) {
	for (const StoryTables::World &w : data().stories.world) {
		if (w.id != id) continue;
		if (w.biome == "dodona" || w.biome == "mountains") return "north";
		if (w.biome == "skythia") return "steppe";
		if (w.biome == "kyrene") return "sand";
		if (w.biome == "marsh" || w.biome == "elaia") return "south";
		if (w.biome == "coast") return w.y < 0 ? "north" : w.x > 0 ? "sand" : "south";
		return "";
	}
	return "";
}

double depth_of(const Dictionary &meta) {
	double d = 1;
	if (has(meta, "depth")) d = meta["depth"];
	else {
		const auto &rd = data().stories.region_depth;
		const auto it = rd.find(utf8(meta["id"]));
		if (it != rd.end()) d = it->second;
	}
	return std::max(0.0, std::min(4.0, d));
}

struct HiddenCtx {
	Pt at, then;
	std::string beast;
	std::optional<std::string> chief;
	double depth = 0;
	std::string land;
};

static const HiddenText &told(const HiddenCtx &c, const std::string &tpl) {
	const auto &by = data().stories.text.at(tpl);
	if (!c.land.empty()) {
		const auto it = by.find(c.land);
		if (it != by.end()) return it->second;
	}
	return by.at("plain");
}

static double pay_of(const HiddenCtx &c, double coin) { return js::round(coin * (1 + 0.5 * c.depth)); }

static StoryReward goods(std::vector<std::pair<std::string, double>> g) {
	StoryReward r;
	r.goods = std::move(g);
	return r;
}

static StoryStep clear_step(const std::string &id, const std::string &goal, const std::string &label, const std::string &story, const std::string &where, Pt at, const std::string &mob, double count) {
	StoryStep s;
	s.id = id;
	s.goal = goal;
	s.label = label;
	s.story = story;
	s.where = where;
	s.trigger.kind = Trigger::Clear;
	s.trigger.at = at;
	s.trigger.mob = mob;
	s.trigger.count = count;
	return s;
}

static StoryStep reach_step(const std::string &id, const std::string &goal, const std::string &label, const std::string &story, const std::string &where, Pt at) {
	StoryStep s;
	s.id = id;
	s.goal = goal;
	s.label = label;
	s.story = story;
	s.where = where;
	s.trigger.kind = Trigger::Reach;
	s.trigger.at = at;
	return s;
}

// HIDDEN[k].make: the title, hook, backstory, steps, end and reward of a template (into `m`); false: no such template
static bool make(const std::string &id, const HiddenCtx &c, Story &m) {
	const HiddenText &t = told(c, id);
	m.title = t.title;
	m.hook = t.hook;
	m.backstory = t.backstory;
	m.end = t.end;
	if (id == "corpse") {
		m.steps = { clear_step("killers", "Hunt down what killed him", "Killers", t.story, "Close by, where the tracks lead.", c.then, c.beast, 3 + std::min(3.0, c.depth)) };
		m.reward = goods({ { "coin", pay_of(c, 14) }, { "hides", 4 } });
	} else if (id == "cache") {
		StoryStep s = reach_step("dig", "Dig up the cache", "Cache", t.story, "A short walk from the cairn.", c.then);
		s.reward = goods({ { "coin", pay_of(c, 10) }, { "iron", 4 + c.depth }, { "salt", 3 } });
		m.steps = { s };
	} else if (id == "shrine") {
		if (c.chief) {
			StoryStep s = clear_step("beast", "Slay the beast that haunts the shrine", "Beast", t.story, "Its lair by the shrine.", c.then, c.beast, 1);
			s.trigger.chief = c.chief;
			std::string name = "the beast";
			for (const StoryTables::Chief &ch : data().stories.chiefs)
				if (ch.id == *c.chief) {
					name = ch.name;
					break;
				}
			s.trigger.name = name;
			StoryReward r;
			r.item = StoryReward::ItemRef{ "eye_bead", "rare" };
			s.reward = r;
			m.steps = { s };
		} else m.steps = { clear_step("beast", "Drive off the beasts at the shrine", "Beasts", "They feed on the offerings, and will not share.", "By the shrine.", c.then, c.beast, 4) };
		m.reward = goods({ { "coin", pay_of(c, 16) } });
	} else if (id == "ruin") {
		StoryStep camp = clear_step("camp", "Break the robbers in the ruin", "Robbers", "They grab their spears. Their leader keeps the strongbox.", "In the ruin.", c.then, "bandit", 3 + std::min(3.0, c.depth));
		camp.trigger.lead = true;
		m.steps = { reach_step("look", "Search the ruin", "Ruin", t.story, "Inside the ruin, a few steps on.", c.then), camp };
		m.reward = goods({ { "coin", pay_of(c, 18) }, { "bronze", 3 } });
	} else return false;
	return true;
}

std::vector<Story> hidden_stories(const Dictionary &meta) {
	const StoryTables &tb = data().stories;
	const Array lairs = meta.get("lairs", Array());
	std::string beast = "wolf";
	for (int64_t i = 0; i < lairs.size(); i++) {
		const std::string k = utf8(Dictionary(lairs[i])["kind"]);
		if (k != "bandit" && k != "ibex") {
			beast = k;
			break;
		}
	}
	std::set<std::string> used; // membership only
	for (int64_t i = 0; i < lairs.size(); i++) {
		const Dictionary l = lairs[i];
		if (has(l, "chief") && !utf8(l["chief"]).empty()) used.insert(utf8(l["chief"]));
	}
	const double depth = depth_of(meta);
	const std::string id = utf8(meta["id"]), land = land_of(id);
	const Array secrets = meta.get("secrets", Array());
	std::vector<Story> out;
	for (int64_t n = 0; n < secrets.size(); n++) {
		const Dictionary s = secrets[n];
		const std::string quest = utf8(s["quest"]);
		const StoryTables::Template *t = nullptr;
		for (const auto &h : tb.hidden)
			if (h.id == quest) {
				t = &h;
				break;
			}
		if (!t) continue;
		std::vector<const StoryTables::Chief *> pool;
		for (const auto &c : tb.chiefs)
			if (c.kind == beast && !used.count(c.id)) pool.push_back(&c);
		HiddenCtx c;
		c.at = { s["x"], s["y"] };
		const Array then = s["then"];
		c.then = { then[0], then[1] };
		c.beast = beast;
		if (!pool.empty()) c.chief = pool[size_t(n) % pool.size()]->id;
		c.depth = depth;
		c.land = land;
		Story st;
		if (!make(t->id, c, st)) continue;
		st.id = "hidden:" + id + ":" + std::to_string(n);
		st.region = id;
		st.hidden = true;
		st.giver = { t->find, "", c.at, "" };
		out.push_back(std::move(st));
	}
	return out;
}

// ---------------------------------------------------------------- dictionaries

static Pt pt_from(const Variant &v) {
	const Array a = v;
	return { a[0], a[1] };
}
static Array pt_to(Pt p) {
	Array a;
	a.push_back(p.x);
	a.push_back(p.y);
	return a;
}
static std::optional<std::string> ostr(const Dictionary &d, const char *k) {
	if (!has(d, k)) return std::nullopt;
	return utf8(d[k]);
}

StoryReward reward_from(const Dictionary &d) {
	StoryReward r;
	if (has(d, "goods")) {
		const Dictionary g = d["goods"];
		const Array ks = g.keys();
		r.goods.emplace();
		for (int64_t i = 0; i < ks.size(); i++) r.goods->push_back({ utf8(ks[i]), g[ks[i]] });
	}
	if (has(d, "item")) {
		const Dictionary it = d["item"];
		r.item = StoryReward::ItemRef{ utf8(it["def"]), utf8(it["rarity"]) };
	}
	if (has(d, "soul")) {
		const Dictionary s = d["soul"];
		r.soul = StoryReward::Soul{ utf8(s["cls"]), s["level"], utf8(s["name"]) };
	}
	return r;
}
static std::optional<StoryReward> oreward(const Dictionary &d) {
	if (!has(d, "reward")) return std::nullopt;
	return reward_from(d["reward"]);
}

Dictionary reward_to_dict(const StoryReward &r) {
	Dictionary d;
	if (r.goods) {
		Dictionary g;
		for (const auto &[k, v] : *r.goods) g[gs(k)] = v;
		d["goods"] = g;
	}
	if (r.item) {
		Dictionary it;
		it["def"] = gs(r.item->def);
		it["rarity"] = gs(r.item->rarity);
		d["item"] = it;
	}
	if (r.soul) {
		Dictionary s;
		s["cls"] = gs(r.soul->cls);
		s["level"] = r.soul->level;
		s["name"] = gs(r.soul->name);
		d["soul"] = s;
	}
	return d;
}

static StoryTrigger trigger_from(const Dictionary &d) {
	StoryTrigger t;
	const std::string k = utf8(d["kind"]);
	if (k == "talk") t.kind = Trigger::Talk;
	else if (k == "reach") t.kind = Trigger::Reach;
	else if (k == "track") t.kind = Trigger::Track;
	else if (k == "clear") t.kind = Trigger::Clear;
	else if (k == "rescue") t.kind = Trigger::Rescue;
	else if (k == "built") t.kind = Trigger::Built;
	else if (k == "trade") t.kind = Trigger::Trade;
	else if (k == "choice") t.kind = Trigger::Choice;
	else ERR_PRINT(godot::String("unknown story trigger ") + k.c_str());
	if (has(d, "at")) t.at = pt_from(d["at"]);
	if (has(d, "marks")) {
		const Array m = d["marks"];
		for (int64_t i = 0; i < m.size(); i++) t.marks.push_back(pt_from(m[i]));
	}
	if (has(d, "mob")) t.mob = utf8(d["mob"]);
	if (has(d, "count")) t.count = d["count"];
	t.lead = has(d, "lead") && bool(d["lead"]);
	t.name = ostr(d, "name");
	t.chief = ostr(d, "chief");
	if (has(d, "cls")) t.cls = utf8(d["cls"]);
	if (has(d, "level")) t.level = d["level"];
	if (has(d, "type")) t.type = utf8(d["type"]);
	if (has(d, "op")) t.op = utf8(d["op"]);
	if (has(d, "coin")) t.coin = double(d["coin"]);
	t.abroad = has(d, "abroad") && bool(d["abroad"]);
	if (has(d, "options")) {
		const Array os = d["options"];
		for (int64_t i = 0; i < os.size(); i++) {
			const Dictionary o = os[i];
			t.options.push_back({ utf8(o["id"]), utf8(o["label"]), utf8(o["text"]), oreward(o), ostr(o, "next") });
		}
	}
	return t;
}

static Dictionary trigger_to(const StoryTrigger &t) {
	static const char *kinds[] = { "talk", "reach", "track", "clear", "rescue", "built", "trade", "choice" };
	Dictionary d;
	d["kind"] = kinds[int(t.kind)];
	switch (t.kind) {
		case Trigger::Talk: break;
		case Trigger::Reach: d["at"] = pt_to(t.at); break;
		case Trigger::Track: {
			Array m;
			for (const Pt &p : t.marks) m.push_back(pt_to(p));
			d["marks"] = m;
			break;
		}
		case Trigger::Clear:
			d["at"] = pt_to(t.at);
			d["mob"] = gs(t.mob);
			d["count"] = t.count;
			if (t.lead) d["lead"] = true;
			if (t.name) d["name"] = gs(*t.name);
			if (t.chief) d["chief"] = gs(*t.chief);
			break;
		case Trigger::Rescue:
			d["at"] = pt_to(t.at);
			d["cls"] = gs(t.cls);
			d["level"] = t.level;
			d["name"] = gs(t.name.value_or(""));
			break;
		case Trigger::Built: d["type"] = gs(t.type); break;
		case Trigger::Trade:
			d["op"] = gs(t.op);
			if (t.coin) d["coin"] = *t.coin;
			if (t.abroad) d["abroad"] = true;
			break;
		case Trigger::Choice: {
			Array os;
			for (const StoryOption &o : t.options) {
				Dictionary od;
				od["id"] = gs(o.id);
				od["label"] = gs(o.label);
				od["text"] = gs(o.text);
				if (o.reward) od["reward"] = reward_to_dict(*o.reward);
				if (o.next) od["next"] = gs(*o.next);
				os.push_back(od);
			}
			d["options"] = os;
			break;
		}
	}
	return d;
}

Story story_from(const Dictionary &d) {
	Story s;
	s.id = utf8(d["id"]);
	s.region = utf8(d["region"]);
	s.title = utf8(d["title"]);
	const Dictionary g = d["giver"];
	s.giver = { utf8(g["name"]), utf8(g["title"]), pt_from(g["at"]), utf8(g["cls"]) };
	s.hook = utf8(d["hook"]);
	s.backstory = utf8(d["backstory"]);
	const Array steps = d["steps"];
	for (int64_t i = 0; i < steps.size(); i++) {
		const Dictionary st = steps[i];
		s.steps.push_back({ utf8(st["id"]), utf8(st["goal"]), utf8(st["story"]), utf8(st["where"]), utf8(st["label"]), trigger_from(st["trigger"]), oreward(st), ostr(st, "next") });
	}
	s.end = utf8(d["end"]);
	s.reward = oreward(d);
	s.path = ostr(d, "path");
	s.hidden = has(d, "hidden") && bool(d["hidden"]);
	return s;
}

Dictionary story_to_dict(const Story &s) {
	Dictionary d;
	d["id"] = gs(s.id);
	d["region"] = gs(s.region);
	d["title"] = gs(s.title);
	Dictionary g;
	g["name"] = gs(s.giver.name);
	g["title"] = gs(s.giver.title);
	g["at"] = pt_to(s.giver.at);
	g["cls"] = gs(s.giver.cls);
	d["giver"] = g;
	d["hook"] = gs(s.hook);
	d["backstory"] = gs(s.backstory);
	Array steps;
	for (const StoryStep &st : s.steps) {
		Dictionary sd;
		sd["id"] = gs(st.id);
		sd["goal"] = gs(st.goal);
		sd["story"] = gs(st.story);
		sd["where"] = gs(st.where);
		sd["label"] = gs(st.label);
		sd["trigger"] = trigger_to(st.trigger);
		if (st.reward) sd["reward"] = reward_to_dict(*st.reward);
		if (st.next) sd["next"] = gs(*st.next);
		steps.push_back(sd);
	}
	d["steps"] = steps;
	d["end"] = gs(s.end);
	if (s.reward) d["reward"] = reward_to_dict(*s.reward);
	if (s.path) d["path"] = gs(*s.path);
	if (s.hidden) d["hidden"] = true;
	return d;
}

// saveOk(story, s), then {...s, picks: {...s.picks}}
std::optional<StorySave> save_from(const Story &story, const Variant &v) {
	if (v.get_type() != Variant::DICTIONARY) return std::nullopt;
	const Dictionary d = v;
	const Variant vv = d.get("v", Variant()), sv = d.get("story", Variant()), nv = d.get("n", Variant()), pv = d.get("picks", Variant());
	const bool num_v = vv.get_type() == Variant::INT || vv.get_type() == Variant::FLOAT;
	if (!num_v || double(vv) != 1 || sv.get_type() != Variant::STRING || utf8(sv) != story.id) return std::nullopt;
	if (nv.get_type() != Variant::INT && nv.get_type() != Variant::FLOAT) return std::nullopt;
	const Variant::Type pt = pv.get_type();
	if (!(pt == Variant::DICTIONARY || pt == Variant::ARRAY || (d.has("picks") && pt == Variant::NIL))) return std::nullopt; // typeof 'object'
	if (!d.has("at")) return std::nullopt;
	const Variant at = d["at"];
	StorySave s;
	if (at.get_type() != Variant::NIL) {
		if (at.get_type() != Variant::STRING) return std::nullopt;
		bool found = false;
		for (const StoryStep &x : story.steps) found = found || x.id == utf8(at);
		if (!found) return std::nullopt;
		s.at = utf8(at);
	}
	s.story = story.id;
	s.n = nv;
	if (pt == Variant::DICTIONARY) {
		const Dictionary p = pv;
		const Array ks = p.keys();
		for (int64_t i = 0; i < ks.size(); i++) s.picks[utf8(ks[i])] = utf8(p[ks[i]]);
	}
	const Variant done = d.get("done", Variant());
	s.done = done.booleanize();
	return s;
}

Dictionary save_to_dict(const StorySave &s) {
	Dictionary d;
	d["v"] = s.v;
	d["story"] = gs(s.story);
	d["at"] = s.at ? Variant(gs(*s.at)) : Variant();
	d["n"] = s.n;
	Dictionary p;
	for (const auto &[k, v] : s.picks) p[gs(k)] = gs(v);
	d["picks"] = p;
	if (s.done) d["done"] = true;
	return d;
}

} // namespace sim

namespace godot {

static sim::StoryRegion region_of(const Dictionary &meta, const Ref<Grid> &grid) {
	sim::StoryRegion r;
	r.id = String(meta["id"]).utf8().get_data();
	r.w = grid->g.w;
	r.h = grid->g.h;
	r.cost = grid->g.cost;
	r.npc = sim::npc_spot(meta);
	return r;
}

static Dictionary xy(sim::XY p) {
	Dictionary d;
	d["x"] = p.x;
	d["y"] = p.y;
	return d;
}

static sim::StorySnap snap_from(const Dictionary &d) {
	sim::StorySnap s;
	s.tick = d["tick"];
	const Array qs = d.get("squads", Array()), us = d.get("units", Array()), ls = d.get("lairs", Array()), ss = d.get("souls", Array()), bs = d.get("buildings", Array());
	for (int64_t i = 0; i < qs.size(); i++) {
		const Dictionary q = qs[i];
		s.squads.push_back({ int(q["id"]), int(q["team"]), String(q.get("owner", "")).utf8().get_data() });
	}
	for (int64_t i = 0; i < us.size(); i++) {
		const Dictionary u = us[i];
		s.units.push_back({ int(u["squad"]), u["x"], u["y"], String(u["cls"]).utf8().get_data(), String(u["state"]).utf8().get_data() });
	}
	for (int64_t i = 0; i < ls.size(); i++) {
		const Dictionary l = ls[i];
		s.lairs.push_back({ l["x"], l["y"], String(l["state"]).utf8().get_data() });
	}
	for (int64_t i = 0; i < ss.size(); i++) {
		const Dictionary x = ss[i];
		s.souls.push_back({ int(x["id"]), x["x"], x["y"] });
	}
	for (int64_t i = 0; i < bs.size(); i++) {
		const Dictionary b = bs[i];
		sim::StorySnap::Building o;
		o.type = String(b["type"]).utf8().get_data();
		o.state = String(b["state"]).utf8().get_data();
		o.team = int(b["team"]);
		o.pre = b.get("pre", false).booleanize();
		o.has_owner = b.has("owner") && b["owner"].get_type() == Variant::STRING;
		if (o.has_owner) o.owner = String(b["owner"]).utf8().get_data();
		s.buildings.push_back(o);
	}
	return s;
}

static std::vector<sim::StoryEvent> events_from(const Array &a) {
	std::vector<sim::StoryEvent> out;
	for (int64_t i = 0; i < a.size(); i++) {
		const Dictionary e = a[i];
		sim::StoryEvent v;
		v.kind = String(e["kind"]).utf8().get_data();
		v.soul = int(e.get("soul", 0));
		v.squad = int(e.get("squad", 0));
		if (e.has("owner") && e["owner"].get_type() == Variant::STRING) v.owner = String(e["owner"]).utf8().get_data();
		out.push_back(v);
	}
	return out;
}

static Array notes_to(const std::vector<sim::StoryNote> &ns) {
	Array out;
	for (const sim::StoryNote &n : ns) {
		Dictionary d;
		d["kind"] = String(n.kind.c_str());
		if (n.kind == "step") d["step"] = String::utf8(n.step.c_str());
		if (n.option) d["option"] = String::utf8(n.option->c_str());
		if (n.reward) d["reward"] = sim::reward_to_dict(*n.reward);
		if (n.kind == "count") d["n"] = n.n;
		out.push_back(d);
	}
	return out;
}

Ref<StoryRun> StoryRun::create(const Dictionary &story, const Dictionary &meta, const Ref<Grid> &grid, const Variant &save, const Dictionary &me) {
	Ref<StoryRun> r;
	r.instantiate();
	r->region = region_of(meta, grid);
	sim::Story s = sim::story_from(story);
	sim::StoryMe m;
	m.team = int(me["team"]);
	if (me.has("owner") && me["owner"].get_type() == Variant::STRING) m.owner = String(me["owner"]).utf8().get_data();
	StoryRun *self = r.ptr();
	sim::StoryHost host;
	host.add_lair = [self](const sim::LairAsk &d) {
		Dictionary o;
		o["kind"] = String(d.kind.c_str());
		o["x"] = d.x;
		o["y"] = d.y;
		if (d.chief) o["chief"] = String::utf8(d.chief->c_str());
		if (d.count) o["count"] = *d.count;
		if (d.lead) o["lead"] = true;
		Array c;
		c.push_back("addLair");
		c.push_back(o);
		self->calls.push_back(c);
	};
	host.spawn_soul = [self](double x, double y, const std::string &cls, double level) {
		Array c;
		c.push_back("spawnSoul");
		c.push_back(x);
		c.push_back(y);
		c.push_back(String(cls.c_str()));
		c.push_back(level);
		self->calls.push_back(c);
	};
	host.give = [self](const sim::StoryReward &rw, sim::XY at, const std::optional<sim::Item> &item) {
		Array c;
		c.push_back("give");
		c.push_back(sim::reward_to_dict(rw));
		c.push_back(xy(at));
		c.push_back(item ? Variant(sim::item_to_dict(*item)) : Variant());
		self->calls.push_back(c);
	};
	const auto sv = sim::save_from(s, save);
	r->run = std::make_unique<sim::StoryRun>(r->region, std::move(s), sv, std::move(m), std::move(host));
	return r;
}

Array StoryRun::tick(const Dictionary &snap, const Array &events) { return notes_to(run->tick(snap_from(snap), events_from(events))); }

Array StoryRun::trade(const Dictionary &snap, const String &op, double coin, double abroad) {
	return notes_to(run->trade(snap_from(snap), op.utf8().get_data(), coin, abroad));
}

Variant StoryRun::choose(const Dictionary &snap, const String &option) {
	const auto n = run->choose(snap_from(snap), option.utf8().get_data());
	return n ? Variant(notes_to(*n)) : Variant();
}

Dictionary StoryRun::get_save() const { return sim::save_to_dict(run->save); }

static Dictionary spots_to(const sim::StorySpots &sp) {
	Dictionary d, steps;
	d["giver"] = xy(sp.giver);
	for (const auto &[id, ps] : sp.steps) {
		Array a;
		for (const sim::XY &p : ps) a.push_back(xy(p));
		steps[String::utf8(id.c_str())] = a;
	}
	d["steps"] = steps;
	return d;
}

Dictionary StoryRun::spots() const { return spots_to(run->spots); }

Variant StoryRun::step() const {
	const sim::StoryStep *st = run->step();
	return st ? Variant(String::utf8(st->id.c_str())) : Variant();
}

Array StoryRun::take_calls() {
	Array c = calls;
	calls = Array();
	return c;
}

Dictionary StoryRun::snap_open(const Dictionary &meta, const Ref<Grid> &grid, double x, double y) { return xy(sim::snap_open(region_of(meta, grid), { x, y })); }

Dictionary StoryRun::story_spots(const Dictionary &story, const Dictionary &meta, const Ref<Grid> &grid) {
	return spots_to(sim::story_spots(region_of(meta, grid), sim::story_from(story)));
}

PackedStringArray StoryRun::story_path(const Dictionary &story, const Variant &save) {
	const sim::Story s = sim::story_from(story);
	std::optional<sim::StorySave> sv;
	if (save.get_type() == Variant::DICTIONARY) { // storyPath reads picks only (no saveOk)
		sim::StorySave v;
		const Dictionary p = Dictionary(save).get("picks", Dictionary());
		const Array ks = p.keys();
		for (int64_t i = 0; i < ks.size(); i++) v.picks[String(ks[i]).utf8().get_data()] = String(p[ks[i]]).utf8().get_data();
		sv = v;
	}
	PackedStringArray out;
	for (const sim::StoryStep *st : sim::story_path(s, sv ? &*sv : nullptr)) out.push_back(String::utf8(st->id.c_str()));
	return out;
}

Variant StoryRun::story_item(const Dictionary &story, const String &step, const String &owner, const Variant &reward) {
	std::optional<sim::StoryReward> r;
	if (reward.get_type() == Variant::DICTIONARY) r = sim::reward_from(reward);
	const auto it = sim::story_item(sim::story_from(story), step.utf8().get_data(), owner.utf8().get_data(), r);
	return it ? Variant(sim::item_to_dict(*it)) : Variant();
}

// [saveOk, stepOf(saveOk ? save : null) id or null]
Array StoryRun::save_check(const Dictionary &story, const Variant &save) {
	const sim::Story s = sim::story_from(story);
	const auto sv = sim::save_from(s, save);
	Array out;
	out.push_back(sv.has_value());
	const sim::StoryStep *st = sv ? sim::step_of(s, &*sv) : nullptr;
	out.push_back(st ? Variant(String::utf8(st->id.c_str())) : Variant());
	return out;
}

Array StoryRun::hidden_stories(const Dictionary &meta) {
	Array out;
	for (const sim::Story &s : sim::hidden_stories(meta)) out.push_back(sim::story_to_dict(s));
	return out;
}

Dictionary StoryRun::round_trip(const Dictionary &story) { return sim::story_to_dict(sim::story_from(story)); }

Dictionary StoryRun::radii() {
	Dictionary d;
	d["talk"] = sim::STORY_R.talk;
	d["reach"] = sim::STORY_R.reach;
	d["mark"] = sim::STORY_R.mark;
	d["near"] = sim::STORY_R.near;
	d["soul"] = sim::STORY_R.soul;
	return d;
}

void StoryRun::_bind_methods() {
	ClassDB::bind_static_method("StoryRun", D_METHOD("create", "story", "meta", "grid", "save", "me"), &StoryRun::create);
	ClassDB::bind_method(D_METHOD("tick", "snap", "events"), &StoryRun::tick);
	ClassDB::bind_method(D_METHOD("trade", "snap", "op", "coin", "abroad"), &StoryRun::trade);
	ClassDB::bind_method(D_METHOD("choose", "snap", "option"), &StoryRun::choose);
	ClassDB::bind_method(D_METHOD("get_save"), &StoryRun::get_save);
	ClassDB::bind_method(D_METHOD("spots"), &StoryRun::spots);
	ClassDB::bind_method(D_METHOD("step"), &StoryRun::step);
	ClassDB::bind_method(D_METHOD("take_calls"), &StoryRun::take_calls);
	ClassDB::bind_static_method("StoryRun", D_METHOD("snap_open", "meta", "grid", "x", "y"), &StoryRun::snap_open);
	ClassDB::bind_static_method("StoryRun", D_METHOD("story_spots", "story", "meta", "grid"), &StoryRun::story_spots);
	ClassDB::bind_static_method("StoryRun", D_METHOD("story_path", "story", "save"), &StoryRun::story_path);
	ClassDB::bind_static_method("StoryRun", D_METHOD("story_item", "story", "step", "owner", "reward"), &StoryRun::story_item);
	ClassDB::bind_static_method("StoryRun", D_METHOD("save_check", "story", "save"), &StoryRun::save_check);
	ClassDB::bind_static_method("StoryRun", D_METHOD("hidden_stories", "meta"), &StoryRun::hidden_stories);
	ClassDB::bind_static_method("StoryRun", D_METHOD("round_trip", "story"), &StoryRun::round_trip);
	ClassDB::bind_static_method("StoryRun", D_METHOD("radii"), &StoryRun::radii);
}

} // namespace godot
