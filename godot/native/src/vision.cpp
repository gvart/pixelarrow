#include "vision.h"

#include <algorithm>
#include <set>

#include <godot_cpp/core/class_db.hpp>

namespace sim {

int building_sight(const VisionBuilding &b) {
	if (b.state == "destroyed" || b.state == "foundation" || b.state == "scaffold" || b.rubble) return 0;
	if (b.type == "brazier") return b.lit ? VISION.brazier : 0;
	static const std::set<std::string> BLIND{ "woodBridge", "stoneBridge", "woodStairs", "stoneStairs", "ladder", "brazier" };
	if (BLIND.count(b.type) || !b.staffed) return 0;
	if (b.type == "woodTower" || b.type == "stoneTower") return VISION.tower;
	return b.type == "outpost" || b.type == "fort" ? VISION.building + 4 : VISION.building;
}

void Vision::init(const Grid &g) {
	grid = &g;
	cells.init(g);
	last_h.assign(g.height.size(), 0);
}

Vision::Team &Vision::team(int t) {
	auto it = teams.find(t);
	if (it == teams.end()) {
		Team &v = teams[t];
		v.count.assign(cells.n, 0);
		v.state.assign(cells.n, FOG_UNEXPLORED);
		return v;
	}
	return it->second;
}

bool Vision::heights() {
	if (polled && last_h == grid->height) return false; // nothing rose or fell since the last poll
	polled = true;
	last_h = grid->height;
	return cells.heights(*grid);
}

int Vision::cell_at(double x, double y) const {
	const int C = VISION.cell;
	const int cx = int(std::min(double(cells.cw - 1), std::max(0.0, std::floor(x / C))));
	const int cy = int(std::min(double(cells.ch - 1), std::max(0.0, std::floor(y / C))));
	return cy * cells.cw + cx;
}

bool Vision::visible_b(const Team &v, const VisionBuilding &b) const {
	for (size_t i = 0; i + 1 < b.tiles.size(); i += 2)
		if (v.count[cell_at(b.tiles[i], b.tiles[i + 1])]) return true;
	return v.count[cell_at(b.x, b.y)] > 0;
}

static bool add(Vision::Team &v, const std::vector<int32_t> &cells) {
	bool ch = false;
	for (const int c : cells)
		if (v.count[c]++ == 0) v.state[c] = FOG_VISIBLE, ch = true;
	return ch;
}

static bool remove(Vision::Team &v, const std::vector<int32_t> &cells) {
	bool ch = false;
	for (const int c : cells)
		if (--v.count[c] == 0) v.state[c] = FOG_EXPLORED, ch = true;
	return ch;
}

void Vision::update(int t, const std::vector<VisionUnit> &units, const std::vector<VisionBuilding> &blds, const std::map<int, int> &sight_add) {
	if (t - heights_at >= VISION.heightEvery) {
		heights_at = t;
		if (heights())
			for (auto &[tm, v] : teams) {
				for (auto &[key, e] : v.keys) remove(v, e.cells);
				v.keys.clear();
				v.version++;
			}
	}
	auto extra = [&](int tm) {
		const auto it = sight_add.find(tm);
		return it == sight_add.end() ? 0 : it->second;
	};
	JsMap<int, JsMap<int, int>> want; // a JS Map: the teams' and their keys' order shows in the save
	auto hold = [&](int tm, int key) { want[tm][key]++; };
	for (const VisionUnit &u : units) {
		if (!u.alive || u.team == MOB_TEAM || u.team == NEUTRAL_TEAM) continue; // W-65: roaming folk need no sight
		hold(u.team, cell_at(u.x, u.y) * 128 + std::min(FLAT - 1, u.sight + extra(u.team)));
	}
	std::vector<int> existing;
	for (auto &[tm, v] : teams) existing.push_back(tm);
	for (const VisionBuilding &b : blds) {
		if (b.burning != 0 && !std::isnan(b.burning) && b.state != "destroyed")
			for (const int tm : existing) hold(tm, cell_at(b.x, b.y) * 128 + FLAT + VISION.fire);
		if (b.team == MOB_TEAM) continue;
		const int r = building_sight(b), more = r >= VISION.tower ? 2 * extra(b.team) : 0;
		if (r > 0) hold(b.team, cell_at(b.x, b.y) * 128 + std::min(FLAT - 1, r + more));
	}
	for (auto &[tm, m] : want) team(tm);
	static const JsMap<int, int> none;
	for (auto &[tm, v] : teams) {
		const auto wi = want.find(tm);
		const JsMap<int, int> &m = wi == want.end() ? none : wi->second;
		bool changed = false;
		for (auto it = v.keys.begin(); it != v.keys.end();)
			if (!m.count(it->first)) {
				changed = remove(v, it->second.cells) || changed;
				it = v.keys.erase(it);
			} else ++it;
		for (const auto &[key, k] : m) {
			auto it = v.keys.find(key);
			Entry *e = it == v.keys.end() ? nullptr : &it->second;
			if (!e) {
				e = &(v.keys[key] = Entry{ cells.compute(key / 128, key % 128), 0 });
				changed = add(v, e->cells) || changed;
			}
			e->n = k;
		}
		// last-seen foreign buildings: refreshed while seen, forgotten once their ground is seen empty
		std::set<int> here;
		for (const VisionBuilding &b : blds) {
			if (b.team == tm) continue;
			here.insert(b.id);
			if (visible_b(v, b)) {
				if (!v.seen.count(b.id)) v.seen_order.push_back(b.id);
				v.seen[b.id] = b;
			}
		}
		for (auto it = v.seen_order.begin(); it != v.seen_order.end();)
			if (!here.count(*it) && visible_b(v, v.seen.at(*it))) {
				v.seen.erase(*it);
				it = v.seen_order.erase(it);
			} else ++it;
		if (changed) v.version++;
	}
}

void Vision::tick(int t, const std::vector<VisionUnit> &units, const std::vector<VisionBuilding> &blds, const std::map<int, int> &sight_add) {
	if (t % VISION.every != 0) return;
	update(t, units, blds, sight_add);
}

bool Vision::visible_to(int tm, double x, double y) const {
	const auto it = teams.find(tm);
	return it != teams.end() && it->second.count[cell_at(x, y)] > 0;
}

bool Vision::explored(int tm, double x, double y) const {
	const auto it = teams.find(tm);
	return it != teams.end() && it->second.state[cell_at(x, y)] != FOG_UNEXPLORED;
}

} // namespace sim

