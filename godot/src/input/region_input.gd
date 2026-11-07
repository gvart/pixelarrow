## Mouse, keyboard and touch on a live region, as the Phaser client has them (src/war/view/select.ts, interact.ts,
## src/war/input/actions.ts): every order goes out through the WarClient as a protocol message.
##
##   left click / tap         his man: his squad (double: that man alone; shift adds); ground: clears; an armed
##                            order (move, attack, attack-move) or the build tool acts there instead
##   left drag / hold + drag  a box round his men (shift adds)
##   right click / E / tap    the context action for the selected men at the cursor: a foe's squad: attack; his
##   with men selected        unfinished site: build; a resource: gather; else move (Ctrl: attack-move)
##   H / X / F / Alt+1-4      hold, stop, the squad's active, formations; Ctrl+A all; 1-9 groups (Ctrl stores)
##   B / R / Esc              build mode, rotate the piece, back (the tool, the armed order, then the selection)
##   camera                   WASD and arrows, the screen's edge, middle drag or Space + drag, wheel (to the
##                            cursor); touch: one finger drags, two pinch
class_name RegionInput
extends Node

signal changed
## A plain-words line for the player ("Not your ground"), from what the input could not do.
signal said(text: String, icon: String)

## Zoom steps (camera zoom = step x the screen's density).
const LADDER := [0.5, 0.75, 1.0, 1.5, 2.0, 3.0]
const PAN := 900.0
const EDGE_PX := 6.0
const BOX_MIN := 6.0
## Tiles round a resource node that pick it.
const NODE_PICK := 1.6
const SHAPES := ["line", "column", "wedge", "loose"]

var view: RegionView
var client: WarClient
var sel := Selection.new()
var touch := TouchGestures.new()
## The armed order ("" none, "move", "attack", "attackMove"): the next left click gives it.
var armed := ""
## The build tool (a building type, "" none) and its rotation; build mode shows the bar.
var build_mode := false
var tool := ""
var rot := 0
## The ghost's place (tiles) and its check id / answer.
var ghost := Vector2(-1, -1)
var _ghost_check := -1
var ghost_ok := false
var ghost_why := ""
## A box being drawn (screen px; size 0: none).
var box := Rect2()
var density := 1.0
## The build ghost follows the mouse (off: it stays where it was put, for a shot of the tool).
var follow_mouse := true
## Scroll at the window's edge (off for shots: the pointer may rest there).
var edge_scroll := true
var zoom_step := 2
## Set by the HUD: is the pointer over a panel now (no edge scroll, no map hover then).
var over_hud := Callable()
var _press := Vector2(-1, -1)
var _press_shift := false
var _drag_pan := false
var _rings: Rings
var _ghost_layer: Ghost
var _marks := []
var _last_shape := ""


func setup(view_: RegionView, client_: WarClient, density_: float) -> void:
	view = view_
	client = client_
	density = density_
	_rings = Rings.new()
	_rings.owner_ = self
	_rings.z_index = 600
	view.add_child(_rings)
	_ghost_layer = Ghost.new()
	_ghost_layer.owner_ = self
	_ghost_layer.z_index = 1900
	view.add_child(_ghost_layer)
	client.frame.connect(_on_frame)
	client.message.connect(_on_message)
	set_zoom(zoom_step, Vector2.INF)


func _on_frame(snap: Dictionary) -> void:
	sel.sync(snap, client.owner_name())
	changed.emit()


func _on_message(m: Dictionary) -> void:
	if m.get("t") == "checked" and int(m["id"]) == _ghost_check:
		_checked(m["result"])


## The room's answer for the ghost's spot (a local room answers at once, inside the check's send).
func _checked(r: Variant) -> void:
	ghost_ok = r is Dictionary and bool(r.get("ok", false))
	ghost_why = "" if ghost_ok or not (r is Dictionary) else String(r.get("reason", ""))
	changed.emit()


# ---- where things are ----

func mouse_world() -> Vector2:
	return screen_to_world(view.get_viewport().get_mouse_position())


## Screen px <-> world px by the camera as it stands now (its centre and zoom; set this frame, not the last frame's
## canvas transform, so a focus and a pick in the same frame agree).
func screen_to_world(p: Vector2) -> Vector2:
	var cam := view.cam
	return cam.position + (p - view.get_viewport().get_visible_rect().size / 2.0) / cam.zoom


