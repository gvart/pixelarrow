## Economy rules match TS (godot/tests/golden/vectors/economy.json, src/dev/vectors/economy.ts): footprints, locks and
## who needs a man for every building, rectangle and polyline tiles; and the C++ reads BUILDINGS as the table has it.
extends TestCase

const Deep = preload("res://tests/sim/goods_deep.gd")


func test_economy_matches_ts() -> void:
	Deep.load_tables()
	var want: Dictionary = GameData.read_exact("res://tests/golden/vectors/economy.json")
	var got := GoodsProbe.economy(want)
	for k in ["buildings", "rects", "lines"]:
		var d := Deep.diff(got[k], want[k], k)
		check(d == "", d)


func test_buildings_load_as_the_table() -> void:
	Deep.load_tables()
	var table: Dictionary = GameData.table("src/war/sim/economy")["BUILDINGS"]
	for t in table:
		var b: Dictionary = table[t]
		var want := {}
		for k in ["w", "h", "hp", "labour", "workers", "influence", "material", "store", "wall", "perTile", "tier", "walk", "cap", "depth", "access", "door", "burnable", "bridge", "brazier", "field", "chest", "prebuilt", "cache", "house"]:
			if b.has(k):
				want[k] = b[k]
		want["cost"] = _entries(b["cost"])
		if b.has("yields"):
			want["yields"] = [b["yields"]["res"], b["yields"]["max"], b["yields"]["regrow"], b["yields"]["rate"]]
		if b.has("upgrade"):
			want["upgrade"] = [b["upgrade"]["to"], _entries(b["upgrade"]["cost"]), b["upgrade"]["labour"]]
		if b.has("workplace"):
			want["workplace"] = [b["workplace"]["kind"], b["workplace"]["level"], b["workplace"].get("spots", [])]
		var d := Deep.diff(GoodsProbe.building(t), want, t)
		check(d == "", d)


static func _entries(c: Dictionary) -> Array:
	var out := []
	for k in c:
		out.append([k, c[k]])
	return out
