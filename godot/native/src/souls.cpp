#include "souls.h"

#include <algorithm>
#include <cmath>

#include <godot_cpp/core/class_db.hpp>

#include "js_math.h"
#include "sim_data.h"
#include "stories.h" // depth_of
#include "vision.h" // MOB_TEAM

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::Variant;

static std::string utf8(const Variant &v) { return godot::String(v).utf8().get_data(); }

void load_soul_tables(const Dictionary &tables, SoulTables &out) {
	if (!tables.has("souls")) return;
	const Dictionary t = tables["souls"], s = t["SOUL"];
	out.every = s["every"];
	out.max = s["max"];
	out.life = s["life"];
	out.fade = s["fade"];
	out.reach = s["reach"];
	out.channel = s["channel"];
	out.scan = s["scan"];
	out.field = s["field"];
	out.cell = s["cell"];
	out.fields = s["fields"];
	out.ruins = s["ruins"];
	out.spacing = s["spacing"];
	out.stormMax = s["stormMax"];
	const Dictionary ch = s["chance"], cl = t["SOUL_CLASSES"], lv = t["SOUL_LEVEL"];
	Array ks = ch.keys();
	for (int64_t i = 0; i < ks.size(); i++) out.chance[utf8(ks[i])] = ch[ks[i]];
	ks = cl.keys();
	for (int64_t i = 0; i < ks.size(); i++) {
		const Array a = cl[ks[i]];
		std::vector<std::string> v;
		for (int64_t k = 0; k < a.size(); k++) v.push_back(utf8(a[k]));
		out.classes[utf8(ks[i])] = v;
	}
	ks = lv.keys();
	for (int64_t i = 0; i < ks.size(); i++) out.level[utf8(ks[i])] = lv[ks[i]];
	out.level_max = t["SOUL_LEVEL_MAX"];
}

static const SoulTables &S() { return data().souls; }
static double at_or(const std::unordered_map<std::string, double> &m, const std::string &k) {
	const auto it = m.find(k);
	return it != m.end() ? it->second : std::nan("");
}

// START: the classes a battlefield remembers (a module const in TS, not exported)
static bool start_class(const std::string &c) {
	return c == "militia" || c == "hoplite" || c == "celt_sword" || c == "archer" || c == "slinger" || c == "javelineer";
}

double soul_level(const std::string &site, double depth) { return std::min(S().level_max, at_or(S().level, site) + std::floor(depth / 2)); }

SoulRegion soul_region(const Dictionary &meta) {
	SoulRegion r;
	const Array pre = meta.get("prebuilt", Array()), lairs = meta.get("lairs", Array());
	for (int64_t i = 0; i < pre.size(); i++) {
		const Dictionary e = pre[i];
		r.prebuilt.push_back({ utf8(e["type"]), utf8(e.get("state", "")), e["x"], e["y"] });
	}
	for (int64_t i = 0; i < lairs.size(); i++) {
		const Dictionary l = lairs[i];
		r.lairs.push_back({ l["x"], l["y"] });
	}
	r.depth = depth_of(meta);
	return r;
}

std::vector<SoulSite> soul_sites(const SoulRegion &region) {
	std::vector<SoulSite> out;
	for (const SoulRegion::Pre &e : region.prebuilt)
		if ((e.type == "shrine" || e.type == "temple") && e.state != "ruined") out.push_back({ "shrine", e.x, e.y });
	std::vector<SoulSite> ruins;
	for (const SoulRegion::Pre &e : region.prebuilt) {
		if (e.state != "ruined" || double(ruins.size()) >= S().ruins) continue;
		if (std::any_of(ruins.begin(), ruins.end(), [&](const SoulSite &r) { return js::pow(r.x - e.x, 2) + js::pow(r.y - e.y, 2) < js::pow(S().spacing, 2); })) continue;
		ruins.push_back({ "ruin", e.x, e.y });
	}
	out.insert(out.end(), ruins.begin(), ruins.end());
	for (const auto &[x, y] : region.lairs) out.push_back({ "lair", x, y });
	return out;
}

Souls::Souls(const SoulRegion &region, uint32_t seed, SoulHost host) :
		depth(region.depth), fixed(soul_sites(region)), rng(seed ^ 0x5017u), host(std::move(host)) {}

