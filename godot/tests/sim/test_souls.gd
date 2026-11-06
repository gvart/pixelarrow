## Souls match TS (godot/tests/golden/vectors/souls.json, src/dev/vectors/souls.ts): the tables, soulLevel, every region's
## sites, and the runs replayed tick by tick: falls, spawns, named souls, storms and reloads, each host call answered as
## TS answered it, with the same calls, events, snaps and souls.
extends TestCase

const T := preload("res://tests/sim/test_tunnel.gd")

static var v: Dictionary = GameData.read_exact("res://tests/golden/vectors/souls.json")
static var _meta := {}


func _init() -> void:
	SimData.load({
		"war_stats": GameData.table("derived/war_stats")["WAR_STATS"],
		"souls": GameData.table("src/war/sim/souls"),
		"src/war/sim/depth": GameData.table("src/war/sim/depth"),
	})


func _region(id: String) -> Dictionary:
	if not _meta.has(id):
		_meta[id] = Region.load_id(id).meta
	return _meta[id]


func test_tables_match_ts() -> void:
	var t := GameData.table("src/war/sim/souls")
	check(T.diff(t["SOUL"], v["soul"]) == "", "SOUL")
	check(T.diff(t["SOUL_CLASSES"], v["classes"]) == "", "SOUL_CLASSES")
	check(T.diff(t["SOUL_LEVEL"], v["level"]) == "", "SOUL_LEVEL")
	check(t["SOUL_LEVEL_MAX"] == v["levelMax"], "SOUL_LEVEL_MAX")
	for c in v["levels"]:
		check(Souls.soul_level(c[0], c[1]) == c[2], "soulLevel %s" % [c])


func test_sites_match_ts() -> void:
	for c in v["sites"]:
		var d := T.diff(Souls.soul_sites(_region(c[0])), c[1])
		check(d == "", "soulSites(%s)%s" % [c[0], d])


func test_runs_match_ts() -> void:
	for run in v["runs"]:
		var meta := _region(run["region"])
		var s := Souls.create(meta, run["seed"], run["chanceAt"])
		var where: String = run["region"]
		var d := T.diff(s.sites(), run["sites"], "sites")
		var steps: Array = run["steps"]
		var k := 0
		for t in int(run["T"]) + 1:
			if d != "":
				break
			if k >= steps.size() or int(steps[k]["t"]) != t:
				s.tick(t)
				continue
			var st: Dictionary = steps[k]
			k += 1
			if st.has("men"):
				s.set_men(st["men"])
			for op in st.get("ops", []):
				var got = null
				match op[0]:
					"fell":
						s.fell(op[1], op[2], op[3])
					"spawn":
						got = s.spawn(op[1], op[2], op[3], op[4], op[5], t)
						if got != op[6]:
							d = "spawn %d, TS %d" % [got, op[6]]
					"spawnNamed":
						got = s.spawn_named(op[1], t, op[2], op[3])
						if got != op[4]:
							d = "spawnNamed %s, TS %s" % [got, op[4]]
					"storm":
						s.set_storm(op[1])
					"reload":
						var fresh := Souls.create(meta, int(run["seed"]) + 1, run["chanceAt"])
						fresh.load_root_of(s)
						s = fresh
			var calls: Array = st.get("calls", [])
			s.set_answers(calls.filter(func(c): return c[0] in ["gate", "join", "chanceAt"]))
			s.tick(t)
			if d == "":
				d = T.diff(s.take_calls(), calls, "calls")
			if d == "" and st.has("snaps"):
				d = T.diff([s.snaps(t), s.any(), [0, 1, 2].map(func(i): return s.get(i))], [st["snaps"], st["any"], st["get"].slice(0, 3)], "after")
			if d != "":
				d = "%s t %d: %s" % [where, t, d]
		if d == "":
			d = T.diff(s.sites(), run["end"], "end sites")
		if d != "":
			fail(d)
