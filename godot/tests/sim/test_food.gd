## Hunger matches TS (godot/tests/golden/vectors/food.json, src/dev/vectors/food.ts): hungerStage, pace, blow.
extends TestCase

const W := preload("res://tests/sim/wild.gd")


func test_hunger_matches_ts() -> void:
	W.load_data()
	for c in W.vectors("food")["cases"]:
		var s: float = c[0]
		var d := W.diff([WildProbe.hunger_stage(s), WildProbe.pace(s), WildProbe.blow(s)], c.slice(1), "sat %s" % var_to_str(s))
		check(d == "", d)