func world_to_screen(w: Vector2) -> Vector2:
	var cam := view.cam
	return (w - cam.position) * cam.zoom + view.get_viewport().get_visible_rect().size / 2.0


func tile_at_screen(p: Vector2) -> Vector2:
	var w := screen_to_world(p)
	return view.iso.pick(w.x, w.y)


## The unit under screen point p (his own when `own`, else any), front-most; {} none.
func unit_at(p: Vector2, own: bool) -> Dictionary:
	var w := screen_to_world(p)
	var best := {}
	var best_y := -INF
	var squads := {}
	for q in client.snap.get("squads", []):
		squads[int(q["id"])] = q
	for u in client.snap.get("units", []):
		if u["state"] == "dead":
			continue
		var q: Dictionary = squads.get(int(u["squad"]), {})
		if own != client.is_mine(q):
			continue
		var f := view.iso.feet(u["x"], u["y"])
		if absf(w.x - f.x) < 9.0 and w.y > f.y - 30.0 and w.y < f.y + 5.0 and f.y > best_y:
			best = u
			best_y = f.y
	return best


func squad_of(u: Dictionary) -> Dictionary:
	for q in client.snap.get("squads", []):
		if int(q["id"]) == int(u["squad"]):
			return q
	return {}


## Is team `t` a foe of his (not his alliance, not an ally's)?
func is_foe(q: Dictionary) -> bool:
	return not q.is_empty() and int(q["team"]) != client.team() and not client.allies.has(_pid_of(q))


static func _pid_of(q: Dictionary) -> int:
	var o := String(q.get("owner", ""))
	return int(o.substr(2)) if o.begins_with("p:") else -1


func building_at(t: Vector2) -> Dictionary:
	for b in client.snap.get("buildings", []):
		if absf(t.x - float(b["x"])) <= float(b["w"]) / 2.0 and absf(t.y - float(b["y"])) <= float(b["h"]) / 2.0:
			return b
	return {}


func node_at(t: Vector2) -> Dictionary:
	var best := {}
	var bd := NODE_PICK
	for n in client.nodes.values():
		var d := t.distance_to(Vector2(n["x"], n["y"]))
		if d < bd:
			bd = d
			best = n
	return best


# ---- orders ----

func send(o: Dictionary) -> void:
	client.order(sel.address(o))


## The context action at screen point p for the selection: [label, order] ([] none). ctrl: attack-move on ground.
func context_at(p: Vector2, ctrl: bool) -> Array:
	var lead := sel.lead()
	if lead < 0:
		return []
	var foe := unit_at(p, false)
	if not foe.is_empty():
		var q := squad_of(foe)
		if is_foe(q):
			return ["Attack", {"kind": "attack", "squad": lead, "target": int(q["id"])}]
	var t := tile_at_screen(p)
	var b := building_at(t)
	if not b.is_empty() and int(b["team"]) == client.team() and b["state"] == "building":
		return ["Build", {"kind": "build", "squad": lead, "site": int(b["id"])}]
	var n := node_at(t)
	if not n.is_empty() and not n.has("guarded"):
		return ["Gather", {"kind": "gather", "squad": lead, "node": int(n["id"])}]
	if ctrl:
		return ["Attack-move", {"kind": "attackMove", "squad": lead, "x": t.x, "y": t.y}]
	return ["Move", {"kind": "move", "squad": lead, "x": t.x, "y": t.y}]


func act_at(p: Vector2, ctrl: bool) -> void:
	var c := context_at(p, ctrl)
	if c.is_empty():
		return
	send(c[1])
	var t := tile_at_screen(p)
	mark(t, Color(0.55, 0.85, 0.4) if c[0] != "Attack" else Color(0.92, 0.4, 0.3))


## A fading ring where an order went.
func mark(t: Vector2, c: Color) -> void:
	_marks.append([t, c, Time.get_ticks_msec()])


func hold() -> void:
	for q in sel.squads():
		send({"kind": "hold", "squad": q})


func stop() -> void:
	for q in sel.squads():
		send({"kind": "stop", "squad": q})


func formation(shape: String) -> void:
	var ld := sel.lead()
	if ld >= 0:
		send({"kind": "formation", "squad": ld, "shape": shape})
		_last_shape = shape


func last_shape() -> String:
	return _last_shape


func active() -> void:
	var ld := sel.lead()
	if ld >= 0:
		send({"kind": "active", "squad": ld})


