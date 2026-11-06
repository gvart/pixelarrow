#include "landmarks.h"

#include "professions.h"

#include <algorithm>
#include <cmath>
#include <limits>

#include <godot_cpp/core/class_db.hpp>

#include "sim_data.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::Variant;

static std::string utf8(const Variant &v) { return godot::String(v).utf8().get_data(); }

static LmGoods goods_from(const Dictionary &d) {
	LmGoods out;
	const Array ks = d.keys();
	for (int64_t i = 0; i < ks.size(); i++) out.push_back({ utf8(ks[i]), d[ks[i]] });
	return out;
}

void load_landmark_tables(const Dictionary &tables, LandmarkTables &out) {
	if (tables.has("landmarks")) {
		const Dictionary l = Dictionary(tables["landmarks"])["LANDMARK"];
		out.capture = l["capture"];
		out.garrison = l["garrison"];
		out.every = l["every"];
	}
	if (tables.has("war_landmarks")) {
		const Array a = Dictionary(tables["war_landmarks"])["LANDMARKS"];
		for (int64_t i = 0; i < a.size(); i++) {
			const Dictionary d = a[i], r = d["restore"];
			Landmark lm;
			lm.id = utf8(d["id"]);
			lm.name = utf8(d["name"]);
			lm.region = utf8(d["region"]);
			if (d.has("rare")) lm.rare = utf8(d["rare"]);
			lm.bulk = goods_from(r["bulk"]);
			lm.rare_goods = goods_from(r["rare"]);
			lm.engineer = d["engineer"];
			out.list.push_back(lm);
		}
	}
}

static const LandmarkTables &L() { return data().landmarks; }

const Landmark *landmark_of_region(const std::string &region) {
	for (const Landmark &l : L().list)
		if (l.region == region) return &l;
	return nullptr;
}

LmGoods restore_cost(const std::string &id) {
	for (const Landmark &l : L().list) {
		if (l.id != id) continue;
		LmGoods out = l.bulk; // { ...bulk, ...rare }: a key again keeps its place, takes the later value
		for (const auto &g : l.rare_goods) {
			auto it = std::find_if(out.begin(), out.end(), [&](const auto &e) { return e.first == g.first; });
			if (it != out.end()) it->second = g.second;
			else out.push_back(g);
		}
		return out;
	}
	return {};
}

bool can_lead(const Landmark &lm, double level, const std::vector<std::string> *perks) {
	if (level < lm.engineer) return false;
	const std::unordered_set<std::string> held = held_nodes("engineer", perks ? *perks : std::vector<std::string>{});
	const auto has = [&](const char *k) { return held.count(k) > 0; };
	if (!has("fortifier") || !has("masterBuilder")) return false;
	return lm.engineer < 10 || has("poliorcetes") || has("archimedes");
}

Landmarks::Landmarks(const std::string &region_id, LmWorks works, LmHost host) :
		lm(landmark_of_region(region_id)), works(std::move(works)), host(std::move(host)) {}

std::vector<const LmPiece *> Landmarks::pieces() const {
	std::vector<const LmPiece *> out;
	for (const LmPiece &b : works.prebuilt())
		if (b.landmark && !b.gone) out.push_back(&b);
	return out;
}

void Landmarks::bounds() {
	if (has_box) return;
	const double inf = std::numeric_limits<double>::infinity();
	double x0 = inf, y0 = inf, x1 = -inf, y1 = -inf;
	for (const LmPiece *b : pieces())
		for (size_t k = 0; k + 1 < b->tiles.size(); k += 2)
			(x0 = std::min(x0, b->tiles[k])), (y0 = std::min(y0, b->tiles[k + 1])), (x1 = std::max(x1, b->tiles[k] + 1)), (y1 = std::max(y1, b->tiles[k + 1] + 1));
	box[0] = x0, box[1] = y0, box[2] = x1, box[3] = y1;
	has_box = true;
}

int Landmarks::holder_now() const {
	std::vector<std::pair<int, int>> n; // a Map: team -> pieces, in first-seen order
	for (const LmPiece *b : pieces()) {
		if (b->ruin || !host.real(b->team)) continue;
		auto it = std::find_if(n.begin(), n.end(), [&](const auto &e) { return e.first == b->team; });
		if (it != n.end()) it->second++;
		else n.push_back({ b->team, 1 });
	}
	int best = -1, bn = 0;
	for (const auto &[t, k] : n)
		if (k > bn || (k == bn && t < best)) (best = t), (bn = k);
	return best;
}

