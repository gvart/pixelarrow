## The top bar (src/war/view/hud/topBar.ts): one slim glass strip with a gold trim.
##   left    the goods at hand (W-60: the store his men stand by, never a total; "–" when none is near) and his men
##   centre  a plaque: the region's name and the time played here
## Online the plaque adds the season's day (P11); the menu buttons on the right come with their windows.
class_name TopBar
extends Control

const GOODS := ["food", "wood", "stone", "iron", "coin"]
const PHONE_GOODS := ["food", "wood", "stone"]

var h := 30.0
var _chips := {}
var _men: Label
var _name: Label
var _clock: Label
var _plaque: PanelContainer
var _row: HBoxContainer
var phone := false


func build(region_name: String, phone_: bool) -> void:
	phone = phone_
	h = 30.0
	mouse_filter = Control.MOUSE_FILTER_STOP
	_row = HBoxContainer.new()
	_row.add_theme_constant_override("separation", 4)
	_row.position = Vector2(4, 3)
	add_child(_row)
	for g in (PHONE_GOODS if phone else GOODS):
		_chips[g] = _chip(HudWords.GOOD_ICON[g], "–", g.capitalize() + ": what the store your men stand by holds")
	_men = _chip("unit-militia", "0", "Your men here")
	_plaque = PanelContainer.new()
	var pb := HudTheme.panel_box(0.96)
	pb.content_margin_top = 2
	pb.content_margin_bottom = 3
	pb.content_margin_left = 16
	pb.content_margin_right = 16
	_plaque.add_theme_stylebox_override("panel", pb)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", -1)
	_name = HudTheme.title(region_name, 17 if not phone else 15)
	_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_clock = HudTheme.label("0:00", HudTheme.SMALL, HudTheme.MUTED)
	_clock.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_name)
	if not phone:
		v.add_child(_clock)
	_plaque.add_child(v)
	_plaque.tooltip_text = "The region you are in, and the time played here"
	add_child(_plaque)


func _chip(icon_id: String, text: String, tip: String) -> Label:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", HudTheme.chip_box())
	p.tooltip_text = tip
	var r := HBoxContainer.new()
	r.add_theme_constant_override("separation", 3)
	r.add_child(HudTheme.icon_rect(icon_id, 18))
	var l := HudTheme.label(text, HudTheme.BODY, HudTheme.INK, HudTheme.bold_font())
	l.custom_minimum_size = Vector2(26, 0)
	r.add_child(l)
	p.add_child(r)
	_row.add_child(p)
	return l


## The plaque's rect (art px), which hangs below the bar.
func plaque_rect() -> Rect2:
	return Rect2(_plaque.position, _plaque.get_combined_minimum_size())


func lay(w: float) -> void:
	size = Vector2(w, h)
	var pm := _plaque.get_combined_minimum_size()
	_plaque.size = pm
	_plaque.position = Vector2(roundf((w - pm.x) / 2.0), 0)
	# the goods give way before they would meet the plaque
	var room := _plaque.position.x - 10
	var x := 0.0
	for c in _row.get_children():
		x += c.get_combined_minimum_size().x + 4
		c.visible = x <= room


func refresh(client: WarClient, sel_live: int) -> void:
	var goods: Dictionary = client.stock.get("goods", {})
	var near: bool = client.stock.get("store") != null
	for g in _chips:
		_chips[g].text = HudWords.num(goods.get(g, 0)) if near else "–"
	_men.text = str(sel_live)
	var t := int(client.snap.get("tick", 0)) / 10
	_clock.text = "%d:%02d" % [t / 60, t % 60] if t < 3600 else "%d:%02d:%02d" % [t / 3600, (t / 60) % 60, t % 60]


func _draw() -> void:
	draw_rect(Rect2(0, 0, size.x, h), HudTheme.GLASS)
	draw_line(Vector2(0, h - 0.5), Vector2(size.x, h - 0.5), HudTheme.GOLD_LO, 1.0)