## Arm an order for the next left click ("" disarms).
func arm(kind: String) -> void:
	armed = "" if armed == kind else kind
	changed.emit()


func select_all() -> void:
	sel.set_ids(sel.live.keys())
	changed.emit()


func select_squad(q: int) -> void:
	var ids := []
	for id in sel.live:
		if int(sel.live[id]["squad"]) == q:
			ids.append(id)
	sel.set_ids(ids)
	changed.emit()


func set_build_mode(on: bool) -> void:
	build_mode = on
	if not on:
		set_tool("")
	changed.emit()


func set_tool(type: String) -> void:
	tool = type
	rot = 0
	ghost = Vector2(-1, -1)
	ghost_ok = false
	ghost_why = ""
	if type != "":
		build_mode = true
		armed = ""
	changed.emit()


## The tile centre a building of `type` snaps to round tile point t (odd sides on a tile's centre, even on its corner).
static func snap_site(t: Vector2, w: int, h: int) -> Vector2:
	return Vector2(floorf(t.x) + 0.5 if w % 2 else roundf(t.x), floorf(t.y) + 0.5 if h % 2 else roundf(t.y))


func _footprint(type: String) -> Vector2i:
	var d: Dictionary = GameData.table("src/war/sim/economy")["BUILDINGS"].get(type, {"w": 2, "h": 2})
	var w := int(d["w"])
	var h := int(d["h"])
	return Vector2i(h, w) if rot == 1 else Vector2i(w, h)


func _ghost_follow(p: Vector2) -> void:
	var fp := _footprint(tool)
	var at := snap_site(tile_at_screen(p), fp.x, fp.y)
	if at == ghost:
		return
	ghost = at
	ghost_ok = false
	_ghost_check = client.check({"kind": "building", "type": tool, "x": at.x, "y": at.y, "rot": rot})
	if client.checked.has(_ghost_check):
		_checked(client.checked[_ghost_check])


func _place() -> void:
	if ghost.x < 0:
		return
	var o := {"kind": "placeBuilding", "type": tool, "x": ghost.x, "y": ghost.y, "rot": rot}
	var ld := sel.lead()
	if ld >= 0:
		o["squad"] = ld
		client.order(sel.address(o))
	else:
		client.order(o)
	mark(ghost, Color(0.95, 0.8, 0.4))


## Esc: the tool, the armed order, build mode, then the selection.
func back() -> void:
	if tool != "":
		set_tool("")
	elif armed != "":
		armed = ""
	elif build_mode:
		build_mode = false
	else:
		sel.clear()
	changed.emit()


# ---- camera ----

func set_zoom(step: int, at: Vector2) -> void:
	zoom_step = clampi(step, 0, LADDER.size() - 1)
	var z: float = LADDER[zoom_step] * density
	var cam := view.cam
	if at == Vector2.INF:
		cam.zoom = Vector2(z, z)
		return
	var before := screen_to_world(at)
	cam.zoom = Vector2(z, z)
	var after := screen_to_world(at)
	cam.position += before - after


## Pan by screen px.
func pan(by: Vector2) -> void:
	view.cam.position -= by / view.cam.zoom.x


## Centre on tile point t.
func focus(t: Vector2) -> void:
	view.cam.position = Vector2(view.iso.sx(t.x, t.y), view.iso.sy(t.x, t.y, view.iso.z_at(t.x, t.y)))


## The tiles the camera shows (for the room's interest and the minimap).
func view_tiles() -> Rect2:
	var vr := view.get_viewport().get_visible_rect()
	var r := Rect2()
	var first := true
	for c in [vr.position, Vector2(vr.end.x, vr.position.y), vr.end, Vector2(vr.position.x, vr.end.y)]:
		var t := tile_at_screen(c)
		if first:
			r = Rect2(t, Vector2.ZERO)
			first = false
		else:
			r = r.expand(t)
	return r


