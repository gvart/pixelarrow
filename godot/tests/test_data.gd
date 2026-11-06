## The exported tables and regions (npm run data:godot) load and match what the TS exporter wrote in the manifest.
extends TestCase


func test_tables_match_manifest() -> void:
	var tables: Dictionary = GameData.manifest()["tables"]
	check(tables.size() > 0, "no tables in the manifest")
	for name in tables:
		var t := GameData.table(name)
		for key in tables[name]["exports"]:
			check(t.has(key), "%s has no %s" % [name, key])


func test_known_table_values() -> void:
	var classes := GameData.table("src/data/classes")
	check(not classes.is_empty(), "src/data/classes is empty")
	check(GameData.table("src/war/sim/economy").has("BUILDINGS"), "src/war/sim/economy has no BUILDINGS")


func test_terrain_order_matches_ts() -> void:
	check(Region.TERRAIN == GameData.manifest()["terrain"], "Region.TERRAIN differs from the TS TERRAIN order")


func test_regions_load_and_decode() -> void:
	var regions: Dictionary = GameData.manifest()["regions"]
	check(regions.size() >= 37, "only %d regions" % regions.size())
	for id in regions:
		var m: Dictionary = regions[id]
		var r := Region.load_id(id)
		check(r.w == int(m["w"]) and r.h == int(m["h"]), "%s size %dx%d" % [id, r.w, r.h])
		var ctx := HashingContext.new()
		ctx.start(HashingContext.HASH_SHA256)
		ctx.update(r.cells)
		check(ctx.finish().hex_encode() == m["sha256"], "%s cells differ from the export" % id)
		var s: Array = m["sample"]
		var i := int(s[0])
		check(r.height_at(i) == int(s[1]), "%s height at %d" % [id, i])
		check(Region.TERRAIN[r.terrain_at(i)] == s[2], "%s terrain at %d" % [id, i])
		check(r.water_at(i) == int(s[3]), "%s water at %d" % [id, i])


func test_table_floats_are_exact() -> void:
	var known := {}
	for h in GameData.manifest()["floats"]:
		known[h] = true
	check(known.size() > 0, "no floats in the manifest")
	var seen := [0]
	for name in GameData.manifest()["tables"]:
		_floats(GameData.table(name), name, known, seen)
	check(seen[0] > 0, "read no floats")


func _floats(v: Variant, where: String, known: Dictionary, seen: Array) -> void:
	if v is Dictionary:
		for k in v:
			_floats(v[k], where, known, seen)
	elif v is Array:
		for x in v:
			_floats(x, where, known, seen)
	elif v is float and v != floorf(v):
		seen[0] += 1
		var b := PackedByteArray()
		b.resize(8)
		b.encode_double(0, v)
		b.reverse()
		check(known.has(b.hex_encode()), "%s: %s is not a TS float" % [where, String.num(v, 17)])
