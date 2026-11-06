#include "warlords_probe.h"

#include <map>

#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/variant/string.hpp>

#include <algorithm>
#include <array>
#include <cmath>

#include "vision.h"
#include "warlords.h"

namespace sim {

static std::string p8(const godot::Variant &v) { return godot::String(v).utf8().get_data(); }
static godot::String ps(const std::string &s) { return godot::String::utf8(s.c_str()); }

// The host side of src/dev/vectors/warlords.ts: the world comes from the vectors; a spawn takes the next squad id
// (or -1 at the cap) as the TS world does, and a man stands at his squad's centre plus off[his index % 9].
struct WarlordsReplayHost : WarlordsHost {
	struct Sq {
		bool present = false;
		std::string owner, order;
		int team = 0;
		double cx = 0, cy = 0;
		std::vector<int> units;
	};
	struct Man {
		int squad = -1;
		std::string cls;
		bool dead = false;
	};
	double w = 0, h = 0;
	int cap = 999;
	std::vector<std::array<double, 5>> inf;
	std::vector<std::pair<double, double>> off;
	std::vector<Sq> sq;
	std::map<int, Man> men; // id order (the snapshot's)
	bool has_b = false, has_g = false, has_cl = false;
	std::vector<WarlordsSnap::Building> blds;
	std::vector<WarlordsSnap::Siege> sieges;
	std::vector<int> claims;
	godot::Array events;

	void ev(std::initializer_list<godot::Variant> a) {
		godot::Array e;
		for (const godot::Variant &v : a) e.push_back(v);
		events.push_back(e);
	}
	static godot::Variant opt(const std::optional<int> &v) { return v ? godot::Variant(*v) : godot::Variant(); }

	double influence_w() override { return w; }
	int influence_at(double t) override {
		if (t < 0 || t >= w * h) return 0;
		const double x = std::fmod(t, w), y = std::floor(t / w);
		int bits = 0;
		for (const auto &r : inf)
			if (x >= r[0] && x < r[2] && y >= r[1] && y < r[3]) bits |= int(r[4]);
		return bits & 0xff; // a Uint8Array
	}
	int spawn_wild(const std::string &owner, const std::string &kind, double count, double x, double y, const SpawnScale &k) override {
		int id = -1;
		if (int(sq.size()) < cap) {
			id = int(sq.size());
			Sq s;
			s.present = true;
			s.owner = owner;
			s.team = MOB_TEAM;
			s.cx = x, s.cy = y;
			sq.push_back(s);
		}
		const godot::Variant nil;
		ev({ "spawn", ps(owner), ps(kind), count, x, y, k.hp, k.dmg, k.has_lead ? godot::Variant(k.lead.hp) : nil, k.has_lead ? godot::Variant(k.lead.dmg) : nil,
				k.has_lead && k.lead.armor ? godot::Variant(*k.lead.armor) : nil, id });
		return id;
	}
	void drop_pile(double x, double y, const std::vector<Lot> &lots, const std::vector<Item> &items) override {
		godot::Array l, it;
		for (const Lot &o : lots) l.push_back(ps(o.r)), l.push_back(o.n), l.push_back(ps(o.o));
		const godot::Variant nil;
		for (const Item &i : items) {
			godot::Array a;
			a.push_back(ps(i.uid)), a.push_back(ps(i.def)), a.push_back(ps(i.rarity)), a.push_back(i.cond);
			a.push_back(i.paint && i.paint->emblem ? godot::Variant(ps(*i.paint->emblem)) : nil);
			a.push_back(i.paint && i.paint->field ? godot::Variant(ps(*i.paint->field)) : nil);
			a.push_back(i.paint && i.paint->ink ? godot::Variant(ps(*i.paint->ink)) : nil);
			it.push_back(a);
		}
		ev({ "pile", x, y, l, it });
	}
	void order(const WarlordOrder &o) override {
		const godot::Variant nil;
		const bool mv = o.kind == "move";
		ev({ "order", ps(o.kind), o.squad, mv ? godot::Variant(o.x) : nil, mv ? godot::Variant(o.y) : nil, opt(o.building), opt(o.siege), o.kind == "merge" ? godot::Variant(o.into) : nil });
	}
	void drop_squad(int id) override { ev({ "drop", id }); }
	void bot_set(int id, const Behaviour &b) override { ev({ "bset", id, ps(b.kind), b.x, b.y, b.has_radius ? godot::Variant(b.radius) : godot::Variant() }); }
	void bot_clear(int id) override { ev({ "bclr", id }); }