func _process(dt: float) -> void:
	if view == null:
		return
	var v := Vector2.ZERO
	if WarActions.held("cam.left"):
		v.x -= 1
	if WarActions.held("cam.right"):
		v.x += 1
	if WarActions.held("cam.up"):
		v.y -= 1
	if WarActions.held("cam.down"):
		v.y += 1
	if v == Vector2.ZERO and edge_scroll and DisplayServer.window_is_focused() and not touch.busy() and not (over_hud.is_valid() and over_hud.call()):
		var m := view.get_viewport().get_mouse_position()
		var sz := view.get_viewport().get_visible_rect().size
		if Rect2(Vector2.ZERO, sz).has_point(m):
			if m.x < EDGE_PX:
				v.x -= 1
			elif m.x > sz.x - EDGE_PX:
				v.x += 1
			if m.y < EDGE_PX:
				v.y -= 1
			elif m.y > sz.y - EDGE_PX:
				v.y += 1
	if v != Vector2.ZERO:
		view.cam.position += v * dt * PAN / view.cam.zoom.x
	for i in touch.tick(Time.get_ticks_msec()):
		_intent(i)
	if tool != "" and follow_mouse and not (over_hud.is_valid() and over_hud.call()):
		_ghost_follow(view.get_viewport().get_mouse_position())
	client.view(view_tiles())
	var now := Time.get_ticks_msec()
	_marks = _marks.filter(func(m: Array) -> bool: return now - m[2] < 700)
	_rings.queue_redraw()
	_ghost_layer.queue_redraw()


# ---- events ----

func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventScreenTouch or e is InputEventScreenDrag:
		for i in touch.feed(e, Time.get_ticks_msec()):
			_intent(i)
		get_viewport().set_input_as_handled()
	elif e is InputEventKey and e.pressed and not e.echo:
		_key(e)
	elif e is InputEventMouseButton:
		_mouse_button(e)
	elif e is InputEventMouseMotion:
		if _drag_pan:
			pan(e.relative)
		elif _press.x >= 0 and e.position.distance_to(_press) > BOX_MIN and tool == "":
			box = Rect2(_press, Vector2.ZERO).expand(e.position).abs()
			changed.emit()


func _mouse_button(e: InputEventMouseButton) -> void:
	if e.pressed and (e.button_index == MOUSE_BUTTON_WHEEL_UP or e.button_index == MOUSE_BUTTON_WHEEL_DOWN):
		set_zoom(zoom_step + (1 if e.button_index == MOUSE_BUTTON_WHEEL_UP else -1), e.position)
		return
	if e.button_index == MOUSE_BUTTON_MIDDLE or (e.button_index == MOUSE_BUTTON_LEFT and e.pressed and WarActions.held("cam.grab")):
		_drag_pan = e.pressed
		return
	if e.button_index == MOUSE_BUTTON_LEFT:
		if e.pressed:
			_press = e.position
			_press_shift = e.shift_pressed
			return
		if _drag_pan:
			_drag_pan = false
			return
		if box.size.x > 0 or box.size.y > 0:
			_box_select(box, _press_shift)
			box = Rect2()
		elif _press.x >= 0:
			click(e.position, e.shift_pressed, e.ctrl_pressed or e.meta_pressed)
		_press = Vector2(-1, -1)
	elif e.button_index == MOUSE_BUTTON_RIGHT and e.pressed:
		if tool != "" or armed != "":
			back()
		else:
			act_at(e.position, e.ctrl_pressed or e.meta_pressed)


## A left click or a tap at screen point p.
func click(p: Vector2, shift: bool, ctrl: bool) -> void:
	if tool != "":
		_ghost_follow(p)
		_place()
		if not shift:
			set_tool("")
		return
	if armed != "":
		var t := tile_at_screen(p)
		var ld := sel.lead()
		if ld >= 0:
			if armed == "attack":
				var foe := unit_at(p, false)
				if not foe.is_empty() and is_foe(squad_of(foe)):
					send({"kind": "attack", "squad": ld, "target": int(squad_of(foe)["id"])})
					mark(t, Color(0.92, 0.4, 0.3))
				else:
					send({"kind": "attackMove", "squad": ld, "x": t.x, "y": t.y})
					mark(t, Color(0.92, 0.4, 0.3))
			else:
				send({"kind": armed, "squad": ld, "x": t.x, "y": t.y})
				mark(t, Color(0.55, 0.85, 0.4) if armed == "move" else Color(0.92, 0.4, 0.3))
		armed = ""
		changed.emit()
		return
	var u := unit_at(p, true)
	sel.click(int(u["id"]) if not u.is_empty() else -1, shift, Time.get_ticks_msec())
	changed.emit()


func _box_select(r: Rect2, add: bool) -> void:
	sel.box(r, func(u: Dictionary) -> Vector2: return world_to_screen(view.iso.feet(u["x"], u["y"])), add)
	changed.emit()


