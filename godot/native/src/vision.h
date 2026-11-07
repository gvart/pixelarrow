// Fog of war (src/war/sim/vision.ts), line for line: the coarse cell grid (highest tile, forest share), the cells a
// viewer sees (rays to the rim of its square), and per team the counts, fog states, viewer keys and last-seen buildings.
// Viewers come in with their sight already worked out (sightOf needs the class tables; the sim step passes it).
#pragma once

#include <cmath>
#include <cstdint>
#include <functional>
#include <memory>
#include <limits>
#include <map>
#include <string>
#include <unordered_map>
#include <vector>

#include "grid.h"
#include "js_map.h"
#include "state.h"
#include "works.h"

#include <godot_cpp/variant/packed_float64_array.hpp>
#include "js_math.h"

namespace sim {

struct VisionRules {
	int cell = 2, every = 4, heightEvery = 25;
	double eye = 0.8, target = 0.5;
	int melee = 12, ranged = 16, scout = 22, tower = 20, building = 10, wall = 6, brazier = 6, fire = 4;
	double high = 2, highCap = 8, forest = 4;
};
inline const VisionRules VISION{};
constexpr int FLAT = 64; // key radius flag: a lit area, no line of sight

constexpr int FOG_UNEXPLORED = 0, FOG_EXPLORED = 1, FOG_VISIBLE = 2;
constexpr int MOB_TEAM = 7, NEUTRAL_TEAM = 6;

struct VisionUnit {
	double x, y;
	bool alive;
	int team, sight; // sight: sightOf(cls), tiles
};

// What vision reads of a BuildingSnap; last-seen keeps a copy.
struct VisionBuilding {
	int id = 0, team = 0;
	double x = 0, y = 0, burning = 0;
	std::vector<double> tiles;
	std::string type, state;
	bool rubble = false, lit = false, staffed = false;
	// kept for the bots (bots.ts reads them off the last-seen snaps); vision itself does not read them
	std::optional<double> walk;
	std::optional<int> attach, siege;
	// saves: the whole snapshot (TS v.seen holds the BuildingSnap itself; the teams that saw it at one poll share it)
	std::shared_ptr<const BuildingSnap> snap;
};

int building_sight(const VisionBuilding &b);

// what the vision reads of a building snapshot (snap left unset)
inline VisionBuilding vision_building(const BuildingSnap &b) {
	VisionBuilding v;
	v.id = b.id;
	v.team = b.team;
	v.x = b.x;
	v.y = b.y;
	v.burning = b.burning.value_or(0);
	v.tiles.assign(b.tiles.begin(), b.tiles.end());
	v.type = b.type;
	v.state = b.state;
	v.rubble = b.rubble;
	v.lit = b.lit.value_or(false);
	v.staffed = b.staffed;
	v.walk = b.walk;
	v.attach = b.attach;
	v.siege = b.siege;
	return v;
}

struct VisionCells {
	int cw = 0, ch = 0, n = 0;
	std::vector<uint8_t> cell_h, cell_f;
	std::vector<int32_t> stamp;
	int stamp_n = 0;

	void init(const Grid &g) {
		cw = (g.w + VISION.cell - 1) / VISION.cell;
		ch = (g.h + VISION.cell - 1) / VISION.cell;
		n = cw * ch;
		cell_h.assign(n, 0);
		cell_f.assign(n, 0);
		stamp.assign(n, 0);
	}

	// Recompute the cell heights and forest flags; true when any changed.
	bool heights(const Grid &g) {
		const int C = VISION.cell;
		bool changed = false;
		for (int cy = 0; cy < ch; cy++)
			for (int cx = 0; cx < cw; cx++) {
				int h = 0, f = 0, k = 0;
				for (int y = cy * C; y < std::min(g.h, cy * C + C); y++)
					for (int x = cx * C; x < std::min(g.w, cx * C + C); x++) {
						const int t = y * g.w + x;
						if (g.height[t] > h) h = g.height[t];
						if (g.ground[t] == FOREST) f++;
						k++;
					}
				const int c = cy * cw + cx, ff = f * 2 >= k ? 1 : 0;
				if (cell_h[c] != h || cell_f[c] != ff) {
					changed = true;
					cell_h[c] = uint8_t(h);
					cell_f[c] = uint8_t(ff);
				}
			}
		return changed;
	}

