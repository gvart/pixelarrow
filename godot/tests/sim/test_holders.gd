## Holders match TS step by step (godot/tests/golden/vectors/holders.json, src/dev/vectors/holders.ts): puts, takes,
## pays, moves (by good, most plentiful, unsealed, tribute draws), spoils, every query and the four holds after each.
extends TestCase

const Deep = preload("res://tests/sim/goods_deep.gd")


func test_holders_match_ts() -> void:
	Deep.load_tables()
	var want: Dictionary = GameData.read_exact("res://tests/golden/vectors/holders.json")
	var got := GoodsProbe.holders(want)
	var steps: Array = want["steps"]
	for i in steps.size():
		var w: Dictionary = steps[i]
		var g: Dictionary = got["steps"][i]
		for k in ["out", "q", "holds"]:
			if w.has(k) or g.has(k):
				var d := Deep.diff(g.get(k), w.get(k), "step %d (%s) %s" % [i, w["op"], k])
				if d != "":
					fail(d)
					return
	for k in ["perLoad", "seals"]:
		var d := Deep.diff(got[k], want[k], k)
		check(d == "", d)
