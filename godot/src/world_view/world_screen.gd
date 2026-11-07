## The strategic world screen (src/war/world-view/main.ts; docs/impl/godot-port.md P11): the world map (WorldMap)
## drawn from the feed (WorldFeed), the panels over it (WorldHud), and the input:
##
##   mouse   drag pans, the wheel zooms about the pointer, hover lights a region, a click selects it and docks its card
##           (a region with his men selects his squad: its neighbours glow; a click on one opens the march order),
##           a double click enters a region
##   touch   one finger pans, two pinch, a tap is a click, a second tap on the same region soon after enters it
##   keys    Enter enters the hovered or selected region (or sends the march), Esc clears, T trade roads, F fit, +/- zoom
##
## `entered(region)` asks the game to open that region; a region with no view data in this build says so instead.
class_name WorldScreen
extends Control

signal entered(region: String)

const DOUBLE_TAP_MS := 350.0

var feed: WorldFeed
var map: WorldMap
var hud: WorldHud
var layer: CanvasLayer
## The neighbour the march order goes to ("": none open).
var ordering := ""
var _down := Vector2.INF
var _moved := false
var _touch := TouchGestures.new()
var _tap := {"id": "", "t": -1e9}
var _fitted := false


func setup(feed_: WorldFeed, density: float) -> void:
	feed = feed_
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	map = WorldMap.new()
	map.feed = feed
	add_child(map)
	layer = CanvasLayer.new()
	layer.layer = 10
	add_child(layer)
	hud = WorldHud.new()
	layer.add_child(hud)
	hud.setup(self, feed, density)
	feed.changed.connect(_on_changed)
	fit.call_deferred()


func fit() -> void:
	if not is_inside_tree():
		return
	map.size = get_viewport().get_visible_rect().size
	map.fit(hud.free_px())
	_fitted = true


func _process(dt: float) -> void:
	feed.tick(dt)


func _on_changed() -> void:
	if map.squad_at != "" and not feed.squads.has(map.squad_at):
		select(map.selected)
	hud.refresh()


## What a click on a region does now: march (a lit neighbour of his squad), squad (his men stand there), enter.
func mode_of(id: String) -> String:
	if map.targets.has(id):
		return "march"
	return "squad" if map.squad_at == id else "enter"


## Select a region (its card docks); his men there select his squad, and the lands it can march to glow.
func select(id: String, centre := false) -> void:
	map.selected = id
	map.squad_at = id if id != "" and feed.squads.has(id) else ""
	map.targets = {}
	if map.squad_at != "":
		for n in WorldGeo.region(id)["adj"]:
			map.targets[n] = true
	ordering = ""
	if centre and id != "":
		map.centre_on(id)
	hud.refresh()


func open_order(to: String) -> void:
	if map.squad_at == "":
		return
	ordering = to
	hud.refresh()


func close_order() -> void:
	ordering = ""
	hud.refresh()


func send_order() -> void:
	var from := map.squad_at
	var to := ordering
	if from == "" or to == "":
		return
	ordering = ""
	var r := feed.transfer(from, to)
	if r.has("error"):
		hud.say("They could not march: %s" % r["error"], 5.0)
	else:
		var men := 0
		for t in r["ok"]:
			men += int(t["men"])
		hud.say("%d men on the road to %s" % [men, WorldGeo.region_name(to)])
	select("")


## Open a region, if this build has its view data.
func enter(id: String) -> void:
	if id == "":
		return
	if not FileAccess.file_exists(ProjectSettings.globalize_path("res://view/%s/meta.json" % id)):
		hud.say("%s is not in the game yet. Elaia and its borderlands are open." % WorldGeo.region_name(id), 4.0)
		return
	entered.emit(id)


func toggle_routes() -> void:
	map.routes = not map.routes
	hud.refresh()


func _click(at: Vector2) -> void:
	var id := map.region_at(map.to_map(at))
	if id != "" and map.targets.has(id):
		open_order(id)
	else:
		select(id)


func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventScreenTouch or e is InputEventScreenDrag:
		_on_touch(e)
		return
	if e is InputEventMouseButton:
		var mb := e as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP or mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			if mb.pressed:
				map.zoom_to(map.goal * exp((120.0 if mb.button_index == MOUSE_BUTTON_WHEEL_UP else -120.0) / 400.0), mb.position)
			return
		if mb.button_index != MOUSE_BUTTON_LEFT:
			return
		if mb.pressed:
			if mb.double_click:
				enter(map.region_at(map.to_map(mb.position)))
				_down = Vector2.INF
				return
			_down = mb.position
			_moved = false
		elif _down != Vector2.INF:
			if not _moved:
				_click(mb.position)
			_down = Vector2.INF
	elif e is InputEventMouseMotion:
		var mm := e as InputEventMouseMotion
		if _down != Vector2.INF and (mm.button_mask & MOUSE_BUTTON_MASK_LEFT):
			if not _moved and mm.position.distance_to(_down) > 4.0:
				_moved = true
			if _moved:
				map.pan(mm.relative)
		var h := map.region_at(map.to_map(mm.position))
		if h != map.hover:
			map.hover = h
	elif e is InputEventKey and e.pressed and not e.echo:
		match WarActions.resolve(e, ["world", "global"]):
			"world.enter":
				if ordering != "":
					send_order()
				else:
					enter(map.hover if map.hover != "" else map.selected)
			"back":
				if ordering != "":
					close_order()
				else:
					select("")
			"world.routes":
				toggle_routes()
			"world.fit":
				fit()
			"world.zoomIn":
				map.zoom_to(map.goal * 1.35, map.size / 2.0)
			"world.zoomOut":
				map.zoom_to(map.goal / 1.35, map.size / 2.0)


func _on_touch(e: InputEvent) -> void:
	var now := Time.get_ticks_msec()
	for g in _touch.feed(e, now):
		match g["kind"]:
			"pan":
				map.pan(g["by"])
			"zoom":
				map.zoom(g["by"], g["at"])
			"tap":
				var id := map.region_at(map.to_map(g["at"]))
				if id != "" and id == _tap["id"] and now - _tap["t"] < DOUBLE_TAP_MS and not map.targets.has(id):
					enter(id)
					_tap = {"id": "", "t": -1e9}
				else:
					_click(g["at"])
					_tap = {"id": id, "t": now}
