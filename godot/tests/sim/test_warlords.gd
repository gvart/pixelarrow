## The rival warlords match TS tick by tick (godot/tests/golden/vectors/warlords.json, src/dev/vectors/warlords.ts): with
## the world the TS made (squads, men, buildings, carts, claim teams) replayed in, every host call the director makes
## (spawns, orders, piles, squads dropped, bots set and cleared), its notes, the director calls' results and its
## snapshots are the same; a region in no warlord's domain gets none.
extends TestCase

const W := preload("res://tests/sim/wild.gd")
const Traces := preload("res://tests/sim/test_traces.gd")


static func load_data() -> void:
	var items := GameData.table("src/data/items")
	SimData.load({
		"war_stats": GameData.table("derived/war_stats")["WAR_STATS"],
		"src/war/sim/depth": GameData.table("src/war/sim/depth"),
		"src/data/warWarlords": GameData.table("src/data/warWarlords"),
		"src/war/sim/warlords": GameData.table("src/war/sim/warlords"),
		"src/war/world/regions": GameData.table("src/war/world/regions"),
		"src/war/world/alliances": GameData.table("src/war/world/alliances"),
		"items": items["ITEMS"],
		"src/data/items": items,
		"item_paint": GameData.table("derived/item_paint"),
	})


func test_warlords_match_ts() -> void:
	load_data()
	var v := W.vectors("warlords")
	for sc in v["scenarios"]:
		var reg := Region.load_id(sc["region"])
		var p := WarlordsProbe.create(reg.meta, reg.w, reg.h, sc["seed"], int(sc.get("cap", 999)), sc.get("inf", []), v["off"])
		if sc.get("none", false):
			check(p.none(), "%s: no warlord" % sc["region"])
			continue
		check(not p.none(), "%s: warlords" % sc["region"])
		var last := -2
		for rec in sc["ticks"]:
			var t := int(rec["t"])
			var where := "%s t %d" % [sc["region"], t]
			if not rec.has("j"):
				for k in range(last + 1, t):
					var quiet := p.tick(k, false)
					if not quiet.is_empty():
						fail("%s: notes on a quiet tick %d" % [where, k])
						return
			p.take_events()
			p.apply(rec)
			for c in rec.get("c", []):
				var got = p.call_api(c.slice(0, c.size() - 1))
				var d := W.diff(got, c[c.size() - 1], "%s call %s" % [where, str(c).left(80)])
				if d != "":
					fail(d)
					return
			var notes := p.tick(t, t % 10 == 0)
			var d := W.diff(p.take_events(), rec.get("e", []), where + " events")
			if d == "":
				d = W.diff(notes, rec.get("n", []), where + " notes")
			if d == "" and rec.has("s"):
				d = W.diff({"snaps": p.snaps(), "men": p.call_api(["men"])}, rec["s"], where + " snaps")
			if d != "":
				fail(d)
				return
			last = t


## The warlords wired to the real sim (godot/tests/golden/vectors/warlordsHost.json, src/dev/vectors/warlordsHost.ts): the
## scenario's setup replayed, the warlords started as the sandbox starts them, then each WarHost step (the sim, its
## bots, the warlords) matches the TS bit for bit every 25 ticks: men, buildings, stock, the event log, the warlords'
## notes since the last frame, their snaps and men.
func test_warlords_on_the_sim_match_ts() -> void:
	Traces._load()
	var runs: Array = W.vectors("warlordsHost")["runs"]
	check(runs.size() > 0, "no runs in vectors/warlordsHost.json")
	for t in runs:
		var id: String = t["id"]
		# ['warlords', age, players, raid]: they read nothing of the sim when started, so they start after the rest
		var start: Array = []
		var setup: Array = []
		for op in t["setup"]:
			if op[0] == "warlords":
				start = op
			else:
				setup.append(op)
		var run: Dictionary = t.duplicate()
		run["setup"] = setup
		var sim := Traces.make(run, self)
		if sim == null:
			return
		var host := WarHost.create(sim)
		check(not start.is_empty() and host.start_warlords(float(start[1]), float(start[2]), start[3]), "%s: warlords started" % id)
		var frames: Array = t["frames"]
		for want in frames:
			while sim.get_tick() < int(want["tick"]):
				host.step()
			var where := "%s tick %d" % [id, int(want["tick"])]
			var why := Traces._differs(sim.digest(), want, 0.0)
			if why == "":
				why = W.diff(sim.events(), want["events"], "events")
			if why == "":
				why = W.diff(host.warlord_notes(), want["lords"]["notes"], "notes")
			if why == "":
				why = W.diff({"snaps": host.warlord_snaps(), "men": host.warlord_men()}, {"snaps": want["lords"]["snaps"], "men": want["lords"]["men"]}, "snaps")
			if why != "":
				fail("%s: %s" % [where, why])
				return
		print("%s: %d exact checkpoints with the warlords" % [id, frames.size()])
