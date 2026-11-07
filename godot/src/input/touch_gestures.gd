## Touch gestures on the map, as intents the region input acts on (pure: tests/input/test_touch_gestures.gd):
##
##   tap                 one finger down and up without moving: select (on his man) or the context order (else)
##   drag                one finger moving: pan the camera
##   hold, then drag     one finger still for HOLD_MS, then moving: a selection box from where it went down
##   two fingers         pinch: zoom round their middle; moving together: pan
##
## feed(event, now_ms) returns the intents of that event; tick(now_ms) those of time passing (the hold).
class_name TouchGestures
extends RefCounted

## Screen px a finger may wander and still tap; ms still before a drag draws a box.
const SLOP := 12.0
const HOLD_MS := 350.0

var _down := {}
var _mode := ""
var _start := Vector2.ZERO
var _t0 := 0.0
var _pinch_d := 0.0
var _pinch_mid := Vector2.ZERO


func feed(e: InputEvent, now: float) -> Array:
	var out := []
	if e is InputEventScreenTouch:
		if e.pressed:
			_down[e.index] = e.position
			if _down.size() == 1:
				_mode = "maybe"
				_start = e.position
				_t0 = now
			elif _down.size() == 2:
				if _mode == "box":
					out.append({"kind": "box_cancel"})
				_mode = "pinch"
				_pinch()
		else:
			_down.erase(e.index)
			if _down.is_empty():
				if _mode == "maybe":
					out.append({"kind": "tap", "at": e.position})
				elif _mode == "box":
					out.append({"kind": "box_end", "rect": Rect2(_start, Vector2.ZERO).expand(e.position).abs()})
				_mode = ""
			elif _mode == "pinch":
				_pinch()
	elif e is InputEventScreenDrag:
		if not _down.has(e.index):
			return out
		_down[e.index] = e.position
		match _mode:
			"maybe":
				if e.position.distance_to(_start) > SLOP:
					_mode = "pan"
					out.append({"kind": "pan", "by": e.position - _start})
			"pan":
				out.append({"kind": "pan", "by": e.relative})
			"box":
				out.append({"kind": "box_move", "rect": Rect2(_start, Vector2.ZERO).expand(e.position).abs()})
			"pinch":
				var was_d := _pinch_d
				var was_mid := _pinch_mid
				_pinch()
				if was_d > 0.0 and _pinch_d > 0.0:
					out.append({"kind": "zoom", "by": _pinch_d / was_d, "at": _pinch_mid})
				out.append({"kind": "pan", "by": _pinch_mid - was_mid})
	return out


## A finger held still long enough starts a box.
func tick(now: float) -> Array:
	if _mode == "maybe" and _down.size() == 1 and now - _t0 >= HOLD_MS:
		_mode = "box"
		return [{"kind": "box_start", "at": _start}]
	return []


func busy() -> bool:
	return _mode != ""


func _pinch() -> void:
	var ps: Array = _down.values()
	if ps.size() < 2:
		_pinch_d = 0.0
		return
	_pinch_d = (ps[0] as Vector2).distance_to(ps[1])
	_pinch_mid = ((ps[0] as Vector2) + (ps[1] as Vector2)) / 2.0