	WarlordsSnap snapshot(double t) const {
		WarlordsSnap s;
		s.tick = t;
		for (const auto &[id, m] : men) {
			const Sq &q = sq[m.squad];
			const size_t k = size_t(std::find(q.units.begin(), q.units.end(), id) - q.units.begin());
			const auto &o = off[k % off.size()];
			s.units.push_back({ id, m.squad, q.cx + o.first, q.cy + o.second, m.dead, m.cls });
		}
		for (size_t i = 0; i < sq.size(); i++) {
			WarlordsSnap::Squad q;
			q.present = sq[i].present;
			q.id = int(i), q.team = sq[i].team, q.owner = sq[i].owner, q.order = sq[i].order, q.units = sq[i].units;
			s.squads.push_back(q);
		}
		s.has_buildings = has_b, s.has_sieges = has_g, s.has_claims = has_cl;
		s.buildings = blds, s.sieges = sieges, s.claims = claims;
		return s;
	}
};

static godot::Dictionary snap_dict(const WarlordSnapOut &o) {
	godot::Dictionary d;
	d["id"] = ps(o.id), d["name"] = ps(o.name), d["title"] = ps(o.title), d["band"] = ps(o.band), d["kind"] = ps(o.kind);
	d["tint"] = o.tint, d["scale"] = o.scale, d["seat"] = o.seat;
	if (o.fallen) d["fallen"] = true;
	d["lord"] = o.lord;
	godot::Array hs;
	for (const auto &h : o.holds) {
		godot::Dictionary x;
		x["place"] = ps(h.place), x["x"] = h.x, x["y"] = h.y, x["men"] = h.men, x["unit"] = h.unit, x["state"] = ps(h.state);
		hs.push_back(x);
	}
	d["holds"] = hs;
	if (o.has_raid) {
		godot::Dictionary r;
		r["x"] = o.raid.x, r["y"] = o.raid.y, r["team"] = o.raid.team, r["in"] = o.raid.in;
		d["raid"] = r;
	}
	if (o.raiding) d["raiding"] = true;
	return d;
}

} // namespace sim

