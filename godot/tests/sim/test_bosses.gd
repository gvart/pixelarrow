## The guardians match TS tick by tick (godot/tests/golden/vectors/bosses.json, src/dev/vectors/bosses.ts): with the men
## and squads the TS world made replayed in, every host call they make (spawns, orders, blows, knocks, places, notes,
## gates, rolls), the men and squads the calls and the tick changed, and the snapshots are the same; so are bossLoot and
## bossPile (the items, trophies and goods of a kill).
extends TestCase

const W := preload("res://tests/sim/wild.gd")


static func _load() -> void:
	var items := GameData.table("src/data/items")
	SimData.load({
		"war_stats": GameData.table("derived/war_stats")["WAR_STATS"],
		"src/war/sim/depth": GameData.table("src/war/sim/depth"),
		"src/war/sim/bosses": GameData.table("src/war/sim/bosses"),
		"src/data/warBosses": GameData.table("src/data/warBosses"),
		"items": items["ITEMS"],
		"src/data/items": items,
		"item_paint": GameData.table("derived/item_paint"),
		"affixes": GameData.table("src/data/affixes"),
		"derived_boss_loot": GameData.table("derived/boss_loot"),
	})


func test_bosses_match_ts() -> void:
	_load()
	for sc in W.vectors("bosses")["scenarios"]:
		var meta := Region.load_id(sc["region"]).meta
		var p := BossProbe.create(meta, sc["w"], sc["h"], int(sc["seed"]), sc["water"], sc["walls"], sc["levels"], sc["claimed"])
		for rec in sc["ticks"]:
			var t := int(rec["t"])
			var where := "%s t %d" % [sc["region"], t]
			p.apply(rec)
			for c in rec.get("c", []):
				var got = p.call_api(c.slice(0, c.size() - 1))
				var d := W.diff(got, c[c.size() - 1], "%s call %s" % [where, str(c)])
				if d != "":
					fail(d)
					return
			p.tick(t)
			var d := W.diff(p.take_events(), rec.get("e", []), where + " events")
			if d == "":
				d = W.diff(p.changed(), [rec.get("a", []), rec.get("aq", [])], where + " changed")
			if d == "" and rec.has("s"):
				d = W.diff(p.snaps(), rec["s"], where + " snaps")
			if d != "":
				fail(d)
				return
		for pe in sc["piles"]:
			var d := W.diff(BossProbe.boss_pile(sc["region"], "vec", pe[0]), pe[1], "%s pile" % sc["region"])
			if d != "":
				fail(d)
				return


func test_boss_loot_matches_ts() -> void:
	_load()
	var v := W.vectors("bosses")
	for c in v["loot"]:
		var d := W.diff(BossProbe.boss_loot(c[0], c[1]), c[2], "bossLoot(%s, %s)" % [c[0], c[1]])
		check(d == "", d)
	for c in v["piles"]:
		var d := W.diff(BossProbe.boss_pile(c[0], c[1], c[2]), c[3], "bossPile(%s, %s, %s)" % [c[0], c[1], str(c[2])])
		check(d == "", d)
