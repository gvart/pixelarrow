## The movement grid (src/war/sim/grid.ts), ported line for line so paths come out tile for tile the same: the cost,
## search score and heap arrays are float32 (PackedFloat32Array, as the TS Float32Arrays: stored rounded, read as
## doubles), node ids and steps iterate in the TS order, and ties break the same way. A Grid owns its A* scratch (the TS
## shares one per isolate; results never depend on the stamp values, only on their equality).
class_name Grid
extends RefCounted

const SECTOR := 8
const DECK := 1
const STAIR := 2
const LADDER := 3  # ladder or tower door: joins ground to the deck beside it whatever the height
const BOG := 1
const FOREST := 2

## By terrain index (Region.TERRAIN: grass forest sand marsh rock road snow dirt); 0 = impassable.
const TERRAIN_COST := [1.0, 1.6, 1.4, 2.0, 0.0, 0.7, 1.5, 1.0]
const SHALLOW := 2.0
## M6b cart pace by terrain (1 / speed factor); 0: closed.
const CART_COST := [1.0, 0.0, 2.0, 0.0, 0.0, 1.0 / 1.3, 1.5, 1.0]
const CART_FORD := 2.0
const CART_UPHILL := 1.0 / 0.6
const UPHILL := 1.5
const MIN_COST := 0.7
const SQRT2 := 1.4142135623730951
const T_FOREST := 1
const T_MARSH := 3

const DX := [1, -1, 0, 0, 1, 1, -1, -1]
const DY := [0, 0, 1, -1, 1, -1, 1, -1]
const HEAP0 := 1 << 16

var w: int
var h: int
var cost := PackedFloat32Array()
var height := PackedByteArray()
var ground := PackedByteArray()
var gate := PackedByteArray()  ## team + 1 of the owner who may pass, 0 none
var team := -1
var deck := PackedByteArray()
var span := PackedByteArray()
var plat := PackedInt32Array()
var trench := PackedByteArray()
var engine := false
var cart := false
var cart_mul := PackedFloat32Array()
var narrow := PackedByteArray()
var dirty: Array[int] = []

# sectors (the TS Sectors)
var s_node := PackedInt32Array()
var s_n := 0
var s_bx := PackedInt32Array()
var s_by := PackedInt32Array()
var s_cx := PackedFloat32Array()
var s_cy := PackedFloat32Array()
var s_start := PackedInt32Array()
var s_adj := PackedInt32Array()
var s_adj_cost := PackedFloat32Array()
var s_bw := 0
var s_bh := 0
var s_block_nodes: Array[PackedInt32Array] = []
var s_links: Array = []  # node -> Array[int]
var s_mean_cost := PackedFloat64Array()

# A* scratch
var _scratch_n := 0
var _g_score := PackedFloat32Array()
var _parent := PackedInt32Array()
var _seen := PackedInt32Array()
var _closed := PackedInt32Array()
var _heap_node := PackedInt32Array()
var _heap_f := PackedFloat32Array()
var _heap_size := 0
var _stamp := 0
var _allowed := PackedInt32Array()


## buildGrid: from a Region (its layers and meta objects / blocked) and the OBJECT_BLOCKS table.
static func build(r: Region) -> Grid:
	var g := Grid.new()
	g.w = r.w
	g.h = r.h
	var n := r.w * r.h
	g.cost.resize(n)
	g.height.resize(n)
	g.ground.resize(n)
	g.cart_mul.resize(n)
	for i in n:
		var t := r.terrain_at(i)
		var wa := r.water_at(i)
		g.cart_mul[i] = 1.0 if wa == 2 else CART_COST[t] * (CART_FORD if wa == 1 else 1.0)
		g.height[i] = r.height_at(i)
		g.ground[i] = BOG if wa == 1 or t == T_MARSH else (FOREST if t == T_FOREST else 0)
		g.cost[i] = 0.0 if wa == 2 else TERRAIN_COST[t] * (SHALLOW if wa == 1 else 1.0)
	var blocks: Dictionary = GameData.table("src/war/region/objects")["OBJECT_BLOCKS"]
	for o in r.meta.get("objects", []):
		if blocks.has(o["id"]):
			var fp: Array = blocks[o["id"]]
			for xy in footprint_tiles(o["x"], o["y"], int(fp[0]), int(fp[1])):
				if xy[0] >= 0 and xy[1] >= 0 and xy[0] < r.w and xy[1] < r.h:
					g.cost[xy[1] * r.w + xy[0]] = 0.0
	var b: Array = r.meta.get("blocked", [])
	var k := 0
	while k + 1 < b.size():
		for i in range(int(b[k]), mini(n, int(b[k]) + int(b[k + 1]))):
			g.cost[i] = 0.0
		k += 2
	g.gate.resize(n)
	g.deck.resize(n)
	g.span.resize(n)
	g.plat.resize(n)
	g.plat.fill(-1)
	g.trench.resize(n)
	g.narrow.resize(n)
	g._build_sectors()
	g._ensure_scratch()
	return g


