#include "town_level.h"

#include <algorithm>
#include <map>

#include <godot_cpp/core/class_db.hpp>

#include "js_math.h"
#include "sim_data.h"
#include "vision.h" // NEUTRAL_TEAM

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::Variant;

static std::string utf8(const Variant &v) { return godot::String(v).utf8().get_data(); }

void load_town_tables(const Dictionary &tables, TownTables &out) {
	if (!tables.has("town_level")) return;
	const Dictionary t = tables["town_level"], town = t["TOWN"];
	out.r = town["r"];
	out.every = town["every"];
	out.area = town["area"];
	const Array lv = t["TOWN_LEVELS"], pk = t["TOWN_PERKS"];
	for (int64_t i = 0; i < lv.size(); i++) {
		const Dictionary d = lv[i];
		out.levels.push_back({ utf8(d["name"]), d["variety"], d["stone"], bool(d["closed"]), bool(d["stoneWalls"]) });
	}
	for (int64_t i = 0; i < pk.size(); i++) {
		const Dictionary d = pk[i];
		out.perks.push_back({ d["store"], d["hunger"], d["souls"], d["repair"] });
	}
}

static const TownTables &T() { return data().town; }

// SKIP: pieces that are no kind of building for the town (a module const in TS, not exported)
static bool skip(const std::string &type) { return type == "brazier" || type == "ladder" || type == "towerBridge" || type == "stakes" || type == "ditch"; }

std::string kind_of(const std::string &type, const TownPiece::Def &d) {
	if (d.workplace) return *d.workplace;
	if (d.wall) return *d.wall;
	if (d.access == "stairs") return "stairs";
	if (d.bridge) return "bridge";
	return type;
}

static bool up(const TownPiece &b) { return !b.cancelled && (b.state == "done" || b.state == "damaged"); }

int level_of(const TownMeasure &m) {
	int lv = 1;
	for (int k = 2; k <= T().max(); k++) {
		const TownNeed &need = T().levels[k];
		if (m.variety < need.variety || m.stone < need.stone - 1e-9 || (need.closed && !m.closed) || (need.stoneWalls && !m.stoneWalls)) break;
		lv = k;
	}
	return lv;
}

static std::string num(double v) { return std::to_string(int64_t(v)); } // whole numbers only here

std::vector<std::string> next_needs(int level, const TownMeasure &t) {
	if (level >= T().max() || level < 1) return level < 1 ? std::vector<std::string>{ "a camp or store" } : std::vector<std::string>{};
	const TownNeed &n = T().levels[level + 1];
	std::vector<std::string> out;
	if (t.variety < n.variety) out.push_back(num(n.variety - t.variety) + " more kind" + (n.variety - t.variety > 1 ? "s" : "") + " of building");
	if (t.stone < n.stone - 1e-9) out.push_back(num(js::round(n.stone * 100)) + "% stone (now " + num(js::round(t.stone * 100)) + "%)");
	if (n.closed && !t.closed) out.push_back("walls closed all round");
	if (n.stoneWalls && !t.stoneWalls) out.push_back("every wall, gate and tower stone");
	return out;
}

TownLevels::TownLevels(const Grid &grid, std::function<const std::vector<TownPiece> &()> pieces, int mob) :
		grid(grid), pieces(std::move(pieces)), mob(mob), seen(size_t(grid.w) * grid.h, 0) {}

bool TownLevels::closed_at(int c) {
	const int w = grid.w, h = grid.h;
	if (++stamp == 0xffffffffu) (std::fill(seen.begin(), seen.end(), 0u), (stamp = 1));
	std::vector<int> q{ c };
	seen[c] = stamp;
	for (size_t i = 0; i < q.size(); i++) {
		if (double(q.size()) > T().area) return false;
		const int t = q[i], x = t % w, y = t / w;
		if (x == 0 || y == 0 || x == w - 1 || y == h - 1) return false;
		for (const int o : { t - 1, t + 1, t - w, t + w }) {
			if (seen[o] == stamp) continue;
			seen[o] = stamp;
			if (double(grid.cost[o]) <= 0 || grid.gate[o] != 0 || grid.deck[o] != 0) continue;
			q.push_back(o);
		}
	}
	return true;
}

