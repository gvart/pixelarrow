## Landmark state matches TS (godot/tests/golden/vectors/landmarks.json, src/dev/vectors/landmarks.ts): the tables,
## landmarkOfRegion, restoreCost and canLead, and every step of the runs on the landmark regions replayed input by input
## with the same works calls, notes, snap, flags and root.
extends TestCase

const T := preload("res://tests/sim/test_tunnel.gd")

static var v: Dictionary = GameData.read_exact("res://tests/golden/vectors/landmarks.json")


func _init() -> void:
	SimData.load({
		"war_stats": GameData.table("derived/war_stats")["WAR_STATS"],
		"landmarks": GameData.table("src/war/sim/landmarks"),
		"war_landmarks": GameData.table("src/data/warLandmarks"),
		"professions": GameData.table("src/data/professions"),
	})


func test_tables_match_ts() -> void:
	check(T.diff(GameData.table("src/war/sim/landmarks")["LANDMARK"], v["landmark"]) == "", "LANDMARK")
	for c in v["ofRegion"]:
		check(Landmarks.landmark_of_region(c[0]) == c[1], "landmarkOfRegion(%s)" % c[0])
	for c in v["costs"]:
		var d := T.diff(Landmarks.restore_cost(c[0]), c[1])
		check(d == "", "restoreCost(%s)%s" % [c[0], d])
		check(Landmarks.restore_cost(c[0]).keys() == c[1].keys(), "restoreCost(%s) key order" % c[0])
	for c in v["leads"]:
		check(Landmarks.can_lead(c[0], c[1], c[2]) == c[3], "canLead %s" % [c])


func test_runs_match_ts() -> void:
	for run in v["runs"]:
		var lm := Landmarks.create(run["region"])
		lm.set_base(run["base"])
		for k in run["steps"].size():
			var s: Dictionary = run["steps"][k]
			lm.set_world(s["world"])
			lm.set_answers(s["answers"])
			var inp: Array = s["input"]
			var result = null
			match inp[0]:
				"tick":
					lm.tick(inp[1])
				"restore":
					result = lm.restore(inp[1], inp[2])
				"reset":
					lm.reset()
				"remember":
					lm.remember(inp[1], inp[2])
				"reload":
					lm.reload()
			var d := T.diff(lm.take_calls(), s["calls"], "calls")
			if d == "":
				d = T.diff([result, lm.any(), lm.snap(), lm.flags(), lm.save_root()], [s["result"], s["any"], s["snap"], s["flags"], s["root"]], "after")
			if d != "":
				fail("%s step %d (%s): %s" % [run["region"], k, inp[0], d])
				break
