## Where every docked HUD panel sits, so no two of them meet: the DOM HUD's solver (src/war/view/hud/layout.ts solve)
## for the zones the core loop uses, in art px:
##
##   tl  top left, a column down from under the top bar (the guide or quest card; the minimap on a tall phone)
##   tc  top centre, under the bar's plaque: the notices
##   tr  top right (the dock on a tall phone)
##   bl  bottom left, up from the corner: the minimap
##   bc  bottom centre, up from the edge: the command card, the build bar; one column on one centre line that moves
##       sideways as a whole to clear the bottom corners, a panel still in the way lifted over them
##   br  bottom right: the dock
##
## A zone stacks its panels with GAP between; a top column that runs out of room shrinks its shrinkable panels (`min`)
## and then leaves the last ones out (`off`). Pure: tests/hud/test_hud_layout.gd checks it at every window size.
class_name HudLayout
extends RefCounted

const GAP := 6.0
const EDGE := 4.0


## Place the stacks in a frame `f` (art px). st: zone -> [{id, w, h, min?}] in stacking order (top-down for the top
## zones, bottom-up for the bottom ones); `top`: the side columns' start (under the bar), `top_c`: the centre's.
## Returns id -> {rect: Rect2, off: bool}.
static func solve(f: Vector2, st: Dictionary, top: float, top_c: float) -> Dictionary:
	var out := {}
	var shown := func(zs: Array) -> Array:
		var r := []
		for z in zs:
			for b in st.get(z, []):
				var p: Dictionary = out.get(b["id"], {})
				if not p.is_empty() and not p["off"]:
					r.append(p["rect"])
		return r
	var meets := func(a0: float, a1: float, b0: float, b1: float) -> bool: return a0 < b1 and b0 < a1
	var place := func(id: String, r: Rect2, off := false) -> void: out[id] = {"rect": r, "off": off}
	# bottom-up from `base`, x by `xs`; each panel lifted over the rects of `clear` it would meet
	var up := func(list: Array, base: float, xs: Callable, clear: Array) -> float:
		var cur := base
		for b in list:
			var x: float = xs.call(b, b["w"])
			var y: float = cur - b["h"]
			for p: Rect2 in clear:
				if meets.call(x, x + b["w"], p.position.x, p.end.x) and meets.call(y, y + b["h"], p.position.y - GAP, p.end.y + GAP):
					y = minf(y, p.position.y - GAP - b["h"])
			place.call(b["id"], Rect2(x, y, b["w"], b["h"]))
			cur = y - GAP
		return cur + GAP
	# top-down from `y0` to `limit`: shrinkables give height first, then what still does not fit stays out
	var down := func(list: Array, y0: float, limit: float, xs: Callable, cap: float) -> float:
		var hs := []
		for b in list:
			hs.append(float(b["h"]))
		var over: float = -(limit - y0 - GAP * maxi(0, list.size() - 1))
		for h in hs:
			over += h
		for i in range(list.size() - 1, -1, -1):
			if over <= 0:
				break
			var m = list[i].get("min")
			if m == null or hs[i] <= m:
				continue
			var give := minf(over, hs[i] - m)
			hs[i] -= give
			over -= give
		var y := y0
		for i in list.size():
			var b: Dictionary = list[i]
			var w := minf(b["w"], cap)
			if y + hs[i] > limit + 1e-6:
				place.call(b["id"], Rect2(0, 0, b["w"], b["h"]), true)
				continue
			place.call(b["id"], Rect2(xs.call(b, w), y, w, hs[i]))
			y += hs[i] + GAP
		return y - GAP
	var left := func(_b: Dictionary, _w: float) -> float: return EDGE
	var right := func(b: Dictionary, _w: float) -> float: return f.x - EDGE - b["w"]
	var centre := func(b: Dictionary) -> float: return (f.x - b["w"]) / 2.0

	up.call(st.get("br", []), f.y - EDGE, right, [])
	up.call(st.get("bl", []), f.y - EDGE, left, [])
	# the bottom centre: one column on one centre line, moved sideways as a whole to clear the corners
	var need := 0.0
	var room := INF
	var cy := f.y - EDGE
	var corners: Array = shown.call(["bl", "br"])
	for b in st.get("bc", []):
		var x0: float = centre.call(b)
		var y0: float = cy - b["h"]
		cy = y0 - GAP
		for p: Rect2 in corners:
			if not meets.call(y0, y0 + b["h"], p.position.y - GAP, p.end.y + GAP):
				continue
			if p.position.x + p.size.x / 2.0 < f.x / 2.0:
				need = maxf(need, p.end.x + GAP - x0)
			else:
				room = minf(room, p.position.x - GAP - x0 - b["w"])
	var shift := maxf(0.0, minf(need, room))
	var bc_top: float = up.call(st.get("bc", []), f.y - EDGE, func(b: Dictionary, _w: float) -> float: return centre.call(b) + shift, corners)
	var floor_of := func(x0: float, x1: float, zs: Array) -> float:
		var y := f.y - EDGE
		for p: Rect2 in shown.call(zs):
			if meets.call(x0, x1, p.position.x, p.end.x):
				y = minf(y, p.position.y)
		return y
	var widest := func(list: Array) -> float:
		var w := 0.0
		for b in list:
			w = maxf(w, b["w"])
		return w
	var tr_w: float = widest.call(st.get("tr", []))
	down.call(st.get("tr", []), top, floor_of.call(f.x - EDGE - tr_w, f.x - EDGE, ["br", "bc"]) - GAP, right, INF)
	var tl_w: float = widest.call(st.get("tl", []))
	down.call(st.get("tl", []), top, floor_of.call(EDGE, EDGE + tl_w, ["bl", "bc"]) - GAP, left, INF)
	# the centre: as wide as the gap between the side columns where it runs
	var tc: Array = st.get("tc", [])
	if not tc.is_empty():
		var hsum := 0.0
		for b in tc:
			hsum += b["h"] + GAP
		var l0 := 0.0
		var r0 := f.x
		for p: Rect2 in shown.call(["tl", "tr", "bl", "br"]):
			if not meets.call(top_c, top_c + hsum, p.position.y, p.end.y):
				continue
			if p.position.x + p.size.x / 2.0 < f.x / 2.0:
				l0 = maxf(l0, p.end.x)
			else:
				r0 = minf(r0, p.position.x)
		down.call(tc, top_c, bc_top - GAP, func(_b: Dictionary, w: float) -> float: return maxf(l0 + GAP, minf((f.x - w) / 2.0, r0 - GAP - w)), maxf(0.0, r0 - l0 - 2 * GAP))
	return out


## Every pair of placed rects that meet (ids), for the tests and a debug check; [] when the layout is clean.
static func overlaps(placed: Dictionary, extra: Dictionary = {}) -> Array:
	var all := {}
	for id in placed:
		if not placed[id]["off"]:
			all[id] = placed[id]["rect"]
	for id in extra:
		all[id] = extra[id]
	var ids := all.keys()
	var out := []
	for i in ids.size():
		for j in range(i + 1, ids.size()):
			var a: Rect2 = all[ids[i]]
			var b: Rect2 = all[ids[j]]
			if a.intersects(b):
				out.append([ids[i], ids[j]])
	return out