std::string Landmarks::state_now() const { return host.guarded() ? "guarded" : holder < 0 ? "unclaimed" : restored ? "restored" : "damaged"; }

const LmPiece *Landmarks::keep() const {
	const LmPiece *a = nullptr;
	for (const LmPiece *b : pieces()) a = !a || b->maxHp > a->maxHp ? b : a;
	return a;
}

void Landmarks::update(double t) {
	const int h = holder_now();
	if (h != holder) {
		if (h >= 0 && !captured) {
			captured = true;
			works.landmark_capture(L().capture);
		}
		holder = h;
	}
	bounds();
	const double x0 = box[0], y0 = box[1], x1 = box[2], y1 = box[3];
	men = foes = 0;
	for (const LmUnit &u : host.units()) {
		if (!u.alive || !u.civ.empty() || u.x < x0 || u.y < y0 || u.x >= x1 || u.y >= y1 || !host.real(u.team)) continue;
		if (u.team == holder) men++;
		else foes++;
	}
	const std::string s = state_now();
	if (s != state) {
		state = s;
		host.note({ "landmark", t, lm->id, state, "", holder, 0 });
	}
}

bool Landmarks::any() const { return lm && !pieces().empty(); }

void Landmarks::load_root(const LandmarksRoot &o) {
	captured = o.captured;
	restored = o.restored;
	holder = o.holder;
	men = o.men;
	foes = o.foes;
	state = o.state;
}

void Landmarks::tick(double t) {
	if (!lm || std::fmod(t, L().every) != 0 || pieces().empty()) return;
	update(t);
}

bool Landmarks::restore(int squad, double t) {
	const LmSquad *s = host.squad(squad);
	if (!lm || !s) return false;
	const auto refuse = [&](const char *why) {
		host.note({ "landmarkRefused", t, lm->id, "", why, 0, squad });
		return false;
	};
	update(t);
	if (restored || holder < 0 || s->team != holder || host.guarded()) return refuse("held");
	if (!std::any_of(s->units.begin(), s->units.end(), [&](const LmUnit &u) {
				return u.alive && u.civ == "engineer" && u.person && can_lead(*lm, u.person->level, u.person->perks ? &*u.person->perks : nullptr);
			}))
		return refuse("engineer");
	const LmPiece *k = keep();
	const double kx = k->x, ky = k->y; // the works call may change the pieces
	if (!works.landmark_restore(holder, restore_cost(lm->id), kx, ky)) return refuse("goods");
	restored = true;
	update(t);
	return true;
}

std::optional<LandmarkSnap> Landmarks::snap() const {
	if (!lm) return std::nullopt;
	const std::vector<const LmPiece *> ps = pieces();
	if (ps.empty()) return std::nullopt;
	int up = 0;
	double sum = 0;
	for (const LmPiece *b : ps) {
		if (b->ruin || b->state == "destroyed") continue;
		up++;
		sum = sum + b->hp / std::max(1.0, b->maxHp);
	}
	LandmarkSnap o;
	o.id = lm->id;
	o.holder = holder;
	o.state = state;
	o.hp = sum / std::max(1.0, double(ps.size()));
	o.ruined = int(ps.size()) - up;
	o.pieces = int(ps.size());
	o.men = men;
	o.foes = foes;
	o.garrisoned = state == "restored" && men >= L().garrison && foes == 0;
	return o;
}

} // namespace sim

