## The story runner and the hidden quests match TS (godot/tests/golden/vectors/stories.json, src/dev/vectors/stories.ts):
## the hidden quests of every region, snapped spots, paths, items, save checks, and every scripted play replayed input
## by input with the same notes, host calls and saves.
extends TestCase

const T := preload("res://tests/sim/test_tunnel.gd")

static var v: Dictionary = GameData.read_exact("res://tests/golden/vectors/stories.json")
static var _regions := {}


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


## [meta, grid] of a region, built once.
func _region(id: String) -> Array:
	if not _regions.has(id):
		var r := Region.load_id(id)
		_regions[id] = [r.meta, r.grid()]
	return _regions[id]


func _story(ref: Dictionary) -> Dictionary:
	var st := GameData.table("src/data/warStories")
	match ref["table"]:
		"stories":
			return st["STORIES"][ref["key"]]
		"path":
			return st["PATH_STORIES"][ref["key"]][ref["path"]]
	return StoryRun.hidden_stories(_region(ref["key"])[0])[int(ref["n"])]


func test_radii_match_ts() -> void:
	check(T.diff(StoryRun.radii(), v["radius"]) == "", "STORY_R")
	check(T.diff(StoryRun.radii(), GameData.table("src/war/sim/stories")["STORY_R"]) == "", "STORY_R vs table")


func test_authored_stories_read_whole() -> void:
	var st := GameData.table("src/data/warStories")
	var all: Array = st["STORIES"].values()
	for by in st["PATH_STORIES"].values():
		all.append_array(by.values())
	for s in all:
		var d := T.diff(StoryRun.round_trip(s), s)
		check(d == "", "%s: %s" % [s["id"], d])


func test_hidden_stories_match_ts() -> void:
	check(v["templates"] == GameData.table("src/data/warStories")["HIDDEN"].map(func(h): return h["id"]), "HIDDEN ids")
	for h in v["hidden"]:
		var d := T.diff(StoryRun.hidden_stories(_region(h[0])[0]), h[1])
		check(d == "", "hiddenStories(%s)%s" % [h[0], d])


func test_snap_open_matches_ts() -> void:
	for s in v["snaps"]:
		var rg := _region(s["region"])
		for c in s["pts"]:
			var d := T.diff(StoryRun.snap_open(rg[0], rg[1], c[0][0], c[0][1]), c[1])
			check(d == "", "%s snapOpen %s%s" % [s["region"], c[0], d])


func test_spots_paths_items_saves_match_ts() -> void:
	for sv in v["stories"]:
		var story := _story(sv["ref"])
		var id: String = sv["id"]
		check(story["id"] == id, "%s: the ref gives %s" % [id, story["id"]])
		var rg := _region(story["region"])
		var d := T.diff(StoryRun.story_spots(story, rg[0], rg[1]), sv["spots"])
		check(d == "", "%s spots%s" % [id, d])
		for p in sv["paths"]:
			d = T.diff(StoryRun.story_path(story, p[0]), p[1])
			check(d == "", "%s path %s%s" % [id, p[0], d])
		for it in sv["items"]:
			d = T.diff(StoryRun.story_item(story, it[0], it[1], it[2]), it[3])
			check(d == "", "%s item %s %s%s" % [id, it[0], it[1], d])
		for s in sv["saves"]:
			d = T.diff(StoryRun.save_check(story, s[0]), [s[1], s[2]])
			check(d == "", "%s saveOk %s%s" % [id, s[0], d])


func test_plays_match_ts() -> void:
	var n := 0
	for sv in v["stories"]:
		if not sv.has("plays"):
			continue
		var story := _story(sv["ref"])
		var rg := _region(story["region"])
		for p in sv["plays"]:
			n += 1
			var run := StoryRun.create(story, rg[0], rg[1], p["save"], p["me"])
			var where := "%s play %d" % [sv["id"], n]
			var d := T.diff(run.spots(), p["spots"])
			if d != "":
				fail("%s spots%s" % [where, d])
				return
			for k in p["steps"].size():
				var s: Dictionary = p["steps"][k]
				var inp: Dictionary = s["input"]
				var notes
				match inp["op"]:
					"tick":
						notes = run.tick(inp["snap"], inp["evs"])
					"trade":
						notes = run.trade(inp["snap"], inp["kind"], inp["coin"], inp["abroad"])
					"choose":
						notes = run.choose(inp["snap"], inp["option"])
				d = T.diff(notes, s["notes"], "notes")
				if d == "":
					d = T.diff(run.take_calls(), s["calls"], "calls")
				if d == "":
					d = T.diff(run.get_save(), s["save"], "save")
				if d != "":
					fail("%s input %d (%s): %s" % [where, k, inp["op"], d])
					return
	check(n > 90, "only %d plays" % n)


func test_make_item_matches_ts() -> void:
	var probe := {"id": "probe", "region": "dodona-e", "title": "", "giver": {"name": "", "title": "", "at": [0, 0], "cls": ""}, "hook": "", "backstory": "", "steps": [], "end": ""}
	for i in v["defs"].size():
		var c: Array = v["defs"][i]
		var d := T.diff(StoryRun.story_item(probe, "k%d" % i, "t:0", {"item": {"def": c[0], "rarity": c[1]}}), c[2])
		check(d == "", "makeItem %s%s" % [c[0], d])
