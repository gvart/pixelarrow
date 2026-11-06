## Region depth matches TS (godot/tests/golden/vectors/depth.json, src/dev/vectors/depth.ts): depthOf and its rule
## for every region, world ids and odd depths.
extends TestCase

const W := preload("res://tests/sim/wild.gd")


func test_depth_matches_ts() -> void:
	W.load_data()
	for c in W.vectors("depth")["cases"]:
		var r: Dictionary = c[0]
		var got := [WildProbe.depth_of(r)] + WildProbe.depth_rule(r)
		var d := W.diff(got, c.slice(1), str(r))
		if d != "":
			fail(d)
			return


func test_region_meta_depth() -> void:
	W.load_data()
	for id in ["dodona", "kyrene-n", "ammon", "test-ridge"]:
		var meta := Region.load_id(id).meta
		var want := 0.0
		for c in W.vectors("depth")["cases"]:
			if c[0]["id"] == id and not c[0].has("depth"):
				want = c[1]
				break
		check(WildProbe.depth_of(meta) == want, "%s: depth %s, TS %s" % [id, WildProbe.depth_of(meta), want])
