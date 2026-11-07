## Shared by the tests of depth, soldiers, skills, honours, deeds, food, captives and mobs: SimData with their tables,
## their vectors, and a strict deep compare.
extends RefCounted

const TABLES := [
	"src/war/sim/depth", "src/war/sim/soldiers", "src/data/units", "src/data/perks", "src/war/sim/skills", "src/war/sim/honours",
	"src/war/sim/deeds", "src/war/sim/food", "src/war/sim/captives", "src/war/world/regions", "src/war/sim/mobs", "src/data/warWild",
	"src/data/warBosses",
	# the paths (each owner's limits) and what a person's war stats are made of (stats.h)
	"src/war/world/start", "src/data/items", "src/data/affixes", "src/data/classes", "src/data/gearRules", "src/data/sets",
	"src/data/traits", "src/war/sim/classes", "src/data/warPerks",
]


static func load_data() -> void:
	var t := {"war_stats": GameData.table("derived/war_stats")["WAR_STATS"]}
	for n in TABLES:
		t[n] = GameData.table(n)
	SimData.load(t)


static func vectors(module: String) -> Dictionary:
	return GameData.read_exact("res://tests/golden/vectors/%s.json" % module)


## "" when a (C++) and b (TS) are the same: numbers by exact value, arrays element by element, dictionaries key by key
## (a key on one side only is a difference); else where they first differ.
static func diff(a: Variant, b: Variant, path := "") -> String:
	if a is PackedStringArray or a is PackedFloat64Array or a is PackedInt32Array:
		a = Array(a)
	if (a is int or a is float) and (b is int or b is float):
		return "" if float(a) == float(b) else "%s: %s, TS %s" % [path, var_to_str(float(a)), var_to_str(float(b))]
	if a is Array and b is Array:
		if a.size() != b.size():
			return "%s: %d items, TS %d (%s vs TS %s)" % [path, a.size(), b.size(), str(a).left(300), str(b).left(300)]
		for i in a.size():
			var d := diff(a[i], b[i], "%s[%d]" % [path, i])
			if d != "":
				return d
		return ""
	if a is Dictionary and b is Dictionary:
		for k in a:
			if not b.has(k):
				return "%s.%s: only in C++" % [path, k]
		for k in b:
			if not a.has(k):
				return "%s.%s: missing in C++" % [path, k]
			var d := diff(a[k], b[k], "%s.%s" % [path, k])
			if d != "":
				return d
		return ""
	if typeof(a) != typeof(b) or a != b:
		return "%s: %s, TS %s" % [path, str(a), str(b)]
	return ""
