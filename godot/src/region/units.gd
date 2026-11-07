## Soldiers on the iso map at real scale (src/war/view/units.ts): the PixelLab sheets (godot/view/sheets, rows are
## facings) drawn 1:1, a unit in the row of the screen quadrant nearest its heading and the frame Anim picks, between the
## last two 10 Hz snapshots. Depth sorted with the map objects (this node y-sorts into Objects'), each man in his own
## look (Look: skin, cloak, crest, trim, hair, tier, in his team's colours; a sheet without colour groups: team-dyed red
## cloth), a shadow and a team ring under each man. Units behind higher ground are not drawn (iso.hidden).
## Blows (HitWatch): the struck man flashes white (an additive copy of his frame) and is nudged off his striker. Health
## bars (micro.ts): thin pixel bars over the hurt (own green, foes red, neutral folk yellow), every man's with Alt held.
## LOD (lod_of): close up every man is a sprite with ring and shadow and the hidden test; with many on screen the rings
## go and the hidden test runs on a quarter of the men a frame; far out (zoom under SPRITE_ZOOM) men are dots.
class_name Units
extends Node2D

const BODY := 28.0
const SPRITE_ZOOM := 1.0 / 3.0
## Men on screen over which the reduced level applies.
const CROWD := 250
const SOLDIER_SCALE := 0.55
const QUADRANT := ["south-east", "south-west", "north-east", "north-west"]
const QUAD_HYST := 0.26
## A light multiply per team (units.ts TEAM_TINT) and the dye of red cloth to its colour (look.ts DYE_GLSL; team 2,
## Kyrene, keeps the red).
const TEAM_TINT := [Color8(0xd0, 0xe4, 0xff), Color8(0xff, 0xf0, 0xc0), Color8(0xff, 0xd4, 0xc8), Color8(0xec, 0xd8, 0xff)]
const DYE := [
	"vec3(c.b * 0.6, c.g * 0.8 + c.r * 0.3, c.r * 1.2 + 0.06)",
	"vec3(c.r * 1.15 + 0.06, c.r * 0.85 + c.g * 0.2, c.b * 0.5)",
	"",
	"vec3(c.r * 0.55 + c.b * 0.3, c.g * 0.6, c.r * 0.9 + 0.05)",
]
const RED_W := "smoothstep(0.3, 0.55, (c.r - max(c.g, c.b)) / max(c.r, 0.001)) * (1.0 - smoothstep(0.1, 0.25, (c.g - c.b) / max(c.r, 0.001)))"

## micro.ts / microRules.ts BAR: size (screen px at zoom 1), px over the feet (a soldier is 2 BODY tall), colours.
const BAR_W := 16.0
const BAR_H := 2.0
const BAR_ABOVE := BODY * 2.0 + 6.0
const BAR_GREEN := Color8(0x52, 0xc4, 0x47)
const BAR_RED := Color8(0xd8, 0x40, 0x2f)
const BAR_YELLOW := Color8(0xe8, 0xc3, 0x3a)
const BAR_BACK := Color(0x12 / 255.0, 0x0c / 255.0, 0x0a / 255.0, 0.9)
const BAR_LOST := Color8(0x3b, 0x2a, 0x22)
const FLASH_FILL := Color8(0xff, 0xf0, 0xd8)

enum Lod { FULL, CROWD, DOTS }
enum Bar { NONE, OWN, FOE, ALLY }

var iso: Iso
var objects: Objects
## squad id -> class, team (from the scenario).
var classes := {}
var teams := {}
## Snapshot blend: 0 the previous snapshot, 1 the newest.
var alpha := 1.0
var count := 0
var drawn := 0
var lod := Lod.FULL
var anim := Anim.new()
var team_colors: Array[Color] = []
var _sheets := {}
var _prev := {}
var _cur := {}
var _squad_of := {}
var _pool: Array[Sprite2D] = []
var _quads := {}
var _hidden := {}
var _frame := 0
var _materials: Array = []
var _under: UnderLayer
var _bars: BarLayer
var _flash_mat: ShaderMaterial
var _flashes: Array[Sprite2D] = []
var hits := HitWatch.new()
## The player's team (own bars), the neutral folk's team; Alt held: every bar.
var mine := -1
var neutral := -1
var alt := false
## Per unit (Sim.view_state): max hp, class, person id, level; his look's modulate, and what it was made from.
var _info := {}
var _codes := {}


