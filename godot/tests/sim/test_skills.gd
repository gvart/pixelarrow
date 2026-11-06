## War skills match TS (godot/tests/golden/vectors/skills.json, src/dev/vectors/skills.ts): activeCooldown, legalSkills.
extends TestCase

const W := preload("res://tests/sim/wild.gd")


func test_active_cooldown_matches_ts() -> void:
	W.load_data()
	for c in W.vectors("skills")["cooldowns"]:
		check(WildProbe.active_cooldown(c[0]) == c[1], "activeCooldown(%s) = %s, TS %s" % [c[0], WildProbe.active_cooldown(c[0]), c[1]])


func test_legal_skills_matches_ts() -> void:
	W.load_data()
	for c in W.vectors("skills")["legal"]:
		var d := W.diff(WildProbe.legal_skills(c[0], c[1], c[2]), c[3], "legalSkills(%s, %s, %s)" % [c[0], c[1], str(c[2])])
		if d != "":
			fail(d)
			return
