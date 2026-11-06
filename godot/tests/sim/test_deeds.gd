## Deeds match TS (godot/tests/golden/vectors/deeds.json, src/dev/vectors/deeds.ts): plain, slayer and banner deeds,
## addDeeds.
extends TestCase

const W := preload("res://tests/sim/wild.gd")


func test_deed_names_match_ts() -> void:
	W.load_data()
	var v := W.vectors("deeds")
	for c in v["plain"]:
		var d := W.diff(WildProbe.plain_deed(c[0]), c.slice(1), "plainDeed(%s)" % c[0])
		check(d == "", d)
	for c in v["slayer"]:
		var d := W.diff(WildProbe.slayer_deed(c[0]), c.slice(1), "slayerDeed(%s)" % c[0])
		check(d == "", d)
	for c in v["mastery"]:
		var d := W.diff(WildProbe.mastery_deed(c[0], c[1]), c.slice(2), "masteryDeed(%s)" % c[0])
		check(d == "", d)


func test_add_deeds_matches_ts() -> void:
	W.load_data()
	var i := 0
	for c in W.vectors("deeds")["adds"]:
		var d := W.diff(WildProbe.add_deeds(c[0], c[1]), c.slice(2), "addDeeds %d" % i)
		if d != "":
			fail(d)
			return
		i += 1
