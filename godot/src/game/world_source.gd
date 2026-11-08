## The one world the game plays for the whole session (docs/impl/godot-port.md P11, G-03, G-05): a C++ LocalWorld over
## the slice's rooms (every region with view data, today Elaia, plus its neighbours that load, headless), the player's
## start army seeded into its store and joined at home, and the world map's source on it, as src/war/world-view/source.ts
## NetSource builds its WorldView from the server:
##   view()            the world map message (LocalWorld.snapshot) plus his one group from the store's roster
##                     (fieldSquads, waitingHome), the season's scores and end, the quota, and liveTrade's convoys and
##                     boards
##   transfer(from,to) his whole group marches (LocalWorld.transfer): {ok: [TransitSnap]} or {error: text}
##   tick(dt)          the world on real time, HZ ticks a second (at most 3 a frame), as the region room ticks
##   link(region)      a WarClient transport (send, take, tick) to that region's room: the region screen talks to the
##                     world's room, so the world runs on under the map and men marched there show up in the region
## Other alliances in the neighbours are played by the alliance AI (alliance_ai.h). A season that ends rolls over (every
## room and the store anew, LocalWorld); his start army is seeded and joined at home again and `rolled` tells the game.
class_name WorldSource
extends RefCounted

signal rolled

## The player (one offline player; online pids come with G-04).
const PID := 1
const HZ := WarClient.HZ
const START := [["hoplite", 12], ["archer", 12]]

var world: LocalWorld
## His home region and alliance.
var home := ""
var alliance := 0
## The region the screen has open ("": the map); its messages to him wait in the inbox for the link's take().
var region := ""
var quota: Array = []
var _inbox := []
var _acc := 0.0
var _season := -1
var _army := 0


## The slice round `home_id`: its room (his home: dev helpers on), each neighbour with region data as a headless room
## with the other alliances' AIs. opts: seed (rooms seed+i), ms_per_tick, season (LocalWorld's opts.season), cap.
static func slice(home_id: String, alliance_: int, opts := {}) -> WorldSource:
	var ids := [home_id]
	for n in WorldGeo.region(home_id).get("adj", []):
		if FileAccess.file_exists(GameData.DIR.path_join("regions").path_join(String(n) + ".json")):
			ids.append(String(n))
	var seed := int(opts.get("seed", 7))
	var cap := int(opts.get("cap", 600))
	var foes := []
	for a in WorldGeo.alliances().size():
		if a != alliance_:
			foes.append(a)
	var rooms := []
	for i in ids.size():
		var r := Region.load_id(ids[i])
		var spec := {"id": ids[i], "seed": seed + i, "grid": r.grid(), "meta": r.meta, "cells": r.cells}
		if i == 0:
			spec["opts"] = {"cap": cap, "home": alliance_, "wild": true, "allowArmy": true, "allowDev": true}
		else:
			spec["opts"] = {"cap": cap, "wild": true}
			spec["ai"] = foes
		rooms.append(spec)
	var s := WorldSource.new()
	s.home = home_id
	s.alliance = alliance_
	s.world = LocalWorld.create(rooms, {"ms_per_tick": opts.get("ms_per_tick", 100), "season": opts.get("season", {})})
	var c: Dictionary = LocalRoom.constants()
	s.quota = split_quota(int(c["DEFAULT_CAP"]), WorldGeo.alliances().size())
	s.world.set_online(PID, true)
	s._start()
	return s


## src/war/net/protocol.ts splitQuota.
static func split_quota(cap: int, n: int) -> Array:
	var base := cap / n
	var extra := cap - base * n
	var q := []
	for i in n:
		q.append(base + (1 if i < extra else 0))
	return q


## His start army (fresh persons into the store) joined at home, then left holding there until a screen takes it.
func _start() -> void:
	_season = int(world.state()["season"]["id"])
	_army += 1
	var persons := []
	for g in START:
		for k in int(g[1]):
			persons.append(Roster.make_person("s%d-%s%d" % [_army, String(g[0]).left(1), k + 1], g[0], {"level": 1}))
	world.seed(PID, alliance, persons)
	world.send(home, PID, join_msg(home))
	world.room(home).close(PID)
	world.take()


## The join for `id`: his fit men standing there (at home also those off the field) by class; a group holding there is
## taken over. No squads: none of his men are there (the protocol has no watcher join; the map says so).
func join_msg(id: String) -> Dictionary:
	var by := {}
	for p in persons():
		if p["state"] == "active" and (p["region"] == id or (id == home and p["region"] == null)):
			if not by.has(p["cls"]):
				by[p["cls"]] = []
			by[p["cls"]].append(p["id"])
	var squads := []
	for cls in by:
		squads.append(by[cls])
	return {"t": "join", "v": int(LocalRoom.constants()["NET_VERSION"]), "region": id, "playerId": PID, "team": alliance, "squads": squads}


## His persons in the store, as the roster route lists them: {id, cls, state, region}.
func persons() -> Array:
	var out := []
	for r in world.store_dump()["persons"]:
		if int(r["pid"]) == PID:
			out.append({"id": r["id"], "cls": r["person"]["hero"].get("cls", "militia"), "state": r["state"], "region": r["region"]})
	return out


func view() -> Dictionary:
	var snap: Dictionary = world.snapshot(PID)
	snap.erase("t")
	var ps := persons()
	var score: Dictionary = snap["score"]
	var v := {"snap": snap, "squads": field_squads(ps, home), "waiting": waiting_home(ps, home), "scores": score["scores"], "endsAt": float(snap["at"]) + float(score["left"]), "quota": quota, "status": "offline"}
	v.merge(live_trade(snap))
	return v


