## The tests' world source (the game plays WorldSource, docs/impl/godot-port.md P11): the TS mock world
## (src/war/world-view/source.ts mockWorld, exported by npm run view:godot to view/world/fixture.json through
## src/dev/godotWorld.ts), run as MockSource runs it: its clock moves on, a transfer takes his group on the road for the
## border's travel time, an arrival goes in while his alliance's quota there has room, else waits (queued).
class_name WorldFixture
extends RefCounted

const PATH := "res://view/world/fixture.json"

var w := {}
var _seq := 10
var _now := 0.0


static func load_file(path := PATH) -> WorldFixture:
	var f := WorldFixture.new()
	f.w = JSON.parse_string(FileAccess.get_file_as_string(ProjectSettings.globalize_path(path)))
	f._now = float(f.w["snap"]["at"])
	return f


func view() -> Dictionary:
	w["snap"]["at"] = _now
	return w


func tick(dt: float) -> void:
	_now += dt * 1000.0
	var snap: Dictionary = w["snap"]
	var me := int(snap["you"]["alliance"])
	for t in snap["transit"].duplicate():
		if t["arriveAt"] > _now:
			continue
		var r := _region(t["to"])
		if r["live"][me] + t["men"] > w["quota"][me]:
			t["state"] = "queued"
			continue
		r["live"][me] += t["men"]
		snap["transit"].erase(t)
		var s := _squad(t["to"])
		if s.is_empty():
			w["squads"].append({"region": t["to"], "men": t["men"], "classes": {"hoplite": t["men"]}, "ids": []})
		else:
			s["men"] += t["men"]


func transfer(from: String, to: String) -> Dictionary:
	var s := _squad(from)
	if s.is_empty():
		return {"error": "no squad of yours there"}
	if WorldGeo.edge(from, to).is_empty():
		return {"error": "not a neighbour"}
	var me := int(w["snap"]["you"]["alliance"])
	_seq += 1
	var t := {"id": _seq, "from": from, "to": to, "men": s["men"], "departAt": _now, "arriveAt": _now + WorldGeo.travel_ms(from, to), "state": "moving"}
	w["squads"].erase(s)
	var r := _region(from)
	r["live"][me] = maxf(0, r["live"][me] - s["men"])
	w["snap"]["transit"].append(t)
	return {"ok": [t]}


func _region(id: String) -> Dictionary:
	for r in w["snap"]["regions"]:
		if r["id"] == id:
			return r
	return {}


func _squad(id: String) -> Dictionary:
	for s in w["squads"]:
		if s["region"] == id:
			return s
	return {}
