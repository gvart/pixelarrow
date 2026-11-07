#include "encounters.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>

#include <godot_cpp/core/class_db.hpp>

#include "depth.h"
#include "js_math.h"
#include "rng.h"
#include "sim_data.h"
#include "vision.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::Variant;

static std::string utf8(const Variant &v) { return godot::String(v).utf8().get_data(); }
static godot::String gs(const std::string &s) { return godot::String::utf8(s.c_str()); }
static bool has(const Dictionary &d, const char *k) { return d.has(k) && d[k].get_type() != Variant::NIL; }
static bool is_num(const Variant &v) { return v.get_type() == Variant::INT || v.get_type() == Variant::FLOAT; }
static const EncConst &E() { return data().encounters.ENC; }

// A JS Number's `${n}` (Number::toString): the shortest round-trip digits, laid out as JS lays them out.
static std::string js_num(double v) {
	if (std::isnan(v)) return "NaN";
	if (std::isinf(v)) return v > 0 ? "Infinity" : "-Infinity";
	if (v == 0) return "0";
	char b[40];
	int p = 1;
	for (; p <= 17; p++) {
		std::snprintf(b, sizeof b, "%.*e", p - 1, v);
		if (std::strtod(b, nullptr) == v) break;
	}
	std::string s = b, sign;
	if (s[0] == '-') sign = "-", s = s.substr(1);
	const size_t e = s.find('e');
	const int exp = std::atoi(s.c_str() + e + 1);
	std::string digits;
	for (size_t i = 0; i < e; i++)
		if (s[i] != '.') digits += s[i];
	while (digits.size() > 1 && digits.back() == '0') digits.pop_back();
	const int k = int(digits.size()), n = exp + 1;
	if (k <= n && n <= 21) return sign + digits + std::string(n - k, '0');
	if (0 < n && n <= 21) return sign + digits.substr(0, n) + "." + digits.substr(n);
	if (-6 < n && n <= 0) return sign + "0." + std::string(-n, '0') + digits;
	const std::string m = k == 1 ? digits : digits.substr(0, 1) + "." + digits.substr(1);
	return sign + m + "e" + (n - 1 >= 0 ? "+" : "-") + std::to_string(std::abs(n - 1));
}

static double rrange(Mulberry &r, double lo, double hi) { return lo + (hi - lo) * r.next(); }
static double rint(Mulberry &r, double lo, double hi) { return lo + std::floor(r.next() * (hi - lo + 1)); }

static Mulberry rng_of(const std::string &key) {
	const uint32_t h = hash_string(gs(key));
	return Mulberry(h ? h : 1);
}
static double cool_of(Mulberry r) { return rint(r, E().cool[0], E().cool[1]); }

// ---------------------------------------------------------------- tables

static StoryReward reward_of(const Variant &v) { return reward_from(Dictionary(v)); }
static std::optional<std::string> ostr(const Dictionary &d, const char *k) {
	if (!has(d, k)) return std::nullopt;
	return utf8(d[k]);
}

EncounterDef encounter_from(const Dictionary &d) {
	EncounterDef e;
	e.id = utf8(d["id"]);
	e.title = utf8(d.get("title", ""));
	e.lore = utf8(d.get("lore", ""));
	e.end = utf8(d.get("end", ""));
	e.weight = d.get("weight", 0);
	if (has(d, "minDepth")) e.minDepth = double(d["minDepth"]);
	if (has(d, "needs")) e.needs = utf8(d["needs"]);
	for (const char *k : { "biomes", "beasts" }) {
		if (!has(d, k)) continue;
		const Array a = d[k];
		std::vector<std::string> v;
		for (int64_t i = 0; i < a.size(); i++) v.push_back(utf8(a[i]));
		(std::string(k) == "biomes" ? e.biomes : e.beasts) = v;
	}
	e.road = d.get("road", false).booleanize();
	if (has(d, "near")) {
		const Array a = d["near"];
		e.near = std::array<double, 2>{ double(a[0]), double(a[1]) };
	}
	const Array steps = d.get("steps", Array());
	for (int64_t i = 0; i < steps.size(); i++) {
		const Dictionary sd = steps[i];
		EncStep st;
		st.id = utf8(sd["id"]);
		st.goal = utf8(sd.get("goal", ""));
		st.text = utf8(sd.get("text", ""));
		st.label = utf8(sd.get("label", ""));
		if (has(sd, "reward")) st.reward = reward_of(sd["reward"]);
		st.next = ostr(sd, "next");
		st.unanswered = ostr(sd, "unanswered");
		st.takes = sd.get("takes", false).booleanize();
		const Dictionary t = sd["trigger"];
		const std::string kind = utf8(t["kind"]);
		EncTrigger &tr = st.trigger;
		tr.kind = kind == "clear" ? EncKind::Clear : kind == "track" ? EncKind::Track : kind == "rescue" ? EncKind::Rescue : kind == "choice" ? EncKind::Choice : kind == "guide" ? EncKind::Guide : EncKind::Reach;
		tr.at = ostr(t, "at");
		if (has(t, "r")) tr.r = double(t["r"]);
		if (has(t, "off")) tr.off = double(t["off"]);
		if (has(t, "mob")) tr.mob = utf8(t["mob"]);
		tr.count = t.get("count", 0);
		tr.marks = t.get("marks", 0);
		if (has(t, "cls")) tr.cls = utf8(t["cls"]);
		if (has(t, "name")) tr.name = utf8(t["name"]);
		tr.level = t.get("level", 0);
		const Array os = t.get("options", Array());
		for (int64_t j = 0; j < os.size(); j++) {
			const Dictionary od = os[j];
			EncOption o;
			o.id = utf8(od["id"]);
			o.label = utf8(od.get("label", ""));
			o.text = utf8(od.get("text", ""));
			if (has(od, "reward")) o.reward = reward_of(od["reward"]);
			if (has(od, "risk")) {
				const Dictionary r = od["risk"];
				o.risk = EncOption::Risk{ r["chance"], utf8(r.get("text", "")), utf8(r["next"]) };
			}
			o.next = ostr(od, "next");
			o.toll = od.get("toll", 0);
			tr.options.push_back(o);
		}
		e.steps.push_back(st);
	}
	return e;
}