func transfer(from: String, to: String) -> Dictionary:
	if not field_squads(persons(), home).any(func(s: Dictionary) -> bool: return s["region"] == from):
		return {"error": "no men of yours stand in %s" % WorldGeo.region_name(from)}
	var r: Dictionary = world.transfer(PID, {"from": from, "to": to})
	_drain()
	if r.get("t") == "transferred":
		return {"ok": [r["transit"]]}
	return {"error": String(r.get("detail", r.get("code", "refused")))}


func tick(dt: float) -> void:
	_acc += dt
	var n := 0
	while _acc >= 1.0 / HZ and n < 3:
		_acc -= 1.0 / HZ
		step()
		n += 1
	if _acc > 1.0 / HZ:
		_acc = 0.0


## One world tick; a season over rolls the world over, and his start army comes in again.
func step() -> void:
	world.step()
	_drain()
	if int(world.state()["season"]["id"]) != _season:
		_start()
		rolled.emit()


## The world's messages since the last look: his in the open region kept, the rest dropped (nobody listens).
func _drain() -> void:
	for m in world.take():
		if region != "" and m[0] == region and int(m[1]) == PID:
			_inbox.append([PID, m[2]])


## A WarClient transport to `id`'s room (it becomes the open region).
func link(id: String) -> Link:
	region = id
	_inbox.clear()
	var l := Link.new()
	l.src = self
	l.id = id
	return l


## The screen left `id`: his men there hold (the socket gone, W-07).
func unlink(id: String) -> void:
	var r := world.room(id)
	if r:
		r.close(PID)
	if region == id:
		region = ""
	_drain()
	_inbox.clear()


class Link:
	extends RefCounted
	var src: WorldSource
	var id := ""

	func send(m: Dictionary) -> void:
		src.world.send(id, WorldSource.PID, m)
		src._drain()

	func take() -> Array:
		src._drain()
		var out := src._inbox
		src._inbox = []
		return out

	func tick() -> void:
		src.step()


## src/war/world-view/source.ts fieldSquads: W-87 his one group where it stands (deployed persons not on the road);
## away with someone at home, the group is the other place; on the road, none.
static func field_squads(ps: Array, home_id: Variant = null) -> Array:
	var by := {}
	var order := []
	for p in ps:
		var at: Variant = p["region"]
		if at == null or String(at).begins_with(">") or WorldGeo.region(String(at)).is_empty() or p["state"] == "dead" or p["state"] == "captive":
			continue
		if not by.has(at):
			by[at] = {"region": at, "men": 0, "classes": {}, "ids": []}
			order.append(at)
		var s: Dictionary = by[at]
		s["men"] += 1
		s["ids"].append(p["id"])
		s["classes"][p["cls"]] = int(s["classes"].get(p["cls"], 0)) + 1
	var away := ps.any(func(p: Dictionary) -> bool: return p["region"] != null and String(p["region"]).begins_with(">"))
	if away:
		return []
	for at in order:
		if at != home_id:
			return [by[at]]
	if home_id != null and by.has(home_id):
		return [by[home_id]]
	return [by[order[0]]] if not order.is_empty() else []


## source.ts waitingHome: W-98 men waiting at home, off the field, while the group is elsewhere or on the road.
static func waiting_home(ps: Array, home_id: Variant) -> int:
	var g := field_squads(ps, home_id)
	if home_id == null or home_id == "" or (not g.is_empty() and g[0]["region"] == home_id):
		return 0
	return ps.filter(func(p: Dictionary) -> bool: return (p["region"] == home_id or (p["region"] == null and p["state"] == "active")) and p["state"] != "dead" and p["state"] != "captive").size()


## source.ts liveTrade: convoys with a cart or loads (men only are squads in transit), the boards as rows by good.
static func live_trade(snap: Dictionary) -> Dictionary:
	var convoys := []
	for c in snap.get("convoys", []):
		if c.get("cart") == null and int(c.get("loads", 0)) <= 0:
			continue
		var x := {"id": c["id"], "from": c["from"], "to": c["to"], "departAt": c["departAt"], "arriveAt": c["arriveAt"], "alliance": c["alliance"], "kind": c["cart"] if c.get("cart") != null else "porters", "loads": c["loads"], "cargo": _cargo_text(c.get("goods", {}), int(c.get("items", 0))), "seen": true}
		if x["cargo"] == null:
			x.erase("cargo")
		if c.get("mine", false):
			x["mine"] = true
		convoys.append(x)
	var boards := {}
	var bs: Dictionary = snap.get("boards", {})
	for town in bs:
		var b: Dictionary = bs[town]
		var rows := []
		for good in b["goods"]:
			var g: Dictionary = b["goods"][good]
			rows.append({"good": good, "ask": g["ask"], "bid": g["bid"], "depth": g["askDepth"] + g["bidDepth"]})
		rows.sort_custom(func(a: Dictionary, z: Dictionary) -> bool: return z["depth"] < a["depth"])
		boards[town] = {"at": b["at"], "rows": rows, "fills": b["fills"].size()}
	return {"convoys": convoys, "boards": boards}


## source.ts cargoText: the main goods by amount (at most 3), then the items; null when nothing.
static func _cargo_text(goods: Dictionary, items: int) -> Variant:
	var gs := []
	for g in goods:
		if goods[g] > 0:
			gs.append([g, goods[g]])
	gs.sort_custom(func(a: Array, b: Array) -> bool: return b[1] < a[1])
	var words := []
	for k in mini(3, gs.size()):
		words.append(gs[k][0])
	if items:
		words.append("%d item%s" % [items, "s" if items > 1 else ""])
	return ", ".join(words) if not words.is_empty() else null
