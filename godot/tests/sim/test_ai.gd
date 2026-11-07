## The headless AI-vs-AI season matches TS tick by tick (godot/tests/golden/vectors/aiSeason.json,
## src/dev/vectors/aiSeason.ts): one region with every alliance on the alliance AI (alliance_ai.h), its rival warlords
## and its wild, played on WarHost to the season's end (season_clock.h). Every checkpoint the digest, the events, the
## claim points, the engines, each AI's stats, the warlords' notes and the clock are the same; and the season moves
## (the world changes every PROGRESS ticks, the score clock keeps up) and ends at its time.
extends TestCase

const W := preload("res://tests/sim/wild.gd")
const Traces := preload("res://tests/sim/test_traces.gd")
const PROGRESS := 1000
const TICK_MS := 100.0


func test_ai_season_matches_ts() -> void:
	Traces._load()
	var runs: Array = W.vectors("aiSeason")["runs"]
	check(runs.size() > 0, "no runs in vectors/aiSeason.json")
	for t in runs:
		var id: String = t["id"]
		var region := Region.load_id(t["region"])
		var sim := Sim.create(region.grid(), region.meta, region.cells, int(t["seed"]))
		var host := WarHost.create(sim)
		var o: Dictionary = t["opts"]
		host.start_season(float(t["seed"]), float(t["ticks"]) * TICK_MS, float(o.get("age", 0)), o.get("held"))
		var ended := false
		var seen := ""
		for want in t["frames"]:
			while sim.get_tick() < int(want["tick"]):
				ended = host.step()
			var tick := sim.get_tick()
			var where := "%s tick %d" % [id, tick]
			var why := Traces._differs(sim.digest(), want, 0.0)
			if why == "":
				why = W.diff(sim.events(), want["events"], "events")
			if why == "":
				why = W.diff(host.claim_rows(), want["claims"], "claims")
			if why == "":
				why = W.diff(host.siege_rows(), want["sieges"], "sieges")
			if why == "":
				why = W.diff(host.ai_stats(), want["ai"], "ai")
			if why == "":
				why = W.diff({"notes": host.warlord_notes(), "men": host.warlord_men()}, want["lords"], "lords")
			if why == "":
				why = W.diff(host.clock_state(), want["clock"], "clock")
			if why != "":
				fail("%s: %s" % [where, why])
				return
			# progress: the score clock keeps up with the season, and the world is not the same PROGRESS ticks on
			var c: Dictionary = host.clock_state()
			if float(c["accruedAt"]) != tick * TICK_MS:
				fail("%s: scored to %s" % [where, str(c["accruedAt"])])
				return
			if tick % PROGRESS == 0:
				var now := str([sim.digest()["units"], host.claim_rows(), host.siege_rows()])
				if now == seen:
					fail("%s: nothing changed in %d ticks" % [where, PROGRESS])
					return
				seen = now
		var end: Variant = host.clock_state()["ended"]
		check(ended and end != null and float(end["at"]) == float(t["ticks"]) * TICK_MS, "%s: the season ended at its time (%s)" % [id, str(end)])
		check(host.step() and sim.get_tick() == int(t["ticks"]), "%s: nothing steps once it ended" % id)
		print("%s: %d exact checkpoints to the end at tick %d (%s)" % [id, t["frames"].size(), sim.get_tick(), str(end)])
