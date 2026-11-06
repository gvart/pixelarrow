## Grid builds, searches and re-cuts exactly as the TS grid (godot/tests/golden/vectors/grid.json, src/dev/godotVectors.ts).
extends TestCase

var _v: Dictionary


func _vectors() -> Dictionary:
	if _v.is_empty():
		_v = GameData.read_exact("res://tests/golden/vectors/grid.json")
	return _v


static func sha(b: PackedByteArray) -> String:
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(b)
	return ctx.finish().hex_encode()


func _digest(g: Grid, want: Dictionary, tag: String) -> void:
	var got := {
		"cost": sha(g.cost.to_byte_array()), "height": sha(g.height), "ground": sha(g.ground), "cartMul": sha(g.cart_mul.to_byte_array()),
		"n": g.s_n, "node": sha(g.s_node.to_byte_array()), "start": sha(g.s_start.to_byte_array()), "adj": sha(g.s_adj.to_byte_array()),
		"adjCost": sha(g.s_adj_cost.to_byte_array()), "cx": sha(g.s_cx.to_byte_array()), "cy": sha(g.s_cy.to_byte_array()),
	}
	for k in want:
		var w = int(want[k]) if k == "n" else want[k]
		check(got[k] == w, "%s %s differs%s" % [tag, k, (" (%d vs %d)" % [got[k], w]) if k == "n" else ""])


func _same_ints(got: PackedInt32Array, want: Array, tag: String) -> bool:
	if got.size() != want.size():
		fail("%s: %d tiles, TS %d" % [tag, got.size(), want.size()])
		return false
	for i in got.size():
		if got[i] != int(want[i]):
			fail("%s: differs at %d (%d vs %d)" % [tag, i, got[i], int(want[i])])
			return false
	return true


func _pulled(g: Grid, tiles: PackedInt32Array) -> Array:
	var pts := []
	var c := []
	var keep := []
	var acc := 0.0
	for k in tiles.size():
		if k:
			var diag: bool = tiles[k] % g.w != tiles[k - 1] % g.w and tiles[k] / g.w != tiles[k - 1] / g.w
			acc += g.step_cost(tiles[k - 1], tiles[k]) * (Grid.SQRT2 if diag else 1.0)
		pts.append((tiles[k] % g.w) + 0.5)
		pts.append((tiles[k] / g.w) + 0.5)
		c.append(acc)
		keep.append(false)
	return g.pull_path(pts, c, keep, 0.3)


func test_regions() -> void:
	for v in _vectors()["regions"]:
		var id: String = v["region"]
		var g := Grid.build(Region.load_id(id))
		_digest(g, v["built"], id + " built")
		for p in v["paths"]:
			var tag := "%s path %d->%d" % [id, int(p["a"]), int(p["b"])]
			var got := g.find_path(int(p["a"]), int(p["b"]))
			if _same_ints(got, p["path"], tag):
				check(_pulled(g, got) == p["pulled"], tag + " pulled differs")
		for l in v["lines"]:
			var tag := "%s line %s" % [id, str(l.slice(0, 4))]
			check(g.line_clear(l[0], l[1], l[2], l[3]) == l[4], tag + " line_clear")
			var c := g.line_cost(l[0], l[1], l[2], l[3], 0.3)
			check(c == l[5], "%s line_cost %s vs %s" % [tag, String.num(c, 17), String.num(l[5], 17)])
			check(g.walk_clear(l[0], l[1], l[2], l[3]) == l[6], tag + " walk_clear")
			check(g.tile_at(l[0], l[1]) == int(l[7]), tag + " tile_at")
		for o in v["opens"]:
			check(g.nearest_open(int(o[0]), int(o[1])) == int(o[2]), "%s nearest_open %s" % [id, str(o)])
		var land := g.cart_land()
		check(sha(land) == v["land"], id + " cart_land differs")
		for l in v["lands"]:
			check(g.nearest_land(land, l[0], l[1]) == [l[2], l[3]], "%s nearest_land %s" % [id, str(l)])
		for xy in v["closed"]:
			for y in range(int(xy[1]), mini(g.h, int(xy[1]) + 6)):
				for x in range(int(xy[0]), mini(g.w, int(xy[0]) + 6)):
					g.cost[y * g.w + x] = 0.0
					g.dirty.append(x)
					g.dirty.append(y)
		g.flush_sectors()
		_digest(g, v["after"], id + " after closing")
		for p in v["again"]:
			_same_ints(g.find_path(int(p["a"]), int(p["b"])), p["path"], "%s re-cut path %d->%d" % [id, int(p["a"]), int(p["b"])])