void TownLevels::measure() {
	const std::vector<TownPiece> &all = pieces();
	const int w = grid.w, h = grid.h;
	// W-63: every standing camp or fort a team built is a town centre; a team with none has one round its first store.
	// camps and stores are Maps whose order never shows (camps' teams are sorted below): std::map is fine
	std::map<int, std::vector<const TownPiece *>> camps;
	std::map<int, const TownPiece *> stores;
	for (const TownPiece &b : all) {
		if (!up(b) || b.pre || !b.def.store || b.team == NEUTRAL_TEAM || b.team == mob || b.team < 0) continue;
		if (b.type == "camp" || b.type == "fort") camps[b.team].push_back(&b);
		else if (!stores.count(b.team)) stores[b.team] = &b;
	}
	for (const auto &[team, b] : stores)
		if (!camps.count(team)) camps[team] = { b };
	levels.clear();
	struct Town {
		const TownPiece *c;
		std::vector<std::string> kinds; // a Set: its size only
		double stoneN = 0, allN = 0;
		int walls = 0, woodWalls = 0;
	};
	std::vector<Town> towns;
	struct Slot {
		TownLevel t;
		size_t i;
	};
	std::vector<std::pair<int, std::vector<Slot>>> slots; // a Map by team, filled in ascending team order
	for (auto &[team, cs] : camps) { // ascending team
		std::stable_sort(cs.begin(), cs.end(), [](const TownPiece *a, const TownPiece *b) { return a->id < b->id; });
		for (const TownPiece *c : cs) {
			TownLevel t;
			t.team = team;
			t.x = c->x;
			t.y = c->y;
			t.centre = c->id;
			if (slots.empty() || slots.back().first != team) slots.push_back({ team, {} });
			slots.back().second.push_back({ t, towns.size() });
			towns.push_back({ c, {}, 0, 0, 0, 0 });
		}
	}
	const auto slots_of = [&](int team) -> std::vector<Slot> * {
		for (auto &s : slots)
			if (s.first == team) return &s.second;
		return nullptr;
	};
	// each piece counts for one town: its team's nearest centre within TOWN.r
	for (const TownPiece &b : all) {
		if (!up(b) || b.pre || skip(b.type)) continue;
		std::vector<Slot> *l = slots_of(b.team);
		if (!l) continue;
		long k = -1;
		double bd = T().r * T().r;
		for (const Slot &s : *l) {
			const double d = js::pow(b.x - s.t.x, 2) + js::pow(b.y - s.t.y, 2);
			if (d < bd || (d == bd && k < 0)) (bd = d), (k = long(s.i));
		}
		if (k < 0) continue;
		Town &m = towns[k];
		const double n = b.n;
		const std::string kind = kind_of(b.type, b.def);
		if (std::find(m.kinds.begin(), m.kinds.end(), kind) == m.kinds.end()) m.kinds.push_back(kind);
		m.allN += n;
		if (b.def.material == "stone") m.stoneN += n;
		if (b.def.wall) (m.walls++, b.def.material != "stone" && m.woodWalls++);
	}
	static const int DIRS[8][2] = { { 0, 1 }, { 1, 0 }, { 0, -1 }, { -1, 0 }, { 1, 1 }, { -1, 1 }, { 1, -1 }, { -1, -1 } };
	for (auto &[team, l] : slots)
		for (Slot &s : l) {
			const Town &tw = towns[s.i];
			const int t0 = int(std::floor(tw.c->y)) * w + int(std::floor(tw.c->x));
			// the flood starts beside the store (its own tiles are closed)
			int start = -1;
			for (int r = 1; r < 6 && start < 0; r++)
				for (const auto &dd : DIRS) {
					const int o = t0 + dd[1] * r * w + dd[0] * r;
					if (o >= 0 && o < w * h && double(grid.cost[o]) > 0 && grid.gate[o] == 0 && grid.deck[o] == 0) {
						start = o;
						break;
					}
				}
			const bool closed = tw.walls > 0 && start >= 0 && closed_at(start);
			const TownMeasure m{ double(tw.kinds.size()), tw.allN ? tw.stoneN / tw.allN : 0, closed, tw.walls > 0 && tw.woodWalls == 0 };
			s.t.level = level_of(m);
			s.t.variety = m.variety;
			s.t.stone = m.stone;
			s.t.closed = m.closed;
			s.t.stoneWalls = m.stoneWalls;
			levels.push_back(s.t);
		}
}

