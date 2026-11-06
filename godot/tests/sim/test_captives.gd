## Captive rules match TS (godot/tests/golden/vectors/captives.json, src/dev/vectors/captives.ts): refuseChance,
## refuses (the per-man hash), askAt, soulRegions.
extends TestCase

const W := preload("res://tests/sim/wild.gd")


func test_refusals_match_ts() -> void:
	W.load_data()
	var v := W.vectors("captives")
	for c in v["chances"]:
		check(WildProbe.refuse_chance(c[0]) == c[1], "refuseChance(%s) = %s, TS %s" % [c[0], WildProbe.refuse_chance(c[0]), c[1]])
	for c in v["refusals"]:
		check(WildProbe.refuses(c[0], c[1]) == c[2], "refuses(%s, %s) = %s, TS %s" % [c[0], c[1], WildProbe.refuses(c[0], c[1]), c[2]])
	for c in v["asks"]:
		check(WildProbe.ask_at(c[0]) == c[1], "askAt(%s) = %s, TS %s" % [c[0], WildProbe.ask_at(c[0]), c[1]])


func test_soul_regions_match_ts() -> void:
	W.load_data()
	for c in W.vectors("captives")["souls"]:
		var d := W.diff(WildProbe.soul_regions(c[0]), c[1], "soulRegions(%s)" % c[0])
		check(d == "", d)