## microRules.ts barOf: the bar a man gets (Bar.NONE: none): his tone by side, shown while hurt, or with Alt held.
static func bar_of(dead: bool, hp: float, max_hp: float, team: int, mine_: int, neutral_: int, alt_: bool) -> Bar:
	if dead or not (max_hp > 0.0):
		return Bar.NONE
	var tone := Bar.OWN if team == mine_ else (Bar.ALLY if team == neutral_ else Bar.FOE)
	return tone if alt_ or hp < max_hp - 1e-6 else Bar.NONE


## The level of detail for `n` men on screen at camera zoom `zoom`.
static func lod_of(zoom: float, n: int) -> Lod:
	if zoom < SPRITE_ZOOM:
		return Lod.DOTS
	return Lod.CROWD if n > CROWD else Lod.FULL


## The screen quadrant (QUADRANT index) a man facing `facing` (tile space) is drawn in, kept until his heading is
## QUAD_HYST past its edge (`was`: last frame's, -1 none).
static func quadrant(facing: float, was: int) -> int:
	var fx := cos(facing)
	var fy := sin(facing)
	var sx := fx - fy
	var sy := fx + fy
	var qi := (1 if sx < 0 else 0) + (2 if sy < 0 else 0)
	if was >= 0 and was != qi:
		var cx := -1.0 if was & 1 else 1.0
		var cy := -1.0 if was & 2 else 1.0
		var a := atan2(sy, sx) - atan2(cy, cx)
		if absf(atan2(sin(a), cos(a))) < PI / 4.0 + QUAD_HYST:
			return was
	return qi


func setup(iso_: Iso, objects_: Objects) -> void:
	iso = iso_
	objects = objects_
	y_sort_enabled = true
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	for a in GameData.table("src/war/world/alliances")["ALLIANCES"]:
		team_colors.append(Color(a["color"]))
	for t in 4:
		var m := ShaderMaterial.new()
		var sh := Shader.new()
		var dye: String = DYE[t]
		sh.code = "shader_type canvas_item;\nuniform vec4 tint : source_color;\nvarying vec4 mod;\nvoid vertex() {\n\tmod = COLOR;\n}\nvoid fragment() {\n\tvec4 t = texture(TEXTURE, UV);\n\tvec3 c = t.rgb;\n" + ("\tfloat w = %s;\n\tc = mix(c, %s, w);\n" % [RED_W, dye] if dye != "" else "") + "\tCOLOR = vec4(c * tint.rgb, t.a) * mod;\n}\n"
		m.shader = sh
		m.set_shader_parameter("tint", TEAM_TINT[t])
		_materials.append(m)
	_under = UnderLayer.new()
	_under.z_index = -1
	_under.units = self
	objects.get_parent().add_child.call_deferred(_under)
	_under.z_index = objects.z_index - 1
	_bars = BarLayer.new()
	_bars.z_index = objects.z_index + 500
	objects.get_parent().add_child.call_deferred(_bars)
	var fs := Shader.new()
	fs.code = "shader_type canvas_item;\nrender_mode blend_add;\nuniform vec4 fill : source_color;\nvarying float a;\nvoid vertex() {\n\ta = COLOR.a;\n}\nvoid fragment() {\n\tCOLOR = vec4(fill.rgb, texture(TEXTURE, UV).a * a);\n}\n"
	_flash_mat = ShaderMaterial.new()
	_flash_mat.shader = fs
	_flash_mat.set_shader_parameter("fill", FLASH_FILL)
	neutral = int(GameData.table("src/war/sim/economy")["NEUTRAL_TEAM"])


## A new snapshot (Sim.digest) at tick `tick`, with the units' Sim.view_state rows ([id, max hp, class, person id, level]).
func push(snap: Dictionary, tick: int, info: Array = []) -> void:
	_prev = _cur
	_cur = {}
	for a in snap["units"]:
		_cur[int(a[0])] = a
	for q in snap["squads"]:
		_squad_of[int(q[0])] = q
	for r in info:
		_info[int(r[0])] = r
	count = _cur.size()
	hits.diff(_cur, teams, tick, Time.get_ticks_msec())


