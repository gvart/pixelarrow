## The GDScript frame decoder (src/client/delta_decoder.gd) hands out the snapshots the TS DeltaDecoder does
## (godot/tests/golden/vectors/codec.json, src/dev/vectors/codec.ts): seeded frame streams through every field, with
## keyframes among the deltas. Numbers match exactly, except the floats inside the JSON blocks, which Godot's JSON may
## round an ulp off (to 1e-12 relative).
extends TestCase


func test_decoder_matches_ts() -> void:
	var v: Dictionary = GameData.read_exact("res://tests/golden/vectors/codec.json")
	var runs: Array = v["runs"]
	check(runs.size() > 0, "no runs in vectors/codec.json")
	for run in runs:
		var dec := DeltaDecoder.new(int(LocalRoom.constants()["NET_VERSION"]), float(LocalRoom.constants()["QUANT"]))
		var frames: Array = run["frames"]
		for i in frames.size():
			var snap = dec.apply(Marshalls.base64_to_raw(frames[i]))
			var why := near(snap, run["snaps"][i], "seed %d frame %d" % [run["seed"], i])
			if why != "":
				fail(why)
				return


## "" when a and b are the same (numbers to 1e-12 relative, keys on both sides); else where they first differ.
static func near(a: Variant, b: Variant, path := "") -> String:
	if (a is int or a is float) and (b is int or b is float):
		var fa := float(a)
		var fb := float(b)
		return "" if fa == fb or absf(fa - fb) <= 1e-12 * maxf(1.0, absf(fb)) else "%s: %s, TS %s" % [path, var_to_str(fa), var_to_str(fb)]
	if a is Array and b is Array:
		if a.size() != b.size():
			return "%s: %d items, TS %d" % [path, a.size(), b.size()]
		for i in a.size():
			var d := near(a[i], b[i], "%s[%d]" % [path, i])
			if d != "":
				return d
		return ""
	if a is Dictionary and b is Dictionary:
		for k in a:
			if not b.has(k):
				return "%s.%s: only in GDScript" % [path, k]
		for k in b:
			if not a.has(k):
				return "%s.%s: missing in GDScript" % [path, k]
			var d := near(a[k], b[k], "%s.%s" % [path, k])
			if d != "":
				return d
		return ""
	if typeof(a) != typeof(b) or a != b:
		return "%s: %s, TS %s" % [path, str(a), str(b)]
	return ""
