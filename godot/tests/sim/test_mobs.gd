## The mob controller matches TS tick by tick (godot/tests/golden/vectors/mobs.json, src/dev/vectors/mobs.ts): with the
## squads the TS world made replayed in, every host call it makes (orders, spawns, notes, claims, locks, queries), the
## controller calls' results, the men's hp after each tick and the lair and claim snapshots are the same.
extends TestCase

const W := preload("res://tests/sim/wild.gd")


func test_mobs_match_ts() -> void:
	W.load_data()
	for sc in W.vectors("mobs")["scenarios"]:
		var meta := Region.load_id(sc["region"]).meta
		var p := MobsProbe.create(meta, sc["w"], sc["h"], int(sc["seed"]), sc["nodes"], sc["towers"], sc["carts"])
		for rec in sc["ticks"]:
			var t := int(rec["t"])
			var where := "%s t %d" % [sc["region"], t]
			p.apply(rec.get("d", []))
			for c in rec.get("c", []):
				var got = p.call_api(c.slice(0, c.size() - 1))
				var d := W.diff(got, c[c.size() - 1], "%s call %s" % [where, str(c)])
				if d != "":
					fail(d)
					return
			p.tick(t)
			var d := W.diff(p.take_events(), rec.get("e", []), where + " events")
			if d == "" and p.hp_sum() != rec["hp"]:
				d = "%s: hp %s, TS %s" % [where, var_to_str(p.hp_sum()), var_to_str(rec["hp"])]
			if d == "" and rec.has("s"):
				d = W.diff(p.snaps(), rec["s"], where + " snaps")
			if d != "":
				fail(d)
				return


func test_foes_word_matches_ts() -> void:
	W.load_data()
	for c in W.vectors("mobs")["words"]:
		var d := W.diff([WildProbe.foes_word(c[0], int(c[1])), WildProbe.mob_kind_of(c[0])], c.slice(2), "foesWord(%s, %d)" % [c[0], int(c[1])])
		check(d == "", d)
