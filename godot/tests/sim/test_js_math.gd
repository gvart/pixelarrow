## JsMath gives the doubles V8 gives (godot/tests/golden/vectors/jsmath.json, src/dev/godotVectors.ts).
extends TestCase


func _bits(x: float) -> String:
	var b := PackedByteArray()
	b.resize(8)
	b.encode_double(0, x)
	return b.hex_encode()


func test_hypot_matches_v8() -> void:
	var bad := 0
	for v in GameData.read_exact("res://tests/golden/vectors/jsmath.json")["hypot"]:
		var got := JsMath.hypot(v[0], v[1])
		if _bits(got) != _bits(v[2]):
			bad += 1
			if bad <= 3:
				fail("hypot(%s, %s) = %s, V8 %s" % [String.num(v[0], 17), String.num(v[1], 17), String.num(got, 17), String.num(v[2], 17)])
	check(bad == 0, "%d hypot mismatches" % bad)


func test_round_matches_js() -> void:
	for v in GameData.read_exact("res://tests/golden/vectors/jsmath.json")["round"]:
		var got := JsMath.round_js(v[0])
		check(_bits(got) == _bits(float(v[1])), "round(%s) = %s, JS %s" % [String.num(v[0], 17), String.num(got, 17), str(v[1])])
