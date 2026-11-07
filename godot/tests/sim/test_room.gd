## The region room on the C++ sim (LocalRoom, room.h) matches the TS room (server/src/war/room.ts) message for message
## (godot/tests/golden/vectors/room.json, src/dev/vectors/room.ts): the same scripted client messages (joins, the
## quota's line, orders and their refusals, placement checks, the dev helpers, a fight) replayed into LocalRoom give the
## same server messages in the same order: JSON messages as JSON.stringify writes them (keys in order, numbers as TS
## has them) and binary frames byte for byte. And the wire constants LocalRoom keeps are the TS ones.
extends TestCase

const W := preload("res://tests/sim/wild.gd")
const Traces := preload("res://tests/sim/test_traces.gd")


func test_constants_match_ts() -> void:
	Traces._load()
	var why := W.diff(LocalRoom.constants(), W.vectors("room")["consts"], "consts")
	check(why == "", why)


func test_room_matches_ts() -> void:
	Traces._load()
	var runs: Array = W.vectors("room")["runs"]
	check(runs.size() > 0, "no runs in vectors/room.json")
	for run in runs:
		var id: String = run["id"]
		var region := Region.load_id(run["region"])
		var sim := Sim.create(region.grid(), region.meta, region.cells, int(run["seed"]))
		var room := LocalRoom.create(sim, run["opts"])
		var frames := 0
		var msgs := 0
		var steps: Array = run["steps"]
		for n in steps.size():
			var step: Dictionary = steps[n]
			if step.get("tick", false):
				room.tick()
			elif step.has("close"):
				room.close(int(step["close"]))
			else:
				room.send_as(int(step["pid"]), step["msg"])
			var why := _same(room.take(), step["out"])
			if why != "":
				fail("%s step %d (tick %d, %s): %s" % [id, n, room.current_tick(), "tick" if step.get("tick", false) else str(step.get("msg", step)).left(120), why])
				return
			for o in step["out"]:
				if o[1].has("frame"):
					frames += 1
				else:
					msgs += 1
		var fallen := 0
		for u in room.snapshot()["units"]:
			if u["state"] == "dead":
				fallen += 1
		print("%s: %d steps to tick %d (%d men fell), %d messages and %d frames the same" % [id, steps.size(), room.current_tick(), fallen, msgs, frames])


## "" when the room's messages are the TS ones; else the first difference.
static func _same(got: Array, want: Array) -> String:
	for i in maxi(got.size(), want.size()):
		if i >= got.size() or i >= want.size():
			return "%d messages, TS %d (%s)" % [got.size(), want.size(), _kinds(got if i < got.size() else want, i)]
		var g: Array = got[i]
		var w: Array = want[i]
		if int(g[0]) != int(w[0]):
			return "message %d to player %d, TS %d" % [i, g[0], w[0]]
		var wm: Dictionary = w[1]
		if wm.has("frame"):
			if not g[1] is PackedByteArray:
				return "message %d: %s, TS a frame" % [i, LocalRoom.js_json(g[1]).left(160)]
			var tb := Marshalls.base64_to_raw(wm["frame"])
			var gb: PackedByteArray = g[1]
			if gb != tb:
				var at := 0
				while at < mini(gb.size(), tb.size()) and gb[at] == tb[at]:
					at += 1
				return "frame %d: %d bytes, TS %d; first differs at byte %d" % [i, gb.size(), tb.size(), at]
			continue
		if g[1] is PackedByteArray:
			return "message %d: a frame, TS %s" % [i, LocalRoom.js_json(wm).left(160)]
		var gj := LocalRoom.js_json(g[1])
		var wj := LocalRoom.js_json(wm)
		if gj != wj:
			var d := W.diff(g[1], wm, "message %d" % i)
			return d if d != "" else "message %d key order: %s, TS %s" % [i, gj.left(200), wj.left(200)]
	return ""


static func _kinds(a: Array, from: int) -> String:
	var out := PackedStringArray()
	for i in range(from, a.size()):
		var m: Variant = a[i][1]
		out.append("frame" if m is PackedByteArray or (m is Dictionary and m.has("frame")) else str(m.get("t")))
	return "from %d: %s" % [from, ", ".join(out)]
