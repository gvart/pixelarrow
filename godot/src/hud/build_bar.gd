## The build bar (B; src/war/view/build/buildMode.ts TOOLBAR, hud.ts build bar), over the command card: the
## buildings he may lay out, each with its cost in the tooltip, and one status line: what to do now, or why the
## piece at the cursor can't go there. Walls, towers, gates, bridges and siege engines come with their tools (P10
## follow-up).
class_name BuildBar
extends PanelContainer

const TOOLBAR := ["camp", "storehouse", "outpost", "fort", "farm", "olivePress"]

var input: RegionInput
var phone := false
var _btns := {}
var _status: Label


func build(input_: RegionInput, phone_: bool) -> void:
	input = input_
	phone = phone_
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_theme_stylebox_override("panel", HudTheme.panel_box())
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 4)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 3)
	row.add_child(HudTheme.title("Build", 15))
	var defs: Dictionary = GameData.table("src/war/sim/economy")["BUILDINGS"]
	for t in TOOLBAR:
		var cost: Dictionary = defs.get(t, {}).get("cost", {})
		var type: String = t
		var b := HudTheme.slot(HudWords.BUILDING_ICON.get(t, "bld-camp"), HudWords.BUILDING_NAME.get(t, t), "Costs: " + HudWords.cost_words(cost), "", 40.0, func() -> void: input.set_tool("" if input.tool == type else type))
		_btns[t] = b
		row.add_child(b)
	v.add_child(row)
	_status = HudTheme.label("", HudTheme.BODY, HudTheme.MUTED)
	v.add_child(_status)
	add_child(v)


func want() -> Vector2:
	return get_combined_minimum_size()


func refresh(_client: WarClient) -> void:
	for t in _btns:
		HudTheme.slot_on(_btns[t], input.tool == t)
	var line := ""
	if input.tool == "":
		line = "Pick a building" if phone else "Pick a building, then click the map"
	elif input.ghost.x >= 0 and not input.ghost_ok and input.ghost_why != "":
		line = HudWords.PLACE_WHY.get(input.ghost_why, "Can't build here")
		_status.add_theme_color_override("font_color", HudTheme.BAD)
	else:
		line = ("Tap the map to lay it out" if phone else "Click to lay it out  ·  R rotate  ·  Esc cancel")
	if input.tool == "" or input.ghost_ok or input.ghost_why == "":
		_status.add_theme_color_override("font_color", HudTheme.MUTED)
	_status.text = line
