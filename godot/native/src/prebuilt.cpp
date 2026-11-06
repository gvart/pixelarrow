#include "prebuilt.h"

#include <algorithm>
#include <cmath>
#include <set>

#include <godot_cpp/core/class_db.hpp>

#include "js_math.h"
#include "sim_data.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::Variant;

static const PrebuiltTables &P() { return data().prebuilt; }
static constexpr double EVERY = 10; // ticks between the function scans

void load_prebuilt_tables(const Dictionary &tables, PrebuiltTables &out) {
	if (!tables.has("src/war/sim/prebuilt")) return;
	const Dictionary t = tables["src/war/sim/prebuilt"], pre = t["PREBUILT"], b = t["BLESS"], w = t["WELL"];
	const Array ks = pre.keys();
	for (int64_t i = 0; i < ks.size(); i++) {
		const Dictionary f = pre[ks[i]];
		PreFn fn;
		fn.pop = f.get("pop", 0);
		fn.cap = f.get("cap", 0);
		fn.bless = f.get("bless", 0);
		fn.favour = f.get("favour", 0);
		fn.prestige = f.get("prestige", 0);
		fn.well = f.get("well", false).booleanize();
		out.PREBUILT[godot::String(ks[i]).utf8().get_data()] = fn;
	}
	out.BLESS = { b["stand"], b["ticks"], b["share"], b["heal"] };
	out.WELL = { w["rest"], w["upkeep"], w["douse"], w["by"], w["foul"], w["fouled"] };
	out.PRESTIGE_CAP = t["PRESTIGE_CAP"];
	out.TOWN_RUIN = t["TOWN_RUIN"];
}

// A real owner: an alliance team (not neutral, not the mobs).
static bool real(int team, int mob) { return team != data().economy.NEUTRAL_TEAM && team != mob && team >= 0; }
static bool up(const Building &b) { return b.state == "done" || b.state == "damaged"; }

// Map get/set/delete over insertion-ordered entries
static double *find(std::vector<std::pair<int, double>> &m, int k) {
	for (auto &e : m)
		if (e.first == k) return &e.second;
	return nullptr;
}
static const double *find(const std::vector<std::pair<int, double>> &m, int k) {
	for (const auto &e : m)
		if (e.first == k) return &e.second;
	return nullptr;
}
static void set(std::vector<std::pair<int, double>> &m, int k, double v) {
	if (double *p = find(m, k)) *p = v;
	else m.emplace_back(k, v);
}
static void erase(std::vector<std::pair<int, double>> &m, int k) {
	m.erase(std::remove_if(m.begin(), m.end(), [&](const auto &e) { return e.first == k; }), m.end());
}

bool Towns::working(const Building &b) const { return up(b) && !b.pre->gone && real(b.team, host.mob); }
bool Towns::well_ok(const Building &b) const { return b.type == "well" && working(b) && b.pre->fouled <= tick_; }

std::vector<TownSnap> Towns::towns() const {
	std::vector<std::pair<std::string, std::vector<const Building *>>> by; // a Map: insertion order
	for (const Building *b : works.prebuilt()) {
		if (b->pre->gone) continue;
		const std::string k = b->pre->zone >= 0 ? std::to_string(b->pre->zone) : "-1:" + std::to_string(b->team);
		auto it = std::find_if(by.begin(), by.end(), [&](const auto &e) { return e.first == k; });
		if (it == by.end()) by.push_back({ k, {} }), it = by.end() - 1;
		it->second.push_back(b);
	}
	std::vector<TownSnap> out;
	for (const auto &[_, list] : by) {
		const int team = list[0]->team, zone = list[0]->pre->zone;
		double houses = 0, standing = 0, pool = 0, cap = 0, favour = 0, prestige = 0, temples = 0, templesUp = 0;
		for (const Building *b : list) {
			const PreFn *f = P().fn(b->type);
			if (!f) continue;
			if (f->pop) {
				houses++;
				if (up(*b)) standing++, pool += f->pop, cap += f->cap;
			}
			if (b->type == "temple") {
				temples++;
				if (up(*b)) templesUp++;
			}
			if (up(*b)) favour += b->staff ? f->favour : 0, prestige += f->prestige; // W-88: a temple or shrine needs a priest there; a statue just stands
		}
		const bool ruined = houses > 0 && houses - standing >= houses * P().TOWN_RUIN && (temples == 0 || templesUp == 0);
		out.push_back({ zone, team, houses, standing, ruined ? 0 : pool, ruined ? 0 : cap, ruined ? 0 : favour, prestige, ruined });
	}
	return out;
}

Towns::Pop Towns::population(int team) const {
	Pop p;
	if (!real(team, host.mob)) return p;
	for (const TownSnap &t : towns())
		if (t.team == team) p.rate += t.pool, p.cap += t.cap;
	return p;
}

double Towns::prestige(int team) const {
	double s = 0;
	if (!real(team, host.mob)) return 0;
	for (const TownSnap &t : towns())
		if (t.team == team) s += t.favour + t.prestige;
	return std::min(P().PRESTIGE_CAP, s);
}

