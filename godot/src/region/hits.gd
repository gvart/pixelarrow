## Ordinary blows felt (src/war/view/feel/hits.ts HitWatch, the parts the digest carries): each snapshot's hp drops
## against the last one's. Per hit the struck man is drawn white for FLASH ms (at most one flash per FLASH_GAP), and,
## when a foe in the attack state stands within reach (the digest has no swing timing: the nearest attacking foe), he is
## pushed NUDGE px away from him and eased back (at most one push per PUFF_GAP, MAX_PUFFS new ones a snapshot).
## No puffs, heavy blows, holds or shake yet.
class_name HitWatch
extends RefCounted

const FLASH := 70.0
const FLASH_ALPHA := 0.75
const BIG_FLASH_ALPHA := 0.45
const FLASH_GAP := 220.0
const PUFF_GAP := 380.0
const NUDGE := 3.0
const NUDGE_MS := 190.0
const MAX_PUFFS := 8
const REACH2 := 4.5 * 4.5

var _tick := -1
var _hp := {}
## id -> [flash_at, nudge_at, sx, sy]
var _marks := {}
## Hits seen.
var hits := 0


## hits.ts flashAlpha: full on a man, softer on a big sprite.
static func flash_alpha(scale: float) -> float:
	return BIG_FLASH_ALPHA if scale >= 1.8 else FLASH_ALPHA


## A snapshot at `tick`: units by id ([id, squad, x, y, hp, state, facing]), squad -> team, at view time `now` ms.
func diff(units: Dictionary, teams: Dictionary, tick: int, now: float) -> void:
	if tick == _tick:
		return
	var first := _tick < 0
	_tick = tick
	var strikers := []
	for id in units:
		if units[id][5] == "attack":
			strikers.append(units[id])
	var puffs := 0
	for id in units:
		var u: Array = units[id]
		var was = _hp.get(id)
		_hp[id] = u[4]
		if first or was == null or not (u[4] < was - 1e-6):
			continue
		var team = teams.get(u[1], -1)
		var by: Array = []
		var bd := INF
		for s in strikers:
			if s[0] == u[0] or teams.get(s[1], -2) == team:
				continue
			var dd: float = (s[2] - u[2]) ** 2 + (s[3] - u[3]) ** 2
			if dd < bd and dd < REACH2:
				bd = dd
				by = s
		var m: Array = _marks.get(id, [-INF, -INF, 0.0, 0.0])
		_marks[id] = m
		var hit := false
		if now - m[0] >= FLASH_GAP:
			m[0] = now
			hit = true
		if not by.is_empty() and now - m[1] >= PUFF_GAP and puffs < MAX_PUFFS:
			# tile direction (dx, dy) on screen: (dx - dy, (dx + dy) / 2)
			var dx: float = u[2] - by[2]
			var dy: float = u[3] - by[3]
			var e := Vector2(dx - dy, (dx + dy) / 2.0)
			if e.length() > 1e-6:
				e = e.normalized()
				puffs += 1
				m[1] = now
				m[2] = e.x
				m[3] = e.y
				hit = true
		if hit:
			hits += 1
	if tick % 20 == 0:
		for id in _hp.keys():
			if not units.has(id):
				_hp.erase(id)
		for id in _marks.keys():
			if now - maxf(_marks[id][0], _marks[id][1]) > 2000.0:
				_marks.erase(id)


## How unit `id` is drawn at `now` for its last hit: [flash, nudge x, nudge y] (world px), or [] as ever.
func pose(id: int, now: float) -> Array:
	var m: Array = _marks.get(id, [])
	if m.is_empty():
		return []
	var flash: bool = now - m[0] < FLASH
	var t: float = now - m[1]
	var k := 0.0
	if t >= 0.0 and t < NUDGE_MS:
		k = t / 50.0 if t < 50.0 else (1.0 - (t - 50.0) / (NUDGE_MS - 50.0)) ** 2
	if not flash and k == 0.0:
		return []
	return [flash, m[2] * NUDGE * k, m[3] * NUDGE * k]
