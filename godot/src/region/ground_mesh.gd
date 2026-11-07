## One chunk of a region's ground as a mesh, painted as src/war/view/art.ts ArtBaker.paint paints it: the visual cells
## back to front (x + y ascending), each with its frame (warped through its corner levels on a ramp, its side tiled down
## a step the ramps leave), cliff strips under drops of two levels or more, rock walls in their stone with their light,
## lips and cracks, then per row the baked light and tints, the water light, the surf and the tree shadows. Every piece
## is triangles in one material (ground.gdshader), in paint order, so a chunk is one draw call.
class_name GroundMesh
extends RefCounted

const FW := 16.0
const FH := 8.0
const LH := Iso.LH
const SIDE := Iso.SIDE
const ZBASE := Iso.ZBASE
## Wall front smoothing per cell (art.ts ArtBaker.cuts).
const CUT_TIP := 1
const CUT_NOTCH := 2
const CUT_L := 4
const CUT_R := 8
const CUT := FH / 2.0
const LIP := 5.0
const LIP_J := 2.0
const FOAM_PX := 1
const FOAM_NX := 2
const FOAM_PY := 4
const FOAM_NY := 8
const M32 := 0xFFFFFFFF

var d: ViewData
var iso: Iso
var page: float
var cols: int
var npages: int
var white: Vector2
var shadow_rect: Rect2
var foam_rect: Rect2
var wall_w: float
var wall_h: float
var relief: Array[Color] = []
var tints: Array[Color] = []
var shore_wet: int
var peat_shore: int
## Per tile set: [rock, earth, snow, ice] cliff names; per cliff name: [first slot, strips per shade, roles or null].
var set_cliffs: Array = []
var cliffs: Dictionary = {}
var k_rock: int
var k_snow: int
var k_drift: int
var k_shallow: int
var k_deep: int
## Tree shadows per chunk key: [v, x, y, w, h].
var shadows: Dictionary = {}

# the mesh in the making
var _v := PackedVector2Array()
var _uv := PackedVector2Array()
var _c := PackedColorArray()
var _i := PackedInt32Array()


func _init(data: ViewData, iso_: Iso, chunk: int) -> void:
	d = data
	iso = iso_
	var m := d.meta
	page = float(m["page"])
	cols = int(page) / int(m["slot"])
	npages = int(m["pages"])
	var wr: Array = m["specials"]["white"]
	white = Vector2((wr[0] + 16) / page, (wr[1] + 16) / page)
	var sr: Array = m["specials"]["shadow"]
	shadow_rect = Rect2(sr[0], sr[1], sr[2], sr[3])
	var fr: Array = m["specials"]["foam"]
	foam_rect = Rect2(fr[0], fr[1], fr[2], fr[3])
	wall_w = float(m["wall"][0])
	wall_h = float(m["wall"][1])
	for s in m["relief"]:
		relief.append(css(s))
	for s in m["tints"]:
		tints.append(css(s))
	shore_wet = int(m["shoreWet"])
	peat_shore = int(m["peatShore"])
	set_cliffs = m["setCliffs"]
	for id in m["cliffs"]:
		var c: Dictionary = m["cliffs"][id]
		cliffs[id] = [int(c["slot"]), int(c["n"]), c.get("roles")]
	var kinds: Array = m["kinds"]
	k_rock = kinds.find("rock")
	k_snow = kinds.find("snow")
	k_drift = kinds.find("drift")
	k_shallow = kinds.find("shallow")
	k_deep = kinds.find("deep")
	# each shadow to the chunk of the cell it is drawn after (its row v and its middle's column)
	for s in m["shadows"]:
		var v := int(s[0])
		var u := roundi((s[1] + s[3] / 2.0 - iso.ox) / FW)
		if (u + v) & 1:
			u += 1
		var key := chunk_key(((u + v) / 2) / chunk, ((v - u) / 2) / chunk)
		if not shadows.has(key):
			shadows[key] = []
		shadows[key].append(s)


static func chunk_key(cx: int, cy: int) -> int:
	return cx * 65536 + cy


## A CSS rgb()/rgba() colour.
static func css(s: String) -> Color:
	var a := s.find("(")
	var p := s.substr(a + 1, s.rfind(")") - a - 1).split(",")
	if p.size() < 3:
		return Color(0, 0, 0, 0)
	return Color(float(p[0]) / 255.0, float(p[1]) / 255.0, float(p[2]) / 255.0, float(p[3]) if p.size() > 3 else 1.0)


## autotile.ts hash: ((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0, in JS's 32-bit wrap.
static func hash3(x: int, y: int, k: int = 0) -> int:
	return ((x * 73856093) & M32) ^ ((y * 19349663) & M32) ^ ((k * 83492791) & M32)


## Atlas px of a slot's top-left corner, and its page.
func slot_px(s: int) -> Vector3:
	var per := cols * cols
	var q := s % per
	return Vector3((q % cols) * 32, (q / cols) * 32, s / per)


## Surface level of cell (x, y); ZBASE off the map.
func zt(x: int, y: int) -> float:
	return ZBASE if x < 0 or y < 0 or x >= d.fw or y >= d.fh else d.fz[y * d.fw + x]


## Corner q (N, E, S, W) of cell (x, y); ZBASE off the map.
func cn(x: int, y: int, q: int) -> float:
	return ZBASE if x < 0 or y < 0 or x >= d.fw or y >= d.fh else d.fc[4 * (y * d.fw + x) + q]


# ---- mesh primitives

