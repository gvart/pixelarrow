## Map objects (trees, rocks, ruins, towers) as live sprites, depth sorted with the units by x + y of their foot point
## (src/war/view/objects.ts): this node y-sorts its children, each placed at its depth key's px (DEPTH_PX per unit of
## x + y) and drawn at its true place by its offset. Sprites come from a pool over the camera's view, refilled when the
## view moves past a margin. A tree with a man behind its crown fades so he shows (objects.ts FADE). Animals (a def's
## `idle` strip, frame 0 the still sprite) play their idle loop, each at its own phase and speed so a herd is not in step.
class_name Objects
extends Node2D

## Px of y-sort position per unit of depth (x + y).
const DEPTH_PX := 64.0
const BUCKET := 16
const FADE := 0.15
## Re-pool when the view leaves the pooled rect, which reaches this far round it (px at zoom 1).
const MARGIN := 384.0

var iso: Iso
## def id -> {def, tex, mask, mw, mh, fades, idle: [strip texture, frames, w, h, anchor x, anchor y, fps] or []}
var defs := {}
## Per object: [def id, sx, sy, depth, idle phase (frames), idle speed]
var objs: Array = []
var buckets: Array = []
var bw: int
var bh: int
var _pool: Array[Sprite2D] = []
var _shown: Array = []  # [sprite, object index]
var _pooled := Rect2()
var _zoom := -1.0
var count := 0
## Shown animals: [sprite, object index].
var _anim: Array = []


## objects.ts hash: 0..1 from a point (an animal's phase and speed).
static func hash01(x: float, y: float) -> float:
	var v := sin(x * 127.1 + y * 311.7) * 43758.5453
	return v - floorf(v)


## The idle frame an animal of phase ph, speed sp shows `t` seconds in, on a strip of n frames at fps.
static func idle_frame(ph: float, sp: float, t: float, fps: float, n: int) -> int:
	return floori(ph + t * fps * sp) % n


func setup(region: Region, iso_: Iso) -> void:
	iso = iso_
	y_sort_enabled = true
	var all: Array = JSON.parse_string(FileAccess.get_file_as_string(ViewData.DIR.path_join("objects.json")))
	for d in all:
		var img := Image.load_from_file(ProjectSettings.globalize_path(ViewData.DIR.path_join("objects/%s.png" % d["id"])))
		# coarse alpha mask (4 px cells), for the fade over units behind a crown
		var mw := ceili(img.get_width() / 4.0)
		var mh := ceili(img.get_height() / 4.0)
		var mask := PackedByteArray()
		mask.resize(mw * mh)
		for y in range(0, img.get_height(), 2):
			for x in range(0, img.get_width(), 2):
				if img.get_pixel(x, y).a > 0.5:
					mask[(y / 4) * mw + x / 4] = 1
		var idle := []
		var ip := ViewData.DIR.path_join("objects/%s-idle.png" % d["id"])
		if d.has("idle") and FileAccess.file_exists(ip):
			var i: Dictionary = d["idle"]
			idle = [ViewData.image_texture(ip), int(i["frames"]), float(i["w"]), float(i["h"]), float(i["anchor"]["x"]), float(i["anchor"]["y"]), float(i.get("fps", 5))]
		defs[d["id"]] = {"def": d, "tex": ImageTexture.create_from_image(img), "mask": mask, "mw": mw, "mh": mh, "fades": d["kind"] == "tree", "idle": idle}
	bw = ceili(region.w / float(BUCKET))
	bh = ceili(region.h / float(BUCKET))
	buckets.resize(bw * bh)
	for k in buckets.size():
		buckets[k] = []
	var list: Array = region.meta.get("objects", [])
	for o in list:
		var def: Dictionary = defs.get(o["id"], {})
		if def.is_empty() or def["def"]["kind"] == "massif":
			continue
		var x: float = o["x"]
		var y: float = o["y"]
		var tx := floori(x)
		var ty := floori(y)
		if tx < 0 or ty < 0 or tx >= region.w or ty >= region.h:
			continue
		buckets[(ty / BUCKET) * bw + tx / BUCKET].append(objs.size())
		objs.append([o["id"], roundf(iso.sx(x, y)), roundf(iso.sy(x, y, iso.z_at(x, y))), x + y + objs.size() * 1e-8, hash01(x, y) * 64.0, 0.8 + 0.4 * hash01(y, x)])


