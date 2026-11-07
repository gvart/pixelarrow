## Nothing selected: his army in the command card's place (src/war/view/hud/armyPanel.ts): one row per squad (class
## icon, name, men, health, what it is doing; a click selects it, the group number when it has one) and the one line
## that says what to do. Before the army is in: why it is not (on its way, waiting in line, refused).
class_name ArmyPanel
extends PanelContainer

var input: RegionInput
var phone := false
var _list: VBoxContainer
var _hint: Label
var _rows := {}
var _width := 360.0
## The join's state as the HUD last heard it ("" in, else a line).
var waiting := "Your army is on its way…"


func build(input_: RegionInput, phone_: bool, width: float) -> void:
	input = input_
	phone = phone_
	_width = width
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_theme_stylebox_override("panel", HudTheme.panel_box())
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 4)
	var head := HBoxContainer.new()
	head.add_child(HudTheme.title("Your army", 15))
	v.add_child(head)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", 3)
	v.add_child(_list)
	_hint = HudTheme.label("", HudTheme.BODY, HudTheme.MUTED)
	_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_hint.custom_minimum_size = Vector2(width - 16, 0)
	v.add_child(_hint)
	add_child(v)


func want() -> Vector2:
	return Vector2(_width, get_combined_minimum_size().y)


func refresh(client: WarClient) -> void:
	var mine := client.my_squads()
	var seen := {}
	var by_squad := {}
	for u in client.snap.get("units", []):
		if u["state"] != "dead":
			var q := int(u["squad"])
			if not by_squad.has(q):
				by_squad[q] = []
			by_squad[q].append(u)
	for q in mine:
		var id := int(q["id"])
		var men: Array = by_squad.get(id, [])
		if men.is_empty():
			continue
		seen[id] = true
		if not _rows.has(id):
			_rows[id] = _row(id, men[0]["cls"])
		var r: Dictionary = _rows[id]
		var hp := 0.0
		var mx := 0.0
		for u in men:
			hp += u["hp"]
			mx += u["maxHp"]
		r["men"].text = HudWords.men(men.size())
		r["bar"].set_value(hp / maxf(1.0, mx), "")
		r["doing"].text = HudWords.doing(String(q.get("order", "idle")))
		var g := 0
		for n in input.sel.groups:
			if input.sel.groups[n].any(func(i: int) -> bool: return int(men[0]["squad"]) == int(input.sel.live.get(i, {}).get("squad", -1))):
				g = n
				break
		r["group"].text = str(g) if g else ""
	for id in _rows.keys():
		if not seen.has(id):
			_rows[id]["node"].queue_free()
			_rows.erase(id)
	if _rows.is_empty():
		_hint.text = waiting
	else:
		_hint.text = "Tap a squad to lead it" if phone else "Click a squad to lead it, or drag a box round your men"


func _row(id: int, cls: String) -> Dictionary:
	var b := Button.new()
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(0, 40 if phone else 32)
	b.tooltip_text = "Select this squad"
	b.pressed.connect(func() -> void: input.select_squad(id))
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 6)
	h.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	h.offset_left = 4
	h.offset_right = -6
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var grp := HudTheme.label("", HudTheme.KEY_SIZE + 2, HudTheme.TITLE, HudTheme.bold_font())
	grp.custom_minimum_size = Vector2(8, 0)
	h.add_child(grp)
	h.add_child(HudTheme.icon_rect(HudWords.unit_icon(cls), 24))
	var name := HudTheme.label(HudWords.class_name_of(cls), HudTheme.BODY, HudTheme.TITLE, HudTheme.bold_font())
	name.custom_minimum_size = Vector2(92, 0)
	name.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(name)
	var men := HudTheme.label("", HudTheme.BODY)
	men.custom_minimum_size = Vector2(58, 0)
	men.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(men)
	var bar := HudTheme.Bar.new()
	bar.custom_minimum_size = Vector2(60, 8)
	bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_child(bar)
	var doing := HudTheme.label("", HudTheme.SMALL, HudTheme.MUTED)
	doing.custom_minimum_size = Vector2(76, 0)
	doing.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(doing)
	b.add_child(h)
	_list.add_child(b)
	return {"node": b, "men": men, "bar": bar, "doing": doing, "group": grp}