## A triangle or convex polygon (fan), its points' UVs and one colour.
func _fan(p: PackedVector2Array, uv: PackedVector2Array, col: Color) -> void:
	var b := _v.size()
	_v.append_array(p)
	_uv.append_array(uv)
	for k in p.size():
		_c.append(col)
	for k in range(1, p.size() - 1):
		_i.append(b)
		_i.append(b + k)
		_i.append(b + k + 1)


## Any simple polygon filled in one colour (the white texel).
func _fill(p: PackedVector2Array, col: Color) -> void:
	if p.size() < 3 or col.a <= 0.0:
		return
	var tri := Geometry2D.triangulate_polygon(p)
	if tri.is_empty():
		return
	var b := _v.size()
	_v.append_array(p)
	for k in p.size():
		_uv.append(white)
		_c.append(col)
	for t in tri:
		_i.append(b + t)


## Per-vertex coloured polygon (fan) in the white texel.
func _fan_colours(p: PackedVector2Array, cs: PackedColorArray) -> void:
	var b := _v.size()
	_v.append_array(p)
	_c.append_array(cs)
	for k in p.size():
		_uv.append(white)
	for k in range(1, p.size() - 1):
		_i.append(b)
		_i.append(b + k)
		_i.append(b + k + 1)


## Atlas rect (src px, w x h) drawn through the affine map local (lx, ly) -> o + ex * lx + ey * ly.
func _img(src: Vector3, sx: float, sy: float, w: float, h: float, o: Vector2, ex: Vector2, ey: Vector2, col := Color.WHITE) -> void:
	var b := _v.size()
	var u0 := (src.x + sx) / page + 4.0 * src.z
	var v0 := (src.y + sy) / page
	var u1 := u0 + w / page
	var v1 := v0 + h / page
	_v.append(o)
	_v.append(o + ex * w)
	_v.append(o + ex * w + ey * h)
	_v.append(o + ey * h)
	_uv.append(Vector2(u0, v0))
	_uv.append(Vector2(u1, v0))
	_uv.append(Vector2(u1, v1))
	_uv.append(Vector2(u0, v1))
	for k in 4:
		_c.append(col)
	_i.append_array([b, b + 1, b + 2, b, b + 2, b + 3])


## _img clipped to polygon `clip` (screen px): each clipped point's UV by the inverse of the affine map.
func _img_clip(src: Vector3, sx: float, sy: float, w: float, h: float, o: Vector2, ex: Vector2, ey: Vector2, clip: PackedVector2Array) -> void:
	var quad := PackedVector2Array([o, o + ex * w, o + ex * w + ey * h, o + ey * h])
	var inv := Transform2D(ex, ey, o).affine_inverse()
	for q in Geometry2D.intersect_polygons(clip, quad):
		if q.size() < 3:
			continue
		var tri := Geometry2D.triangulate_polygon(q)
		if tri.is_empty():
			continue
		var b := _v.size()
		for pt in q:
			var l := inv * pt
			_v.append(pt)
			_uv.append(Vector2((src.x + sx + clampf(l.x, 0.0, w)) / page + 4.0 * src.z, (src.y + sy + clampf(l.y, 0.0, h)) / page))
			_c.append(Color.WHITE)
		for t in tri:
			_i.append(b + t)


## Slot s's 32 x 32 frame (or its rows sy0..sy0+h) at (x, y), unscaled.
func _frame(s: int, x: float, y: float, sy0 := 0.0, h := 32.0) -> void:
	_img(slot_px(s), 0.0, sy0, 32.0, h, Vector2(x, y + sy0), Vector2.RIGHT, Vector2.DOWN)


## A polygon textured by frame s drawn with its top-left at `at` (each point's UV is its place in the frame), clipped to
## the frame's 32 x 32 (no texel of a neighbouring slot shows).
func _frame_clip(s: int, at: Vector2, p: PackedVector2Array) -> void:
	var src := slot_px(s)
	var box := PackedVector2Array([at, at + Vector2(32, 0), at + Vector2(32, 32), at + Vector2(0, 32)])
	for q in Geometry2D.intersect_polygons(p, box):
		if q.size() < 3:
			continue
		var tri := Geometry2D.triangulate_polygon(q)
		if tri.is_empty():
			continue
		var b := _v.size()
		for pt in q:
			_v.append(pt)
			_uv.append(Vector2((src.x + pt.x - at.x) / page + 4.0 * src.z, (src.y + pt.y - at.y) / page))
			_c.append(Color.WHITE)
		for t in tri:
			_i.append(b + t)


## A polygon in stone st (meta.stones index), the pattern's px of a screen point by `inv` (screen -> pattern px).
func _stone(st: int, p: PackedVector2Array, inv: Transform2D) -> void:
	var tri := Geometry2D.triangulate_polygon(p)
	if tri.is_empty():
		return
	# pattern coords kept small and positive (the shader repeats them; UV.x / 4 picks the texture): shift by whole
	# textures to the polygon's least
	var lo := Vector2(INF, INF)
	for pt in p:
		var q := inv * pt
		lo = Vector2(minf(lo.x, q.x), minf(lo.y, q.y))
	var sh := Vector2(floorf(lo.x / wall_w) * wall_w, floorf(lo.y / wall_h) * wall_h)
	var b := _v.size()
	var m := 4.0 * (2 + st)
	for pt in p:
		var q := inv * pt - sh
		_v.append(pt)
		_uv.append(Vector2(q.x / wall_w + m, q.y / wall_h))
		_c.append(Color.WHITE)
	for t in tri:
		_i.append(b + t)


