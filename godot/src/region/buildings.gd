## The works buildings on the map (src/war/view/build/buildingLayer.ts draw, buildArt.ts), from the live sim's
## Sim.view_state: the pre-built town pieces (houses, stoas, stalls, statues, temples, wells...) in the biome libraries'
## town art (one of a type's looks picked by position; their damaged and ruined looks), the player-built ones in their
## ART-B art by construction stage (foundation, rising, scaffold, done, damaged; gates by their line's axis), ruins as
## the town ruin of their size or the stub of their art, wet, fouled and sooty tints. Sprites y-sort with the objects and
## units (Objects.DEPTH_PX per unit of x + y); a building with no art yet (walls, towers, stairs, bridges, ditches,
## braziers: their kits are not ported) is an iso box in its material with its team's band. Bars: labour (and goods
## delivered) over a site, hp over one hit in the last HIT_MS.
class_name Buildings
extends Node2D

const STUB := 33.0
const HIT_MS := 6000.0
const WET_TINT := Color8(0xb0, 0xb4, 0xb8)
const RUIN_TINT := Color8(0xb8, 0xae, 0xa0)
const SOOT_TINT := Color8(0x9a, 0x90, 0x88)
const FOUL_TINT := Color8(0x9f, 0xb4, 0x87)
const CELLS := [[0, 0], [1, 0], [0, 1], [1, 1]]
## buildingLayer.ts HEIGHT (px of a placeholder box), default 60.
const HEIGHT := {
	"camp": 36, "storehouse": 52, "outpost": 80, "fort": 120, "barracks": 60, "farm": 8, "olivePress": 48, "brazier": 20, "pitchKiln": 50,
	"palisade": 56, "rampart": 100, "stoneWall": 160, "woodTower": 120, "stoneTower": 150, "woodGate": 70, "stoneGate": 100,
	"woodStairs": 50, "stoneStairs": 80, "ladder": 120,
}
const MAT := {"wood": Color8(0x8a, 0x6a, 0x44), "stone": Color8(0xa8, 0xa2, 0x94)}

var iso: Iso
var objects: Objects
## buildings.json (src/dev/godotBuild.ts): stages, art ids and town looks per type, sprites.
var art := {}
var _tex := {}
var defs := {}
var team_colors: Array[Color] = []
## Per building id: its Sprite2D (null: drawn as a placeholder) and what it was drawn for.
var _sprites := {}
var _keys := {}
var _hits := {}
var _rows: Array = []
var _bars: BarsLayer
var _boxes: BoxLayer
var count := 0


func setup(iso_: Iso, objects_: Objects) -> void:
	iso = iso_
	objects = objects_
	load_art()
	for a in GameData.table("src/war/world/alliances")["ALLIANCES"]:
		team_colors.append(Color(a["color"]))
	_bars = BarsLayer.new()
	_bars.z_index = objects.z_index + 400
	_bars.owner_ = self
	objects.get_parent().add_child.call_deferred(_bars)
	_boxes = BoxLayer.new()
	_boxes.owner_ = self
	objects.add_child(_boxes)


# ---- the art (buildArt.ts)

## buildings.json and the sim's building defs.
func load_art() -> void:
	var p := ViewData.DIR.path_join("buildings.json")
	if FileAccess.file_exists(p):
		art = JSON.parse_string(FileAccess.get_file_as_string(p))
	defs = GameData.table("src/war/sim/economy")["BUILDINGS"]

## buildArt.ts stage: under construction the last stage whose threshold the labour reached (never done before done).
func stage(state: String, progress: float) -> String:
	if state != "foundation" and state != "scaffold":
		return state
	var st: Array = art.get("stages", [["foundation", 0]])
	var s: String = st[0][0]
	for e in st:
		if e[0] != "done" and progress >= e[1]:
			s = e[0]
	return s


## The sprite [file, ox, oy, fw, fh] of a type at an art stage (gates by axis), falling back to earlier stages and done.
func sprite(type: String, stg: String, axis: String) -> Array:
	var id: String = art.get("art", {}).get(type, "")
	if id == "" or stg == "destroyed":
		return []
	if type == "woodGate" or type == "stoneGate":
		id += "-" + axis
	var sp: Dictionary = art["sprites"]
	if sp.has(id + "/" + stg):
		return sp[id + "/" + stg]
	var st: Array = art["stages"]
	var i := -1
	for k in st.size():
		if st[k][0] == stg:
			i = k
	for k in range(i - 1, -1, -1):
		if sp.has(id + "/" + st[k][0]):
			return sp[id + "/" + st[k][0]]
	return sp.get(id + "/done", [])


