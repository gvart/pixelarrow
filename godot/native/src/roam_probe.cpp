#include "roam_probe.h"

#include <cmath>

#include <godot_cpp/core/class_db.hpp>

#include "civilians.h"
#include "js_math.h"
#include "roam.h"
#include "sim_data.h"

namespace sim {

static std::string r8(const godot::Variant &v) { return godot::String(v).utf8().get_data(); }
static godot::String rs(const std::string &s) { return godot::String::utf8(s.c_str()); }
static double rq(double v) { return js::round(v * 64) / 64; }

// The host side of src/dev/vectors/roam.ts: squads and wagons come from the vectors, the host's own reactions to the
// controller's calls are mirrored here.
struct RoamReplayHost : RoamHost {
	std::vector<RoamSquad> sq;
	std::vector<bool> arrived_, fighting;
	std::vector<RoamCart> carts; // id 500 + index
	godot::Array events;
	int cap = 999;

	void ev(std::initializer_list<godot::Variant> a) {
		godot::Array e;
		for (const godot::Variant &v : a) e.push_back(v);
		events.push_back(e);
	}

	std::vector<RoamSquad> &squads() override { return sq; }
	int spawn(int team, const std::string &owner, const std::string &cls, double count, double x, double y, const RoamScale &k) override {
		ev({ "spawn", team, rs(owner), rs(cls), count, x, y, k.hp, k.dmg });
		if (int(sq.size()) >= cap) return -1;
		RoamSquad s;
		s.id = int(sq.size());
		s.owner = owner;
		s.team = team;
		s.alive = int(count);
		s.cx = x;
		s.cy = y;
		const double hp = 10 * k.hp;
		for (int i = 0; i < int(count); i++) s.units.push_back({ x, y, hp, hp, true });
		s.order = "hold";
		s.civ = cls.rfind("civ_", 0) == 0;
		s.meek = team == data().economy.NEUTRAL_TEAM;
		sq.push_back(s);
		arrived_.push_back(true);
		fighting.push_back(false);
		return s.id;
	}
	void order(const RoamOrder &o) override {
		const godot::Variant nil;
		const bool mv = o.kind == "move";
		ev({ "order", rs(o.kind), o.squad, mv ? godot::Variant(o.x) : nil, mv ? godot::Variant(o.y) : nil, o.kind == "attack" ? godot::Variant(o.target) : nil,
				o.kind == "crew" ? godot::Variant(o.siege) : nil, o.kind == "escort" ? godot::Variant(o.cart) : nil, o.kind == "formation" ? godot::Variant(rs(o.shape)) : nil });
		if (o.kind == "formation") return;
		RoamSquad &s = sq[o.squad];
		s.order = o.kind;
		if (o.kind == "attack") s.target = o.target;
		arrived_[o.squad] = o.kind == "hold";
	}
	bool arrived(int id) override {
		const bool r = arrived_[id];
		ev({ "arr", id, r });
		return r;
	}
	std::vector<double> route(bool cart, double x0, double y0, double x1, double y1) override {
		ev({ "route", cart, x0, y0, x1, y1 });
		if (js::hypot(x1 - x0, y1 - y0) < 1) return { x0, y0 };
		const double mx = rq((x0 + x1) / 2 + (y1 - y0) * 0.2), my = rq((y0 + y1) / 2 - (x1 - x0) * 0.2);
		if (cart && std::fmod(std::floor(x1) + std::floor(y1), 5) == 0) return { x0, y0, mx, my };
		return { x0, y0, mx, my, x1, y1 };
	}
	std::pair<double, double> open(double x, double y) override { return { std::floor(x) + 0.5, std::floor(y) + 0.5 }; }
	int cart(double x, double y, const RoamGoods &goods) override {
		const int id = 500 + int(carts.size());
		godot::Array g;
		for (const auto &[k, n] : goods) g.push_back(rs(k)), g.push_back(n);
		ev({ "cart", id, x, y, g });
		carts.push_back({ x, y, data().economy.NEUTRAL_TEAM, true, false });
		return id;
	}
	std::optional<RoamCart> cart_at(int id) override {
		const int i = id - 500;
		return i >= 0 && i < int(carts.size()) ? std::optional<RoamCart>(carts[i]) : std::nullopt;
	}
	void pay(const std::string &owner, int team, double x, double y, double coin) override { ev({ "pay", rs(owner), team, x, y, coin }); }
	std::optional<std::pair<double, double>> fight_near(double x, double y, double r) override {
		std::optional<std::pair<double, double>> out;
		for (const RoamSquad &s : sq)
			if (s.alive > 0 && fighting[s.id] && js::pow(s.cx - x, 2) + js::pow(s.cy - y, 2) <= r * r) {
				out = std::make_pair(s.cx, s.cy);
				break;
			}
		godot::Variant o;
		if (out) {
			godot::Array a;
			a.push_back(out->first);
			a.push_back(out->second);
			o = a;
		}
		ev({ "fight", x, y, r, o });
		return out;
	}
	void note(const RoamNote &e) override {
		if (e.kind == "caravanPaid") ev({ "note", rs(e.kind), rs(e.owner), e.team, e.coin, e.x, e.y });
		else ev({ "note", rs(e.kind), e.caravan, e.by });
	}
};

} // namespace sim

