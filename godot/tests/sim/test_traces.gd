## Whole scenarios against the TS sim: the C++ Sim replays each scenario's setup op for op (its bots too) and steps it.
## - The P1 golden traces (npm run traces:godot, src/dev/godotTraces.ts): its digest must match at every checkpoint. The
##   trace rounds to 4 decimals (toFixed), so a number matches within half a unit of the 4th.
## - The sim vectors (src/dev/vectors/sim.ts): the move and fight scenarios over 600 ticks, positions, hp and facing bit
##   for bit.
## A trace with buildings or stock waits for the economy port; SKIP lists the other scenarios not replayed yet, with why.
extends TestCase

const DIR := "res://tests/golden"
const TOL := 0.00005 + 1e-9
const Wild := preload("res://tests/sim/wild.gd")
const SKIP := {
	"combat-wounded": "a physician squad: civilians not ported yet",
	"limit-army": "a cook squad: civilians not ported yet",
	"limit-soul": "spawnSoul: souls not ported yet",
	"neutral-clear": "spawnMobs: the lairs need works (resource nodes, claims, influence) behind a MobHost: economy port",
	"eco-hunt": "spawnMobs: the lairs need works (resource nodes, claims, influence) behind a MobHost: economy port",
	"trailer-hunt": "spawnMobs: the lairs need works (resource nodes, claims, influence) behind a MobHost: economy port",
	"world-fill": "spawnMobs and spawnRoam: lairs need works behind a MobHost (economy port), roam not ported",
}


func test_traces_match() -> void:
	_load()
	var n := 0
	for f in DirAccess.get_files_at(DIR):
		if not f.ends_with(".json"):
			continue
		var id := f.get_basename()
		if SKIP.has(id):
			print("skip %s: %s" % [id, SKIP[id]])
			continue
		var t: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(DIR.path_join(f)))
		if t["frames"].any(func(fr): return fr["buildings"].size() > 0 or fr["stock"].size() > 0):
			print("skip %s: buildings or stock (economy port)" % id)
			continue
		if not t.has("setup"):
			fail("%s: the trace has no setup (regenerate with npm run traces:godot)" % id)
			return
		var frames := _replay(t, TOL)
		if frames < 0:
			return
		n += frames
		print("%s: %d checkpoints match" % [id, frames])
	check(n > 0, "no traces in " + DIR)


func test_runs_exact() -> void:
	_load()
	var runs: Array = GameData.read_exact(DIR.path_join("vectors/sim.json"))["runs"]
	check(runs.size() > 0, "no runs in vectors/sim.json")
	for t in runs:
		if SKIP.has(t["id"]):
			continue
		var frames := _replay(t, 0.0)
		if frames < 0:
			return
		print("%s: %d exact checkpoints over %d ticks" % [t["id"], frames, int(t["frames"][-1]["tick"])])


func _load() -> void:
	var t := {"war_stats": GameData.table("derived/war_stats")["WAR_STATS"], "src/war/sim/civilians": GameData.table("src/war/sim/civilians")}
	for n in Wild.TABLES:
		t[n] = GameData.table(n)
	SimData.load(t)


## Replays trace t; returns the checkpoints matched, -1 on the first mismatch (reported). tol 0: bit for bit.
func _replay(t: Dictionary, tol: float) -> int:
	var id: String = t["id"]
	var sim := Sim.create(Region.load_id(t["region"]).grid(), int(t["seed"]))
	for op in t["setup"]:
		match op[0]:
			"spawnSquad":
				sim.spawn_squad(op[1], int(op[2]), op[3], int(op[4]), float(op[5]), float(op[6]))
			"order":
				sim.order(op[1])
			"step":
				# every setup step is a stepSim (src/war/scenarios/run.ts): the sim, then its bots
				sim.step()
				sim.bots_tick()
			"bot":
				if not sim.set_bot(int(op[1]), op[2]):
					fail("%s: bot %s is not ported yet" % [id, op[2]["kind"]])
					return -1
			_:
				fail("%s: setup op %s is not replayed yet" % [id, op[0]])
				return -1
	var frames: Array = t["frames"]
	for k in frames.size():
		var want: Dictionary = frames[k]
		while sim.get_tick() < int(want["tick"]):
			sim.step()
			sim.bots_tick()
		var why := _differs(sim.digest(), want, tol)
		if why != "":
			fail("%s tick %d: %s" % [id, int(want["tick"]), why])
			return -1
	return frames.size()


## What differs between the C++ digest and the TS one ("" none); numbers at 2.. (x, y, hp, then facing if given).
static func _differs(got: Dictionary, want: Dictionary, tol: float) -> String:
	if want.get("buildings", []).size() > 0 or want.get("stock", {}).size() > 0:
		return "the trace has buildings or stock (not ported yet)"
	var gs: Array = got["squads"]
	var ws: Array = want["squads"]
	if gs.size() != ws.size():
		return "%d squads, TS %d" % [gs.size(), ws.size()]
	for i in ws.size():
		if int(gs[i][0]) != int(ws[i][0]) or int(gs[i][1]) != int(ws[i][1]) or gs[i][2] != ws[i][2]:
			return "squad %s, TS %s" % [str(gs[i]), str(ws[i])]
	var gu: Array = got["units"]
	var wu: Array = want["units"]
	if gu.size() != wu.size():
		return "%d units, TS %d" % [gu.size(), wu.size()]
	for i in wu.size():
		var g: Array = gu[i]
		var w: Array = wu[i]
		var same: bool = int(g[0]) == int(w[0]) and int(g[1]) == int(w[1]) and g[5] == w[5]
		for c in [2, 3, 4] + ([6] if w.size() > 6 else []):
			same = same and (float(g[c]) == float(w[c]) if tol == 0.0 else absf(float(g[c]) - float(w[c])) <= tol)
		if not same:
			return "unit %s, TS %s" % [_show(g), _show(w)]
	return ""


static func _show(a: Array) -> String:
	return ", ".join(a.map(func(v): return ("%.12f" % v) if v is float else str(v)))
