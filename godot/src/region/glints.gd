## Glints on open water (src/war/view/water.ts WaterGlints): a sparse set of water cells (about one in GAP, two cells
## clear of the shore every way) each flash a short warm streak now and then, out of phase, so the sea and the rivers
## shimmer. Additive, over the ground and under the objects; only the cells in view in their bright moment, at most MAX
## a frame, none far out (zoom under 1/4). Falls are not drawn yet.
class_name Glints
extends Node2D

const GAP := 9
const MAX := 260
const BUCKET := 32

## Per bucket: glint world x, y and phase, flat triples.
var buckets: Array = []
var bw := 0
var bh := 0
var iso: Iso
var _tex: ImageTexture
var _items: Array = []
var _zoom := 1.0


## The glint cells of view data d (water.ts constructor): [world x, y, phase] each.
static func cells(d: ViewData, iso_: Iso) -> Array:
	var kinds: Array = d.meta["kinds"]
	var sh := kinds.find("shallow")
	var dp := kinds.find("deep")
	var fw := d.fw
	var fh := d.fh
	var wet := func(x: int, y: int) -> bool:
		if x < 0 or y < 0 or x >= fw or y >= fh:
			return false
		var k := d.fk[y * fw + x]
		return k == sh or k == dp
	var out := []
	for y in fh:
		for x in fw:
			if GroundMesh.hash3(x, y, 21) % GAP or not wet.call(x, y) or not wet.call(x - 2, y) or not wet.call(x + 2, y) or not wet.call(x, y - 2) or not wet.call(x, y + 2):
				continue
			var wx := iso_.ox + (x - y + 0.5 * float(GroundMesh.hash3(x, y, 22) & 15) / 15.0) * 16.0
			var wy := iso_.oy + (x + y + 1) * 8.0 - d.fz[y * fw + x] * Iso.LH
			out.append([wx, wy, float(GroundMesh.hash3(x, y, 23) & 1023) / 1023.0 * PI * 2.0, x, y])
	return out


## The glint's alpha at view time `now` ms for phase ph (0: dark this frame).
static func alpha_at(now: float, ph: float) -> float:
	var t := now * 0.0011
	var a := sin(t + ph * 3.1) * sin(t * 0.37 + ph)
	return 0.0 if a < 0.55 else (a - 0.55) * 1.6


func setup(d: ViewData, iso_: Iso) -> void:
	iso = iso_
	bw = ceili(d.fw / float(BUCKET))
	bh = ceili(d.fh / float(BUCKET))
	buckets.resize(bw * bh)
	for k in buckets.size():
		buckets[k] = PackedFloat32Array()
	for c in cells(d, iso_):
		var k: int = (c[4] / BUCKET) * bw + c[3] / BUCKET
		buckets[k].append_array(PackedFloat32Array([c[0], c[1], c[2]]))
	# water.ts war-glint: a 12 x 3 warm streak, bright in its middle, a fainter row over and under its centre
	var img := Image.create(12, 3, false, Image.FORMAT_RGBA8)
	for x in 12:
		var a := 1.0 - absf((x + 0.5) - 6.0) / 6.0
		img.set_pixel(x, 1, Color8(255, 248, 220, roundi(255 * a)))
		if x >= 3 and x < 9:
			img.set_pixel(x, 0, Color8(255, 248, 220, roundi(255 * 0.35)))
			img.set_pixel(x, 2, Color8(255, 248, 220, roundi(255 * 0.35)))
	_tex = ImageTexture.create_from_image(img)
	var m := CanvasItemMaterial.new()
	m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	material = m
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR


func draw_glints(view: Rect2, zoom: float, now: float) -> void:
	_items.clear()
	_zoom = zoom
	if zoom >= 0.25:
		var u0 := (view.position.x - iso.ox) / 16.0 - 2.0
		var u1 := (view.end.x - iso.ox) / 16.0 + 2.0
		var v0 := (view.position.y - iso.oy) / 8.0 - 2.0
		var v1 := (view.end.y - iso.oy) / 8.0 + iso.top * Iso.LH / 8.0 + 2.0
		var bx0 := maxi(0, floori((u0 + v0) / 2.0 / BUCKET))
		var bx1 := mini(bw - 1, floori((u1 + v1) / 2.0 / BUCKET))
		var by0 := maxi(0, floori((v0 - u1) / 2.0 / BUCKET))
		var by1 := mini(bh - 1, floori((v1 - u0) / 2.0 / BUCKET))
		var t := now * 0.0011
		for by in range(by0, by1 + 1):
			for bx in range(bx0, bx1 + 1):
				var b: PackedFloat32Array = buckets[by * bw + bx]
				for k in range(0, b.size(), 3):
					if _items.size() >= MAX:
						break
					if not view.has_point(Vector2(b[k], b[k + 1])):
						continue
					var a := alpha_at(now, b[k + 2])
					if a <= 0.0:
						continue
					_items.append([b[k], b[k + 1] + sin(t * 2.0 + b[k + 2]) * 1.5, a])
	queue_redraw()


func _draw() -> void:
	var s := maxf(1.0, 0.6 / _zoom)
	var size := Vector2(12.0 * s, 3.0 * maxf(1.0, s * 0.6))
	for it in _items:
		draw_texture_rect(_tex, Rect2(Vector2(it[0], it[1]) - size / 2.0, size), false, Color(1, 1, 1, it[2]))
