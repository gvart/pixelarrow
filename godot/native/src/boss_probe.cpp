#include "boss_probe.h"

#include <array>

#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/core/error_macros.hpp>

#include "bosses.h"
#include "rng.h"
#include "sim_data.h"

namespace sim {

static std::string bp8(const godot::Variant &v) { return godot::String(v).utf8().get_data(); }
static godot::String bpg(const std::string &s) { return godot::String::utf8(s.c_str()); }

// The host side of src/dev/vectors/bosses.ts: men and squads come from the vectors, the host's own reactions are mirrored.
struct BossReplayHost : BossHost {
	std::vector<std::unique_ptr<Unit>> own_u;
	std::vector<std::unique_ptr<Squad>> own_s;
	std::vector<Unit *> us;
	std::vector<Squad *> ss;
	godot::Array events;
	Mulberry rng{ 1 };
	std::vector<std::array<double, 5>> water_, walls_, levels_;
	std::vector<std::array<double, 2>> claimed_;
	double tick = 0;

	void ev(std::initializer_list<godot::Variant> a) {
		godot::Array e;
		for (const godot::Variant &v : a) e.push_back(v);
		events.push_back(e);
	}
	static const std::array<double, 5> *in_rect(const std::vector<std::array<double, 5>> &rs, double x, double y) {
		for (const auto &r : rs)
			if (x >= r[0] && y >= r[1] && x < r[2] && y < r[3]) return &r;
		return nullptr;
	}
	Unit &unit_at(int id) {
		while (int(us.size()) <= id) {
			own_u.push_back(std::make_unique<Unit>());
			us.push_back(own_u.back().get());
			us.back()->id = int(us.size()) - 1;
		}
		return *us[id];
	}
	Squad &squad_at(int id) {
		while (int(ss.size()) <= id) {
			own_s.push_back(std::make_unique<Squad>());
			ss.push_back(own_s.back().get());
			ss.back()->id = int(ss.size()) - 1;
		}
		return *ss[id];
	}
	void kill(Unit &u) {
		if (!u.alive) return;
		u.alive = false;
		u.squad->alive--;
	}

