## The sim's pure combat and formation rules match TS (godot/tests/golden/vectors/rules.json, src/dev/godotVectors.ts).
extends TestCase


func _v() -> Dictionary:
	return GameData.read_exact("res://tests/golden/vectors/rules.json")


func _bits(x: float) -> String:
	var b := PackedByteArray()
	b.resize(8)
	b.encode_double(0, x)
	return b.hex_encode()


func _same(got: float, want: float, what: String) -> void:
	check(_bits(got) == _bits(want), "%s: %s, TS %s" % [what, String.num(got, 17), String.num(want, 17)])


func test_combat_constants_match_ts() -> void:
	var ts: Dictionary = GameData.table("src/war/sim/combat")["COMBAT"]
	var cpp := SimProbe.combat_constants()
	check(ts.size() == cpp.size(), "COMBAT has %d keys in TS, %d in C++" % [ts.size(), cpp.size()])
	for k in ts:
		check(cpp.has(k) and _bits(cpp[k]) == _bits(ts[k]), "COMBAT.%s: C++ %s, TS %s" % [k, str(cpp.get(k)), str(ts[k])])


func test_heights() -> void:
	for h in _v()["heights"]:
		_same(SimProbe.melee_height(h[0]), h[1], "melee_height(%s)" % str(h[0]))
		_same(SimProbe.missile_height(h[0]), h[2], "missile_height(%s)" % str(h[0]))
		_same(SimProbe.height_range(h[0]), h[3], "height_range(%s)" % str(h[0]))


func test_block_hit_armour() -> void:
	var v := _v()
	for b in v["blocks"]:
		_same(SimProbe.block_chance(b[0], b[1], b[2], b[3], b[4], b[5]), b[6], "block_chance%s" % str(b.slice(0, 6)))
	for h in v["hits"]:
		_same(SimProbe.hit_chance(h[0], h[1], h[2], h[3]), h[4], "hit_chance%s" % str(h.slice(0, 4)))
	for a in v["armour"]:
		_same(SimProbe.after_armour(a[0], a[1], a[2]), a[3], "after_armour%s" % str(a.slice(0, 3)))


func test_formation_offsets() -> void:
	for f in _v()["forms"]:
		var got := SimProbe.formation_offsets(f[0], int(f[1]), int(f[2]))
		var want: Array = f[3]
		if got.size() != want.size():
			fail("%s %d: %d values, TS %d" % [f[0], int(f[1]), got.size(), want.size()])
			continue
		for i in got.size():
			if _bits(got[i]) != _bits(want[i]):
				fail("%s %d: slot value %d is %s, TS %s" % [f[0], int(f[1]), i, String.num(got[i], 17), String.num(want[i], 17)])
				break
