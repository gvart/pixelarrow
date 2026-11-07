## The HUD's layout rules (src/hud/hud_layout.gd, hud.gd): no two panels meet and none leaves the screen, at every
## window size the game ships for (desktop 1280 x 720, 1520 x 750, 1920 x 1080; phones 844 x 390 and 390 x 844), in a
## busy state (a squad selected, three notices up, the build bar open), with nothing selected, and with the build bar
## over the army. The HUD runs on a real client (LocalRoom on test-ridge) in a SubViewport of each size.
extends TestCase

const SIZES := [Vector2i(1280, 720), Vector2i(1520, 750), Vector2i(1920, 1080), Vector2i(844, 390), Vector2i(390, 844)]


func test_solver_moves_the_centre_column_clear_of_the_corners() -> void:
	var f := Vector2(700, 400)
	var st := {"bl": [{"id": "map", "w": 168, "h": 168}], "br": [{"id": "dock", "w": 90, "h": 48}], "bc": [{"id": "card", "w": 420, "h": 110}]}
	var p := HudLayout.solve(f, st, 36, 50)
	var card: Rect2 = p["card"]["rect"]
	check(card.position.x >= 4 + 168 + 6 - 0.01, "card at %s meets the minimap" % card)
	check(HudLayout.overlaps(p).is_empty(), "overlaps %s" % [HudLayout.overlaps(p)])
	# no room beside the corners: the card is lifted over them
	st["bc"] = [{"id": "card", "w": 600, "h": 110}]
	p = HudLayout.solve(f, st, 36, 50)
	check(HudLayout.overlaps(p).is_empty(), "wide card: overlaps %s" % [HudLayout.overlaps(p)])
	check(p["card"]["rect"].end.y <= 400 - 4 - 168 - 6 + 0.01, "wide card not lifted over the minimap: %s" % p["card"]["rect"])


func test_solver_top_column_shrinks_then_leaves_out() -> void:
	var f := Vector2(600, 300)
	var st := {"bl": [{"id": "map", "w": 120, "h": 120}], "tl": [{"id": "a", "w": 200, "h": 80}, {"id": "b", "w": 200, "h": 90, "min": 30}, {"id": "c", "w": 200, "h": 60}]}
	var p := HudLayout.solve(f, st, 36, 50)
	check(not p["a"]["off"] and not p["b"]["off"], "a and b placed")
	check(p["b"]["rect"].size.y < 90, "b shrank: %s" % p["b"]["rect"])
	check(p["c"]["off"], "c left out when nothing fits")
	check(HudLayout.overlaps(p).is_empty(), "overlaps %s" % [HudLayout.overlaps(p)])


func test_no_overlap_at_every_size() -> void:
	var g := _client()
	var c: WarClient = g[0]
	var region: Region = g[1]
	for size in SIZES:
		for state in ["busy", "army", "build"]:
			var vp := SubViewport.new()
			vp.size = size
			Engine.get_main_loop().root.add_child(vp)
			var input := RegionInput.new()
			input.client = c
			input.sel.sync(c.snap, c.owner_name())
			var hud := Hud.new()
			vp.add_child(hud)
			hud.setup(c, input, null, region, 1.0)
			match state:
				"busy":
					input.select_squad(int(c.my_squads()[0]["id"]))
					input.build_mode = true
					hud.notices.say("act-attack", "Your Hoplites are under attack", "bad", Vector2(10, 10))
					hud.notices.say("act-cancel", "Not your ground: build round your town", "bad")
					hud.notices.say("unit-hoplite", "Your army is here. Click your men to lead them.", "good")
				"army":
					input.sel.clear()
				"build":
					input.sel.clear()
					input.set_tool("storehouse")
			hud.refresh()
			var why := _bad(hud, Vector2(size))
			check(why == "", "%s at %dx%d (%s, scale %.2f): %s" % [state, size.x, size.y, hud.mode, hud.ui_scale, why])
			vp.queue_free()
			Engine.get_main_loop().root.remove_child(vp)


## "" when the HUD is clean: every panel inside the screen, none meeting another or the top bar; else what is wrong.
static func _bad(hud: Hud, win: Vector2) -> String:
	var frame := win / hud.ui_scale
	var rects := hud.rects()
	for id in rects:
		var r: Rect2 = rects[id]
		if r.position.x < -0.01 or r.position.y < -0.01 or r.end.x > frame.x + 0.01 or r.end.y > frame.y + 0.01:
			return "%s off the screen: %s in %s" % [id, r, frame]
		if id != "plaque" and r.position.y < hud.top_bar.h:
			return "%s under the top bar: %s" % [id, r]
		# what the panel needs is what it got (no content spilling out of its place)
		var node: Control = {"card": hud.card, "army": hud.army, "build": hud.build_bar, "dock": hud.dock, "minimap": hud.minimap, "notices": hud.notices}.get(id)
		if node and node.get_combined_minimum_size().x > r.size.x + 0.5:
			return "%s needs %s, has %s" % [id, node.get_combined_minimum_size(), r.size]
	var o := HudLayout.overlaps({}, rects)
	if not o.is_empty():
		return "overlaps %s" % [o]
	for want in ["card", "notices", "build", "minimap", "dock"] if hud.input.build_mode and not hud.input.sel.is_empty() else []:
		if not rects.has(want):
			return "%s left out" % want
	return ""


func _client() -> Array:
	SimTables.load()
	var region := Region.load_id("test-ridge")
	var sim := Sim.create(region.grid(), region.meta, region.cells, 3)
	var room := LocalRoom.create(sim, {"cap": 96, "allowArmy": true})
	var c := WarClient.make(room, region.id, LocalRoom.constants())
	c.join_army(1, 0, [["hoplite", 12], ["archer", 12]])
	for k in 3:
		c.pump(1.0 / WarClient.HZ)
	return [c, region]
