## The offline game on one region (docs/impl/godot-port.md P10, G-03): a local room (LocalRoom on a C++ Sim) and the
## client that talks to it only by protocol messages (WarClient), the region view drawn from what the room sends
## (ViewFeed), the input (RegionInput) and the HUD (Hud). Command line (after `--`):
##   --region <id>     region (default elaia); --team <n> his alliance (default the region's)
##   --state <s>       a set-up state to look at: busy (his squad selected, a fight on, a notice up), army (nothing
##                     selected), build (the build bar open, the tool on a spot); default none: just the game
##   --world           start on the world map (WorldScreen, P11); entering a region opens it here, Shift+W (or the
##                     top bar's map button) goes back. States on the map: world (his squad selected, its neighbours
##                     lit, its card docked), world-order (the march order open), world-road (his men on the road)
##   --shot <png>      play the state in, wait for the ground, save the screen and quit; --wait <frames> before it
## Window size: Godot's own --resolution WxH.
class_name Game
extends Node

var region: Region
var sim: Sim
var room: LocalRoom
var client: WarClient
var view: RegionView
var feed: ViewFeed
var input: RegionInput
var hud: Hud
var layer: CanvasLayer
var world: WorldScreen
var world_feed: WorldFeed
var _args := {}
var _focused := false


func _ready() -> void:
	_args = RegionView._parse(OS.get_cmdline_user_args())
	get_window().content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
	SimTables.load()
	var state := String(_args.get("state", ""))
	if _args.has("world") or state.begins_with("world"):
		open_world()
		if _args.has("state") or _args.has("shot"):
			_play_world.call_deferred(state if state != "" else "world")
		return
	open_region(String(_args.get("region", "elaia")))
	if _args.has("state") or _args.has("shot"):
		_play_state.call_deferred(String(_args.get("state", "busy")))


func _density() -> float:
	return maxf(1.0, DisplayServer.screen_get_scale())


## The world map (its feed lives on while a region is open: the world runs on).
func open_world() -> void:
	_close_region()
	if world_feed == null:
		world_feed = WorldFeed.make(WorldFixture.load_file())
	world = WorldScreen.new()
	add_child(world)
	world.setup(world_feed, _density())
	world.entered.connect(func(id: String) -> void: open_region.call_deferred(id))


func _close_world() -> void:
	if world:
		world.queue_free()
		remove_child(world)
		world = null


func _close_region() -> void:
	for n in [view, input, layer]:
		if n:
			n.queue_free()
			remove_child(n)
	view = null
	input = null
	layer = null
	hud = null
	client = null
	room = null
	sim = null
	_focused = false


## One region with his army joined, its view, input and HUD.
func open_region(id: String) -> void:
	_close_world()
	_close_region()
	region = Region.load_id(id)
	var team := int(_args.get("team", _home_team(id)))
	sim = Sim.create(region.grid(), region.meta, region.cells, int(_args.get("seed", "7")))
	room = LocalRoom.create(sim, {"cap": 600, "allowArmy": true, "allowDev": true, "wild": true})
	client = WarClient.make(room, id, LocalRoom.constants())
	view = RegionView.new()
	view.client = client
	view.region_id = id
	view.controls = false
	add_child(view)
	feed = ViewFeed.make(client, view)
	var density := _density()
	input = RegionInput.new()
	add_child(input)
	input.setup(view, client, density)
	layer = CanvasLayer.new()
	layer.layer = 10
	add_child(layer)
	hud = Hud.new()
	hud.on_world = func() -> void: open_world.call_deferred()
	layer.add_child(hud)
	hud.setup(client, input, view, region, density)
	client.frame.connect(_on_frame)
	client.join_army(1, team, [["hoplite", 12], ["archer", 12]])


## Shift+W in a region: back to the world map.
func _unhandled_key_input(e: InputEvent) -> void:
	if view and e is InputEventKey and e.pressed and not e.echo and WarActions.resolve(e, WarActions.REGION) == "go.world":
		open_world.call_deferred()


static func _home_team(id: String) -> int:
	for r in GameData.table("src/war/world/regions")["WORLD_REGIONS"]:
		if r["id"] == id and r.get("alliance") != null:
			return int(r["alliance"])
	return 0


