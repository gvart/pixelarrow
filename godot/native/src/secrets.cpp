#include "secrets.h"

#include <algorithm>
#include <cmath>

#include <godot_cpp/core/class_db.hpp>

#include "js_math.h"
#include "vision.h" // MOB_TEAM, NEUTRAL_TEAM

namespace sim {

// A player's squads: not the wild's, not roaming folk, not civilians, not the sim's bots.
static bool player_squad(const SecretSquad &s) {
	return s.alive > 0 && s.team != MOB_TEAM && s.team != NEUTRAL_TEAM && !s.civ && s.owner.rfind("bot", 0) != 0;
}

Secrets::Secrets(const godot::Dictionary &meta, const StoryRegion &region, SecretHost host) :
		region(region), host(std::move(host)), stories_(hidden_stories(meta)) {}

SecretSave *Secrets::save_at(const std::string &key) {
	for (auto &e : saves)
		if (e.first == key) return &e.second;
	return nullptr;
}

StoryRun &Secrets::run(int n, const std::string &owner, int team) {
	const std::string key = std::to_string(n) + "|" + owner;
	const auto it = runs.find(key);
	if (it != runs.end()) return *it->second;
	const Story &story = stories_[n];
	StoryHost h;
	h.add_lair = [this](const LairAsk &d) { host.add_lair(d); };
	h.spawn_soul = [this](double x, double y, const std::string &cls, double level) { host.spawn_soul(x, y, cls, level); };
	const std::string title = story.title;
	h.give = [this, owner, title](const StoryReward &rw, XY at, const std::optional<Item> &item) {
		if (rw.soul) host.spawn_soul(at.x + 1, at.y, rw.soul->cls, rw.soul->level);
		if (rw.goods || item) host.give(owner, title, at.x, at.y, rw.goods ? *rw.goods : std::vector<std::pair<std::string, double>>{}, item ? std::vector<Item>{ *item } : std::vector<Item>{});
	};
	const SecretSave *v = save_at(key);
	StoryMe me;
	me.team = team;
	me.owner = owner;
	auto r = std::make_unique<StoryRun>(region, story, v ? std::optional<StorySave>(v->save) : std::nullopt, me, std::move(h));
	StoryRun &out = *r;
	runs[key] = std::move(r);
	return out;
}

StorySnap Secrets::look(const std::vector<std::string> &owners) const {
	StorySnap s;
	s.tick = tick_;
	for (const SecretSquad &q : host.squads()) {
		if (std::find(owners.begin(), owners.end(), q.owner) == owners.end() || !player_squad(q)) continue;
		s.squads.push_back({ q.id, q.team, q.owner });
		for (const SecretSquad::Unit &u : q.units)
			if (u.alive) s.units.push_back({ q.id, u.x, u.y, u.cls.value_or("man"), "idle" });
	}
	s.lairs = host.lairs();
	s.souls = host.souls();
	return s;
}

void Secrets::tell(int n, const std::string &owner, int team, const std::vector<StoryNote> &notes) {
	const Story &story = stories_[n];
	const Pt spot = story.giver.at;
	for (const StoryNote &x : notes) {
		if (x.kind == "count") continue;
		const StoryStep *step = nullptr;
		if (x.kind == "step") {
			const std::string id = x.step.substr(0, x.step.find('#'));
			for (const StoryStep &s : story.steps)
				if (s.id == id) {
					step = &s;
					break;
				}
		}
		SecretEvent e;
		e.t = tick_;
		e.what = x.kind == "start" ? "found" : x.kind == "end" ? "done" : "step";
		e.quest = story.id;
		e.owner = owner;
		e.team = team;
		e.title = story.title;
		e.text = x.kind == "start" ? story.giver.name + ": " + story.hook : x.kind == "end" ? story.end : step ? step->goal : "";
		e.x = spot.x;
		e.y = spot.y;
		if (x.kind != "start" && x.reward && x.reward->goods) e.goods = *x.reward->goods;
		host.note(e);
	}
	// the step after: its goal as the next line (the found notice then says what to do), and where it is (W-76)
	const auto it = runs.find(std::to_string(n) + "|" + owner);
	StoryRun *r = it != runs.end() ? it->second.get() : nullptr;
	if (r && r->step() && !notes.empty() && notes.back().kind != "end") {
		const StoryStep *st = r->step();
		host.note(next_line(story, r->spots, r->save, owner, team, st->goal + ": " + st->story));
	}
}

SecretEvent Secrets::next_line(const Story &story, const StorySpots &spots, const StorySave &save, const std::string &owner, int team, const std::string &text) const {
	const StoryStep *st = step_of(story, &save);
	const StoryTrigger &t = st->trigger;
	const auto ps_it = spots.steps.find(st->id);
	static const std::vector<XY> none;
	const std::vector<XY> &ps = ps_it != spots.steps.end() ? ps_it->second : none;
	const Pt spot = story.giver.at;
	std::optional<XY> p;
	if (t.kind == Trigger::Talk) p = spots.giver;
	else if (t.kind == Trigger::Track) {
		const double k = std::min(save.n, double(ps.size()) - 1);
		if (k >= 0 && k < double(ps.size())) p = ps[size_t(k)];
	} else if (!ps.empty()) p = ps[0];
	SecretEvent e;
	e.t = tick_;
	e.what = "step";
	e.quest = story.id;
	e.owner = owner;
	e.team = team;
	e.title = story.title;
	e.text = text;
	e.x = spot.x;
	e.y = spot.y;
	if (p) e.to = SecretEvent::To{ p->x, p->y, st->label };
	return e;
}

void Secrets::load_root(const SecretsRoot &o) {
	saves = o.saves;
	tick_ = o.tick;
	runs.clear();
}

std::vector<SecretEvent> Secrets::open(const std::string &owner) {
	std::vector<SecretEvent> out;
	for (size_t n = 0; n < stories_.size(); n++) {
		const Story &story = stories_[n];
		const std::string key = std::to_string(n) + "|" + owner;
		const SecretSave *v = save_at(key);
		if (!v || !step_of(story, &v->save)) continue;
		const auto it = runs.find(key);
		out.push_back(next_line(story, it != runs.end() ? it->second->spots : story_spots(region, story), v->save, owner, v->team, ""));
	}
	return out;
}

const StorySave *Secrets::save(int n, const std::string &owner) const {
	const std::string key = std::to_string(n) + "|" + owner;
	for (const auto &e : saves)
		if (e.first == key) return &e.second.save;
	return nullptr;
}

void Secrets::tick(double t) {
	tick_ = t;
	if (stories_.empty() || std::fmod(t, SECRET_THINK) != 0) return;
	// who stands near an unfound spot, and whose runs are open
	std::vector<std::pair<std::string, int>> want; // a Map: `${n}|${owner}` -> team, insertion order
	const auto want_set = [&](const std::string &key, int team) {
		for (auto &e : want)
			if (e.first == key) {
				e.second = team;
				return;
			}
		want.push_back({ key, team });
	};
	for (const auto &[key, v] : saves)
		if (!v.save.done) want_set(key, v.team);
	for (const SecretSquad &q : host.squads()) {
		if (!player_squad(q)) continue;
		for (size_t n = 0; n < stories_.size(); n++) {
			const Story &s = stories_[n];
			const std::string key = std::to_string(n) + "|" + q.owner;
			if (save_at(key) || js::pow(q.cx - s.giver.at.x, 2) + js::pow(q.cy - s.giver.at.y, 2) > SECRET_NEAR * SECRET_NEAR) continue;
			want_set(key, q.team);
		}
	}
	if (want.empty()) return;
	std::vector<std::string> owners; // a Set: membership only
	for (const auto &[key, team] : want) {
		const std::string o = key.substr(key.find('|') + 1);
		if (std::find(owners.begin(), owners.end(), o) == owners.end()) owners.push_back(o);
	}
	const StorySnap snap = look(owners);
	for (const auto &[key, team] : want) {
		const int n = std::stoi(key.substr(0, key.find('|')));
		const std::string owner = key.substr(key.find('|') + 1);
		StoryRun &r = run(n, owner, team);
		const std::vector<StoryNote> notes = r.tick(snap, {});
		if (r.save.at || r.save.done) {
			SecretSave *v = save_at(key);
			if (v) *v = { r.save, team };
			else saves.push_back({ key, { r.save, team } });
		} else runs.erase(key); // not found after all (his men only passed near)
		if (!notes.empty()) tell(n, owner, team, notes);
	}
}

} // namespace sim