namespace godot {

using sim::p8;
using sim::ps;

WarlordsProbe::WarlordsProbe() = default;
WarlordsProbe::~WarlordsProbe() = default;

Ref<WarlordsProbe> WarlordsProbe::create(const Dictionary &meta, double w, double h, double seed, int cap, const Array &inf, const Array &off) {
	Ref<WarlordsProbe> p;
	p.instantiate();
	p->region = std::make_unique<sim::WarlordsRegion>();
	sim::WarlordsRegion &r = *p->region;
	r.depth.id = p8(meta["id"]);
	r.depth.has_depth = meta.has("depth") && meta["depth"].get_type() != Variant::NIL;
	if (r.depth.has_depth) r.depth.depth = meta["depth"];
	r.w = w, r.h = h;
	const Array es = meta.get("entries", Array());
	for (int64_t i = 0; i < es.size(); i++) {
		const Dictionary e = es[i];
		r.entries.push_back({ p8(e["side"]), e["x"], e["y"], e["w"], e["h"] });
	}
	const Array lairs = meta.get("lairs", Array());
	for (int64_t i = 0; i < lairs.size(); i++) {
		const Dictionary d = lairs[i];
		sim::LairEntry e;
		e.kind = p8(d["kind"]);
		e.x = d["x"];
		e.y = d["y"];
		e.captain = d.get("captain", false);
		r.lairs.push_back(e);
	}
	const Array cps = meta.get("claimPoints", Array());
	for (int64_t i = 0; i < cps.size(); i++) {
		const Dictionary d = cps[i];
		r.claimPoints.push_back({ d["x"], d["y"] });
	}
	p->host = std::make_unique<sim::WarlordsReplayHost>();
	auto &H = *p->host;
	H.w = w, H.h = h, H.cap = cap;
	for (int64_t i = 0; i < inf.size(); i++) {
		const Array a = inf[i];
		H.inf.push_back({ a[0], a[1], a[2], a[3], a[4] });
	}
	for (int64_t i = 0; i < off.size(); i++) {
		const Array a = off[i];
		H.off.push_back({ a[0], a[1] });
	}
	p->lords = std::make_unique<sim::Warlords>(r, seed, H);
	return p;
}

bool WarlordsProbe::none() const { return lords->none(); }

void WarlordsProbe::apply(const Dictionary &rec) {
	auto &H = *host;
	const Array q = rec.get("q", Array());
	for (int64_t i = 0; i < q.size(); i++) {
		const Array d = q[i];
		const int id = int(d[0]);
		if (id >= int(H.sq.size())) H.sq.resize(id + 1);
		auto &s = H.sq[id];
		s.present = true;
		s.owner = p8(d[1]), s.team = int(d[2]), s.cx = d[3], s.cy = d[4], s.order = p8(d[5]);
		const Array u = d[6];
		s.units.clear();
		for (int64_t k = 0; k < u.size(); k++) s.units.push_back(int(u[k]));
	}
	const Array u = rec.get("u", Array());
	for (int64_t i = 0; i < u.size(); i++) {
		const Array d = u[i];
		H.men[int(d[0])] = { int(d[1]), p8(d[2]), int(d[3]) != 0 };
	}
	const Array ux = rec.get("ux", Array());
	for (int64_t i = 0; i < ux.size(); i++) H.men.erase(int(ux[i]));
	if (rec.has("b")) {
		H.has_b = true;
		H.blds.clear();
		const Array b = rec["b"];
		for (int64_t i = 0; i < b.size(); i++) {
			const Array d = b[i];
			sim::WarlordsSnap::Building x;
			x.id = int(d[0]), x.type = p8(d[1]), x.team = int(d[2]), x.x = d[3], x.y = d[4], x.state = p8(d[5]), x.ruin = int(d[6]) != 0;
			x.has_goods = true;
			const Array g = d[7];
			for (int64_t k = 0; k + 1 < g.size(); k += 2) x.goods.push_back({ p8(g[k]), double(g[k + 1]) });
			H.blds.push_back(x);
		}
	}
	if (rec.has("g")) {
		H.has_g = true;
		H.sieges.clear();
		const Array g = rec["g"];
		for (int64_t i = 0; i < g.size(); i++) {
			const Array d = g[i];
			H.sieges.push_back({ int(d[0]), int(d[2]), p8(d[1]), p8(d[5]), d[3], d[4] });
		}
	}
	if (rec.has("cl")) {
		H.has_cl = true;
		H.claims.clear();
		const Array c = rec["cl"];
		for (int64_t i = 0; i < c.size(); i++) H.claims.push_back(int(c[i]));
	}
}

static Array record_entries(const sim::Record &r) {
	Array out;
	for (const auto &[k, v] : r) {
		Array e;
		e.push_back(ps(k)), e.push_back(v);
		out.push_back(e);
	}
	return out;
}

Variant WarlordsProbe::call_api(const Array &c) {
	const String name = c[0];
	if (name == "age") return lords->setAge(c[1]), Variant();
	if (name == "players") return lords->setPlayers(c[1]), Variant();
	if (name == "raidNow") return lords->raidNow(c[1].get_type() == Variant::NIL ? 0.0 : double(c[1])), Variant();
	if (name == "men") return lords->men();
	if (name == "fell") return lords->fell(p8(c[1]), c[2]), Variant();
	if (name == "snaps") return snaps();
	if (name == "memory") {
		const sim::WarlordMemory m = lords->memory();
		Array freed, out;
		for (const auto &[id, r] : m.freed) {
			Array e;
			e.push_back(ps(id)), e.push_back(record_entries(r));
			freed.push_back(e);
		}
		out.push_back(record_entries(m.fallen)), out.push_back(freed);
		return out;
	}
	if (name == "recall") {
		const Dictionary d = c[1], f = d["fallen"], fr = d["freed"];
		sim::WarlordMemory m;
		const Array fk = f.keys(), frk = fr.keys();
		for (int64_t i = 0; i < fk.size(); i++) m.fallen.push_back({ p8(fk[i]), double(f[fk[i]]) });
		for (int64_t i = 0; i < frk.size(); i++) {
			const Dictionary x = fr[frk[i]];
			const Array xk = x.keys();
			sim::Record r;
			for (int64_t k = 0; k < xk.size(); k++) r.push_back({ p8(xk[k]), double(x[xk[k]]) });
			m.freed.push_back({ p8(frk[i]), r });
		}
		lords->recall(m);
		return Variant();
	}
	ERR_FAIL_V_MSG(Variant(), "unknown warlords call " + name);
}

Array WarlordsProbe::tick(double t, bool think) {
	sim::WarlordsSnap s;
	if (think) s = host->snapshot(t);
	else s.tick = t;
	Array out;
	const Variant nil;
	for (const auto &n : lords->tick(s)) {
		Array a;
		a.push_back(n.t), a.push_back(ps(n.what)), a.push_back(ps(n.warlord)), a.push_back(ps(n.name)), a.push_back(ps(n.text)), a.push_back(n.x), a.push_back(n.y);
		a.push_back(n.place ? Variant(ps(*n.place)) : nil), a.push_back(n.team ? Variant(*n.team) : nil), a.push_back(n.in ? Variant(*n.in) : nil);
		out.push_back(a);
	}
	return out;
}

Array WarlordsProbe::take_events() {
	Array e = host->events;
	host->events = Array();
	return e;
}

Array WarlordsProbe::snaps() const {
	Array out;
	for (const auto &o : lords->snaps()) out.push_back(sim::snap_dict(o));
	return out;
}

void WarlordsProbe::_bind_methods() {
	ClassDB::bind_static_method("WarlordsProbe", D_METHOD("create", "region", "w", "h", "seed", "cap", "inf", "off"), &WarlordsProbe::create);
	ClassDB::bind_method(D_METHOD("none"), &WarlordsProbe::none);
	ClassDB::bind_method(D_METHOD("apply", "rec"), &WarlordsProbe::apply);
	ClassDB::bind_method(D_METHOD("call_api", "call"), &WarlordsProbe::call_api);
	ClassDB::bind_method(D_METHOD("tick", "t", "think"), &WarlordsProbe::tick);
	ClassDB::bind_method(D_METHOD("take_events"), &WarlordsProbe::take_events);
	ClassDB::bind_method(D_METHOD("snaps"), &WarlordsProbe::snaps);
}

} // namespace godot
