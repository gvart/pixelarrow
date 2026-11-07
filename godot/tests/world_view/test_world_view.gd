## The world map (src/world_view): its pure rules match TS (tests/golden/vectors/worldView.json, src/dev/vectors/
## worldView.ts: borders and travel times, score rates and standings, fog, warlord pennants and cards, a squad's place
## on the road, the camera's fit, the region card's words); the feed reads the fixture world (the TS WorldView) and a
## march runs; the names and markers never meet; and the panels never meet nor leave the screen at every window size
## the game ships for, idle, with a region's card docked, with the march order open and a line of news up.
extends TestCase

const W := preload("res://tests/sim/wild.gd")
const SIZES := [Vector2i(1280, 720), Vector2i(1520, 750), Vector2i(1920, 1080), Vector2i(844, 390), Vector2i(390, 844)]


static func _v() -> Dictionary:
	return W.vectors("worldView")


func _same(got: Variant, want: Variant, what: String) -> bool:
	var d := W.diff(got, want, what)
	if d != "":
		fail(d)
	return d == ""


func test_graph_and_season_match_ts() -> void:
	var v := _v()
	for e in v["edges"]:
		var g := WorldGeo.edge(e[0], e[1])
		if not _same([g["sideA"], g["sideB"], g["ms"], WorldGeo.travel_ms(e[0], e[1])], e.slice(2), "edge %s-%s" % [e[0], e[1]]):
			return
	var fx := WorldFixture.load_file()
	var regions: Array = fx.w["snap"]["regions"]
	for i in regions.size():
		if not _same(WorldGeo.score_rate(regions[i]), v["score"][i][1], "scoreRate " + regions[i]["id"]):
			return
	_same(WorldGeo.standings(regions), v["standings"], "standings")
	var by := {}
	for r in regions:
		by[r["id"]] = r
	var own := [{}, {"elaia": true}, {"kleisoura": true, "omphalos": true}]
	var ids: Array = GameData.table("src/war/world/graph")["WORLD_IDS"]
	for s in v["sight"]:
		var got := []
		for id in ids:
			got.append(WorldGeo.in_sight(id, s[0], by, own[int(s[1])]))
		if not _same(got, s[2], "inSight you %s own %d" % [s[0], s[1]]):
			return


func test_lords_match_ts() -> void:
	var v := _v()
	for d in v["domains"]:
		_same(WorldGeo.domain_of(WorldGeo.warlord(d[0])), d[1], "domainOf " + d[0])
	var regions: Array = WorldFixture.load_file().w["snap"]["regions"]
	for l in v["lords"]:
		_same(WorldGeo.lord_marks(regions, l[0]), l[1], "lordMarks at %d" % l[0])
		var infos := []
		for w in WorldGeo.warlords():
			infos.append(WorldGeo.lord_info(w["id"], regions, l[0]))
		_same(infos, l[2], "lordInfo at %d" % l[0])
	for r in v["rough"]:
		_same(WorldGeo.rough_men(r[0]), r[1], "roughMen %d" % r[0])
	for p in v["pennant"]:
		_same(WorldGeo.pennant_scale(p[0]), p[1], "pennantScale %s" % p[0])
	for c in v["clock"]:
		_same(WorldGeo.clock(int(c[0])), c[1], "clock %d" % c[0])


func test_map_geometry_matches_ts() -> void:
	var v := _v()
	var art: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(WorldMap._path("regions.json")))
	for t in v["transit"]:
		if not _same(WorldGeo.transit_pos(art["regions"], t[0], t[1]), t[2], "transitPos %s->%s %s at %d" % [t[0]["from"], t[0]["to"], t[0]["state"], t[1]]):
			return
	for f in v["fit"]:
		_same(WorldGeo.fit([2048.0, 1536.0], f[0], f[1], f[2]), f.slice(3), "fit %dx%d" % [f[0], f[1]])


func test_card_words_match_ts() -> void:
	var v := _v()
	var fx := WorldFixture.load_file()
	var by := {}
	for r in fx.w["snap"]["regions"]:
		by[r["id"]] = r
	for w in v["words"]:
		_same([WorldGeo.region_kind(w[0]), WorldGeo.region_tags(w[0], by.get(w[0]))], w.slice(1), "words " + w[0])
	for a in v["actions"]:
		_same(WorldGeo.region_action(a[0]), a[1], "regionAction " + a[0])