std::vector<SoulSite> Souls::sites() const {
	if (fields.empty()) return fixed;
	std::vector<SoulSite> all = fixed;
	all.insert(all.end(), fields.begin(), fields.end());
	return all;
}

Soul &Souls::make(double x, double y, const std::string &cls, double level, const std::string &site, double t, int at) {
	Soul s;
	s.id = next++;
	s.x = x;
	s.y = y;
	s.cls = cls;
	s.level = level;
	s.site = site;
	s.until = t + S().life;
	s.at = at;
	list.push_back(s);
	return list.back();
}

std::string Souls::pick(const SoulSite &site, int i) {
	if (site.kind == "battlefield") {
		// the class most of the fallen there were
		const SoulCell *c = nullptr;
		for (const auto &[k, x] : cells)
			if (x.site == i) {
				c = &x;
				break;
			}
		if (c && !c->by.empty()) {
			std::vector<std::pair<std::string, double>> e = c->by;
			std::stable_sort(e.begin(), e.end(), [](const auto &a, const auto &b) {
				if (b.second != a.second) return b.second < a.second;
				return a.first < b.first; // localeCompare: the START names differ in their first letter
			});
			return e[0].first;
		}
	}
	const std::vector<std::string> &pool = S().classes.at(site.kind);
	return pool[size_t(std::floor(rng.next() * double(pool.size())))];
}

void Souls::roll(double t) {
	const std::vector<SoulSite> all = sites();
	const double max = storm > 1 ? S().stormMax : S().max;
	double n = double(std::count_if(list.begin(), list.end(), [](const Soul &s) { return !s.person; })); // W-68: named souls wait outside the count
	for (size_t i = 0; i < all.size() && n < max; i++) {
		// a storm wakes more than one soul at a site (offset round it)
		const int at = int(std::count_if(list.begin(), list.end(), [&](const Soul &s) { return s.at == int(i); }));
		if (at >= (storm > 1 ? 2 : 1)) continue;
		const SoulSite &site = all[i];
		const double r = rng.next();
		if (r >= at_or(S().chance, site.kind) * storm * (host.chance_at ? host.chance_at(site.x, site.y) : 1)) continue;
		const double x = site.x + (at ? 1.5 : 0), y = site.y + (at ? 1 : 0);
		const std::string cls = pick(site, int(i));
		make(x, y, cls, soul_level(site.kind, depth), site.kind, t, int(i));
		n++;
	}
}

bool Souls::claim(Soul &s, double t) {
	bool mob = false;
	std::vector<std::pair<int, int>> by; // a Map: team -> its first claiming squad, insertion order
	const auto by_get = [&](int team) -> std::pair<int, int> * {
		for (auto &e : by)
			if (e.first == team) return &e;
		return nullptr;
	};
	for (const SoulMan &m : host.men()) {
		if (js::pow(m.x - s.x, 2) + js::pow(m.y - s.y, 2) > S().reach * S().reach) continue;
		if (m.team == MOB_TEAM) mob = true;
		else if (m.claim == s.id && !m.civ && !(s.bar && *s.bar == m.owner && t < s.barUntil.value_or(0))) {
			std::pair<int, int> *q = by_get(m.team);
			if (!q) by.push_back({ m.team, m.squad });
			else if (m.squad < q->second) q->second = m.squad;
		}
	}
	// the wild at him with no claimer takes him; a claimer at him keeps the wild off (contested)
	const size_t sides = by.size() + (mob ? 1 : 0);
	s.contested = sides > 1;
	if (sides == 0) {
		s.prog = std::max(0.0, s.prog - S().scan);
		if (s.prog == 0) s.team = -1;
		return false;
	}
	if (sides > 1) return false;
	const int team = mob ? MOB_TEAM : by[0].first;
	if (team != s.team) (s.team = team), (s.prog = 0);
	s.prog += S().scan;
	if (s.prog < S().channel) return false;
	if (mob) {
		SoulEvent e;
		e.t = t;
		e.kind = "soulLost";
		e.soul = s.id;
		e.team = MOB_TEAM;
		if (s.person) e.pid = s.person->id;
		host.emit(e);
		return true;
	}
	const int squad = by_get(team)->second;
	std::string owner;
	for (const SoulMan &m : host.men())
		if (m.squad == squad) {
			owner = m.owner;
			break;
		}
	const SoulGate g = host.gate(owner, s.cls);
	if (!g.ok) {
		SoulEvent e;
		e.t = t;
		e.kind = "soulRefused";
		e.soul = s.id;
		e.squad = squad;
		e.owner = owner;
		e.have = g.have;
		e.why = g.why.value_or("full");
		host.emit(e);
		host.stop(owner, s.id);
		s.prog = 0;
		s.team = -1;
		return false;
	}
	const std::optional<SoulJoin> j = host.join(s, squad);
	if (!j) return false;
	SoulEvent e;
	e.t = t;
	e.kind = "soulClaimed";
	e.soul = s.id;
	e.squad = squad;
	e.owner = owner;
	e.unit = j->unit;
	e.person = j->person;
	host.emit(e);
	return true;
}

