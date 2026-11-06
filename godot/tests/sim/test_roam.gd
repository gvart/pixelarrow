## The roam controller matches TS tick by tick (godot/tests/golden/vectors/roam.json, src/dev/vectors/roam.ts): with the
## squads and wagons the TS world made replayed in, every host call it makes (spawns, orders, routes, wagons, pay, fight
## queries, notes), the controller calls' results, the grudges it writes and the group snapshots are the same.
extends TestCase

const W := preload("res://tests/sim/wild.gd")
const MORE := ["src/war/sim/roam", "src/war/sim/economy", "src/war/sim/civilians"]


static func load_data() -> void:
	var t := {"war_stats": GameData.table("derived/war_stats")["WAR_STATS"]}
	for n in W.TABLES + MORE:
		t[n] = GameData.table(n)
	SimData.load(t)


func test_roam_matches_ts() -> void:
	load_data()
	for sc in W.vectors("roam")["scenarios"]:
		var meta := Region.load_id(sc["region"]).meta
		var p := RoamProbe.create(meta, sc["w"], sc["h"], sc["seed"], int(sc["cap"]))
		for rec in sc["ticks"]:
			var t := int(rec["t"])
			var where := "%s t %d" % [sc["region"], t]
			p.apply(rec.get("d", []), rec.get("k", []))
			for c in rec.get("c", []):
				var got = p.call_api(c.slice(0, c.size() - 1))
				var d := W.diff(got, c[c.size() - 1], "%s call %s" % [where, str(c)])
				if d != "":
					fail(d)
					return
			p.tick(t)
			var d := W.diff(p.take_events(), rec.get("e", []), where + " events")
			if d == "":
				d = W.diff(p.angry(), rec.get("an", []), where + " grudges")
			if d == "" and rec.has("s"):
				d = W.diff(p.snaps(), rec["s"], where + " snaps")
			if d != "":
				fail(d)
				return
