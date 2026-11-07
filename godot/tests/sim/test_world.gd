## The world layer on the C++ rooms (LocalWorld, local_world.h; the World, world.h) matches the TS world
## (src/dev/localWorld.ts round server/src/war/world/world.ts) step for step (godot/tests/golden/vectors/world.json,
## src/dev/vectors/world.ts): the same seeded rooms, transfer orders, players on and off line and client messages give,
## at every step, the same world state (regions, transits, hauls, the season, its events and score, the last board) as
## JSON with its keys in order, every room's sim digest (unrounded), summary, players present and alliance AIs, the
## same messages out (JSON messages as values, binary frames by the sha of their base64), the same answers to transfer
## orders, the same world map, and the same store. The constants the C++ keeps (no data tables) are the TS ones.
extends TestCase

const W := preload("res://tests/sim/wild.gd")
const Traces := preload("res://tests/sim/test_traces.gd")
const Room := preload("res://tests/sim/test_room.gd")


func test_constants_match_ts() -> void:
	Traces._load()
	var why := W.diff(LocalWorld.constants(), W.vectors("world")["consts"], "consts")
	check(why == "", why)


func test_world_matches_ts() -> void:
	Traces._load()
	var runs: Array = W.vectors("world")["runs"]
	check(runs.size() > 0, "no runs in vectors/world.json")
	for run in runs:
		var id: String = run["id"]
		var specs := []
		for r in run["rooms"]:
			var region := Region.load_id(r["id"])
			var s: Dictionary = r.duplicate()
			s["grid"] = region.grid()
			s["meta"] = region.meta
			s["cells"] = region.cells
			specs.append(s)
		var o: Dictionary = run["opts"]
		var w := LocalWorld.create(specs, {"ms_per_tick": o.get("msPerTick", 100), "season": o.get("season", {}), "start": o.get("start", 0)})
		var steps: Array = run["steps"]
		var msgs := 0
		var frames := 0
		for n in steps.size():
			var step: Dictionary = steps[n]
			var why := ""
			if step.has("ticks"):
				for i in int(step["ticks"]):
					w.step()
			elif step.has("transfer"):
				var t: Dictionary = step["transfer"]
				var order := {"from": t["from"], "to": t["to"]}
				if t.has("path"):
					order["path"] = t["path"]
				why = Room._json(w.transfer(int(t["pid"]), order), step["res"], "transfer")
			elif step.has("online"):
				w.set_online(int(step["online"]["pid"]), bool(step["online"]["on"]))
			elif step.has("send"):
				var s: Dictionary = step["send"]
				w.send(s["region"], int(s["pid"]), s["msg"])
			elif step.has("seed"):
				var s: Dictionary = step["seed"]
				w.seed(int(s["pid"]), int(s["alliance"]), s["persons"])
			elif step.has("map"):
				why = Room._json(w.snapshot(int(step["map"])), step["res"], "map")
			var want: Variant = step.get("got", step.get("start"))
			if why == "" and want != null:
				why = _look(w, want)
			if why == "":
				why = _out(w.take(), step["out"])
			if why == "" and step.has("store"):
				var dump: Dictionary = w.store_dump()
				var ws: Dictionary = step["store"]
				for k in ws:
					why = W.diff(dump[k], ws[k], "store.%s" % k)
					if why != "":
						break
			if why != "":
				fail("%s step %d (tick %d, %s): %s" % [id, n, w.get_tick(), str(step.keys()[0]), why])
				return
			for m in step["out"]:
				if m[2].has("frame"):
					frames += 1
				else:
					msgs += 1
		var st: Dictionary = w.state()
		print("%s: %d steps to tick %d, season %d (%s), %d messages and %d frames the same" % [id, steps.size(), w.get_tick(), int(st["season"]["id"]), str(st.get("last", {}).get("scores", st["season"]["scores"])), msgs, frames])


## "" when the world and its rooms look as the TS ones did; else the first difference.
static func _look(w: LocalWorld, want: Dictionary) -> String:
	if w.get_tick() != int(want["tick"]):
		return "tick %d, TS %d" % [w.get_tick(), int(want["tick"])]
	var why := Room._json(w.state(), want["world"], "world")
	if why != "":
		return why
	var ids := w.room_ids()
	var rooms: Array = want["rooms"]
	if ids.size() != rooms.size():
		return "%d rooms, TS %d" % [ids.size(), rooms.size()]
	for x in rooms:
		var room := w.room(x["id"])
		if room == null:
			return "no room %s" % x["id"]
		why = Traces._differs(room.get_sim().digest(), x["digest"], 0.0)
		if why == "":
			why = Room._json(room.summary(), x["summary"], "%s summary" % x["id"])
		if why == "" and room.present() != int(x["present"]):
			why = "present %d, TS %d" % [room.present(), int(x["present"])]
		if why == "":
			why = W.diff(w.ai_stats(x["id"]), x["ai"], "%s ai" % x["id"])
		if why != "":
			return "%s: %s" % [x["id"], why]
	return ""


## "" when the world's messages are the TS ones ([region, pid, message]; a frame by the sha of its base64).
static func _out(got: Array, want: Array) -> String:
	for i in maxi(got.size(), want.size()):
		if i >= got.size() or i >= want.size():
			return "%d messages, TS %d" % [got.size(), want.size()]
		var g: Array = got[i]
		var t: Array = want[i]
		if g[0] != t[0] or int(g[1]) != int(t[1]):
			return "message %d to %s/%d, TS %s/%d" % [i, g[0], int(g[1]), t[0], int(t[1])]
		var tm: Dictionary = t[2]
		if tm.has("frame"):
			if not g[2] is PackedByteArray:
				return "message %d: %s, TS a frame" % [i, LocalRoom.js_json(g[2]).left(160)]
			if Marshalls.raw_to_base64(g[2]).sha256_text() != tm["frame"]:
				return "frame %d (%s, tick %d) differs" % [i, g[0], i]
			continue
		if g[2] is PackedByteArray:
			return "message %d: a frame, TS %s" % [i, LocalRoom.js_json(tm).left(160)]
		var why := Room._json(g[2], tm, "message %d" % i)
		if why != "":
			return why
	return ""