func test_feed_reads_the_fixture_and_a_march_arrives() -> void:
	var fx := WorldFixture.load_file()
	var feed := WorldFeed.make(fx)
	check(feed.regions.size() == 37, "%d regions" % feed.regions.size())
	check(feed.you == 3, "he plays Elaia: %s" % feed.you)
	check(feed.squads == {"elaia": 12}, "his men: %s" % feed.squads)
	check(feed.events.size() == 1 and feed.next_event() is Dictionary, "events %s" % [feed.events])
	check(not feed.lords.is_empty(), "no pennants")
	check(feed.transfer("elaia", "kyrene").has("error"), "a march to a land that is no neighbour went")
	var r := feed.transfer("elaia", "elaia-n")
	check(r.has("ok") and feed.squads.is_empty() and feed.transit.size() == 1, "on the road: %s %s" % [r, feed.transit])
	var ms := WorldGeo.travel_ms("elaia", "elaia-n")
	feed.tick(ms / 1000.0 - 1.0)
	check(feed.transit.size() == 1, "arrived early")
	feed.tick(2.0)
	check(feed.transit.is_empty() and feed.squads == {"elaia-n": 12}, "arrived: %s %s" % [feed.transit, feed.squads])


## A screen of the given size in a SubViewport, its map fitted.
func _screen(size: Vector2i) -> Array:
	var vp := SubViewport.new()
	vp.size = size
	Engine.get_main_loop().root.add_child(vp)
	var s := WorldScreen.new()
	vp.add_child(s)
	s.setup(WorldFeed.make(WorldFixture.load_file()), 1.0)
	s.fit()
	return [vp, s]


func _free(vp: SubViewport) -> void:
	vp.queue_free()
	Engine.get_main_loop().root.remove_child(vp)


func test_entering_opens_only_regions_in_the_build() -> void:
	var g := _screen(Vector2i(1280, 720))
	var s: WorldScreen = g[1]
	var got := []
	s.entered.connect(func(id: String) -> void: got.append(id))
	s.enter("dodona")
	check(got.is_empty() and s.hud.toast.visible, "dodona has no view data in this build: %s" % [got])
	s.enter("elaia-n")
	check(got == ["elaia-n"], "entered %s" % [got])
	_free(g[0])


func test_names_and_markers_never_meet() -> void:
	for size in SIZES:
		var g := _screen(size)
		var s: WorldScreen = g[1]
		for zoom in [1.0, 2.5]:
			if zoom != 1.0:
				s.map.zoom(zoom, s.map.size / 2.0)
			var b := s.map.boxes()
			var names: Array = b["names"]
			check(names.size() >= 4, "%s x%s: only %d names" % [size, zoom, names.size()])
			for i in names.size():
				for j in range(i + 1, names.size()):
					check(not names[i].intersects(names[j]), "%s x%s: names meet: %s %s" % [size, zoom, names[i], names[j]])
				for m: Rect2 in b["markers"]:
					check(not names[i].intersects(m), "%s x%s: a name %s meets a marker %s" % [size, zoom, names[i], m])
		_free(g[0])


func test_no_overlap_at_every_size() -> void:
	for size in SIZES:
		for state in ["idle", "card", "card2", "order", "news"]:
			var g := _screen(size)
			var s: WorldScreen = g[1]
			match state:
				"card":
					s.select("elaia")
				"card2":
					s.select("kleisoura")
				"order":
					s.select("elaia")
					s.open_order("elaia-n")
				"news":
					s.select("elaia")
					s.open_order("elaia-n")
					s.send_order()
			var why := _bad(s.hud)
			check(why == "", "%s at %dx%d (%s, scale %.2f): %s" % [state, size.x, size.y, s.hud.mode, s.hud.ui_scale, why])
			if state.begins_with("card"):
				check(s.hud.card.visible, "%s at %s: no card" % [state, size])
			if state == "order":
				check(s.hud.order.visible, "%s at %s: no march order" % [state, size])
			_free(g[0])


## "" when the screen is clean: every panel inside the screen, under the band, none meeting another, none smaller
## than its content; else what is wrong.
static func _bad(h: WorldHud) -> String:
	var rects := h.rects()
	for id in rects:
		var r: Rect2 = rects[id]
		if r.position.x < -0.01 or r.position.y < -0.01 or r.end.x > h.frame_art.x + 0.01 or r.end.y > h.frame_art.y + 0.01:
			return "%s off the screen: %s in %s" % [id, r, h.frame_art]
		if r.position.y < h.band_h:
			return "%s under the band: %s" % [id, r]
		var node: Control = h.get(id)
		var need := node.get_combined_minimum_size()
		if need.x > r.size.x + 0.5 or need.y > r.size.y + 0.5:
			return "%s needs %s, got %s" % [id, need, r.size]
	var lay := HudLayout.overlaps({}, rects)
	if not lay.is_empty():
		return "overlaps %s" % [lay]
	# the band's plaque and buttons stay apart
	var pl := h.band.plaque_rect()
	if h.band._right.get_rect().intersects(pl):
		return "band buttons meet the plaque"
	return ""
