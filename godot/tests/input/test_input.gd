## The controls are the Phaser client's (godot/tests/golden/vectors/input.json, src/dev/vectors/input.ts): the same
## action table (ids, contexts, kinds, default keys), every key event resolved to the same action in the region,
## build-mode and building contexts, and the same men picked by a click (select.ts clickPick). Then the touch
## gestures (tap, drag, hold-and-drag box, pinch) and the order addressing (W-53).
extends TestCase


func _v() -> Dictionary:
	return GameData.read_exact("res://tests/golden/vectors/input.json")


func test_action_table_is_the_ts_one() -> void:
	var ts: Array = _v()["actions"]
	check(ts.size() == WarActions.DEFS.size(), "%d actions, TS %d" % [WarActions.DEFS.size(), ts.size()])
	for i in mini(ts.size(), WarActions.DEFS.size()):
		var d: Array = WarActions.DEFS[i]
		var t: Dictionary = ts[i]
		var keys := []
		for b in t["defaults"]:
			keys.append([b["code"], ("m" if b.get("mod", false) else "") + ("a" if b.get("alt", false) else "") + ("s" if b.get("shift", false) else "")])
		if d[0] != t["id"] or d[1] != t["context"] or d[2] != t["kind"] or d[3] != t["label"] or str(d[4]) != str(keys):
			fail("action %d: %s, TS %s %s" % [i, d, t, keys])
			return


func test_keys_resolve_as_ts() -> void:
	var n := 0
	for k in _v()["keys"]:
		var e := InputEventKey.new()
		e.physical_keycode = WarActions.key_of(k["code"])
		e.ctrl_pressed = k["mod"]
		e.alt_pressed = k["alt"]
		e.shift_pressed = k["shift"]
		var want = k["act"]
		var got := WarActions.resolve(e, k["ctx"])
		if got != (want if want != null else ""):
			fail("%s%s%s%s in %s: %s, TS %s" % ["Ctrl+" if k["mod"] else "", "Alt+" if k["alt"] else "", "Shift+" if k["shift"] else "", k["code"], k["ctx"], got, want])
			return
		n += 1
	check(n > 500, "only %d key cases" % n)


func test_click_picks_as_ts() -> void:
	for c in _v()["picks"]:
		var got := Selection.click_pick(_ints(c["sel"]), _ints(c["before"]), _ints(c["squad"]), int(c["man"]), c["shift"], c["twice"])
		if got != _ints(c["pick"]):
			fail("clickPick(%s): %s, TS %s" % [c, got, c["pick"]])
			return


func test_selection_click_double_click_and_address() -> void:
	var s := Selection.new()
	var snap := {"squads": [{"id": 1, "owner": "p:1"}, {"id": 2, "owner": "p:1"}, {"id": 3, "owner": "p:2"}], "units": []}
	for id in range(1, 13):
		snap["units"].append({"id": id, "squad": 1 if id <= 6 else 2, "x": float(id), "y": 0.0, "state": "idle"})
	snap["units"].append({"id": 20, "squad": 3, "x": 0.0, "y": 0.0, "state": "idle"})
	s.sync(snap, "p:1")
	check(s.live.size() == 12, "his men only: %d" % s.live.size())
	s.click(3, false, 1000)
	check(Array(s.units) == [1, 2, 3, 4, 5, 6], "a click takes his squad: %s" % [s.units])
	check(s.address({"kind": "move", "squad": 1, "x": 1, "y": 1}).has("units") == false, "the whole squad: no units named")
	s.click(3, false, 1200)
	check(Array(s.units) == [3], "a double click takes the man alone: %s" % [s.units])
	var o := s.address({"kind": "move", "squad": 1, "x": 1, "y": 1})
	check(o.get("units") == [3], "part of a squad: the men named: %s" % [o])
	s.click(8, true, 3000)
	check(s.units.size() == 7 and s.lead() == 1, "shift adds the other squad, the first still leads: %s" % [s.units])
	s.store(2)
	s.clear()
	check(not s.recall(2, 5000) and s.units.size() == 7, "group 2 back")
	check(s.recall(2, 5100), "a second tap soon after: go there")
	s.click(-1, false, 9000)
	check(s.is_empty(), "a click on open ground clears")


func test_touch_gestures() -> void:
	var g := TouchGestures.new()
	var kinds := func(a: Array) -> Array: return a.map(func(i: Dictionary) -> String: return i["kind"])
	# a tap
	check(kinds.call(g.feed(_touch(0, Vector2(100, 100), true), 0)) == [], "down: nothing yet")
	check(kinds.call(g.feed(_touch(0, Vector2(103, 101), false), 120)) == ["tap"], "a tap")
	# a drag pans
	g.feed(_touch(0, Vector2(100, 100), true), 1000)
	check(kinds.call(g.feed(_drag(0, Vector2(140, 100), Vector2(40, 0)), 1050)) == ["pan"], "a drag pans")
	check(kinds.call(g.feed(_touch(0, Vector2(140, 100), false), 1100)) == [], "no tap after a drag")
	# hold, then drag: a box
	g.feed(_touch(0, Vector2(50, 50), true), 2000)
	check(kinds.call(g.tick(2400)) == ["box_start"], "held still: a box starts")
	check(kinds.call(g.feed(_drag(0, Vector2(150, 120), Vector2(100, 70)), 2500)) == ["box_move"], "the box follows")
	var end := g.feed(_touch(0, Vector2(150, 120), false), 2600)
	check(kinds.call(end) == ["box_end"] and end[0]["rect"] == Rect2(50, 50, 100, 70), "the box ends: %s" % [end])
	# two fingers pinch
	g.feed(_touch(0, Vector2(100, 100), true), 4000)
	g.feed(_touch(1, Vector2(200, 100), true), 4010)
	var z := g.feed(_drag(1, Vector2(300, 100), Vector2(100, 0)), 4050)
	check(kinds.call(z) == ["zoom", "pan"] and is_equal_approx(z[0]["by"], 2.0), "a pinch zooms: %s" % [z])
	g.feed(_touch(1, Vector2(300, 100), false), 4100)
	check(kinds.call(g.feed(_touch(0, Vector2(100, 100), false), 4120)) == [], "no tap after a pinch")


func test_site_snap() -> void:
	check(RegionInput.snap_site(Vector2(10.7, 4.2), 3, 3) == Vector2(10.5, 4.5), "odd sides on a tile's centre")
	check(RegionInput.snap_site(Vector2(10.7, 4.2), 4, 4) == Vector2(11, 4), "even sides on a corner")


static func _ints(a: Array) -> Array:
	return a.map(func(x: Variant) -> int: return int(x))


static func _touch(i: int, p: Vector2, down: bool) -> InputEventScreenTouch:
	var e := InputEventScreenTouch.new()
	e.index = i
	e.position = p
	e.pressed = down
	return e


static func _drag(i: int, p: Vector2, rel: Vector2) -> InputEventScreenDrag:
	var e := InputEventScreenDrag.new()
	e.index = i
	e.position = p
	e.relative = rel
	return e
