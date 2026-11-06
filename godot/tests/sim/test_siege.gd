## The siege engines (godot/native/src/siege.h) match TS tick by tick (godot/tests/golden/vectors/siege.json,
## src/dev/vectors/siege.ts): driven by the same scripted fake world over real works on a real region, every API call's
## result, every host call, every engine's whole state, the men, and the snapshots (engines, shots, buildings and the
## grid layers the works edit, as sha256 of Grid.bytes_of) are the same.
extends TestCase

const Deep := preload("res://tests/sim/goods_deep.gd")
const W := preload("res://tests/sim/wild.gd")
const LAYERS := ["cost", "height", "deck", "gate", "span", "trench", "narrow", "plat", "cartMul"]


static func _load() -> void:
	var t := {"war_stats": GameData.table("derived/war_stats")["WAR_STATS"]}
	for n in W.TABLES:
		t[n] = GameData.table(n)
	for n in ["economy", "holders", "trade", "crafting", "works", "siege"]:
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


func _snap(p: SiegeProbe, g: Grid, t: int) -> Dictionary:
	var s := p.snap(t)
	var out := {"e": s["e"], "sh": s["sh"], "b": s["b"], "g": {}}
	for k in LAYERS:
		out["g"][k] = _sha(g.bytes_of(k))
	return out


func test_siege_matches_ts() -> void:
	_load()
	var ticks := 0
	var calls := 0
	for sc in W.vectors("siege")["scenarios"]:
		var r := Region.load_id(sc["region"])
		var g := r.grid()
		var p := SiegeProbe.create(g, r.meta, r.cells, sc)
		for rec in sc["ticks"]:
			var t := int(rec["t"])
			var where := "%s t %d" % [sc["region"], t]
			p.begin(rec.get("e", []))
			for c in rec.get("c", []):
				var got = p.call_api(c.slice(0, c.size() - 1))
				var d := Deep.diff(got, c[c.size() - 1], "%s call %s" % [where, str(c).left(200)])
				if d != "":
					fail(d)
					return
				calls += 1
			p.step(t)
			var d := Deep.diff(p.take_events(), rec.get("e", []), where + " events")
			if d == "" and rec.has("g"):
				d = Deep.diff(p.engines_state(), rec["g"], where + " engines")
			if d == "" and rec.has("m"):
				d = Deep.diff(p.men_state(), rec["m"], where + " men")
			if d == "" and rec.has("s"):
				d = Deep.diff(_snap(p, g, t), rec["s"], where + " snap")
			if d != "":
				fail(d)
				return
			ticks += 1
	check(ticks == 1400, "%d ticks" % ticks)
	print("  siege: %d ticks, %d calls match" % [ticks, calls])
