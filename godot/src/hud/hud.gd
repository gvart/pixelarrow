## The region HUD in Control nodes (docs/impl/godot-port.md P10; the DOM war HUD, src/war/view/hud, for the core
## loop): the top bar, the notices, the minimap, the command card (or the army when nothing is selected), the build
## bar and the dock, placed by HudLayout's zones so no two meet. Driven by the client's frames and messages and the
## input's changes (events, not polling).
##
## Layouts by the window's size in logical px (UI scale as the DOM HUD's auto step, W-34):
##   desktop   the largest step whose 900 x 560 art-px layout fits (1280 x 720: 1.25, 1920 x 1080: 1.75)
##   phone     landscape under that: scale 1 (x the screen's density), touch-sized slots, a smaller minimap
##   portrait  taller than wide: the minimap and the dock top right, the card full width at the bottom
class_name Hud
extends Control

const STEPS := [2.5, 2.0, 1.75, 1.5, 1.25, 1.0]
const HARM_QUIET := 300

var client: WarClient
var input: RegionInput
var view: RegionView
var region: Region
var density := 1.0
var mode := "desktop"
var ui_scale := 1.0
var frame_art := Vector2.ZERO
var top_bar: TopBar
var notices: Notices
var minimap: Minimap
var card: CommandCard
var army: ArmyPanel
var build_bar: BuildBar
var dock: Dock
## The last layout: id -> {rect, off} (art px), for the tests and the shots' check.
var placed := {}
var _box: BoxDraw
var _dirty := true
var _t := 0.0
var _harm_hp := {}
var _harm_last := -1000000
var _built_for := Vector2i.ZERO


static func mode_for(w: float, h: float) -> String:
	if h > w:
		return "portrait"
	return "desktop" if w >= 900 and h >= 560 else "phone"


## The UI scale for a window of w x h logical px (kit.ts autoStep; a phone keeps 1).
static func scale_for(w: float, h: float) -> float:
	if mode_for(w, h) != "desktop":
		return 1.0
	for k in STEPS:
		if w >= 900 * k and h >= 560 * k:
			return k
	return 1.0


func setup(client_: WarClient, input_: RegionInput, view_: RegionView, region_: Region, density_: float) -> void:
	client = client_
	input = input_
	view = view_
	region = region_
	density = density_
	theme = HudTheme.theme()
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_TOP_LEFT)
	client.frame.connect(_on_frame)
	client.message.connect(_on_message)
	input.changed.connect(func() -> void: _dirty = true)
	input.over_hud = func() -> bool: return _over_hud()
	get_viewport().size_changed.connect(func() -> void: _dirty = true)
	rebuild()


## Build every panel for the window's size now.
func rebuild() -> void:
	for c in get_children():
		c.queue_free()
	var win := get_viewport().get_visible_rect().size
	var logical := win / density
	mode = mode_for(logical.x, logical.y)
	ui_scale = scale_for(logical.x, logical.y) * density
	scale = Vector2(ui_scale, ui_scale)
	frame_art = (win / ui_scale).floor()
	size = frame_art
	_built_for = Vector2i(win)
	var phone := mode != "desktop"
	top_bar = TopBar.new()
	top_bar.build(String(region.meta.get("name", region.id)), phone)
	add_child(top_bar)
	notices = Notices.new()
	notices.build(input, 360.0 if mode == "desktop" else 320.0 if mode == "phone" else 250.0)
	add_child(notices)
	minimap = Minimap.new()
	minimap.build(input, client, region, 168.0 if mode == "desktop" else 112.0)
	add_child(minimap)
	card = CommandCard.new()
	card.build(input, view.units if view else null, mode, frame_art.x - 8)
	add_child(card)
	army = ArmyPanel.new()
	army.build(input, phone, 360.0 if mode != "portrait" else frame_art.x - 8)
	add_child(army)
	build_bar = BuildBar.new()
	build_bar.build(input, phone)
	add_child(build_bar)
	dock = Dock.new()
	dock.build(input, 40.0 if mode == "desktop" else 44.0, mode == "portrait", mode == "desktop")
	add_child(dock)
	_box = BoxDraw.new()
	_box.hud = self
	add_child(_box)
	_dirty = true


func _process(dt: float) -> void:
	if Vector2i(get_viewport().get_visible_rect().size) != _built_for:
		rebuild()
	_t += dt
	if _dirty or _t > 0.2:
		refresh()


## Every panel from the state now, then the layout.
func refresh() -> void:
	_dirty = false
	_t = 0.0
	var selected := not input.sel.is_empty()
	top_bar.refresh(client, input.sel.live.size())
	if selected:
		card.refresh(client)
	else:
		army.refresh(client)
	build_bar.refresh(client)
	dock.refresh()
	lay()
	_box.queue_redraw()