## The town look of a pre-built type with no art of its own (`seed` picks one of its looks), [] none.
func pre_sprite(type: String, seed: float) -> Array:
	var ids: Array = art.get("pre", {}).get(type, [])
	if ids.is_empty():
		return []
	var t: Dictionary = art["town"]
	return t.get(ids[absi(floori(seed)) % ids.size()], t.get(ids[0], []))


## Its damaged or ruined look (the same look `seed` picks), [] where the library has none.
func pre_state(type: String, seed: float, st: String) -> Array:
	var ids: Array = art.get("pre", {}).get(type, [])
	if ids.is_empty():
		return []
	var t: Dictionary = art["town"]
	var id: String = ids[absi(floori(seed)) % ids.size()]
	if not t.has(id):
		id = ids[0]
	return t.get(id + "-" + st, [])


## A town ruin standing in for a piece with no ruined look: [sprite, turned] of footprint w x h, else the largest inside.
func rubble(w: float, h: float) -> Array:
	var best := []
	var score := -1.0
	var t: Dictionary = art.get("town", {})
	for id in t:
		if not id.ends_with("-ruined"):
			continue
		var s: Array = t[id]
		for turned in [false, true]:
			var fw: float = s[4] if turned else s[3]
			var fh: float = s[3] if turned else s[4]
			if fw > w or fh > h:
				continue
			var sc := (1000.0 if fw == w and fh == h else 0.0) + fw * fh
			if sc > score:
				score = sc
				best = [s, turned]
	return best


func _texture(file: String) -> Texture2D:
	if not _tex.has(file):
		_tex[file] = ViewData.image_texture(ViewData.DIR.path_join("buildings/" + file))
	return _tex[file]


# ---- per snapshot

## Ground level a building stands on: the lowest under the visual cells of its footprint (walls: their centre's).
func ground_z(b: Array) -> float:
	var tiles: PackedInt32Array = b[16]
	if tiles.is_empty() or defs.get(b[1], {}).get("wall") != null:
		return iso.z_at(b[3], b[4])
	var z := INF
	for i in range(0, tiles.size(), 2):
		for c in CELLS:
			z = minf(z, iso.z_at(tiles[i] + (c[0] + 0.5) / 2.0, tiles[i + 1] + (c[1] + 0.5) / 2.0))
	return z


## What building b ([id, type, team, x, y, w, h, rot, state, progress, hp, maxHp, ruin, wet, fouled, delivered, tiles])
## draws as: [sprite, turned, tint, stub] or [] (a placeholder).
func look(b: Array) -> Array:
	var type: String = b[1]
	var def: Dictionary = defs.get(type, {})
	var seed: float = b[3] * 7.0 + b[4] * 13.0
	var state: String = b[8]
	var ruin: bool = b[12]
	var axis := "x" if b[5] >= b[6] else "y"
	var turned: bool = int(b[7]) == 1 and def.get("wall") == null
	if def.get("wall") == "segment" or def.get("wall") == "tower" or def.get("access") != null or def.get("bridge") or def.get("field") == "ditch":
		return []
	if ruin and def.get("wall") == null:
		var r := pre_state(type, seed, "ruined")
		if not r.is_empty():
			return [r, turned, Color.WHITE, false]
		var rb := rubble(b[5], b[6])
		if not rb.is_empty():
			return [rb[0], rb[1], Color.WHITE, false]
		var s := pre_sprite(type, seed)
		if s.is_empty():
			s = sprite(type, "damaged", axis)
		return [s, turned, RUIN_TINT, true] if not s.is_empty() else []
	if state == "destroyed":
		return []
	var hurt: bool = state == "damaged" and art.get("pre", {}).has(type)
	var hurt_art := pre_state(type, seed, "damaged") if hurt else []
	var spr := hurt_art
	if spr.is_empty():
		spr = pre_sprite(type, seed)
	if spr.is_empty():
		spr = sprite(type, stage(state, b[9]), axis)
	if spr.is_empty():
		return []
	var tint := Color.WHITE
	if b[13]:
		tint = WET_TINT
	elif b[14]:
		tint = FOUL_TINT
	elif hurt and hurt_art.is_empty():
		tint = SOOT_TINT
	return [spr, turned, tint, false]


