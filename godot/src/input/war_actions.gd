## The war's action map (src/war/input/actions.ts, the same table, ids, contexts and default keys) and key resolution
## (src/war/input/bindings.ts resolve): game code asks for the action of a key event and never reads a key itself.
## Keys are DOM `code` names (the place on the keyboard), matched against Godot's physical keycodes, so the same
## place works on every layout; `mod` is Ctrl or Cmd. tests/input/test_war_actions.gd checks this against the TS.
class_name WarActions
extends RefCounted

## [id, context, kind, label, [[code, flags], ...]]; flags: "m" mod, "a" alt, "s" shift.
const DEFS := [
	["cam.up", "camera", "hold", "Pan up", [["KeyW", ""], ["ArrowUp", ""]]],
	["cam.down", "camera", "hold", "Pan down", [["KeyS", ""], ["ArrowDown", ""]]],
	["cam.left", "camera", "hold", "Pan left", [["KeyA", ""], ["ArrowLeft", ""]]],
	["cam.right", "camera", "hold", "Pan right", [["KeyD", ""], ["ArrowRight", ""]]],
	["cam.grab", "camera", "hold", "Hold to drag the map", [["Space", ""]]],
	["sel.all", "region", "press", "Select all your men", [["KeyA", "m"]]],
	["group.1", "region", "press", "Select group 1 (twice: go there)", [["Digit1", ""], ["Numpad1", ""]]],
	["group.2", "region", "press", "Select group 2 (twice: go there)", [["Digit2", ""], ["Numpad2", ""]]],
	["group.3", "region", "press", "Select group 3 (twice: go there)", [["Digit3", ""], ["Numpad3", ""]]],
	["group.4", "region", "press", "Select group 4 (twice: go there)", [["Digit4", ""], ["Numpad4", ""]]],
	["group.5", "region", "press", "Select group 5 (twice: go there)", [["Digit5", ""], ["Numpad5", ""]]],
	["group.6", "region", "press", "Select group 6 (twice: go there)", [["Digit6", ""], ["Numpad6", ""]]],
	["group.7", "region", "press", "Select group 7 (twice: go there)", [["Digit7", ""], ["Numpad7", ""]]],
	["group.8", "region", "press", "Select group 8 (twice: go there)", [["Digit8", ""], ["Numpad8", ""]]],
	["group.9", "region", "press", "Select group 9 (twice: go there)", [["Digit9", ""], ["Numpad9", ""]]],
	["group.set.1", "region", "press", "Store selection as group 1", [["Digit1", "m"]]],
	["group.set.2", "region", "press", "Store selection as group 2", [["Digit2", "m"]]],
	["group.set.3", "region", "press", "Store selection as group 3", [["Digit3", "m"]]],
	["group.set.4", "region", "press", "Store selection as group 4", [["Digit4", "m"]]],
	["group.set.5", "region", "press", "Store selection as group 5", [["Digit5", "m"]]],
	["group.set.6", "region", "press", "Store selection as group 6", [["Digit6", "m"]]],
	["group.set.7", "region", "press", "Store selection as group 7", [["Digit7", "m"]]],
	["group.set.8", "region", "press", "Store selection as group 8", [["Digit8", "m"]]],
	["group.set.9", "region", "press", "Store selection as group 9", [["Digit9", "m"]]],
	["order.act", "region", "press", "Context action (hold: all actions)", [["KeyE", ""]]],
	["order.hold", "region", "press", "Hold position", [["KeyH", ""]]],
	["order.stop", "region", "press", "Stop work", [["KeyX", ""]]],
	["order.active", "region", "press", "Squad active skill", [["KeyF", ""]]],
	["order.fireArrows", "region", "press", "Fire arrows on or off", [["KeyQ", ""]]],
	["order.deploy", "region", "press", "Deploy or pack an engine", [["KeyY", ""]]],
	["order.fallBack", "region", "press", "Picked man: fall back out of the fight", [["KeyZ", ""]]],
	["order.rear", "region", "press", "Picked man: to the rear rank", [["KeyZ", "m"]]],
	["order.rejoin", "region", "press", "Picked man: rejoin his slot", [["KeyZ", "s"]]],
	["form.line", "region", "press", "Line", [["Digit1", "a"]]],
	["form.column", "region", "press", "Column", [["Digit2", "a"]]],
	["form.wedge", "region", "press", "Wedge", [["Digit3", "a"]]],
	["form.loose", "region", "press", "Loose", [["Digit4", "a"]]],
	["build.mode", "region", "press", "Build mode on or off", [["KeyB", ""]]],
	["build.rotate", "build", "press", "Rotate", [["KeyR", ""]]],
	["build.confirm", "build", "press", "Lay out the wall", [["Enter", ""]]],
	["build.undo", "build", "press", "Remove the last wall line", [["Backspace", ""]]],
	["build.flip", "build", "press", "Flip the wall's inside", [["KeyF", ""]]],
	["build.narrower", "build", "press", "Bridge narrower", [["BracketLeft", ""]]],
	["build.wider", "build", "press", "Bridge wider", [["BracketRight", ""]]],
	["build.gate", "build", "press", "Put a gate in the wall", [["KeyG", ""]]],
	["build.tower", "build", "press", "Put a tower in the wall", [["KeyT", ""]]],
	["bld.upgrade", "building", "press", "Upgrade the selected building", [["KeyU", ""]]],
	["bld.repair", "building", "press", "Repair the selected building", [["KeyR", ""]]],
	["bld.demolish", "building", "press", "Demolish the selected building (again: confirm)", [["Delete", ""]]],
	["view.cutaway", "region", "press", "Cut walls and peaks down", [["KeyV", ""]]],
	["view.map", "region", "press", "Full map", [["KeyM", ""]]],
	["view.normal", "region", "press", "Map mode: normal", [["F2", ""]]],
	["view.altitude", "region", "press", "Map mode: altitude", [["F3", ""]]],
	["view.movement", "region", "press", "Map mode: movement", [["F4", ""]]],
	["view.ownership", "region", "press", "Map mode: ownership", [["F5", ""]]],
	["view.biomes", "region", "press", "Map mode: biomes", [["F6", ""]]],
	["view.resources", "region", "press", "Map mode: resources", [["F7", ""]]],
	["view.bossCam", "region", "press", "Boss camera on or off", [["KeyG", ""]]],
	["panel.roster", "region", "press", "Roster", [["KeyR", ""]]],
	["panel.chest", "region", "press", "Squad chest: what your men carry, the town store", [["KeyI", ""]]],
	["panel.market", "region", "press", "Market", [["KeyK", ""]]],
	["panel.guardian", "region", "press", "Landmark panel", [["KeyL", ""]]],
	["panel.sound", "global", "press", "Sound settings", [["KeyN", ""]]],
	["panel.tasks", "region", "press", "Daily and weekly tasks", [["KeyT", ""]]],
	["panel.crown", "region", "press", "The crown and council", [["KeyC", ""]]],
	["panel.holdings", "region", "press", "Holdings: your settlements", [["KeyO", ""]]],
	["panel.works", "region", "press", "Alliance works and titles", [["KeyU", ""]]],
	["panel.favour", "region", "press", "Your perks", [["KeyF", "s"]]],
	["replay.open", "region", "press", "Replay the last 3 minutes", [["KeyR", "s"]]],
	["go.world", "region", "press", "Back to the world map", [["KeyW", "s"]]],
	["world.enter", "world", "press", "Enter the region (or send the squad)", [["Enter", ""]]],
	["world.routes", "world", "press", "Trade routes", [["KeyT", ""]]],
	["world.haul", "world", "press", "Haul planner", [["KeyH", ""]]],
	["world.fit", "world", "press", "Fit the map", [["KeyF", ""]]],
	["world.zoomIn", "world", "press", "Zoom in", [["Equal", ""], ["NumpadAdd", ""]]],
	["world.zoomOut", "world", "press", "Zoom out", [["Minus", ""], ["NumpadSubtract", ""]]],
	["chat.open", "region", "press", "Open the alliance chat", [["Enter", ""]]],
	["chat.mark", "global", "press", "Place a map mark (again: the next kind; then click)", [["KeyP", ""]]],
	["map.pin", "global", "press", "Your own marker, seen by you only (on one: remove it; Shift: clear all)", [["MouseMiddle", ""]]],
	["back", "global", "press", "Back, close, cancel; the menu", [["Escape", ""]]],
	["menu.settings", "global", "press", "Settings", [["F10", ""]]],
	["help.keys", "global", "press", "Controls", [["Slash", "s"], ["Slash", ""]]],
	["dev.panel", "global", "press", "Dev panel", [["F1", ""]]],
]

