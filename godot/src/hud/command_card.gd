## The command card, bottom centre (src/war/view/hud/hud.ts squad card, W-70): what is selected and what it can do.
##   left    the class's portrait (desktop)
##   middle  name, men and how fed; the squad's health; a class icon per man with his health strip (two rows of 12,
##           "+N" past 24; one row on a phone); the state line: in combat, men down, what they are doing
##   right   the orders: move, attack, attack-move (click, then the map), hold (H), stop (X); the formations (Alt+1-4)
class_name CommandCard
extends PanelContainer

const ORDERS := [
	["move", "act-move", "Move", "Click this, then the map. Or right click the map.", ""],
	["attack", "act-attack", "Attack", "Click this, then an enemy. Or right click him.", ""],
	["attackMove", "act-attack", "Attack-move", "March to a point and fight any foe on the way: click this, then the point. Or Ctrl + right click.", ""],
	["hold", "act-hold", "Hold", "Stand and fight here", "order.hold"],
	["stop", "act-stop", "Stop", "Halt and form up where they stand", "order.stop"],
]
const FORMS := [["line", "act-line", "Line"], ["column", "act-column", "Column"], ["wedge", "act-wedge", "Wedge"], ["loose", "act-loose", "Loose"]]

var input: RegionInput
var units_view: Units
var mode := "desktop"
var _portrait: TextureRect
var _portrait_box: PanelContainer
var _name: Label
var _men: Label
var _bar: HudTheme.Bar
var _pips: Pips
var _state: HBoxContainer
var _doing: Label
var _combat: Label
var _slots := {}
var _forms := {}
var _width := 540.0


func build(input_: RegionInput, units_: Units, mode_: String, width: float) -> void:
	input = input_
	units_view = units_
	mode = mode_
	_width = width
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_theme_stylebox_override("panel", HudTheme.panel_box())
	var phone := mode != "desktop"
	var root: BoxContainer = VBoxContainer.new() if mode == "portrait" else HBoxContainer.new()
	root.add_theme_constant_override("separation", 8 if not phone else 6)
	add_child(root)
	if not phone:
		_portrait_box = PanelContainer.new()
		var pb := HudTheme.chip_box()
		pb.bg_color = HudTheme.SUNK
		pb.set_content_margin_all(2)
		_portrait_box.add_theme_stylebox_override("panel", pb)
		_portrait = TextureRect.new()
		_portrait.custom_minimum_size = Vector2(58, 84)
		_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		_portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		_portrait.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		_portrait_box.add_child(_portrait)
		root.add_child(_portrait_box)
	var info := VBoxContainer.new()
	info.add_theme_constant_override("separation", 3)
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.custom_minimum_size = Vector2(250 if not phone else 170, 0)
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	_name = HudTheme.title("", 15)
	_men = HudTheme.label("", HudTheme.BODY, HudTheme.INK)
	head.add_child(_name)
	head.add_child(_men)
	info.add_child(head)
	_bar = HudTheme.Bar.new()
	_bar.custom_minimum_size = Vector2(0, 14)
	info.add_child(_bar)
	_pips = Pips.new()
	_pips.per_row = 12
	_pips.rows_max = 1 if phone else 2
	_pips.px = 16.0 if phone else 18.0
	info.add_child(_pips)
	_state = HBoxContainer.new()
	_state.add_theme_constant_override("separation", 6)
	_combat = HudTheme.label("In combat", HudTheme.SMALL, HudTheme.BAD, HudTheme.bold_font())
	_combat.tooltip_text = "They hit or were hit lately"
	_doing = HudTheme.label("", HudTheme.SMALL, HudTheme.MUTED)
	_state.add_child(_combat)
	_state.add_child(_doing)
	info.add_child(_state)
	root.add_child(info)
	var orders := VBoxContainer.new()
	orders.add_theme_constant_override("separation", 4)
	var r1 := HBoxContainer.new()
	r1.add_theme_constant_override("separation", 3)
	# touch-sized slots on a phone (44 art px); the formations a row under the orders everywhere
	var big := 44.0 if phone else 40.0
	for o in ORDERS:
		var key := WarActions.badge(o[4]) if o[4] != "" and not phone else ""
		var kind: String = o[0]
		var b := HudTheme.slot(o[1], o[2], o[3], key, big, func() -> void: _order(kind))
		if kind == "attackMove":
			var badge := HudTheme.icon_rect("act-move", 16)
			badge.position = Vector2(big - 18, big - 18)
			b.add_child(badge)
		_slots[kind] = b
		r1.add_child(b)
	var r2 := HBoxContainer.new()
	r2.add_theme_constant_override("separation", 3)
	for i in FORMS.size():
		var f: Array = FORMS[i]
		var shape: String = f[0]
		var key := WarActions.badge("form." + shape) if not phone else ""
		var b := HudTheme.slot(f[1], "Formation: " + f[2], "The selected men form up as one", key, big if phone else 34.0, func() -> void: input.formation(shape))
		_forms[shape] = b
		r2.add_child(b)
	orders.add_child(r1)
	orders.add_child(r2)
	if mode == "portrait":
		r1.alignment = BoxContainer.ALIGNMENT_CENTER
		r2.alignment = BoxContainer.ALIGNMENT_CENTER
	root.add_child(orders)


