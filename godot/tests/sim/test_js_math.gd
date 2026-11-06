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


func _check_fn(name: String, f: Callable, arity: int) -> void:
	var bad := 0
	for v in GameData.read_exact("res://tests/golden/vectors/jsmath.json")[name]:
		var got: float = f.call(v[0]) if arity == 1 else f.call(v[0], v[1])
		var want: float = v[arity]
		if _bits(got) != _bits(want):
			bad += 1
			if bad <= 3:
				fail("%s%s = %s, V8 %s" % [name, str(v.slice(0, arity)), String.num(got, 17), String.num(want, 17)])
	check(bad == 0, "%d %s mismatches" % [bad, name])


func test_trig_log_pow_match_v8() -> void:
	_check_fn("sin", JsMath.sin, 1)
	_check_fn("cos", JsMath.cos, 1)
	_check_fn("tan", JsMath.tan, 1)
	_check_fn("atan2", JsMath.atan2, 2)
	_check_fn("log2", JsMath.log2, 1)
	_check_fn("pow", JsMath.pow, 2)
