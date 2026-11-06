## Town levels match TS (godot/tests/golden/vectors/townLevel.json, src/dev/vectors/townLevel.ts): the tables, kindOf,
## levelOf and nextNeeds, and every phase of the towns grown on real regions (grid edits, pieces, measure) read back
## query for query.
extends TestCase

const T := preload("res://tests/sim/test_tunnel.gd")

static var v: Dictionary = GameData.read_exact("res://tests/golden/vectors/townLevel.json")


func _init() -> void:
	SimData.load({
		"war_stats": GameData.table("derived/war_stats")["WAR_STATS"],
		"town_level": GameData.table("src/war/sim/townLevel"),
	})


func test_tables_match_ts() -> void:
	var tl := GameData.table("src/war/sim/townLevel")
	check(T.diff(tl["TOWN"], v["town"]) == "", "TOWN")
	check(tl["TOWN_LEVELS"].size() == v["levels"], "TOWN_LEVELS size")


func test_kinds_levels_needs_match_ts() -> void:
	for k in v["kinds"]:
		check(TownLevels.kind_of(k[0], k[1]) == k[2], "kindOf %s = %s, TS %s" % [k[0], TownLevels.kind_of(k[0], k[1]), k[2]])
	for m in v["measures"]:
		check(TownLevels.level_of(m[0]) == m[1], "levelOf %s" % [m[0]])
		var d := T.diff(TownLevels.next_needs(m[2]), m[3])
		check(d == "", "nextNeeds %s%s" % [m[2], d])


func test_towns_match_ts() -> void:
	for run in v["runs"]:
		var g: Grid = Region.load_id(run["region"]).grid()
		var tl := TownLevels.create(g, 7)
		for p in run["phases"].size():
			var ph: Dictionary = run["phases"][p]
			for e in ph["edits"]:
				g.set_cost(int(e[0]), e[1])
				g.set_gate(int(e[0]), int(e[2]))
				g.set_deck(int(e[0]), int(e[3]))
			tl.set_pieces(ph["pieces"])
			for t in ph["ticks"]:
				tl.tick(t)
			var where := "%s phase %d" % [run["region"], p]
			var d := T.diff(tl.snaps(), ph["snaps"], "snaps")
			for i in ph["levels"].size():
				if d == "":
					var team: int = [-1, 0, 1, 2, 3, 6, 7][i]
					d = "" if tl.level(team) == ph["levels"][i] else "level(%d) = %d, TS %s" % [team, tl.level(team), ph["levels"][i]]
			for a in ph["at"]:
				if d == "":
					d = T.diff([tl.town_at(a[0], a[1], a[2]), tl.perk_at(a[0], a[1], a[2]), tl.souls_at(a[1], a[2])], a.slice(3), "at %s" % [a.slice(0, 3)])
			for c in ph["towns"]:
				if d == "":
					d = T.diff([tl.town(c[0]), tl.members(c[0])], c.slice(1), "town %d" % c[0])
			if d != "":
				fail("%s: %s" % [where, d])
				break
