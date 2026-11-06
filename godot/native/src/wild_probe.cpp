#include "wild_probe.h"

#include <array>

#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/variant/packed_string_array.hpp>

#include "captives.h"
#include "deeds.h"
#include "depth.h"
#include "food.h"
#include "honours.h"
#include "js_math.h"
#include "mobs.h"
#include "rng.h"
#include "sim_data.h"
#include "skills.h"
#include "soldiers.h"

namespace sim {

static std::string s8(const godot::Variant &v) { return godot::String(v).utf8().get_data(); }
static godot::String gs(const std::string &s) { return godot::String::utf8(s.c_str()); }
static godot::Variant opt_v(const std::optional<double> &v) { return v ? godot::Variant(*v) : godot::Variant(); }

// The host side of src/dev/vectors/mobs.ts: squads come from the vectors, the host's own reactions are mirrored here.
struct ReplayHost : MobHost {
	std::vector<MobSquad> sq;
	std::vector<bool> arrived_;
	godot::Array events;
	Mulberry rng{ 1 };
	std::vector<MobNode> nodes_;
	std::vector<MobTower> towers_;
	bool carts_on = false;
	std::vector<MobCart> carts_;
	std::vector<std::array<double, 4>> circles;

	void ev(std::initializer_list<godot::Variant> a) {
		godot::Array e;
		for (const godot::Variant &v : a) e.push_back(v);
		events.push_back(e);
	}

	std::vector<MobSquad> &squads() override { return sq; }
	int spawn(const std::string &kind, double count, double x, double y, const SpawnScale &k) override {
		const int id = int(sq.size());
		MobSquad s;
		s.id = id;
		s.owner = "mob";
		s.team = data().mobs.MOB_TEAM;
		s.alive = int(count);
		s.cx = x;
		s.cy = y;
		for (int i = 0; i < int(count); i++) {
			MobUnit u;
			const double hp = 10 * k.hp * (i == 0 && k.has_lead ? k.lead.hp : 1);
			u.id = id * 100 + i;
			u.x = x + ((i % 3) - 1) * 0.5;
			u.y = y + ((i / 3 % 3) - 1) * 0.5;
			u.hp = u.maxHp = hp;
			u.alive = true;
			s.units.push_back(u);
		}
		s.order = "hold";
		sq.push_back(s);
		arrived_.push_back(true);
		const godot::Variant nil;
		ev({ "spawn", gs(kind), count, x, y, k.hp, k.dmg, k.has_lead ? godot::Variant(k.lead.hp) : nil, k.has_lead ? godot::Variant(k.lead.dmg) : nil,
				k.has_lead ? opt_v(k.lead.armor) : nil });
		return id;
	}
	void order(const MobOrder &o) override {
		const godot::Variant nil;
		const bool mv = o.kind == "move";
		ev({ "order", gs(o.kind), o.squad, mv ? godot::Variant(o.x) : nil, mv ? godot::Variant(o.y) : nil, o.kind == "attack" ? godot::Variant(o.target) : nil,
				o.kind == "attackBuilding" ? godot::Variant(o.siege) : nil, o.kind == "formation" ? godot::Variant(gs(o.shape)) : nil });
		if (o.kind == "formation") return;
		MobSquad &s = sq[o.squad];
		s.order = o.kind;
		if (o.kind == "attack") s.target = o.target;
		arrived_[o.squad] = o.kind == "hold";
	}
	bool arrived(int id) override {
		const bool r = arrived_[id];
		ev({ "arr", id, r });
		return r;
	}
	std::vector<MobNode> nodes() override {
		ev({ "nodes" });
		return nodes_;
	}
	void lock_nodes(const std::vector<int> &ids, bool on) override {
		godot::Array a;
		for (int i : ids) a.push_back(i);
		ev({ "lock", a, on });
	}
	void claim(int team, double x, double y, double r, std::optional<int> from) override {
		ev({ "claim", team, x, y, r, from ? godot::Variant(*from) : godot::Variant() });
		circles.push_back({ double(team), x, y, r });
	}
	bool influenced(double x, double y) override {
		bool r = false;
		for (const auto &c : circles) r = r || js::pow(x - c[1], 2) + js::pow(y - c[2], 2) <= c[3] * c[3];
		ev({ "inf", x, y, r });
		return r;
	}
	double range(double lo, double hi) override { return lo + (hi - lo) * rng.next(); }
	void held(bool on) override { ev({ "held", on }); }
	void captain_down(int lair, int by) override { ev({ "capDown", lair, by }); }
	std::vector<MobTower> towers() override {
		ev({ "towers" });
		return towers_;
	}
	bool has_carts() const override { return carts_on; }
	std::vector<MobCart> carts() override {
		ev({ "carts" });
		return carts_;
	}
	void chief_down(int lair, const WarChief &chief, double x, double y, int by) override { ev({ "chiefDown", lair, gs(chief.id), x, y, by }); }
	void note(const MobNote &e) override { ev({ "note", gs(e.kind), e.lair, gs(e.mob), e.x, e.y }); }
};

} // namespace sim