## The tiles an object with footprint (fw, fh) centred on its foot point (x, y) covers (src/war/region/objects.ts).
static func footprint_tiles(x: float, y: float, fw: int, fh: int) -> Array:
	var x0 := int(JsMath.round_js(x - fw / 2.0))
	var y0 := int(JsMath.round_js(y - fh / 2.0))
	var out := []
	for ty in range(y0, y0 + fh):
		for tx in range(x0, x0 + fw):
			out.append([tx, ty])
	return out


## Legal step from tile a = (ax,ay) in direction k; the tile or -1.
func _step_to(a: int, ax: int, ay: int, k: int) -> int:
	var nx: int = ax + DX[k]
	var ny: int = ay + DY[k]
	if nx < 0 or ny < 0 or nx >= w or ny >= h:
		return -1
	var b := ny * w + nx
	if not can_enter(a, b):
		return -1
	if k >= 4:
		var c1 := ay * w + nx
		var c2 := ny * w + ax
		if span[a] and span[b] and ((span[c1] and can_enter(a, c1)) or (span[c2] and can_enter(a, c2))):
			return b
		if deck[a] != deck[b] or not can_enter(a, c1) or not can_enter(a, c2):
			return -1
		if not can_enter(c1, b) or not can_enter(c2, b):
			return -1
	return b


func _build_sectors() -> void:
	s_bw = ceili(w / float(SECTOR))
	s_bh = ceili(h / float(SECTOR))
	s_node = PackedInt32Array()
	s_node.resize(w * h)
	s_node.fill(-1)
	s_n = 0
	s_bx = PackedInt32Array()
	s_by = PackedInt32Array()
	s_cx = PackedFloat32Array()
	s_cy = PackedFloat32Array()
	s_start = PackedInt32Array([0])
	s_adj = PackedInt32Array()
	s_adj_cost = PackedFloat32Array()
	s_block_nodes = []
	for b in s_bw * s_bh:
		s_block_nodes.append(PackedInt32Array())
	s_links = []
	s_mean_cost = PackedFloat64Array()
	var all: Array[int] = []
	for b in s_bw * s_bh:
		all.append(b)
	_rebuild_blocks(all, all)


## Re-cut the sectors for the tiles changed since the last flush.
func flush_sectors() -> void:
	if dirty.is_empty():
		return
	update_sectors(dirty)
	dirty = []


func update_sectors(tiles: Array[int]) -> void:
	var dirty_blocks := {}
	var i := 0
	while i < tiles.size():
		var bx := floori(tiles[i] / float(SECTOR))
		var by := floori(tiles[i + 1] / float(SECTOR))
		if bx >= 0 and by >= 0 and bx < s_bw and by < s_bh:
			dirty_blocks[by * s_bw + bx] = true
		i += 2
	if dirty_blocks.is_empty():
		return
	if s_n > (w * h) / 4.0:
		_build_sectors()
		return
	var ring := {}
	for b in dirty_blocks:
		var bx: int = b % s_bw
		var by: int = b / s_bw
		for y in range(maxi(0, by - 1), mini(s_bh - 1, by + 1) + 1):
			for x in range(maxi(0, bx - 1), mini(s_bw - 1, bx + 1) + 1):
				ring[y * s_bw + x] = true
	var cut: Array[int] = []
	cut.assign(dirty_blocks.keys())
	cut.sort()
	var relink: Array[int] = []
	relink.assign(ring.keys())
	relink.sort()
	_rebuild_blocks(cut, relink)


