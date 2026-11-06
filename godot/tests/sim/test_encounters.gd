## The encounter runner matches TS (godot/tests/golden/vectors/encounters.json, src/dev/vectors/encounters.ts): ENC,
## every region's towns, hunters, biomes and fitting kinds, the save checks, awayLine, goodsWords, pidOfUnit, and every
## scripted play replayed input by input with the same notes, host calls, saves and quiet-save flags.
extends TestCase

const T := preload("res://tests/sim/test_tunnel.gd")

static var v: Dictionary = GameData.read_exact("res://tests/golden/vectors/encounters.json")
static var _regions := {}


func _init() -> void:
	SimData.load({
		"war_stats": GameData.table("derived/war_stats")["WAR_STATS"],
		"items": GameData.table("src/data/items")["ITEMS"],
		"item_paint": GameData.table("derived/item_paint"),
		"src/war/sim/depth": GameData.table("src/war/sim/depth"),
		"src/war/sim/encounters": GameData.table("src/war/sim/encounters"),
		"src/data/warEncounters": GameData.table("src/data/warEncounters"),
	})


## [meta, grid] of a region, built once.
func _region(id: String) -> Array:
	if not _regions.has(id):
		var r := Region.load_id(id)
		_regions[id] = [r.meta, r.grid()]
	return _regions[id]


func test_enc_matches_ts() -> void:
	check(T.diff(EncounterRun.enc(), v["enc"]) == "", "ENC")


func test_regions_match_ts() -> void:
	for p in v["per"]:
		var rg := _region(p["region"])
		var want: Dictionary = p.duplicate()
		want.erase("region")
		var d := T.diff(EncounterRun.region_info(rg[0], rg[1]), want, p["region"])
		check(d == "", d)


func test_saves_lines_words_pids_match_ts() -> void:
	for s in v["saves"]:
		var d := T.diff(EncounterRun.save_check(s[0]), [s[1], s[2]])
		check(d == "", "encSaveOk %s%s" % [s[0], d])
	for a in v["away"]:
		check(T.diff(EncounterRun.away_line(a[0]), a[1]) == "", "awayLine %s: %s vs %s" % [a[0], EncounterRun.away_line(a[0]), a[1]])
	for w in v["words"]:
		check(EncounterRun.goods_words(w[0]) == w[1], "goodsWords %s: %s vs %s" % [w[0], EncounterRun.goods_words(w[0]), w[1]])
	var snap := {
		"units": [{"id": 1, "squad": 1}, {"id": 2, "squad": 2}, {"id": 3, "squad": 3}, {"id": 4, "squad": 4}, {"id": 5, "squad": 5}, {"id": 6, "squad": 9}, {"id": 7, "squad": 6}, {"id": 8, "squad": 7}],
		"squads": [{"id": 1, "owner": "p:12"}, {"id": 2, "owner": "t:0"}, {"id": 3, "owner": "p:"}, {"id": 4, "owner": "p:abc"}, {"id": 5, "owner": "p:3.5"}, {"id": 6, "owner": "p:1e3"}, {"id": 7, "owner": "p: 7 "}],
	}
	for p in v["pids"]:
		var got = EncounterRun.pid_of_unit(snap, p[0])
		var ok: bool = (got == null and p[1] == null) or (got != null and p[1] != null and (float(got) == float(p[1]) or (is_nan(float(got)) and is_nan(float(p[1])))))
		check(ok, "pidOfUnit %d: %s vs %s" % [p[0], got, p[1]])


func test_plays_match_ts() -> void:
	var n := 0
	var story_table: Dictionary = GameData.table("src/data/warStories")["STORIES"]
	for p in v["plays"]:
		n += 1
		var rg := _region(p["region"])
		var story = story_table[p["region"]] if p["story"] and story_table.has(p["region"]) else null
		var run := EncounterRun.create(rg[0], rg[1], p["save"], p["me"], story, p["host"])
		var where := "play %d (%s)" % [n, p["region"]]
		if run.depth() != p["depth"]:
			fail("%s depth %s vs %s" % [where, run.depth(), p["depth"]])
			return
		for k in p["steps"].size():
			var s: Dictionary = p["steps"][k]
			var inp: Dictionary = s["input"]
			if inp.has("rob"):
				run.set_rob(inp["rob"])
			var notes
			var d := ""
			match inp["op"]:
				"tick":
					notes = run.tick(inp["snap"], inp["evs"])
				"travel":
					var got: Array = run.travel(inp["snap"], int(inp["n"]))
					notes = got[0]
					if int(got[1]) != int(inp["ran"]):
						d = "ran %d vs %d" % [got[1], inp["ran"]]
				"fire":
					notes = run.fire(inp["snap"], inp["def"], inp.get("from"))
				"choose":
					notes = run.choose(inp["snap"], inp["option"])
			if d == "":
				d = T.diff(notes, s["notes"], "notes")
			if d == "":
				d = T.diff(run.take_calls(), s["calls"], "calls")
			if d == "":
				d = T.diff(run.get_save(), s["save"], "save")
			if d == "":
				d = T.diff(run.take_due(), s["due"], "due")
			if d == "":
				d = T.diff(run.step(), s["step"], "step")
			if d != "":
				fail("%s input %d (%s): %s" % [where, k, inp["op"], d])
				return
	check(n > 50, "only %d plays" % n)