## A man's look modulate (Look.look_color), made once and again when his class or team changes; null: no look (his
## sheet has no colour groups).
func _code(id: int, cls: String, team: int) -> Variant:
	if not Look.has_class(cls):
		return null
	var c: Array = _codes.get(id, [])
	if c.is_empty() or c[0] != cls or c[1] != team:
		var r: Array = _info.get(id, [])
		var pid: String = r[3] if not r.is_empty() else ""
		var level: float = r[4] if not r.is_empty() else 0.0
		c = [cls, team, Look.look_color(cls, team, Look.look_of(pid if pid != "" else "unit:%d" % id, cls, level))]
		_codes[id] = c
	return c[2]


## A class's sheet: {tex, fw, fh, rows: [[row, ox, oy] per quadrant], clips: {name: [n, fps, hold]}, frames: {name:
## [per row [Rect2 per frame]]}, scale}; null when it has none.
func sheet(cls: String) -> Variant:
	if _sheets.has(cls):
		return _sheets[cls]
	var dir := ViewData.DIR.path_join("sheets/" + cls)
	if not FileAccess.file_exists(dir.path_join("manifest.json")):
		_sheets[cls] = null
		return null
	var m: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(dir.path_join("manifest.json")))
	var fw := int(m["frame"]["w"])
	var fh := int(m["frame"]["h"])
	var wrap := int(m.get("wrap", 1000000000))
	var names: Array = m["rows"]
	var rows := []
	for q in QUADRANT:
		var a: Dictionary = m.get("anchors", {}).get(q, m["anchor"])
		rows.append([maxi(0, names.find(q)), float(a["x"]), float(a["y"])])
	var clips := {}
	var frames := {}
	for name in m["anims"]:
		var def = m["anims"][name]
		if def == null:
			continue
		var n := int(def["frames"])
		clips[name] = [n, float(def["fps"]), mini(int(def.get("hold", 0)), n - 1)]
		var by_row := []
		for row in names.size():
			var fr := []
			for i in n:
				var c := int(def["col"]) + i
				var band := c / wrap
				fr.append(Rect2((c % wrap) * fw, (band * names.size() + row) * fh, fw, fh))
			by_row.append(fr)
		frames[name] = by_row
	var s := {"tex": ViewData.image_texture(dir.path_join(m["image"])), "fw": fw, "fh": fh, "rows": rows, "clips": clips, "frames": frames, "scale": float(m.get("scale", SOLDIER_SCALE)) / SOLDIER_SCALE}
	_sheets[cls] = s
	return s


## A unit's tile point between the last two snapshots.
func _at(id: int, a: Array) -> Vector2:
	var p: Array = _prev.get(id, a)
	return Vector2(lerpf(p[2], a[2], alpha), lerpf(p[3], a[3], alpha))