	const std::vector<Unit *> &units() override { return us; }
	const std::vector<Squad *> &squads() override { return ss; }
	int spawn(const std::string &cls, int count, double x, double y, const StPatch &st, int boss) override {
		const int id = int(ss.size());
		Squad &s = squad_at(id);
		s.team = mobTeam;
		s.owner = "mob";
		s.alive = count;
		s.cx = x;
		s.cy = y;
		s.order = "hold";
		s.target = -1;
		WarStats full = data().classes.of("mob_bear");
		st.apply(full);
		for (int i = 0; i < count; i++) {
			Unit &u = unit_at(int(us.size()));
			u.x = x + ((i % 4) - 1.5) * 0.75;
			u.y = y + (i / 4 - 1) * 0.75;
			u.hp = u.maxHp = full.maxHp;
			u.alive = true;
			u.cls = cls;
			u.st = full;
			u.boss = boss;
			u.squad = &s;
			s.units.push_back(&u);
		}
		const godot::Variant nil;
		const auto o = [&](const std::optional<double> &v) { return v ? godot::Variant(*v) : nil; };
		godot::Array p;
		for (const godot::Variant &v : { o(st.maxHp), o(st.dmg), o(st.armor), o(st.reach), st.atkTicks ? godot::Variant(*st.atkTicks) : nil, o(st.speed), o(st.block), o(st.range),
					 o(st.ammo), o(st.rangedDmg), o(st.knock) })
			p.push_back(v);
		ev({ "spawn", bpg(cls), count, x, y, p, boss });
		return id;
	}
	void order(const Order &o) override {
		const godot::Variant nil;
		const bool mv = o.kind == "move", at = o.kind == "attack";
		ev({ "order", bpg(o.kind), o.squad, mv ? godot::Variant(o.x) : nil, mv ? godot::Variant(o.y) : nil, at ? godot::Variant(o.target) : nil });
		Squad &s = *ss[o.squad];
		s.order = o.kind;
		if (at) s.target = o.target;
	}
	void hurt(Unit &u, double dmg, bool venom) override {
		ev({ "hurt", u.id, dmg, venom ? 1 : 0 });
		u.hp = std::max(0.0, u.hp - dmg);
		if (u.hp == 0) kill(u);
	}
	void knock(Unit &u, double fx, double fy, double tiles) override { ev({ "knock", u.id, fx, fy, tiles }); }
	void slow(Unit &u, double ticks) override { ev({ "slow", u.id, ticks }); }
	void place(Unit &u, double x, double y) override {
		ev({ "place", u.id, x, y });
		u.x = x;
		u.y = y;
	}
	void vanish(Unit &u) override {
		ev({ "vanish", u.id });
		kill(u);
	}
	void burn(double x, double y, double r) override { ev({ "burn", x, y, r }); }
	void smash(double x, double y, double r, double dmg, const std::string &what) override { ev({ "smash", x, y, r, dmg, bpg(what) }); }
	int water(double x, double y) override {
		const auto *r = in_rect(water_, x, y);
		return r ? int((*r)[4]) : 0;
	}
	bool open(double x, double y) override { return x >= 0 && y >= 0 && x < w && y < h && !in_rect(walls_, x, y); }
	double level(double x, double y) override {
		const auto *r = in_rect(levels_, x, y);
		return r ? (*r)[4] : 0;
	}
	bool claimed() override {
		bool r = false;
		for (const auto &c : claimed_) r = r || (tick >= c[0] && tick <= c[1]);
		ev({ "claimed", r });
		return r;
	}
	void gate(const std::string &id, bool alive) override { ev({ "gate", bpg(id), alive }); }
	void reset_landmark() override { ev({ "reset" }); }
	void note(const BossNote &e) override {
		godot::Dictionary d;
		d["t"] = e.t;
		d["kind"] = bpg(e.kind);
		if (e.kind == "wardenStrike") {
			d["x"] = e.x;
			d["y"] = e.y;
			d["w"] = e.w;
			d["h"] = e.h;
			d["hit"] = e.hit;
		} else {
			d["region"] = bpg(e.region);
			d["boss"] = bpg(e.boss);
			if (e.kind == "bossPhase") d["phase"] = e.phase;
			if (e.kind == "bossSlain") {
				godot::Array k;
				for (const std::string &o : e.killers) k.push_back(bpg(o));
				d["killers"] = k;
				d["x"] = e.x;
				d["y"] = e.y;
			}
		}
		ev({ "note", d });
	}
	double range(double lo, double hi) override {
		const double r = lo + (hi - lo) * rng.next();
		ev({ "range", lo, hi, r });
		return r;
	}
};

static godot::Array ser_u(const Unit &u) {
	godot::Array a;
	for (const godot::Variant &v : { godot::Variant(u.id), godot::Variant(u.squad ? u.squad->id : -1), godot::Variant(bpg(u.cls)), godot::Variant(u.x), godot::Variant(u.y),
				 godot::Variant(u.hp), godot::Variant(u.maxHp), godot::Variant(u.alive ? 1 : 0), godot::Variant(u.facing), godot::Variant(u.pin ? 1 : 0), godot::Variant(u.aloft),
				 godot::Variant(u.immune ? 1 : 0), godot::Variant(u.venom ? 1 : 0), godot::Variant(u.boss), godot::Variant(u.st.maxHp), godot::Variant(u.st.dmg), godot::Variant(u.st.armor),
				 godot::Variant(u.st.reach), godot::Variant(u.st.atkTicks), godot::Variant(u.st.speed), godot::Variant(u.st.block), godot::Variant(u.st.range), godot::Variant(u.st.ammo),
				 godot::Variant(u.st.rangedDmg), godot::Variant(u.st.knock) })
		a.push_back(v);
	return a;
}
static godot::Array ser_s(const Squad &s) {
	godot::Array ids;
	for (const Unit *u : s.units) ids.push_back(u->id);
	godot::Array a;
	for (const godot::Variant &v : { godot::Variant(s.id), godot::Variant(bpg(s.owner)), godot::Variant(s.team), godot::Variant(s.alive), godot::Variant(s.cx), godot::Variant(s.cy),
				 godot::Variant(bpg(s.order)), godot::Variant(s.target), godot::Variant(ids) })
		a.push_back(v);
	return a;
}

static godot::Dictionary item_v(const Item &it) {
	godot::Dictionary d = item_to_dict(it);
	if (it.aff) d["aff"] = bpg(*it.aff);
	if (it.tr) d["tr"] = bpg(*it.tr);
	return d;
}

} // namespace sim