## A polyline stroked `w` px wide (a quad per segment).
func _stroke(pts: PackedVector2Array, w: float, col: Color) -> void:
	for k in pts.size() - 1:
		var a := pts[k]
		var b := pts[k + 1]
		var dv := b - a
		if dv.length_squared() < 1e-6:
			continue
		var n := Vector2(-dv.y, dv.x).normalized() * (w / 2.0)
		_fan(PackedVector2Array([a + n, b + n, b - n, a - n]), PackedVector2Array([white, white, white, white]), col)


# ---- the paint

## The chunk's mesh (cells x0..x0+n-1, y0..y0+n-1), or null when it draws nothing.
func build(x0: int, y0: int, n: int) -> ArrayMesh:
	_v = PackedVector2Array()
	_uv = PackedVector2Array()
	_c = PackedColorArray()
	_i = PackedInt32Array()
	var fw := d.fw
	var x1 := mini(d.fw, x0 + n) - 1
	var y1 := mini(d.fh, y0 + n) - 1
	var shad: Array = shadows.get(chunk_key(x0 / n, y0 / n), [])
	for v in range(x0 + y0, x1 + y1 + 1):
		var faces := Faces.new()
		var lips: Array = []
		for x in range(maxi(x0, v - y1), mini(x1, v - y0) + 1):
			var y := v - x
			var i := y * fw + x
			var s := d.slot[i]
			if s < 0:
				continue
			var u := x - y
			var z := d.fz[i]
			var ty := roundf(iso.oy + v * FH - z * LH)
			var tx := iso.ox + u * FW - FW
			var zmin := minf(zt(x + 1, y), zt(x, y + 1))
			var drop := z - zmin
			var kd := d.fk[i]
			var st := int(d.stone[i]) - 1 if drop > 1.0 else -1
			var ct := int(d.cut[i])
			var k4 := 4 * i
			var lift := Vector3.ZERO
			if d.ramp[i]:
				lift = Vector3((z - d.fc[k4 + 1]) * LH, (z - d.fc[k4 + 2]) * LH, (z - d.fc[k4 + 3]) * LH)
			if st >= 0:
				faces.walls.append([st, x, y, tx, ty, drop, ct, lift])
				lips.append([i, tx, ty, z, ct, lift])
			elif drop > 1.0:
				_cliff(x, y, i, tx, ty, drop, zmin, kd)
			var rise := 0.0
			if drop <= 1.0:
				rise = maxf(maxf(d.fc[k4 + 1] - cn(x + 1, y, 0), d.fc[k4 + 2] - cn(x + 1, y, 3)), maxf(d.fc[k4 + 3] - cn(x, y + 1, 0), d.fc[k4 + 2] - cn(x, y + 1, 1)))
			var nr := ceili(rise * LH / SIDE) - 1 if rise > 0.01 else 0
			if d.ramp[i]:
				_warp(s, tx, ty, z, k4, nr)
			else:
				for k in range(nr, 0, -1):
					_frame(s, tx, ty + SIDE * k)
				_frame(s, tx, ty)
			var dE := z - zt(x + 1, y)
			var dS := z - zt(x, y + 1)
			if dE >= 2.0 or dS >= 2.0:
				faces.add(x, y, tx, ty, dE, dS, z, st >= 0, ct, lift)
			if ct & CUT_L and x > 0 and int(d.cut[i - 1]) & CUT_NOTCH and d.slot[i - 1] >= 0:
				faces.notches.append([d.slot[i - 1], tx - FW, ty + FH + (z - d.fc[k4 + 3]) * LH])
		_faces(faces)
		if not lips.is_empty():
			_lips(lips)
		_shade_row(v, x0, x1, y0, y1)
		for t in shad:
			if int(t[0]) == v:
				_img(Vector3(0, 0, 0), shadow_rect.position.x, shadow_rect.position.y, shadow_rect.size.x, shadow_rect.size.y, Vector2(t[1], t[2]), Vector2(t[3] / shadow_rect.size.x, 0), Vector2(0, t[4] / shadow_rect.size.y))
	if _i.is_empty():
		return null
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = _v
	arr[Mesh.ARRAY_TEX_UV] = _uv
	arr[Mesh.ARRAY_COLOR] = _c
	arr[Mesh.ARRAY_INDEX] = _i
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return mesh


## Cliff strips under a drop of two levels or more (no rock wall): the cell's own side covers SIDE px, strips tile the
## rest, darker toward the foot; W-51 multi-frame cliffs pick lip, face and low frames.
func _cliff(x: int, y: int, i: int, tx: float, ty: float, drop: float, zmin: float, kd: int) -> void:
	var fw := d.fw
	var m: Array = set_cliffs[d.set_of[(y >> 1) * iso.w + (x >> 1)]]
	var n := ceili(drop * LH / SIDE) - 1
	var last := d.fw * d.fh - 1
	var foot: int = d.fk[mini(last, i + 1)] if zmin == zt(x + 1, y) else d.fk[mini(last, i + fw)]
	var snowy := kd == k_snow or kd == k_drift
	var rocky := snowy or kd == k_rock
	var id: String = m[2] if snowy else (m[0] if rocky else m[1])
	var low: String = m[3] if snowy and (foot == k_shallow or foot == k_deep or foot == k_snow or foot == k_drift) else id
	var r0 = cliffs[id][2]
	for k in range(n, 0, -1):
		var h := hash3(x, y, k)
		var b := 0.0
		if r0 != null:
			b = sin((x - y) * 0.9 + k * 0.35 + (hash3(x - y, 0, 7) % 7)) * 0.22
		var t := maxf(0.0, float(k) / n * (0.6 if r0 != null else 1.0) + float((h >> 8) % 100) / 400.0 + b)
		var bottom := n >= 3 and k >= n - (1 if n >= 8 else 0)
		var c: Array = cliffs[low if bottom else id]
		var roles = c[2]
		var f := (0 if t < 0.4 else (1 if t < 0.75 else 2)) * int(c[1])
		if roles != null:
			var fr: Array = roles["lip"] if k == 1 else (roles["low"] if bottom else roles["face"])
			f += int(fr[(h >> 3) % fr.size()])
		else:
			f += h % int(c[1])
		_img(slot_px(int(c[0]) + f), 0, 0, 32, 24, Vector2(tx, ty + FH + SIDE * k), Vector2.RIGHT, Vector2.DOWN)