func draw_units(view: Rect2, zoom: float, now: float) -> void:
	_frame += 1
	var pad := view.grow_individual(420, 60, 420, 720)
	var vis := []
	var alive := {}
	var near := _foes_near()
	for id in _cur:
		var a: Array = _cur[id]
		alive[id] = true
		var p := _at(id, a)
		var f := iso.feet(p.x, p.y)
		if pad.has_point(f):
			vis.append([id, a, p, f])
	anim.forget(alive)
	lod = lod_of(zoom, vis.size())
	var n := 0
	var nf := 0
	var pts := []
	var under := []
	var bars := []
	for e in vis:
		var id: int = e[0]
		var a: Array = e[1]
		var p: Vector2 = e[2]
		var f: Vector2 = e[3]
		var sq: int = a[1]
		var cls: String = classes.get(sq, "militia")
		var team: int = teams.get(sq, 0)
		var state: String = a[5]
		var sh = sheet(cls)
		if sh == null:
			sh = sheet("militia")
			cls = "militia"
		if lod == Lod.DOTS:
			under.append([f, team, 2])
			continue
		# hidden behind higher ground (a ray march, the costliest test here): again once he has moved a quarter tile
		# (a tile in a crowd) or after a second
		if state != "dead":
			var hc: Array = _hidden.get(id, [])
			if hc.is_empty() or p.distance_squared_to(hc[1]) > (1.0 if lod == Lod.CROWD else 0.0625) or _frame - hc[2] > 60:
				hc = [iso.hidden(f.x, f.y - BODY, p.x + p.y, iso.z_at(p.x, p.y)), p, _frame]
				_hidden[id] = hc
			if hc[0]:
				continue
		var qi := quadrant(a[6], _quads.get(id, -1))
		_quads[id] = qi
		var q: Array = sh["rows"][qi]
		var pk := anim.pick(id, cls, p.x, p.y, state, a[4], near.get(sq, false), sh["clips"], now)
		var rect: Rect2 = sh["frames"][pk[0]][q[0]][pk[1]]
		var sp: Sprite2D
		if n < _pool.size():
			sp = _pool[n]
		else:
			sp = Sprite2D.new()
			sp.centered = false
			sp.region_enabled = true
			_pool.append(sp)
			add_child(sp)
		n += 1
		# with the objects by x + y (units.ts and objects.ts both add 0.25 over the key); the fallen just under them
		var depth := (p.x + p.y) * Objects.DEPTH_PX - (0.5 if state == "dead" else 0.0)
		var po: Array = hits.pose(id, now) if state != "dead" else []
		var nx: float = po[1] if not po.is_empty() else 0.0
		var ny: float = po[2] if not po.is_empty() else 0.0
		sp.texture = sh["tex"]
		sp.region_rect = rect
		sp.scale = Vector2(sh["scale"], sh["scale"])
		sp.position = Vector2(roundf(f.x + nx), depth)
		sp.offset = Vector2(-q[1], (roundf(f.y + ny) - depth) / sh["scale"] - q[2])
		var code = _code(id, cls, team)
		if code != null:
			sp.material = Look.material()
			sp.self_modulate = code
		else:
			sp.material = _materials[team & 3]
			sp.self_modulate = Color.WHITE
		sp.visible = true
		if not po.is_empty() and po[0]:
			# the blow's flash: the same frame added over him in white (hits.ts flashAlpha)
			var fl: Sprite2D
			if nf < _flashes.size():
				fl = _flashes[nf]
			else:
				fl = Sprite2D.new()
				fl.centered = false
				fl.region_enabled = true
				fl.material = _flash_mat
				_flashes.append(fl)
				add_child(fl)
			nf += 1
			fl.texture = sp.texture
			fl.region_rect = rect
			fl.scale = sp.scale
			fl.position = sp.position + Vector2(0, 0.01)
			fl.offset = sp.offset - Vector2(0, 0.01 / sh["scale"])
			fl.self_modulate = Color(1, 1, 1, HitWatch.flash_alpha(sh["scale"]))
			fl.visible = true
		if state != "dead":
			var r: Array = _info.get(id, [])
			var tone := bar_of(false, a[4], r[1] if not r.is_empty() else 0.0, team, mine, neutral, alt)
			if tone != Bar.NONE:
				bars.append([f.x, f.y - BAR_ABOVE * sh["scale"], clampf(a[4] / r[1], 0.0, 1.0), tone])
			pts.append([f.x, f.y - BODY, p.x + p.y])
			pts.append([f.x, f.y - BODY / 3.0, p.x + p.y])
			under.append([f, team, 0 if lod == Lod.FULL else 1])
	for k in range(n, _pool.size()):
		_pool[k].visible = false
	for k in range(nf, _flashes.size()):
		_flashes[k].visible = false
	drawn = n
	_bars.rows = bars
	_bars.view = view
	_bars.zoom = zoom
	_bars.queue_redraw()
	objects.fade(pts)
	_under.items = under
	_under.zoom = zoom
	_under.queue_redraw()


## Squads with a foe squad within NEAR tiles (anim.ts frame: ready instead of idle).
func _foes_near() -> Dictionary:
	var acc := {}
	for id in _cur:
		var a: Array = _cur[id]
		if a[5] == "dead":
			continue
		var s: int = a[1]
		if not acc.has(s):
			acc[s] = [0.0, 0.0, 0, teams.get(s, 0)]
		acc[s][0] += a[2]
		acc[s][1] += a[3]
		acc[s][2] += 1
	var out := {}
	for s in acc:
		var c: Array = acc[s]
		for o in acc:
			var e: Array = acc[o]
			if e[3] != c[3] and Vector2(e[0] / e[2] - c[0] / c[2], e[1] / e[2] - c[1] / c[2]).length() < 12.0 + 6.0:
				out[s] = true
				break
	return out


