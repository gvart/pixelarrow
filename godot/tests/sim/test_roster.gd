## The soldier roster matches TS (godot/tests/golden/vectors/roster.json, src/dev/vectors/roster.ts): makePerson,
## autoSpend, the level-up offers and their picks, spendLevel, promotion, grantXp, and every scripted roster replayed op
## by op with the same answers, persons (in order), fit list and states.
extends TestCase

const W := preload("res://tests/sim/wild.gd")

static var v: Dictionary = W.vectors("roster")


func _init() -> void:
	var t := {"war_stats": GameData.table("derived/war_stats")["WAR_STATS"]}
	for n in W.TABLES + ["src/war/sim/civilians", "src/data/classes", "src/data/items", "src/data/affixes", "src/war/sim/roster"]:
		t[n] = GameData.table(n)
	SimData.load(t)


func test_consts_match_ts() -> void:
	var d := W.diff(Roster.consts(), v["consts"], "consts")
	check(d == "", d)


func test_make_person_and_auto_spend_match_ts() -> void:
	for m in v["made"]:
		var d := W.diff(Roster.make_person(m[0], m[1], m[2]), m[3], "makePerson %s %s %s" % [m[0], m[1], m[2]])
		if d != "":
			fail(d)
			return
	for s in v["spent"]:
		var d := W.diff(Roster.auto_spend(s[0]), s[1], "autoSpend %s" % s[0]["id"])
		if d != "":
			fail(d)
			return


func test_offers_and_spends_match_ts() -> void:
	for o in v["offers"]:
		var p: Dictionary = o[0]
		var where := "offers %s" % p["id"]
		var offers := Roster.level_offers(p)
		var d := W.diff(offers, o[1], where)
		for i in offers.size():
			if d == "":
				d = W.diff(Roster.apply_offer(p, offers[i]), o[2][i], "%s applyOffer %d" % [where, i])
		if d == "":
			d = W.diff(Roster.apply_offer(p, {"kind": "attr", "attr": "str", "n": o[3][0]}), o[3][1], where + " attr")
		if d == "":
			d = W.diff(Roster.apply_offer(p, {"kind": "skill", "skill": o[4][0]}), o[4][1], where + " skill")
		if d != "":
			fail(d)
			return
	for s in v["spends"]:
		var d := W.diff(Roster.spend_level(s[0], s[1], s[2]), s[3], "spendLevel %s %s %s" % [s[0]["id"], s[1], s[2]])
		if d != "":
			fail(d)
			return


func test_promotion_and_xp_match_ts() -> void:
	for p in v["promotes"]:
		check(W.diff(Roster.promotes_to(p[0]), p[1]) == "", "promotesTo %s" % p[0])
	for b in v["blockers"]:
		var d := W.diff(Roster.promote_blocker(b[0], b[1]), b[2], "promoteBlocker %s %s" % [b[0]["id"], b[1]])
		if d == "" and b[3] != null:
			d = W.diff(Roster.promote_person(b[0], b[1]), b[3], "promotePerson %s" % b[0]["id"])
		if d != "":
			fail(d)
			return
	for x in v["xps"]:
		var d := W.diff(Roster.grant_xp(x[0], x[1]), x[2], "grantXp %s" % x[0]["id"])
		if d != "":
			fail(d)
			return


func test_rosters_match_ts() -> void:
	var n := 0
	for steps in v["rosters"]:
		n += 1
		var ro := Roster.create()
		for k in steps.size():
			var s: Dictionary = steps[k]
			var where := "roster %d op %d %s" % [n, k, s["input"][0]]
			if s["input"][0] == "promote" and s["input"][3] != null:
				ro.op(["update", s["input"][3]]) # the driver's update just before (levelled, an honour)
			var d := W.diff(ro.op(s["input"]), s["out"], where + " out")
			if d == "":
				d = W.diff(ro.all(), s["all"], where + " all")
			if d == "":
				d = W.diff(ro.fit(), s["fit"], where + " fit")
			if d == "":
				var states := []
				for p in ro.all():
					states.append(ro.state(p["id"]))
				d = W.diff(states, s["states"], where + " states")
			if d != "":
				fail(d)
				return
	check(n == 6, "%d rosters" % n)
