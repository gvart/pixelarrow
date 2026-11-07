## The world map (src/war/world-view/map.ts): the painted continent (view/world: base.jpg, borders.png, region-ids.png,
## regions.json, copied from public/war/world by npm run view:godot), region washes in the owner's colour with an edge
## band, fights hatched in the contender's, world events glowing, the selected squad's neighbours lit; then the trade
## roads, the names (laid out so none meets another or a marker), and the markers: landmarks, warlord pennants, battles
## and sieges, raids, world events with their time left, his men on the road and his banner. Under a pan / zoom camera
## (screen px per map px `k`). Map px are base.jpg's (2048 x 1536); the region under a point comes from region-ids.png.
##
## Left out of the TS map for now: the Abyss mist, settlements and fealty lines, crowns and pacts, mastery stars,
## title emblems, convoys and the haul planner's road, "+N" clusters (a marker with no room takes the least crowded spot).
class_name WorldMap
extends Control

const ART := "res://view/world"
const NEAR_K := 0.7
const SIZE := {"event": 17.0, "battle": 42.0, "landmark": 13.0}
const BADGE_FONT := 15.0
const LAND_F := 0.7
const POLE := 1.9
const NAME_COST := 20.0
const SEA := Color("#17151d")
const INK := Color(16 / 255.0, 10 / 255.0, 8 / 255.0, 0.88)
const PARCH := Color("#efe0c2")

var feed: WorldFeed
var art := {}
var map_size := [2048.0, 1536.0]
## The camera: map px at the view's top left, screen px per map px; the zoom it eases toward.
var x := 0.0
var y := 0.0
var k := 0.5
var goal := 0.5
var fit_k := 0.2
var _anchor := Vector2.INF
## What the map marks: the hovered and selected region, the squad's region and the neighbours it can march to.
var hover := ""
var selected := ""
var squad_at := ""
var targets := {}
var routes := true

var _ids: Image
var _ids_tex: Texture2D
var _order := []
var _index := {}
var _pics := {}
var _base: Sprite2D
var _borders: Sprite2D
var _cam: Node2D
var _ink: Ink
var _mat: ShaderMaterial
var _hi := false
var _labels := []
var _label_key := ""
var _obstacles := []
var _decor := {}
var _decor_key := ""


func _init() -> void:
	clip_contents = true
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	art = JSON.parse_string(FileAccess.get_file_as_string(_path("regions.json")))
	map_size = [float(art["size"][0]), float(art["size"][1])]
	_order = art["order"]
	for i in _order.size():
		_index[_order[i]] = i
	_ids = Image.load_from_file(_path("region-ids.png"))
	_ids_tex = ImageTexture.create_from_image(_ids)
	_cam = Node2D.new()
	add_child(_cam)
	_base = Sprite2D.new()
	_base.centered = false
	_base.texture = _texture("base.jpg")
	_base.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	_mat = ShaderMaterial.new()
	_mat.shader = preload("res://src/world_view/world_map.gdshader")
	_mat.set_shader_parameter("ids", _ids_tex)
	_mat.set_shader_parameter("map_size", Vector2(map_size[0], map_size[1]))
	_base.material = _mat
	_cam.add_child(_base)
	_borders = Sprite2D.new()
	_borders.centered = false
	_borders.texture = _texture("borders.png")
	_borders.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	_cam.add_child(_borders)
	_ink = Ink.new()
	_ink.map = self
	_cam.add_child(_ink)
	for n in ["markers/battle", "markers/fort", "markers/transit", "banners/dodona", "banners/skythia", "banners/kyrene", "banners/elaia"]:
		_pics[n] = _texture(n + "@2x.png", false)


static func _path(rel: String) -> String:
	return ProjectSettings.globalize_path(ART.path_join(rel))


func _texture(rel: String, mips := true) -> Texture2D:
	var img := Image.load_from_file(_path(rel))
	if img == null:
		return null
	if mips:
		img.generate_mipmaps()
	return ImageTexture.create_from_image(img)


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), SEA)


# ---------- the camera ----------

## Map px under screen point p.
func to_map(p: Vector2) -> Vector2:
	return Vector2(x + p.x / k, y + p.y / k)


func to_screen(m: Vector2) -> Vector2:
	return Vector2((m.x - x) * k, (m.y - y) * k)


## Fit the whole map into the view less the screen px kept free for panels on each side (top, left, right, bottom).
func fit(free: Dictionary) -> void:
	var f := WorldGeo.fit(map_size, size.x, size.y, free)
	if f[0] <= 0:
		# a window too small for the panels' margins: the whole view
		f = WorldGeo.fit(map_size, maxf(size.x, 1.0), maxf(size.y, 1.0), {"top": 0.0, "left": 0.0, "right": 0.0, "bottom": 0.0})
	k = f[0]
	fit_k = f[0]
	x = f[1]
	y = f[2]
	settle()


func settle() -> void:
	goal = k
	_anchor = Vector2.INF
	_place()