namespace godot {

static std::string u8(const Variant &v) { return String(v).utf8().get_data(); }
static String gs(const std::string &s) { return String::utf8(s.c_str()); }

static Dictionary goods_to(const std::vector<std::pair<std::string, double>> &g) {
	Dictionary d;
	for (const auto &[k, v] : g) d[gs(k)] = v;
	return d;
}

static Dictionary event_to(const sim::SecretEvent &e) {
	Dictionary d;
	d["t"] = e.t;
	d["kind"] = "secret";
	d["what"] = gs(e.what);
	d["quest"] = gs(e.quest);
	d["owner"] = gs(e.owner);
	d["team"] = e.team;
	d["title"] = gs(e.title);
	d["text"] = gs(e.text);
	d["x"] = e.x;
	d["y"] = e.y;
	if (e.goods) d["goods"] = goods_to(*e.goods);
	if (e.to) {
		Dictionary to;
		to["x"] = e.to->x;
		to["y"] = e.to->y;
		to["label"] = gs(e.to->label);
		d["to"] = to;
	}
	return d;
}

Ref<Secrets> Secrets::create(const Dictionary &meta, const Ref<Grid> &grid) {
	Ref<Secrets> r;
	r.instantiate();
	r->region.id = u8(meta["id"]);
	r->region.w = grid->g.w;
	r->region.h = grid->g.h;
	r->region.cost = grid->g.cost;
	r->region.npc = sim::npc_spot(meta);
	Secrets *self = r.ptr();
	sim::SecretHost h;
	h.squads = [self]() -> const std::vector<sim::SecretSquad> & { return self->squads; };
	h.lairs = [self]() { return self->lairs; };
	h.souls = [self]() { return self->souls; };
	h.add_lair = [self](const sim::LairAsk &d) {
		Dictionary o;
		o["kind"] = gs(d.kind);
		o["x"] = d.x;
		o["y"] = d.y;
		if (d.chief) o["chief"] = gs(*d.chief);
		if (d.count) o["count"] = *d.count;
		if (d.lead) o["lead"] = true;
		Array c;
		c.push_back("addLair");
		c.push_back(o);
		self->calls.push_back(c);
	};
	h.spawn_soul = [self](double x, double y, const std::string &cls, double level) {
		Array c;
		c.push_back("spawnSoul");
		c.push_back(x);
		c.push_back(y);
		c.push_back(gs(cls));
		c.push_back(level);
		self->calls.push_back(c);
	};
	h.give = [self](const std::string &owner, const std::string &name, double x, double y, const std::vector<std::pair<std::string, double>> &goods, const std::vector<sim::Item> &items) {
		Array c, it;
		for (const sim::Item &i : items) it.push_back(sim::item_to_dict(i));
		c.push_back("give");
		c.push_back(gs(owner));
		c.push_back(gs(name));
		c.push_back(x);
		c.push_back(y);
		c.push_back(goods_to(goods));
		c.push_back(it);
		self->calls.push_back(c);
	};
	h.note = [self](const sim::SecretEvent &e) {
		Array c;
		c.push_back("note");
		c.push_back(event_to(e));
		self->calls.push_back(c);
	};
	r->s = std::make_unique<sim::Secrets>(meta, r->region, std::move(h));
	return r;
}

void Secrets::set_world(const Array &qs, const Array &ls, const Array &ss) {
	squads.clear();
	for (int64_t i = 0; i < qs.size(); i++) {
		const Dictionary q = qs[i];
		sim::SecretSquad o;
		o.id = int(q["id"]);
		o.owner = u8(q["owner"]);
		o.team = int(q["team"]);
		o.alive = int(q["alive"]);
		o.civ = q.get("civ", false).booleanize();
		o.cx = q["cx"];
		o.cy = q["cy"];
		const Array us = q["units"];
		for (int64_t k = 0; k < us.size(); k++) {
			const Dictionary u = us[k];
			sim::SecretSquad::Unit v;
			if (u.has("id")) v.id = int(u["id"]);
			v.x = u["x"];
			v.y = u["y"];
			v.alive = u["alive"].booleanize();
			if (u.has("cls")) v.cls = u8(u["cls"]);
			o.units.push_back(v);
		}
		squads.push_back(o);
	}
	lairs.clear();
	for (int64_t i = 0; i < ls.size(); i++) {
		const Dictionary l = ls[i];
		lairs.push_back({ l["x"], l["y"], u8(l["state"]) });
	}
	souls.clear();
	for (int64_t i = 0; i < ss.size(); i++) {
		const Dictionary x = ss[i];
		souls.push_back({ int(x["id"]), x["x"], x["y"] });
	}
}

Array Secrets::take_calls() {
	Array c = calls;
	calls = Array();
	return c;
}

Array Secrets::open(const String &owner) {
	Array out;
	for (const sim::SecretEvent &e : s->open(u8(owner))) out.push_back(event_to(e));
	return out;
}

Variant Secrets::save(int n, const String &owner) const {
	const sim::StorySave *v = s->save(n, u8(owner));
	return v ? Variant(sim::save_to_dict(*v)) : Variant();
}

Dictionary Secrets::save_root() const {
	const sim::SecretsRoot o = s->save_root();
	Dictionary d, saves;
	for (const auto &[key, v] : o.saves) {
		Dictionary e;
		e["save"] = sim::save_to_dict(v.save);
		e["team"] = v.team;
		saves[gs(key)] = e;
	}
	d["saves"] = saves;
	d["tick"] = o.tick;
	return d;
}

void Secrets::load_root(const Dictionary &o) {
	sim::SecretsRoot r;
	const Dictionary saves = o["saves"];
	const Array ks = saves.keys();
	for (int64_t i = 0; i < ks.size(); i++) {
		const std::string key = u8(ks[i]);
		const Dictionary e = saves[ks[i]];
		const auto sv = sim::save_from(s->stories()[std::stoi(key.substr(0, key.find('|')))], e["save"]);
		if (sv) r.saves.push_back({ key, { *sv, int(e["team"]) } });
	}
	r.tick = o["tick"];
	s->load_root(r);
}

void Secrets::_bind_methods() {
	ClassDB::bind_static_method("Secrets", D_METHOD("create", "meta", "grid"), &Secrets::create);
	ClassDB::bind_method(D_METHOD("set_world", "squads", "lairs", "souls"), &Secrets::set_world);
	ClassDB::bind_method(D_METHOD("take_calls"), &Secrets::take_calls);
	ClassDB::bind_method(D_METHOD("tick", "t"), &Secrets::tick);
	ClassDB::bind_method(D_METHOD("open", "owner"), &Secrets::open);
	ClassDB::bind_method(D_METHOD("save", "n", "owner"), &Secrets::save);
	ClassDB::bind_method(D_METHOD("stories"), &Secrets::stories);
	ClassDB::bind_method(D_METHOD("save_root"), &Secrets::save_root);
	ClassDB::bind_method(D_METHOD("load_root", "root"), &Secrets::load_root);
}

} // namespace godot