void TownLevels::tick(double tick) {
	if (std::fmod(tick, T().every) == 0) measure();
}

int TownLevels::level(int team) const {
	int lv = 0;
	for (const TownLevel &t : levels)
		if (t.team == team) lv = std::max(lv, t.level);
	return lv;
}

const TownLevel *TownLevels::town_at(int team, double x, double y) const {
	const TownLevel *best = nullptr;
	double bd = T().r * T().r;
	for (const TownLevel &t : levels) {
		if (t.team != team) continue;
		const double d = js::pow(t.x - x, 2) + js::pow(t.y - y, 2);
		if (d < bd || (d == bd && !best)) (bd = d), (best = &t);
	}
	return best;
}

const TownLevel *TownLevels::town(int centre) const {
	for (const TownLevel &t : levels)
		if (t.centre == centre) return &t;
	return nullptr;
}

std::vector<int> TownLevels::members(int centre) const {
	const TownLevel *c = town(centre);
	std::vector<int> out;
	if (c)
		for (const TownPiece &b : pieces())
			if (!b.cancelled && !b.pre && b.team == c->team && town_at(c->team, b.x, b.y) == c) out.push_back(b.id);
	std::sort(out.begin(), out.end());
	return out;
}

const TownPerk &TownLevels::perk_at(int team, double x, double y) const {
	const TownLevel *t = town_at(team, x, y);
	const size_t lv = t ? size_t(t->level) : 0;
	return lv < T().perks.size() ? T().perks[lv] : T().perks[0];
}

double TownLevels::souls_at(double x, double y) const {
	double k = 1;
	for (const TownLevel &t : levels)
		if (js::pow(t.x - x, 2) + js::pow(t.y - y, 2) <= T().r * T().r) k = std::max(k, T().perks[t.level].souls);
	return k;
}

} // namespace sim