## Contexts live in a region, most specific first: build mode or a selected building shadow the region's keys.
const REGION := ["region", "camera", "global"]
const BUILD := ["build", "camera", "global"]
const BUILDING := ["building", "camera", "global"]

const _NAMED := {
	"Space": KEY_SPACE, "Escape": KEY_ESCAPE, "Enter": KEY_ENTER, "Backspace": KEY_BACKSPACE, "Delete": KEY_DELETE, "Tab": KEY_TAB,
	"ArrowUp": KEY_UP, "ArrowDown": KEY_DOWN, "ArrowLeft": KEY_LEFT, "ArrowRight": KEY_RIGHT, "Slash": KEY_SLASH, "Equal": KEY_EQUAL,
	"Minus": KEY_MINUS, "BracketLeft": KEY_BRACKETLEFT, "BracketRight": KEY_BRACKETRIGHT, "NumpadAdd": KEY_KP_ADD,
	"NumpadSubtract": KEY_KP_SUBTRACT,
}

static var _by_id := {}


## The Godot key of a DOM `code` (KEY_NONE for a mouse button or an unknown code).
static func key_of(code: String) -> Key:
	if _NAMED.has(code):
		return _NAMED[code]
	if code.begins_with("Key") and code.length() == 4:
		return OS.find_keycode_from_string(code.substr(3))
	if code.begins_with("Digit"):
		return KEY_0 + int(code.substr(5)) as Key
	if code.begins_with("Numpad") and code.length() == 7:
		return KEY_KP_0 + int(code.substr(6)) as Key
	if code.begins_with("F") and code.substr(1).is_valid_int():
		return KEY_F1 + int(code.substr(1)) - 1 as Key
	return KEY_NONE


