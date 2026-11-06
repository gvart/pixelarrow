## The pre-built towns match TS (godot/tests/golden/vectors/prebuilt.json, src/dev/vectors/prebuilt.ts): the tables,
## and every scripted scenario replayed step by step over the same fake works and host, with the same works calls
## (foul, vanish) and the same answers (towns, population, prestige, upkeep, douse, blessed, saveRoot).
extends TestCase

const W := preload("res://tests/sim/wild.gd")


func _init() -> void:
	SimData.load({
		"war_stats": GameData.table("derived/war_stats")["WAR_STATS"],
		"economy": GameData.table("src/war/sim/economy"),
		"src/war/sim/prebuilt": GameData.table("src/war/sim/prebuilt"),
	})


func test_tables_match_ts() -> void:
	var t := GameData.table("src/war/sim/prebuilt")
	var c: Dictionary = W.vectors("prebuilt")["consts"]
	for k in c:
		check(W.diff(t[k], c[k]) == "", k)


func test_towns_match_ts() -> void:
	var n := 0
	for sc in W.vectors("prebuilt")["scenarios"]:
		n += 1
		var p := Towns.create(sc["start"], int(sc["mob"]))
		for rec in sc["steps"]:
			var where := "scenario %d t %d" % [n, int(rec["t"])]
			p.apply(rec.get("d", []))
			p.tick(rec["t"])
			var d := W.diff(p.take_calls(), rec["c"], where + " calls")
			if d == "" and rec.has("p"):
				d = W.diff(p.probes(), rec["p"], where + " probes")
			if d != "":
				fail(d)
				return
	check(n == 36, "%d scenarios" % n)