namespace godot {

static std::string u8(const Variant &v) { return String(v).utf8().get_data(); }
static String gs(const std::string &s) { return String::utf8(s.c_str()); }

static Dictionary goods_to(const sim::LmGoods &g) {
	Dictionary d;
	for (const auto &[k, v] : g) d[gs(k)] = v;
	return d;
}

// changes to the pieces: [index, team, hp, state, ruin, gone] each
static void apply_changes(std::vector<sim::LmPiece> &ps, const Array &delta) {
	for (int64_t i = 0; i < delta.size(); i++) {
		const Array d = delta[i];
		sim::LmPiece &p = ps[int(d[0])];
		p.team = int(d[1]);
		p.hp = d[2];
		p.state = u8(d[3]);
		p.ruin = bool(d[4]);
		p.gone = bool(d[5]);
	}
}

static sim::LmUnit unit_from(const Dictionary &d) {
	sim::LmUnit u;
	u.x = d["x"];
	u.y = d["y"];
	u.alive = d["alive"].booleanize();
	const Variant c = d.get("civ", Variant());
	if (c.get_type() == Variant::STRING) u.civ = u8(c);
	u.team = int(d["team"]);
	const Variant p = d.get("person", Variant());
	if (p.get_type() == Variant::DICTIONARY) {
		sim::LmUnit::Person o;
		o.level = Dictionary(p)["level"];
		const Variant ks = Dictionary(p).get("perks", Variant());
		if (ks.get_type() == Variant::ARRAY) {
			std::vector<std::string> v;
			const Array a = ks;
			for (int64_t i = 0; i < a.size(); i++) v.push_back(u8(a[i]));
			o.perks = v;
		}
		u.person = o;
	}
	return u;
}

static Array rec(const char *name) {
	Array c;
	c.push_back(name);
	return c;
}

static std::unique_ptr<sim::Landmarks> make(Landmarks *self);

Ref<Landmarks> Landmarks::create(const String &region_id) {
	Ref<Landmarks> r;
	r.instantiate();
	r->region = u8(region_id);
	r->l = make(r.ptr());
	return r;
}

void Landmarks::reload() {
	const sim::LandmarksRoot root = l->save_root();
	l = make(this);
	l->load_root(root);
}

Dictionary Landmarks::flags() const {
	const auto [c, r] = l->flags();
	Dictionary d;
	d["captured"] = c;
	d["restored"] = r;
	return d;
}

static std::unique_ptr<sim::Landmarks> make(Landmarks *self) {
	sim::LmWorks w;
	w.prebuilt = [self]() -> const std::vector<sim::LmPiece> & { return self->prebuilt; };
	w.landmark_capture = [self](double share) {
		Array c = rec("capture");
		c.push_back(share);
		self->calls.push_back(c);
		const Array a = self->answers.pop_front();
		apply_changes(self->prebuilt, a[1]);
	};
	w.landmark_restore = [self](int team, const sim::LmGoods &cost, double x, double y) {
		Array c = rec("restore");
		c.push_back(team);
		c.push_back(goods_to(cost));
		c.push_back(x);
		c.push_back(y);
		self->calls.push_back(c);
		const Array a = self->answers.pop_front();
		apply_changes(self->prebuilt, a[2]);
		return bool(a[1]);
	};
	sim::LmHost h;
	h.units = [self]() -> const std::vector<sim::LmUnit> & { return self->units; };
	h.squad = [self](int s) -> const sim::LmSquad * {
		if (s < 0 || size_t(s) >= self->squads.size() || !self->squads[s]) return nullptr;
		return &*self->squads[s];
	};
	h.guarded = [self]() { return self->guarded; };
	h.real = [self](int team) { return std::find(self->real.begin(), self->real.end(), team) != self->real.end(); };
	h.note = [self](const sim::LmEvent &e) {
		Dictionary d;
		d["t"] = e.t;
		d["kind"] = gs(e.kind);
		d["id"] = gs(e.id);
		if (e.kind == "landmark") {
			d["state"] = gs(e.state);
			d["holder"] = e.holder;
		} else {
			d["squad"] = e.squad;
			d["why"] = gs(e.why);
		}
		Array c = rec("note");
		c.push_back(d);
		self->calls.push_back(c);
	};
	return std::make_unique<sim::Landmarks>(self->region, std::move(w), std::move(h));
}

void Landmarks::set_base(const Array &a) {
	prebuilt.clear();
	for (int64_t i = 0; i < a.size(); i++) {
		const Dictionary d = a[i];
		sim::LmPiece p;
		p.x = d["x"];
		p.y = d["y"];
		p.maxHp = d["maxHp"];
		const Array ts = d["tiles"];
		for (int64_t k = 0; k < ts.size(); k++) p.tiles.push_back(ts[k]);
		p.landmark = d["landmark"].booleanize();
		prebuilt.push_back(p);
	}
}

void Landmarks::set_world(const Dictionary &w) {
	apply_changes(prebuilt, w["dyn"]);
	units.clear();
	squads.clear();
	const Array qs = w["squads"];
	for (int64_t i = 0; i < qs.size(); i++) {
		if (qs[i].get_type() != Variant::DICTIONARY) {
			squads.push_back(std::nullopt);
			continue;
		}
		const Dictionary q = qs[i];
		sim::LmSquad s;
		s.team = int(q["team"]);
		const Array su = q["units"];
		for (int64_t k = 0; k < su.size(); k++) s.units.push_back(unit_from(su[k]));
		units.insert(units.end(), s.units.begin(), s.units.end());
		squads.push_back(s);
	}
	const Array us = w["extra"];
	for (int64_t i = 0; i < us.size(); i++) units.push_back(unit_from(us[i]));
	guarded = w["guarded"].booleanize();
	real.clear();
	const Array rs = w["real"];
	for (int64_t i = 0; i < rs.size(); i++) real.push_back(int(rs[i]));
}

Array Landmarks::take_calls() {
	Array c = calls;
	calls = Array();
	return c;
}

Dictionary Landmarks::save_root() const {
	const sim::LandmarksRoot o = l->save_root();
	Dictionary d;
	d["captured"] = o.captured;
	d["restored"] = o.restored;
	d["holder"] = o.holder;
	d["men"] = o.men;
	d["foes"] = o.foes;
	d["state"] = gs(o.state);
	return d;
}

void Landmarks::load_root(const Dictionary &o) {
	l->load_root({ bool(o["captured"]), bool(o["restored"]), int(o["holder"]), int(o["men"]), int(o["foes"]), u8(o["state"]) });
}

Variant Landmarks::snap() const {
	const auto s = l->snap();
	if (!s) return Variant();
	Dictionary d;
	d["id"] = gs(s->id);
	d["holder"] = s->holder;
	d["state"] = gs(s->state);
	d["hp"] = s->hp;
	d["ruined"] = s->ruined;
	d["pieces"] = s->pieces;
	d["men"] = s->men;
	d["foes"] = s->foes;
	d["garrisoned"] = s->garrisoned;
	return d;
}

bool Landmarks::can_lead(const String &id, double level, const Variant &perks) {
	for (const sim::Landmark &lm : sim::data().landmarks.list) {
		if (lm.id != u8(id)) continue;
		if (perks.get_type() != Variant::ARRAY) return sim::can_lead(lm, level, nullptr);
		std::vector<std::string> v;
		const Array a = perks;
		for (int64_t i = 0; i < a.size(); i++) v.push_back(u8(a[i]));
		return sim::can_lead(lm, level, &v);
	}
	return false;
}

Dictionary Landmarks::restore_cost(const String &id) { return goods_to(sim::restore_cost(u8(id))); }

Variant Landmarks::landmark_of_region(const String &region) {
	const sim::Landmark *l = sim::landmark_of_region(u8(region));
	return l ? Variant(gs(l->id)) : Variant();
}

void Landmarks::_bind_methods() {
	ClassDB::bind_static_method("Landmarks", D_METHOD("create", "region_id"), &Landmarks::create);
	ClassDB::bind_method(D_METHOD("set_base", "pieces"), &Landmarks::set_base);
	ClassDB::bind_method(D_METHOD("set_world", "world"), &Landmarks::set_world);
	ClassDB::bind_method(D_METHOD("set_answers", "answers"), &Landmarks::set_answers);
	ClassDB::bind_method(D_METHOD("take_calls"), &Landmarks::take_calls);
	ClassDB::bind_method(D_METHOD("any"), &Landmarks::any);
	ClassDB::bind_method(D_METHOD("tick", "t"), &Landmarks::tick);
	ClassDB::bind_method(D_METHOD("reset"), &Landmarks::reset);
	ClassDB::bind_method(D_METHOD("remember", "captured", "restored"), &Landmarks::remember);
	ClassDB::bind_method(D_METHOD("save_root"), &Landmarks::save_root);
	ClassDB::bind_method(D_METHOD("load_root", "root"), &Landmarks::load_root);
	ClassDB::bind_method(D_METHOD("restore", "squad", "t"), &Landmarks::restore);
	ClassDB::bind_method(D_METHOD("snap"), &Landmarks::snap);
	ClassDB::bind_method(D_METHOD("reload"), &Landmarks::reload);
	ClassDB::bind_method(D_METHOD("flags"), &Landmarks::flags);
	ClassDB::bind_static_method("Landmarks", D_METHOD("can_lead", "id", "level", "perks"), &Landmarks::can_lead);
	ClassDB::bind_static_method("Landmarks", D_METHOD("restore_cost", "id"), &Landmarks::restore_cost);
	ClassDB::bind_static_method("Landmarks", D_METHOD("landmark_of_region", "region"), &Landmarks::landmark_of_region);
}

} // namespace godot
