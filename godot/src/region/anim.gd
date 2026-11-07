## Which clip a soldier plays and which frame of it, from the 10 Hz snapshots (src/war/view/anim.ts Animator, the parts
## the digest carries: no swing timing, loads or work clips yet):
##   dead       fallBack / fallFwd once, held on the last frame
##   attacking  the class's blow (shoot / sling / throw for the missile classes, else attack) looping
##   hit        stagger once (hp dropped), unless a blow is under way
##   moving     walk, run above RUN_UP tiles/s (back under RUN_DOWN), stride-synced: the phase moves by the tiles covered
##   standing   ready with foes near, else idle with now and then an idle variant per unit
class_name Anim
extends RefCounted

const RANGED := {"archer": "shoot", "slinger": "sling", "javelineer": "throw"}
const IDLE_VARIANTS := ["look", "adjust", "breathe", "shift"]
const RUN_UP := 2.05
const RUN_DOWN := 1.7
const STILL := 0.12
const GO := 0.25
const STOP_MS := 150.0
const PACE := {"walk": 1.5, "carry": 1.5, "run": 2.4, "charge": 2.4}
const MAX_STEP := 0.5
const SLOT_MS := 4000
const IDLE_ODDS := 3

## ANIM_FALLBACK (src/art/sheetManifest.ts), from res://view/anims.json.
static var fallback := {}

var _mem := {}


## anim.ts hash.
static func ihash(a: int, b: int = 0) -> int:
	var h := (a * 374761393 + b * 668265263) & 0xFFFFFFFF
	h = _imul(h ^ (h >> 13), 1274126177)
	return (h ^ (h >> 16)) & 0xFFFFFFFF


static func _imul(a: int, b: int) -> int:
	return (a * b) & 0xFFFFFFFF


## The first of `names` the sheet has, else the first one's fallbacks, else idle.
static func pick_clip(clips: Dictionary, names: Array) -> String:
	for n in names:
		if clips.has(n):
			return n
	var r := _search(names[0], clips, {})
	return r if r != "" else "idle"


static func _search(a: String, clips: Dictionary, seen: Dictionary) -> String:
	if seen.has(a):
		return ""
	seen[a] = true
	if clips.has(a):
		return a
	if fallback.is_empty() and FileAccess.file_exists(ViewData.DIR.path_join("anims.json")):
		fallback = JSON.parse_string(FileAccess.get_file_as_string(ViewData.DIR.path_join("anims.json")))
	for b in fallback.get(a, []):
		var r := _search(b, clips, seen)
		if r != "":
			return r
	return ""


## Frame t ms into a clip [n, fps, hold]: once through, then looping from hold.
static func frame_at(c: Array, t: float, offset := 0) -> int:
	var f := maxi(0, floori(t * c[1] / 1000.0)) + offset
	return f if f < c[0] else c[2] + (f - c[2]) % (c[0] - c[2])


func forget(alive: Dictionary) -> void:
	for id in _mem.keys():
		if not alive.has(id):
			_mem.erase(id)