func _rebuild_blocks(cut: Array[int], relink: Array[int]) -> void:
	var saved_team := team
	team = -1
	var stack: Array[int] = []
	for b in cut:
		for k in s_block_nodes[b]:
			s_links[k] = []
		var bcol: int = b % s_bw
		var brow: int = b / s_bw
		var x0 := bcol * SECTOR
		var y0 := brow * SECTOR
		var x1 := mini(w, x0 + SECTOR)
		var y1 := mini(h, y0 + SECTOR)
		for y in range(y0, y1):
			for x in range(x0, x1):
				s_node[y * w + x] = -1
		var nodes := PackedInt32Array()
		for y in range(y0, y1):
			for x in range(x0, x1):
				var i := y * w + x
				if s_node[i] >= 0 or cost[i] == 0.0:
					continue
				var id := s_bx.size()
				var sx := 0.0
				var sy := 0.0
				var sco := 0.0
				var count := 0
				s_node[i] = id
				stack.append(i)
				while not stack.is_empty():
					var t: int = stack.pop_back()
					var tx := t % w
					var ty := t / w
					sx += tx + 0.5
					sy += ty + 0.5
					sco += cost[t]
					count += 1
					for k in 8:
						var nb := _step_to(t, tx, ty, k)
						if nb < 0 or s_node[nb] >= 0 or (nb % w) / SECTOR != bcol or (nb / w) / SECTOR != brow:
							continue
						s_node[nb] = id
						stack.append(nb)
				s_bx.append(bcol)
				s_by.append(brow)
				s_cx.append(sx / count)
				s_cy.append(sy / count)
				s_mean_cost.append(sco / count)
				s_links.append([])
				nodes.append(id)
		s_block_nodes[b] = nodes
	s_n = s_bx.size()
	# links of every node in the relinked blocks, from the steps out of their tiles (steps are symmetric)
	var sets := {}
	for b in relink:
		for k in s_block_nodes[b]:
			sets[k] = {}
	for b in relink:
		var x0: int = (b % s_bw) * SECTOR
		var y0: int = (b / s_bw) * SECTOR
		for y in range(y0, mini(h, y0 + SECTOR)):
			for x in range(x0, mini(w, x0 + SECTOR)):
				var t := y * w + x
				var a := s_node[t]
				if a < 0:
					continue
				for k in 8:
					var nb := _step_to(t, x, y, k)
					if nb < 0 or s_node[nb] == a:
						continue
					var o := s_node[nb]
					sets[a][o] = true
					if sets.has(o):
						sets[o][a] = true
					elif not s_links[o].has(a):
						s_links[o].append(a)
	# outer nodes drop links to nodes that no longer exist (dead ids from re-cut blocks)
	for b in relink:
		var bcol: int = b % s_bw
		var brow: int = b / s_bw
		for y in range(maxi(0, brow - 1), mini(s_bh - 1, brow + 1) + 1):
			for x in range(maxi(0, bcol - 1), mini(s_bw - 1, bcol + 1) + 1):
				for k in s_block_nodes[y * s_bw + x]:
					if not sets.has(k):
						s_links[k] = s_links[k].filter(func(q: int) -> bool: return s_block_nodes[s_by[q] * s_bw + s_bx[q]].has(q))
	for k in sets:
		var l: Array = sets[k].keys()
		l.sort()
		s_links[k] = l
	# CSR
	var n := s_n
	s_start = PackedInt32Array()
	s_start.resize(n + 1)
	for k in n:
		s_start[k + 1] = s_start[k] + s_links[k].size()
	s_adj = PackedInt32Array()
	s_adj.resize(s_start[n])
	s_adj_cost = PackedFloat32Array()
	s_adj_cost.resize(s_start[n])
	for k in n:
		var j := s_start[k]
		for o in s_links[k]:
			s_adj[j] = o
			s_adj_cost[j] = JsMath.hypot(s_cx[o] - s_cx[k], s_cy[o] - s_cy[k]) * 0.5 * (s_mean_cost[k] + s_mean_cost[o])
			j += 1
	team = saved_team


func tile_at(x: float, y: float) -> int:
	var tx := floori(x)
	var ty := floori(y)
	return -1 if tx < 0 or ty < 0 or tx >= w or ty >= h else ty * w + tx


