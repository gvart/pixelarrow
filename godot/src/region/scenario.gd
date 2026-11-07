## A live C++ Sim stepping a seeded setup on a region, for the view to draw (RegionView --spawn):
##   brawl  300 vs 300 (25 squads of 12 a side, mixed classes) attack-moving into each other round the spot, as
##          scripts/war/bench.mjs's brawl does on test-ridge; the view's 600-unit bench
##   fight  two squads a side meeting at the spot (shots)
##   march  four squads walking past the spot (shots)
class_name Scenario
extends RefCounted

const CLASSES := ["militia", "hoplite", "archer", "celt_sword", "slinger"]
const N := 12

var sim: Sim
## Per squad id: its class (the digest carries the squad, not the class), and its team.
var classes := {}
var teams := {}
## The team whose fog the view draws (-1: none).
var fog_team := -1
## Mean ms of the sim step and its bots.
var step_ms := 0.0
var _steps := 0


static func make(name: String, region: Region, at: Vector2) -> Scenario:
	SimTables.load()
	var s := Scenario.new()
	s.sim = Sim.create(region.grid(), region.meta, region.cells, 7)
	match name:
		"brawl":
			for side in 2:
				for row in 5:
					for col in 5:
						var x := at.x - 18 + col * 9
						var y := at.y + (-30 + row * 5 if side == 0 else 30 - row * 5)
						var id := s._spawn("p%d-%d-%d" % [side, row, col], side, CLASSES[(row * 5 + col + side) % 5], x, y)
						s.sim.set_bot(id, {"kind": "attackMove", "x": x, "y": at.y + (20 if side == 0 else -20)})
		"fight":
			for k in 2:
				var a := s._spawn("you%d" % k, 3, ["hoplite", "archer"][k], at.x - 8 - 6 * k, at.y - 2 + 5 * k)
				s.sim.set_bot(a, {"kind": "attackMove", "x": at.x + 4, "y": at.y})
				var b := s._spawn("foe%d" % k, 0, ["celt_sword", "slinger"][k], at.x + 8 + 6 * k, at.y + 2 - 5 * k)
				s.sim.set_bot(b, {"kind": "attackMove", "x": at.x - 4, "y": at.y})
			s.fog_team = 3
		"march":
			for k in 4:
				var a := s._spawn("you%d" % k, 3, CLASSES[k], at.x - 14, at.y - 9 + 6 * k)
				s.sim.order({"kind": "move", "squad": a, "x": at.x + 16, "y": at.y - 9 + 6 * k})
			s.fog_team = 3
		_:
			push_error("unknown scenario " + name)
	return s


func _spawn(owner: String, team: int, cls: String, x: float, y: float) -> int:
	var id: int = sim.spawn_squad(owner, team, cls, N, x, y)
	classes[id] = cls
	teams[id] = team
	return id


## One sim tick and its bots.
func step() -> void:
	var t0 := Time.get_ticks_usec()
	sim.step()
	sim.bots_tick()
	_steps += 1
	step_ms += ((Time.get_ticks_usec() - t0) / 1000.0 - step_ms) / mini(_steps, 50)