func _clamp_k(v: float) -> float:
	return maxf(fit_k * 0.85, minf(3.0, v))


## Zoom by f about screen point c at once.
func zoom(f: float, c: Vector2) -> void:
	var m := to_map(c)
	k = _clamp_k(k * f)
	x = m.x - c.x / k
	y = m.y - c.y / k
	settle()


## Ease toward zoom v about screen point c (that map point stays under it).
func zoom_to(v: float, c: Vector2) -> void:
	goal = _clamp_k(v)
	_anchor = c


## Pan by a screen px drag.
func pan(d: Vector2) -> void:
	x -= d.x / k
	y -= d.y / k
	_keep_on_map()
	_place()


func centre_on(id: String) -> void:
	var r: Dictionary = art["regions"].get(id, {})
	if r.is_empty():
		return
	x = r["centroid"][0] - size.x / 2.0 / k
	y = r["centroid"][1] - size.y / 2.0 / k
	_keep_on_map()
	_place()


## Keep at least a third of the view over the painting.
func _keep_on_map() -> void:
	var vw := size.x / k
	var vh := size.y / k
	x = maxf(-vw * 0.67, minf(map_size[0] - vw * 0.33, x))
	y = maxf(-vh * 0.67, minf(map_size[1] - vh * 0.33, y))


var moving: bool:
	get:
		return _anchor != Vector2.INF


func _process(dt: float) -> void:
	if _anchor != Vector2.INF:
		var m := to_map(_anchor)
		k += (goal - k) * (1.0 - exp(-dt * 1000.0 / 65.0))
		if absf(goal - k) < goal * 0.002:
			k = goal
		x = m.x - _anchor.x / k
		y = m.y - _anchor.y / k
		_keep_on_map()
		if k == goal:
			_anchor = Vector2.INF
		_place()
	_shade()
	_ink.queue_redraw()


func _place() -> void:
	_cam.scale = Vector2(k, k)
	_cam.position = Vector2(-x * k, -y * k)
	var hi := k > 1.05
	if hi != _hi:
		_hi = hi
		for p in [[_base, "base.jpg"], [_borders, "borders.png"]]:
			var rel: String = p[1].replace(".", "@2x.") if hi else p[1]
			if not _pics.has(rel):
				_pics[rel] = _texture(rel)
			p[0].texture = _pics[rel]
			p[0].scale = Vector2(0.5, 0.5) if hi else Vector2.ONE


# ---------- what is where ----------

## The region at map px m, or "" for the sea.
func region_at(m: Vector2) -> String:
	var w := _ids.get_width()
	var s := w / float(map_size[0])
	var ix := floori(m.x * s)
	var iy := floori(m.y * s)
	if ix < 0 or iy < 0 or ix >= w or iy >= _ids.get_height():
		return ""
	var n := roundi(_ids.get_pixel(ix, iy).r * 255.0)
	return _order[n - 1] if n > 0 and n <= _order.size() else ""


## Icon scale: map px per unit (0.8 screen px while zoomed out, then grows with the zoom).
func u() -> float:
	return maxf(1.0, 0.8 / k)


func far() -> bool:
	return k < NEAR_K


func centroid(id: String) -> Vector2:
	var c: Array = art["regions"][id]["centroid"]
	return Vector2(c[0], c[1])


## The fixed markers in map px: a siege fort or battle right of the centre, a world event above it, his banner left.
func marker_spots() -> Dictionary:
	var s := u()
	var marks := []
	var events := {}
	var banners := {}
	for id in art["regions"]:
		var rs: Dictionary = feed.regions.get(id, {})
		if rs.is_empty():
			continue
		var c := centroid(id)
		for e in feed.events:
			if e["region"] == id:
				events[id] = [c.x, c.y - 56 * s, SIZE["event"] * s, e]
				break
		if rs.get("besieged", false):
			marks.append([id, "markers/fort", Rect2(c.x + 6 * s, c.y - 22 * s, SIZE["battle"] * s, SIZE["battle"] * s)])
		elif rs.get("contested", false):
			marks.append([id, "markers/battle", Rect2(c.x + 6 * s, c.y - 24 * s, SIZE["battle"] * s, SIZE["battle"] * s)])
	for id in feed.squads:
		if art["regions"].has(id):
			var c := centroid(id)
			banners[id] = Vector2(c.x - 44 * s, c.y - 28 * s)
	return {"marks": marks, "events": events, "banners": banners}


static func _over(a: Rect2, b: Rect2) -> float:
	var i := a.intersection(b)
	return i.size.x * i.size.y if i.has_area() else 0.0