## A ramp cell's frame warped through its corner levels: the half above the W-E diagonal by the affine map through N, W
## and E, the half below (and `nr` copies of it SIDE px apart under it) by the one through W, E and S (art.ts warp).
func _warp(s: int, tx: float, ty: float, z: float, k: int, nr: int, clip := PackedVector2Array()) -> void:
	var c := d.fc
	var dN := (z - c[k]) * LH
	var dE := (z - c[k + 1]) * LH
	var dS := (z - c[k + 2]) * LH
	var dW := (z - c[k + 3]) * LH
	var B := (dE - dW) / (2.0 * FW)
	var A1 := dN - FW * B
	var C1 := (dW - A1) / FH
	var C2 := (dS - dW - FW * B) / FH
	var A2 := dW - FH * C2
	var src := slot_px(s)
	var ex := Vector2(1, B)
	if not clip.is_empty():
		if C1 > -1.0:
			_img_clip(src, 0, 0, 32, FH + 1, Vector2(tx, ty + A1), ex, Vector2(0, 1 + C1), clip)
		if C2 > -1.0:
			_img_clip(src, 0, FH, 32, 32 - FH, Vector2(tx, ty + A2) + Vector2(0, (1 + C2) * FH), ex, Vector2(0, 1 + C2), clip)
		return
	if C2 > -1.0:
		for r in range(nr, 0, -1):
			_img(src, 0, FH, 32, 32 - FH, Vector2(tx, ty + A2 + SIDE * r) + Vector2(0, (1 + C2) * FH), ex, Vector2(0, 1 + C2))
	if C1 > -1.0:
		_img(src, 0, 0, 32, FH + 1, Vector2(tx, ty + A1), ex, Vector2(0, 1 + C1))
	if C2 > -1.0:
		_img(src, 0, FH, 32, 32 - FH, Vector2(tx, ty + A2) + Vector2(0, (1 + C2) * FH), ex, Vector2(0, 1 + C2))


# ---- rock walls and cliffs' light (art.ts Faces)

