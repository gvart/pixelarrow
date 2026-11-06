## The world-fill hidden quests match TS (godot/tests/golden/vectors/secrets.json, src/dev/vectors/secrets.ts): every
## look of the runs on real regions replayed with the same world, giving the same host calls and notes, open lines and
## saves, through reloads of the root.
extends TestCase

const T := preload("res://tests/sim/test_tunnel.gd")

static var v: Dictionary = GameData.read_exact("res://tests/golden/vectors/secrets.json")


func _init() -> void:
	var st := GameData.table("src/data/warStories")
	SimData.load({
		"war_stats": GameData.table("derived/war_stats")["WAR_STATS"],
		"items": GameData.table("src/data/items")["ITEMS"],
		"item_paint": GameData.table("derived/item_paint"),
		"war_chiefs": GameData.table("src/data/warWild")["WAR_CHIEFS"],
		"world_regions": GameData.table("src/war/world/regions")["WORLD_REGIONS"],
		"src/war/sim/depth": GameData.table("src/war/sim/depth"),
		"hidden": st["HIDDEN"],
		"hidden_text": st["HIDDEN_TEXT"],
	})


func test_runs_match_ts() -> void:
	var owners := ["p:a", "p:b", "bot2", "p:c", "p:d"]
	for run in v["runs"]:
		var r := Region.load_id(run["region"])
		var g: Grid = r.grid()
		var sec := Secrets.create(r.meta, g)
		var where: String = run["region"]
		var d := "" if sec.stories() == run["stories"] else "%d stories, TS %d" % [sec.stories(), run["stories"]]
		for k in run["steps"].size():
			if d != "":
				break
			var s: Dictionary = run["steps"][k]
			sec.set_world(s["squads"], s["lairs"], s["souls"])
			if s.get("reload", false):
				var fresh := Secrets.create(r.meta, g)
				fresh.set_world(s["squads"], s["lairs"], s["souls"])
				fresh.load_root(sec.save_root())
				sec = fresh
			sec.tick(s["t"])
			d = T.diff(sec.take_calls(), s["calls"], "calls")
			if d == "" and s.has("open"):
				d = T.diff(owners.map(func(o): return sec.open(o)), s["open"], "open")
			if d == "" and s.has("saves"):
				var saves := []
				for n in sec.stories():
					saves.append(owners.map(func(o): return sec.save(n, o)))
				d = T.diff(saves, s["saves"], "saves")
			if d != "":
				d = "%s look %d (t %s): %s" % [where, k, s["t"], d]
		if d == "":
			d = T.diff(sec.save_root(), run["root"], "%s root" % where)
		if d != "":
			fail(d)
