## Crafting matches TS (godot/tests/golden/vectors/crafting.json, src/dev/vectors/crafting.ts): item rolls, grades,
## recipes, repair costs, refusals and dishes; and two seeded queue runs (every dep, then only the required ones) step by
## step: results, dep calls, queues, supplies and stocks.
extends TestCase

const Deep = preload("res://tests/sim/goods_deep.gd")


func test_crafting_rules_match_ts() -> void:
	Deep.load_tables()
	var rules: Dictionary = GameData.read_exact("res://tests/golden/vectors/crafting.json")["rules"]
	var got := GoodsProbe.crafting_rules(rules)
	for k in ["rolls", "grades", "recipes", "repairs", "refusals", "fed"]:
		var last: int = rules[k][0].size() - 1
		var want: Array = rules[k].map(func(r): return r[last])
		var d := Deep.diff(got[k], want, k)
		check(d == "", d)


func test_crafting_queues_match_ts() -> void:
	Deep.load_tables()
	for run in GameData.read_exact("res://tests/golden/vectors/crafting.json")["runs"]:
		var got := GoodsProbe.crafting_run(run)
		var steps: Array = run["steps"]
		for i in steps.size():
			var w: Dictionary = steps[i]
			for k in ["out", "log", "has", "snaps", "supplies", "stocks", "packs"]:
				var d := Deep.diff(got[i][k], w[k], "full %s step %d (%s) %s" % [run["full"], i, w["op"], k])
				if d != "":
					fail(d)
					return