namespace godot {

Ref<Vision> Vision::create(const Ref<Grid> &grid) {
	Ref<Vision> r;
	r.instantiate();
	r->grid = grid;
	r->v.init(grid->g);
	return r;
}

void Vision::tick(int t, const PackedFloat64Array &units, const Array &buildings, const Dictionary &sight_add) {
	std::vector<sim::VisionUnit> us;
	for (int64_t i = 0; i + 4 < units.size(); i += 5)
		us.push_back({ units[i], units[i + 1], units[i + 2] != 0, int(units[i + 3]), int(units[i + 4]) });
	std::vector<sim::VisionBuilding> bs;
	for (int64_t i = 0; i < buildings.size(); i++) {
		const Dictionary d = buildings[i];
		sim::VisionBuilding b;
		b.id = int(d["id"]);
		b.team = int(d["team"]);
		b.x = d["x"];
		b.y = d["y"];
		b.burning = d.get("burning", 0.0);
		const Array tiles = d["tiles"];
		for (int64_t k = 0; k < tiles.size(); k++) b.tiles.push_back(tiles[k]);
		b.type = String(d["type"]).utf8().get_data();
		b.state = String(d["state"]).utf8().get_data();
		b.rubble = d.get("rubble", false);
		b.lit = d.get("lit", false);
		b.staffed = d.get("staffed", false);
		bs.push_back(std::move(b));
	}
	std::map<int, int> add;
	const Array keys = sight_add.keys();
	for (int64_t i = 0; i < keys.size(); i++) add[int(keys[i])] = int(sight_add[keys[i]]);
	v.tick(t, us, bs, add);
}

PackedByteArray Vision::state_of(int tm) {
	const auto &s = v.team(tm).state;
	PackedByteArray out;
	out.resize(int64_t(s.size()));
	std::copy(s.begin(), s.end(), out.ptrw());
	return out;
}

PackedInt32Array Vision::last_seen(int tm) {
	PackedInt32Array out;
	for (const int id : v.team(tm).seen_order) out.push_back(id);
	return out;
}

PackedInt32Array Vision::teams() const {
	PackedInt32Array out;
	for (const auto &[tm, t] : v.teams) out.push_back(tm);
	return out;
}

void Vision::_bind_methods() {
	ClassDB::bind_static_method("Vision", D_METHOD("create", "grid"), &Vision::create);
	ClassDB::bind_method(D_METHOD("tick", "t", "units", "buildings", "sight_add"), &Vision::tick);
	ClassDB::bind_method(D_METHOD("visible_to", "team", "x", "y"), &Vision::visible_to);
	ClassDB::bind_method(D_METHOD("explored", "team", "x", "y"), &Vision::explored);
	ClassDB::bind_method(D_METHOD("version", "team"), &Vision::version);
	ClassDB::bind_method(D_METHOD("state_of", "team"), &Vision::state_of);
	ClassDB::bind_method(D_METHOD("last_seen", "team"), &Vision::last_seen);
	ClassDB::bind_method(D_METHOD("teams"), &Vision::teams);
}

} // namespace godot