void load_encounter_tables(const Dictionary &tables, EncTables &out) {
	if (tables.has("src/war/sim/encounters")) {
		const Dictionary c = Dictionary(tables["src/war/sim/encounters"])["ENC"];
		EncConst &e = out.ENC;
		const Array cool = c["cool"], far = c["far"];
		e.cool = { cool[0], cool[1] };
		e.far = { far[0], far[1] };
		e.fightR = c["fightR"];
		e.reach = c["reach"];
		e.near = c["near"];
		e.town = c["town"];
		e.lair = c["lair"];
		e.giver = c["giver"];
		e.mark = c["mark"];
		e.markR = c["markR"];
		e.biome = c["biome"];
		e.lapse = c["lapse"];
		e.leave = c["leave"];
		e.respawn = c["respawn"];
		e.saveEvery = c["saveEvery"];
	}
	if (tables.has("src/data/warEncounters")) {
		const Dictionary all = Dictionary(tables["src/data/warEncounters"])["ENCOUNTERS"];
		const Array ks = all.keys();
		for (int64_t i = 0; i < ks.size(); i++) out.defs.push_back(encounter_from(all[ks[i]]));
	}
}

// ---------------------------------------------------------------- pure helpers

std::string goods_words(const EncGoods &goods) {
	std::string s;
	for (size_t i = 0; i < goods.size(); i++) s += (i ? ", " : "") + js_num(js::round(goods[i].second)) + " " + goods[i].first;
	return s;
}

// Number(str) for the pid part of an owner: whitespace trimmed, "" is 0, else a decimal (or 0x/0o/0b) literal or NaN.
static double js_number(std::string s) {
	const char *ws = " \t\n\r\v\f";
	const size_t a = s.find_first_not_of(ws);
	if (a == std::string::npos) return 0;
	s = s.substr(a, s.find_last_not_of(ws) - a + 1);
	const double nan = std::numeric_limits<double>::quiet_NaN();
	if (s.size() > 2 && s[0] == '0' && std::string("xXoObB").find(s[1]) != std::string::npos) {
		const int base = (s[1] == 'x' || s[1] == 'X') ? 16 : (s[1] == 'o' || s[1] == 'O') ? 8 : 2;
		double v = 0;
		for (size_t i = 2; i < s.size(); i++) {
			const char c = char(std::tolower(s[i]));
			const int d = c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : 99;
			if (d >= base) return nan;
			v = v * base + d;
		}
		return v;
	}
	std::string body = s;
	if (body[0] == '+' || body[0] == '-') body = body.substr(1);
	if (body == "Infinity") return s[0] == '-' ? -std::numeric_limits<double>::infinity() : std::numeric_limits<double>::infinity();
	if (body.empty() || body.find_first_not_of("0123456789.eE+-") != std::string::npos) return nan;
	char *end = nullptr;
	const double v = std::strtod(s.c_str(), &end);
	return end && *end == 0 && end != s.c_str() ? v : nan;
}

std::optional<double> pid_of_unit(const EncSnap &s, int unit) {
	const EncSnap::Unit *u = nullptr;
	for (const EncSnap::Unit &x : s.units)
		if (x.id == unit) {
			u = &x;
			break;
		}
	if (!u) return std::nullopt;
	for (const EncSnap::Squad &q : s.squads)
		if (q.id == u->squad) {
			if (q.owner.rfind("p:", 0) == 0) return js_number(q.owner.substr(2));
			return std::nullopt;
		}
	return std::nullopt;
}

static const EncounterDef *def_in(const std::vector<EncounterDef> &defs, const std::string &id) {
	for (const EncounterDef &d : defs)
		if (d.id == id) return &d;
	return nullptr;
}

std::optional<std::string> away_line(const EncNote &n, const std::vector<EncounterDef> &defs) {
	const EncounterDef *d = def_in(defs, n.enc);
	const std::string title = d ? d->title : "On the road";
	if (n.kind == "start") return title + ": they stopped your men.";
	if (n.kind == "unanswered") return title + ": nobody answered, so they came on.";
	if (n.kind == "robbed") {
		const std::string what = goods_words(n.goods);
		return title + ": they beat your guards and carried off " + (what.empty() ? "nothing they could find" : what) + ".";
	}
	if (n.kind == "lapse") return title + ": it passed with nobody there.";
	if (n.kind == "step" && !n.option && n.step.find('#') == std::string::npos) return title + ": your men beat them off.";
	return std::nullopt;
}

EncSave new_enc_save(const std::string &region, const std::string &owner, double seed) {
	EncSave s;
	s.next = cool_of(rng_of("enc:" + region + ":" + owner + ":" + js_num(seed) + ":cool:0"));
	return s;
}

const EncStep *enc_step_of(const std::vector<EncounterDef> &defs, const EncSave *s) {
	if (!s || !s->open) return nullptr;
	const EncounterDef *d = def_in(defs, s->open->id);
	return d ? d->step(s->open->step) : nullptr;
}

std::vector<XY> enc_towns(const EncRegion &r) {
	std::vector<XY> t;
	for (const EncRegion::Rect &a : r.safe) t.push_back({ a.x + a.w / 2, a.y + a.h / 2 });
	for (const XY &c : r.claimPoints) t.push_back(c);
	if (!t.empty()) return t;
	for (const EncRegion::Rect &e : r.entries) t.push_back({ e.x + e.w / 2, e.y + e.h / 2 });
	return t;
}

std::vector<std::string> enc_hunters(const EncRegion &r) {
	std::vector<std::string> ks;
	for (const std::string &k : r.lairs)
		if (std::find(ks.begin(), ks.end(), k) == ks.end()) ks.push_back(k);
	ks.erase(std::remove_if(ks.begin(), ks.end(), [](const std::string &k) { return k == "bandit" || k == "ibex"; }), ks.end());
	return ks.empty() ? std::vector<std::string>{ "wolf" } : ks;
}

std::string enc_fauna(const EncRegion &r, double roll) {
	const auto ks = enc_hunters(r);
	return ks[size_t(std::fmod(roll, double(ks.size())))];
}

