## The client layer round trip (src/client/war_client.gd): a WarClient on a LocalRoom joins with an army, gets its
## welcome and frames, and its orders, made only of protocol messages, move its men in the room's sim. What the client
## decodes is what the room holds (units, squads, fog), and the view feed's rows are the Sim's row shapes.
extends TestCase


func _game(region_id := "test-ridge") -> Array:
	SimTables.load()
	var region := Region.load_id(region_id)
	var sim := Sim.create(region.grid(), region.meta, region.cells, 3)
	var room := LocalRoom.create(sim, {"cap": 96, "allowArmy": true, "allowDev": true})
	var c := WarClient.make(room, region.id, LocalRoom.constants())
	return [c, room, sim, region]


func _tick(c: WarClient, n: int) -> void:
	for k in n:
		c.pump(1.0 / WarClient.HZ)


func test_join_welcome_and_frames() -> void:
	var g := _game()
	var c: WarClient = g[0]
	var room: LocalRoom = g[1]
	var msgs := []
	c.message.connect(func(m: Dictionary) -> void: msgs.append(m["t"]))
	c.join_army(1, 0, [["hoplite", 12], ["archer", 10]])
	check(c.welcomed, "no welcome: %s" % [msgs])
	check(msgs.has("settlements"), "no settlements list after the welcome")
	_tick(c, 3)
	var mine := c.my_squads()
	check(mine.size() == 2, "his squads in the frame: %d" % mine.size())
	var men := 0
	for u in c.snap["units"]:
		for q in mine:
			if int(u["squad"]) == int(q["id"]):
				men += 1
	check(men == 22, "his men in the frame: %d" % men)
	check(int(c.snap["tick"]) == room.current_tick(), "frame tick %d, room %d" % [c.snap["tick"], room.current_tick()])
	# what the client decoded is the room's own state (positions to the wire's 1/8 tile)
	var truth := {}
	for u in room.snapshot()["units"]:
		truth[int(u["id"])] = u
	for u in c.snap["units"]:
		var t: Dictionary = truth.get(int(u["id"]), {})
		check(not t.is_empty(), "unit %d not in the room" % u["id"])
		if not t.is_empty():
			check(absf(t["x"] - u["x"]) <= 1.0 / 16 and absf(t["y"] - u["y"]) <= 1.0 / 16, "unit %d at %s, room %s" % [u["id"], [u["x"], u["y"]], [t["x"], t["y"]]])


func test_orders_move_his_men() -> void:
	var g := _game()
	var c: WarClient = g[0]
	c.join_army(1, 0, [["hoplite", 12]])
	_tick(c, 3)
	var q := int(c.my_squads()[0]["id"])
	var at := _centre(c, q)
	var to := at + Vector2(12, 0)
	c.order({"kind": "move", "squad": q, "x": to.x, "y": to.y})
	_tick(c, 80)
	var now := _centre(c, q)
	check(now.distance_to(to) < at.distance_to(to) - 6.0, "moved from %s to %s, goal %s" % [at, now, to])
	# a refused order comes back as an error message
	var errs := []
	c.message.connect(func(m: Dictionary) -> void: if m["t"] == "error": errs.append(m["code"]))
	c.order({"kind": "hold", "squad": 99999})
	check(errs == ["notOwner"], "order on a squad not his: %s" % [errs])


func test_fog_is_the_rooms() -> void:
	var g := _game()
	var c: WarClient = g[0]
	var sim: Sim = g[2]
	c.join_army(1, 0, [["hoplite", 12]])
	_tick(c, 25)
	check(c.fog_size == sim.fog_size(), "fog grid %s, sim %s" % [c.fog_size, sim.fog_size()])
	check(c.fog_state == sim.fog_state(0), "fog state differs from the sim's")


func test_view_feed_rows() -> void:
	var g := _game()
	var c: WarClient = g[0]
	var sim: Sim = g[2]
	c.join_army(1, 0, [["hoplite", 12]])
	_tick(c, 3)
	var r := ViewFeed.rows(c.snap)
	var d := sim.digest()
	check(r["digest"]["units"].size() == d["units"].size(), "rows %d, digest %d" % [r["digest"]["units"].size(), d["units"].size()])
	var a: Array = r["digest"]["units"][0]
	var b: Array = d["units"][0]
	check(a[0] == b[0] and a[1] == b[1] and a[5] == b[5], "row %s, digest %s" % [a, b])
	var vs := sim.view_state()
	check(r["info"][0][2] == vs["units"][0][2], "class %s, sim %s" % [r["info"][0][2], vs["units"][0][2]])
	for bs in c.snap.get("buildings", []):
		check(ViewFeed.building_row(bs).size() == vs["buildings"][0].size(), "building row size")
		break


func _centre(c: WarClient, q: int) -> Vector2:
	var p := Vector2.ZERO
	var n := 0
	for u in c.snap["units"]:
		if int(u["squad"]) == q and u["state"] != "dead":
			p += Vector2(u["x"], u["y"])
			n += 1
	return p / maxf(1, n)