## The best spot for a box in region id: the candidates `at`, then rings round the first and round the centre; the
## first inside the region that meets nothing in `placed`, else the least crowded inside (over a name it costs more).
func spot_in(id: String, at: Array, box: Callable, placed: Array, names := []) -> Dictionary:
	var s := u()
	var c := centroid(id)
	var cands := at.duplicate()
	for o in ([at[0]] if not at.is_empty() else []) + [c]:
		for r in range(14, 113, 14):
			for a in 12:
				cands.append(o + Vector2(r * s * cos(a * PI / 6.0), r * s * sin(a * PI / 6.0)))
	var best: Vector2 = at[0] if not at.is_empty() else c
	var bc := INF
	for p: Vector2 in cands:
		var b: Rect2 = box.call(p)
		var cost := 0.0
		for q: Rect2 in placed:
			cost += _over(b, q)
		for q: Rect2 in names:
			cost += NAME_COST * _over(b, q)
		var inside := region_at(b.get_center()) == id and region_at(Vector2(b.position.x, b.end.y)) == id and region_at(Vector2(b.end.x, b.position.y)) == id
		if not inside:
			cost += 1e9
		if cost < bc:
			bc = cost
			best = p
		if cost == 0:
			break
	return {"p": best, "cost": bc}


## A pennant's cloth size and box at pole foot p.
func lord_box(m: Dictionary, p: Vector2) -> Rect2:
	var ps := WorldGeo.pennant_scale(k)
	var f: float = (1.0 if m.get("seat", false) or m.get("raid", false) else LAND_F) * m.get("small", 1.0)
	var w: float = GameData.table("src/war/world-view/lords")["PENNANT_W"] * ps * f
	var h := 15.0 * ps * f
	return Rect2(p.x - 4 * ps, p.y - h * POLE - 2 * ps, w + 6 * ps, h * POLE + 4 * ps)


func _lord_offsets(id: String) -> Array:
	var c := centroid(id)
	var s := u()
	var out := []
	for d in [[-40, 60], [24, 60], [-62, 26], [40, 26], [-24, 90], [-70, -10], [56, -6], [-10, -60], [0, 40], [-30, 10]]:
		out.append(c + Vector2(d[0], d[1]) * s)
	return out


## The boxes the names flow round: the fixed markers, his road, raids' and halls' pennants (placed here).
func obstacles(spots: Dictionary) -> Array:
	var s := u()
	var out := []
	for m in spots["marks"]:
		out.append(m[2])
	for id in spots["events"]:
		var e: Array = spots["events"][id]
		out.append(Rect2(e[0] - e[2] - 8 * s, e[1] - e[2] - 8 * s, e[2] * 2 + 16 * s + (64 if far() else 160) * s, e[2] * 2 + 16 * s))
	for id in spots["banners"]:
		var b: Vector2 = spots["banners"][id]
		out.append(Rect2(b.x, b.y, 38 * s + (10 * str(feed.squads[id]).length() + 14) * s, 56 * s))
	for t in feed.transit.slice(0, 1):
		var q := 32 * s
		var p := WorldGeo.transit_pos(art["regions"], t, feed.now_ms())
		var at := Vector2(roundf(p[0] / q) * q, roundf(p[1] / q) * q)
		out.append(Rect2(at.x - 20 * s - q / 2, at.y - 43 * s - q / 2, 38 * s + (8 * str(t["men"]).length() + 112) * s + q, 51 * s + q))
	return out


# ---------- the names ----------

func _tier(id: String) -> int:
	var role: String = art["regions"][id]["role"]
	if role == "home" or role == "center":
		return 0
	return 1 if WorldGeo.is_market(id) or WorldGeo.is_chokepoint(id) else 2


var _areas := {}


func _area(id: String) -> float:
	if _areas.has(id):
		return _areas[id]
	var p: Array = art["regions"][id]["polygon"]
	var a := 0.0
	for i in p.size():
		var n: Array = p[(i + 1) % p.size()]
		a += p[i][0] * n[1] - n[0] * p[i][1]
	_areas[id] = absf(a) / 2.0
	return _areas[id]


func _fits(id: String, at: Vector2, w: float, h: float, strict: bool) -> bool:
	var pts := [at, at + Vector2(-w * 0.42, 0), at + Vector2(w * 0.42, 0)]
	if strict:
		pts.append_array([at + Vector2(-w * 0.3, -h * 0.3), at + Vector2(w * 0.3, h * 0.3), at + Vector2(-w * 0.3, h * 0.3), at + Vector2(w * 0.3, -h * 0.3)])
	for p in pts:
		if region_at(p) != id:
			return false
	return true