class Faces:
	var walls: Array = []
	var notches: Array = []
	var se: Array = []
	var sw: Array = []
	var mid: Array = []
	var low: Array = []
	var foot: Array = []
	var lip: Array = []
	var upper: Array = []
	var streak_lit: Array = []
	var streak_dark: Array = []
	var rim: Array = []
	var dark: Array = []
	var lit: Array = []

	## The top edge of a front face a -> b (SE: R -> B, SW: B -> L) with the cell's cuts, as points.
	static func top(side: int, ax: float, ay: float, bx: float, by: float, ct: int) -> PackedVector2Array:
		var mx := (ax + bx) / 2.0
		var my := (ay + by) / 2.0
		var cut_a := (ct & CUT_TIP) if side else (ct & CUT_R)
		var cut_b := (ct & CUT_L) if side else (ct & CUT_TIP)
		var p := PackedVector2Array([Vector2(ax, ay + ((-CUT if side else CUT) if cut_a else 0.0))])
		if cut_a or cut_b:
			p.append(Vector2(mx, my))
		p.append(Vector2(bx, by + ((CUT if side else -CUT) if cut_b else 0.0)))
		return p

	## The height of top edge t at share q of its run.
	static func edge_at(t: PackedVector2Array, q: float) -> float:
		var n := t.size() - 1
		var X := t[0].x + (t[n].x - t[0].x) * q
		for k in n:
			var x0 := t[k].x
			var x1 := t[k + 1].x
			if (X - x0) * (X - x1) <= 0.0 and x0 != x1:
				return t[k].y + (X - x0) / (x1 - x0) * (t[k + 1].y - t[k].y)
		return t[n].y

	## A ragged band LIP px (+- LIP_J by hash h) under top edge t (the ground's lip).
	static func band(t: PackedVector2Array, h: int) -> PackedVector2Array:
		var n := t.size() - 1
		var dx := (t[n].x - t[0].x) / 4.0
		var p := PackedVector2Array()
		for k in t.size():
			p.append(t[k] - Vector2(0, 1))
		for q in range(4, -1, -1):
			p.append(Vector2(t[0].x + dx * q, edge_at(t, q / 4.0) + LIP + ((float((h >> (4 * q)) & 15) / 15.0) * 2.0 - 1.0) * LIP_J))
		return p

	## The face under top edge t down to edge a -> b's line d px lower.
	static func face(t: PackedVector2Array, a: Vector2, b: Vector2, dd: float) -> PackedVector2Array:
		var p := t.duplicate()
		p.append(b + Vector2(0, dd))
		p.append(a + Vector2(0, dd))
		return p

	static func quad(a: Vector2, b: Vector2, d0: float, d1: float) -> PackedVector2Array:
		return PackedVector2Array([a + Vector2(0, d0), b + Vector2(0, d0), b + Vector2(0, d1), a + Vector2(0, d1)])

	func add(x: int, y: int, tx: float, ty: float, dE: float, dS: float, z: float, stone: bool, ct: int, o: Vector3) -> void:
		var R := Vector2(tx + 2 * FW, ty + FH)
		var B := Vector2(tx + FW, ty + 2 * FH)
		var L := Vector2(tx, ty + FH)
		var zig := stone and (ct & CUT_TIP) != 0
		if dE >= 2.0:
			var dd := dE * LH
			var t := top(0, R.x, R.y + o.x, B.x, B.y + o.y, ct)
			(mid if zig else se).append(face(t, R, B, dd))
			_rim(x, y, t, stone, 0)
			low.append(quad(R, B, dd * 0.35, dd))
			foot.append(quad(R, B, dd * 0.65, dd))
			upper.append(face(t, R, B, dd * 0.22))
			if dE >= 3.0:
				_detail(x, y, R, B, dE, z, 0, stone)
		if dS >= 2.0:
			var dd := dS * LH
			var t := top(1, B.x, B.y + o.y, L.x, L.y + o.z, ct)
			(mid if zig else sw).append(face(t, B, L, dd))
			_rim(x, y, t, stone, 1)
			low.append(quad(B, L, dd * 0.35, dd))
			foot.append(quad(B, L, dd * 0.65, dd))
			upper.append(face(t, B, L, dd * 0.22))
			if dS >= 3.0:
				_detail(x, y, B, L, dS, z, 1, stone)

	func _rim(x: int, y: int, t: PackedVector2Array, stone: bool, side: int) -> void:
		var n := t.size() - 1
		if not stone:
			var p := PackedVector2Array()
			for q in t:
				p.append(q + Vector2(0, 0.5))
			rim.append(p)
			return
		var h := GroundMesh.hash3(x * 3 + side, y * 5 - side, 57)
		var ax := t[0].x
		var dx := (t[n].x - ax) / 4.0
		var p := PackedVector2Array([t[0]])
		for q in 5:
			p.append(Vector2(roundf(ax + dx * q), roundf(edge_at(t, q / 4.0) + LIP) + 2.0 + ((h >> (12 + 3 * q)) & 7) * (0.9 if (h >> 28) & 1 else 0.6)))
		for k in range(n, -1, -1):
			p.append(t[k])
		lip.append(p)

	func _detail(x: int, y: int, a: Vector2, b: Vector2, dl: float, z: float, side: int, stone: bool) -> void:
		var h := GroundMesh.hash3(x, y, 11 + side)
		for q in 2:
			var hq := GroundMesh.hash3(x, y, 31 + side * 2 + q)
			var t := (float(hq & 255) / 255.0) * 0.85 + 0.05
			var s := a + (b - a) * t
			var sw_ := 2.0 + (hq >> 8) % 4
			var ln := dl * LH * (0.3 + float((hq >> 12) % 70) / 100.0)
			var r := Rect2(roundf(s.x), s.y + 2.0 + CUT, sw_, ln)
			(streak_lit if (hq >> 20) & 1 else streak_dark).append(PackedVector2Array([r.position, r.position + Vector2(r.size.x, 0), r.end, r.position + Vector2(0, r.size.y)]))
		if h % 2 == 0:
			var t := 0.2 + float((h >> 4) % 60) / 100.0
			var c := a + (b - a) * t + Vector2(0, CUT)
			var ln := dl * LH * (0.45 + float((h >> 10) % 40) / 100.0)
			var px := c.x
			var dk := PackedVector2Array([Vector2(px, c.y + 3)])
			var lt := PackedVector2Array([Vector2(px - 1, c.y + 3)])
			var s := 6
			while s < ln:
				px += (((h >> (s % 24)) & 3) - 1.5) * 0.9
				dk.append(Vector2(px, c.y + s))
				lt.append(Vector2(px - 1, c.y + s))
				s += 6
			dark.append(dk)
			lit.append(lt)
		if stone:
			return
		var ph := GroundMesh.hash3(x >> 3, y >> 3, 13) % 5
		var lv := floori(z) - 2
		while lv > z - dl + 1.0:
			if (lv + ph) % 5 == 0 and GroundMesh.hash3(x, y, lv) % 10 >= 3:
				var o := (z - lv) * LH
				lit.append(PackedVector2Array([a + Vector2(0, o), b + Vector2(0, o)]))
				dark.append(PackedVector2Array([a + Vector2(0, o + 1.5), b + Vector2(0, o + 1.5)]))
			lv -= 1


const C_SE := Color(14 / 255.0, 16 / 255.0, 30 / 255.0, 0.3)
const C_SW := Color(1.0, 238 / 255.0, 200 / 255.0, 0.1)
const C_MID := Color(14 / 255.0, 16 / 255.0, 30 / 255.0, 0.1)
const C_LOW := Color(10 / 255.0, 10 / 255.0, 20 / 255.0, 0.1)
const C_FOOT := Color(10 / 255.0, 10 / 255.0, 20 / 255.0, 0.14)
const C_LIP := Color(16 / 255.0, 8 / 255.0, 6 / 255.0, 0.42)
const C_RIM := Color(1.0, 242 / 255.0, 214 / 255.0, 0.3)
const C_UPPER := Color(1.0, 238 / 255.0, 200 / 255.0, 0.09)
const C_STREAK_LIT := Color(1.0, 240 / 255.0, 214 / 255.0, 0.09)
const C_STREAK_DARK := Color(10 / 255.0, 10 / 255.0, 18 / 255.0, 0.14)
const C_DARK := Color(12 / 255.0, 10 / 255.0, 8 / 255.0, 0.55)
const C_LIT := Color(1.0, 240 / 255.0, 210 / 255.0, 0.22)