func _intent(i: Dictionary) -> void:
	match i["kind"]:
		"tap":
			# with men selected a tap off his own men gives the context order; on his man it selects
			var mine := unit_at(i["at"], true)
			if not mine.is_empty() or sel.is_empty() or tool != "" or armed != "":
				click(i["at"], false, false)
			else:
				act_at(i["at"], false)
		"pan":
			pan(i["by"])
		"zoom":
			var z: float = view.cam.zoom.x * i["by"]
			var k := 0
			for s in LADDER.size():
				if absf(LADDER[s] * density - z) < absf(LADDER[k] * density - z):
					k = s
			if k != zoom_step:
				set_zoom(k, i["at"])
		"box_start":
			box = Rect2(i["at"], Vector2.ONE)
			changed.emit()
		"box_move":
			box = i["rect"]
			changed.emit()
		"box_end":
			_box_select(i["rect"], false)
			box = Rect2()
		"box_cancel":
			box = Rect2()
			changed.emit()


func _key(e: InputEventKey) -> void:
	var a := WarActions.resolve(e, WarActions.BUILD if build_mode else WarActions.REGION)
	if a == "" and build_mode:
		a = WarActions.resolve(e, WarActions.REGION)
	if a == "":
		return
	var now := Time.get_ticks_msec()
	if a.begins_with("form."):
		formation(a.substr(5))
	elif a.begins_with("group.set."):
		sel.store(int(a.substr(10)))
	elif a.begins_with("group."):
		if sel.recall(int(a.substr(6)), now):
			focus(sel.centre())
	else:
		match a:
			"sel.all":
				select_all()
			"order.act":
				act_at(view.get_viewport().get_mouse_position(), false)
			"order.hold":
				hold()
			"order.stop":
				stop()
			"order.active":
				active()
			"build.mode":
				set_build_mode(not build_mode)
			"build.rotate":
				rot = 1 - rot
				ghost = Vector2(-1, -1)
			"back":
				back()
			_:
				return
	changed.emit()
	get_viewport().set_input_as_handled()


## Rings under the selected men and where orders went (world, under the units).
class Rings extends Node2D:
	var owner_: RegionInput

	func _draw() -> void:
		var iso: Iso = owner_.view.iso
		for u in owner_.sel.men():
			var f := iso.feet(u["x"], u["y"])
			_ellipse(f, 7.0, 3.5, Color(0.95, 0.82, 0.45, 0.95), 1.2)
		var now := Time.get_ticks_msec()
		for m in owner_._marks:
			var k: float = (now - m[2]) / 700.0
			var t: Vector2 = m[0]
			var f := Vector2(iso.sx(t.x, t.y), iso.sy(t.x, t.y, iso.z_at(t.x, t.y)))
			var c: Color = m[1]
			c.a = 1.0 - k
			_ellipse(f, 6.0 + 8.0 * k, 3.0 + 4.0 * k, c, 1.5)

	func _ellipse(c: Vector2, rx: float, ry: float, col: Color, w: float) -> void:
		var pts := PackedVector2Array()
		for i in 25:
			var a := TAU * i / 24.0
			pts.append(c + Vector2(cos(a) * rx, sin(a) * ry))
		draw_polyline(pts, col, w, true)


## The build tool's footprint at the cursor: green where it may go, red where not.
class Ghost extends Node2D:
	var owner_: RegionInput

	func _draw() -> void:
		var o := owner_
		if o.tool == "" or o.ghost.x < 0:
			return
		var iso: Iso = o.view.iso
		var fp := o._footprint(o.tool)
		var x0 := o.ghost.x - fp.x / 2.0
		var y0 := o.ghost.y - fp.y / 2.0
		var c := Color(0.45, 0.85, 0.4, 0.4) if o.ghost_ok else Color(0.92, 0.35, 0.28, 0.4)
		var z := iso.z_at(o.ghost.x, o.ghost.y)
		var pts := PackedVector2Array()
		for p in [Vector2(x0, y0), Vector2(x0 + fp.x, y0), Vector2(x0 + fp.x, y0 + fp.y), Vector2(x0, y0 + fp.y)]:
			pts.append(Vector2(iso.sx(p.x, p.y), iso.sy(p.x, p.y, z)))
		draw_colored_polygon(pts, c)
		pts.append(pts[0])
		draw_polyline(pts, Color(c, 0.95), 1.5)