## [clip, frame] for unit id of class cls at tile point (x, y), its state and hp, `foe_near` its squad's stance.
func pick(id: int, cls: String, x: float, y: float, state: String, hp: float, foe_near: bool, clips: Dictionary, now: float) -> Array:
	var m: Dictionary = _mem.get(id, {})
	if m.is_empty():
		m = {"hp": hp, "one": [], "loop": "", "loop_at": now, "fall": [], "px": x, "py": y, "t": now, "v": 0.0, "phase": float(ihash(id, 3) % 1000) / 1000.0, "loco": "", "run": false, "still": -1.0}
		_mem[id] = m
	if state == "dead":
		if m["fall"].is_empty():
			m["fall"] = [pick_clip(clips, ["fallFwd" if ihash(id, 9) & 1 else "fallBack", "fallFwd"]), now]
		var c: Array = clips[m["fall"][0]]
		return [m["fall"][0], mini(c[0] - 1, floori((now - m["fall"][1]) * c[1] / 1000.0))]
	var dt: float = now - m["t"]
	var step := 0.0
	if dt > 0.0:
		step = Vector2(x - m["px"], y - m["py"]).length()
		m["v"] += (step * 1000.0 / dt - m["v"]) * minf(1.0, dt / 250.0)
		m["px"] = x
		m["py"] = y
		m["t"] = now
		var raw := step * 1000.0 / dt
		if raw > GO:
			m["still"] = -1.0
		elif raw < STILL and m["still"] < 0.0:
			m["still"] = now
	m["run"] = m["v"] > RUN_DOWN if m["run"] else m["v"] > RUN_UP
	var one: Array = m["one"]
	if not one.is_empty() and now >= one[2]:
		one = []
		m["one"] = one
	if hp < m["hp"] and (one.is_empty() or one[0] == "stagger"):
		var name := pick_clip(clips, ["stagger"])
		var c: Array = clips[name]
		m["one"] = [name, now, now + c[0] * 1000.0 / c[1]]
	m["hp"] = hp
	one = m["one"]
	if not one.is_empty() and now >= one[1]:
		return [one[0], frame_at(clips[one[0]], now - one[1])]
	var stopped: bool = m["still"] >= 0.0 and now - m["still"] > STOP_MS
	if (state == "move" or (state == "idle" and m["loco"] != "")) and not stopped:
		return _stride(m, clips, pick_clip(clips, ["run"]) if m["run"] else pick_clip(clips, ["walk"]), step)
	m["loco"] = ""
	if state == "attack":
		var blow: String = pick_clip(clips, [RANGED[cls]]) if RANGED.has(cls) else pick_clip(clips, ["attack"])
		return _loop(m, clips, blow, now, id)
	if foe_near:
		return _loop(m, clips, pick_clip(clips, ["ready"]), now, id)
	return _idle(m, clips, now, id)


func _idle(m: Dictionary, clips: Dictionary, now: float, id: int) -> Array:
	var idles := []
	for k in clips:
		if IDLE_VARIANTS.has(k) or (k.begins_with("idle") and k != "idle"):
			idles.append(k)
	var off := ihash(id, 1) % SLOT_MS
	var k := floori((now + off) / SLOT_MS)
	var h := ihash(id, k)
	if not idles.is_empty() and h % IDLE_ODDS == 0:
		var name: String = idles[(h >> 4) % idles.size()]
		var c: Array = clips[name]
		var t: float = now + off - k * SLOT_MS - ((h >> 12) % 1000)
		if t >= 0.0 and t < c[0] * 1000.0 / c[1]:
			return [name, frame_at(c, t)]
	return _loop(m, clips, "idle", now, id)


func _stride(m: Dictionary, clips: Dictionary, name: String, step: float) -> Array:
	var cur: String = m["loco"] if m["loco"] != "" and clips.has(m["loco"]) else name
	var before: float = m["phase"]
	var c: Array = clips[cur]
	var stride: float = PACE.get(cur, PACE["walk"]) * c[0] / c[1]
	m["phase"] = fmod(m["phase"] + minf(step, MAX_STEP) / stride, 1.0) if stride > 0.0 else m["phase"]
	if cur != name and floori(m["phase"] * 2.0) == floori(before * 2.0):
		name = cur
	m["loco"] = name
	m["loop"] = name
	var cn: Array = clips[name]
	return [name, mini(cn[0] - 1, floori(m["phase"] * cn[0]))]


func _loop(m: Dictionary, clips: Dictionary, name: String, now: float, id: int) -> Array:
	if m["loop"] != name:
		m["loop"] = name
		m["loop_at"] = now
	var c: Array = clips[name]
	return [name, frame_at(c, now - m["loop_at"], 0 if c[2] else ihash(id, 3) % c[0])]