## A row's rock walls (their stone mapped from the world so strata stay level), notches, then the walls' light.
func _faces(f: Faces) -> void:
	for w in f.walls:
		var st: int = w[0]
		var x: int = w[1]
		var y: int = w[2]
		var tx: float = w[3]
		var ty: float = w[4]
		var dd: float = w[5] * LH
		var ct: int = w[6]
		var o: Vector3 = w[7]
		var R := Vector2(tx + 2 * FW, ty + FH)
		var B := Vector2(tx + FW, ty + 2 * FH)
		var L := Vector2(tx, ty + FH)
		var zig := (ct & CUT_TIP) != 0
		# the pattern's matrix (pattern px -> screen) and its inverse
		var m_se := Transform2D(Vector2(1, 0), Vector2(0, 1), Vector2(iso.ox, iso.oy - 7 * LH)) if zig else Transform2D(Vector2(-1, 0.5), Vector2(0, 1), Vector2(iso.ox + (x + 1) * FW, iso.oy + (x + 1) * FH))
		var m_sw := m_se if zig else Transform2D(Vector2(1, 0.5), Vector2(0, 1), Vector2(iso.ox - (y + 1) * FW, iso.oy + (y + 1) * FH))
		_stone(st, Faces.face(Faces.top(0, R.x, R.y + o.x, B.x, B.y + o.y, ct), R, B, dd), m_se.affine_inverse())
		_stone(st, Faces.face(Faces.top(1, B.x, B.y + o.y, L.x, L.y + o.z, ct), B, L, dd), m_sw.affine_inverse())
	for nt in f.notches:
		var p: Vector2 = Vector2(nt[1], nt[2])
		_frame_clip(nt[0], p, PackedVector2Array([p + Vector2(FW, -0.5), p + Vector2(FW + FW / 2.0 + 1.0, CUT + 0.5), p + Vector2(FW / 2.0 - 1.0, CUT + 0.5)]))
	for q in f.se:
		_fill(q, C_SE)
	for q in f.sw:
		_fill(q, C_SW)
	for q in f.mid:
		_fill(q, C_MID)
	for q in f.low:
		_fill(q, C_LOW)
	for q in f.foot:
		_fill(q, C_FOOT)
	for q in f.lip:
		_fill(q, C_LIP)
	for q in f.rim:
		_stroke(q, 1.5, C_RIM)
	for q in f.upper:
		_fill(q, C_UPPER)
	for q in f.streak_lit:
		_fill(q, C_STREAK_LIT)
	for q in f.streak_dark:
		_fill(q, C_STREAK_DARK)
	for q in f.dark:
		_stroke(q, 1.0, C_DARK)
	for q in f.lit:
		_stroke(q, 1.0, C_LIT)


## The ground's lip over a row's rock walls: each wall cell's frame redrawn LIP - 1 px lower, in a ragged band under its
## top edges, so its grass or scrub hangs over the stone (art.ts lips; a ramping rim's frame warped through its corners).
func _lips(lips: Array) -> void:
	for l in lips:
		var i: int = l[0]
		var x := i % d.fw
		var y := i / d.fw
		var tx: float = l[1]
		var ty: float = l[2]
		var ct: int = l[4]
		var o: Vector3 = l[5]
		var R := Vector2(tx + 2 * FW, ty + FH)
		var B := Vector2(tx + FW, ty + 2 * FH)
		var L := Vector2(tx, ty + FH)
		var at := Vector2(tx, ty + LIP - 1.0)
		var bands := [Faces.band(Faces.top(0, R.x, R.y + o.x, B.x, B.y + o.y, ct), hash3(x, y, 61)), Faces.band(Faces.top(1, B.x, B.y + o.y, L.x, L.y + o.z, ct), hash3(x, y, 62))]
		for band in bands:
			if d.ramp[i]:
				_warp(d.slot[i], at.x, at.y, l[3], 4 * i, 0, band)
			else:
				_frame_clip(d.slot[i], at, band)


# ---- a row's light, tints, water light and surf (art.ts shadeRow)

func _wet(j: int) -> bool:
	var k := d.fk[j]
	return k == k_shallow or k == k_deep


## The water light at pattern point (px, py) (cell units, a cell's middle at +0.5), bilinear, transparent off the map.
func _light(px: float, py: float) -> Color:
	var u := px - 0.5
	var v := py - 0.5
	var x0 := floori(u)
	var y0 := floori(v)
	var a := u - x0
	var b := v - y0
	return _lt(x0, y0).lerp(_lt(x0 + 1, y0), a).lerp(_lt(x0, y0 + 1).lerp(_lt(x0 + 1, y0 + 1), a), b)


func _lt(x: int, y: int) -> Color:
	if x < 0 or y < 0 or x >= d.fw or y >= d.fh:
		return Color(0, 0, 0, 0)
	var o := 4 * (y * d.fw + x)
	return Color8(d.light[o], d.light[o + 1], d.light[o + 2], d.light[o + 3])