double Towns::upkeep_at(int team, double x, double y) const {
	for (const Building *b : works.prebuilt())
		if (b->team == team && well_ok(*b) && js::pow(b->x - x, 2) + js::pow(b->y - y, 2) <= js::pow(P().WELL.rest, 2)) return P().WELL.upkeep;
	return 1;
}

double Towns::douse(const Building &b) const {
	for (const Building *o : works.prebuilt())
		if (o->team == b.team && well_ok(*o) && js::pow(o->x - b.x, 2) + js::pow(o->y - b.y, 2) <= js::pow(P().WELL.rest, 2)) return P().WELL.douse;
	return 1;
}

bool Towns::blessed(int squad) const {
	const double *u = find(blessed_, squad);
	return (u ? *u : -1) > tick_;
}

void Towns::tick(double t) {
	tick_ = t;
	if (std::fmod(t, EVERY) != 0 || works.prebuilt().empty()) return;
	// blessing: squads in an own precinct
	std::set<int> seen; // membership only
	std::optional<std::vector<PreSquad>> squads;
	for (const Building *b : works.prebuilt()) {
		const PreFn *f = P().fn(b->type);
		const double r = f ? f->bless : 0;
		if (!r || !working(*b)) continue;
		if (!squads) squads = host.squads();
		for (const PreSquad &s : *squads) {
			if (s.team != b->team || s.alive == 0 || seen.count(s.id) || js::pow(s.cx - b->x, 2) + js::pow(s.cy - b->y, 2) > r * r) continue;
			seen.insert(s.id);
			const double *had = find(stand, s.id);
			const double n = (had ? *had : 0) + EVERY;
			if (n >= P().BLESS.stand) {
				set(blessed_, s.id, t + P().BLESS.ticks);
				erase(stand, s.id);
			} else set(stand, s.id, n);
		}
	}
	for (const auto &[id, _] : std::vector<std::pair<int, double>>(stand))
		if (!seen.count(id)) erase(stand, id);
	for (const auto &[id, until] : std::vector<std::pair<int, double>>(blessed_))
		if (until <= t) erase(blessed_, id);
	std::optional<std::vector<PreUnit>> units;
	for (Building *b : std::vector<Building *>(works.prebuilt())) {
		// wells: a foe standing by one fouls it
		if (b->type == "well" && working(*b)) {
			if (!units) units = host.units();
			bool foe = false;
			for (const PreUnit &u : *units)
				if (u.alive && !u.civ && u.team != b->team && js::pow(u.x - b->x, 2) + js::pow(u.y - b->y, 2) <= js::pow(P().WELL.by, 2)) foe = true;
			const double n = foe ? b->pre->foulT + EVERY : 0;
			if (n >= P().WELL.foul) works.foul(b->id, 0, t + P().WELL.fouled);
			else works.foul(b->id, n, std::nullopt);
		}
		// a town's cache, carried off: gone
		if (b->def->cache && up(*b) && b->hold && empty(*b->hold)) works.vanish(b->id);
	}
}

} // namespace sim

