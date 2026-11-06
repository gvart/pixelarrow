#include "grid.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>
#include <map>
#include <set>

#include <godot_cpp/core/class_db.hpp>

#include "js_math.h"

namespace sim {

namespace {
// By terrain index (grass forest sand marsh rock road snow dirt); 0 = impassable.
const double TERRAIN_COST[8] = { 1, 1.6, 1.4, 2, 0, 0.7, 1.5, 1 };
const double CART_COST[8] = { 1, 0, 2, 0, 0, 1 / 1.3, 1.5, 1 };
constexpr double SHALLOW = 2, CART_FORD = 2, CART_UPHILL = 1 / 0.6, UPHILL = 1.5, MIN_COST = 0.7;
constexpr int T_FOREST = 1, T_MARSH = 3;
const int DX[8] = { 1, -1, 0, 0, 1, 1, -1, -1 };
const int DY[8] = { 0, 0, 1, -1, 1, -1, 1, -1 };
constexpr int HEAP0 = 1 << 16;
const double INF = std::numeric_limits<double>::infinity();
} // namespace

void Grid::build(const uint16_t *cells, int w_, int h_, const std::vector<std::pair<std::pair<double, double>, std::pair<int, int>>> &objects, const std::vector<int> &blocked) {
	w = w_;
	h = h_;
	const int N = w * h;
	cost.assign(N, 0);
	height.assign(N, 0);
	ground.assign(N, 0);
	cart_mul.assign(N, 0);
	for (int i = 0; i < N; i++) {
		const int v = cells[i], t = (v >> 4) & 7, wa = v >> 7;
		cart_mul[i] = float(wa == 2 ? 1.0 : CART_COST[t] * (wa == 1 ? CART_FORD : 1.0));
		height[i] = uint8_t(v & 15);
		ground[i] = uint8_t(wa == 1 || t == T_MARSH ? BOG : t == T_FOREST ? FOREST : 0);
		cost[i] = float(wa == 2 ? 0.0 : TERRAIN_COST[t] * (wa == 1 ? SHALLOW : 1.0));
	}
	for (const auto &o : objects) { // boulders, ruins, towers close their footprint (src/war/region/objects.ts footprintTiles)
		const int fw = o.second.first, fh = o.second.second;
		const int x0 = int(js::round(o.first.first - fw / 2.0)), y0 = int(js::round(o.first.second - fh / 2.0));
		for (int ty = y0; ty < y0 + fh; ty++)
			for (int tx = x0; tx < x0 + fw; tx++)
				if (tx >= 0 && ty >= 0 && tx < w && ty < h) cost[ty * w + tx] = 0;
	}
	for (size_t k = 0; k + 1 < blocked.size(); k += 2)
		for (int i = blocked[k]; i < std::min(N, blocked[k] + blocked[k + 1]); i++) cost[i] = 0;
	gate.assign(N, 0);
	deck.assign(N, 0);
	span.assign(N, 0);
	plat.assign(N, -1);
	trench.assign(N, 0);
	narrow.assign(N, 0);
	team = -1;
	engine = cart = false;
	dirty.clear();
	build_sectors();
	ensure_scratch();
}

int Grid::step_to(int a, int ax, int ay, int k) const {
	const int nx = ax + DX[k], ny = ay + DY[k];
	if (nx < 0 || ny < 0 || nx >= w || ny >= h) return -1;
	const int b = ny * w + nx;
	if (!can_enter(a, b)) return -1;
	if (k >= 4) {
		const int c1 = ay * w + nx, c2 = ny * w + ax;
		if (span[a] && span[b] && ((span[c1] && can_enter(a, c1)) || (span[c2] && can_enter(a, c2)))) return b;
		if (deck[a] != deck[b] || !can_enter(a, c1) || !can_enter(a, c2)) return -1;
		if (!can_enter(c1, b) || !can_enter(c2, b)) return -1;
	}
	return b;
}

void Grid::build_sectors() {
	bw = (w + SECTOR - 1) / SECTOR;
	bh = (h + SECTOR - 1) / SECTOR;
	node.assign(w * h, -1);
	n = 0;
	bx.clear();
	by.clear();
	cx.clear();
	cy.clear();
	start.assign(1, 0);
	adj.clear();
	adj_cost.clear();
	block_nodes.assign(bw * bh, {});
	links.clear();
	mean_cost.clear();
	std::vector<int> all(bw * bh);
	for (int b = 0; b < bw * bh; b++) all[b] = b;
	rebuild_blocks(all, all);
}

void Grid::flush_sectors() {
	if (dirty.empty()) return;
	std::vector<int> d;
	d.swap(dirty);
	update_sectors(d);
}

void Grid::update_sectors(const std::vector<int> &tiles) {
	std::set<int> dirty_blocks;
	for (size_t i = 0; i + 1 < tiles.size(); i += 2) {
		const int x = int(std::floor(tiles[i] / double(SECTOR))), y = int(std::floor(tiles[i + 1] / double(SECTOR)));
		if (x >= 0 && y >= 0 && x < bw && y < bh) dirty_blocks.insert(y * bw + x);
	}
	if (dirty_blocks.empty()) return;
	if (n > (w * h) / 4.0) {
		build_sectors();
		return;
	}
	std::set<int> ring;
	for (int b : dirty_blocks) {
		const int x0 = b % bw, y0 = b / bw;
		for (int y = std::max(0, y0 - 1); y <= std::min(bh - 1, y0 + 1); y++)
			for (int x = std::max(0, x0 - 1); x <= std::min(bw - 1, x0 + 1); x++) ring.insert(y * bw + x);
	}
	rebuild_blocks(std::vector<int>(dirty_blocks.begin(), dirty_blocks.end()), std::vector<int>(ring.begin(), ring.end()));
}

void Grid::rebuild_blocks(const std::vector<int> &cut, const std::vector<int> &relink) {
	const int saved_team = team;
	team = -1;
	std::vector<int> stack;
	for (int b : cut) {
		for (int k : block_nodes[b]) links[k].clear();
		const int bcol = b % bw, brow = b / bw;
		const int x0 = bcol * SECTOR, y0 = brow * SECTOR, x1 = std::min(w, x0 + SECTOR), y1 = std::min(h, y0 + SECTOR);
		for (int y = y0; y < y1; y++)
			for (int x = x0; x < x1; x++) node[y * w + x] = -1;
		std::vector<int32_t> nodes;
		for (int y = y0; y < y1; y++)
			for (int x = x0; x < x1; x++) {
				const int i = y * w + x;
				if (node[i] >= 0 || double(cost[i]) == 0) continue;
				const int id = int(bx.size());
				double sx = 0, sy = 0, sco = 0;
				int count = 0;
				node[i] = id;
				stack.push_back(i);
				while (!stack.empty()) {
					const int t = stack.back();
					stack.pop_back();
					const int tx = t % w, ty = t / w;
					sx += tx + 0.5;
					sy += ty + 0.5;
					sco += double(cost[t]);
					count++;
					for (int k = 0; k < 8; k++) {
						const int nb = step_to(t, tx, ty, k);
						if (nb < 0 || node[nb] >= 0 || (nb % w) / SECTOR != bcol || (nb / w) / SECTOR != brow) continue;
						node[nb] = id;
						stack.push_back(nb);
					}
				}
				bx.push_back(bcol);
				by.push_back(brow);
				cx.push_back(float(sx / count));
				cy.push_back(float(sy / count));
				mean_cost.push_back(sco / count);
				links.emplace_back();
				nodes.push_back(id);
			}
		block_nodes[b] = nodes;
	}
	n = int(bx.size());
	// links of every node in the relinked blocks, from the steps out of their tiles (steps are symmetric)
	std::map<int, std::set<int>> sets;
	for (int b : relink)
		for (int k : block_nodes[b]) sets[k];
	for (int b : relink) {
		const int x0 = (b % bw) * SECTOR, y0 = (b / bw) * SECTOR;
		for (int y = y0; y < std::min(h, y0 + SECTOR); y++)
			for (int x = x0; x < std::min(w, x0 + SECTOR); x++) {
				const int t = y * w + x, a = node[t];
				if (a < 0) continue;
				for (int k = 0; k < 8; k++) {
					const int nb = step_to(t, x, y, k);
					if (nb < 0 || node[nb] == a) continue;
					const int o = node[nb];
					sets[a].insert(o);
					auto back = sets.find(o);
					if (back != sets.end()) back->second.insert(a);
					else if (std::find(links[o].begin(), links[o].end(), a) == links[o].end()) links[o].push_back(a);
				}
			}
	}
	// outer nodes drop links to nodes that no longer exist (dead ids from re-cut blocks)
	auto alive = [&](int k) {
		const auto &l = block_nodes[by[k] * bw + bx[k]];
		return std::find(l.begin(), l.end(), k) != l.end();
	};
	for (int b : relink) {
		const int bcol = b % bw, brow = b / bw;
		for (int y = std::max(0, brow - 1); y <= std::min(bh - 1, brow + 1); y++)
			for (int x = std::max(0, bcol - 1); x <= std::min(bw - 1, bcol + 1); x++)
				for (int k : block_nodes[y * bw + x])
					if (!sets.count(k)) {
						std::vector<int32_t> kept;
						for (int q : links[k])
							if (alive(q)) kept.push_back(q);
						links[k] = kept;
					}
	}
	for (auto &kv : sets) links[kv.first] = std::vector<int32_t>(kv.second.begin(), kv.second.end()); // std::set: sorted
	// CSR
	start.assign(n + 1, 0);
	for (int k = 0; k < n; k++) start[k + 1] = start[k] + int(links[k].size());
	adj.assign(start[n], 0);
	adj_cost.assign(start[n], 0);
	for (int k = 0; k < n; k++) {
		int j = start[k];
		for (int o : links[k]) {
			adj[j] = o;
			adj_cost[j++] = float(js::hypot(double(cx[o]) - double(cx[k]), double(cy[o]) - double(cy[k])) * 0.5 * (mean_cost[k] + mean_cost[o]));
		}
	}
	team = saved_team;
}

int Grid::tile_at(double x, double y) const {
	const double tx = std::floor(x), ty = std::floor(y);
	return tx < 0 || ty < 0 || tx >= w || ty >= h ? -1 : int(ty) * w + int(tx);
}

std::vector<uint8_t> Grid::cart_land() {
	const int N = w * h;
	std::vector<int> seen_(N, -1), stack;
	const int saved_team = team;
	team = -1;
	cart = engine = true;
	int best = -1, best_n = 0;
	for (int i = 0; i < N; i++) {
		if (seen_[i] >= 0 || double(cost[i]) <= 0 || double(cart_mul[i]) <= 0) continue;
		int size = 0;
		seen_[i] = i;
		stack.push_back(i);
		while (!stack.empty()) {
			const int a = stack.back(), x = a % w;
			stack.pop_back();
			size++;
			for (int b : { x > 0 ? a - 1 : -1, x < w - 1 ? a + 1 : -1, a - w, a + w })
				if (b >= 0 && b < N && seen_[b] < 0 && can_enter(a, b)) {
					seen_[b] = i;
					stack.push_back(b);
				}
		}
		if (size > best_n) {
			best_n = size;
			best = i;
		}
	}
	cart = engine = false;
	team = saved_team;
	std::vector<uint8_t> out(N);
	for (int i = 0; i < N; i++) out[i] = seen_[i] == best ? 1 : 0;
	return out;
}

std::pair<double, double> Grid::nearest_land(const std::vector<uint8_t> &land, double x, double y) const {
	const int cxi = int(std::floor(x)), cyi = int(std::floor(y));
	auto at = [&](int tx, int ty) { return tx >= 0 && ty >= 0 && tx < w && ty < h && land[ty * w + tx] == 1; };
	if (at(cxi, cyi)) return { x, y };
	for (int r = 1; r < std::max(w, h); r++) {
		bool found = false;
		std::pair<double, double> best;
		double best_d = INF;
		for (int d = -r; d <= r; d++) {
			const int cand[4][2] = { { cxi + d, cyi - r }, { cxi + d, cyi + r }, { cxi - r, cyi + d }, { cxi + r, cyi + d } };
			for (const auto &c : cand) {
				const double dist = js::hypot(c[0] - cxi, c[1] - cyi);
				if (dist < best_d && at(c[0], c[1])) {
					best_d = dist;
					best = { c[0] + 0.5, c[1] + 0.5 };
					found = true;
				}
			}
		}
		if (found) return best;
	}
	return { x, y };
}

bool Grid::can_enter(int a, int b) const {
	if (b < 0 || double(cost[b]) <= 0 || (gate[b] != 0 && team >= 0 && gate[b] != team + 1)) return false;
	if (engine && trench[b]) return false;
	if (cart && (deck[b] != 0 || double(cart_mul[b]) <= 0 || narrow[b])) return false;
	const int da = deck[a], db = deck[b];
	if ((da == LADDER && db == DECK) || (da == DECK && db == LADDER)) return true;
	if (std::abs(int(height[b]) - int(height[a])) >= 2) return false;
	return (da != DECK && db != DECK) || (da != 0 && db != 0);
}

double Grid::step_cost(int a, int b) const {
	if (cart) return height[b] > height[a] ? double(cart_mul[b]) * CART_UPHILL : double(cart_mul[b]);
	return height[b] > height[a] ? double(cost[b]) * UPHILL : double(cost[b]);
}

bool Grid::line_clear(double x0, double y0, double x1, double y1) const {
	const int steps = int(std::ceil(js::hypot(x1 - x0, y1 - y0) * 4));
	int prev = tile_at(x0, y0);
	if (prev < 0) return false;
	for (int s = 1; s <= steps; s++) {
		const int t = tile_at(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps);
		if (t != prev) {
			if (!can_enter(prev, t)) return false;
			prev = t;
		}
	}
	return true;
}

double Grid::line_cost(double x0, double y0, double x1, double y1, double r) const {
	const double len = js::hypot(x1 - x0, y1 - y0);
	if (len < 1e-6) return 0;
	const double nx = (-(y1 - y0) / len) * r, ny = ((x1 - x0) / len) * r;
	if (r > 0 && (!line_clear(x0 + nx, y0 + ny, x1 + nx, y1 + ny) || !line_clear(x0 - nx, y0 - ny, x1 - nx, y1 - ny))) return INF;
	const int steps = int(std::ceil(len * 4));
	const double ds = len / steps;
	int prev = tile_at(x0, y0);
	double c = 0;
	if (prev < 0) return INF;
	for (int s = 1; s <= steps; s++) {
		const int t = tile_at(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps);
		if (t != prev) {
			if (!can_enter(prev, t)) return INF;
			if ((x1 - x0) * (y1 - y0) != 0) {
				const int px = prev % w, py = prev / w, tx = t % w, ty = t / w;
				if (px != tx && py != ty && !(span[prev] && span[t]) && (!can_enter(prev, py * w + tx) || !can_enter(prev, ty * w + px) || !can_enter(py * w + tx, t) || !can_enter(ty * w + px, t))) return INF;
			}
		}
		c += (height[t] > height[prev] ? double(cost[t]) * UPHILL : double(cost[t])) * ds;
		prev = t;
	}
	return c;
}

std::vector<double> Grid::pull_path(const std::vector<double> &pts, const std::vector<double> &pc, const std::vector<bool> &keep, double r) const {
	const int N = int(pts.size() / 2);
	if (N <= 2) return pts;
	std::vector<double> out{ pts[0], pts[1] };
	int i = 0;
	while (i < N - 1) {
		int j = i + 1;
		if (!keep[i])
			for (int k = i + 2; k < N; k++) {
				if (keep[k - 1]) break;
				const double c = line_cost(pts[i * 2], pts[i * 2 + 1], pts[k * 2], pts[k * 2 + 1], r);
				if (c > (pc[k] - pc[i]) * 1.04 + 0.05) {
					if (c == INF) break;
					continue;
				}
				j = k;
			}
		out.push_back(pts[j * 2]);
		out.push_back(pts[j * 2 + 1]);
		i = j;
	}
	return out;
}

int Grid::nearest_open(int tx, int ty) const {
	const int m = std::max(w, h);
	for (int r = 0; r < m; r++)
		for (int y = ty - r; y <= ty + r; y++)
			for (int x = tx - r; x <= tx + r; x++) {
				if ((std::abs(x - tx) != r && std::abs(y - ty) != r) || x < 0 || y < 0 || x >= w || y >= h) continue;
				if (double(cost[y * w + x]) > 0) return y * w + x;
			}
	return -1;
}

// --- A* ---

void Grid::heap_push(int nd, double f) {
	if (heap_size == int(heap_node.size())) {
		const int size = std::max(HEAP0, 2 * heap_size);
		heap_node.resize(size);
		heap_f.resize(size);
	}
	int i = heap_size++;
	while (i > 0) {
		const int p = (i - 1) >> 1;
		if (double(heap_f[p]) <= f) break;
		heap_node[i] = heap_node[p];
		heap_f[i] = heap_f[p];
		i = p;
	}
	heap_node[i] = nd;
	heap_f[i] = float(f);
}

int Grid::heap_pop() {
	const int top = heap_node[0];
	heap_size--;
	const int last_n = heap_node[heap_size];
	const double last_f = heap_f[heap_size];
	int i = 0;
	for (;;) {
		int c = 2 * i + 1;
		if (c >= heap_size) break;
		if (c + 1 < heap_size && double(heap_f[c + 1]) < double(heap_f[c])) c++;
		if (double(heap_f[c]) >= last_f) break;
		heap_node[i] = heap_node[c];
		heap_f[i] = heap_f[c];
		i = c;
	}
	heap_node[i] = last_n;
	heap_f[i] = float(last_f);
	return top;
}

std::vector<int32_t> Grid::find_path(int s, int goal) {
	ensure_scratch();
	stamp++;
	const int a = node[s], b = node[goal];
	const bool nodes = a >= 0 && b >= 0 && a != b;
	if (nodes) corridor(a, b);
	std::vector<int32_t> out = tile_search(s, goal, nodes);
	if (engine && nodes && out.back() != goal) {
		stamp++;
		return tile_search(s, goal, false);
	}
	return out;
}

void Grid::ensure_scratch() {
	const int N = w * h;
	if (scratch_n != N) {
		scratch_n = N;
		g_score.assign(N, 0);
		parent.assign(N, 0);
		seen.assign(N, 0);
		closed.assign(N, 0);
		if (int(heap_node.size()) < HEAP0) {
			heap_node.resize(HEAP0);
			heap_f.resize(HEAP0);
		}
		stamp = 0;
	}
	if (int(allowed.size()) < n) allowed.assign(n, 0);
}

void Grid::corridor(int a, int b) {
	const double gx = cx[b], gy = cy[b];
	auto h_of = [&](int k) { return MIN_COST * js::hypot(double(cx[k]) - gx, double(cy[k]) - gy); };
	heap_size = 0;
	g_score[a] = 0;
	parent[a] = -1;
	seen[a] = stamp;
	heap_push(a, h_of(a));
	int best = a;
	double best_h = h_of(a);
	while (heap_size > 0) {
		const int cur = heap_pop();
		if (closed[cur] == stamp) continue;
		closed[cur] = stamp;
		if (cur == b) {
			best = cur;
			break;
		}
		const double hc = h_of(cur);
		if (hc < best_h) {
			best_h = hc;
			best = cur;
		}
		for (int j = start[cur]; j < start[cur + 1]; j++) {
			const int nb = adj[j];
			if (closed[nb] == stamp) continue;
			const double ng = double(g_score[cur]) + double(adj_cost[j]);
			if (seen[nb] == stamp && ng >= double(g_score[nb])) continue;
			seen[nb] = stamp;
			g_score[nb] = float(ng);
			parent[nb] = cur;
			heap_push(nb, ng + h_of(nb));
		}
	}
	for (int k = best; k != -1; k = parent[k])
		for (int y = std::max(0, by[k] - 1); y <= std::min(bh - 1, by[k] + 1); y++)
			for (int x = std::max(0, bx[k] - 1); x <= std::min(bw - 1, bx[k] + 1); x++)
				for (int o : block_nodes[y * bw + x]) allowed[o] = stamp;
	stamp++; // the tile search reuses the scratch; its nodes check allowed against stamp - 1
}

std::vector<int32_t> Grid::tile_search(int s, int goal, bool restricted) {
	const int pass = stamp - 1, gx = goal % w, gy = goal / w;
	auto h_of = [&](int i) {
		const int dx = std::abs((i % w) - gx), dy = std::abs((i / w) - gy);
		return MIN_COST * (std::max(dx, dy) + (SQRT2 - 1) * std::min(dx, dy));
	};
	heap_size = 0;
	g_score[s] = 0;
	parent[s] = -1;
	seen[s] = stamp;
	heap_push(s, h_of(s));
	int best = s;
	double best_h = h_of(s);
	while (heap_size > 0) {
		const int cur = heap_pop();
		if (closed[cur] == stamp) continue;
		closed[cur] = stamp;
		if (cur == goal) {
			best = cur;
			break;
		}
		const double hc = h_of(cur);
		if (hc < best_h) {
			best_h = hc;
			best = cur;
		}
		const int cxx = cur % w, cyy = cur / w;
		for (int k = 0; k < 8; k++) {
			const int nb = step_to(cur, cxx, cyy, k);
			// TS: allowed[-1] is undefined, never the pass stamp
			if (nb < 0 || closed[nb] == stamp || (restricted && (node[nb] < 0 || allowed[node[nb]] != pass))) continue;
			const double ng = double(g_score[cur]) + step_cost(cur, nb) * (k >= 4 ? SQRT2 : 1.0);
			if (seen[nb] == stamp && ng >= double(g_score[nb])) continue;
			seen[nb] = stamp;
			g_score[nb] = float(ng);
			parent[nb] = cur;
			heap_push(nb, ng + h_of(nb));
		}
	}
	std::vector<int32_t> out;
	for (int i = best; i != -1; i = parent[i]) out.push_back(i);
	std::reverse(out.begin(), out.end());
	return out;
}

} // namespace sim