## Collision-free names for this zoom: homes and Omphalos first, then market towns and chokepoints, then the rest
## (small regions first in a tier); each takes the first spot round its anchor inside its region that meets no placed
## name and no marker (one or two lines, full size then smaller), else (homes, Omphalos) the least crowded; any other
## name with no free spot is left out at this zoom. [{id, lines, size, rect, big}]
func labels() -> Array:
	if moving and not _labels.is_empty():
		return _labels
	var spots := marker_spots()
	var obs := obstacles(spots)
	var key := "%.4f|%s|%s" % [k, str(obs), str(feed.lords)]
	if key == _label_key:
		return _labels
	_label_key = key
	_decor_key = ""
	# a raid's pennant and every hall's are fixed too: the names flow round them
	var fixed := []
	var lords := feed.lords.duplicate()
	lords.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a.get("raid", false) and not b.get("raid", false))
	for m in lords:
		if (not m.get("raid", false) and not m["seat"]) or not art["regions"].has(m["region"]):
			continue
		var p: Vector2 = spot_in(m["region"], _lord_offsets(m["region"]), func(q: Vector2) -> Rect2: return lord_box(m, q), obs)["p"]
		obs.append(lord_box(m, p))
		fixed.append(m.merged({"at": p}))
	_obstacles = obs
	_decor = {"fixed": fixed}
	var base := maxf(14.0, 13.0 / k)
	var f := HudTheme.title_font()
	var order: Array = art["regions"].keys()
	order.sort_custom(func(a: String, b: String) -> bool:
		var ta := _tier(a)
		var tb := _tier(b)
		return ta < tb if ta != tb else _area(a) < _area(b))
	var placed := obs.duplicate()
	var out := []
	var pad := base * 0.12
	for id in order:
		var r: Dictionary = art["regions"][id]
		var big := _tier(id) == 0
		if not big and k < 0.32:
			continue
		var text: String = r["name"].to_upper() if big else r["name"]
		var words := text.split(" ")
		var variants := []
		for fs in ([1.45, 1.25, 1.1, 0.95] if big else [1.0, 0.86, 0.74]):
			var sets := [[text]]
			if words.size() > 1:
				var hh := ceili(words.size() / 2.0)
				sets.append([" ".join(words.slice(0, hh)), " ".join(words.slice(hh))])
			var sz: float = base * fs
			for lines in sets:
				var w := 0.0
				for l in lines:
					w = maxf(w, f.get_string_size(l, HORIZONTAL_ALIGNMENT_LEFT, -1, int(sz)).x)
				variants.append([lines, sz, w + sz * 0.3, lines.size() * sz * 1.05 + sz * 0.15])
		var best := {}
		var best_cost := INF
		var cands := _label_spots(r, variants)
		for strict in [true, false]:
			for vi in variants.size():
				var v: Array = variants[vi]
				for p: Vector2 in cands[vi]:
					if not _fits(id, p, v[2], v[3], strict):
						continue
					var box := Rect2(p.x - v[2] / 2 - pad, p.y - v[3] / 2 - pad, v[2] + 2 * pad, v[3] + 2 * pad)
					var c := 0.0
					for q: Rect2 in placed:
						c += _over(box, q)
					if c < best_cost:
						best_cost = c
						best = {"id": id, "lines": v[0], "size": v[1], "rect": Rect2(p.x - v[2] / 2, p.y - v[3] / 2, v[2], v[3]), "big": big}
					if c == 0:
						break
				if best_cost == 0:
					break
			if best_cost == 0:
				break
		if best_cost > 0 and _tier(id) <= 1:
			# just outside, with a leader line to the anchor: rings round it, smallest first; only a free spot counts
			var anchor := Vector2(r["label"][0], r["label"][1])
			var rv := variants.duplicate()
			rv.reverse()
			for v in rv:
				for ring in range(1, 4):
					for dd in [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]]:
						var p := anchor + Vector2(dd[0] * (v[2] / 2 + base * 0.9 * ring), dd[1] * (v[3] / 2 + base * 0.9 * ring))
						var box := Rect2(p.x - v[2] / 2 - pad, p.y - v[3] / 2 - pad, v[2] + 2 * pad, v[3] + 2 * pad)
						var free: bool = box.position.x >= 0 and box.position.y >= 0 and box.end.x <= map_size[0] and box.end.y <= map_size[1]
						for q: Rect2 in placed:
							if free and _over(box, q) > 0:
								free = false
						if free:
							best_cost = 0
							best = {"id": id, "lines": v[0], "size": v[1], "rect": Rect2(p.x - v[2] / 2, p.y - v[3] / 2, v[2], v[3]), "big": big, "leader": anchor}
							break
					if best_cost == 0:
						break
				if best_cost == 0:
					break
		if best.is_empty() or (best_cost > 0 and not big):
			continue
		placed.append(best["rect"].grow(pad))
		out.append(best)
	_labels = out
	return out


## Candidate centres per variant: the anchor, rings round it, then the centroid.
func _label_spots(r: Dictionary, variants: Array) -> Array:
	var out := []
	var a := Vector2(r["label"][0], r["label"][1])
	for v in variants:
		var c := [a]
		for ring in range(1, 5):
			for d in [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]:
				c.append(a + Vector2(d[0] * ring * v[2] * 0.18, d[1] * ring * v[3] * 0.6))
		c.append(Vector2(r["centroid"][0], r["centroid"][1]))
		out.append(c)
	return out