namespace godot {

static std::string u8(const Variant &v) { return String(v).utf8().get_data(); }

struct Towns::Fake : sim::PreWorks, sim::PreHost {
	std::vector<std::unique_ptr<sim::Building>> own;
	std::vector<sim::Building *> list;
	std::vector<sim::PreSquad> sq;
	std::vector<sim::PreUnit> us;
	Array calls;
	const std::vector<sim::Building *> &prebuilt() override { return list; }
	void foul(int id, double foulT, std::optional<double> until) override {
		Array c;
		c.push_back("foul");
		c.push_back(id);
		c.push_back(foulT);
		c.push_back(until ? Variant(*until) : Variant());
		calls.push_back(c);
		sim::Pre &p = *own[id]->pre;
		p.foulT = foulT;
		if (until) p.fouled = *until;
	}
	void vanish(int id) override {
		Array c;
		c.push_back("vanish");
		c.push_back(id);
		calls.push_back(c);
		sim::Building &b = *own[id];
		if (b.pre->gone) return;
		b.pre->gone = true;
		b.state = "destroyed"; // the fake's works.destroy
	}
	std::vector<sim::PreSquad> squads() override { return sq; }
	std::vector<sim::PreUnit> units() override { return us; }
};

Towns::Towns() = default;
Towns::~Towns() = default;

static void set_lot(sim::Building &b, const Variant &n) {
	if (!b.hold || n.get_type() == Variant::NIL) return;
	b.hold->lots[0].n = n;
}

Ref<Towns> Towns::create(const Dictionary &start, int mob) {
	Ref<Towns> r;
	r.instantiate();
	r->fake = std::make_unique<Fake>();
	Fake &f = *r->fake;
	f.mob = mob;
	const Array ps = start["pieces"], ss = start["squads"], us = start["units"];
	for (int64_t i = 0; i < ps.size(); i++) {
		const Dictionary p = ps[i], pre = p["pre"];
		auto b = std::make_unique<sim::Building>();
		b->id = int(p["id"]);
		b->type = u8(p["type"]);
		b->def = &sim::building(b->type);
		b->team = int(p["team"]);
		b->x = p["x"];
		b->y = p["y"];
		b->state = u8(p["state"]);
		b->staff = bool(p["staff"]);
		sim::Pre pr;
		pr.zone = int(pre["zone"]);
		pr.gone = bool(pre["gone"]);
		pr.fouled = pre["fouled"];
		pr.foulT = pre["foulT"];
		b->pre = pr;
		if (p.has("hold")) {
			const Array lots = Dictionary(p["hold"])["lots"];
			sim::Hold h;
			for (int64_t k = 0; k < lots.size(); k++) {
				const Dictionary l = lots[k];
				h.lots.push_back({ u8(l["r"]), l["n"], u8(l["o"]), std::nullopt });
			}
			b->hold = h;
		}
		f.list.push_back(b.get());
		f.own.push_back(std::move(b));
	}
	for (int64_t i = 0; i < ss.size(); i++) {
		const Dictionary s = ss[i];
		f.sq.push_back({ int(s["id"]), int(s["team"]), s["alive"], s["cx"], s["cy"], bool(s["civ"]) });
	}
	for (int64_t i = 0; i < us.size(); i++) {
		const Dictionary u = us[i];
		f.us.push_back({ u["x"], u["y"], bool(u["alive"]), u["civ"].booleanize(), int(Dictionary(u["squad"])["team"]) });
	}
	r->towns = std::make_unique<sim::Towns>(f, f);
	return r;
}

void Towns::apply(const Array &ops) {
	for (int64_t i = 0; i < ops.size(); i++) {
		const Array o = ops[i];
		const String k = o[0];
		if (k == "squad") {
			sim::PreSquad &s = fake->sq[int(o[1])];
			s.cx = o[2], s.cy = o[3], s.alive = o[4];
		} else if (k == "unit") {
			sim::PreUnit &u = fake->us[int(o[1])];
			u.x = o[2], u.y = o[3], u.alive = bool(o[4]);
		} else if (k == "piece") {
			sim::Building &b = *fake->own[int(o[1])];
			b.state = u8(o[2]);
			b.staff = bool(o[3]);
			b.team = int(o[4]);
			set_lot(b, o[5]);
		} else if (k == "load") towns->load_root(o[1]);
	}
}

void Towns::tick(double t) { towns->tick(t); }

Array Towns::take_calls() {
	Array c = fake->calls;
	fake->calls = Array();
	return c;
}

static Array pairs(const std::vector<std::pair<int, double>> &m) {
	Array a;
	for (const auto &[k, v] : m) {
		Array e;
		e.push_back(k);
		e.push_back(v);
		a.push_back(e);
	}
	return a;
}

Dictionary Towns::probes() const {
	const sim::Towns &t = *towns;
	Dictionary d;
	Array ts;
	for (const sim::TownSnap &s : t.towns()) {
		Dictionary o;
		o["claim"] = s.claim;
		o["team"] = s.team;
		o["houses"] = s.houses;
		o["standing"] = s.standing;
		o["pool"] = s.pool;
		o["cap"] = s.cap;
		o["favour"] = s.favour;
		o["prestige"] = s.prestige;
		o["ruined"] = s.ruined;
		ts.push_back(o);
	}
	d["towns"] = ts;
	Array pop;
	for (int tm : { -1, 0, 1, 2, 3, sim::data().economy.NEUTRAL_TEAM, fake->mob }) {
		const auto p = t.population(tm);
		Dictionary pd;
		pd["rate"] = p.rate;
		pd["cap"] = p.cap;
		Array e;
		e.push_back(tm);
		e.push_back(pd);
		e.push_back(t.prestige(tm));
		pop.push_back(e);
	}
	d["pop"] = pop;
	Array upk;
	for (size_t i = 0; i < fake->own.size(); i += 3) {
		const sim::Building &b = *fake->own[i];
		Array e;
		e.push_back(b.team);
		e.push_back(b.x + 3);
		e.push_back(b.y);
		e.push_back(t.upkeep_at(b.team, b.x + 3, b.y));
		e.push_back(t.upkeep_at(b.team, b.x + 13, b.y));
		upk.push_back(e);
	}
	d["upkeep"] = upk;
	Array dz, bl;
	for (const sim::Building *b : fake->list) dz.push_back(t.douse(*b));
	for (const sim::PreSquad &s : fake->sq) bl.push_back(t.blessed(s.id));
	d["douse"] = dz;
	d["blessed"] = bl;
	Dictionary root;
	root["stand"] = pairs(t.stand);
	root["blessed"] = pairs(t.blessed_);
	root["tick"] = t.tick_;
	d["root"] = root;
	return d;
}

void Towns::_bind_methods() {
	ClassDB::bind_static_method("Towns", D_METHOD("create", "start", "mob"), &Towns::create);
	ClassDB::bind_method(D_METHOD("apply", "ops"), &Towns::apply);
	ClassDB::bind_method(D_METHOD("tick", "t"), &Towns::tick);
	ClassDB::bind_method(D_METHOD("take_calls"), &Towns::take_calls);
	ClassDB::bind_method(D_METHOD("probes"), &Towns::probes);
}

} // namespace godot