namespace godot {

static std::string u8(const Variant &v) { return String(v).utf8().get_data(); }
static String gs(const std::string &s) { return String::utf8(s.c_str()); }
static bool has(const Dictionary &d, const char *k) { return d.has(k) && d[k].get_type() != Variant::NIL; }

static sim::TownPiece::Def def_from(const Dictionary &d) {
	sim::TownPiece::Def o;
	if (has(d, "workplace")) o.workplace = u8(d["workplace"]);
	if (has(d, "wall")) o.wall = u8(d["wall"]);
	if (has(d, "access")) o.access = u8(d["access"]);
	o.material = u8(d.get("material", ""));
	o.bridge = d.get("bridge", false).booleanize();
	o.store = d.get("store", false).booleanize();
	return o;
}

static sim::TownMeasure measure_from(const Dictionary &m) { return { m["variety"], m["stone"], bool(m["closed"]), bool(m["stoneWalls"]) }; }

static Dictionary town_to(const sim::TownLevel &t) {
	Dictionary d;
	d["team"] = t.team;
	d["level"] = t.level;
	d["x"] = t.x;
	d["y"] = t.y;
	d["centre"] = t.centre;
	d["variety"] = t.variety;
	d["stone"] = t.stone;
	d["closed"] = t.closed;
	d["stoneWalls"] = t.stoneWalls;
	return d;
}

Ref<TownLevels> TownLevels::create(const Ref<Grid> &grid, int mob) {
	Ref<TownLevels> r;
	r.instantiate();
	r->grid = grid;
	TownLevels *self = r.ptr();
	r->t = std::make_unique<sim::TownLevels>(grid->g, [self]() -> const std::vector<sim::TownPiece> & { return self->list; }, mob);
	return r;
}

void TownLevels::set_pieces(const Array &pieces) {
	list.clear();
	for (int64_t i = 0; i < pieces.size(); i++) {
		const Dictionary d = pieces[i];
		sim::TownPiece b;
		b.id = int(d["id"]);
		b.team = int(d["team"]);
		b.type = u8(d["type"]);
		b.state = u8(d["state"]);
		b.x = d["x"];
		b.y = d["y"];
		b.cancelled = d.get("cancelled", false).booleanize();
		b.pre = d.get("pre", false).booleanize();
		b.n = int(d["n"]);
		b.def = def_from(d["def"]);
		list.push_back(b);
	}
}

Variant TownLevels::town_at(int team, double x, double y) const {
	const sim::TownLevel *v = t->town_at(team, x, y);
	return v ? Variant(town_to(*v)) : Variant();
}

Variant TownLevels::town(int centre) const {
	const sim::TownLevel *v = t->town(centre);
	return v ? Variant(town_to(*v)) : Variant();
}

Array TownLevels::members(int centre) const {
	Array out;
	for (int id : t->members(centre)) out.push_back(id);
	return out;
}

Dictionary TownLevels::perk_at(int team, double x, double y) const {
	const sim::TownPerk &p = t->perk_at(team, x, y);
	Dictionary d;
	d["store"] = p.store;
	d["hunger"] = p.hunger;
	d["souls"] = p.souls;
	d["repair"] = p.repair;
	return d;
}

Array TownLevels::snaps() const {
	Array out;
	for (const sim::TownLevel &v : t->save_root()) {
		Dictionary d;
		d["id"] = v.centre;
		d["team"] = v.team;
		d["level"] = v.level;
		d["name"] = gs(sim::data().town.levels[v.level].name);
		d["x"] = v.x;
		d["y"] = v.y;
		d["r"] = sim::data().town.r;
		d["variety"] = v.variety;
		d["stone"] = v.stone;
		d["closed"] = v.closed;
		d["stoneWalls"] = v.stoneWalls;
		Array next;
		for (const std::string &s : sim::next_needs(v.level, { v.variety, v.stone, v.closed, v.stoneWalls })) next.push_back(gs(s));
		d["next"] = next;
		out.push_back(d);
	}
	return out;
}

int TownLevels::level_of(const Dictionary &m) { return sim::level_of(measure_from(m)); }

PackedStringArray TownLevels::next_needs(const Dictionary &t) {
	PackedStringArray out;
	for (const std::string &s : sim::next_needs(int(t["level"]), measure_from(t))) out.push_back(gs(s));
	return out;
}

String TownLevels::kind_of(const String &type, const Dictionary &def) { return gs(sim::kind_of(type.utf8().get_data(), def_from(def))); }

void TownLevels::_bind_methods() {
	ClassDB::bind_static_method("TownLevels", D_METHOD("create", "grid", "mob"), &TownLevels::create);
	ClassDB::bind_method(D_METHOD("set_pieces", "pieces"), &TownLevels::set_pieces);
	ClassDB::bind_method(D_METHOD("tick", "tick"), &TownLevels::tick);
	ClassDB::bind_method(D_METHOD("measure"), &TownLevels::measure);
	ClassDB::bind_method(D_METHOD("level", "team"), &TownLevels::level);
	ClassDB::bind_method(D_METHOD("town_at", "team", "x", "y"), &TownLevels::town_at);
	ClassDB::bind_method(D_METHOD("town", "centre"), &TownLevels::town);
	ClassDB::bind_method(D_METHOD("members", "centre"), &TownLevels::members);
	ClassDB::bind_method(D_METHOD("perk_at", "team", "x", "y"), &TownLevels::perk_at);
	ClassDB::bind_method(D_METHOD("souls_at", "x", "y"), &TownLevels::souls_at);
	ClassDB::bind_method(D_METHOD("snaps"), &TownLevels::snaps);
	ClassDB::bind_static_method("TownLevels", D_METHOD("level_of", "m"), &TownLevels::level_of);
	ClassDB::bind_static_method("TownLevels", D_METHOD("next_needs", "t"), &TownLevels::next_needs);
	ClassDB::bind_static_method("TownLevels", D_METHOD("kind_of", "type", "def"), &TownLevels::kind_of);
}

} // namespace godot
