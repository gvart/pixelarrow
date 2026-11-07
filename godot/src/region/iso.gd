## True-isometric projection of a region with raised height (W-16), as src/war/view/iso.ts IsoMap draws it: tiles of
## 64 x 32 px, LH px per visual level, the ground drawn from the visual layer's 1 m cells (2 x 2 per tile) with smooth
## ramps between cells a level apart (their four corner levels, ViewData.fc).
##
##   world.x = OX + (x - y) * HW
##   world.y = OY + (x + y) * HH - z * LH
##
## The cell levels and corners come from the TS IsoMap (ViewData), so the surface here is the Phaser client's exactly.
class_name Iso
extends RefCounted

const HW := 32.0
const HH := 16.0
## Px per visual level (W-52 amendment).
const LH := 32.0
## Px of the art's own riser (a fine frame's side, the cliff strips' pitch).
const SIDE := 16.0
## The slab's underside: off the map.
const ZBASE := -1.5

var w: int
var h: int
var fw: int
var fh: int
var ox: float
var oy: float
## Highest surface level, and the highest ground level.
var top: float
var ground_top: float
var fz: PackedFloat32Array
var fc: PackedFloat32Array
var ramp: PackedByteArray
var zu: PackedFloat32Array
var zh: PackedFloat32Array
var zm: PackedFloat32Array


static func of(d: ViewData) -> Iso:
	var m := d.meta
	return make(int(m["w"]), int(m["h"]), float(m["OX"]), float(m["OY"]), float(m["top"]), float(m["groundTop"]), d.fz, d.fc, d.ramp, d.zu, d.zh, d.zm)


static func make(w_: int, h_: int, ox_: float, oy_: float, top_: float, ground_top_: float, fz_: PackedFloat32Array, fc_: PackedFloat32Array, ramp_: PackedByteArray, zu_: PackedFloat32Array, zh_: PackedFloat32Array, zm_: PackedFloat32Array) -> Iso:
	var s := Iso.new()
	s.w = w_
	s.h = h_
	s.fw = 2 * w_
	s.fh = 2 * h_
	s.ox = ox_
	s.oy = oy_
	s.top = top_
	s.ground_top = ground_top_
	s.fz = fz_
	s.fc = fc_
	s.ramp = ramp_
	s.zu = zu_
	s.zh = zh_
	s.zm = zm_
	return s


func sx(x: float, y: float) -> float:
	return ox + (x - y) * HW


func sy(x: float, y: float, z: float) -> float:
	return oy + (x + y) * HH - z * LH


## World px of a tile point on level z.
func world(x: float, y: float, z: float) -> Vector2:
	return Vector2(ox + (x - y) * HW, oy + (x + y) * HH - z * LH)


## Surface level of the visual cell at integer (cx, cy); ZBASE off the map.
func zf(cx: int, cy: int) -> float:
	return ZBASE if cx < 0 or cy < 0 or cx >= fw or cy >= fh else fz[cy * fw + cx]


## Drawn top level of tile (x, y) (its highest visual cell); ZBASE off the map.
func ztop(x: int, y: int) -> float:
	return ZBASE if x < 0 or y < 0 or x >= w or y >= h else zh[y * w + x]


## The visual surface level under a fractional tile point: flat on a cell, or on a ramp cell linear over each half of its
## diamond (split along its W-E diagonal, as the painter warps it); ZBASE off the map.
func z_at(x: float, y: float) -> float:
	var X := 2.0 * x
	var Y := 2.0 * y
	var cx := floori(X)
	var cy := floori(Y)
	if cx < 0 or cy < 0 or cx >= fw or cy >= fh:
		return ZBASE
	var j := cy * fw + cx
	if ramp[j] == 0:
		return fz[j]
	var a := X - cx
	var b := Y - cy
	var k := 4 * j
	if a + b <= 1.0:
		return fc[k] + a * (fc[k + 1] - fc[k]) + b * (fc[k + 3] - fc[k])
	return fc[k + 2] + (1.0 - a) * (fc[k + 3] - fc[k + 2]) + (1.0 - b) * (fc[k + 1] - fc[k + 2])


## Level a unit is drawn at: the ground under him, kept within a level of his tile's drawn relief.
func z_draw(x: float, y: float) -> float:
	var tx := floori(x)
	var ty := floori(y)
	if tx < 0 or ty < 0 or tx >= w or ty >= h:
		return ZBASE
	var i := ty * w + tx
	return maxf(zu[i] - 1.0, minf(zh[i] + 1.0, z_at(x, y)))


## World px of a unit's feet at tile point (x, y).
func feet(x: float, y: float) -> Vector2:
	return world(x, y, z_draw(x, y))


## World px -> the tile point on the front-most surface under it (a cliff face picks the tile on top of it). Off the
## map: the point on the base plane, clamped to the map.
func pick(wx: float, wy: float) -> Vector2:
	var u := (wx - ox) / HW
	var z := top
	while z >= ZBASE:
		var v := (wy - oy + z * LH) / HH
		var x := (u + v) / 2.0
		var y := (v - u) / 2.0
		if x >= 0.0 and y >= 0.0 and x < w and y < h and zm[int(y) * w + int(x)] >= z - 1e-4 and z_at(x, y) >= z - 1e-4:
			return Vector2(x, y)
		z -= 2.0 / LH
	var v0 := (wy - oy) / HH
	return Vector2(clampf((u + v0) / 2.0, 0.0, w - 0.01), clampf((v0 - u) / 2.0, 0.0, h - 0.01))


## Is the world point (wx, wy), standing at x + y = v0 and level z0, hidden by ground in front of it?
func hidden(wx: float, wy: float, v0: float, z0: float) -> bool:
	var u := (wx - ox) / HW
	var z := top
	while z > z0:
		var v := (wy - oy + z * LH) / HH
		if v <= v0 + 0.25:
			return false
		var x := (u + v) / 2.0
		var y := (v - u) / 2.0
		if x >= 0.0 and y >= 0.0 and x < w and y < h and zm[int(y) * w + int(x)] >= z and z_at(x, y) >= z:
			return true
		z -= (8.0 if z > ground_top else 4.0) / LH
	return false
