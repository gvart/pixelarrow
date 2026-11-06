// The movement grid (src/war/sim/grid.ts), ported line for line so paths come out tile for tile the same. Arrays the TS
// keeps as Float32Array are std::vector<float>: stored rounded to float, and ALWAYS read into a double before any
// arithmetic (as JS reads a Float32Array), never float-with-float. Node ids, steps and ties follow the TS order.
#pragma once

#include <cstdint>
#include <vector>

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/packed_byte_array.hpp>
#include <godot_cpp/variant/packed_float32_array.hpp>
#include <godot_cpp/variant/packed_int32_array.hpp>

namespace sim {

constexpr int SECTOR = 8;
constexpr int DECK = 1, STAIR = 2, LADDER = 3;
constexpr int BOG = 1, FOREST = 2;
constexpr double SQRT2 = 1.4142135623730951;

struct Grid {
	int w = 0, h = 0;
	std::vector<float> cost, cart_mul;
	std::vector<uint8_t> height, ground, gate, deck, span, trench, narrow;
	std::vector<int32_t> plat;
	int team = -1;
	bool engine = false, cart = false;
	std::vector<int> dirty;

	// sectors
	std::vector<int32_t> node, bx, by, start, adj;
	std::vector<float> cx, cy, adj_cost;
	std::vector<double> mean_cost;
	int n = 0, bw = 0, bh = 0;
	std::vector<std::vector<int32_t>> block_nodes, links;

	// layers: one u16 per tile, height | terrain << 4 | water << 7 (src/war/region/compact.ts)
	void build(const uint16_t *cells, int w, int h, const std::vector<std::pair<std::pair<double, double>, std::pair<int, int>>> &objects, const std::vector<int> &blocked);
	bool can_enter(int a, int b) const;
	double step_cost(int a, int b) const;
	int tile_at(double x, double y) const;
	bool line_clear(double x0, double y0, double x1, double y1) const;
	double line_cost(double x0, double y0, double x1, double y1, double r) const;
	std::vector<double> pull_path(const std::vector<double> &pts, const std::vector<double> &cost, const std::vector<bool> &keep, double r) const;
	int nearest_open(int tx, int ty) const;
	std::vector<uint8_t> cart_land();
	std::pair<double, double> nearest_land(const std::vector<uint8_t> &land, double x, double y) const;
	void flush_sectors();
	void update_sectors(const std::vector<int> &tiles);
	std::vector<int32_t> find_path(int start, int goal);

private:
	// A* scratch
	int scratch_n = 0;
	std::vector<float> g_score, heap_f;
	std::vector<int32_t> parent, seen, closed, heap_node, allowed;
	int heap_size = 0, stamp = 0;

	int step_to(int a, int ax, int ay, int k) const;
	void build_sectors();
	void rebuild_blocks(const std::vector<int> &cut, const std::vector<int> &relink);
	void ensure_scratch();
	void heap_push(int node, double f);
	int heap_pop();
	void corridor(int a, int b);
	std::vector<int32_t> tile_search(int start, int goal, bool restricted);
};

} // namespace sim

namespace godot {

// GDScript face of sim::Grid: Grid.build(cells, w, h, meta, object_blocks) (Region.grid() calls it).
class Grid : public RefCounted {
	GDCLASS(Grid, RefCounted)

public:
	sim::Grid g;

	static Ref<Grid> build(const PackedByteArray &cells, int w, int h, const Dictionary &meta, const Dictionary &object_blocks);
	int get_w() const { return g.w; }
	int get_h() const { return g.h; }
	int get_team() const { return g.team; }
	void set_team(int t) { g.team = t; }
	bool get_engine() const { return g.engine; }
	void set_engine(bool v) { g.engine = v; }
	bool get_cart() const { return g.cart; }
	void set_cart(bool v) { g.cart = v; }
	int sectors() const { return g.n; }

	// tile edits (as works.ts does them) and reads
	void set_cost(int i, double v) { g.cost[i] = float(v); }
	double cost_at(int i) const { return g.cost[i]; }
	void set_height(int i, int v) { g.height[i] = uint8_t(v); }
	void set_deck(int i, int v) { g.deck[i] = uint8_t(v); }
	void set_span(int i, int v) { g.span[i] = uint8_t(v); }
	void set_narrow(int i, int v) { g.narrow[i] = uint8_t(v); }
	void set_gate(int i, int v) { g.gate[i] = uint8_t(v); }
	void set_trench(int i, int v) { g.trench[i] = uint8_t(v); }
	void mark_dirty(int x, int y) { g.dirty.push_back(x); g.dirty.push_back(y); }

	// whole arrays as bytes (tests hash them against the TS digests)
	PackedByteArray bytes_of(const String &name) const;

	bool can_enter(int a, int b) const { return g.can_enter(a, b); }
	double step_cost(int a, int b) const { return g.step_cost(a, b); }
	int tile_at(double x, double y) const { return g.tile_at(x, y); }
	bool line_clear(double x0, double y0, double x1, double y1) const { return g.line_clear(x0, y0, x1, y1); }
	double line_cost(double x0, double y0, double x1, double y1, double r) const { return g.line_cost(x0, y0, x1, y1, r); }
	bool walk_clear(double x0, double y0, double x1, double y1) const { return g.line_cost(x0, y0, x1, y1, 0) < INFINITY; }
	Array pull_path(const Array &pts, const Array &cost, const Array &keep, double r) const;
	int nearest_open(int tx, int ty) const { return g.nearest_open(tx, ty); }
	PackedByteArray cart_land();
	Array nearest_land(const PackedByteArray &land, double x, double y) const;
	void flush_sectors() { g.flush_sectors(); }
	PackedInt32Array find_path(int start, int goal);

protected:
	static void _bind_methods();
};

} // namespace godot
