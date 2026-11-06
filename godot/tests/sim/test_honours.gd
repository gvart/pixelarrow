## Battle honours match TS (godot/tests/golden/vectors/honours.json, src/dev/vectors/honours.ts): honoursOf, in order.
extends TestCase

const W := preload("res://tests/sim/wild.gd")


func test_honours_match_ts() -> void:
	W.load_data()
	var i := 0
	for f in W.vectors("honours")["fights"]:
		var d := W.diff(WildProbe.honours_of(f[0], f[1]), f[2], "fight %d" % i)
		if d != "":
			fail(d)
			return
		i += 1
