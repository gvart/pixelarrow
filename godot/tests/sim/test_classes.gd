## A person's war stats, the path perks and a chief's loot match TS (godot/tests/golden/vectors/classes.json,
## src/dev/vectors/classes.ts): warStatsOf with withPerks under a path, perkFx, chiefLoot.
extends TestCase

const W := preload("res://tests/sim/wild.gd")


func test_war_stats_match_ts() -> void:
	W.load_data()
	var v: Dictionary = W.vectors("classes")
	var i := 0
	for c in v["persons"]:
		var d := W.diff(SimProbe.war_stats(c["person"], c["path"], float(c["level"])), c["stats"], "person %d (%s)" % [i, c["person"]["hero"].get("cls", "?")])
		if d == "":
			d = W.diff(SimProbe.war_stats(c["person"], "", 1.0), c["bare"], "person %d bare" % i)
		if d != "":
			fail(d)
			return
		i += 1
	check(i > 100, "only %d persons" % i)


func test_paths_match_ts() -> void:
	W.load_data()
	var v: Dictionary = W.vectors("classes")
	for c in v["caps"]:
		var d := W.diff(SimProbe.path_caps(c[0]), c.slice(1), "caps of '%s'" % c[0])
		if d != "":
			fail(d)
			return
	for r in v["refusals"]:
		var d := W.diff(SimProbe.man_refusal(r[0], r[1], float(r[2]), float(r[3])), r.slice(4), "manRefusal(%s, %s, %d, %d)" % [str(r[0]), r[1], int(r[2]), int(r[3])])
		if d != "":
			fail(d)
			return


func test_perk_fx_match_ts() -> void:
	W.load_data()
	for p in W.vectors("classes")["perks"]:
		var d := W.diff(SimProbe.perk_fx(p[0], float(p[1])), p[2], "perkFx(%s, %d)" % [p[0], int(p[1])])
		if d != "":
			fail(d)
			return


func test_chief_loot_match_ts() -> void:
	W.load_data()
	var items := 0
	for l in W.vectors("classes")["loot"]:
		var got: Dictionary = SimProbe.chief_loot(l[0], float(l[1]), l[2])
		var d := W.diff(got["goods"], l[3], "chiefLoot(%s, %d, %s).goods" % [l[0], int(l[1]), l[2]])
		if d == "":
			d = W.diff(got["item"], l[4], "chiefLoot(%s, %d, %s).item" % [l[0], int(l[1]), l[2]])
		if d != "":
			fail(d)
			return
		if l[4] != null:
			items += 1
	check(items > 0, "no chief loot vector drops an item")
