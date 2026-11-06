## Rng and hash_string give exactly the TS values (godot/tests/golden/vectors/rng.json, src/dev/godotVectors.ts).
extends TestCase


func _vectors() -> Dictionary:
	return GameData.read_exact("res://tests/golden/vectors/rng.json")


func test_sequences_match_ts() -> void:
	for v in _vectors()["seeds"]:
		var r := Rng.create(int(v["seed"]))
		var tag := "seed %d" % int(v["seed"])
		for i in v["next"].size():
			var got := r.next()
			if got != v["next"][i]:
				fail("%s next[%d]: %s, TS %s" % [tag, i, String.num(got, 17), String.num(v["next"][i], 17)])
				return
		for x in v["ints"]:
			check(r.int_in(-5, 17) == int(x), tag + " int_in")
		for x in v["ranges"]:
			check(r.range_f(-2.5, 9) == x, tag + " range_f")
		for x in v["chances"]:
			check(r.chance(0.3) == x, tag + " chance")
		for x in v["picks"]:
			check(r.pick(["a", "b", "c", "d", "e"]) == x, tag + " pick")
		for x in v["weighted"]:
			check(r.weighted([["x", 1], ["y", 3], ["z", 0.5]]) == x, tag + " weighted")
		var s := r.shuffle(range(20))
		for i in s.size():
			check(s[i] == int(v["shuffled"][i]), tag + " shuffle")
		check(r.state == int(v["state"]), tag + " end state")


func test_hash_string_matches_ts() -> void:
	for pair in _vectors()["hashes"]:
		var got := Rng.hash_string(pair[0])
		check(got == int(pair[1]), "hash_string(%s) = %d, TS %d" % [pair[0], got, int(pair[1])])