## Fill the pool over `view` (when it left the pooled rect or the zoom changed).
func update_view(view: Rect2, zoom: float) -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST if zoom >= 1.0 else CanvasItem.TEXTURE_FILTER_LINEAR
	_animate(Time.get_ticks_msec() / 1000.0)
	if zoom == _zoom and _pooled.encloses(view):
		return
	_zoom = zoom
	_pooled = view.grow(MARGIN / zoom)
	var r := _pooled
	var n := 0
	_shown.clear()
	_anim.clear()
	# tile bounds (objects reach ~400 px above their foot, the ground up to iso.top levels)
	var u0 := (r.position.x - iso.ox) / 32.0 - 6.0
	var u1 := (r.end.x - iso.ox) / 32.0 + 6.0
	var v0 := (r.position.y - iso.oy) / Iso.HH - 2.0
	var v1 := (r.end.y - iso.oy) / Iso.HH + iso.top * Iso.LH / Iso.HH + 26.0
	var bx0 := maxi(0, floori((u0 + v0) / 2.0 / BUCKET))
	var bx1 := mini(bw - 1, floori((u1 + v1) / 2.0 / BUCKET))
	var by0 := maxi(0, floori((v0 - u1) / 2.0 / BUCKET))
	var by1 := mini(bh - 1, floori((v1 - u0) / 2.0 / BUCKET))
	for by in range(by0, by1 + 1):
		for bx in range(bx0, bx1 + 1):
			for oi in buckets[by * bw + bx]:
				var o: Array = objs[oi]
				var def: Dictionary = defs[o[0]]["def"]
				var ox: float = o[1] - def["anchor"]["x"]
				var oy: float = o[2] - def["anchor"]["y"]
				if ox > r.end.x or ox + def["w"] < r.position.x or oy > r.end.y or oy + def["h"] < r.position.y:
					continue
				var sp: Sprite2D
				if n < _pool.size():
					sp = _pool[n]
				else:
					sp = Sprite2D.new()
					sp.centered = false
					_pool.append(sp)
					add_child(sp)
				n += 1
				var dy: float = o[3] * DEPTH_PX
				sp.texture = defs[o[0]]["tex"]
				sp.position = Vector2(o[1], dy)
				sp.offset = Vector2(-def["anchor"]["x"], o[2] - dy - def["anchor"]["y"])
				sp.modulate.a = 1.0
				sp.visible = true
				sp.region_enabled = false
				_shown.append([sp, oi])
				var idle: Array = defs[o[0]]["idle"]
				if not idle.is_empty():
					sp.texture = idle[0]
					sp.region_enabled = true
					sp.offset = Vector2(-idle[4], o[2] - dy - idle[5])
					_anim.append([sp, oi])
	for k in range(n, _pool.size()):
		_pool[k].visible = false
	count = n
	_animate(Time.get_ticks_msec() / 1000.0)


## The animals' idle frames at `t` seconds.
func _animate(t: float) -> void:
	for a in _anim:
		var o: Array = objs[a[1]]
		var idle: Array = defs[o[0]]["idle"]
		var f := idle_frame(o[4], o[5], t, idle[6], idle[1])
		a[0].region_rect = Rect2(f * idle[2], 0, idle[2], idle[3])


## Fade the trees over units behind their crowns: `pts` the units' [screen x, middle y, depth] (dead men left out).
func fade(pts: Array) -> void:
	if pts.is_empty() and _shown.is_empty():
		return
	var cells := {}
	for p in pts:
		var k := int(floorf(p[0] / 64.0)) * 65536 + int(floorf(p[1] / 64.0))
		if not cells.has(k):
			cells[k] = []
		cells[k].append(p)
	for s in _shown:
		var sp: Sprite2D = s[0]
		var o: Array = objs[s[1]]
		var info: Dictionary = defs[o[0]]
		if not info["fades"]:
			continue
		var def: Dictionary = info["def"]
		var ox: float = o[1] - def["anchor"]["x"]
		var oy: float = o[2] - def["anchor"]["y"]
		var covers := false
		for cx in range(floori(ox / 64.0), floori((ox + def["w"]) / 64.0) + 1):
			for cy in range(floori(oy / 64.0), floori((oy + def["h"]) / 64.0) + 1):
				for p in cells.get(cx * 65536 + cy, []):
					if p[2] >= o[3]:
						continue
					var mx := int((p[0] - ox) / 4.0)
					var my := int((p[1] - oy) / 4.0)
					if mx >= 0 and my >= 0 and mx < info["mw"] and my < info["mh"] and info["mask"][my * info["mw"] + mx]:
						covers = true
		var target := FADE if covers else 1.0
		var a := sp.modulate.a + (target - sp.modulate.a) * 0.25
		sp.modulate.a = target if absf(a - target) < 0.02 else a