## The buildings of a new view state.
func push(list: Array) -> void:
	var now := float(Time.get_ticks_msec())
	var seen := {}
	_rows = []
	var boxes := []
	for b in list:
		var id := int(b[0])
		seen[id] = true
		var hp: float = b[10]
		var h: Array = _hits.get(id, [hp, -INF])
		if hp < h[0]:
			h[1] = now
		h[0] = hp
		_hits[id] = h
		var key := "%s|%s|%.2f|%s|%s|%s|%s" % [b[1], b[8], b[9], b[12], b[13], b[14], b[7]]
		var z := ground_z(b)
		var c := Vector2(iso.sx(b[3], b[4]), iso.sy(b[3], b[4], z))
		var l: Array = look(b)
		if _keys.get(id, "") != key:
			_keys[id] = key
			_place(id, b, l, z)
		if l.is_empty():
			boxes.append([b, z])
		_bar(b, c, now, h[1])
	for id in _sprites.keys():
		if not seen.has(id):
			if _sprites[id]:
				_sprites[id].queue_free()
			_sprites.erase(id)
			_keys.erase(id)
	count = list.size()
	_boxes.items = boxes
	_boxes.queue_redraw()
	_bars.queue_redraw()


## buildingLayer.ts fit: the sprite's footprint centred on the building's (scaled down if the art's is bigger), its
## tile origin on the top vertex of the footprint's north tile; y-sorted at the depth of its south tile.
func _place(id: int, b: Array, l: Array, z: float) -> void:
	var sp: Sprite2D = _sprites.get(id)
	if l.is_empty():
		if sp:
			sp.visible = false
		return
	if sp == null:
		sp = Sprite2D.new()
		sp.centered = false
		objects.add_child(sp)
		_sprites[id] = sp
	var spr: Array = l[0]
	var turned: bool = l[1]
	var tex := _texture(spr[0])
	var fw: float = spr[4] if turned else spr[3]
	var fh: float = spr[3] if turned else spr[4]
	var w: float = b[5]
	var h: float = b[6]
	var k := minf(1.0, minf(w / fw, h / fh))
	var ox: float = tex.get_width() - spr[1] if turned else spr[1]
	var tx: float = b[3] - fw * k / 2.0
	var ty: float = b[4] - fh * k / 2.0
	var top := Vector2(iso.sx(tx, ty), iso.sy(tx, ty, z))
	var at := Vector2(roundf(top.x - ox * k), roundf(top.y - spr[2] * k))
	var depth: float = (b[3] + w / 2.0 - 0.5 + b[4] + h / 2.0 - 0.5) * Objects.DEPTH_PX
	sp.texture = tex
	sp.flip_h = turned
	sp.scale = Vector2(k, k)
	sp.position = Vector2(at.x, depth)
	sp.offset = Vector2(0, (at.y - depth) / k)
	sp.modulate = l[2]
	sp.region_enabled = false
	if l[3]:
		# a ruin's stub: the art cut to its bottom STUB px over the side vertices
		var cut := maxf(0.0, roundf(spr[2] + (w + h) / 2.0 * Iso.HH - STUB))
		sp.region_enabled = true
		sp.region_rect = Rect2(0, cut, tex.get_width(), tex.get_height() - cut)
		sp.offset.y += cut
	sp.visible = true


## buildingLayer.ts bar: labour (green) over goods delivered (amber) on a site; hp (red) on a damaged one hit lately.
func _bar(b: Array, c: Vector2, now: float, hit_at: float) -> void:
	var state: String = b[8]
	var site := state == "foundation" or state == "scaffold"
	if not site and state != "damaged":
		return
	if not site and now - hit_at > HIT_MS:
		return
	var def: Dictionary = defs.get(b[1], {})
	if site and (def.get("wall") == "segment" or def.get("bridge")) and b[15] == 0:
		return
	var tall: float = HEIGHT.get(b[1], 60)
	_rows.append([c, tall, site, b[15], b[9], b[10] / maxf(1.0, b[11])])


func team_color(t: int) -> Color:
	return team_colors[t] if t >= 0 and t < team_colors.size() else Color8(0xcc, 0xcc, 0xcc)


