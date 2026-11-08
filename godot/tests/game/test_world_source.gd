## The game's world (godot/src/game/world_source.gd, docs/impl/godot-port.md P11): his group and the trade on the map
## are built as the TS source builds them (src/war/world-view/source.ts fieldSquads, waitingHome, liveTrade; vectors in
## src/dev/vectors/worldView.ts); on the slice world (Elaia and its neighbours, the other alliances' AIs there) his men
## march from Elaia to a neighbour on the map's source, arrive and show up in that region's room; and a short season
## plays to its end, rolls over and his army stands at home again.
extends TestCase

const W := preload("res://tests/sim/wild.gd")
const Traces := preload("res://tests/sim/test_traces.gd")


func test_squads_and_trade_match_ts() -> void:
	var v := W.vectors("worldView")
	for r in v["rosters"]:
		var why := W.diff([WorldSource.field_squads(r[0], r[1]), WorldSource.waiting_home(r[0], r[1])], [r[2], r[3]], "roster %s home %s" % [str(r[0]), str(r[1])])
		if why != "":
			fail(why)
			return
	var why := W.diff(WorldSource.live_trade(v["trade"][0]), v["trade"][1], "liveTrade")
	check(why == "", why)


func test_march_to_a_neighbour_arrives() -> void:
	Traces._load()
	var src := WorldSource.slice("elaia", 3, {"season": {"travelScale": 0.05, "offExitMsPerTile": 75}})
	var ids := src.world.room_ids()
	check(ids.size() >= 2 and ids[0] == "elaia" and ids.has("elaia-e"), "slice rooms %s" % str(ids))
	var feed := WorldFeed.make(src)
	check(feed.squads.get("elaia", 0) == 24, "his 24 men at home on the map, got %s" % str(feed.squads))
	check(int(feed.view["quota"][3]) > 0 and feed.view["scores"] is Array and float(feed.view["endsAt"]) > 0, "season on the view")
	var r := feed.transfer("elaia", "elaia-e")
	if not check_ok(r.has("ok"), "transfer: %s" % str(r)):
		return
	check(feed.transit.size() == 1 and feed.squads.is_empty(), "on the road: %s %s" % [str(feed.transit), str(feed.squads)])
	check(feed.transfer("elaia", "elaia-e").has("error"), "a second march with nobody there is refused")
	var t := Time.get_ticks_msec()
	var n := 0
	while not feed.squads.has("elaia-e") and n < 3000:
		feed.tick(1.0 / WorldSource.HZ)
		n += 1
	print("march elaia -> elaia-e: %d ticks (%d rooms, %.1f ms a tick)" % [n, ids.size(), float(Time.get_ticks_msec() - t) / maxi(1, n)])
	if not check_ok(feed.squads.get("elaia-e", 0) == 24, "arrived: %s, transit %s" % [str(feed.squads), str(feed.transit)]):
		return
	# the region screen's client on that room takes his men over
	var client := WarClient.make(src.link("elaia-e"), "elaia-e", LocalRoom.constants())
	client.send(src.join_msg("elaia-e"))
	for k in 5:
		client.pump(1.0 / WorldSource.HZ)
	check(client.welcomed and client.my_squads().size() > 0, "his squads in elaia-e: welcomed %s, %d squads" % [client.welcomed, client.my_squads().size()])
	src.unlink("elaia-e")
	check(src.region == "", "unlinked")


func test_short_season_plays_to_its_end() -> void:
	Traces._load()
	var src := WorldSource.slice("elaia", 3, {"ms_per_tick": 20000, "season": {"lengthMs": 1000 * 20000}})
	var rolled := [0]
	src.rolled.connect(func() -> void: rolled[0] += 1)
	var feed := WorldFeed.make(src)
	var first := int(feed.view["snap"]["season"])
	var t := Time.get_ticks_msec()
	var n := 0
	while rolled[0] == 0 and n < 1500:
		feed.tick(1.0 / WorldSource.HZ)
		n += 1
	var st: Dictionary = src.world.state()
	print("season %d over in %d ticks (%.1f ms a tick): %s" % [first, n, float(Time.get_ticks_msec() - t) / maxi(1, n), str(st.get("last", {}).get("scores", []))])
	if not check_ok(rolled[0] == 1, "the season did not end in %d ticks" % n):
		return
	check(int(st["season"]["id"]) == first + 1 and st.get("last") is Dictionary, "the next season and the last board: %s" % str(st["season"]))
	var total := 0.0
	for x in st["last"]["scores"]:
		total += float(x)
	check(total > 0.0, "nobody scored: %s" % str(st["last"]))
	feed.push(src.view())
	check(feed.squads.get("elaia", 0) == 24, "his army at home again: %s" % str(feed.squads))
	for k in 20:
		feed.tick(1.0 / WorldSource.HZ)
	check(src.world.get_tick() > n, "the world runs on")


func check_ok(ok: bool, msg: String) -> bool:
	check(ok, msg)
	return ok
