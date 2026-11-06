## The rival warlords match TS tick by tick (godot/tests/golden/vectors/warlords.json, src/dev/vectors/warlords.ts): with
## the world the TS made (squads, men, buildings, carts, claim teams) replayed in, every host call the director makes
## (spawns, orders, piles, squads dropped, bots set and cleared), its notes, the director calls' results and its
## snapshots are the same; a region in no warlord's domain gets none.
extends TestCase

const W := preload("res://tests/sim/wild.gd")


static func load_data() -> void:
	var items := GameData.table("src/data/items")
	SimData.load({
		"war_stats": GameData.table("derived/war_stats")["WAR_STATS"],
		"src/war/sim/depth": GameData.table("src/war/sim/depth"),
		"src/data/warWarlords": GameData.table("src/data/warWarlords"),
		"src/war/sim/warlords": GameData.table("src/war/sim/warlords"),
		"src/war/world/regions": GameData.table("src/war/world/regions"),
		"src/war/world/alliances": GameData.table("src/war/world/alliances"),
		"items": items["ITEMS"],
		"src/data/items": items,
		"item_paint": GameData.table("derived/item_paint"),
	})


func test_warlords_match_ts() -> void:
	load_data()
	var v := W.vectors("warlords")
	for sc in v["scenarios"]:
		var reg := Region.load_id(sc["region"])
		var p := WarlordsProbe.create(reg.meta, reg.w, reg.h, sc["seed"], int(sc.get("cap", 999)), sc.get("inf", []), v["off"])
		if sc.get("none", false):
			check(p.none(), "%s: no warlord" % sc["region"])
			continue
		check(not p.none(), "%s: warlords" % sc["region"])
		var last := -2
		for rec in sc["ticks"]:
			var t := int(rec["t"])
			var where := "%s t %d" % [sc["region"], t]
			if not rec.has("j"):
				for k in range(last + 1, t):
					var quiet := p.tick(k, false)
					if not quiet.is_empty():
						fail("%s: notes on a quiet tick %d" % [where, k])
						return
			p.take_events()
			p.apply(rec)
			for c in rec.get("c", []):
				var got = p.call_api(c.slice(0, c.size() - 1))
				var d := W.diff(got, c[c.size() - 1], "%s call %s" % [where, str(c).left(80)])
				if d != "":
					fail(d)
					return
			var notes := p.tick(t, t % 10 == 0)
			var d := W.diff(p.take_events(), rec.get("e", []), where + " events")
			if d == "":
				d = W.diff(notes, rec.get("n", []), where + " notes")
			if d == "" and rec.has("s"):
				d = W.diff({"snaps": p.snaps(), "men": p.call_api(["men"])}, rec["s"], where + " snaps")
			if d != "":
				fail(d)
				return
			last = t
