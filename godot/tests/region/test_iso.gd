## The iso projection (src/region/iso.gd) on a small made-up map: tile -> screen and back, the ramp surface, the drawn
## level's clamp, picking a cliff face and hiding behind higher ground; and, when the view data was exported
## (npm run view:godot, not in CI), Elaia's 400 sample points against the TS IsoMap's.
extends TestCase

const OX := 100.0
const OY := 50.0


## 2 x 2 tiles (4 x 4 cells), all level 0 but tile (1, 1) raised to level 2, and cell (0, 2) a ramp (N 0, E 1, S 1, W 0).
static func small() -> Iso:
	var fz := PackedFloat32Array()
	fz.resize(16)
	var fc := PackedFloat32Array()
	fc.resize(64)
	var ramp := PackedByteArray()
	ramp.resize(16)
	for cy in range(2, 4):
		for cx in range(2, 4):
			var j := cy * 4 + cx
			fz[j] = 2.0
			for q in 4:
				fc[4 * j + q] = 2.0
	var r := 2 * 4 + 0
	ramp[r] = 1
	fz[r] = 0.5
	fc[4 * r + 1] = 1.0
	fc[4 * r + 2] = 1.0
	var zu := PackedFloat32Array([0, 0, 0, 2])
	var zh := PackedFloat32Array([0, 0, 1, 2])
	var zm := PackedFloat32Array([0, 0, 1, 2])
	return Iso.make(2, 2, OX, OY, 2.0, 2.0, fz, fc, ramp, zu, zh, zm)


func test_projection() -> void:
	var iso := small()
	check(iso.world(0, 0, 0) == Vector2(OX, OY), "tile origin at OX, OY")
	check(iso.world(1, 0, 0) == Vector2(OX + 32, OY + 16), "a step in x is half a tile right and down")
	check(iso.world(0, 1, 0) == Vector2(OX - 32, OY + 16), "a step in y is half a tile left and down")
	check(iso.world(1, 1, 1) == Vector2(OX, OY + 32 - Iso.LH), "a level lifts LH px")
	check(iso.sx(0.5, 1.5) == iso.world(0.5, 1.5, 0).x and iso.sy(0.5, 1.5, 2) == iso.world(0.5, 1.5, 2).y, "sx, sy agree with world")


func test_surface() -> void:
	var iso := small()
	check(iso.z_at(0.3, 0.3) == 0.0, "flat ground")
	check(iso.z_at(1.5, 1.5) == 2.0, "the raised tile")
	check(iso.z_at(-1, 0) == Iso.ZBASE and iso.z_at(0, 2.1) == Iso.ZBASE, "off the map: the base")
	# the ramp cell (0, 2) spans tile points x 0..0.5, y 1..1.5; its corners N (0, 1), E (0.5, 1), S (0.5, 1.5), W (0, 1.5)
	check(absf(iso.z_at(0.0, 1.0) - 0.0) < 1e-3, "ramp N corner")
	check(absf(iso.z_at(0.4999, 1.0) - 1.0) < 1e-3, "ramp E corner")
	check(absf(iso.z_at(0.4999, 1.4999) - 1.0) < 1e-3, "ramp S corner")
	check(absf(iso.z_at(0.0, 1.4999) - 0.0) < 1e-3, "ramp W corner")
	# the two halves of the diamond meet along its W-E diagonal
	for t in [0.1, 0.5, 0.9]:
		var a: float = t * 0.5
		var b: float = (1.0 - t) * 0.5
		var lo := iso.z_at(a - 1e-5, 1.0 + b - 1e-5)
		var hi := iso.z_at(a + 1e-5, 1.0 + b + 1e-5)
		check(absf(lo - hi) < 1e-3, "ramp halves meet at t %.1f: %f vs %f" % [t, lo, hi])


func test_draw_level_clamped_to_tile_relief() -> void:
	var iso := small()
	check(iso.z_draw(1.5, 1.5) == 2.0, "on the raised tile")
	check(iso.z_draw(0.45, 1.05) == iso.z_at(0.45, 1.05), "the ramp within its tile's relief")
	iso.zu[1] = -3.0
	iso.zh[1] = -3.0
	check(iso.z_draw(1.5, 0.5) == -2.0, "kept a level above the tile's highest: %f" % iso.z_draw(1.5, 0.5))
	check(iso.feet(1.5, 0.5) == iso.world(1.5, 0.5, -2.0), "feet at the drawn level")


func test_pick() -> void:
	var iso := small()
	for p in [Vector2(1.7, 0.2), Vector2(0.2, 1.7), Vector2(1.5, 1.5)]:
		var w := iso.world(p.x, p.y, iso.z_at(p.x, p.y))
		var q := iso.pick(w.x, w.y)
		check(q.distance_to(p) < 0.05, "pick(world(%s)) = %s" % [p, q])
	# a point on the raised tile's front face picks the tile on top of it, and so does flat ground it covers
	var under := iso.world(0.25, 0.25, 0)
	check(Vector2i(iso.pick(under.x, under.y)) == Vector2i(1, 1), "covered ground picks the tile in front")
	var face := iso.world(2.0, 2.0, 1.0)
	var q := iso.pick(face.x, face.y)
	check(int(q.x) == 1 and int(q.y) == 1, "the face picks its top tile: %s" % q)
	# off the map: clamped onto it
	var off := iso.pick(OX, OY - 200)
	check(off.x >= 0 and off.y >= 0 and off.x < 2 and off.y < 2, "off the map clamped: %s" % off)


func test_hidden_behind_higher_ground() -> void:
	var iso := small()
	var back := iso.world(0.5, 0.5, 0)
	check(iso.hidden(back.x, back.y - 28, 1.0, 0.0), "a man behind the raised tile is hidden")
	var side := iso.world(1.5, 0.5, 0)
	check(not iso.hidden(side.x, side.y - 28, 2.0, 0.0), "a man beside it is not")
	var top := iso.world(1.5, 1.5, 2)
	check(not iso.hidden(top.x, top.y - 28, 3.0, 2.0), "a man on it is not")


func test_elaia_samples_match_ts() -> void:
	if not FileAccess.file_exists(ViewData.DIR.path_join("elaia/meta.json")):
		return # the view data is generated (npm run view:godot); CI has none
	var d := ViewData.load_id("elaia")
	var iso := Iso.of(d)
	var bad := 0
	for s in d.meta["samples"]:
		var x: float = s[0]
		var y: float = s[1]
		var why := ""
		if absf(iso.z_at(x, y) - s[2]) > 1e-4:
			why = "z_at %f vs %f" % [iso.z_at(x, y), s[2]]
		elif absf(iso.z_draw(x, y) - s[3]) > 1e-4:
			why = "z_draw %f vs %f" % [iso.z_draw(x, y), s[3]]
		elif iso.world(x, y, s[2]).distance_to(Vector2(s[4], s[5])) > 0.01:
			why = "world %s vs %f,%f" % [iso.world(x, y, s[2]), s[4], s[5]]
		elif iso.pick(s[4], s[5]).distance_to(Vector2(s[6], s[7])) > 0.01:
			why = "pick %s vs %f,%f" % [iso.pick(s[4], s[5]), s[6], s[7]]
		elif iso.hidden(s[4], s[5] - 28, x + y, s[2]) != (s[8] == 1):
			why = "hidden %s vs %d" % [iso.hidden(s[4], s[5] - 28, x + y, s[2]), s[8]]
		if why != "":
			bad += 1
			if bad <= 5:
				fail("sample %.3f,%.3f: %s" % [x, y, why])
	check(bad == 0, "%d of %d samples differ" % [bad, d.meta["samples"].size()])
