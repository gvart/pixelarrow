## Feeds the region view (RegionView's Units, Buildings, Fog) from the decoded client state (WarClient), in the row
## shapes the view reads from a Sim (Sim.digest, Sim.view_state, Sim.fog_state): the view draws what the room sent,
## the same online and off (docs/impl/godot-port.md P10, G-04).
class_name ViewFeed
extends RefCounted

var client: WarClient
var view: RegionView
var _fog_v := -1


static func make(client_: WarClient, view_: RegionView) -> ViewFeed:
	var f := ViewFeed.new()
	f.client = client_
	f.view = view_
	client_.frame.connect(f._on_frame)
	client_.message.connect(f._on_message)
	return f


## Units digest rows [id, squad, x, y, hp, state, facing], squads [id, team, owner] and the info rows [id, maxHp, cls,
## person id, level], plus each squad's class and team, from a snapshot.
static func rows(snap: Dictionary) -> Dictionary:
	var us := []
	var info := []
	var classes := {}
	for u in snap.get("units", []):
		us.append([int(u["id"]), int(u["squad"]), u["x"], u["y"], u["hp"], u["state"], u["facing"]])
		info.append([int(u["id"]), u["maxHp"], u["cls"], u.get("pid", ""), float(u.get("level", 0))])
		if not classes.has(int(u["squad"])):
			classes[int(u["squad"])] = u["cls"]
	var qs := []
	var teams := {}
	for q in snap.get("squads", []):
		qs.append([int(q["id"]), int(q["team"]), q["owner"]])
		teams[int(q["id"])] = int(q["team"])
	return {"digest": {"tick": snap.get("tick", 0), "units": us, "squads": qs}, "info": info, "classes": classes, "teams": teams}


## A BuildingSnap as the view's building row (Sim.view_state buildings).
static func building_row(b: Dictionary) -> Array:
	var t := PackedInt32Array()
	for v in b.get("tiles", []):
		t.append(int(v))
	return [int(b["id"]), b["type"], int(b["team"]), b["x"], b["y"], b["w"], b["h"], int(b.get("rot", 0)), b["state"], b.get("progress", 1.0), b.get("hp", 0.0), b.get("maxHp", 0.0), b.get("ruin", false), b.get("wet", false), b.get("fouled", false), b.get("delivered", 0.0), t]


func _on_frame(snap: Dictionary) -> void:
	var r := rows(snap)
	var u := view.units
	for k in r["classes"]:
		u.classes[k] = r["classes"][k]
	for k in r["teams"]:
		u.teams[k] = r["teams"][k]
	u.mine = client.team()
	u.push(r["digest"], int(snap.get("tick", 0)), r["info"])
	view.buildings.push(snap.get("buildings", []).map(building_row))


func _on_message(m: Dictionary) -> void:
	if m.get("t") == "fog" and client.fog_size != Vector3i.ZERO:
		view.fog.team = client.team()
		view.fog.set_state(client.fog_state, client.fog_size)