std::vector<std::string> enc_biomes(const EncRegion &r) {
	std::vector<std::pair<int, double>> n; // a Map: insertion order
	double all = 0;
	for (size_t i = 0; i + 1 < r.rle.size(); i += 2) {
		auto it = std::find_if(n.begin(), n.end(), [&](const auto &p) { return p.first == r.rle[i]; });
		if (it == n.end()) n.push_back({ r.rle[i], double(r.rle[i + 1]) });
		else it->second = it->second + r.rle[i + 1];
		all += r.rle[i + 1];
	}
	std::vector<std::string> out;
	for (const auto &[b, c] : n) {
		if (!(all > 0 && c / all >= E().biome)) continue;
		const std::string name = b >= 0 && size_t(b) < r.biome_names.size() ? r.biome_names[b] : "undefined";
		if (std::find(out.begin(), out.end(), name) == out.end()) out.push_back(name);
	}
	return out;
}

bool enc_fits(const EncounterDef &d, const EncRegion &r, double depth, const std::vector<std::string> &biomes) {
	if (!(depth >= (d.minDepth ? *d.minDepth : 1))) return false;
	if (d.biomes) {
		bool any = false;
		for (const std::string &b : *d.biomes) any = any || std::find(biomes.begin(), biomes.end(), b) != biomes.end();
		if (!any) return false;
	}
	if (d.beasts) {
		bool any = false;
		for (const std::string &l : r.lairs) any = any || std::find(d.beasts->begin(), d.beasts->end(), l) != d.beasts->end();
		if (!any) return false;
	}
	return true;
}

template <class T>
static const T *nearest(const std::vector<T> &xs, XY p) {
	const T *a = nullptr;
	for (const T &q : xs)
		if (!a || js::hypot(q.x - p.x, q.y - p.y) < js::hypot(a->x - p.x, a->y - p.y)) a = &q;
	return a;
}

// ---------------------------------------------------------------- the runner

EncounterRun::EncounterRun(const EncRegion &region, const std::vector<EncounterDef> &defs, const std::optional<EncSave> &sv, EncMe me_, EncHost host_, const Story *story) :
		region(region), defs(defs), me(std::move(me_)), host(std::move(host_)) {
	depth = region.depth;
	save = sv ? *sv : new_enc_save(region.base.id, owner(), me.seed ? *me.seed : 1);
	towns = enc_towns(region);
	if (story) giver = story_spots(region.base, *story).giver;
	const auto bs = enc_biomes(region);
	for (const EncounterDef &d : defs)
		if (enc_fits(d, region, depth, bs)) fits.insert(d.id);
}

const EncounterDef *EncounterRun::def() const { return save.open ? def_in(defs, save.open->id) : nullptr; }

std::string EncounterRun::key(const std::vector<std::string> &k) const {
	std::string s = "enc:" + region.base.id + ":" + owner() + ":" + js_num(me.seed ? *me.seed : 1) + ":";
	for (size_t i = 0; i < k.size(); i++) s += (i ? ":" : "") + k[i];
	return s;
}

std::vector<const EncSnap::Unit *> EncounterRun::men(const EncSnap &s) const {
	std::set<int> own; // membership only
	for (const EncSnap::Squad &q : s.squads)
		if (q.team == me.team && (!me.online() || q.owner == *me.owner)) own.insert(q.id);
	std::vector<const EncSnap::Unit *> out;
	for (const EncSnap::Unit &u : s.units)
		if (own.count(u.squad) && u.state != "dead" && u.cls.rfind("civ_", 0) != 0) out.push_back(&u);
	return out;
}

XY EncounterRun::centre(const std::vector<const EncSnap::Unit *> &men, XY orr) const {
	if (men.empty()) return orr;
	double sx = 0, sy = 0;
	for (const auto *u : men) sx = sx + u->x;
	for (const auto *u : men) sy = sy + u->y;
	return { sx / men.size(), sy / men.size() };
}

bool EncounterRun::in_fight(const EncSnap &s, const std::vector<const EncSnap::Unit *> &men) const {
	for (const auto *u : men)
		if (u->state == "attack") return true;
	struct C {
		int squad;
		double x, y, n;
	};
	std::vector<C> by; // a Map: insertion order
	for (const auto *u : men) {
		auto it = std::find_if(by.begin(), by.end(), [&](const C &c) { return c.squad == u->squad; });
		if (it == by.end()) by.push_back({ u->squad, 0, 0, 0 }), it = by.end() - 1;
		it->x = it->x + u->x, it->y = it->y + u->y, it->n++;
	}
	std::vector<XY> cs;
	for (const C &c : by) cs.push_back({ c.x / c.n, c.y / c.n });
	const double r2 = E().fightR * E().fightR;
	for (const EncSnap::Unit &u : s.units) {
		if (u.state == "dead" || u.cls.rfind("civ_", 0) == 0) continue;
		std::optional<int> t; // new Map(squads): the last of an id wins
		for (const EncSnap::Squad &q : s.squads)
			if (q.id == u.squad) t = q.team;
		if (!t || *t == me.team || *t == NEUTRAL_TEAM) continue;
		for (const XY &c : cs)
			if (js::pow(u.x - c.x, 2) + js::pow(u.y - c.y, 2) <= r2) return true;
	}
	return false;
}

std::vector<const EncounterDef *> EncounterRun::choices(const EncSnap &s) const {
	std::vector<const EncounterDef *> out;
	bool lairUp = false;
	for (const EncSnap::Lair &l : s.lairs) lairUp = lairUp || l.state != "cleared";
	for (const EncounterDef &d : defs)
		if (fits.count(d.id) && !d.road && (!save.last || d.id != *save.last || defs.size() < 2) && (d.needs != "story" || giver) && (d.needs != "lair" || lairUp) && (d.needs != "town" || !towns.empty()))
			out.push_back(&d);
	return out;
}

XY EncounterRun::target(const EncSnap &s, const EncStep &st, XY at) {
	const EncTrigger &t = st.trigger;
	const std::string w = t.kind == EncKind::Reach ? (t.at ? *t.at : "here") : "here";
	if (w == "town") {
		const XY *n = nearest(towns, at);
		return n ? *n : at;
	}
	if (w == "giver") return giver ? *giver : at;
	if (w == "lair") {
		std::vector<EncSnap::Lair> ls;
		for (const EncSnap::Lair &x : s.lairs)
			if (x.state != "cleared" && js::hypot(x.x - at.x, x.y - at.y) > 2) ls.push_back(x);
		const EncSnap::Lair *l = nearest(ls, at);
		return l ? XY{ l->x, l->y } : at;
	}
	if (t.kind == EncKind::Reach && t.off && *t.off) return offset(at, *t.off, key({ js_num(save.n), st.id, "off" }));
	if (t.kind == EncKind::Track) return offset(at, t.off ? *t.off : E().mark, key({ js_num(save.n), st.id, "mark", "0" }));
	return at;
}

