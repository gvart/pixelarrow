## The dock, bottom right (src/war/view/hud: the I / R / B dock): build mode (B) and all his men (Ctrl+A). The squad
## chest (I) and the roster (R) join it with their windows (P10 follow-up: they need the room's persons wave).
class_name Dock
extends PanelContainer

var input: RegionInput
var _build: Button


func build(input_: RegionInput, px: float, vertical := false, keys := true) -> void:
	input = input_
	mouse_filter = Control.MOUSE_FILTER_STOP
	var box := HudTheme.panel_box()
	box.set_content_margin_all(4)
	add_theme_stylebox_override("panel", box)
	var row: BoxContainer = VBoxContainer.new() if vertical else HBoxContainer.new()
	row.add_theme_constant_override("separation", 3)
	row.add_child(HudTheme.slot("unit-militia", "All your men", "Select every man you have here", WarActions.badge("sel.all") if keys else "", px, func() -> void: input.select_all()))
	_build = HudTheme.slot("act-build", "Build", "Lay out camps, stores and farms on your ground", WarActions.badge("build.mode") if keys else "", px, func() -> void: input.set_build_mode(not input.build_mode))
	row.add_child(_build)
	add_child(row)


func want() -> Vector2:
	return get_combined_minimum_size()


func refresh() -> void:
	HudTheme.slot_on(_build, input.build_mode)