## W-145: the largest connected piece of ground carts can roll over, as a mask (1 on it).
func cart_land() -> PackedByteArray:
	var n := w * h
	var seen := PackedInt32Array()
	seen.resize(n)
	seen.fill(-1)
	var saved_team := team
	var stack: Array[int] = []
	team = -1
	cart = true
	engine = true
	var best := -1
	var best_n := 0
	for i in n:
		if seen[i] >= 0 or cost[i] <= 0.0 or cart_mul[i] <= 0.0:
			continue
		var size := 0
		seen[i] = i
		stack.append(i)
		while not stack.is_empty():
			var a: int = stack.pop_back()
			var x := a % w
			size += 1
			for b in [a - 1 if x > 0 else -1, a + 1 if x < w - 1 else -1, a - w, a + w]:
				if b >= 0 and b < n and seen[b] < 0 and can_enter(a, b):
					seen[b] = i
					stack.append(b)
		if size > best_n:
			best_n = size
			best = i
	cart = false
	engine = false
	team = saved_team
	var out := PackedByteArray()
	out.resize(n)
	for i in n:
		out[i] = 1 if seen[i] == best else 0
	return out


## The middle of the nearest tile of `land` to (x,y); (x,y) itself if it is on it.
func nearest_land(land: PackedByteArray, x: float, y: float) -> Array:
	var cx := floori(x)
	var cy := floori(y)
	if _on_land(land, cx, cy):
		return [x, y]
	for r in range(1, maxi(w, h)):
		var best = null
		var best_d := INF
		for d in range(-r, r + 1):
			for txy in [[cx + d, cy - r], [cx + d, cy + r], [cx - r, cy + d], [cx + r, cy + d]]:
				var dist := JsMath.hypot(txy[0] - cx, txy[1] - cy)
				if dist < best_d and _on_land(land, txy[0], txy[1]):
					best_d = dist
					best = [txy[0] + 0.5, txy[1] + 0.5]
		if best != null:
			return best
	return [x, y]


func _on_land(land: PackedByteArray, tx: int, ty: int) -> bool:
	return tx >= 0 and ty >= 0 and tx < w and ty < h and land[ty * w + tx] == 1


## Can a unit (of team `team`) step from tile a into the adjacent tile b?
func can_enter(a: int, b: int) -> bool:
	if b < 0 or cost[b] <= 0.0 or (gate[b] != 0 and team >= 0 and gate[b] != team + 1):
		return false
	if engine and trench[b]:
		return false
	if cart and (deck[b] != 0 or cart_mul[b] <= 0.0 or narrow[b]):
		return false
	var da := deck[a]
	var db := deck[b]
	if (da == LADDER and db == DECK) or (da == DECK and db == LADDER):
		return true
	if absi(height[b] - height[a]) >= 2:
		return false
	return (da != DECK and db != DECK) or (da != 0 and db != 0)


## Cost multiplier for moving from tile a into tile b (terrain of b, slower uphill).
func step_cost(a: int, b: int) -> float:
	if cart:
		return cart_mul[b] * CART_UPHILL if height[b] > height[a] else float(cart_mul[b])
	return cost[b] * UPHILL if height[b] > height[a] else float(cost[b])


## Straight walk from (x0,y0) to (x1,y1) crosses no blocked tile or cliff.
func line_clear(x0: float, y0: float, x1: float, y1: float) -> bool:
	var steps := ceili(JsMath.hypot(x1 - x0, y1 - y0) * 4)
	var prev := tile_at(x0, y0)
	if prev < 0:
		return false
	for s in range(1, steps + 1):
		var t := tile_at(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps)
		if t != prev:
			if not can_enter(prev, t):
				return false
			prev = t
	return true