XY EncounterRun::offset(XY at, double d, const std::string &k) const {
	Mulberry r = rng_of(k);
	const double a = rrange(r, 0, M_PI * 2);
	const double w = region.base.w, h = region.base.h;
	return snap_open(region.base, { std::max(2.0, std::min(w - 3, at.x + js::cos(a) * d)), std::max(2.0, std::min(h - 3, at.y + js::sin(a) * d)) });
}

void EncounterRun::open(const EncSnap &s, const EncStep &st) {
	EncOpen &o = *save.open;
	const XY p = target(s, st, { o.x, o.y });
	o.step = st.id;
	o.tx = p.x;
	o.ty = p.y;
	o.since = s.tick;
	o.with = false;
	o.n = std::nullopt;
	seen = false;
	asked = -std::numeric_limits<double>::infinity();
	souls.clear();
}

std::vector<EncNote> EncounterRun::fire(const EncSnap &s, const EncounterDef &def, const std::optional<XY> &from) {
	const auto ms = men(s);
	std::vector<EncNote> notes;
	if (ms.empty() && !from) return notes;
	Mulberry r = rng_of(key({ js_num(save.n), "where" }));
	XY c;
	if (from) c = *from;
	else {
		const EncSnap::Unit *lead = ms[0];
		for (const auto *m : ms)
			if (m->state == "move") {
				lead = m;
				break;
			}
		std::vector<const EncSnap::Unit *> sq;
		for (const auto *u : ms)
			if (u->squad == lead->squad) sq.push_back(u);
		c = centre(sq, { 0, 0 });
	}
	// a spot round him, away from the map's edge (a few tries, then the last)
	const double d0 = def.near ? (*def.near)[0] : E().far[0], d1 = def.near ? (*def.near)[1] : E().far[1], M = 8;
	const double w = region.base.w, h = region.base.h;
	double x = c.x, y = c.y;
	for (int k = 0; k < 8; k++) {
		const double a = rrange(r, 0, M_PI * 2), d = rrange(r, d0, d1);
		x = c.x + js::cos(a) * d, y = c.y + js::sin(a) * d;
		if (x >= M && y >= M && x < w - M && y < h - M) break;
	}
	const XY p = snap_open(region.base, { std::max(2.0, std::min(w - 3, x)), std::max(2.0, std::min(h - 3, y)) });
	EncOpen o;
	o.id = def.id;
	o.step = def.steps[0].id;
	o.x = p.x, o.y = p.y, o.tx = p.x, o.ty = p.y, o.since = s.tick;
	save.open = o;
	save.last = def.id;
	save.n++;
	if (!def.road) { // W-197: robbers on the road are no part of the walking roll's clock
		save.travel = 0;
		save.next = cool_of(rng_of(key({ "cool", js_num(save.n) })));
	}
	open(s, def.steps[0]);
	EncNote n;
	n.kind = "start";
	n.enc = def.id;
	notes.push_back(n);
	return notes;
}

std::optional<Item> EncounterRun::item(const std::string &step, const std::optional<StoryReward> &rw) const {
	if (!rw || !rw->item) return std::nullopt;
	const std::string k = key({ js_num(save.n), step });
	Mulberry r = rng_of(k);
	IdSource ids;
	Item it = make_item(r, ids, rw->item->def, rw->item->rarity);
	it.uid = k;
	return it;
}

void EncounterRun::pay(const EncSnap &s, const std::string &step, const std::optional<StoryReward> &rw) {
	if (!rw || !(rw->goods || rw->item || rw->soul)) return;
	const EncOpen &o = *save.open;
	host.give(*rw, centre(men(s), { o.x, o.y }), item(step, rw));
}

void EncounterRun::advance(const EncSnap &s, const EncounterDef &def, const EncStep &st, const std::optional<std::string> &next, std::vector<EncNote> &notes) {
	const EncStep *to = nullptr;
	if (next && *next == "end") to = nullptr;
	else if (next && !next->empty()) to = def.step(*next);
	else {
		const size_t i = size_t(&st - def.steps.data()) + 1;
		to = i < def.steps.size() ? &def.steps[i] : nullptr;
	}
	if (to) return open(s, *to);
	save.open = std::nullopt;
	EncNote n;
	n.kind = "end";
	n.enc = def.id;
	notes.push_back(n);
}

void EncounterRun::ensure(const EncSnap &s, const EncStep &st) {
	const EncTrigger &t = st.trigger;
	const EncOpen &o = *save.open;
	if (t.kind == EncKind::Rescue) {
		bool any = false;
		for (const EncSnap::Soul &x : s.souls)
			if (js::hypot(x.x - o.tx, x.y - o.ty) < STORY_R.soul) souls.insert(x.id), any = true;
		if (any || s.tick - asked < E().respawn) return;
		asked = s.tick;
		return host.spawn_soul(o.tx, o.ty, t.cls, t.level);
	}
	if (t.kind != EncKind::Clear) return;
	for (const EncSnap::Lair &l : s.lairs)
		if (js::hypot(l.x - o.tx, l.y - o.ty) < 0.5 && l.state != "cleared") return void(seen = true);
	if (seen || s.tick - asked < E().respawn) return;
	asked = s.tick;
	std::string kind = t.mob;
	if (t.mob == "fauna") {
		Mulberry r = rng_of(key({ js_num(save.n), st.id, "fauna" }));
		kind = enc_fauna(region, rint(r, 0, 999));
	}
	host.add_lair({ kind, o.tx, o.ty, t.count + std::floor(depth / 2) });
}

