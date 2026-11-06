## The works (godot/native/src/works.h) match TS tick by tick (godot/tests/golden/vectors/works.json,
## src/dev/vectors/works.ts): driven by the same scripted fake world on real regions, every API call's result, the
## workers' acts, every host call, the workers' state and the snapshots (buildings, nodes, stock, cart, influence mask
## and the grid layers works edits, as sha256 of Grid.bytes_of) are the same.
extends TestCase

const Deep := preload("res://tests/sim/goods_deep.gd")
const W := preload("res://tests/sim/wild.gd")
const LAYERS := ["cost", "height", "deck", "gate", "span", "trench", "narrow", "plat", "cartMul"]


static func _load() -> void:
	var t := {"war_stats": GameData.table("derived/war_stats")["WAR_STATS"]}
	for n in W.TABLES:
		t[n] = GameData.table(n)
	for n in ["economy", "holders", "trade", "crafting", "works"]:
		t[n] = GameData.table("src/war/sim/" + n)
	for n in ["professions", "recipes", "items", "affixes", "classes"]:
		t[n] = GameData.table("src/data/" + n)
	t["derived_crafting"] = GameData.table("derived/crafting")
	SimData.load(t)


static func _sha(b: PackedByteArray) -> String:
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(b)
	return ctx.finish().hex_encode()


func _snap(p: WorksProbe, g: Grid) -> Dictionary:
	var s := p.snap()
	var out := {"b": s["b"], "n": s["n"], "st": s["st"], "cart": s["cart"], "inf": [s["inf_version"], _sha(s["mask"])], "g": {}}
	for k in LAYERS:
		out["g"][k] = _sha(g.bytes_of(k))
	return out


func test_works_match_ts() -> void:
	_load()
	var ticks := 0
	var calls := 0
	for sc in W.vectors("works")["scenarios"]:
		var r := Region.load_id(sc["region"])
		var g := r.grid()
		var p := WorksProbe.create(g, r.meta, r.cells, sc)
		for rec in sc["ticks"]:
			var where := "%s t %d" % [sc["region"], int(rec["t"])]
			p.begin(rec.get("e", []))
			for c in rec.get("c", []):
				var got = p.call_api(c.slice(0, c.size() - 1))
				var d := Deep.diff(got, c[c.size() - 1], "%s call %s" % [where, str(c).left(200)])
				if d != "":
					fail(d)
					return
				calls += 1
			p.tick_works()
			var d := Deep.diff(p.work_all(), rec["a"], where + " acts")
			p.end_tick()
			if d == "":
				d = Deep.diff(p.take_events(), rec.get("e", []), where + " events")
			if d == "" and rec.has("w"):
				d = Deep.diff(p.workers_state(), rec["w"], where + " workers")
			if d == "" and rec.has("s"):
				d = Deep.diff(_snap(p, g), rec["s"], where + " snap")
			if d != "":
				fail(d)
				return
			ticks += 1
	check(ticks == 2120, "%d ticks" % ticks)
	print("  works: %d ticks, %d calls match" % [ticks, calls])
