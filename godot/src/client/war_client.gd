## The game's only way to the region (docs/impl/godot-port.md P10, G-04): protocol messages out (join, order, view,
## check, ping, dev; src/war/net/protocol.ts), server messages and binary frames in, as src/war/net/client.ts has it
## for the browser. The transport is LocalRoom offline (send(msg), tick(), take() of [pid, Dictionary |
## PackedByteArray]); an online socket can stand in with the same three calls. Frames are decoded here
## (DeltaDecoder) and every view and panel reads the decoded state, never the Sim.
##
## State kept from the messages: you (welcome), the latest snapshot and the one before, the stock at hand, fog,
## influence, town, wild, allies, settlements, resource nodes; every message is also passed on as `message`.
class_name WarClient
extends RefCounted

## A frame applied: the snapshot as the TS client has it (DeltaDecoder.snapshot()).
signal frame(snap: Dictionary)
## Any JSON server message (welcome, refused, error, checked, stock, fog, soul, dropped, bossEv, ...).
signal message(m: Dictionary)

## Ticks a second, as the region loop runs (server/src/war/regionDO.ts TICK_MS).
const HZ := 10.0

var transport: Object
var decoder: DeltaDecoder
var net_version: int
var region_id: String
## The player: {id, team} once welcomed (empty before).
var you := {}
var welcomed := false
var snap := {}
var prev := {}
## Wall-clock ms the latest frame came in (for interpolation).
var snap_ms := 0.0
## W-60: the store his men stand by (id or null) and its goods.
var stock := {"store": null, "goods": {}}
## W-39: his team's fog, w x h cells of `cell` tiles (0 unexplored, 1 explored, 2 seen); empty before the first.
var fog_state := PackedByteArray()
var fog_size := Vector3i.ZERO
var influence := {}
var town = null
var wild := {}
var allies: Array = []
var settlements: Array = []
## Resource nodes he sees, by id: NodeSnap dictionaries.
var nodes := {}
## Answers to placement checks by id (`checked`'s result; null: refused outright).
var checked := {}
var _check_id := 0
var _acc := 0.0
var _last_view := Rect2()


## transport: send(Dictionary), take() -> Array, and for a local room tick(); constants: LocalRoom.constants().
static func make(transport_: Object, region: String, constants: Dictionary) -> WarClient:
	var c := WarClient.new()
	c.transport = transport_
	c.region_id = region
	c.net_version = int(constants["NET_VERSION"])
	c.decoder = DeltaDecoder.new(c.net_version, float(constants["QUANT"]))
	return c


## Join with fresh men by class and count (the dev army join; persons joins come with the room's wave A).
func join_army(pid: int, team: int, groups: Array) -> void:
	var army := []
	for g in groups:
		army.append({"cls": g[0], "count": g[1]})
	send({"t": "join", "v": net_version, "region": region_id, "playerId": pid, "team": team, "army": army})


func order(o: Dictionary) -> void:
	send({"t": "order", "o": o})


## The camera's tile rect (interest management): sent when it moved a few tiles.
func view(r: Rect2) -> void:
	if r.position.distance_to(_last_view.position) < 2.0 and r.end.distance_to(_last_view.end) < 2.0:
		return
	_last_view = r
	send({"t": "view", "x0": r.position.x, "y0": r.position.y, "x1": r.end.x, "y1": r.end.y})


## A placement check (building, wall or bridge: protocol.ts checkSchema without t and id); its id. The answer lands
## in `checked[id]` and comes as a `checked` message.
func check(c: Dictionary) -> int:
	_check_id += 1
	var m := c.duplicate()
	m["t"] = "check"
	m["id"] = _check_id
	send(m)
	return _check_id


func dev(m: Dictionary) -> void:
	var d := m.duplicate()
	d["t"] = "dev"
	send(d)


func send(m: Dictionary) -> void:
	transport.send(m)
	_drain()


## The local loop: the room's ticks at HZ (at most 3 a frame), then what it sent.
func pump(dt: float) -> void:
	if not transport.has_method("tick"):
		_drain()
		return
	_acc += dt
	var n := 0
	while _acc >= 1.0 / HZ and n < 3:
		_acc -= 1.0 / HZ
		transport.tick()
		n += 1
	if _acc > 1.0 / HZ:
		_acc = 0.0
	_drain()


## How far into the next tick we are (0..1), to draw between the last two frames.
func alpha() -> float:
	return clampf(_acc * HZ, 0.0, 1.0)


func _drain() -> void:
	for pair in transport.take():
		var m: Variant = pair[1]
		if m is PackedByteArray:
			var s = decoder.apply(m)
			if s != null:
				prev = snap
				snap = s
				snap_ms = Time.get_ticks_msec()
				frame.emit(snap)
		else:
			_read(m)
			message.emit(m)


func _read(m: Dictionary) -> void:
	match String(m.get("t", "")):
		"welcome":
			you = m["you"]
			welcomed = true
		"stock":
			stock = {"store": m["store"], "goods": m["goods"]}
		"fog":
			var w := int(m["w"])
			var h := int(m["h"])
			var st := PackedByteArray()
			st.resize(w * h)
			var runs: Array = m["runs"]
			var i := 0
			for k in range(0, runs.size(), 2):
				var end := mini(st.size(), i + int(runs[k + 1]))
				for j in range(i, end):
					st[j] = int(runs[k])
				i = end
			fog_state = st
			fog_size = Vector3i(w, h, int(m["cell"]))
		"influence":
			influence = m
		"town":
			town = m["town"]
		"wild":
			wild = m
		"allies":
			allies = m["players"]
		"settlements":
			settlements = m["list"]
		"nodes":
			for r in m["rows"]:
				var n := unpack_node(r)
				nodes[int(n["id"])] = n
			for id in m.get("gone", []):
				nodes.erase(int(id))
		"checked":
			checked[int(m["id"])] = m["result"]


## src/war/net/economy.ts unpackNode: [id, good index (protocol GOODS), x, y, amount, max, flags (1 guarded, 2 rare),
## obj (-1 none), building (-1 none)].
static func unpack_node(r: Array) -> Dictionary:
	var goods: Array = LocalRoom.constants()["GOODS"]
	var n := {"id": int(r[0]), "res": goods[int(r[1])] if int(r[1]) >= 0 and int(r[1]) < goods.size() else "", "x": float(r[2]), "y": float(r[3]), "amount": float(r[4]), "max": float(r[5])}
	if int(r[7]) >= 0:
		n["obj"] = int(r[7])
	if int(r[8]) >= 0:
		n["building"] = int(r[8])
	if int(r[6]) & 1:
		n["guarded"] = true
	if int(r[6]) & 2:
		n["rare"] = true
	return n


# ---- reading the snapshot (what the HUD and the input ask) ----

## The owner string the room puts on his squads (server/src/war/room.ts: "p:<id>").
func owner_name() -> String:
	return "p:%d" % int(you.get("id", -1))


func is_mine(q: Dictionary) -> bool:
	return String(q.get("owner", "")) == owner_name()


## His squads in the snapshot.
func my_squads() -> Array:
	var me := owner_name()
	return snap.get("squads", []).filter(func(q: Dictionary) -> bool: return q["owner"] == me)


## His team (-1 before the welcome).
func team() -> int:
	return int(you.get("team", -1))
