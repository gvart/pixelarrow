## The HUD's design system, from the DOM HUD's tokens (src/war/view/hud/theme.ts, the Dota 2 hybrid): dark stone
## panels with a bronze edge and a gold trim, square slots with the hotkey on the corner, Cinzel titles and Inter body
## (MSDF, sharp at every UI scale), the kit's icons (godot/view/ui, copied by npm run view:godot). Sizes are art px; the
## HUD root scales them (Hud.ui_scale).
##
## Contrast (WCAG AA) on PANEL #16181c: INK 14.6, TITLE 11.3, MUTED 7.2, GOLD 9.6, GOOD 9.5, BAD 5.6; DISABLED is for
## greyed controls only.
class_name HudTheme
extends RefCounted

const PANEL := Color("#16181c")
const PANEL_HI := Color("#20232a")
const PANEL_LO := Color("#101215")
const SUNK := Color("#0a0b0d")
const RAISED := Color("#1e2127")
const HOVER := Color("#272b33")
const SEL := Color("#2e2a1d")
const GLASS := Color(13 / 255.0, 15 / 255.0, 18 / 255.0, 0.88)
const INK := Color("#ece6d8")
const TITLE := Color("#efcf86")
const MUTED := Color("#a8a194")
const DISABLED := Color("#6f6a62")
const GOLD := Color("#e2bd68")
const GOLD_LO := Color("#9b7a3c")
const BRONZE := Color("#5f4b2a")
const BRONZE_HI := Color("#8a6c3a")
const EDGE := Color("#030304")
const GOOD := Color("#8ccf5e")
const BAD := Color("#ec6a50")
const WARN := Color("#e8b54a")
const HP_A := Color("#86d66c")
const HP_B := Color("#3f9a32")

## Body text never under 13 art px (W-70).
const BODY := 13
const SMALL := 13
const TITLE_SIZE := 15
const KEY_SIZE := 10

const ICONS := "res://view/ui/icons"
const FONTS := "res://view/ui/fonts"

static var _fonts := {}
static var _icons := {}
static var _theme: Theme


static func font(name: String) -> Font:
	if not _fonts.has(name):
		var f := FontFile.new()
		f.multichannel_signed_distance_field = true
		f.msdf_pixel_range = 12
		f.msdf_size = 48
		var path := ProjectSettings.globalize_path(FONTS.path_join(name + ".woff2"))
		if FileAccess.file_exists(path):
			f.load_dynamic_font(path)
			_fonts[name] = f
		else:
			_fonts[name] = ThemeDB.fallback_font
	return _fonts[name]


static func title_font() -> Font:
	return font("cinzel-latin-700-normal")


static func body_font() -> Font:
	return font("inter-latin-600-normal")


static func bold_font() -> Font:
	return font("inter-latin-700-normal")


## A kit icon (public/war/ui/icons/<24|32>/<id>.png), its @2x art (sharper at UI scales over 1); null when missing.
static func icon(id: String, size := 24) -> Texture2D:
	var key := "%s@%d" % [id, size]
	if not _icons.has(key):
		var path := ProjectSettings.globalize_path(ICONS.path_join("%d/%s@2x.png" % [size, id]))
		var tex: Texture2D = null
		if FileAccess.file_exists(path):
			tex = ImageTexture.create_from_image(Image.load_from_file(path))
		_icons[key] = tex
	return _icons[key]


static func icon_rect(id: String, px: float, size := 24) -> TextureRect:
	var t := TextureRect.new()
	t.texture = icon(id, size)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.custom_minimum_size = Vector2(px, px)
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return t


## A stone panel: bronze edge, black outline, a gold line along the top.
static func panel_box(alpha := 0.94) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Color(PANEL, alpha)
	s.border_color = BRONZE
	s.set_border_width_all(1)
	s.border_width_top = 2
	s.border_blend = false
	s.set_corner_radius_all(2)
	s.shadow_color = Color(0, 0, 0, 0.45)
	s.shadow_size = 6
	s.shadow_offset = Vector2(0, 3)
	s.set_content_margin_all(8)
	s.expand_margin_top = 0
	return s


## A slot (order button): sunk, bronze edge; `on` gold edged; `hover` lighter.
static func slot_box(state: String) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = {"normal": RAISED, "hover": HOVER, "pressed": SEL, "on": SEL, "disabled": PANEL_LO}.get(state, RAISED)
	s.border_color = {"hover": GOLD_LO, "pressed": GOLD, "on": GOLD, "disabled": Color(BRONZE, 0.5)}.get(state, BRONZE)
	s.set_border_width_all(1 if state != "on" else 2)
	s.set_corner_radius_all(2)
	s.set_content_margin_all(3)
	return s