## The context markers, placed after the names (they yield to both names and fixed markers): land pennants and
## landmarks, each at its preferred spot, else the least crowded one round it inside its region.
func decor() -> Dictionary:
	var ls := labels()
	if _decor_key == _label_key and _decor.has("lands"):
		return _decor
	_decor_key = _label_key
	var s := u()
	var names := []
	for l in ls:
		names.append(l["rect"])
	var placed: Array = _obstacles + names
	var lands := []
	var spot := func(id: String, at: Array, box: Callable) -> Variant:
		for f in [1.0, 0.8, 0.6]:
			var q: Dictionary = spot_in(id, at, func(p: Vector2) -> Rect2: return box.call(p, f), placed, names)
			if q["cost"] == 0:
				placed.append(box.call(q["p"], f))
				return [q["p"], f]
		return null
	for m in feed.lords:
		if m.get("raid", false) or m["seat"] or not art["regions"].has(m["region"]):
			continue
		var got = spot.call(m["region"], _lord_offsets(m["region"]), func(q: Vector2, f: float) -> Rect2: return lord_box(m.merged({"small": f}), q))
		if got != null:
			lands.append(m.merged({"at": got[0], "small": got[1]}))
	var lms := {}
	for id in feed.regions:
		if not feed.regions[id].has("landmark") or not art["regions"].has(id):
			continue
		var rr: float = SIZE["landmark"] * s
		var c := centroid(id)
		var at := []
		for d in [[0, 34], [30, 30], [-30, 30], [0, -34]]:
			at.append(c + Vector2(d[0], d[1]) * s)
		var got = spot.call(id, at, func(q: Vector2, f: float) -> Rect2: return Rect2(q.x - rr * f - 3 * s, q.y - rr * f - 3 * s, 2 * rr * f + 6 * s, 2 * rr * f + 6 * s))
		if got != null:
			lms[id] = [got[0], rr * got[1]]
	_decor["lands"] = lands
	_decor["landmarks"] = lms
	return _decor


## The boxes of every name and marker as drawn (map px), for the layout tests: {names: [Rect2], markers: [Rect2]}.
func boxes() -> Dictionary:
	var d := decor()
	var names := []
	for l in _labels:
		names.append(l["rect"])
	var marks: Array = _obstacles.duplicate()
	for m in d["lands"]:
		marks.append(lord_box(m, m["at"]))
	for id in d["landmarks"]:
		var l: Array = d["landmarks"][id]
		marks.append(Rect2(l[0] - Vector2(l[1], l[1]), Vector2(l[1], l[1]) * 2))
	return {"names": names, "markers": marks}


# ---------- what the shader washes ----------

func _shade() -> void:
	if feed == null:
		return
	var pulse := 0.55 + 0.45 * sin(Time.get_ticks_msec() / 220.0)
	var wash := PackedVector4Array()
	var hatch := PackedVector4Array()
	var glow := PackedVector4Array()
	var band := PackedVector4Array()
	var ev := {}
	for e in feed.events:
		ev[e["region"]] = Color(GameData.table("src/war/world-view/eventLook")["EVENT_LOOK"][e["kind"]]["color"])
	for i in 40:
		var id: String = _order[i] if i < _order.size() else ""
		var r: Dictionary = feed.regions.get(id, {})
		var w := Vector4.ZERO
		var h := Vector4.ZERO
		var g := Vector4.ZERO
		var b := Vector4.ZERO
		if not r.is_empty():
			var owner := int(r["owner"])
			w = _v4(Color(120 / 255.0, 120 / 255.0, 128 / 255.0), 0.26) if owner < 0 else _v4(WorldGeo.color(owner), 0.32)
			if owner >= 0:
				b = _v4(WorldGeo.color(owner), 0.75)
			if r.get("contested", false) or r.get("besieged", false):
				var foe := _contender(r)
				h = _v4(Color(240 / 255.0, 138 / 255.0, 112 / 255.0), 0.3) if foe < 0 else _v4(WorldGeo.color(foe), 0.34)
		if ev.has(id):
			g = _v4(ev[id], 0.12 + 0.1 * pulse)
			b = _v4(ev[id], 0.55 + 0.35 * pulse)
		if targets.has(id):
			g = _v4(Color("#f2b27a"), 0.18 + 0.12 * pulse)
		elif id != "" and (id == selected or id == hover):
			g = _v4(Color("#fff0d8"), 0.12)
		wash.append(w)
		hatch.append(h)
		glow.append(g)
		band.append(b)
	_mat.set_shader_parameter("wash", wash)
	_mat.set_shader_parameter("hatch", hatch)
	_mat.set_shader_parameter("glow", glow)
	_mat.set_shader_parameter("band", band)


static func _v4(c: Color, a: float) -> Vector4:
	return Vector4(c.r, c.g, c.b, a)


## The strongest alliance in a region other than its owner (-1: none known).
static func _contender(r: Dictionary) -> int:
	var best := -1
	for a in r["live"].size():
		if r["live"][a] > 0 and a != int(r["owner"]) and (best < 0 or r["live"][a] > r["live"][best]):
			best = a
	return best