## A water polygon at level z lit by the light field (each point's colour sampled where the pattern maps it).
func _water(p: PackedVector2Array, z: float) -> void:
	var cs := PackedColorArray()
	for q in p:
		var a := (q.x - iso.ox) / FW
		var b := (q.y - iso.oy + z * LH) / FH
		cs.append(_light((a + b) / 2.0, (b - a) / 2.0))
	_fan_colours(p, cs)


## A flat shore cell's water and land halves (its diamond cut along the 0.5 contour of its corner shares), or [] when it
## is not a smoothed cell of a land-water sheet.
func _shore_halves(i: int, tx: float, ty: float) -> Array:
	var fl := int(d.flags[i])
	if fl & 12 == 0:
		return []
	var g := d.corners_at(i)
	if g == 0xffff:
		return []
	var P := [Vector2(tx + FW, ty), Vector2(tx + 2 * FW, ty + FH), Vector2(tx + FW, ty + 2 * FH), Vector2(tx, ty + FH)]
	var vs := [float(g & 15) / 8.0, float((g >> 4) & 15) / 8.0, float(g >> 12) / 8.0, float((g >> 8) & 15) / 8.0]
	var first_wet := fl & 4 != 0
	var out := []
	for first in [first_wet, not first_wet]:
		var pts := PackedVector2Array()
		for k in 4:
			var a: float = vs[k]
			var b: float = vs[(k + 1) & 3]
			var A: Vector2 = P[k]
			var Bp: Vector2 = P[(k + 1) & 3]
			if (a >= 0.5) == first:
				pts.append(A)
			if (a >= 0.5) != (b >= 0.5):
				pts.append(A + (Bp - A) * ((0.5 - a) / (b - a)))
		out.append(pts if pts.size() >= 3 else PackedVector2Array())
	return out


func _diamond(tx: float, ty: float) -> PackedVector2Array:
	return PackedVector2Array([Vector2(tx + FW, ty), Vector2(tx + 2 * FW, ty + FH), Vector2(tx + FW, ty + 2 * FH), Vector2(tx, ty + FH)])


func _shade_row(v: int, x0: int, x1: int, y0: int, y1: int) -> void:
	var fw := d.fw
	var paths := {}
	var water: Array = []
	var foam_lines: Array = []
	var waves: Array = []
	var blobs := PackedVector2Array()
	var add := func(key: int, q: PackedVector2Array) -> void:
		if key == 0 or q.size() < 3:
			return
		if not paths.has(key):
			paths[key] = []
		paths[key].append(q)
	for x in range(maxi(x0, v - y1), mini(x1, v - y0) + 1):
		var y := v - x
		var i := y * fw + x
		var s := int(d.shade[i])
		var t := int(d.tint[i])
		var fl := int(d.flags[i])
		var lit := fl & 1 != 0
		var fb := int(d.foam[i])
		if (s == 0 and t == 0 and fb == 0 and not lit) or d.slot[i] < 0:
			continue
		var z := d.fz[i]
		var ty := roundf(iso.oy + v * FH - z * LH)
		var tx := iso.ox + (x - y) * FW - FW
		if fb:
			_foam(x, y, tx, ty, foam_lines, waves, blobs)
		if s == 0 and t == 0 and not lit:
			continue
		var p: PackedVector2Array
		if d.ramp[i]:
			var k := 4 * i
			p = PackedVector2Array([Vector2(tx + FW, ty + (z - d.fc[k]) * LH), Vector2(tx + 2 * FW, ty + FH + (z - d.fc[k + 1]) * LH), Vector2(tx + FW, ty + 2 * FH + (z - d.fc[k + 2]) * LH), Vector2(tx, ty + FH + (z - d.fc[k + 3]) * LH)])
		elif int(d.cut[i]) & CUT_TIP:
			p = PackedVector2Array([Vector2(tx + FW, ty), Vector2(tx + 2 * FW, ty + FH), Vector2(tx + FW + FW / 2.0, ty + 2 * FH - CUT), Vector2(tx + FW / 2.0, ty + 2 * FH - CUT), Vector2(tx, ty + FH)])
		else:
			var halves := _shore_halves(i, tx, ty)
			if not halves.is_empty():
				var wet: PackedVector2Array = halves[0]
				var dry: PackedVector2Array = halves[1]
				var own := _wet(i)
				# the dry half in the light of the cell or a land neighbour
				var side := shore_wet
				if not own:
					side = s
				else:
					for j in [i - 1, i + 1, i - fw, i + fw]:
						if j >= 0 and j < d.shade.size() and not _wet(j) and d.shade[j]:
							side = d.shade[j]
							break
				if fl & 2:
					add.call(256 + peat_shore, wet)
					add.call(side, dry)
					if t and not own:
						add.call(256 + t, dry)
					continue
				if wet.size() >= 3:
					water.append([wet, z])
				add.call(side, dry)
				if t:
					add.call(256 + t, dry)
				continue
			p = _diamond(tx, ty)
			if lit:
				water.append([p, z])
		if t:
			add.call(256 + t, p)
		add.call(s, p)
	for w in water:
		_water(w[0], w[1])
	for pass_ in [1, 0]:
		for key in paths:
			if (1 if key >= 256 else 0) != pass_:
				continue
			var col: Color = tints[key - 256] if key >= 256 else relief[key]
			for q in paths[key]:
				_fill(q, col)
	if foam_lines.is_empty():
		return
	for b in blobs:
		_img(Vector3(0, 0, 0), foam_rect.position.x, foam_rect.position.y, foam_rect.size.x, foam_rect.size.y, b - foam_rect.size / 2.0, Vector2.RIGHT, Vector2.DOWN, Color(1, 1, 1, 0.55))
	for spec in [[8.0, Color(190 / 255.0, 220 / 255.0, 216 / 255.0, 0.14)], [3.5, Color(214 / 255.0, 234 / 255.0, 230 / 255.0, 0.18)], [1.5, Color(230 / 255.0, 242 / 255.0, 236 / 255.0, 0.3)]]:
		_stroke_soft(foam_lines, spec[0], spec[1])
	_stroke_soft(waves, 1.5, Color(220 / 255.0, 236 / 255.0, 236 / 255.0, 0.2))