std::vector<EncNote> EncounterRun::tick(const EncSnap &s, const std::vector<StoryEvent> &evs) {
	std::vector<EncNote> notes;
	const auto ms = men(s);
	if (save.open) {
		EncOpen &o = *save.open;
		const EncounterDef *def = def_in(defs, o.id);
		const EncStep *st = step();
		if (!def || !st) return save.open = std::nullopt, notes;
		if (s.tick < o.since) o.since = s.tick; // a sim started afresh (a reload): the step's clock with it
		ensure(s, *st);
		auto at = [&](XY p, double r) {
			for (const auto *u : ms)
				if (js::hypot(u->x - p.x, u->y - p.y) < r) return true;
			return false;
		};
		const EncTrigger &t = st->trigger;
		bool done = false;
		auto note = [&](const std::string &kind, const std::string &step) {
			EncNote n;
			n.kind = kind;
			n.enc = def->id;
			n.step = step;
			return n;
		};
		// W-219: robbers who win do what robbers do. Nobody has to stand there: they have the field and walk to the load.
		if (st->takes && t.kind == EncKind::Clear && seen && host.rob) {
			bool up = false;
			for (const auto *u : ms) up = up || (!u->down && !u->wounded);
			if (!up) {
				const EncSnap::Lair *band = nullptr;
				for (const EncSnap::Lair &l : s.lairs)
					if (js::hypot(l.x - o.tx, l.y - o.ty) < 0.5 && l.state != "cleared" && l.alive > 0) {
						band = &l;
						break;
					}
				if (band) {
					const EncGoods goods = host.rob({ band->squad, band->x, band->y, band->alive });
					save.open = std::nullopt;
					EncNote n = note("robbed", "");
					n.goods = goods;
					notes.push_back(n);
					return notes;
				}
			}
		}
		if (t.kind == EncKind::Reach) {
			const std::string w = t.at ? *t.at : "";
			done = at({ o.tx, o.ty }, t.r ? *t.r : (w == "town" ? E().town : w == "lair" ? E().lair : w == "giver" ? E().giver : E().reach));
		} else if (t.kind == EncKind::Clear) {
			bool any = false, all = true;
			for (const EncSnap::Lair &l : s.lairs)
				if (js::hypot(l.x - o.tx, l.y - o.ty) < 0.5) any = true, all = all && l.state == "cleared";
			done = seen && any && all && at({ o.tx, o.ty }, E().near);
		} else if (t.kind == EncKind::Guide) {
			if (!o.with && at({ o.x, o.y }, E().reach)) {
				const XY *n = nearest(towns, { o.x, o.y });
				const XY town = n ? *n : XY{ o.x, o.y };
				o.with = true;
				o.tx = town.x;
				o.ty = town.y;
				o.since = s.tick;
				notes.push_back(note("step", st->id + "#1"));
			}
			done = o.with && at({ o.tx, o.ty }, E().town);
		} else if (t.kind == EncKind::Track) {
			// each mark reached shows the next, rolled on from it; the last is where the trail ends (the spot moves there)
			while (!done && at({ o.tx, o.ty }, E().markR)) {
				o.n = (o.n ? *o.n : 0) + 1;
				notes.push_back(note("step", st->id + "#" + js_num(*o.n)));
				if (*o.n >= t.marks) {
					o.x = o.tx;
					o.y = o.ty;
					done = true;
				} else {
					const XY p = offset({ o.tx, o.ty }, t.off ? *t.off : E().mark, key({ js_num(save.n), st->id, "mark", js_num(*o.n) }));
					o.tx = p.x;
					o.ty = p.y;
					o.since = s.tick;
				}
			}
		} else if (t.kind == EncKind::Rescue) {
			StorySnap ss;
			for (const EncSnap::Squad &q : s.squads) ss.squads.push_back({ q.id, q.team, q.owner });
			StoryMe sm;
			sm.team = me.team;
			sm.owner = me.owner;
			done = rescued(ss, evs, souls, sm);
		}
		if (done) {
			pay(s, st->id, st->reward);
			EncNote n = note("step", st->id);
			n.reward = st->reward;
			notes.push_back(n);
			advance(s, *def, *st, st->next, notes);
			return notes;
		}
		// the moment passes: too long, or his men gone far (a guide is followed: only the clock)
		bool far = ms.empty();
		if (!far && !o.with) {
			bool any = false;
			for (const auto *u : ms) any = any || (js::hypot(u->x - o.tx, u->y - o.ty) < E().leave && js::hypot(u->x - o.x, u->y - o.y) < E().leave);
			far = !any;
		}
		if (st->unanswered && !far && s.tick - o.since > E().lapse) {
			notes.push_back(note("unanswered", ""));
			advance(s, *def, *st, st->unanswered, notes);
			return notes;
		}
		if (s.tick - o.since > E().lapse * (t.kind == EncKind::Guide ? 3 : 1) || far) {
			save.open = std::nullopt;
			notes.push_back(note("lapse", ""));
		}
		return notes;
	}
	bool moving = false;
	for (const auto *u : ms) moving = moving || u->state == "move";
	if (depth < 1 || ms.empty() || !moving || in_fight(s, ms)) return notes;
	save.travel++;
	if (std::fmod(save.travel, E().saveEvery) == 0) due = true;
	if (save.travel < save.next) return notes;
	const auto ks = choices(s);
	if (ks.empty()) return notes;
	Mulberry r = rng_of(key({ js_num(save.n), "kind" }));
	double sum = 0;
	for (const EncounterDef *d : ks) sum = sum + d->weight;
	double x = rrange(r, 0, sum);
	const EncounterDef *def = ks.back();
	for (const EncounterDef *d : ks)
		if ((x -= d->weight) < 0) {
			def = d;
			break;
		}
	return fire(s, *def, std::nullopt);
}

std::optional<std::vector<EncNote>> EncounterRun::choose(const EncSnap &s, const std::string &option) {
	const EncounterDef *d = def();
	const EncStep *st = step();
	if (!d || !st || st->trigger.kind != EncKind::Choice) return std::nullopt;
	const EncOption *opt = nullptr;
	for (const EncOption &x : st->trigger.options)
		if (x.id == option) {
			opt = &x;
			break;
		}
	if (!opt) return std::nullopt;
	std::vector<EncNote> notes;
	EncNote n;
	n.kind = "step";
	n.enc = d->id;
	n.step = st->id;
	n.option = opt->id;
	if (opt->risk) {
		Mulberry r = rng_of(key({ js_num(save.n), st->id, opt->id, "risk" }));
		if (r.next() < opt->risk->chance) {
			n.risk = true;
			notes.push_back(n);
			advance(s, *d, *st, opt->risk->next, notes);
			return notes;
		}
	}
	if (opt->toll && host.toll) host.toll(opt->toll);
	pay(s, st->id + ":" + opt->id, opt->reward);
	n.reward = opt->reward;
	notes.push_back(n);
	advance(s, *d, *st, opt->next ? opt->next : std::optional<std::string>("end"), notes);
	return notes;
}