func polygon(id: String) -> PackedVector2Array:
	var out := PackedVector2Array()
	for p in art["regions"][id]["polygon"]:
		out.append(Vector2(p[0], p[1]))
	out.append(out[0])
	return out


func route_points(path: Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	for i in path.size():
		var r: Dictionary = art["regions"][path[i]]
		out.append(Vector2(r["centroid"][0], r["centroid"][1]))
		if i + 1 < path.size() and r["crossings"].has(path[i + 1]):
			var c: Array = r["crossings"][path[i + 1]]
			out.append(Vector2(c[0], c[1]))
	return out


func pic(n: String) -> Texture2D:
	if not _pics.has(n):
		_pics[n] = HudTheme.icon(n, 32)
	return _pics[n]


## The map's ink in map px: outlines, roads, names and markers, drawn over the washes and the borders.
class Ink extends Node2D:
	var map: WorldMap

	func _draw() -> void:
		if map.feed == null:
			return
		var k := map.k
		var s := map.u()
		var now := map.feed.now_ms()
		var pulse := 0.55 + 0.45 * sin(Time.get_ticks_msec() / 220.0)
		for id in map.targets:
			_dashed(map.polygon(id), 12.0, 8.0, Color("#f2b27a"), 4.0 / maxf(k, 0.4))
		for p in [[map.selected, Color("#fff0d8"), 4.0], [map.hover, Color("#f0d9b5"), 2.5]]:
			if p[0] != "" and map.art["regions"].has(p[0]):
				draw_polyline(map.polygon(p[0]), p[1], p[2] / maxf(k, 0.4), true)
		if map.routes:
			_routes()
		for l in map.labels():
			_label(l)
		var d := map.decor()
		for id in d["landmarks"]:
			_landmark(id, d["landmarks"][id][0], d["landmarks"][id][1])
		for m in d["lands"]:
			_pennant(m)
		var spots := map.marker_spots()
		for m in spots["marks"]:
			draw_texture_rect(map.pic(m[1]), m[2], false)
		for m in d["fixed"]:
			_pennant(m)
		for id in spots["events"]:
			_event(spots["events"][id], now)
		for t in map.feed.transit.slice(0, 1):
			var p := WorldGeo.transit_pos(map.art["regions"], t, now)
			var at := Vector2(p[0], p[1])
			draw_texture_rect(map.pic("markers/transit"), Rect2(at.x - 20 * s, at.y - 40 * s, 40 * s, 48 * s), false)
			var left := maxi(0, ceili((t["arriveAt"] - now) / 1000.0))
			_count_badge(int(t["men"]), "waiting" if t["state"] == "queued" else WorldGeo.clock(left), at + Vector2(18, -34) * s, s)
		var key: String = WorldGeo.alliances()[map.feed.you if map.feed.you != null else 0]["key"]
		for id in spots["banners"]:
			var b: Vector2 = spots["banners"][id]
			var on: bool = map.squad_at == id
			var col := Color(1, 0.94, 0.85, 0.45) if on else Color(0.95, 0.83, 0.54, 0.22 + 0.1 * pulse * float(on))
			_ellipse(b + Vector2(20, 56) * s, Vector2(26, 8) * s, col)
			draw_texture_rect(map.pic("banners/" + key), Rect2(b, Vector2(40, 56) * s), false)
			_badge(str(map.feed.squads[id]), b + Vector2(38, 14) * s, s, on, Color("#e0b867"))

	func _routes() -> void:
		var rts: Array = WorldGeo.geo()["TRADE_ROUTES"]
		for i in rts.size():
			var sacred: bool = rts[i]["name"].begins_with("Sacred")
			var off := (-5.0 if i == 4 else 5.0) if sacred else 0.0
			var pts := map.route_points(rts[i]["path"])
			for j in pts.size():
				pts[j] += Vector2(off, off)
			draw_polyline(pts, Color(14 / 255.0, 9 / 255.0, 7 / 255.0, 0.7), 7.0, true)
			if sacred:
				_dashed(pts, 4.0, 9.0, Color("#e0b867"), 3.5)
			else:
				_dashed(pts, 16.0, 10.0, Color("#f0d9b5"), 3.5)

	## A dashed polyline whose pattern runs on across its corners.
	func _dashed(pts: PackedVector2Array, on: float, off: float, c: Color, w: float) -> void:
		var t := 0.0
		for i in pts.size() - 1:
			var a := pts[i]
			var b := pts[i + 1]
			var l := a.distance_to(b)
			var d := 0.0
			while d < l:
				var phase := fmod(t, on + off)
				var run := (on - phase) if phase < on else (on + off - phase)
				var e := minf(l, d + run)
				if phase < on:
					draw_line(a.lerp(b, d / l), a.lerp(b, e / l), c, w)
				t += e - d
				d = e

	func _label(l: Dictionary) -> void:
		var f := HudTheme.title_font()
		var sz := int(l["size"])
		var r: Rect2 = l["rect"]
		var on: bool = l["id"] == map.hover or l["id"] == map.selected
		var lines: Array = l["lines"]
		if l.has("leader"):
			var a: Vector2 = l["leader"]
			var c := r.get_center()
			var d := a - c
			var e := minf(minf(absf(r.size.x / 2.0 / (d.x if d.x != 0 else 1e-6)), absf(r.size.y / 2.0 / (d.y if d.y != 0 else 1e-6))), 1.0)
			draw_line(c + d * e, a, Color(16 / 255.0, 10 / 255.0, 8 / 255.0, 0.85), l["size"] * 0.22)
			draw_line(c + d * e, a, PARCH, l["size"] * 0.08)
			draw_circle(a, l["size"] * 0.16, PARCH)
		for i in lines.size():
			var ly: float = r.get_center().y + (i - (lines.size() - 1) / 2.0) * l["size"] * 1.05
			var tw := f.get_string_size(lines[i], HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x
			var at := Vector2(r.get_center().x - tw / 2.0, ly + (f.get_ascent(sz) - f.get_descent(sz)) / 2.0)
			draw_string_outline(f, at, lines[i], HORIZONTAL_ALIGNMENT_LEFT, -1, sz, int(l["size"] * 0.28), INK)
			draw_string(f, at, lines[i], HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color("#fff6e4") if on else Color("#f2c48a") if l["big"] else PARCH)

	func _ellipse(c: Vector2, r: Vector2, col: Color) -> void:
		var pts := PackedVector2Array()
		for i in 24:
			pts.append(c + Vector2(cos(i * TAU / 24) * r.x, sin(i * TAU / 24) * r.y))
		draw_colored_polygon(pts, col)

	## A dark disc with a ring: the base of every round marker.
	func _disc(c: Vector2, r: float, ring: Color, w: float, dashed := false) -> void:
		var s := map.u()
		draw_circle(c + Vector2(0, 1.5 * s), r + 1.5 * s, Color(14 / 255.0, 9 / 255.0, 7 / 255.0, 0.55))
		draw_circle(c, r, Color("#17100d"))
		if dashed:
			for i in 12:
				draw_arc(c, r, i * TAU / 12, i * TAU / 12 + TAU / 20, 4, ring, w)
		else:
			draw_arc(c, r, 0, TAU, 32, ring, w, true)

	## A landmark: a fort on a dark disc ringed in its holder's colour (red: its guardian, grey: nobody), gold ring
	## once restored, dashed while damaged; a pip with the guardian alive (red) or slain (grey).
	func _landmark(id: String, c: Vector2, r: float) -> void:
		var lm: Dictionary = map.feed.regions[id]["landmark"]
		var s := map.u()
		var holder := int(lm["holder"])
		var col := WorldGeo.color(holder) if holder >= 0 else Color("#b8402c") if lm["guardian"] == "alive" else Color("#8a786a")
		if lm["state"] == "restored":
			draw_arc(c, r + 3.5 * s, 0, TAU, 32, Color("#e0b867"), 2 * s, true)
		_disc(c, r, col, 3 * s, lm["state"] == "damaged")
		var ic := map.pic("bld-fort")
		if ic:
			var dim: bool = lm["state"] == "damaged" or lm["state"] == "unclaimed"
			draw_texture_rect(ic, Rect2(c - Vector2(r, r) * 0.72, Vector2(r, r) * 1.44), false, Color(1, 1, 1, 0.75 if dim else 1.0))
		var pc := c + Vector2(r * 0.78, -r * 0.78)
		var alive: bool = lm["guardian"] == "alive"
		draw_circle(pc, r * 0.44, Color("#8a2418") if alive else Color("#3a2e28"))
		draw_arc(pc, r * 0.44, 0, TAU, 16, Color("#0e0907"), 1.2 * s, true)

	## A warlord's pennant: a dark pole with a gold knob, a swallow-tailed cloth in his colour; a raid: a pulsing red
	## ring at its foot; fallen: grey, hung half down.
	func _pennant(m: Dictionary) -> void:
		var ps := WorldGeo.pennant_scale(map.k)
		var f: float = (1.0 if m["seat"] or m.get("raid", false) else LAND_F) * m.get("small", 1.0)
		var w: float = GameData.table("src/war/world-view/lords")["PENNANT_W"] * ps * f
		var h := 15.0 * ps * f
		var p: Vector2 = m["at"]
		var top := p.y - h * POLE
		var fallen: bool = m.get("fallen", false)
		var ct := top + (h * 0.9 if fallen else 0.0)
		var col := Color("#5a524c") if fallen else Color.hex((int(m["tint"]) << 8) | 0xff)
		if m.get("raid", false):
			var q := 0.5 + 0.5 * sin(Time.get_ticks_msec() / 220.0)
			_ring(p, Vector2(9 + 4 * q, 4.5 + 2 * q) * ps, Color(224 / 255.0, 74 / 255.0, 58 / 255.0, 0.55 + 0.45 * q), 2.4 * ps)
		draw_line(p, Vector2(p.x, top), Color("#0e0907"), 4.5 * ps)
		draw_line(p, Vector2(p.x, top), Color("#6b4a2a"), 2.2 * ps)
		var cloth := PackedVector2Array([Vector2(p.x + ps, ct + 2 * ps), Vector2(p.x + w, ct + 2 * ps), Vector2(p.x + w * 0.72, ct + 2 * ps + h / 2), Vector2(p.x + w, ct + 2 * ps + h), Vector2(p.x + ps, ct + 2 * ps + h)])
		draw_colored_polygon(cloth, col)
		cloth.append(cloth[0])
		draw_polyline(cloth, Color("#0e0907"), 1.8 * ps, true)
		draw_circle(Vector2(p.x, top), (3.2 if m["seat"] else 2.4) * ps, Color("#e0b867"))

	func _ring(c: Vector2, r: Vector2, col: Color, w: float) -> void:
		var pts := PackedVector2Array()
		for i in 25:
			pts.append(c + Vector2(cos(i * TAU / 24) * r.x, sin(i * TAU / 24) * r.y))
		draw_polyline(pts, col, w, true)

	## A world event: its icon on a dark disc ringed in its colour, a pulsing halo, its time left (its name up close).
	func _event(e: Array, now: float) -> void:
		var s := map.u()
		var ev: Dictionary = e[3]
		var look: Dictionary = GameData.table("src/war/world-view/eventLook")["EVENT_LOOK"][ev["kind"]]
		var col := Color(look["color"])
		var c := Vector2(e[0], e[1])
		var r: float = e[2]
		var q := 0.5 + 0.5 * sin(Time.get_ticks_msec() / 260.0)
		draw_circle(c, r + (4 + 4 * q) * s, Color(col, 0.16 + 0.12 * (1 - q)))
		_disc(c, r, col, 3 * s)
		var ic := map.pic(look["icon"])
		if ic:
			draw_texture_rect(ic, Rect2(c - Vector2(r, r) * 0.72, Vector2(r, r) * 1.44), false, Color(1.6, 1.7, 1.8, 0.85) if look.get("ghost", false) else Color.WHITE)
		var left := WorldGeo.clock(maxi(0, ceili((ev["endAt"] - now) / 1000.0)))
		var name: String = GameData.table("src/war/world/events")["EVENT_INFO"][ev["kind"]]["name"]
		_badge(left if map.far() else "%s · %s" % [name, left], c + Vector2(r + 3 * s, 0), s, false, col)

	func _badge(text: String, at: Vector2, s: float, on: bool, edge := Color("#7a3418")) -> void:
		var f := HudTheme.bold_font()
		var fs := int(BADGE_FONT * s)
		var w := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x + 10 * s
		var r := Rect2(at.x, at.y - 10.5 * s, w, 21 * s)
		draw_rect(r, Color("#3d2414") if on else Color("#17100d"))
		draw_rect(r, Color("#f2b27a") if on and edge == Color("#7a3418") else edge, false, 2 * s)
		draw_string(f, Vector2(at.x + 5 * s, at.y + (f.get_ascent(fs) - f.get_descent(fs)) / 2.0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#f0d9b5"))

	## His men on the road: a men icon and their count, a clock and the time to go ("12 · 1:36").
	func _count_badge(n: int, left: String, at: Vector2, s: float) -> void:
		var f := HudTheme.bold_font()
		var fs := int(BADGE_FONT * s)
		var ic := 15 * s
		var wa := f.get_string_size(str(n), HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var wb := f.get_string_size(left, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var w := 5 * s + ic + 3 * s + wa + 7 * s + ic + 3 * s + wb + 5 * s
		var r := Rect2(at.x, at.y - 10.5 * s, w, 21 * s)
		draw_rect(r, Color("#17100d"))
		draw_rect(r, Color("#7a3418"), false, 2 * s)
		var cx := at.x + 5 * s
		var base := at.y + (f.get_ascent(fs) - f.get_descent(fs)) / 2.0
		var men := map.pic("unit-hoplite")
		if men:
			draw_texture_rect(men, Rect2(cx, at.y - ic / 2, ic, ic), false)
		cx += ic + 3 * s
		draw_string(f, Vector2(cx, base), str(n), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#f0d9b5"))
		cx += wa + 7 * s
		var o := Vector2(cx + ic / 2, at.y)
		var rr := ic / 2 - s
		draw_arc(o, rr, 0, TAU, 20, Color("#e0b867"), 1.6 * s, true)
		draw_polyline(PackedVector2Array([o + Vector2(0, -rr * 0.65), o, o + Vector2(rr * 0.5, rr * 0.2)]), Color("#e0b867"), 1.6 * s)
		cx += ic + 3 * s
		draw_string(f, Vector2(cx, base), left, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#f0d9b5"))