namespace godot {

using sim::gs;
using sim::s8;

static sim::DepthRegion depth_region(const Dictionary &r) {
	sim::DepthRegion d;
	d.id = s8(r["id"]);
	d.has_depth = r.has("depth") && r["depth"].get_type() != Variant::NIL;
	if (d.has_depth) d.depth = r["depth"];
	return d;
}

double WildProbe::depth_of(const Dictionary &region) { return sim::depth_of(depth_region(region)); }

Array WildProbe::depth_rule(const Dictionary &region) {
	const sim::DepthRule &r = sim::depth_rule(depth_region(region));
	Array a;
	a.push_back(r.mob);
	a.push_back(r.respawn);
	a.push_back(r.claim.ticks);
	return a;
}

double WildProbe::wounded_share(double end, bool physician) { return sim::wounded_share(end, physician); }

Array WildProbe::gain_xp(double level, double xp, double points, double add) {
	int ups = 0;
	const sim::HeroXp h = sim::gain_xp({ level, xp, points }, add, ups);
	Array a;
	a.push_back(h.level);
	a.push_back(h.xp);
	a.push_back(h.points);
	a.push_back(ups);
	return a;
}

double WildProbe::active_cooldown(double wil) { return sim::active_cooldown(wil); }

Array WildProbe::legal_skills(const String &cls, double level, const Array &picked) {
	std::vector<std::string> p;
	for (int64_t i = 0; i < picked.size(); i++) p.push_back(s8(picked[i]));
	Array out;
	for (const std::string &id : sim::legal_skills(s8(cls), level, p)) out.push_back(gs(id));
	return out;
}

Array WildProbe::honours_of(const Array &persons, const Dictionary &ctx) {
	std::vector<sim::HonourPerson> ps;
	for (int64_t i = 0; i < persons.size(); i++) {
		const Array x = persons[i];
		ps.push_back({ s8(x[0]), int(x[1]), s8(x[2]) });
	}
	sim::HonourContext c;
	c.region = s8(ctx["region"]);
	c.chokepoint = ctx["chokepoint"];
	c.has_holder = ctx["holder"].get_type() != Variant::NIL;
	if (c.has_holder) c.holder = int(ctx["holder"]);
	const Array st = ctx["stormed"];
	for (int64_t i = 0; i < st.size(); i++) c.stormed.insert(int(st[i]));
	Array out;
	for (const auto &[pid, h] : sim::honours_of(ps, c)) {
		Array e;
		e.push_back(gs(pid));
		e.push_back(gs(h.name));
		e.push_back(gs(h.stat));
		out.push_back(e);
	}
	return out;
}

static Array deed_v(const sim::Deed &d) {
	Array a;
	a.push_back(gs(d.id));
	a.push_back(gs(d.name));
	return a;
}
static std::vector<sim::Deed> deeds_in(const Array &a) {
	std::vector<sim::Deed> out;
	for (int64_t i = 0; i < a.size(); i++) {
		const Array d = a[i];
		out.push_back({ s8(d[0]), s8(d[1]) });
	}
	return out;
}

Array WildProbe::plain_deed(const String &id) { return deed_v(sim::plain_deed(s8(id))); }
Array WildProbe::slayer_deed(const String &boss) { return deed_v(sim::slayer_deed(s8(boss))); }
Array WildProbe::mastery_deed(const String &region, const String &name) { return deed_v(sim::mastery_deed(s8(region), s8(name))); }

Array WildProbe::add_deeds(const Variant &have, const Array &had) {
	std::vector<sim::Deed> all, fresh;
	sim::add_deeds(have.get_type() == Variant::NIL ? std::vector<sim::Deed>{} : deeds_in(have), deeds_in(had), all, fresh);
	Array a, f, out;
	for (const sim::Deed &d : all) a.push_back(deed_v(d));
	for (const sim::Deed &d : fresh) f.push_back(deed_v(d));
	out.push_back(a);
	out.push_back(f);
	return out;
}

int WildProbe::hunger_stage(double sat) { return sim::hunger_stage(sat); }
double WildProbe::pace(double sat) { return sim::pace(sat); }
double WildProbe::blow(double sat) { return sim::blow(sat); }
double WildProbe::refuse_chance(double level) { return sim::refuse_chance(level); }
bool WildProbe::refuses(const String &id, double level) { return sim::refuses(s8(id), level); }
double WildProbe::ask_at(double until) { return sim::ask_at(until); }

PackedStringArray WildProbe::soul_regions(const String &from) {
	PackedStringArray out;
	for (const std::string &id : sim::soul_regions(s8(from))) out.push_back(gs(id));
	return out;
}

Variant WildProbe::mob_kind_of(const String &cls) {
	const std::string k = sim::mob_kind_of(s8(cls));
	return k.empty() ? Variant() : Variant(gs(k));
}

String WildProbe::foes_word(const String &cls, int n) { return gs(sim::foes_word(s8(cls), n)); }

void WildProbe::_bind_methods() {
	ClassDB::bind_static_method("WildProbe", D_METHOD("depth_of", "region"), &WildProbe::depth_of);
	ClassDB::bind_static_method("WildProbe", D_METHOD("depth_rule", "region"), &WildProbe::depth_rule);
	ClassDB::bind_static_method("WildProbe", D_METHOD("wounded_share", "end", "physician"), &WildProbe::wounded_share);
	ClassDB::bind_static_method("WildProbe", D_METHOD("gain_xp", "level", "xp", "points", "add"), &WildProbe::gain_xp);
	ClassDB::bind_static_method("WildProbe", D_METHOD("active_cooldown", "wil"), &WildProbe::active_cooldown);
	ClassDB::bind_static_method("WildProbe", D_METHOD("legal_skills", "cls", "level", "picked"), &WildProbe::legal_skills);
	ClassDB::bind_static_method("WildProbe", D_METHOD("honours_of", "persons", "ctx"), &WildProbe::honours_of);
	ClassDB::bind_static_method("WildProbe", D_METHOD("plain_deed", "id"), &WildProbe::plain_deed);
	ClassDB::bind_static_method("WildProbe", D_METHOD("slayer_deed", "boss"), &WildProbe::slayer_deed);
	ClassDB::bind_static_method("WildProbe", D_METHOD("mastery_deed", "region", "name"), &WildProbe::mastery_deed);
	ClassDB::bind_static_method("WildProbe", D_METHOD("add_deeds", "have", "had"), &WildProbe::add_deeds);
	ClassDB::bind_static_method("WildProbe", D_METHOD("hunger_stage", "sat"), &WildProbe::hunger_stage);
	ClassDB::bind_static_method("WildProbe", D_METHOD("pace", "sat"), &WildProbe::pace);
	ClassDB::bind_static_method("WildProbe", D_METHOD("blow", "sat"), &WildProbe::blow);
	ClassDB::bind_static_method("WildProbe", D_METHOD("refuse_chance", "level"), &WildProbe::refuse_chance);
	ClassDB::bind_static_method("WildProbe", D_METHOD("refuses", "id", "level"), &WildProbe::refuses);
	ClassDB::bind_static_method("WildProbe", D_METHOD("ask_at", "until"), &WildProbe::ask_at);
	ClassDB::bind_static_method("WildProbe", D_METHOD("soul_regions", "from"), &WildProbe::soul_regions);
	ClassDB::bind_static_method("WildProbe", D_METHOD("mob_kind_of", "cls"), &WildProbe::mob_kind_of);
	ClassDB::bind_static_method("WildProbe", D_METHOD("foes_word", "cls", "n"), &WildProbe::foes_word);
}

// ---------------------------------------------------------------- MobsProbe

MobsProbe::MobsProbe() = default;
MobsProbe::~MobsProbe() = default;

static std::optional<double> opt_d(const Dictionary &d, const char *k) {
	return d.has(k) && d[k].get_type() != Variant::NIL ? std::optional<double>(double(d[k])) : std::nullopt;
}
static std::optional<std::string> opt_s(const Dictionary &d, const char *k) {
	return d.has(k) && d[k].get_type() != Variant::NIL ? std::optional<std::string>(s8(d[k])) : std::nullopt;
}

Ref<MobsProbe> MobsProbe::create(const Dictionary &meta, double w, double h, int64_t seed, const Array &nodes, const Array &towers, const Variant &carts) {
	Ref<MobsProbe> p;
	p.instantiate();
	p->region = std::make_unique<sim::MobRegion>();
	sim::MobRegion &r = *p->region;
	r.depth = depth_region(meta);
	const Array lairs = meta.get("lairs", Array());
	for (int64_t i = 0; i < lairs.size(); i++) {
		const Dictionary d = lairs[i];
		sim::LairEntry e;
		e.kind = s8(d["kind"]);
		e.x = d["x"];
		e.y = d["y"];
		e.count = opt_d(d, "count");
		e.captain = d.get("captain", false);
		e.chief = opt_s(d, "chief");
		r.lairs.push_back(e);
	}
	const Array cps = meta.get("claimPoints", Array());
	for (int64_t i = 0; i < cps.size(); i++) {
		const Dictionary d = cps[i];
		sim::ClaimEntry c;
		c.x = d["x"];
		c.y = d["y"];
		const Array l = d["lairs"];
		for (int64_t k = 0; k < l.size(); k++) c.lairs.push_back(int(l[k]));
		c.r = opt_d(d, "r");
		r.claimPoints.push_back(c);
	}
	p->host = std::make_unique<sim::ReplayHost>();
	sim::ReplayHost &host = *p->host;
	host.w = w;
	host.h = h;
	host.rng = sim::Mulberry(uint32_t(seed));
	for (int64_t i = 0; i < nodes.size(); i++) {
		const Array n = nodes[i];
		host.nodes_.push_back({ int(i), n[0], n[1], bool(n[2]) });
	}
	for (int64_t i = 0; i < towers.size(); i++) {
		const Dictionary t = towers[i];
		host.towers_.push_back({ int(t["id"]), t["x"], t["y"] });
	}
	host.carts_on = carts.get_type() != Variant::NIL;
	if (host.carts_on) {
		const Array cs = carts;
		for (int64_t i = 0; i < cs.size(); i++) {
			const Dictionary c = cs[i];
			host.carts_.push_back({ int(c["id"]), c["x"], c["y"], int(c["team"]) });
		}
	}
	p->mobs = std::make_unique<sim::Mobs>(r, host);
	return p;
}

void MobsProbe::apply(const Array &deltas) {
	auto &sq = host->sq;
	for (int64_t i = 0; i < deltas.size(); i++) {
		const Array d = deltas[i];
		const int id = int(d[0]);
		if (id >= int(sq.size())) {
			sq.resize(id + 1);
			host->arrived_.resize(id + 1, true);
		}
		sim::MobSquad &s = sq[id];
		s.id = id;
		s.owner = s8(d[1]);
		s.team = int(d[2]);
		s.alive = int(d[3]);
		s.civ = int(d[4]) != 0;
		s.cx = d[5];
		s.cy = d[6];
		s.order = s8(d[7]);
		s.target = int(d[8]);
		s.claimPt = int(d[9]);
		host->arrived_[id] = int(d[10]) != 0;
		const Array u = d[11];
		s.units.clear();
		for (int64_t k = 0; k + 5 < u.size(); k += 6) s.units.push_back({ int(u[k]), u[k + 1], u[k + 2], u[k + 3], u[k + 4], int(u[k + 5]) != 0 });
	}
}

Variant MobsProbe::call_api(const Array &c) {
	const String name = c[0];
	if (name == "spawn") {
		mobs->spawn();
		return Variant();
	}
	if (name == "add") {
		const Dictionary d = c[1];
		sim::AddLair a;
		a.kind = s8(d["kind"]);
		a.x = d["x"];
		a.y = d["y"];
		a.count = opt_d(d, "count");
		a.lead = d.get("lead", false);
		a.chief = opt_s(d, "chief");
		return mobs->add(a);
	}
	if (name == "setBoss" || name == "bossDown") {
		const std::optional<std::string> id = c[1].get_type() == Variant::NIL ? std::nullopt : std::optional<std::string>(s8(c[1]));
		if (name == "setBoss") mobs->set_boss(id);
		else mobs->boss_down(id);
		return Variant();
	}
	if (name == "grant") {
		mobs->grant(int(c[1]), int(c[2]));
		return Variant();
	}
	if (name == "claim") {
		const int squad = int(c[1]), point = int(c[2]);
		const bool ok = mobs->start_claim(squad, point);
		if (ok) {
			host->sq[squad].order = "claimRegion";
			host->sq[squad].claimPt = point;
			host->arrived_[squad] = false;
		}
		return ok;
	}
	ERR_FAIL_V_MSG(Variant(), "unknown call " + name);
}

void MobsProbe::tick(double t) { mobs->tick(t); }

Array MobsProbe::take_events() {
	Array e = host->events;
	host->events = Array();
	return e;
}

double MobsProbe::hp_sum() const {
	double hp = 0;
	for (const sim::MobSquad &s : host->sq)
		for (const sim::MobUnit &u : s.units) hp += u.hp;
	return hp;
}

Dictionary MobsProbe::snaps() {
	Array lairs, claims, bosses, hps;
	for (const sim::LairSnap &l : mobs->lair_snaps()) {
		Dictionary d;
		d["id"] = l.id;
		d["kind"] = gs(l.kind);
		d["x"] = l.x;
		d["y"] = l.y;
		d["squad"] = l.squad;
		d["alive"] = l.alive;
		d["count"] = l.count;
		d["state"] = gs(l.state);
		d["aggro"] = l.aggro;
		d["leash"] = l.leash;
		d["guard"] = l.guard;
		d["nodes"] = l.nodes;
		if (l.captain) d["captain"] = *l.captain;
		if (l.chief) {
			Dictionary c;
			c["id"] = gs(l.chief->id);
			c["name"] = gs(l.chief->name);
			c["title"] = gs(l.chief->title);
			c["unit"] = l.chief->unit;
			c["alive"] = l.chief->alive;
			c["scale"] = l.chief->scale;
			c["tint"] = l.chief->tint;
			d["chief"] = c;
		}
		if (l.respawnIn) d["respawnIn"] = *l.respawnIn;
		lairs.push_back(d);
	}
	for (const sim::ClaimSnap &c : mobs->claim_snaps()) {
		Dictionary d;
		d["id"] = c.id;
		d["x"] = c.x;
		d["y"] = c.y;
		d["team"] = c.team;
		d["squad"] = c.squad;
		d["progress"] = c.progress;
		Array l;
		for (int i : c.lairs) l.push_back(i);
		d["lairs"] = l;
		d["men"] = c.men;
		d["players"] = c.players;
		d["state"] = gs(c.state);
		if (!c.taking.empty()) {
			d["taking"] = gs(c.taking);
			d["by"] = c.by;
		}
		claims.push_back(d);
	}
	for (const sim::BossGate &g : mobs->bosses()) {
		Array b;
		b.push_back(gs(g.id));
		b.push_back(g.alive);
		bosses.push_back(b);
	}
	for (const sim::MobSquad &s : host->sq)
		for (const sim::MobUnit &u : s.units) hps.push_back(u.hp);
	Dictionary out;
	out["lairs"] = lairs;
	out["claims"] = claims;
	out["held"] = mobs->held();
	out["claimed"] = mobs->claimed();
	out["added"] = mobs->added();
	out["bosses"] = bosses;
	out["hps"] = hps;
	return out;
}

void MobsProbe::_bind_methods() {
	ClassDB::bind_static_method("MobsProbe", D_METHOD("create", "region", "w", "h", "seed", "nodes", "towers", "carts"), &MobsProbe::create);
	ClassDB::bind_method(D_METHOD("apply", "deltas"), &MobsProbe::apply);
	ClassDB::bind_method(D_METHOD("call_api", "call"), &MobsProbe::call_api);
	ClassDB::bind_method(D_METHOD("tick", "t"), &MobsProbe::tick);
	ClassDB::bind_method(D_METHOD("take_events"), &MobsProbe::take_events);
	ClassDB::bind_method(D_METHOD("hp_sum"), &MobsProbe::hp_sum);
	ClassDB::bind_method(D_METHOD("snaps"), &MobsProbe::snaps);
}

} // namespace godot