// ---------------------------------------------------------------- dictionaries

EncRegion encounter_region(const Dictionary &meta, const Grid &grid) {
	EncRegion r;
	r.base.id = utf8(meta["id"]);
	r.base.w = grid.w;
	r.base.h = grid.h;
	r.base.cost = grid.cost;
	r.base.npc = npc_spot(meta);
	DepthRegion dr;
	dr.id = r.base.id;
	dr.has_depth = has(meta, "depth");
	if (dr.has_depth) dr.depth = meta["depth"];
	r.depth = depth_of(dr);
	auto rects = [&](const char *k, std::vector<EncRegion::Rect> &out) {
		const Array a = meta.get(k, Array());
		for (int64_t i = 0; i < a.size(); i++) {
			const Dictionary d = a[i];
			out.push_back({ d["x"], d["y"], d["w"], d["h"] });
		}
	};
	rects("safe", r.safe);
	rects("entries", r.entries);
	const Array cps = meta.get("claimPoints", Array()), ls = meta.get("lairs", Array());
	for (int64_t i = 0; i < cps.size(); i++) {
		const Dictionary c = cps[i];
		r.claimPoints.push_back({ c["x"], c["y"] });
	}
	for (int64_t i = 0; i < ls.size(); i++) r.lairs.push_back(utf8(Dictionary(ls[i])["kind"]));
	if (has(meta, "biomes")) {
		r.has_biomes = true;
		const Dictionary b = meta["biomes"];
		const Array rle = b.get("rle", Array()), names = b.get("names", Array());
		for (int64_t i = 0; i < rle.size(); i++) r.rle.push_back(int(rle[i]));
		for (int64_t i = 0; i < names.size(); i++) r.biome_names.push_back(utf8(names[i]));
	}
	return r;
}

std::optional<EncSave> enc_save_from(const std::vector<EncounterDef> &defs, const Variant &v) {
	if (v.get_type() != Variant::DICTIONARY) return std::nullopt;
	const Dictionary d = v;
	const Variant vv = d.get("v", Variant()), n = d.get("n", Variant()), travel = d.get("travel", Variant()), next = d.get("next", Variant());
	if (!is_num(vv) || double(vv) != 1 || !is_num(n) || !is_num(travel) || !is_num(next)) return std::nullopt;
	const Variant ov = d.get("open", Variant());
	if (!d.has("open")) return std::nullopt; // TS reads `.open.id` of undefined and throws (reported)
	EncSave s;
	s.n = n;
	s.travel = travel;
	s.next = next;
	if (ov.get_type() != Variant::NIL) {
		if (ov.get_type() != Variant::DICTIONARY) return std::nullopt;
		const Dictionary o = ov;
		const EncounterDef *def = def_in(defs, utf8(o.get("id", "")));
		if (!def || !def->step(utf8(o.get("step", "")))) return std::nullopt;
		EncOpen e;
		e.id = utf8(o["id"]);
		e.step = utf8(o["step"]);
		e.x = o.get("x", 0);
		e.y = o.get("y", 0);
		e.tx = o.get("tx", 0);
		e.ty = o.get("ty", 0);
		e.since = o.get("since", 0);
		e.with = o.get("with", false).booleanize();
		if (has(o, "n")) e.n = double(o["n"]);
		s.open = e;
	}
	if (has(d, "last")) s.last = utf8(d["last"]);
	if (has(d, "away")) {
		const Array a = d["away"];
		std::vector<std::string> w;
		for (int64_t i = 0; i < a.size(); i++) w.push_back(utf8(a[i]));
		s.away = w;
	}
	return s;
}

Dictionary enc_save_to_dict(const EncSave &s) {
	Dictionary d;
	d["v"] = s.v;
	d["n"] = s.n;
	d["travel"] = s.travel;
	d["next"] = s.next;
	if (s.open) {
		const EncOpen &o = *s.open;
		Dictionary od;
		od["id"] = gs(o.id);
		od["step"] = gs(o.step);
		od["x"] = o.x;
		od["y"] = o.y;
		od["tx"] = o.tx;
		od["ty"] = o.ty;
		od["since"] = o.since;
		if (o.with) od["with"] = true;
		if (o.n) od["n"] = *o.n;
		d["open"] = od;
	} else d["open"] = Variant();
	if (s.last) d["last"] = gs(*s.last); // set as the first one opens: after `open` (newEncSave has none)
	if (s.away) {
		Array a;
		for (const std::string &x : *s.away) a.push_back(gs(x));
		d["away"] = a;
	}
	return d;
}

} // namespace sim