void Souls::tick(double t) {
	if (t > 0 && std::fmod(t, storm > 1 ? S().every / 2 : S().every) == 0) roll(t);
	if (std::fmod(t, S().scan) != 0 || list.empty()) return;
	std::vector<Soul> kept; // the filter: host calls during it see the list as it is (TS assigns after the filter)
	for (Soul &s : list) {
		if (s.until <= t) {
			SoulEvent e;
			e.t = t;
			e.kind = "soulFaded";
			e.soul = s.id;
			if (s.person) e.pid = s.person->id;
			host.emit(e);
			continue;
		}
		if (!claim(s, t)) kept.push_back(s);
	}
	list = std::move(kept);
}

void Souls::fell(double x, double y, const std::string &cls) {
	const double k = std::floor(y / S().cell) * 4096 + std::floor(x / S().cell);
	SoulCell *c = nullptr;
	for (auto &e : cells)
		if (e.first == k) {
			c = &e.second;
			break;
		}
	if (!c) {
		cells.push_back({ k, SoulCell{} });
		c = &cells.back().second;
	}
	c->n++;
	c->x += x;
	c->y += y;
	if (start_class(cls)) {
		auto it = std::find_if(c->by.begin(), c->by.end(), [&](const auto &e) { return e.first == cls; });
		if (it != c->by.end()) it->second = it->second + 1;
		else c->by.push_back({ cls, 1 });
	}
	if (c->n == S().field && double(fields.size()) < S().fields) {
		c->site = int(fixed.size() + fields.size());
		fields.push_back({ "battlefield", c->x / c->n, c->y / c->n });
	}
}

int Souls::spawn(double x, double y, const std::string &cls, double level, const std::string &site, double t) { return make(x, y, cls, level, site, t).id; }

bool Souls::spawn_named(const SoulPerson &person, double t, double life, const std::optional<std::pair<std::string, double>> &bar) {
	if (std::any_of(list.begin(), list.end(), [&](const Soul &s) { return s.person && s.person->id == person.id; })) return true;
	std::vector<std::pair<const SoulSite *, int>> shrines;
	for (size_t i = 0; i < fixed.size(); i++)
		if (fixed[i].kind == "shrine") shrines.push_back({ &fixed[i], int(i) });
	if (shrines.empty()) return false;
	const auto at = [&](int i) { return int(std::count_if(list.begin(), list.end(), [&](const Soul &s) { return s.at == i; })); };
	std::pair<const SoulSite *, int> a = shrines[0];
	for (size_t k = 1; k < shrines.size(); k++) a = at(shrines[k].second) < at(a.second) ? shrines[k] : a;
	const SoulSite site = *a.first;
	const int i = a.second, k = at(i);
	Soul &s = make(site.x + 1.5 * (k % 3), site.y + std::floor(k / 3) + (k ? 1 : 0), person.cls.value_or("militia"), person.level, "shrine", t, i);
	s.until = t + std::max(1.0, life);
	s.person = person;
	if (bar) (s.bar = bar->first), (s.barUntil = t + bar->second);
	return true;
}

const Soul *Souls::get(int id) const {
	for (const Soul &s : list)
		if (s.id == id) return &s;
	return nullptr;
}

std::vector<SoulSnap> Souls::snaps(double t) const {
	std::vector<SoulSnap> out;
	for (const Soul &s : list) {
		SoulSnap o;
		o.id = s.id;
		o.x = s.x;
		o.y = s.y;
		o.cls = s.cls;
		o.level = s.level;
		o.site = s.site;
		o.left = std::max(0.0, s.until - t);
		if (s.prog > 0) (o.claim = std::min(1.0, s.prog / S().channel)), (o.team = s.team);
		o.contested = s.contested;
		if (s.person) o.name = s.person->name;
		if (s.bar && t < s.barUntil.value_or(0)) o.bar = { *s.bar, *s.barUntil };
		out.push_back(o);
	}
	return out;
}

} // namespace sim