## The row's lines stroked once `w` px wide with round caps, as a canvas strokes one path (overlaps do not add up), and
## antialiased: the union of the strokes half a px wider in half the alpha, the union half a px narrower over it in the
## alpha that makes the two together `col` (the edge px at about half cover).
func _stroke_soft(lines: Array, w: float, col: Color) -> void:
	if lines.is_empty():
		return
	var a := col.a / 2.0
	_fill_all(stroke_union(lines, w / 2.0 + 0.5), Color(col, a))
	if w > 1.0:
		_fill_all(stroke_union(lines, w / 2.0 - 0.5), Color(col, a / (1.0 - a)))


func _fill_all(polys: Array, col: Color) -> void:
	for q in polys:
		_fill(q, col)


## The outlines of the union of the lines (2-point polylines) stroked `r` px either side with round caps; holes dropped.
static func stroke_union(lines: Array, r: float) -> Array:
	var out: Array = []
	var boxes: Array = []
	for l in lines:
		for p in Geometry2D.offset_polyline(l, r, Geometry2D.JOIN_ROUND, Geometry2D.END_ROUND):
			if Geometry2D.is_polygon_clockwise(p):
				continue
			var acc: PackedVector2Array = p
			var box := _bounds(acc)
			var keep: Array = []
			var kept_boxes: Array = []
			for k in out.size():
				if not box.intersects(boxes[k], true):
					keep.append(out[k])
					kept_boxes.append(boxes[k])
					continue
				var outer: Array = []
				for m in Geometry2D.merge_polygons(acc, out[k]):
					if not Geometry2D.is_polygon_clockwise(m):
						outer.append(m)
				if outer.size() == 1:
					acc = outer[0]
					box = _bounds(acc)
				else:
					keep.append(out[k])
					kept_boxes.append(boxes[k])
			keep.append(acc)
			kept_boxes.append(box)
			out = keep
			boxes = kept_boxes
	return out


static func _bounds(p: PackedVector2Array) -> Rect2:
	var r := Rect2(p[0], Vector2.ZERO)
	for q in p:
		r = r.expand(q)
	return r


## Cell (cx, cy)'s shore edges (grid corners and side 1..4), [] off the map.
func _edges(cx: int, cy: int) -> Array:
	if cx < 0 or cy < 0 or cx >= d.fw or cy >= d.fh:
		return []
	var f := int(d.foam[cy * d.fw + cx])
	var out := []
	if f & FOAM_PX:
		out.append([cx + 1, cy, cx + 1, cy + 1, 1])
	if f & FOAM_NX:
		out.append([cx, cy, cx, cy + 1, 2])
	if f & FOAM_PY:
		out.append([cx + 1, cy + 1, cx, cy + 1, 3])
	if f & FOAM_NY:
		out.append([cx, cy, cx + 1, cy, 4])
	return out


## The surf of a shore water cell: a line through its shore edges' midpoints half way to each shore edge meeting them, a
## broken wave line a third of the way out, and spray blobs over the midpoints.
func _foam(x: int, y: int, tx: float, ty: float, lines: Array, waves: Array, blobs: PackedVector2Array) -> void:
	var C := Vector2(tx + FW, ty + FH)
	var S := func(gx: float, gy: float) -> Vector2:
		return Vector2(tx + FW + (gx - x - (gy - y)) * FW, ty + (gx - x + gy - y) * FH)
	var near := []
	for dy in range(-1, 2):
		for dx in range(-1, 2):
			if dx or dy:
				near.append_array(_edges(x + dx, y + dy))
	var mine := _edges(x, y)
	for ei in mine.size():
		var e: Array = mine[ei]
		var k: int = e[4]
		var mx: float = (e[0] + e[2]) / 2.0
		var my: float = (e[1] + e[3]) / 2.0
		var M: Vector2 = S.call(mx, my)
		for vv in [[e[0], e[1]], [e[2], e[3]]]:
			var ends := []
			for oi in mine.size() + near.size():
				if oi == ei:
					continue
				var nn: Array = mine[oi] if oi < mine.size() else near[oi - mine.size()]
				if (nn[0] == vv[0] and nn[1] == vv[1]) or (nn[2] == vv[0] and nn[3] == vv[1]):
					ends.append(S.call((mx + (nn[0] + nn[2]) / 2.0) / 2.0, (my + (nn[1] + nn[3]) / 2.0) / 2.0))
			if ends.is_empty():
				ends.append(S.call(vv[0], vv[1]))
			for P in ends:
				lines.append(PackedVector2Array([M, P]))
				if hash3(x, y, k + 4) % 3:
					waves.append(PackedVector2Array([M + (C - M) * 0.38, P + (C - P) * 0.38]))
		var j := (float(hash3(x, y, k) & 7) - 3.5) * 0.3
		blobs.append(Vector2(M.x + j * 3.0, M.y))