namespace godot {

namespace {
template <typename T>
PackedByteArray raw(const std::vector<T> &v) {
	PackedByteArray b;
	b.resize(int64_t(v.size() * sizeof(T)));
	if (!v.empty()) memcpy(b.ptrw(), v.data(), v.size() * sizeof(T));
	return b;
}
} // namespace

Ref<Grid> Grid::build(const PackedByteArray &cells, int w, int h, const Dictionary &meta, const Dictionary &object_blocks) {
	ERR_FAIL_COND_V_MSG(cells.size() != int64_t(w) * h * 2, Ref<Grid>(), "cells must be one u16 per tile");
	std::vector<uint16_t> c(size_t(w) * h);
	for (int i = 0; i < w * h; i++) c[i] = uint16_t(cells.decode_u16(i * 2));
	std::vector<std::pair<std::pair<double, double>, std::pair<int, int>>> objects;
	const Array objs = meta.get("objects", Array());
	for (int64_t k = 0; k < objs.size(); k++) {
		const Dictionary o = objs[k];
		const Variant fp = object_blocks.get(o["id"], Variant());
		if (fp.get_type() == Variant::NIL) continue;
		const Array a = fp;
		objects.push_back({ { double(o["x"]), double(o["y"]) }, { int(double(a[0])), int(double(a[1])) } });
	}
	std::vector<int> blocked;
	const Array bl = meta.get("blocked", Array());
	for (int64_t k = 0; k < bl.size(); k++) blocked.push_back(int(double(bl[k])));
	Ref<Grid> g;
	g.instantiate();
	g->g.build(c.data(), w, h, objects, blocked);
	return g;
}

PackedByteArray Grid::bytes_of(const String &name) const {
	if (name == "cost") return raw(g.cost);
	if (name == "height") return raw(g.height);
	if (name == "ground") return raw(g.ground);
	if (name == "cartMul") return raw(g.cart_mul);
	if (name == "node") return raw(g.node);
	if (name == "start") return raw(g.start);
	if (name == "adj") return raw(g.adj);
	if (name == "adjCost") return raw(g.adj_cost);
	if (name == "cx") return raw(g.cx);
	if (name == "cy") return raw(g.cy);
	if (name == "gate") return raw(g.gate);
	if (name == "deck") return raw(g.deck);
	if (name == "span") return raw(g.span);
	if (name == "trench") return raw(g.trench);
	if (name == "narrow") return raw(g.narrow);
	if (name == "plat") return raw(g.plat);
	ERR_FAIL_V_MSG(PackedByteArray(), "no grid array " + name);
}

Array Grid::pull_path(const Array &pts, const Array &cost, const Array &keep, double r) const {
	std::vector<double> p, c;
	std::vector<bool> k;
	for (int64_t i = 0; i < pts.size(); i++) p.push_back(pts[i]);
	for (int64_t i = 0; i < cost.size(); i++) c.push_back(cost[i]);
	for (int64_t i = 0; i < keep.size(); i++) k.push_back(bool(keep[i]));
	Array out;
	for (double v : g.pull_path(p, c, k, r)) out.push_back(v);
	return out;
}

PackedByteArray Grid::cart_land() { return raw(g.cart_land()); }

Array Grid::nearest_land(const PackedByteArray &land, double x, double y) const {
	std::vector<uint8_t> l(land.ptr(), land.ptr() + land.size());
	const auto p = g.nearest_land(l, x, y);
	Array out;
	out.push_back(p.first);
	out.push_back(p.second);
	return out;
}

PackedInt32Array Grid::find_path(int s, int goal) {
	PackedInt32Array out;
	for (int32_t t : g.find_path(s, goal)) out.push_back(t);
	return out;
}

void Grid::_bind_methods() {
	ClassDB::bind_static_method("Grid", D_METHOD("build", "cells", "w", "h", "meta", "object_blocks"), &Grid::build);
	ClassDB::bind_method(D_METHOD("get_w"), &Grid::get_w);
	ClassDB::bind_method(D_METHOD("get_h"), &Grid::get_h);
	ADD_PROPERTY(PropertyInfo(Variant::INT, "w"), "", "get_w");
	ADD_PROPERTY(PropertyInfo(Variant::INT, "h"), "", "get_h");
	ClassDB::bind_method(D_METHOD("get_team"), &Grid::get_team);
	ClassDB::bind_method(D_METHOD("set_team", "team"), &Grid::set_team);
	ADD_PROPERTY(PropertyInfo(Variant::INT, "team"), "set_team", "get_team");
	ClassDB::bind_method(D_METHOD("get_engine"), &Grid::get_engine);
	ClassDB::bind_method(D_METHOD("set_engine", "engine"), &Grid::set_engine);
	ADD_PROPERTY(PropertyInfo(Variant::BOOL, "engine"), "set_engine", "get_engine");
	ClassDB::bind_method(D_METHOD("get_cart"), &Grid::get_cart);
	ClassDB::bind_method(D_METHOD("set_cart", "cart"), &Grid::set_cart);
	ADD_PROPERTY(PropertyInfo(Variant::BOOL, "cart"), "set_cart", "get_cart");
	ClassDB::bind_method(D_METHOD("sectors"), &Grid::sectors);
	ClassDB::bind_method(D_METHOD("set_cost", "i", "v"), &Grid::set_cost);
	ClassDB::bind_method(D_METHOD("cost_at", "i"), &Grid::cost_at);
	ClassDB::bind_method(D_METHOD("set_height", "i", "v"), &Grid::set_height);
	ClassDB::bind_method(D_METHOD("height_at", "i"), &Grid::height_at);
	ClassDB::bind_method(D_METHOD("set_deck", "i", "v"), &Grid::set_deck);
	ClassDB::bind_method(D_METHOD("set_span", "i", "v"), &Grid::set_span);
	ClassDB::bind_method(D_METHOD("set_narrow", "i", "v"), &Grid::set_narrow);
	ClassDB::bind_method(D_METHOD("set_gate", "i", "v"), &Grid::set_gate);
	ClassDB::bind_method(D_METHOD("set_trench", "i", "v"), &Grid::set_trench);
	ClassDB::bind_method(D_METHOD("mark_dirty", "x", "y"), &Grid::mark_dirty);
	ClassDB::bind_method(D_METHOD("bytes_of", "name"), &Grid::bytes_of);
	ClassDB::bind_method(D_METHOD("can_enter", "a", "b"), &Grid::can_enter);
	ClassDB::bind_method(D_METHOD("step_cost", "a", "b"), &Grid::step_cost);
	ClassDB::bind_method(D_METHOD("tile_at", "x", "y"), &Grid::tile_at);
	ClassDB::bind_method(D_METHOD("line_clear", "x0", "y0", "x1", "y1"), &Grid::line_clear);
	ClassDB::bind_method(D_METHOD("line_cost", "x0", "y0", "x1", "y1", "r"), &Grid::line_cost);
	ClassDB::bind_method(D_METHOD("walk_clear", "x0", "y0", "x1", "y1"), &Grid::walk_clear);
	ClassDB::bind_method(D_METHOD("pull_path", "pts", "cost", "keep", "r"), &Grid::pull_path);
	ClassDB::bind_method(D_METHOD("nearest_open", "tx", "ty"), &Grid::nearest_open);
	ClassDB::bind_method(D_METHOD("cart_land"), &Grid::cart_land);
	ClassDB::bind_method(D_METHOD("nearest_land", "land", "x", "y"), &Grid::nearest_land);
	ClassDB::bind_method(D_METHOD("flush_sectors"), &Grid::flush_sectors);
	ClassDB::bind_method(D_METHOD("find_path", "start", "goal"), &Grid::find_path);
}

} // namespace godot
