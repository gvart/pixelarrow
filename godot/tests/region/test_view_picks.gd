## The region view's picks: the level of detail by zoom and crowd, the drawn quadrant with its hysteresis, the clip
## frame and fallback picks, the art hashes against the TS ones (autotile.ts, anim.ts), CSS colours; and, when the view
## data was exported (npm run view:godot, not in CI), a chunk of Elaia's ground built as a mesh within its atlas pages.
extends TestCase


func test_lod_by_zoom_and_crowd() -> void:
	check(Units.lod_of(1.0, 10) == Units.Lod.FULL, "few men at 1x: full")
	check(Units.lod_of(0.5, Units.CROWD) == Units.Lod.FULL, "CROWD men still full")
	check(Units.lod_of(0.5, Units.CROWD + 1) == Units.Lod.CROWD, "more: crowd (no rings)")
	check(Units.lod_of(0.25, 5) == Units.Lod.DOTS, "under a third zoom: dots")
	check(Units.lod_of(Units.SPRITE_ZOOM, 5) == Units.Lod.FULL, "at a third: sprites")


func test_quadrant_and_hysteresis() -> void:
	# tile headings: +x draws right-down on screen, +y left-down (straight down, +x +y, is the SE/SW edge)
	check(Units.quadrant(0.0, -1) == 0, "facing +x: south-east")
	check(Units.quadrant(PI / 2.0, -1) == 1, "facing +y: south-west")
	check(Units.quadrant(-PI / 2.0, -1) == 2, "facing -y: north-east")
	check(Units.quadrant(PI, -1) == 3, "facing -x: north-west")
	# just past the SE/SW edge (screen down): kept while within the hysteresis, switched beyond it
	var edge := PI / 4.0
	check(Units.quadrant(edge + 0.1, 0) == 0, "a heading wavering past the edge keeps its quadrant")
	check(Units.quadrant(edge + 0.1, -1) == 1, "without a last quadrant it is the true one")
	check(Units.quadrant(edge + Units.QUAD_HYST + 0.05, 0) == 1, "well past the edge it switches")


func test_clip_frames() -> void:
	var c := [6, 10.0, 2] # 6 frames at 10 fps, looping from frame 2
	check(Anim.frame_at(c, 0.0) == 0, "starts at 0")
	check(Anim.frame_at(c, 250.0) == 2, "a quarter second: frame 2")
	check(Anim.frame_at(c, 599.0) == 5, "the last frame")
	check(Anim.frame_at(c, 600.0) == 2, "then back to the hold")
	check(Anim.frame_at(c, 1000.0) == 2 + (10 - 2) % 4, "and round again")
	check(Anim.frame_at([4, 10.0, 3], 5000.0) == 3, "a hold on the last frame stays there")
	check(Anim.frame_at(c, -50.0) == 0, "before the start: frame 0")


func test_clip_fallbacks() -> void:
	var clips := {"idle": [4, 6.0, 0], "attack": [6, 10.0, 0]}
	check(Anim.pick_clip(clips, ["attack"]) == "attack", "the sheet's own clip")
	check(Anim.pick_clip(clips, ["nope", "attack"]) == "attack", "the first the sheet has")
	check(Anim.pick_clip(clips, ["nothing-like-it"]) == "idle", "none: idle")


func test_hashes_match_ts() -> void:
	# autotile.ts hash and anim.ts hash, values from the TS functions
	for t in [[0, 0, 0, 0], [1, 2, 0, 103314787], [123, 456, 7, 843681174], [1023, 1023, 3, 39631847], [-5, 9, 1, 3882188815], [99999, 77777, 12, 3372711320]]:
		check(GroundMesh.hash3(t[0], t[1], t[2]) == t[3], "hash3%s = %d" % [t, GroundMesh.hash3(t[0], t[1], t[2])])
	for t in [[0, 0, 0], [1, 3, 1508487390], [600, 3, 3127726054], [123456, 7, 1070755655], [99999, 0, 3509842860]]:
		check(Anim.ihash(t[0], t[1]) == t[2], "ihash%s = %d" % [t, Anim.ihash(t[0], t[1])])


func test_css_colours() -> void:
	check(GroundMesh.css("rgb(255, 0, 51)").is_equal_approx(Color(1, 0, 0.2, 1)), "rgb()")
	check(GroundMesh.css("rgba(10,20,30,0.25)").is_equal_approx(Color(10 / 255.0, 20 / 255.0, 30 / 255.0, 0.25)), "rgba()")
	check(GroundMesh.css("none").a == 0.0, "anything else: clear")


func test_elaia_chunk_mesh() -> void:
	if not FileAccess.file_exists(ViewData.DIR.path_join("elaia/meta.json")):
		return # the view data is generated (npm run view:godot); CI has none
	var d := ViewData.load_id("elaia")
	var iso := Iso.of(d)
	var gm := GroundMesh.new(d, iso, Ground.CHUNK)
	# a chunk of the town's hillside (cliffs, ramps, walls and water nearby)
	var cx := 240 * 2 / Ground.CHUNK
	var cy := 320 * 2 / Ground.CHUNK
	var mesh := gm.build(cx * Ground.CHUNK, cy * Ground.CHUNK, Ground.CHUNK)
	check(mesh != null, "the chunk draws")
	if mesh == null:
		return
	var a := mesh.surface_get_arrays(0)
	var v: PackedVector2Array = a[Mesh.ARRAY_VERTEX]
	var uv: PackedVector2Array = a[Mesh.ARRAY_TEX_UV]
	check(v.size() > 4 * Ground.CHUNK * Ground.CHUNK, "every cell drawn: %d vertices" % v.size())
	# UV.x picks the texture: 4 per atlas page, then 4 per wall stone (repeating)
	var pages := 4.0 * int(d.meta["pages"])
	var bad := 0
	for k in uv.size():
		var u := uv[k]
		var on_page := u.x >= 0.0 and u.x < pages and fmod(u.x, 4.0) <= 1.0 and u.y >= 0.0 and u.y <= 1.0
		var on_stone: bool = u.x >= 8.0 and u.x < 8.0 + 4.0 * d.meta["stones"].size()
		if is_nan(u.x) or is_nan(u.y) or not (on_page or on_stone):
			bad += 1
	check(bad == 0, "%d of %d UVs off their texture" % [bad, uv.size()])
	# the vertices lie over the chunk's own patch of screen
	var x0 := cx * Ground.CHUNK
	var y0 := cy * Ground.CHUNK
	var left := iso.ox + (x0 - (y0 + Ground.CHUNK)) * 16.0 - 160.0
	var right := iso.ox + (x0 + Ground.CHUNK - y0) * 16.0 + 160.0
	var off := 0
	for p in v:
		if p.x < left or p.x > right:
			off += 1
	check(off == 0, "%d vertices outside the chunk's columns" % off)