## The camera on his men once they are in.
func _on_frame(_snap: Dictionary) -> void:
	if _focused:
		return
	var mine := client.my_squads()
	if mine.is_empty():
		return
	input.sel.sync(client.snap, client.owner_name())
	var c := Vector2.ZERO
	var n := 0
	for u in input.sel.live.values():
		c += Vector2(u["x"], u["y"])
		n += 1
	if n > 0:
		input.focus(c / n)
		_focused = true


## Tick the room n times at once (a state set up for a shot).
func _ticks(n: int) -> void:
	for k in n:
		client.pump(1.0 / WarClient.HZ)


func _play_state(state: String) -> void:
	input.edge_scroll = not _args.has("shot")
	_ticks(5)
	var mine := client.my_squads()
	if mine.is_empty():
		push_error("no army after the join")
	var lead := int(mine[0]["id"]) if not mine.is_empty() else -1
	input.sel.sync(client.snap, client.owner_name())
	var at := Vector2(region.w / 2.0, region.h / 2.0)
	if lead >= 0:
		input.select_squad(lead)
		at = input.sel.centre()
		input.focus(at)
	match state:
		"busy":
			client.dev({"op": "spawn", "team": (client.team() + 1) % 4, "cls": "celt_sword", "count": 10, "x": roundf(at.x) + 7, "y": roundf(at.y) + 2})
			input.send({"kind": "attackMove", "squad": lead, "x": at.x + 7, "y": at.y + 2})
			_ticks(60)
			input.select_squad(lead)
			input.focus(_fight_centre(input.sel.centre()))
		"army":
			input.sel.clear()
			_ticks(5)
		"build":
			input.sel.clear()
			input.set_tool("storehouse")
			input.follow_mouse = false
			var t := at + Vector2(7, -3)
			input._ghost_follow(input.world_to_screen(view.iso.world(t.x, t.y, view.iso.z_at(t.x, t.y))))
			_ticks(5)
	hud.refresh()
	if _args.has("shot"):
		await _shot(_args["shot"], int(_args.get("wait", "20")))


## The middle of every man standing within 14 tiles of `at` (both sides of a fight).
func _fight_centre(at: Vector2) -> Vector2:
	var c := Vector2.ZERO
	var n := 0
	for u in client.snap.get("units", []):
		var p := Vector2(u["x"], u["y"])
		if u["state"] != "dead" and p.distance_to(at) < 14.0:
			c += p
			n += 1
	return c / n if n else at


func _shot(path: String, frames: int) -> void:
	for k in 600:
		view.ground.update_view(view.view_rect(), true)
		if view.ground.missing == 0:
			break
		await get_tree().process_frame
	for k in frames:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(path)
	var lay := HudLayout.overlaps({}, hud.rects())
	print("shot %s %s mode %s scale %.2f; panels %s; overlaps %s" % [path, img.get_size(), hud.mode, hud.ui_scale, hud.rects().keys(), lay])
	get_tree().quit()


## A set-up state on the world map (see the header), then the shot.
func _play_world(state: String) -> void:
	await get_tree().process_frame
	world.fit()
	var home := String(world_feed.view["squads"][0]["region"]) if not world_feed.view["squads"].is_empty() else "elaia"
	match state:
		"world":
			world.select(home)
		"world-order":
			world.select(home)
			world.open_order(String(WorldGeo.region(home)["adj"][0]))
		"world-road":
			world.select(home)
			world.open_order(String(WorldGeo.region(home)["adj"][0]))
			world.send_order()
			world_feed.tick(40.0)
	world.hud.refresh()
	if _args.has("shot"):
		for k in int(_args.get("wait", "10")):
			await get_tree().process_frame
		await RenderingServer.frame_post_draw
		var img := get_viewport().get_texture().get_image()
		img.save_png(_args["shot"])
		var h := world.hud
		print("shot %s %s mode %s scale %.2f; panels %s; overlaps %s" % [_args["shot"], img.get_size(), h.mode, h.ui_scale, h.rects().keys(), HudLayout.overlaps({}, h.rects())])
		get_tree().quit()
