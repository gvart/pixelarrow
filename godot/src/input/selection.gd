## W-53 unit control (src/war/view/select.ts): the player's selection is a set of his men, not of squads.
##
##   click a man           his whole squad (shift: add or drop that squad); a click on open ground clears
##   double-click a man    that one man alone (shift: him added to what was selected before the first click)
##   box                   every man of his inside (shift adds)
##   Ctrl+A                all his men; Esc clears
##   Ctrl+1-9              the selection becomes control group n; 1-9 selects it again, a second tap centres on it
##
## Orders go to the lead squad (that of the first man picked); `address` names the selected men on the order unless
## they are exactly that squad, so the sim gathers them into one squad first.
class_name Selection
extends RefCounted

const DOUBLE_MS := 350.0

## Selected own men, in the order picked.
var units: Array[int] = []
## Control groups 1-9: their men as last stored.
var groups := {}
## His living men now: id -> unit dictionary (snapshot).
var live := {}
var _last := {"id": -1, "t": 0.0, "before": []}
var _tap := {"n": 0, "t": 0.0}


## The men a click on own man `man` selects (select.ts clickPick).
static func click_pick(sel: Array, before: Array, squad: Array, man: int, shift: bool, twice: bool) -> Array:
	if twice:
		if shift:
			var out := before.filter(func(id: int) -> bool: return id != man)
			out.append(man)
			return out
		return [man]
	if not shift:
		return squad.duplicate()
	if squad.all(func(id: int) -> bool: return sel.has(id)):
		return sel.filter(func(id: int) -> bool: return not squad.has(id))
	var out := sel.duplicate()
	for id in squad:
		if not sel.has(id):
			out.append(id)
	return out


## After each frame: his living men; the fallen and the lost leave the selection and the groups.
func sync(snap: Dictionary, owner: String) -> void:
	var mine := {}
	for q in snap.get("squads", []):
		if q["owner"] == owner:
			mine[int(q["id"])] = true
	live.clear()
	for u in snap.get("units", []):
		if mine.has(int(u["squad"])) and u["state"] != "dead":
			live[int(u["id"])] = u
	units.assign(units.filter(func(id: int) -> bool: return live.has(id)))
	for n in groups.keys():
		var left: Array = groups[n].filter(func(id: int) -> bool: return live.has(id))
		if left.is_empty():
			groups.erase(n)
		else:
			groups[n] = left


## The squad an order to the selection goes to (-1: nobody selected).
func lead() -> int:
	for id in units:
		if live.has(id):
			return int(live[id]["squad"])
	return -1


## The squads with a selected man, lead first.
func squads() -> Array:
	var out := []
	for id in units:
		var q := int(live[id]["squad"])
		if not out.has(q):
			out.append(q)
	return out


func men() -> Array:
	return units.map(func(id: int) -> Dictionary: return live[id])


func set_ids(ids: Array, add := false) -> void:
	if not add:
		units.clear()
	for id in ids:
		if live.has(int(id)) and not units.has(int(id)):
			units.append(int(id))


func clear() -> void:
	units.clear()


func is_empty() -> bool:
	return units.is_empty()


## A left click on own man `id` (-1: on nothing of his) at `now` ms.
func click(id: int, shift: bool, now: float) -> void:
	if id < 0 or not live.has(id):
		if not shift:
			clear()
		return
	var twice: bool = _last["id"] == id and now - _last["t"] < DOUBLE_MS
	var sel: Array = units.duplicate()
	var sq := int(live[id]["squad"])
	var squad := []
	for k in live:
		if int(live[k]["squad"]) == sq:
			squad.append(k)
	var pick := click_pick(sel, _last["before"], squad, id, shift, twice)
	_last = {"id": -1, "t": 0.0, "before": []} if twice else {"id": id, "t": now, "before": sel}
	set_ids(pick)


## Every man of his whose point is inside `r` (tile or screen space: `at` maps a unit to that space).
func box(r: Rect2, at: Callable, add: bool) -> void:
	var ids := []
	for id in live:
		if r.has_point(at.call(live[id])):
			ids.append(id)
	set_ids(ids, add)


func store(n: int) -> void:
	if units.is_empty():
		groups.erase(n)
	else:
		groups[n] = units.duplicate()


## Group n selected; true when this was a second tap soon after (the camera goes there).
func recall(n: int, now: float) -> bool:
	if not groups.has(n):
		return false
	set_ids(groups[n])
	var again: bool = _tap["n"] == n and now - _tap["t"] < DOUBLE_MS * 1.3
	_tap = {"n": n, "t": now}
	return again


## The centre of the selected men (tiles).
func centre() -> Vector2:
	var c := Vector2.ZERO
	for u in men():
		c += Vector2(u["x"], u["y"])
	return c / maxf(1, units.size())


## The order with the selected men named on it, when it goes to the lead squad and they are not exactly that squad.
func address(o: Dictionary) -> Dictionary:
	var ld := lead()
	if o.has("units") or o.get("kind") == "man" or not o.has("squad") or int(o["squad"]) != ld:
		return o
	var in_lead := 0
	for k in live:
		if int(live[k]["squad"]) == ld:
			in_lead += 1
	var all_lead := units.all(func(id: int) -> bool: return int(live[id]["squad"]) == ld)
	if units.size() == in_lead and all_lead:
		return o
	var c := o.duplicate()
	c["units"] = units.duplicate()
	return c