	// The cells a viewer at cell c with sight r (tiles; r & FLAT: a lit area) sees, in the TS order.
	std::vector<int32_t> compute(int c, int r) {
		const int C = VISION.cell;
		stamp_n++;
		std::vector<int32_t> out;
		auto mark = [&](int k) {
			if (stamp[k] != stamp_n) {
				stamp[k] = stamp_n;
				out.push_back(k);
			}
		};
		const int cx = c % cw, cy = c / cw;
		if (r & FLAT) {
			const int rr = r & (FLAT - 1), rc = int(std::ceil(rr / double(C)));
			for (int y = std::max(0, cy - rc); y <= std::min(ch - 1, cy + rc); y++)
				for (int x = std::max(0, cx - rc); x <= std::min(cw - 1, cx + rc); x++)
					if (double((x - cx) * (x - cx) + (y - cy) * (y - cy)) * C * C <= double(rr) * rr) mark(y * cw + x);
			return out;
		}
		mark(c);
		const double ground = cell_h[c], eye = ground + VISION.eye;
		const double far = r + VISION.highCap;
		const int rc = int(std::ceil(far / C));
		auto ray = [&](int px, int py) {
			const int dx = px - cx, dy = py - cy, steps = std::max(std::abs(dx), std::abs(dy));
			double slope = -std::numeric_limits<double>::infinity(), cost = 0;
			for (int i = 1; i <= steps; i++) {
				const double fx = double(dx * i) / steps, fy = double(dy * i) / steps;
				const int x = cx + int(js::round(fx)), y = cy + int(js::round(fy));
				if (x < 0 || y < 0 || x >= cw || y >= ch) return;
				const int k = y * cw + x;
				const double d = std::sqrt(fx * fx + fy * fy) * C, h = cell_h[k];
				if (d + cost > far) return;
				const double drop = ground - h, reach = r + (drop > 0 ? std::min(VISION.highCap, drop * VISION.high) : 0.0);
				if (d + cost <= reach && (h + VISION.target - eye) / d >= slope) mark(k);
				const double s = (h - eye) / d;
				if (s > slope) slope = s;
				if (cell_f[k]) cost += VISION.forest;
			}
		};
		for (int k = -rc; k < rc; k++) {
			ray(cx + k, cy - rc);
			ray(cx + rc, cy + k);
			ray(cx - k, cy + rc);
			ray(cx - rc, cy - k);
		}
		return out;
	}
};

struct Vision {
	struct Entry {
		std::vector<int32_t> cells;
		int n = 0;
	};
	struct Team {
		std::vector<uint16_t> count;
		std::vector<uint8_t> state;
		int version = 0;
		JsMap<int, Entry> keys; // a JS Map: its order shows in the save
		std::vector<int> seen_order; // last-seen buildings in Map insertion order (lastSeen lists them so)
		std::unordered_map<int, VisionBuilding> seen;
	};

	const Grid *grid = nullptr;
	VisionCells cells;
	JsMap<int, Team> teams;
	double heights_at = -std::numeric_limits<double>::infinity();
	std::vector<uint8_t> last_h;
	bool polled = false;

	void init(const Grid &g);
	Team &team(int t);
	// saves (state.ts): the TS saveRoot as a graph (the last-seen buildings' tiles shared with the works' buildings), and
	// the loadRoot of one
	state::Val save(state::Graph &g, const std::function<state::Val(const BuildingSnap &)> &snap) const;
	void load(const state::Obj &o, const std::function<BuildingSnap(const state::Obj &)> &snap);
	// sight_add: W-61 extra tiles per team (absent: 0)
	void tick(int t, const std::vector<VisionUnit> &units, const std::vector<VisionBuilding> &blds, const std::map<int, int> &sight_add);
	int cell_at(double x, double y) const;
	bool visible_to(int tm, double x, double y) const;
	bool explored(int tm, double x, double y) const;

private:
	bool heights();
	bool visible_b(const Team &v, const VisionBuilding &b) const;
	void update(int t, const std::vector<VisionUnit> &units, const std::vector<VisionBuilding> &blds, const std::map<int, int> &sight_add);
};

} // namespace sim

namespace godot {

// GDScript face of sim::Vision (tests feed it the TS vectors; the C++ sim step will call sim::Vision directly).
class Vision : public RefCounted {
	GDCLASS(Vision, RefCounted)

public:
	Ref<Grid> grid;
	sim::Vision v;

	static Ref<Vision> create(const Ref<Grid> &grid);
	// units: x, y, alive, team, sight per unit; buildings: BuildingSnap dictionaries; sight_add: team -> tiles
	void tick(int t, const PackedFloat64Array &units, const Array &buildings, const Dictionary &sight_add);
	bool visible_to(int tm, double x, double y) const { return v.visible_to(tm, x, y); }
	bool explored(int tm, double x, double y) const { return v.explored(tm, x, y); }
	int version(int tm) { return v.team(tm).version; }
	PackedByteArray state_of(int tm);
	PackedInt32Array last_seen(int tm);
	PackedInt32Array teams() const;

protected:
	static void _bind_methods();
};

} // namespace godot