static func def(id: String) -> Array:
	if _by_id.is_empty():
		for d in DEFS:
			_by_id[d[0]] = d
	return _by_id.get(id, [])


## The action key event `e` triggers in the active contexts (most specific first), or "" (bindings.ts resolve: the
## first context with a match wins; an exact Shift match wins over one that ignores Shift).
static func resolve(e: InputEventKey, contexts: Array) -> String:
	var key: Key = e.physical_keycode if e.physical_keycode != KEY_NONE else e.keycode
	var mod := e.ctrl_pressed or e.meta_pressed
	for exact in [true, false]:
		for c in contexts:
			for d in DEFS:
				if d[1] != c:
					continue
				for b in d[4]:
					var fl: String = b[1]
					if key_of(b[0]) != key or ("m" in fl) != mod or ("a" in fl) != e.alt_pressed:
						continue
					if (("s" in fl) == e.shift_pressed) if exact else (not ("s" in fl) and e.shift_pressed):
						return d[0]
	return ""


## Is a hold action down now (its keys, any of them, with no modifier rule: a level read each frame).
static func held(id: String) -> bool:
	for b in def(id)[4]:
		var k := key_of(b[0])
		if k != KEY_NONE and Input.is_physical_key_pressed(k):
			return true
	return false


## The first key of an action as a short label for a corner badge ("H", "⌥1").
static func badge(id: String) -> String:
	var d := def(id)
	if d.is_empty() or d[4].is_empty():
		return ""
	var b: Array = d[4][0]
	var code: String = b[0]
	var name := code.substr(3) if code.begins_with("Key") else code.substr(5) if code.begins_with("Digit") else code
	var mac := OS.get_name() == "macOS"
	var pre := ""
	if "m" in b[1]:
		pre += "⌘" if mac else "Ctrl+"
	if "a" in b[1]:
		pre += "⌥" if mac else "Alt+"
	if "s" in b[1]:
		pre += "⇧"
	return pre + name
