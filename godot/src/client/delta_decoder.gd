## The client side of the binary snapshot frames (src/war/net/codec.ts DeltaDecoder, line for line): applies each frame
## to its copy of what the client sees and hands out a Snapshot dictionary with the TS keys (units, squads, shots,
## buildings, sieges, souls, bosses, warden). Checked against the TS decoder by tests/client/test_delta_decoder.gd.
##
## One difference stays: the JSON blocks of a frame (buildings, engines, souls, guardians' slow part) go through
## Godot's JSON, which rounds some long floats an ulp off (docs/impl/godot-port.md "Open risks"); the binary fields are
## exact. Nothing the client draws or shows needs those last bits.
class_name DeltaDecoder
extends RefCounted

const POS := 1
const FACE := 2
const HP := 4
const STATE := 8
const Z := 16
const ANIM := 32
const META := 64
const EXTRA := 128
const STATES := ["idle", "move", "attack", "dead", "gather", "build"]
const TASKS := ["", "ignite", "extinguish", "push", "crew"]
const CARRY := ["", "food", "wood", "stone", "marble", "copper", "tin", "iron", "bronze", "silver", "salt", "pitch"]
const MISSILES := ["arrow", "stone", "javelin"]
const REASONS := ["", "noBrazier", "noPitch"]

## The wire's version and position step (src/war/net/protocol.ts; LocalRoom.constants() has the same).
var net_version := 28
var quant := 8.0

## What the client sees, by id (insertion order as the TS Maps keep it).
var units := {}
var squads := {}
## Squad actives as absolute ticks [skill, ready at, buff over at].
var actives := {}
var shots: Array = []
var buildings := {}
var sieges := {}
## W-60 souls, `left` as the absolute tick they fade.
var souls := {}
## W-67 guardians as sent (countdowns absolute) and the Rim Warden's mark (null: none).
var bosses := {}
var warden = null
## Combat tag end ticks by unit (absolute).
var tags := {}
var tick := 0

var _b: PackedByteArray
var _n := 0


func _init(version := 28, quant_ := 8.0) -> void:
	net_version = version
	quant = quant_


func _u8() -> int:
	_n += 1
	return _b[_n - 1]


func _u16() -> int:
	_n += 2
	return _b.decode_u16(_n - 2)


func _u32() -> int:
	_n += 4
	return _b.decode_u32(_n - 4)


func _v() -> int:
	var x := 0
	var sh := 0
	var b := 0x80
	while b & 0x80:
		b = _b[_n]
		_n += 1
		x += (b & 0x7f) << sh
		sh += 7
	return x


func _z() -> int:
	var v := _v()
	return -((v + 1) >> 1) if v % 2 else v >> 1


func _s() -> String:
	var len := _u8()
	var t := _b.slice(_n, _n + len).get_string_from_ascii()
	_n += len
	return t


func _bytes() -> PackedByteArray:
	var len := _v()
	var b := _b.slice(_n, _n + len)
	_n += len
	return b


