## The notices, top centre under the plaque (the DOM HUD's toasts, W-70 compact): an icon, a short line, at most
## one call to action ("Go": the camera to where it happened). Three at most; each fades after its time.
## What raises them (Hud): his men struck (harmWatch.ts: once per fight, HARM_QUIET ticks of calm between), an order
## or a join refused, his army in, a soul claimed or refused, goods dropped where a man fell.
class_name Notices
extends VBoxContainer

const MAX := 3
const LIFE := 6.0

var width := 360.0
var input: RegionInput
var _items := []


func build(input_: RegionInput, width_: float) -> void:
	input = input_
	width = width_
	add_theme_constant_override("separation", 4)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


## A notice: icon (kit id), text (one short line), tone ("", "bad", "good"), where (tile point; INF: none), seconds.
func say(icon_id: String, text: String, tone := "", at := Vector2.INF, life := LIFE) -> void:
	for it in _items:
		if it["text"] == text:
			it["left"] = life
			return
	var p := PanelContainer.new()
	var box := HudTheme.panel_box(0.95)
	box.set_content_margin_all(6)
	if tone == "bad":
		box.border_color = Color(HudTheme.BAD, 0.8)
	elif tone == "good":
		box.border_color = Color(HudTheme.GOOD, 0.7)
	p.add_theme_stylebox_override("panel", box)
	p.mouse_filter = Control.MOUSE_FILTER_STOP
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 8)
	h.add_child(HudTheme.icon_rect(icon_id, 24))
	var l := HudTheme.label(text, HudTheme.BODY, HudTheme.INK)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.max_lines_visible = 2
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(l)
	if at != Vector2.INF:
		var go := Button.new()
		go.text = "Go"
		go.focus_mode = Control.FOCUS_NONE
		go.custom_minimum_size = Vector2(44, 30)
		go.add_theme_font_override("font", HudTheme.bold_font())
		go.tooltip_text = "Look there"
		go.pressed.connect(func() -> void: input.focus(at))
		h.add_child(go)
	p.add_child(h)
	p.custom_minimum_size = Vector2(width, 0)
	add_child(p)
	move_child(p, 0)
	_items.push_front({"node": p, "text": text, "left": life})
	while _items.size() > MAX:
		_items.pop_back()["node"].queue_free()


func want() -> Vector2:
	return Vector2(width, get_combined_minimum_size().y) if not _items.is_empty() else Vector2.ZERO


func count() -> int:
	return _items.size()


func _process(dt: float) -> void:
	for it in _items.duplicate():
		it["left"] -= dt
		var n: Control = it["node"]
		n.modulate.a = clampf(it["left"] / 0.6, 0.0, 1.0)
		if it["left"] <= 0.0:
			n.queue_free()
			_items.erase(it)
