## Deep comparison of a C++ result with its TS vector (tests/sim/test_economy.gd, test_holders.gd, test_trade.gd,
## test_crafting.gd): numbers exactly (ints and floats alike), arrays in order, dictionaries by key set.
## diff(a, b) is "" when equal, else the path of the first difference.
extends RefCounted


static func diff(got: Variant, want: Variant, path := "") -> String:
	var gn := got is int or got is float
	var wn := want is int or want is float
	if gn or wn:
		if gn and wn and float(got) == float(want):
			return ""
		return "%s: %s, TS %s" % [path, var_to_str(got), var_to_str(want)]
	if got is Array and want is Array:
		if got.size() != want.size():
			return "%s: %d entries, TS %d (%s vs %s)" % [path, got.size(), want.size(), str(got).left(300), str(want).left(300)]
		for i in got.size():
			var d := diff(got[i], want[i], "%s[%d]" % [path, i])
			if d != "":
				return d
		return ""
	if got is Dictionary and want is Dictionary:
		for k in want:
			if not got.has(k):
				return "%s.%s: missing (TS %s)" % [path, k, str(want[k]).left(200)]
		for k in got:
			if not want.has(k):
				return "%s.%s: extra %s" % [path, k, str(got[k]).left(200)]
			var d := diff(got[k], want[k], "%s.%s" % [path, k])
			if d != "":
				return d
		return ""
	if typeof(got) == typeof(want) and got == want:
		return ""
	return "%s: %s, TS %s" % [path, str(got).left(200), str(want).left(200)]


## The tables the goods modules read (SimData.load).
static func load_tables() -> void:
	SimData.load({
		"war_stats": GameData.table("derived/war_stats")["WAR_STATS"],
		"economy": GameData.table("src/war/sim/economy"),
		"holders": GameData.table("src/war/sim/holders"),
		"trade": GameData.table("src/war/sim/trade"),
		"crafting": GameData.table("src/war/sim/crafting"),
		"professions": GameData.table("src/data/professions"),
		"recipes": GameData.table("src/data/recipes"),
		"items": GameData.table("src/data/items"),
		"affixes": GameData.table("src/data/affixes"),
		"classes": GameData.table("src/data/classes"),
		"derived_crafting": GameData.table("derived/crafting"),
	})