static func chip_box() -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Color(SUNK, 0.8)
	s.border_color = Color(BRONZE, 0.8)
	s.set_border_width_all(1)
	s.set_corner_radius_all(2)
	s.content_margin_left = 4
	s.content_margin_right = 5
	s.content_margin_top = 1
	s.content_margin_bottom = 1
	return s


## The HUD's Theme: labels in Inter, buttons as slots, tooltips as small stone panels.
static func theme() -> Theme:
	if _theme:
		return _theme
	var t := Theme.new()
	t.default_font = body_font()
	t.default_font_size = BODY
	t.set_color("font_color", "Label", INK)
	t.set_color("font_outline_color", "Label", Color(0, 0, 0, 0.7))
	for st in ["normal", "hover", "pressed", "disabled", "focus"]:
		var box := slot_box(st if st != "focus" else "hover")
		if st == "focus":
			box.bg_color = Color(0, 0, 0, 0)
		t.set_stylebox(st, "Button", box)
	t.set_color("font_color", "Button", INK)
	t.set_color("font_hover_color", "Button", TITLE)
	t.set_color("font_disabled_color", "Button", DISABLED)
	var tip := panel_box(0.97)
	tip.set_content_margin_all(6)
	tip.shadow_size = 4
	t.set_stylebox("panel", "TooltipPanel", tip)
	t.set_color("font_color", "TooltipLabel", INK)
	t.set_font("font", "TooltipLabel", body_font())
	t.set_font_size("font_size", "TooltipLabel", BODY)
	t.set_stylebox("panel", "PanelContainer", panel_box())
	_theme = t
	return t


static func label(text: String, size := BODY, color := INK, f: Font = null) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if f:
		l.add_theme_font_override("font", f)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


static func title(text: String, size := TITLE_SIZE) -> Label:
	return label(text, size, TITLE, title_font())


## A square order slot: the kit icon, the hotkey on its corner, a tooltip (name, what, key); `cb` on press.
static func slot(icon_id: String, tip_name: String, tip_what: String, key: String, px: float, cb: Callable) -> Button:
	var b := Button.new()
	b.custom_minimum_size = Vector2(px, px)
	b.focus_mode = Control.FOCUS_NONE
	b.icon = icon(icon_id, 32 if px >= 36 else 24)
	b.expand_icon = true
	b.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.vertical_icon_alignment = VERTICAL_ALIGNMENT_CENTER
	b.add_theme_constant_override("icon_max_width", int(px - 10))
	b.tooltip_text = tip_name + ("  [" + key + "]" if key != "" else "") + ("\n" + tip_what if tip_what != "" else "")
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	if key != "":
		var k := label(key, KEY_SIZE, TITLE, bold_font())
		k.add_theme_color_override("font_outline_color", Color.BLACK)
		k.add_theme_constant_override("outline_size", 3)
		k.position = Vector2(2, -1)
		b.add_child(k)
	b.pressed.connect(cb)
	return b


## Show a slot as on (gold edge) or off.
static func slot_on(b: Button, on: bool) -> void:
	if on:
		b.add_theme_stylebox_override("normal", slot_box("on"))
		b.add_theme_stylebox_override("hover", slot_box("on"))
	else:
		b.remove_theme_stylebox_override("normal")
		b.remove_theme_stylebox_override("hover")


## A health bar (green on sunk stone) with its numbers on it.
class Bar extends Control:
	var frac := 1.0
	var text := ""
	var fill := HudTheme.HP_B
	var fill_hi := HudTheme.HP_A

	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size)
		draw_rect(r, HudTheme.SUNK)
		var w := roundf((size.x - 2) * clampf(frac, 0.0, 1.0))
		if w > 0:
			draw_rect(Rect2(1, 1, w, size.y - 2), fill)
			draw_rect(Rect2(1, 1, w, maxf(1.0, (size.y - 2) * 0.4)), fill_hi)
		draw_rect(r, HudTheme.BRONZE, false, 1.0)
		if text != "":
			var f := HudTheme.bold_font()
			var fs := mini(HudTheme.BODY, int(size.y))
			var tw := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
			var at := Vector2((size.x - tw) / 2.0, (size.y + f.get_ascent(fs) - f.get_descent(fs)) / 2.0)
			draw_string_outline(f, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 3, Color(0, 0, 0, 0.8))
			draw_string(f, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, HudTheme.INK)

	func set_value(f: float, t: String) -> void:
		if f != frac or t != text:
			frac = f
			text = t
			queue_redraw()
