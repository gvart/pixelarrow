## The region view's later parts: per-man looks against the TS lookOf, hit flashes and nudges, health bar rules, the
## building art picks (stages, town looks, ruins) and Elaia's pre-built pieces from a live sim, water glints, animal idle
## frames, the soft foam strokes. The tests that read godot/view (npm run view:godot) skip when it was not exported.
extends TestCase


func _view() -> bool:
	return Look.load_data()


func test_look_hashes() -> void:
	check(Look.hash32("") == 0x811c9dc5, "FNV basis")
	check(Look.hash32("a") == 0xe40c292c, "FNV-1a of a: %x" % Look.hash32("a"))
	check(Look.imul(0xffffffff, 0xffffffff) == 1, "imul wraps (-1 * -1)")
	check(Look.imul(0x9e3779b9, 3) == (0x9e3779b9 * 3) & 0xFFFFFFFF, "imul small")
	check(Look.tier_of(0.0) == 0 and Look.tier_of(3.0) == 0 and Look.tier_of(4.0) == 1 and Look.tier_of(8.0) == 2, "tiers by level")


func test_looks_match_ts() -> void:
	if not _view():
		return
	var bad := 0
	for s in Look.data["samples"]:
		var l := Look.look_of(s[0], s[1], s[2])
		for k in 6:
			if l[k] != int(s[3 + k]):
				bad += 1
				if bad < 5:
					fail("lookOf(%s, %s, %d): %s, TS %s" % [s[0], s[1], s[2], l, s.slice(3)])
				break
	check(Look.data["samples"].size() >= 300, "samples exported")


func test_look_colour_codes() -> void:
	if not _view():
		return
	var cls: String = Look.data["index"].keys()[-1]
	var ci := int(Look.data["index"][cls])
	var l := PackedInt32Array([2, 5, 7, 3, 3, 4])
	var c := Look.look_color(cls, 3, l)
	var fx := (ci * 4 + 3) * 3 + 2
	check(c.r8 == (5 << 5) | (7 << 2) | 3 and c.g8 == (3 << 6) | (4 << 3), "the look in r and g")
	check(c.b8 + 256 * (c.a8 - 128) == fx and c.a8 >= 128, "the block code in b and a, alpha kept high")
	var pal := Look.palette()
	check(pal.get_width() == int(Look.data["w"]) and pal.get_height() == ci * 0 + int(Look.data["h"]), "palette size")
	check(Look.material().shader.code.contains("texelFetch"), "the look shader builds")


func test_hit_flash_and_nudge() -> void:
	var w := HitWatch.new()
	var teams := {1: 0, 2: 1}
	var man := func(id: int, sq: int, x: float, y: float, hp: float, st: String) -> Array: return [id, sq, x, y, hp, st, 0.0]
	w.diff({10: man.call(10, 1, 5, 5, 20, "idle"), 20: man.call(20, 2, 6, 5, 20, "attack")}, teams, 1, 1000.0)
	check(w.pose(10, 1000.0).is_empty(), "the first snapshot is no hit")
	w.diff({10: man.call(10, 1, 5, 5, 14, "idle"), 20: man.call(20, 2, 6, 5, 20, "attack")}, teams, 2, 1100.0)
	var p := w.pose(10, 1110.0)
	check(not p.is_empty() and p[0], "an hp drop flashes")
	check(p[1] < 0.0, "nudged away from the striker (he stands at +x: screen right)")
	check(not w.pose(10, 1100.0 + HitWatch.FLASH + 1.0).is_empty() and not w.pose(10, 1100.0 + HitWatch.FLASH + 1.0)[0], "the flash is short, the nudge eases back")
	check(w.pose(10, 1100.0 + HitWatch.NUDGE_MS + 1.0).is_empty(), "then drawn as ever")
	w.diff({10: man.call(10, 1, 5, 5, 10, "idle"), 20: man.call(20, 2, 6, 5, 20, "attack")}, teams, 3, 1200.0)
	check(w.pose(10, 1200.0).is_empty() or not w.pose(10, 1200.0)[0], "no second flash inside FLASH_GAP")
	w.diff({10: man.call(10, 1, 5, 5, 10, "idle"), 20: man.call(20, 2, 6, 5, 18, "idle")}, teams, 4, 1300.0)
	var q := w.pose(20, 1300.0)
	check(not q.is_empty() and q[0] and q[1] == 0.0 and q[2] == 0.0, "no foe attacking near: a flash, no nudge")
	w.diff({10: man.call(10, 1, 5, 5, 10, "idle")}, teams, 4, 1400.0)
	check(w.hits == 2, "the same tick again is no new hit (%d)" % w.hits)
	check(HitWatch.flash_alpha(1.0) == HitWatch.FLASH_ALPHA and HitWatch.flash_alpha(2.5) == HitWatch.BIG_FLASH_ALPHA, "softer on a big sprite")


func test_bar_rules() -> void:
	check(Units.bar_of(false, 10, 20, 3, 3, 4, false) == Units.Bar.OWN, "own hurt: green")
	check(Units.bar_of(false, 10, 20, 0, 3, 4, false) == Units.Bar.FOE, "foe hurt: red")
	check(Units.bar_of(false, 10, 20, 4, 3, 4, false) == Units.Bar.ALLY, "neutral folk: yellow")
	check(Units.bar_of(false, 20, 20, 0, 3, 4, false) == Units.Bar.NONE, "unhurt: none")
	check(Units.bar_of(false, 20, 20, 0, 3, 4, true) == Units.Bar.FOE, "Alt: every bar")
	check(Units.bar_of(true, 5, 20, 0, 3, 4, true) == Units.Bar.NONE, "the dead: none")
	check(Units.bar_of(false, 5, 0, 0, 3, 4, true) == Units.Bar.NONE, "no max hp: none")


