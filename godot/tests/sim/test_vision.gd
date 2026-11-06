## Fog of war matches TS step by step (godot/tests/golden/vectors/vision.json, src/dev/godotVectors.ts visionOn):
## the same inputs give the same versions, fog states, last-seen buildings and visibleTo answers.
extends TestCase


func test_vision_matches_ts() -> void:
	for rv in GameData.read_exact("res://tests/golden/vectors/vision.json")["regions"]:
		var id: String = rv["region"]
		var g := Region.load_id(id).grid()
		var vision := Vision.create(g)
		var raised := false
		for s in rv["steps"]:
			var t := int(s["t"])
			if t > 90 and not raised: # the TS run raised a 6x6 wall by 3 levels at t 90 (seen at the next height poll)
				raised = true
				var x0 := int(rv["wall"][0])
				var y0 := int(rv["wall"][1])
				for y in range(maxi(0, y0), mini(g.h, y0 + 6)):
					for x in range(maxi(0, x0), mini(g.w, x0 + 6)):
						g.set_height(y * g.w + x, g.height_at(y * g.w + x) + 3)
			vision.tick(t, PackedFloat64Array(s["units"]), s["buildings"], {1: 3})
			for tv in s["teams"]:
				var tm := int(tv[0])
				var where := "%s t %d team %d" % [id, t, tm]
				if vision.version(tm) != int(tv[1]):
					fail("%s: version %d, TS %d" % [where, vision.version(tm), int(tv[1])])
					return
				if _sha(vision.state_of(tm)) != tv[2]:
					fail("%s: fog states differ" % where)
					return
				var seen: Array = Array(vision.last_seen(tm))
				if seen != tv[3].map(func(x): return int(x)):
					fail("%s: last seen %s, TS %s" % [where, str(seen), str(tv[3])])
					return
				for k in 6:
					var u: Array = s["units"].slice(k * 5, k * 5 + 2)
					if vision.visible_to(tm, u[0], u[1]) != tv[4][k]:
						fail("%s: visibleTo unit %d differs" % [where, k])
						return



static func _sha(b: PackedByteArray) -> String:
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(b)
	return ctx.finish().hex_encode()
