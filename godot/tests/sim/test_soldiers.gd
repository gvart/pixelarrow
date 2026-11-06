## Soldier rules match TS (godot/tests/golden/vectors/soldiers.json, src/dev/vectors/soldiers.ts): woundedShare, gainXp.
extends TestCase

const W := preload("res://tests/sim/wild.gd")


func test_wounded_share_matches_ts() -> void:
	W.load_data()
	for c in W.vectors("soldiers")["shares"]:
		var got := WildProbe.wounded_share(c[0], c[1])
		check(got == c[2], "woundedShare(%s, %s) = %s, TS %s" % [c[0], c[1], var_to_str(got), var_to_str(c[2])])


func test_gain_xp_matches_ts() -> void:
	W.load_data()
	for c in W.vectors("soldiers")["xp"]:
		var d := W.diff(WildProbe.gain_xp(c[0], c[1], c[2], c[3]), c.slice(4), "gainXp(%s)" % str(c.slice(0, 4)))
		if d != "":
			fail(d)
			return