func test_synthetic_modes() -> void:
	var v: Dictionary = _vectors()["synthetic"]
	var g := Grid.build(_synthetic())
	var w := g.w
	for y in range(2, 6):
		g.deck[y * w + 10] = Grid.DECK
		g.deck[y * w + 11] = Grid.DECK
		g.height[y * w + 10] = 2
		g.height[y * w + 11] = 2
	g.deck[6 * w + 10] = Grid.STAIR
	g.height[6 * w + 10] = 1
	g.deck[1 * w + 10] = Grid.LADDER
	for x in range(7, 10):
		g.cost[10 * w + x] = 1
		g.span[10 * w + x] = 1
		g.narrow[10 * w + x] = 1 if x == 8 else 0
	g.span[11 * w + 9] = 1
	g.span[9 * w + 7] = 1
	g.cost[11 * w + 9] = 1
	g.cost[9 * w + 7] = 1
	g.gate[3 * w + 6] = 1
	g.gate[3 * w + 17] = 2
	g.trench[12 * w + 2] = 1
	g.trench[12 * w + 3] = 1
	for i in w * g.h:
		g.dirty.append(i % w)
		g.dirty.append(i / w)
	g.flush_sectors()
	for m in v["modes"]:
		g.team = int(m["team"])
		g.engine = m["engine"]
		g.cart = m["cart"]
		var tag := "synthetic team %d engine %s cart %s" % [g.team, g.engine, g.cart]
		var bad := 0
		for i in w * g.h:
			var bits := 0
			for k in 8:
				var x: int = (i % w) + Grid.DX[k]
				var y: int = (i / w) + Grid.DY[k]
				if x >= 0 and y >= 0 and x < w and y < g.h and g.can_enter(i, y * w + x):
					bits |= 1 << k
			if bits != int(m["enter"][i]):
				bad += 1
		check(bad == 0, "%s: can_enter differs on %d tiles" % [tag, bad])
		var ends := [[0, 23 + w * 15], [w * 2 + 9, w * 14 + 20], [w * 12, w * 12 + 6], [w * 3, w * 3 + 23], [w * 10 + 6, w * 10 + 10]]
		for k in ends.size():
			_same_ints(g.find_path(ends[k][0], ends[k][1]), m["paths"][k], "%s path %d" % [tag, k])
	g.team = -1
	g.engine = false
	g.cart = false
	_digest(g, v["built"], "synthetic")


## The TS synthetic() region (src/dev/godotVectors.ts), built as a Region.
func _synthetic() -> Region:
	var r := Region.new()
	r.id = "synthetic"
	r.w = 24
	r.h = 16
	r.meta = {"id": "synthetic", "w": 24, "h": 16}
	r.cells.resize(r.w * r.h * 2)
	for i in r.w * r.h:
		var x := i % r.w
		var y := i / r.w
		var height := 2 if x >= 12 and x < 16 else (1 if x >= 16 else 0)
		var terrain := "grass"
		if y == 3:
			terrain = "road"
		elif x == 5 and y > 8:
			terrain = "rock"
		elif x < 3 and y < 4:
			terrain = "forest"
		elif y > 12 and x < 6:
			terrain = "marsh"
		var water := (2 if x == 8 else 1) if x >= 7 and x <= 9 and y >= 6 else 0
		r.cells.encode_u16(i * 2, height | (Region.TERRAIN.find(terrain) << 4) | (water << 7))
	return r