class BarsLayer extends Node2D:
	var owner_: Buildings

	func _draw() -> void:
		var zoom := get_viewport().get_canvas_transform().get_scale().x
		var k := 1.0 / maxf(zoom, 0.25)
		var w := 44.0 * k
		var h := 4.0 * k
		for r in owner_._rows:
			var c: Vector2 = r[0]
			var x := c.x - w / 2.0
			var y: float = c.y - r[1] - 14.0 * k
			draw_rect(Rect2(x - k, y - k, w + 2.0 * k, (2.0 * h + k if r[2] else h) + 2.0 * k), Color(0, 0, 0, 0.7))
			if r[2]:
				draw_rect(Rect2(x, y, w * r[3], h), Color8(0xe0, 0xa0, 0x30))
				draw_rect(Rect2(x, y + h + k, w * r[4], h), Color8(0x60, 0xd0, 0x60))
			else:
				draw_rect(Rect2(x, y, w * r[5], h), Color8(0xd0, 0x40, 0x30))


## Buildings with no art yet (buildingLayer.ts placeholder): a foundation's footprint, a site's box rising with its
## labour, a standing box with its team's band, rubble where it was destroyed. Drawn at the back of the y-sort (under
## the units near them), as one canvas item.
class BoxLayer extends Node2D:
	var owner_: Buildings
	var items: Array = []

	func _pt(x: float, y: float, z: float) -> Vector2:
		return Vector2(owner_.iso.sx(x, y), owner_.iso.sy(x, y, z))

	func _corners(x0: float, y0: float, x1: float, y1: float, z: float, h: float) -> PackedVector2Array:
		var up := Vector2(0, -h)
		return PackedVector2Array([_pt(x0, y0, z) + up, _pt(x1, y0, z) + up, _pt(x1, y1, z) + up, _pt(x0, y1, z) + up])

	func _draw() -> void:
		var lw := 1.25
		for it in items:
			var b: Array = it[0]
			var z: float = it[1]
			var def: Dictionary = owner_.defs.get(b[1], {})
			var col: Color = Buildings.MAT.get(def.get("material", "wood"), Buildings.MAT["wood"])
			if b[8] == "damaged":
				col = col.darkened(0.38)
			var team := owner_.team_color(int(b[2]))
			var tiles: PackedInt32Array = b[16]
			var rects := []
			if def.get("wall") == "segment" and not tiles.is_empty():
				for i in range(0, tiles.size(), 2):
					rects.append([tiles[i] + 0.15, tiles[i + 1] + 0.15, tiles[i] + 0.85, tiles[i + 1] + 0.85])
				rects.sort_custom(func(p: Array, q: Array) -> bool: return p[0] + p[1] < q[0] + q[1])
			else:
				rects.append([b[3] - b[5] / 2.0, b[4] - b[6] / 2.0, b[3] + b[5] / 2.0, b[4] + b[6] / 2.0])
			if b[8] == "foundation":
				for r in rects:
					var c := _corners(r[0], r[1], r[2], r[3], z, 0)
					draw_colored_polygon(c, Color8(0x6b, 0x5a, 0x40, 140))
					draw_polyline(c + PackedVector2Array([c[0]]), Color(team, 0.9), lw * 1.5)
				continue
			if b[8] == "destroyed" or b[12]:
				for r in rects:
					draw_colored_polygon(_corners(r[0] + 0.1, r[1] + 0.1, r[2] - 0.1, r[3] - 0.1, z, 0), Color8(0x3a, 0x35, 0x30, 204))
				continue
			var H: float = Buildings.HEIGHT.get(b[1], 60)
			var h: float = H * maxf(0.12, b[9]) if b[8] == "scaffold" else H
			for r in rects:
				var g := _corners(r[0], r[1], r[2], r[3], z, 0)
				var t := _corners(r[0], r[1], r[2], r[3], z, h)
				draw_colored_polygon(PackedVector2Array([g[3], g[2], t[2], t[3]]), col.darkened(0.3))
				draw_colored_polygon(PackedVector2Array([g[2], g[1], t[1], t[2]]), col.darkened(0.12))
				draw_colored_polygon(t, col.lightened(0.12))
				draw_polyline(PackedVector2Array([g[3], g[2], g[1], t[1], t[0], t[3], g[3]]), Color(0.1, 0.086, 0.07, 0.8), lw)
				draw_polyline(PackedVector2Array([t[3], t[2], t[1]]), team, lw * 2.0)