## Shadows and team rings on the ground under every man (one canvas item, under the objects), or dots far out. The
## ellipses are baked once into textures (a ring again when the zoom changes its line width), so the layer is one
## batch of textured quads: drawn as shapes, 600 of them cost ~9 ms a frame.
class UnderLayer extends Node2D:
	const SS := 4
	var units: Units
	var items: Array = []
	var zoom := 1.0
	var _shadow: ImageTexture
	var _ring: ImageTexture
	var _ring_w := -1.0

	func _ready() -> void:
		texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		_shadow = ImageTexture.create_from_image(ellipse(13.0, 6.0, 0.0, Color(0, 0, 0, 0.28)))

	## An ellipse of radii rx, ry (px) filled, or its outline `w` px wide, supersampled SS times.
	static func ellipse(rx: float, ry: float, w: float, c: Color) -> Image:
		var W := int(ceil(rx + w)) * 2 * SS
		var H := int(ceil(ry + w)) * 2 * SS
		var img := Image.create(W, H, false, Image.FORMAT_RGBA8)
		for y in H:
			for x in W:
				var u := (x + 0.5 - W / 2.0) / SS
				var v := (y + 0.5 - H / 2.0) / SS
				var r := sqrt(u * u / (rx * rx) + v * v / (ry * ry))
				# distance to the ellipse in px, roughly (r - 1) times the radius along that direction
				var dist := (r - 1.0) * sqrt(u * u + v * v) / maxf(r, 0.0001)
				var a := clampf(0.5 - dist * SS, 0.0, 1.0) if w == 0.0 else clampf(0.5 + (w / 2.0 - absf(dist)) * SS, 0.0, 1.0)
				img.set_pixel(x, y, Color(c, c.a * a))
		return img

	func _draw() -> void:
		var w := maxf(1.5, 1.5 / zoom)
		if w != _ring_w:
			_ring_w = w
			_ring = ImageTexture.create_from_image(ellipse(15.0, 7.0, w, Color.WHITE))
		var ss := Vector2(_shadow.get_size()) / SS
		var rs := Vector2(_ring.get_size()) / SS
		for it in items:
			var f: Vector2 = it[0]
			var c: Color = units.team_colors[it[1]] if it[1] < units.team_colors.size() else Color.GRAY
			if it[2] == 2:
				draw_rect(Rect2(f - Vector2(3, 3) / zoom, Vector2(6, 6) / zoom), c)
				continue
			draw_texture_rect(_shadow, Rect2(f - ss / 2.0, ss), false)
			if it[2] == 0:
				draw_texture_rect(_ring, Rect2(f - rs / 2.0, rs), false, Color(c, 0.7))


## Health bars over the men (micro.ts bars): one canvas item over the units, snapped to screen pixels, a dark frame,
## the lost share, then the fill by tone; a little bigger zoomed in.
class BarLayer extends Node2D:
	var rows: Array = []
	var view := Rect2()
	var zoom := 1.0

	func _draw() -> void:
		if rows.is_empty():
			return
		var px := 1.0 / zoom
		var wp := roundf(Units.BAR_W * maxf(1.0, sqrt(zoom)))
		var hp := maxf(Units.BAR_H, roundf(Units.BAR_H * sqrt(zoom)))
		var w := wp * px
		var h := hp * px
		var at := []
		for r in rows:
			var x: float = view.position.x + roundf((r[0] - view.position.x) * zoom) * px - roundf(wp / 2.0) * px
			var y: float = view.position.y + roundf((r[1] - view.position.y) * zoom) * px
			at.append(Vector2(x, y))
		for p in at:
			draw_rect(Rect2(p - Vector2(px, px), Vector2(w + 2.0 * px, h + 2.0 * px)), Units.BAR_BACK)
		for p in at:
			draw_rect(Rect2(p, Vector2(w, h)), Units.BAR_LOST)
		for i in rows.size():
			var r: Array = rows[i]
			if r[2] <= 0.0:
				continue
			var c: Color = Units.BAR_GREEN if r[3] == Units.Bar.OWN else (Units.BAR_RED if r[3] == Units.Bar.FOE else Units.BAR_YELLOW)
			draw_rect(Rect2(at[i], Vector2(maxf(1.0, roundf(wp * r[2])) * px, h)), c)