## W-55: cost of a straight walk in A* units, INF when blocked or within r of a block (centre line and both edges).
func line_cost(x0: float, y0: float, x1: float, y1: float, r: float) -> float:
	var length := JsMath.hypot(x1 - x0, y1 - y0)
	if length < 1e-6:
		return 0.0
	var nx := (-(y1 - y0) / length) * r
	var ny := ((x1 - x0) / length) * r
	if r > 0 and (not line_clear(x0 + nx, y0 + ny, x1 + nx, y1 + ny) or not line_clear(x0 - nx, y0 - ny, x1 - nx, y1 - ny)):
		return INF
	var steps := ceili(length * 4)
	var ds := length / steps
	var prev := tile_at(x0, y0)
	var c := 0.0
	if prev < 0:
		return INF
	for s in range(1, steps + 1):
		var t := tile_at(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps)
		if t != prev:
			if not can_enter(prev, t):
				return INF
			if (x1 - x0) * (y1 - y0) != 0:
				var px := prev % w
				var py := prev / w
				var tx := t % w
				var ty := t / w
				if px != tx and py != ty and not (span[prev] and span[t]) and (not can_enter(prev, py * w + tx) or not can_enter(prev, ty * w + px) or not can_enter(py * w + tx, t) or not can_enter(ty * w + px, t)):
					return INF
		c += (cost[t] * UPHILL if height[t] > height[prev] else float(cost[t])) * ds
		prev = t
	return c


func walk_clear(x0: float, y0: float, x1: float, y1: float) -> bool:
	return line_cost(x0, y0, x1, y1, 0) < INF


## W-55 string pulling: the tile path's corners `pts` (flat x,y) pulled tight where a straight walk is open and no dearer.
func pull_path(pts: Array, path_cost: Array, keep: Array, r: float) -> Array:
	var n := pts.size() / 2
	if n <= 2:
		return pts
	var out := [pts[0], pts[1]]
	var i := 0
	while i < n - 1:
		var j := i + 1
		if not keep[i]:
			for k in range(i + 2, n):
				if keep[k - 1]:
					break
				var c := line_cost(pts[i * 2], pts[i * 2 + 1], pts[k * 2], pts[k * 2 + 1], r)
				if c > (path_cost[k] - path_cost[i]) * 1.04 + 0.05:
					if c == INF:
						break
					continue
				j = k
		out.append(pts[j * 2])
		out.append(pts[j * 2 + 1])
		i = j
	return out


## Nearest open tile to (tx,ty) by growing square rings; -1 if the map has none.
func nearest_open(tx: int, ty: int) -> int:
	var m := maxi(w, h)
	for r in m:
		for y in range(ty - r, ty + r + 1):
			for x in range(tx - r, tx + r + 1):
				if (absi(x - tx) != r and absi(y - ty) != r) or x < 0 or y < 0 or x >= w or y >= h:
					continue
				if cost[y * w + x] > 0:
					return y * w + x
	return -1


# --- A* ---

func _heap_push(node: int, f: float) -> void:
	if _heap_size == _heap_node.size():
		var size := maxi(HEAP0, 2 * _heap_size)
		_heap_node.resize(size)
		_heap_f.resize(size)
	var i := _heap_size
	_heap_size += 1
	while i > 0:
		var p := (i - 1) >> 1
		if _heap_f[p] <= f:
			break
		_heap_node[i] = _heap_node[p]
		_heap_f[i] = _heap_f[p]
		i = p
	_heap_node[i] = node
	_heap_f[i] = f


func _heap_pop() -> int:
	var top := _heap_node[0]
	_heap_size -= 1
	var last_n := _heap_node[_heap_size]
	var last_f := _heap_f[_heap_size]
	var i := 0
	while true:
		var c := 2 * i + 1
		if c >= _heap_size:
			break
		if c + 1 < _heap_size and _heap_f[c + 1] < _heap_f[c]:
			c += 1
		if _heap_f[c] >= last_f:
			break
		_heap_node[i] = _heap_node[c]
		_heap_f[i] = _heap_f[c]
		i = c
	_heap_node[i] = last_n
	_heap_f[i] = last_f
	return top


## 8-way A* over tiles; tile indices from start to goal, or to the explored tile closest to the goal when unreachable.
func find_path(start: int, goal: int) -> PackedInt32Array:
	_ensure_scratch()
	_stamp += 1
	var a := s_node[start]
	var b := s_node[goal]
	var nodes := a >= 0 and b >= 0 and a != b
	if nodes:
		_corridor(a, b)
	var out := _tile_search(start, goal, nodes)
	if engine and nodes and out[out.size() - 1] != goal:
		_stamp += 1
		return _tile_search(start, goal, false)
	return out