func test_building_art_picks() -> void:
	if not _view():
		return
	var b := Buildings.new()
	b.load_art()
	check(b.stage("foundation", 0.0) == "foundation", "a fresh site")
	check(b.stage("scaffold", 0.3) == "rising", "a quarter built: rising")
	check(b.stage("scaffold", 0.99) == "scaffold", "nearly done: scaffold, never done")
	check(b.stage("damaged", 0.0) == "damaged", "standing states as they are")
	check(b.sprite("barracks", "rising", "x")[0] == "barracks-rising.png", "ART-B by stage")
	check(b.sprite("camp", "nope", "x") == b.sprite("camp", "done", "x"), "unknown stage: done")
	check(b.sprite("woodGate", "done", "y")[0].begins_with("wood-gate-y"), "gates by axis")
	check(b.sprite("stoa", "done", "x").is_empty() and not b.pre_sprite("stoa", 3.0).is_empty(), "a stoa in the town art")
	var looks := {}
	for k in 20:
		looks[b.pre_sprite("house", k)[0]] = true
	check(looks.size() == 2, "houses in both looks by position")
	check(b.pre_state("house", 1.0, "ruined")[0].ends_with("-ruined.png"), "a ruined house")
	var r := b.rubble(3, 3)
	check(not r.is_empty() and r[0][3] <= 3 and r[0][4] <= 3, "rubble fits its footprint")
	b.free()


func test_elaia_prebuilt_pieces_drawn() -> void:
	if not FileAccess.file_exists(ViewData.DIR.path_join("elaia/meta.json")):
		return
	var region := Region.load_id("elaia")
	var sc := Scenario.make("none", region, Vector2(250, 322))
	var list: Array = sc.sim.view_state()["buildings"]
	var pre: Array = region.meta.get("prebuilt", [])
	check(list.size() == pre.size(), "every pre-built piece is a building (%d of %d)" % [list.size(), pre.size()])
	var b := Buildings.new()
	b.load_art()
	var none := []
	for x in list:
		if b.look(x).is_empty():
			none.append(x[1])
	check(none.is_empty(), "every piece of the town in its art; placeholders: %s" % [none])
	b.free()
	var types := {}
	for x in list:
		types[x[1]] = true
	for t in ["stoa", "stall", "statue", "temple", "house"]:
		check(types.has(t), "Elaia has its %s" % t)


func test_glints() -> void:
	for ph in [0.0, 1.0, 4.0]:
		for now in [0.0, 1234.0, 98765.0]:
			var a := Glints.alpha_at(now, ph)
			check(a >= 0.0 and a <= 0.73, "alpha in range")
	if not FileAccess.file_exists(ViewData.DIR.path_join("elaia/meta.json")):
		return
	var d := ViewData.load_id("elaia")
	var iso := Iso.of(d)
	var cs := Glints.cells(d, iso)
	check(cs.size() > 50, "Elaia's lake glints (%d)" % cs.size())
	var kinds: Array = d.meta["kinds"]
	var bad := 0
	for c in cs:
		var k: int = d.fk[c[4] * d.fw + c[3]]
		if (k != kinds.find("shallow") and k != kinds.find("deep")) or GroundMesh.hash3(c[3], c[4], 21) % Glints.GAP:
			bad += 1
	check(bad == 0, "only open water cells, one in GAP")


func test_idle_frames() -> void:
	check(Objects.idle_frame(0.0, 1.0, 0.0, 5.0, 6) == 0, "the still frame first")
	check(Objects.idle_frame(0.0, 1.0, 1.0, 5.0, 6) == 5, "5 fps: frame 5 a second in")
	check(Objects.idle_frame(0.0, 1.0, 1.2, 5.0, 6) == 0, "and round")
	check(Objects.idle_frame(3.5, 1.0, 0.0, 5.0, 6) == 3, "a phase offset")
	var h := Objects.hash01(12.5, 40.25)
	check(h >= 0.0 and h < 1.0 and h != Objects.hash01(40.25, 12.5), "hash01 in [0, 1), not symmetric")


func test_soft_strokes() -> void:
	var a := PackedVector2Array([Vector2(0, 0), Vector2(10, 0)])
	var b := PackedVector2Array([Vector2(10, 0), Vector2(20, 4)])
	var far := PackedVector2Array([Vector2(60, 0), Vector2(70, 0)])
	var u := GroundMesh.stroke_union([a, b, far], 4.0)
	check(u.size() == 2, "joined strokes are one outline, a far one its own (%d)" % u.size())
	for p in u:
		check(not Geometry2D.is_polygon_clockwise(p), "outlines, no holes")
	var area := 0.0
	for p in GroundMesh.stroke_union([a], 4.0):
		for k in p.size():
			area += p[k].cross(p[(k + 1) % p.size()]) / 2.0
	check(absf(area) > 10.0 * 8.0 and absf(area) < 10.0 * 8.0 + PI * 16.0 + 1.0, "a capsule's area (%.1f)" % absf(area))
