## Loot piles and safe zones match TS step by step (godot/tests/golden/vectors/trade.json, src/dev/vectors/trade.ts) on a
## real region's market court: drops, merges, claims, opens, decay and the id counter.
extends TestCase

const Deep = preload("res://tests/sim/goods_deep.gd")


func test_trade_matches_ts() -> void:
	Deep.load_tables()
	var want: Dictionary = GameData.read_exact("res://tests/golden/vectors/trade.json")
	var safe: Array = Region.load_id(want["region"]).meta["safe"]
	check(not safe.is_empty(), "%s has no safe zone" % want["region"])
	var got := GoodsProbe.trade(want, safe)
	var steps: Array = want["steps"]
	for i in steps.size():
		var w: Dictionary = steps[i]
		var g: Dictionary = got["steps"][i]
		for k in ["out", "opens", "got", "piles"]:
			if w.has(k) or g.has(k):
				var d := Deep.diff(g.get(k), w.get(k), "step %d (%s) %s" % [i, w["op"], k])
				if d != "":
					fail(d)
					return
	var d := Deep.diff(got["rects"], want["rects"], "rects")
	check(d == "", d)