## Apply one frame; the snapshot after it. A frame of another wire version is refused (null, and an error logged).
func apply(data: PackedByteArray) -> Variant:
	_b = data
	_n = 0
	var kind := _u8()
	var v := _u8()
	if v != net_version:
		push_error("net version %d, expected %d" % [v, net_version])
		return null
	var t := _u32()
	if kind == 2:
		units.clear()
		squads.clear()
		actives.clear()
		shots = []
		buildings.clear()
		sieges.clear()
		souls.clear()
		tags.clear()
		bosses.clear()
		warden = null
	tick = t
	for k in _v():
		var id := _v()
		var m := _u8()
		var u: Dictionary = units.get(id, {"id": id, "squad": 0, "x": 0.0, "y": 0.0, "facing": 0.0, "hp": 0.0, "maxHp": 0.0, "cls": "", "state": "idle"})
		if m & POS:
			u["x"] = _u16() / quant
			u["y"] = _u16() / quant
		if m & FACE:
			var f := _u8() / 256.0 * TAU
			u["facing"] = f - TAU if f > PI else f
		if m & HP:
			u["hp"] = _u16() / 10.0
		if m & STATE:
			var s := _u8()
			u["state"] = STATES[s & 7] if (s & 7) < STATES.size() else "idle"
			if s & 8:
				u["wounded"] = (s & 16) != 0
			else:
				u.erase("wounded")
			if s & 32:
				u["down"] = true
			else:
				u.erase("down")
		if m & Z:
			u["z"] = _u8()
		if m & ANIM:
			var sw := _u8()
			var rd := _u8()
			if sw == 255:
				u.erase("swing")
			else:
				u["swing"] = sw
			if rd == 255:
				u.erase("ready")
			else:
				u["ready"] = rd
		if m & META:
			u["squad"] = _v()
			u["maxHp"] = _u16() / 10.0
			u["cls"] = _s()
			var pid := _s()
			var level := _u8()
			if pid != "":
				u["pid"] = pid
				u["level"] = level
			else:
				u.erase("pid")
				u.erase("level")
		if m & EXTRA:
			var on := _v()
			var task: String = TASKS[_u8()]
			var carry: String = CARRY[_u8()]
			var load := _u8()
			if on:
				u["on"] = on - 1
			else:
				u.erase("on")
			if task != "":
				u["task"] = task
			else:
				u.erase("task")
			if carry != "":
				u["carry"] = carry
				u["load"] = load
			else:
				u.erase("carry")
				u.erase("load")
			var tag := _v()
			if tag:
				tags[id] = tag
			else:
				tags.erase(id)
			var sat := _u8()
			if sat == 255:
				u.erase("sat")
			else:
				u["sat"] = sat
		units[id] = u
	for k in _v():
		var id := _v()
		units.erase(id)
		tags.erase(id)
	for k in _v():
		var id := _v()
		var team := _u8()
		var order := _s()
		var fa := _u8()
		var owner := _s()
		var s := {"id": id, "owner": owner, "team": team, "order": order}
		var meals := _u8()
		if meals != 255:
			s["meals"] = meals
		var cart_drop := _v()
		if cart_drop:
			s["cartDrop"] = cart_drop - 1
		if fa & 1:
			var fire := {"on": (fa & 2) != 0, "available": (fa & 4) != 0}
			var why: int = fa >> 3
			if why < REASONS.size() and REASONS[why] != "":
				fire["reason"] = REASONS[why]
			s["fireArrows"] = fire
		var skill := _s()
		if skill != "":
			var ready := _v()
			actives[id] = [skill, ready, _v()]
		else:
			actives.erase(id)
		squads[id] = s
	shots = shots.filter(func(x: Dictionary) -> bool: return x["t1"] >= t)
	for k in _v():
		var x0 := _u16() / quant
		var y0 := _u16() / quant
		var x1 := _u16() / quant
		var y1 := _u16() / quant
		var t0 := t - _v()
		var t1 := t0 + _u8()
		var z0 := _u8()
		var z1 := _u8()
		var kk := _u8()
		var by := _z()
		var s := {"x0": x0, "y0": y0, "x1": x1, "y1": y1, "t0": t0, "t1": t1, "z0": z0, "z1": z1, "by": by, "kind": MISSILES[kk & 3] if (kk & 3) < 3 else "arrow"}
		if kk & 4:
			s["fire"] = true
		if kk & 8:
			s["siege"] = _v()
		shots.append(s)
	for into in [buildings, sieges, souls]:
		var b := _bytes()
		if b.is_empty():
			continue
		var j: Dictionary = JSON.parse_string(b.get_string_from_utf8())
		for x in j["u"]:
			into[int(x["id"])] = x
		for id in j["r"]:
			into.erase(int(id))
	# W-67 guardians: the slow part keeps the position and hp it had (the binary rows below move them)
	var bb := _bytes()
	if not bb.is_empty():
		var j: Dictionary = JSON.parse_string(bb.get_string_from_utf8())
		for x in j["u"]:
			var was: Dictionary = bosses.get(x["id"], {})
			var b: Dictionary = x.duplicate()
			b["x"] = was.get("x", 0.0)
			b["y"] = was.get("y", 0.0)
			b["hp"] = was.get("hp", 0.0)
			bosses[x["id"]] = b
		for id in j["r"]:
			bosses.erase(id)
	for k in _v():
		var id := _s()
		var x := _u16() / quant
		var y := _u16() / quant
		var hp := _v()
		if bosses.has(id):
			var b: Dictionary = bosses[id]
			b["x"] = x
			b["y"] = y
			b["hp"] = hp
	var wd := _u8()
	if wd == 1:
		warden = null
	elif wd == 2:
		var wx := _u16()
		var wy := _u16()
		var ww := _u8()
		var wh := _u8()
		warden = {"x": wx, "y": wy, "w": ww, "h": wh, "in": _z()}
	return snapshot()


func snapshot() -> Dictionary:
	var ids := units.keys()
	ids.sort()
	var us := []
	var lists := {}
	for id in ids:
		var c: Dictionary = units[id].duplicate()
		var end: int = tags.get(id, -1)
		if end >= 0 and end > tick:
			c["tag"] = end - tick
		else:
			c.erase("tag")
		us.append(c)
		var sq: int = c["squad"]
		if not lists.has(sq):
			lists[sq] = []
		lists[sq].append(id)
	var sids := squads.keys()
	sids.sort()
	var qs := []
	for id in sids:
		var s: Dictionary = squads[id].duplicate()
		if actives.has(id):
			var a: Array = actives[id]
			s["active"] = {"skill": a[0], "ready": maxi(0, a[1] - tick), "on": maxi(0, a[2] - tick)}
		s["units"] = lists.get(id, [])
		qs.append(s)
	var out := {"tick": tick, "units": us, "squads": qs, "shots": shots.map(func(x: Dictionary) -> Dictionary: return x.duplicate()), "buildings": buildings.values()}
	if not sieges.is_empty():
		out["sieges"] = sieges.values()
	if not souls.is_empty():
		out["souls"] = souls.values().map(func(x: Dictionary) -> Dictionary:
			var c := x.duplicate()
			c["left"] = maxf(0, x["left"] - tick)
			return c)
	if not bosses.is_empty():
		out["bosses"] = bosses.values().map(_boss)
	if warden != null:
		var w: Dictionary = warden.duplicate()
		w["in"] = _rel_in(tick, warden["in"])
		out["warden"] = w
	return out


static func _rel_in(t: int, at: float) -> float:
	return 0.0 if at < 0 else maxf(0.0, at - t)


## A guardian as the sim shows it: its countdowns relative to this tick again.
func _boss(b: Dictionary) -> Dictionary:
	var c := b.duplicate()
	if b.has("respawnIn"):
		c["respawnIn"] = _rel_in(tick, b["respawnIn"])
	if b.has("fx"):
		var fx: Dictionary = b["fx"].duplicate()
		fx["t"] = tick - b["fx"]["t"]
		c["fx"] = fx
	if b.has("tele"):
		var te: Dictionary = b["tele"].duplicate()
		te["in"] = _rel_in(tick, b["tele"]["in"])
		c["tele"] = te
	return c