func _order(kind: String) -> void:
	match kind:
		"hold":
			input.hold()
		"stop":
			input.stop()
		_:
			input.arm(kind)


## The card's size for the layout (art px).
func want() -> Vector2:
	var m := get_combined_minimum_size()
	return Vector2(maxf(m.x, _width if mode == "portrait" else m.x), m.y)


func refresh(client: WarClient) -> void:
	var men: Array = input.sel.men()
	var sqs := input.sel.squads()
	var all := []
	var by_cls := {}
	var tagged := false
	var down := 0
	for u in client.snap.get("units", []):
		if sqs.has(int(u["squad"])):
			if u["state"] == "dead":
				if u.get("down", false):
					down += 1
				continue
			all.append(u)
			by_cls[u["cls"]] = true
			if int(u.get("tag", 0)) > 0:
				tagged = true
	var cls: String = men[0]["cls"] if not men.is_empty() else "militia"
	_name.text = "Mixed" if by_cls.size() > 1 else HudWords.class_name_of(cls)
	var hp := 0.0
	var mx := 0.0
	var sat := 0.0
	var nsat := 0
	for u in men:
		hp += u["hp"]
		mx += u["maxHp"]
		if u.has("sat"):
			sat += u["sat"]
			nsat += 1
	var fed := ""
	if nsat > 0:
		fed = "  ·  fed %d%%" % roundi(sat / nsat)
	_men.text = HudWords.men(men.size()) + fed
	_bar.set_value(hp / maxf(1.0, mx), "%d / %d" % [ceili(hp), ceili(mx)])
	_pips.set_men(all, men)
	_combat.visible = tagged
	var lead := {}
	for q in client.snap.get("squads", []):
		if int(q["id"]) == input.sel.lead():
			lead = q
	var doing := HudWords.doing(String(lead.get("order", "idle")))
	if down > 0:
		doing = "%d down, rising soon  ·  %s" % [down, doing]
	_doing.text = doing
	if _portrait and units_view:
		_portrait.texture = _portrait_of(cls)
	for k in _slots:
		HudTheme.slot_on(_slots[k], input.armed == k or (k == "hold" and lead.get("order") == "hold"))
	for k in _forms:
		HudTheme.slot_on(_forms[k], input.last_shape() == k)


var _portraits := {}


## The class's standing frame from its sheet, facing the viewer.
func _portrait_of(cls: String) -> Texture2D:
	if _portraits.has(cls):
		return _portraits[cls]
	var sh = units_view.sheet(cls)
	var tex: Texture2D = null
	if sh != null:
		var clip: String = "idle" if sh["frames"].has("idle") else sh["frames"].keys()[0]
		var row: Array = sh["rows"][0]
		# the frame cut to the man himself (the sheet's cells leave room for his swing)
		var img: Image = sh["tex"].get_image().get_region(sh["frames"][clip][row[0]][0])
		var used := img.get_used_rect()
		if used.size.x > 0:
			img = img.get_region(used)
		tex = ImageTexture.create_from_image(img)
	_portraits[cls] = tex
	return tex


## A class icon per man with his health strip under it; the picked men lit.
class Pips extends Control:
	var per_row := 12
	var rows_max := 2
	var px := 18.0
	var _men := []
	var _picked := {}

	func set_men(all: Array, picked: Array) -> void:
		_men = all
		_picked.clear()
		for u in picked:
			_picked[int(u["id"])] = true
		var rows := mini(rows_max, ceili(all.size() / float(per_row)))
		custom_minimum_size = Vector2(per_row * (px + 2), maxi(1, rows) * (px + 5))
		queue_redraw()

	func _draw() -> void:
		var cap := per_row * rows_max
		var n := _men.size()
		var shown := n if n <= cap else cap - 1
		for i in shown:
			var u: Dictionary = _men[i]
			var x := (i % per_row) * (px + 2)
			var y := (i / per_row) * (px + 5)
			var r := Rect2(x, y, px, px)
			draw_rect(r, HudTheme.SEL if _picked.has(int(u["id"])) else HudTheme.SUNK)
			var t := HudTheme.icon(HudWords.unit_icon(u["cls"]), 24)
			if t:
				draw_texture_rect(t, r.grow(-1), false, Color.WHITE if _picked.has(int(u["id"])) else Color(1, 1, 1, 0.7))
			var f: float = clampf(u["hp"] / maxf(1.0, u["maxHp"]), 0.0, 1.0)
			draw_rect(Rect2(x, y + px + 1, px, 3), HudTheme.SUNK)
			draw_rect(Rect2(x, y + px + 1, px * f, 3), HudTheme.HP_A if f > 0.5 else HudTheme.WARN if f > 0.25 else HudTheme.BAD)
		if n > cap:
			var i := cap - 1
			var at := Vector2((i % per_row) * (px + 2), (i / per_row) * (px + 5))
			var fnt := HudTheme.bold_font()
			draw_string(fnt, at + Vector2(1, px - 4), "+%d" % (n - shown), HORIZONTAL_ALIGNMENT_LEFT, -1, HudTheme.BODY, HudTheme.TITLE)