namespace godot {

using sim::bp8;
using sim::bpg;

BossProbe::BossProbe() = default;
BossProbe::~BossProbe() = default;

static std::vector<std::array<double, 5>> rects(const Array &a) {
	std::vector<std::array<double, 5>> out;
	for (int64_t i = 0; i < a.size(); i++) {
		const Array r = a[i];
		out.push_back({ r[0], r[1], r[2], r[3], r[4] });
	}
	return out;
}
static std::pair<double, double> pt(const Variant &v) {
	const Array a = v;
	return { a[0], a[1] };
}
static std::vector<std::pair<double, double>> pts(const Dictionary &d, const char *k) {
	std::vector<std::pair<double, double>> out;
	if (!d.has(k)) return out;
	const Array a = d[k];
	for (int64_t i = 0; i < a.size(); i++) out.push_back(pt(a[i]));
	return out;
}

Ref<BossProbe> BossProbe::create(const Dictionary &meta, double w, double h, int64_t seed, const Array &water, const Array &walls, const Array &levels, const Array &claimed) {
	Ref<BossProbe> p;
	p.instantiate();
	p->region = std::make_unique<sim::BossRegion>();
	sim::BossRegion &r = *p->region;
	r.depth.id = bp8(meta["id"]);
	r.depth.has_depth = meta.has("depth") && meta["depth"].get_type() != Variant::NIL;
	if (r.depth.has_depth) r.depth.depth = meta["depth"];
	r.rim = meta.has("rim") ? bp8(meta["rim"]) : "";
	const Array gs = meta.get("guardians", Array());
	for (int64_t i = 0; i < gs.size(); i++) {
		const Dictionary d = gs[i];
		sim::GuardianEntry e;
		e.boss = bp8(d["boss"]);
		e.x = d["x"];
		e.y = d["y"];
		e.perches = pts(d, "perches");
		e.heads = pts(d, "heads");
		if (d.has("postern")) e.postern = pt(d["postern"]);
		if (d.has("pit")) e.pit = pt(d["pit"]);
		if (d.has("flats")) e.flats = pt(d["flats"]);
		r.guardians.push_back(e);
	}
	p->host = std::make_unique<sim::BossReplayHost>();
	sim::BossReplayHost &host = *p->host;
	host.w = w;
	host.h = h;
	host.rng = sim::Mulberry(uint32_t(seed));
	host.water_ = rects(water);
	host.walls_ = rects(walls);
	host.levels_ = rects(levels);
	for (int64_t i = 0; i < claimed.size(); i++) {
		const Array c = claimed[i];
		host.claimed_.push_back({ c[0], c[1] });
	}
	p->bosses = std::make_unique<sim::Bosses>(r, host);
	return p;
}

void BossProbe::apply(const Dictionary &rec) {
	sim::BossReplayHost &h = *host;
	h.tick = rec["t"];
	std::vector<std::pair<sim::Unit *, int>> link;
	const Array nu = rec.get("nu", Array());
	for (int64_t i = 0; i < nu.size(); i++) {
		const Array a = nu[i];
		sim::Unit &u = h.unit_at(int(a[0]));
		link.push_back({ &u, int(a[1]) });
		u.cls = bp8(a[2]);
		u.x = a[3];
		u.y = a[4];
		u.hp = a[5];
		u.maxHp = a[6];
		u.alive = int(a[7]) != 0;
		u.facing = a[8];
		u.pin = int(a[9]) != 0;
		u.aloft = int(a[10]);
		u.immune = int(a[11]) != 0;
		u.venom = int(a[12]) != 0;
		u.boss = int(a[13]);
		u.st.maxHp = a[14];
		u.st.dmg = a[15];
		u.st.armor = a[16];
		u.st.reach = a[17];
		u.st.atkTicks = int(a[18]);
		u.st.speed = a[19];
		u.st.block = a[20];
		u.st.range = a[21];
		u.st.ammo = a[22];
		u.st.rangedDmg = a[23];
		u.st.knock = a[24];
	}
	const Array nq = rec.get("nq", Array());
	for (int64_t i = 0; i < nq.size(); i++) {
		const Array a = nq[i];
		sim::Squad &s = h.squad_at(int(a[0]));
		s.owner = bp8(a[1]);
		s.team = int(a[2]);
		s.alive = int(a[3]);
		s.cx = a[4];
		s.cy = a[5];
		s.order = bp8(a[6]);
		s.target = int(a[7]);
		const Array ids = a[8];
		s.units.clear();
		for (int64_t k = 0; k < ids.size(); k++) s.units.push_back(&h.unit_at(int(ids[k])));
	}
	for (const auto &[u, sid] : link) u->squad = &h.squad_at(sid);
	const Array du = rec.get("du", Array());
	for (int64_t i = 0; i < du.size(); i++) {
		const Array a = du[i];
		sim::Unit &u = h.unit_at(int(a[0]));
		u.x = a[1];
		u.y = a[2];
		u.hp = a[3];
		u.alive = int(a[4]) != 0;
	}
	const Array dq = rec.get("dq", Array());
	for (int64_t i = 0; i < dq.size(); i++) {
		const Array a = dq[i];
		sim::Squad &s = h.squad_at(int(a[0]));
		s.alive = int(a[1]);
		s.cx = a[2];
		s.cy = a[3];
		s.order = bp8(a[4]);
		s.target = int(a[5]);
	}
	before_u.clear();
	before_s.clear();
	for (const sim::Unit *u : h.us) before_u.push_back(sim::ser_u(*u));
	for (const sim::Squad *s : h.ss) before_s.push_back(sim::ser_s(*s));
}

Variant BossProbe::call_api(const Array &c) {
	const String name = c[0];
	const auto has = [&](int k) { return c.size() > k && c[k].get_type() != Variant::NIL; };
	if (name == "spawn") bosses->spawn();
	else if (name == "hit") bosses->hit(int(c[1]), bp8(c[2]), c[3]);
	else if (name == "struck") bosses->struck(int(c[1]));
	else if (name == "hurtBoss") bosses->hurt_boss(bp8(c[1]), c[2], has(3) ? bp8(c[3]) : "dev", has(4) ? std::optional<int>(int(c[4])) : std::nullopt);
	else if (name == "down") bosses->down(bp8(c[1]), c[2], has(3) && bool(c[3]));
	else if (name == "wake") bosses->wake(c[1]);
	else ERR_FAIL_V_MSG(Variant(), "unknown call " + name);
	return Variant();
}

void BossProbe::tick(double t) { bosses->tick(t); }

Array BossProbe::take_events() {
	Array e = host->events;
	host->events = Array();
	return e;
}

Array BossProbe::changed() {
	Array us, ss, out;
	for (const sim::Unit *u : host->us) {
		const Array a = sim::ser_u(*u);
		if (u->id >= before_u.size() || Array(before_u[u->id]) != a) us.push_back(a);
	}
	for (const sim::Squad *s : host->ss) {
		const Array a = sim::ser_s(*s);
		if (s->id >= before_s.size() || Array(before_s[s->id]) != a) ss.push_back(a);
	}
	out.push_back(us);
	out.push_back(ss);
	return out;
}

Dictionary BossProbe::snaps() {
	Array bs, memo;
	for (const sim::BossSnap &b : bosses->snaps()) {
		Dictionary d;
		d["id"] = bpg(b.id);
		d["name"] = bpg(b.name);
		d["squad"] = b.squad;
		d["unit"] = b.unit;
		d["x"] = b.x;
		d["y"] = b.y;
		d["hp"] = b.hp;
		d["maxHp"] = b.maxHp;
		d["phase"] = b.phase;
		Array ph;
		for (double v : b.phases) ph.push_back(v);
		d["phases"] = ph;
		d["state"] = bpg(b.state);
		d["raid"] = b.raid;
		d["scale"] = b.scale;
		if (b.parts) {
			Dictionary p;
			p["alive"] = b.parts->alive;
			p["total"] = b.parts->total;
			d["parts"] = p;
		}
		if (b.respawnIn) d["respawnIn"] = *b.respawnIn;
		if (b.fx) {
			Dictionary f;
			f["kind"] = bpg(b.fx->kind);
			f["x"] = b.fx->x;
			f["y"] = b.fx->y;
			f["tx"] = b.fx->tx;
			f["ty"] = b.fx->ty;
			f["r"] = b.fx->r;
			f["t"] = b.fx->t;
			d["fx"] = f;
		}
		if (b.tele) {
			Dictionary f;
			f["kind"] = bpg(b.tele->kind);
			f["x"] = b.tele->x;
			f["y"] = b.tele->y;
			f["tx"] = b.tele->tx;
			f["ty"] = b.tele->ty;
			f["r"] = b.tele->r;
			f["in"] = b.tele->in;
			f["of"] = b.tele->of;
			d["tele"] = f;
		}
		if (b.hide.size()) {
			Array hd;
			for (int id : b.hide) hd.push_back(id);
			d["hide"] = hd;
		}
		bs.push_back(d);
	}
	for (const sim::BossMemo &m : bosses->memo()) {
		Dictionary d;
		d["id"] = bpg(m.id);
		d["state"] = bpg(m.state);
		d["left"] = m.left;
		memo.push_back(d);
	}
	Dictionary out;
	out["bosses"] = bs;
	out["memo"] = memo;
	const auto w = bosses->warden_snap();
	if (w) {
		Dictionary d;
		d["x"] = w->x;
		d["y"] = w->y;
		d["w"] = w->w;
		d["h"] = w->h;
		d["in"] = w->in;
		out["warden"] = d;
	} else out["warden"] = Variant();
	out["any"] = bosses->any();
	return out;
}

Array BossProbe::boss_loot(const String &boss, const String &seed) {
	Array out;
	for (const sim::BossDrop &d : sim::boss_loot(bp8(boss), bp8(seed))) {
		Dictionary o;
		o["def"] = bpg(d.def);
		o["rarity"] = bpg(d.rarity);
		if (d.trophy) o["trophy"] = true;
		out.push_back(o);
	}
	return out;
}

Dictionary BossProbe::boss_pile(const String &region, const String &run, const Dictionary &e) {
	sim::BossNote n;
	n.t = e["t"];
	n.kind = bp8(e["kind"]);
	n.boss = bp8(e["boss"]);
	n.x = e.get("x", 0.0); // e.x ?? 0
	n.y = e.get("y", 0.0);
	const sim::BossPile p = sim::boss_pile(bp8(region), bp8(run), n);
	Dictionary out;
	out["x"] = p.x;
	out["y"] = p.y;
	Array lots, items;
	for (const sim::Lot &l : p.lots) {
		Dictionary d;
		d["r"] = bpg(l.r);
		d["n"] = l.n;
		d["o"] = bpg(l.o);
		lots.push_back(d);
	}
	for (const sim::Item &it : p.items) items.push_back(sim::item_v(it));
	out["lots"] = lots;
	out["items"] = items;
	return out;
}

void BossProbe::_bind_methods() {
	ClassDB::bind_static_method("BossProbe", D_METHOD("create", "region", "w", "h", "seed", "water", "walls", "levels", "claimed"), &BossProbe::create);
	ClassDB::bind_method(D_METHOD("apply", "rec"), &BossProbe::apply);
	ClassDB::bind_method(D_METHOD("call_api", "call"), &BossProbe::call_api);
	ClassDB::bind_method(D_METHOD("tick", "t"), &BossProbe::tick);
	ClassDB::bind_method(D_METHOD("take_events"), &BossProbe::take_events);
	ClassDB::bind_method(D_METHOD("changed"), &BossProbe::changed);
	ClassDB::bind_method(D_METHOD("snaps"), &BossProbe::snaps);
	ClassDB::bind_static_method("BossProbe", D_METHOD("boss_loot", "boss", "seed"), &BossProbe::boss_loot);
	ClassDB::bind_static_method("BossProbe", D_METHOD("boss_pile", "region", "run", "e"), &BossProbe::boss_pile);
}

} // namespace godot