namespace godot {

static std::string u8(const Variant &v) { return String(v).utf8().get_data(); }
static String gs(const std::string &s) { return String::utf8(s.c_str()); }

static sim::SoulPerson person_from(const Dictionary &p) {
	sim::SoulPerson o;
	o.id = u8(p["id"]);
	const Dictionary h = p["hero"];
	o.name = u8(h["name"]);
	if (h.has("cls") && h["cls"].get_type() == Variant::STRING) o.cls = u8(h["cls"]);
	o.level = h["level"];
	return o;
}

static Dictionary site_to(const sim::SoulSite &s) {
	Dictionary d;
	d["kind"] = gs(s.kind);
	d["x"] = s.x;
	d["y"] = s.y;
	return d;
}

static Array rec(const char *name) {
	Array c;
	c.push_back(name);
	return c;
}

Ref<Souls> Souls::create(const Dictionary &meta, int64_t seed, bool chance_at) {
	Ref<Souls> r;
	r.instantiate();
	r->region = sim::soul_region(meta);
	Souls *self = r.ptr();
	sim::SoulHost h;
	h.men = [self]() -> const std::vector<sim::SoulMan> & { return self->men; };
	h.gate = [self](const std::string &owner, const std::string &cls) {
		const Array a = self->answers.pop_front();
		Array c = rec("gate");
		c.push_back(gs(owner));
		c.push_back(gs(cls));
		c.push_back(a[3]);
		self->calls.push_back(c);
		const Dictionary g = a[3];
		sim::SoulGate o;
		o.ok = g["ok"].booleanize();
		o.have = g["have"];
		if (g.has("why")) o.why = u8(g["why"]);
		return o;
	};
	h.join = [self](const sim::Soul &s, int squad) -> std::optional<sim::SoulJoin> {
		const Array a = self->answers.pop_front();
		Array c = rec("join");
		c.push_back(s.id);
		c.push_back(squad);
		c.push_back(a[3]);
		self->calls.push_back(c);
		if (a[3].get_type() != Variant::DICTIONARY) return std::nullopt;
		const Dictionary j = a[3], p = j["person"];
		self->persons[p["id"]] = p;
		return sim::SoulJoin{ int(j["unit"]), person_from(p) };
	};
	h.stop = [self](const std::string &owner, int soul) {
		Array c = rec("stop");
		c.push_back(gs(owner));
		c.push_back(soul);
		self->calls.push_back(c);
	};
	h.emit = [self](const sim::SoulEvent &e) {
		Dictionary d;
		d["t"] = e.t;
		d["kind"] = gs(e.kind);
		d["soul"] = e.soul;
		if (e.kind == "soulClaimed" || e.kind == "soulRefused") {
			d["squad"] = e.squad;
			d["owner"] = gs(e.owner);
		}
		if (e.kind == "soulClaimed") {
			d["unit"] = e.unit;
			d["person"] = self->persons[gs(e.person->id)];
		}
		if (e.kind == "soulRefused") {
			d["have"] = e.have;
			d["why"] = gs(e.why);
		}
		if (e.kind == "soulLost") d["team"] = e.team;
		if (e.pid) d["pid"] = gs(*e.pid);
		Array c = rec("emit");
		c.push_back(d);
		self->calls.push_back(c);
	};
	if (chance_at)
		h.chance_at = [self](double x, double y) {
			const Array a = self->answers.pop_front();
			Array c = rec("chanceAt");
			c.push_back(x);
			c.push_back(y);
			c.push_back(a[3]);
			self->calls.push_back(c);
			return double(a[3]);
		};
	r->s = std::make_unique<sim::Souls>(r->region, uint32_t(seed), std::move(h));
	return r;
}

void Souls::set_men(const Array &a) {
	men.clear();
	for (int64_t i = 0; i < a.size(); i++) {
		const Dictionary d = a[i];
		men.push_back({ d["x"], d["y"], int(d["team"]), int(d["squad"]), int(d["claim"]), u8(d["owner"]), d["civ"].booleanize() });
	}
}

Array Souls::take_calls() {
	Array c = calls;
	calls = Array();
	return c;
}

int Souls::spawn(double x, double y, const String &cls, double level, const String &site, double t) { return s->spawn(x, y, u8(cls), level, u8(site), t); }

bool Souls::spawn_named(const Dictionary &person, double t, double life, const Variant &bar) {
	persons[person["id"]] = person;
	std::optional<std::pair<std::string, double>> b;
	if (bar.get_type() == Variant::DICTIONARY) b = std::make_pair(u8(Dictionary(bar)["owner"]), double(Dictionary(bar)["ticks"]));
	return s->spawn_named(person_from(person), t, life, b);
}

Variant Souls::get(int id) const {
	const sim::Soul *v = s->get(id);
	if (!v) return Variant();
	Dictionary d;
	d["id"] = v->id;
	d["x"] = v->x;
	d["y"] = v->y;
	d["cls"] = gs(v->cls);
	d["level"] = v->level;
	d["site"] = gs(v->site);
	d["until"] = v->until;
	d["prog"] = v->prog;
	d["team"] = v->team;
	d["contested"] = v->contested;
	d["at"] = v->at;
	if (v->person) d["person"] = persons.get(gs(v->person->id), Variant());
	if (v->bar) d["bar"] = gs(*v->bar);
	if (v->barUntil) d["barUntil"] = *v->barUntil;
	return d;
}

Array Souls::snaps(double t) const {
	Array out;
	for (const sim::SoulSnap &v : s->snaps(t)) {
		Dictionary d;
		d["id"] = v.id;
		d["x"] = v.x;
		d["y"] = v.y;
		d["cls"] = gs(v.cls);
		d["level"] = v.level;
		d["site"] = gs(v.site);
		d["left"] = v.left;
		if (v.claim) (d["claim"] = *v.claim), (d["team"] = v.team);
		if (v.contested) d["contested"] = true;
		if (v.name) d["name"] = gs(*v.name);
		if (v.bar) {
			Dictionary b;
			b["owner"] = gs(v.bar->first);
			b["at"] = v.bar->second;
			d["bar"] = b;
		}
		out.push_back(d);
	}
	return out;
}

Array Souls::sites() const {
	Array out;
	for (const sim::SoulSite &x : s->sites()) out.push_back(site_to(x));
	return out;
}

Array Souls::soul_sites(const Dictionary &meta) {
	Array out;
	for (const sim::SoulSite &x : sim::soul_sites(sim::soul_region(meta))) out.push_back(site_to(x));
	return out;
}

void Souls::_bind_methods() {
	ClassDB::bind_static_method("Souls", D_METHOD("create", "meta", "seed", "chance_at"), &Souls::create);
	ClassDB::bind_method(D_METHOD("set_men", "men"), &Souls::set_men);
	ClassDB::bind_method(D_METHOD("set_answers", "answers"), &Souls::set_answers);
	ClassDB::bind_method(D_METHOD("take_calls"), &Souls::take_calls);
	ClassDB::bind_method(D_METHOD("tick", "t"), &Souls::tick);
	ClassDB::bind_method(D_METHOD("fell", "x", "y", "cls"), &Souls::fell);
	ClassDB::bind_method(D_METHOD("spawn", "x", "y", "cls", "level", "site", "t"), &Souls::spawn);
	ClassDB::bind_method(D_METHOD("spawn_named", "person", "t", "life", "bar"), &Souls::spawn_named);
	ClassDB::bind_method(D_METHOD("get", "id"), &Souls::get);
	ClassDB::bind_method(D_METHOD("snaps", "t"), &Souls::snaps);
	ClassDB::bind_method(D_METHOD("any"), &Souls::any);
	ClassDB::bind_method(D_METHOD("set_storm", "k"), &Souls::set_storm);
	ClassDB::bind_method(D_METHOD("sites"), &Souls::sites);
	ClassDB::bind_method(D_METHOD("load_root_of", "from"), &Souls::load_root_of);
	ClassDB::bind_static_method("Souls", D_METHOD("soul_sites", "meta"), &Souls::soul_sites);
	ClassDB::bind_static_method("Souls", D_METHOD("soul_level", "site", "depth"), &Souls::soul_level);
}

} // namespace godot