## Place the panels (HudLayout zones) for the current mode.
func lay() -> void:
	top_bar.lay(frame_art.x)
	var selected := not input.sel.is_empty()
	var box := func(id: String, c: Control, w: Vector2) -> Dictionary: return {"id": id, "w": w.x, "h": w.y, "node": c}
	var bc := []
	bc.append(box.call("card", card, card.want()) if selected else box.call("army", army, army.want()))
	if input.build_mode:
		bc.append(box.call("build", build_bar, build_bar.want()))
	var st := {"bc": bc, "tc": []}
	if notices.count() > 0:
		st["tc"] = [box.call("notices", notices, notices.want())]
	if mode == "portrait":
		st["tr"] = [box.call("minimap", minimap, minimap.size), box.call("dock", dock, dock.want())]
	else:
		st["bl"] = [box.call("minimap", minimap, minimap.size)]
		st["br"] = [box.call("dock", dock, dock.want())]
	var pl := top_bar.plaque_rect()
	placed = HudLayout.solve(frame_art, st, top_bar.h + 6.0, pl.end.y + 6.0)
	card.visible = false
	army.visible = false
	build_bar.visible = false
	notices.visible = false
	for z in st:
		for b in st[z]:
			var c: Control = b["node"]
			var p: Dictionary = placed[b["id"]]
			c.visible = not p["off"]
			c.position = p["rect"].position.round()
			c.size = p["rect"].size
	placed["top"] = {"rect": Rect2(0, 0, frame_art.x, top_bar.h), "off": false}
	placed["plaque"] = {"rect": pl, "off": false}


## The visible panels' rects (art px) by id, for the overlap tests.
func rects() -> Dictionary:
	var out := {}
	for id in placed:
		if not placed[id]["off"] and id != "top":
			out[id] = placed[id]["rect"]
	return out


func _over_hud() -> bool:
	var c := get_viewport().gui_get_hovered_control()
	return c != null and c != self and c != _box


func _on_frame(snap: Dictionary) -> void:
	_harm(snap)
	_dirty = true


## W-221 harmWatch: a notice when a fight on his men begins (a man of his lost health after HARM_QUIET calm ticks).
func _harm(snap: Dictionary) -> void:
	var me := client.owner_name()
	var mine := {}
	for q in snap.get("squads", []):
		if q["owner"] == me:
			mine[int(q["id"])] = true
	var struck := {}
	var hp := {}
	for u in snap.get("units", []):
		if not mine.has(int(u["squad"])):
			continue
		var id := int(u["id"])
		hp[id] = u["hp"]
		if _harm_hp.has(id) and u["hp"] < _harm_hp[id] - 0.5 and struck.is_empty():
			struck = u
	_harm_hp = hp
	if struck.is_empty():
		return
	var t := int(snap.get("tick", 0))
	if t - _harm_last >= HARM_QUIET:
		notices.say("act-attack", "Your %s are under attack" % HudWords.class_name_of(struck["cls"]), "bad", Vector2(struck["x"], struck["y"]))
		_dirty = true
	_harm_last = t


func _on_message(m: Dictionary) -> void:
	var phone := mode != "desktop"
	match String(m.get("t", "")):
		"welcome":
			notices.say("unit-hoplite", "Your army is here. %s your men to lead them." % ("Tap" if phone else "Click"), "good")
		"refused":
			notices.say("act-cancel", HudWords.REFUSED.get(m.get("reason", ""), "You can't enter this region"), "bad")
			army.waiting = HudWords.REFUSED.get(m.get("reason", ""), "You can't enter this region")
		"queued":
			army.waiting = "The region is full: you are number %d in line" % int(m.get("pos", 1))
			notices.say("act-hold", army.waiting)
		"error":
			var code := String(m.get("code", ""))
			if code != "parse" and code != "tooBig":
				notices.say("act-cancel", HudWords.ERROR.get(code, "That order did not work"), "bad", Vector2.INF, 3.0)
		"soul":
			if m.get("state") == "claimed":
				notices.say("unit-hoplite", "%s joins your army" % String(m.get("name", "A new man")), "good")
			else:
				notices.say("act-cancel", "Your army is full", "bad")
		"dropped":
			notices.say("trade-pile", "A fallen man's goods lie where he fell", "", Vector2(m["x"], m["y"]))
	_dirty = true


## The selection box being drawn (screen px from the input, drawn in art px).
class BoxDraw extends Control:
	var hud: Hud

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		set_anchors_preset(Control.PRESET_FULL_RECT)

	func _draw() -> void:
		var b: Rect2 = hud.input.box
		if b.size == Vector2.ZERO:
			return
		var r := Rect2(b.position / hud.ui_scale, b.size / hud.ui_scale)
		draw_rect(r, Color(0.95, 0.82, 0.45, 0.12))
		draw_rect(r, Color(0.95, 0.82, 0.45, 0.9), false, 1.0)
