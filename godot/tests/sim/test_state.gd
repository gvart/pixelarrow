## Sim saves against the TS sim (src/dev/vectors/state.ts): each run is played to its save tick (setup replayed, bots
## on), where
## - the C++ save is the TS save byte for byte;
## - a fresh C++ sim loaded from the TS save plays on (no bots) as the TS one loaded from it did, digested exactly;
## - a fresh C++ sim loaded from the C++ save saves the same text again and plays on with the original, bit for bit.
extends TestCase

const Traces := preload("res://tests/sim/test_traces.gd")
const FILE := "res://tests/golden/vectors/state.json"


func test_state_runs() -> void:
	Traces._load()
	var runs: Array = GameData.read_exact(FILE)["runs"]
	check(runs.size() > 0, "no runs in " + FILE)
	for t in runs:
		if not _run(t):
			return


## A sim of run t as created, nothing set up (what the TS importState loads into).
func _fresh(t: Dictionary) -> Sim:
	var bare: Dictionary = t.duplicate()
	bare["setup"] = []
	return Traces.make(bare, self)


func _run(t: Dictionary) -> bool:
	var id: String = t["id"]
	var sim := Traces.make(t, self)
	if sim == null:
		return false
	while sim.get_tick() < int(t["tick"]):
		sim.step()
		sim.bots_tick()
	var ts := Marshalls.base64_to_raw(t["save"]).decompress_dynamic(-1, FileAccess.COMPRESSION_GZIP).get_string_from_utf8()
	var mine := sim.save()
	if mine != ts:
		var at := 0
		while at < mini(mine.length(), ts.length()) and mine[at] == ts[at]:
			at += 1
		fail("%s: the C++ save (%d chars) differs from the TS one (%d) at %d: ...%s... TS ...%s..." % [id, mine.length(), ts.length(), at, mine.substr(maxi(0, at - 60), 120), ts.substr(maxi(0, at - 60), 120)])
		return false
	# loaded from the TS save: on as the TS loaded sim went
	var from_ts := _fresh(t)
	if not from_ts.load(ts):
		fail("%s: the TS save does not load" % id)
		return false
	# loaded from its own save: the same save again, and on with the original
	var from_me := _fresh(t)
	from_me.load(mine)
	if from_me.save() != mine:
		fail("%s: a sim loaded from the C++ save saves another text" % id)
		return false
	var frames: Array = t["frames"]
	for k in frames.size():
		var want: Dictionary = frames[k]
		while from_ts.get_tick() < int(want["tick"]):
			from_ts.step()
			from_me.step()
			sim.step()
		for pair in [[from_ts, "loaded from the TS save"], [from_me, "loaded from the C++ save"], [sim, "the original"]]:
			var why := Traces._differs(pair[0].digest(), want, 0.0)
			if why != "":
				fail("%s tick %d, %s: %s" % [id, int(want["tick"]), pair[1], why])
				return false
	# and all their state, not only what the digests show
	var end := sim.save()
	if from_ts.save() != end or from_me.save() != end:
		fail("%s tick %d: the loaded sims' saves differ from the original's" % [id, sim.get_tick()])
		return false
	print("%s: save of %d chars at tick %d, %d exact checkpoints after it" % [id, mine.length(), int(t["tick"]), frames.size()])
	return true