func _ensure_scratch() -> void:
	var n := w * h
	if _scratch_n != n:
		_scratch_n = n
		_g_score = PackedFloat32Array()
		_g_score.resize(n)
		_parent = PackedInt32Array()
		_parent.resize(n)
		_seen = PackedInt32Array()
		_seen.resize(n)
		_closed = PackedInt32Array()
		_closed.resize(n)
		if _heap_node.size() < HEAP0:
			_heap_node.resize(HEAP0)
			_heap_f.resize(HEAP0)
		_stamp = 0
	if _allowed.size() < s_n:
		_allowed = PackedInt32Array()
		_allowed.resize(s_n)


func _h_node(k: int, gx: float, gy: float) -> float:
	return MIN_COST * JsMath.hypot(s_cx[k] - gx, s_cy[k] - gy)


func _corridor(a: int, b: int) -> void:
	var gx: float = s_cx[b]
	var gy: float = s_cy[b]
	_heap_size = 0
	_g_score[a] = 0
	_parent[a] = -1
	_seen[a] = _stamp
	_heap_push(a, _h_node(a, gx, gy))
	var best := a
	var best_h := _h_node(a, gx, gy)
	while _heap_size > 0:
		var cur := _heap_pop()
		if _closed[cur] == _stamp:
			continue
		_closed[cur] = _stamp
		if cur == b:
			best = cur
			break
		var hc := _h_node(cur, gx, gy)
		if hc < best_h:
			best_h = hc
			best = cur
		for j in range(s_start[cur], s_start[cur + 1]):
			var nb := s_adj[j]
			if _closed[nb] == _stamp:
				continue
			var ng: float = _g_score[cur] + s_adj_cost[j]
			if _seen[nb] == _stamp and ng >= _g_score[nb]:
				continue
			_seen[nb] = _stamp
			_g_score[nb] = ng
			_parent[nb] = cur
			_heap_push(nb, ng + _h_node(nb, gx, gy))
	var k := best
	while k != -1:
		for y in range(maxi(0, s_by[k] - 1), mini(s_bh - 1, s_by[k] + 1) + 1):
			for x in range(maxi(0, s_bx[k] - 1), mini(s_bw - 1, s_bx[k] + 1) + 1):
				for o in s_block_nodes[y * s_bw + x]:
					_allowed[o] = _stamp
		k = _parent[k]
	_stamp += 1  # the tile search reuses the scratch; its nodes check _allowed against stamp - 1


func _tile_search(start: int, goal: int, restricted: bool) -> PackedInt32Array:
	var pass_stamp := _stamp - 1
	var gx := goal % w
	var gy := goal / w
	_heap_size = 0
	_g_score[start] = 0
	_parent[start] = -1
	_seen[start] = _stamp
	_heap_push(start, _h_tile(start, gx, gy))
	var best := start
	var best_h := _h_tile(start, gx, gy)
	while _heap_size > 0:
		var cur := _heap_pop()
		if _closed[cur] == _stamp:
			continue
		_closed[cur] = _stamp
		if cur == goal:
			best = cur
			break
		var hc := _h_tile(cur, gx, gy)
		if hc < best_h:
			best_h = hc
			best = cur
		var cx := cur % w
		var cy := cur / w
		for k in 8:
			var nb := _step_to(cur, cx, cy, k)
			if nb < 0 or _closed[nb] == _stamp or (restricted and (s_node[nb] < 0 or _allowed[s_node[nb]] != pass_stamp)):  # TS: allowed[-1] is undefined, never pass
				continue
			var ng: float = _g_score[cur] + step_cost(cur, nb) * (SQRT2 if k >= 4 else 1.0)
			if _seen[nb] == _stamp and ng >= _g_score[nb]:
				continue
			_seen[nb] = _stamp
			_g_score[nb] = ng
			_parent[nb] = cur
			_heap_push(nb, ng + _h_tile(nb, gx, gy))
	var out := PackedInt32Array()
	var i := best
	while i != -1:
		out.append(i)
		i = _parent[i]
	out.reverse()
	return out


func _h_tile(i: int, gx: int, gy: int) -> float:
	var dx := absi((i % w) - gx)
	var dy := absi((i / w) - gy)
	return MIN_COST * (maxi(dx, dy) + (SQRT2 - 1) * mini(dx, dy))