namespace godot {

static std::string u8(const Variant &v) { return String(v).utf8().get_data(); }

static Dictionary xy(sim::XY p) {
	Dictionary d;
	d["x"] = p.x;
	d["y"] = p.y;
	return d;
}

static sim::EncGoods goods_from(const Dictionary &g) {
	sim::EncGoods out;
	const Array ks = g.keys();
	for (int64_t i = 0; i < ks.size(); i++) out.push_back({ u8(ks[i]), double(g[ks[i]]) });
	return out;
}
static Dictionary goods_to(const sim::EncGoods &g) {
	Dictionary d;
	for (const auto &[k, v] : g) d[String::utf8(k.c_str())] = v;
	return d;
}

static sim::EncSnap snap_from(const Dictionary &d) {
	sim::EncSnap s;
	s.tick = d.get("tick", 0);
	const Array qs = d.get("squads", Array()), us = d.get("units", Array()), ls = d.get("lairs", Array()), ss = d.get("souls", Array());
	for (int64_t i = 0; i < qs.size(); i++) {
		const Dictionary q = qs[i];
		s.squads.push_back({ int(q["id"]), int(q.get("team", 0)), u8(q.get("owner", "")) });
	}
	for (int64_t i = 0; i < us.size(); i++) {
		const Dictionary u = us[i];
		sim::EncSnap::Unit o;
		o.id = int(u["id"]);
		o.squad = int(u["squad"]);
		o.x = u.get("x", 0);
		o.y = u.get("y", 0);
		o.cls = u8(u.get("cls", ""));
		o.state = u8(u.get("state", ""));
		o.down = u.get("down", false).booleanize();
		o.wounded = u.get("wounded", false).booleanize();
		s.units.push_back(o);
	}
	for (int64_t i = 0; i < ls.size(); i++) {
		const Dictionary l = ls[i];
		s.lairs.push_back({ int(l.get("id", 0)), u8(l.get("kind", "")), l["x"], l["y"], int(l.get("squad", 0)), l.get("alive", 0), u8(l["state"]) });
	}
	for (int64_t i = 0; i < ss.size(); i++) {
		const Dictionary x = ss[i];
		s.souls.push_back({ int(x["id"]), x["x"], x["y"] });
	}
	return s;
}

static std::vector<sim::StoryEvent> events_from(const Array &a) {
	std::vector<sim::StoryEvent> out;
	for (int64_t i = 0; i < a.size(); i++) {
		const Dictionary e = a[i];
		sim::StoryEvent v;
		v.kind = u8(e["kind"]);
		v.soul = int(e.get("soul", 0));
		v.squad = int(e.get("squad", 0));
		if (e.has("owner") && e["owner"].get_type() == Variant::STRING) v.owner = u8(e["owner"]);
		out.push_back(v);
	}
	return out;
}

static Dictionary note_to(const sim::EncNote &n) {
	Dictionary d;
	d["kind"] = String(n.kind.c_str());
	d["enc"] = String::utf8(n.enc.c_str());
	if (n.kind == "step") d["step"] = String::utf8(n.step.c_str());
	if (n.option) d["option"] = String::utf8(n.option->c_str());
	if (n.risk) d["risk"] = true;
	if (n.reward) d["reward"] = sim::reward_to_dict(*n.reward);
	if (n.kind == "robbed") d["goods"] = goods_to(n.goods);
	return d;
}
static Array notes_to(const std::vector<sim::EncNote> &ns) {
	Array out;
	for (const sim::EncNote &n : ns) out.push_back(note_to(n));
	return out;
}
static sim::EncNote note_from(const Dictionary &d) {
	sim::EncNote n;
	n.kind = u8(d["kind"]);
	n.enc = u8(d.get("enc", ""));
	n.step = u8(d.get("step", ""));
	if (d.has("option")) n.option = u8(d["option"]);
	n.risk = d.get("risk", false).booleanize();
	if (d.has("goods")) n.goods = goods_from(d["goods"]);
	return n;
}

Ref<EncounterRun> EncounterRun::create(const Dictionary &meta, const Ref<Grid> &grid, const Variant &save, const Dictionary &me, const Variant &story, const Dictionary &host) {
	Ref<EncounterRun> r;
	r.instantiate();
	r->region = sim::encounter_region(meta, grid->g);
	if (story.get_type() == Variant::DICTIONARY) r->story = sim::story_from(story);
	sim::EncMe m;
	m.team = int(me["team"]);
	if (me.has("owner") && me["owner"].get_type() == Variant::STRING) m.owner = u8(me["owner"]);
	if (me.has("seed") && me["seed"].get_type() != Variant::NIL) m.seed = double(me["seed"]);
	EncounterRun *self = r.ptr();
	sim::EncHost h;
	h.add_lair = [self](const sim::EncLairAsk &d) {
		Dictionary o;
		o["kind"] = String(d.kind.c_str());
		o["x"] = d.x;
		o["y"] = d.y;
		o["count"] = d.count;
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
		c.push_back(String(cls.c_str()));
		c.push_back(level);
		self->calls.push_back(c);
	};
	h.give = [self](const sim::StoryReward &rw, sim::XY at, const std::optional<sim::Item> &item) {
		Array c;
		c.push_back("give");
		c.push_back(sim::reward_to_dict(rw));
		c.push_back(xy(at));
		c.push_back(item ? Variant(sim::item_to_dict(*item)) : Variant());
		self->calls.push_back(c);
	};
	if (host.get("toll", false).booleanize())
		h.toll = [self](double share) {
			Array c;
			c.push_back("toll");
			c.push_back(share);
			self->calls.push_back(c);
		};
	if (host.get("rob", false).booleanize())
		h.rob = [self](const sim::EncBand &b) {
			Dictionary o;
			o["squad"] = b.squad;
			o["x"] = b.x;
			o["y"] = b.y;
			o["alive"] = b.alive;
			Array c;
			c.push_back("rob");
			c.push_back(o);
			self->calls.push_back(c);
			return self->rob_answer;
		};
	const auto &defs = sim::data().encounters.defs;
	const auto sv = sim::enc_save_from(defs, save);
	r->run = std::make_unique<sim::EncounterRun>(r->region, defs, sv, std::move(m), std::move(h), r->story ? &*r->story : nullptr);
	return r;
}

Array EncounterRun::tick(const Dictionary &snap, const Array &events) { return notes_to(run->tick(snap_from(snap), events_from(events))); }

Array EncounterRun::travel(const Dictionary &snap, int n) {
	sim::EncSnap s = snap_from(snap);
	const double base = s.tick;
	std::vector<sim::EncNote> notes;
	int i = 0;
	for (; i < n && notes.empty(); i++) {
		s.tick = base + i;
		const auto got = run->tick(s, {});
		notes.insert(notes.end(), got.begin(), got.end());
	}
	Array out;
	out.push_back(notes_to(notes));
	out.push_back(i);
	return out;
}

Array EncounterRun::fire(const Dictionary &snap, const String &def, const Variant &from) {
	std::optional<sim::XY> f;
	if (from.get_type() == Variant::DICTIONARY) f = sim::XY{ Dictionary(from)["x"], Dictionary(from)["y"] };
	const sim::EncounterDef *d = sim::data().encounters.def(u8(def));
	if (!d) return Array();
	return notes_to(run->fire(snap_from(snap), *d, f));
}

Variant EncounterRun::choose(const Dictionary &snap, const String &option) {
	const auto n = run->choose(snap_from(snap), u8(option));
	return n ? Variant(notes_to(*n)) : Variant();
}

void EncounterRun::set_rob(const Dictionary &goods) { rob_answer = goods_from(goods); }

Dictionary EncounterRun::get_save() const { return sim::enc_save_to_dict(run->save); }

Variant EncounterRun::step() const {
	const sim::EncStep *st = run->step();
	return st ? Variant(String::utf8(st->id.c_str())) : Variant();
}

bool EncounterRun::take_due() {
	const bool d = run->due;
	run->due = false;
	return d;
}

Array EncounterRun::take_calls() {
	Array c = calls;
	calls = Array();
	return c;
}

static Array strs(const std::vector<std::string> &v) {
	Array a;
	for (const std::string &s : v) a.push_back(String::utf8(s.c_str()));
	return a;
}

Dictionary EncounterRun::region_info(const Dictionary &meta, const Ref<Grid> &grid) {
	const sim::EncRegion r = sim::encounter_region(meta, grid->g);
	const auto &defs = sim::data().encounters.defs;
	const auto bs = sim::enc_biomes(r);
	Dictionary d;
	d["depth"] = r.depth;
	Array towns;
	for (const sim::XY &t : sim::enc_towns(r)) towns.push_back(xy(t));
	d["towns"] = towns;
	d["hunters"] = strs(sim::enc_hunters(r));
	d["biomes"] = strs(bs);
	auto fits = [&](double depth) {
		std::vector<std::string> ids;
		for (const sim::EncounterDef &e : defs)
			if (sim::enc_fits(e, r, depth, bs)) ids.push_back(e.id);
		return strs(ids);
	};
	d["fits"] = fits(r.depth);
	Array at;
	for (int k = 0; k <= 4; k++) at.push_back(fits(k));
	d["fitsAt"] = at;
	Array fauna;
	for (double k : { 0.0, 1.0, 2.0, 5.0, 17.0, 998.0 }) {
		Array p;
		p.push_back(k);
		p.push_back(String(sim::enc_fauna(r, k).c_str()));
		fauna.push_back(p);
	}
	d["fauna"] = fauna;
	return d;
}

Array EncounterRun::save_check(const Variant &save) {
	const auto &defs = sim::data().encounters.defs;
	const auto sv = sim::enc_save_from(defs, save);
	Array out;
	out.push_back(sv.has_value());
	const sim::EncStep *st = sv ? sim::enc_step_of(defs, &*sv) : nullptr;
	out.push_back(st ? Variant(String::utf8(st->id.c_str())) : Variant());
	return out;
}

Variant EncounterRun::away_line(const Dictionary &note) {
	const auto s = sim::away_line(note_from(note), sim::data().encounters.defs);
	return s ? Variant(String::utf8(s->c_str())) : Variant();
}

String EncounterRun::goods_words(const Dictionary &goods) { return String::utf8(sim::goods_words(goods_from(goods)).c_str()); }

Variant EncounterRun::pid_of_unit(const Dictionary &snap, int unit) {
	const auto p = sim::pid_of_unit(snap_from(snap), unit);
	return p ? Variant(*p) : Variant();
}

Dictionary EncounterRun::enc() {
	const sim::EncConst &e = sim::data().encounters.ENC;
	Dictionary d;
	Array cool, far;
	cool.push_back(e.cool[0]);
	cool.push_back(e.cool[1]);
	far.push_back(e.far[0]);
	far.push_back(e.far[1]);
	d["cool"] = cool;
	d["fightR"] = e.fightR;
	d["far"] = far;
	d["reach"] = e.reach;
	d["near"] = e.near;
	d["town"] = e.town;
	d["lair"] = e.lair;
	d["giver"] = e.giver;
	d["mark"] = e.mark;
	d["markR"] = e.markR;
	d["biome"] = e.biome;
	d["lapse"] = e.lapse;
	d["leave"] = e.leave;
	d["respawn"] = e.respawn;
	d["saveEvery"] = e.saveEvery;
	return d;
}

void EncounterRun::_bind_methods() {
	ClassDB::bind_static_method("EncounterRun", D_METHOD("create", "meta", "grid", "save", "me", "story", "host"), &EncounterRun::create);
	ClassDB::bind_method(D_METHOD("tick", "snap", "events"), &EncounterRun::tick);
	ClassDB::bind_method(D_METHOD("travel", "snap", "n"), &EncounterRun::travel);
	ClassDB::bind_method(D_METHOD("fire", "snap", "def", "from"), &EncounterRun::fire);
	ClassDB::bind_method(D_METHOD("choose", "snap", "option"), &EncounterRun::choose);
	ClassDB::bind_method(D_METHOD("set_rob", "goods"), &EncounterRun::set_rob);
	ClassDB::bind_method(D_METHOD("get_save"), &EncounterRun::get_save);
	ClassDB::bind_method(D_METHOD("step"), &EncounterRun::step);
	ClassDB::bind_method(D_METHOD("take_due"), &EncounterRun::take_due);
	ClassDB::bind_method(D_METHOD("depth"), &EncounterRun::depth);
	ClassDB::bind_method(D_METHOD("take_calls"), &EncounterRun::take_calls);
	ClassDB::bind_static_method("EncounterRun", D_METHOD("region_info", "meta", "grid"), &EncounterRun::region_info);
	ClassDB::bind_static_method("EncounterRun", D_METHOD("save_check", "save"), &EncounterRun::save_check);
	ClassDB::bind_static_method("EncounterRun", D_METHOD("away_line", "note"), &EncounterRun::away_line);
	ClassDB::bind_static_method("EncounterRun", D_METHOD("goods_words", "goods"), &EncounterRun::goods_words);
	ClassDB::bind_static_method("EncounterRun", D_METHOD("pid_of_unit", "snap", "unit"), &EncounterRun::pid_of_unit);
	ClassDB::bind_static_method("EncounterRun", D_METHOD("enc"), &EncounterRun::enc);
}

} // namespace godot

// The room's encounter runs (room_life.cpp) read the room's snapshot and events as the GDScript face does.
namespace sim {
EncSnap enc_snap(const godot::Dictionary &snap) { return godot::snap_from(snap); }
std::vector<StoryEvent> enc_events(const godot::Array &evs) { return godot::events_from(evs); }
godot::Array enc_notes(const std::vector<EncNote> &ns) { return godot::notes_to(ns); }
godot::Dictionary enc_goods(const EncGoods &g) { return godot::goods_to(g); }
} // namespace sim