namespace godot {

using sim::r8;
using sim::rs;

RoamProbe::RoamProbe() = default;
RoamProbe::~RoamProbe() = default;

static std::optional<double> ropt(const Dictionary &d, const char *k) {
	return d.has(k) && d[k].get_type() != Variant::NIL ? std::optional<double>(double(d[k])) : std::nullopt;
}

Ref<RoamProbe> RoamProbe::create(const Dictionary &meta, double w, double h, double seed, int cap) {
	Ref<RoamProbe> p;
	p.instantiate();
	p->region = std::make_unique<sim::RoamRegion>();
	sim::RoamRegion &r = *p->region;
	r.depth.id = r8(meta["id"]);
	r.depth.has_depth = meta.has("depth") && meta["depth"].get_type() != Variant::NIL;
	if (r.depth.has_depth) r.depth.depth = meta["depth"];
	const Array es = meta.get("entries", Array());
	for (int64_t i = 0; i < es.size(); i++) {
		const Dictionary e = es[i];
		r.entries.push_back({ r8(e["side"]), e["x"], e["y"], e["w"], e["h"] });
	}
	const Array lairs = meta.get("lairs", Array());
	for (int64_t i = 0; i < lairs.size(); i++) {
		const Dictionary d = lairs[i];
		sim::LairEntry e;
		e.kind = r8(d["kind"]);
		e.x = d["x"];
		e.y = d["y"];
		e.captain = d.get("captain", false);
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
		r.claimPoints.push_back(c);
	}
	const Array safe = meta.get("safe", Array());
	for (int64_t i = 0; i < safe.size(); i++) {
		const Dictionary s = safe[i];
		r.safe.push_back({ s["x"], s["y"], s["w"], s["h"] });
	}
	const Array pre = meta.get("prebuilt", Array());
	for (int64_t i = 0; i < pre.size(); i++) {
		const Dictionary b = pre[i];
		sim::RoamPrebuilt e;
		e.x = b["x"];
		e.y = b["y"];
		const std::optional<double> cl = ropt(b, "claim");
		if (cl) e.claim = int(*cl);
		e.landmark = b.get("landmark", false);
		r.prebuilt.push_back(e);
	}
	p->host = std::make_unique<sim::RoamReplayHost>();
	p->host->w = w;
	p->host->h = h;
	p->host->cap = cap;
	p->roam = std::make_unique<sim::Roam>(r, seed, *p->host);
	return p;
}

void RoamProbe::apply(const Array &squads, const Array &carts) {
	auto &sq = host->sq;
	for (int64_t i = 0; i < squads.size(); i++) {
		const Array d = squads[i];
		const int id = int(d[0]);
		if (id >= int(sq.size())) {
			sq.resize(id + 1);
			host->arrived_.resize(id + 1, true);
			host->fighting.resize(id + 1, false);
		}
		sim::RoamSquad &s = sq[id];
		s.id = id;
		s.owner = r8(d[1]);
		s.team = int(d[2]);
		s.alive = int(d[3]);
		s.civ = int(d[4]) != 0;
		s.flee = int(d[5]) != 0;
		s.meek = int(d[6]) != 0;
		s.angry = int(d[7]);
		s.cx = d[8];
		s.cy = d[9];
		s.order = r8(d[10]);
		s.target = int(d[11]);
		host->arrived_[id] = int(d[12]) != 0;
		host->fighting[id] = int(d[13]) != 0;
		const Array u = d[14];
		s.units.clear();
		for (int64_t k = 0; k + 2 < u.size(); k += 3) s.units.push_back({ s.cx, s.cy, u[k], u[k + 1], int(u[k + 2]) != 0 });
	}
	for (int64_t i = 0; i < carts.size(); i++) {
		const Array c = carts[i];
		const int k = int(c[0]) - 500;
		if (k >= int(host->carts.size())) host->carts.resize(k + 1);
		host->carts[k] = { c[1], c[2], int(c[3]), int(c[4]) != 0, int(c[5]) != 0 };
	}
}

Variant RoamProbe::call_api(const Array &c) {
	const String name = c[0];
	if (name == "spawn") {
		roam->spawn();
		return Variant();
	}
	if (name == "any") return roam->any();
	if (name == "provoke") {
		const auto opt = [](const Variant &v) { return v.get_type() == Variant::NIL ? std::nullopt : std::optional<int>(int(v)); };
		roam->provoke(int(c[1]), opt(c[2]), opt(c[3]));
		return Variant();
	}
	if (name == "add") {
		const Dictionary d = c[1];
		sim::RoamDef a;
		a.kind = r8(d["kind"]);
		if (d.has("mob")) a.mob = r8(d["mob"]);
		if (d.has("cls")) a.cls = r8(d["cls"]);
		a.count = ropt(d, "count");
		a.guards = ropt(d, "guards");
		a.at = ropt(d, "at");
		a.pilgrim = d.get("pilgrim", false);
		const Array route = d["route"];
		for (int64_t i = 0; i < route.size(); i++) {
			const Array pt = route[i];
			a.route.push_back({ pt[0], pt[1] });
		}
		return roam->add_group(a);
	}
	ERR_FAIL_V_MSG(Variant(), "unknown call " + name);
}

void RoamProbe::tick(double t) { roam->tick(t); }

Array RoamProbe::take_events() {
	Array e = host->events;
	host->events = Array();
	return e;
}

Array RoamProbe::angry() const {
	Array a;
	for (const sim::RoamSquad &s : host->sq)
		if (s.angry) a.push_back(s.id), a.push_back(s.angry);
	return a;
}

Dictionary RoamProbe::snaps() const {
	Array out;
	for (const sim::RoamSnapOut &g : roam->snaps()) {
		Dictionary d;
		d["id"] = g.id;
		d["kind"] = rs(g.kind);
		Array s;
		for (int id : g.squads) s.push_back(id);
		d["squads"] = s;
		d["state"] = rs(g.state);
		if (!g.mob.empty()) d["mob"] = rs(g.mob);
		if (g.cart >= 0) d["cart"] = g.cart;
		if (g.pilgrim) d["pilgrim"] = true;
		if (g.asleep) d["asleep"] = true;
		out.push_back(d);
	}
	Dictionary r;
	r["any"] = roam->any();
	r["snaps"] = out;
	return r;
}

void RoamProbe::_bind_methods() {
	ClassDB::bind_static_method("RoamProbe", D_METHOD("create", "region", "w", "h", "seed", "cap"), &RoamProbe::create);
	ClassDB::bind_method(D_METHOD("apply", "squads", "carts"), &RoamProbe::apply);
	ClassDB::bind_method(D_METHOD("call_api", "call"), &RoamProbe::call_api);
	ClassDB::bind_method(D_METHOD("tick", "t"), &RoamProbe::tick);
	ClassDB::bind_method(D_METHOD("take_events"), &RoamProbe::take_events);
	ClassDB::bind_method(D_METHOD("angry"), &RoamProbe::angry);
	ClassDB::bind_method(D_METHOD("snaps"), &RoamProbe::snaps);
}

// ---------------------------------------------------------------- CivProbe

static std::optional<sim::Item> item_in(const Variant &v) {
	if (v.get_type() == Variant::NIL) return std::nullopt;
	const Dictionary d = v;
	sim::Item it;
	it.uid = r8(d.get("uid", ""));
	it.def = r8(d["def"]);
	it.rarity = r8(d["rarity"]);
	it.cond = d.get("cond", 100);
	if (d.has("aff")) it.aff = r8(d["aff"]);
	return it;
}
static Dictionary item_out(const sim::Item &it) {
	Dictionary d;
	d["uid"] = rs(it.uid);
	d["def"] = rs(it.def);
	d["rarity"] = rs(it.rarity);
	d["cond"] = it.cond;
	if (it.aff) d["aff"] = rs(*it.aff);
	return d;
}

Variant CivProbe::civ_job(const String &cls) {
	const std::string j = sim::civ_job(r8(cls));
	return j.empty() ? Variant() : Variant(rs(j));
}
Variant CivProbe::clip(const String &job) {
	const std::string c = sim::civ_clip(r8(job));
	return c.empty() ? Variant() : Variant(rs(c));
}
bool CivProbe::at_building(const String &job) { return sim::at_building(r8(job)); }
double CivProbe::work_rate(double level, const Variant &tool) {
	const auto it = item_in(tool);
	return sim::work_rate(level, it ? &*it : nullptr);
}
Array CivProbe::tool_mods(const Variant &tool) {
	const auto it = item_in(tool);
	const sim::ToolMods m = sim::tool_mods(it ? &*it : nullptr);
	Array a;
	a.push_back(m.deft);
	a.push_back(m.bountiful);
	return a;
}
Dictionary CivProbe::fresh_civilian(const String &cls, const Variant &id) {
	const sim::CivHero h = sim::fresh_civilian(r8(cls), id.get_type() == Variant::NIL ? std::nullopt : std::optional<std::string>(r8(id)));
	Dictionary d, look, equip, attrs;
	d["id"] = rs(h.id);
	d["name"] = rs(h.name);
	d["culture"] = rs(h.culture);
	d["level"] = h.level;
	d["xp"] = h.xp;
	d["traits"] = Array();
	look["skin"] = h.look.skin;
	look["hair"] = h.look.hair;
	look["hairStyle"] = h.look.hairStyle;
	look["beard"] = h.look.beard;
	look["tunic"] = rs(h.look.tunic);
	d["look"] = look;
	equip["weapon"] = item_out(h.weapon);
	d["equip"] = equip;
	d["kills"] = h.kills;
	d["battles"] = h.battles;
	d["group"] = h.group;
	for (const auto &[k, v] : h.attrs) attrs[rs(k)] = v;
	d["attrs"] = attrs;
	d["points"] = h.points;
	d["perks"] = Array();
	d["wound"] = h.wound;
	d["cls"] = rs(h.cls);
	return d;
}
Variant CivProbe::wornest(const Array &equip) {
	sim::CivEquip e;
	for (int64_t i = 0; i < equip.size(); i++) {
		const Array s = equip[i];
		e.push_back({ r8(s[0]), item_in(s[1]) });
	}
	const auto w = sim::wornest(e);
	if (!w) return Variant();
	Array a;
	a.push_back(rs(w->first));
	a.push_back(item_out(w->second));
	return a;
}
double CivProbe::fall_share(double ws, bool physician, double bandages, bool venom) { return sim::fall_share(ws, physician, bandages, venom); }

Array CivProbe::consts() {
	const sim::CivilianTables &c = sim::data().civilians;
	Array a;
	for (double v : { c.REGION_CAP, c.CIV.quota, c.CIV.fleeR, c.CIV.calmR, c.CIV.calm, c.CIV.fleeSpeed, c.CIV.away, c.CIV.every, c.CIV.at, c.CIV.dmg, c.CIV.armor, c.CIV.hp, c.CIV_QUOTA,
				 c.COOK.batch, c.COOK.food, c.COOK.salt, c.COOK.rations, c.COOK.saltBonus, c.COOK.feedR, c.COOK.fedTicks, c.COOK.inn, c.COOK.heal,
				 c.SMITH.batch, c.SMITH.copper, c.SMITH.tin, c.SMITH.bronze, c.SMITH.repairR, c.SMITH.repair, c.ENGINEER.build, c.FORAGER.gather,
				 c.PHYSICIAN.r, c.PHYSICIAN.surgeonR, c.PHYSICIAN.heal, c.PHYSICIAN.near, c.FORAGE.woodsman, c.FORAGE.prospector, c.FORAGE.pitchman, c.FORAGE.masterBuilder,
				 c.HUNT.r, c.HUNT.hides, c.REMEDY.bandage, c.REMEDY.feedR, c.REMEDY.theriac, c.VENOM.ticks, c.VENOM.share, c.CIV_XP, c.WORK.perLevel, c.WORK.perTier, c.WORK.perRarity,
				 sim::flee_pace(true), sim::flee_pace(false) })
		a.push_back(v);
	return a;
}

void CivProbe::_bind_methods() {
	ClassDB::bind_static_method("CivProbe", D_METHOD("civ_job", "cls"), &CivProbe::civ_job);
	ClassDB::bind_static_method("CivProbe", D_METHOD("clip", "job"), &CivProbe::clip);
	ClassDB::bind_static_method("CivProbe", D_METHOD("at_building", "job"), &CivProbe::at_building);
	ClassDB::bind_static_method("CivProbe", D_METHOD("work_rate", "level", "tool"), &CivProbe::work_rate);
	ClassDB::bind_static_method("CivProbe", D_METHOD("tool_mods", "tool"), &CivProbe::tool_mods);
	ClassDB::bind_static_method("CivProbe", D_METHOD("fresh_civilian", "cls", "id"), &CivProbe::fresh_civilian);
	ClassDB::bind_static_method("CivProbe", D_METHOD("wornest", "equip"), &CivProbe::wornest);
	ClassDB::bind_static_method("CivProbe", D_METHOD("fall_share", "ws", "physician", "bandages", "venom"), &CivProbe::fall_share);
	ClassDB::bind_static_method("CivProbe", D_METHOD("consts"), &CivProbe::consts);
}

} // namespace godot
