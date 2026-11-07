## The world map's cards in Control nodes (src/war/world-view/regionCard.ts, main.ts openOrder): the region card (what
## a player needs to decide at a glance: the owner's banner, the name and what it is, its tags, who holds it, how
## dangerous, whose troops stand there, a world event, his men, the warlords and the landmark there, its goods, the
## action) and the march order (where, how long, who holds it, the room his alliance has there). Built fresh on each
## refresh into a PanelContainer the HUD places; buttons call back into the screen.
class_name WorldCard
extends RefCounted

const CREST_H := 30.0


static func _row(sep := 6) -> HBoxContainer:
	var r := HBoxContainer.new()
	r.add_theme_constant_override("separation", sep)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


static func _wrap(text: String, w: float, color := HudTheme.INK) -> Label:
	var l := HudTheme.label(text, HudTheme.BODY, color)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size = Vector2(w, 0)
	return l


## An alliance's banner (or an empty grey frame for nobody), h px tall.
static func crest(a: int, h := CREST_H) -> Control:
	var p := PanelContainer.new()
	var s := StyleBoxFlat.new()
	s.bg_color = Color("#1e1410") if a >= 0 else Color("#241f1b")
	s.border_color = WorldGeo.color(a) if a >= 0 else Color("#6e6560")
	s.set_border_width_all(2)
	s.set_content_margin_all(2)
	p.add_theme_stylebox_override("panel", s)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var t := TextureRect.new()
	t.custom_minimum_size = Vector2(roundf(h * 0.7), h)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if a >= 0:
		t.texture = banner(a)
	p.add_child(t)
	return p


static var _banners := {}


static func banner(a: int) -> Texture2D:
	if not _banners.has(a):
		var img := Image.load_from_file(ProjectSettings.globalize_path("res://view/world/banners/%s@2x.png" % WorldGeo.alliances()[a]["key"]))
		_banners[a] = ImageTexture.create_from_image(img) if img else null
	return _banners[a]


static func swatch(a: int, px := 10.0) -> ColorRect:
	var c := ColorRect.new()
	c.color = WorldGeo.color(a)
	c.custom_minimum_size = Vector2(px, px)
	c.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


static func chip(text: String, cls: String, tip := "") -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", HudTheme.chip_box())
	var col: Color = {"gold": HudTheme.GOLD, "bad": HudTheme.BAD, "good": HudTheme.GOOD}.get(cls, HudTheme.INK)
	p.add_child(HudTheme.label(text, HudTheme.SMALL, col, HudTheme.bold_font()))
	p.tooltip_text = tip
	p.mouse_filter = Control.MOUSE_FILTER_PASS if tip != "" else Control.MOUSE_FILTER_IGNORE
	return p


## A key / value tile: the key small in the accent, the value under it.
static func tile(key: String, value: Control, w: float, tip := "") -> PanelContainer:
	var p := PanelContainer.new()
	var s := HudTheme.chip_box()
	s.set_content_margin_all(4)
	p.add_theme_stylebox_override("panel", s)
	p.custom_minimum_size = Vector2(w, 0)
	p.tooltip_text = tip
	p.mouse_filter = Control.MOUSE_FILTER_PASS if tip != "" else Control.MOUSE_FILTER_IGNORE
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(HudTheme.label(key.to_upper(), HudTheme.SMALL, HudTheme.TITLE, HudTheme.title_font()))
	v.add_child(value)
	p.add_child(v)
	return p


static func _owner_value(owner: int, you: Variant) -> Control:
	var r := _row(4)
	if owner >= 0:
		r.add_child(swatch(owner))
	r.add_child(HudTheme.label(WorldGeo.alliance_name(owner), HudTheme.BODY, HudTheme.GOLD if owner >= 0 and owner == you else HudTheme.INK, HudTheme.bold_font()))
	return r


## The danger word in its colour (deeper: redder), "Danger 3 of 4" in its tooltip.
static func danger(d: int) -> Label:
	var col: Color = [HudTheme.GOOD, HudTheme.GOOD, HudTheme.GOLD, HudTheme.WARN, HudTheme.BAD][clampi(d, 0, 4)]
	return HudTheme.label(WorldGeo.DANGER[clampi(d, 0, 4)], HudTheme.BODY, col, HudTheme.bold_font())


static func _troops(feed: WorldFeed, id: String) -> Control:
	var r: Dictionary = feed.regions.get(id, {})
	if r.is_empty():
		return HudTheme.label("No report", HudTheme.BODY, HudTheme.MUTED)
	if not feed.sight(id):
		return HudTheme.label("Hidden", HudTheme.BODY, HudTheme.MUTED)
	var row := _row(5)
	for a in r["live"].size():
		if r["live"][a] > 0:
			row.add_child(swatch(a, 8))
			row.add_child(HudTheme.label(str(int(r["live"][a])), HudTheme.BODY, HudTheme.INK, HudTheme.bold_font()))
	if row.get_child_count() == 0:
		return HudTheme.label("Empty", HudTheme.BODY, HudTheme.MUTED)
	return row


## The card's header: the crest, the name and a plain-words line; a close button when `close` is set.
static func head(owner: int, title: String, sub: String, close: Callable, w: float) -> HBoxContainer:
	var h := _row(8)
	h.add_child(crest(owner))
	var tt := VBoxContainer.new()
	tt.add_theme_constant_override("separation", 0)
	tt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tt.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var tw := w - roundf(CREST_H * 0.7) - 6 - 8 - (34.0 if close.is_valid() else 0.0)
	var n := HudTheme.title(title, 17)
	n.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	n.custom_minimum_size = Vector2(tw, 0)
	tt.add_child(n)
	tt.add_child(_wrap(sub, tw, HudTheme.MUTED))
	h.add_child(tt)
	if close.is_valid():
		var x := Button.new()
		x.text = "×"
		x.focus_mode = Control.FOCUS_NONE
		x.custom_minimum_size = Vector2(26, 26)
		x.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		x.tooltip_text = "Close  [Esc]"
		x.pressed.connect(close)
		h.add_child(x)
	return h


## The main action button: its label and key on it, `cb` on press.
static func action(label: String, key: String, cb: Callable, primary := true) -> Button:
	var b := Button.new()
	b.text = label + ("   " + key if key != "" else "")
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(0, 30)
	b.add_theme_font_override("font", HudTheme.bold_font())
	if primary:
		var s := HudTheme.slot_box("on")
		s.bg_color = Color("#5a3a1a")
		s.set_content_margin_all(6)
		b.add_theme_stylebox_override("normal", s)
		var hs := s.duplicate()
		hs.bg_color = Color("#6e4820")
		b.add_theme_stylebox_override("hover", hs)
		b.add_theme_color_override("font_color", Color("#fff0d8"))
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.pressed.connect(cb)
	return b


## The region card into `box` (w art px wide). ctx: {mode, compact, phone, enter: Callable, march: Callable,
## close: Callable}.
static func region_card(box: VBoxContainer, feed: WorldFeed, id: String, w: float, ctx: Dictionary) -> void:
	var wr := WorldGeo.region(id)
	if wr.is_empty():
		return
	var r: Dictionary = feed.regions.get(id, {})
	var owner := int(r.get("owner", -1))
	var you = feed.you
	var compact: bool = ctx.get("compact", false)
	box.add_child(head(owner, wr["name"], "%s · %s" % [WorldGeo.region_kind(id), WorldGeo.BIOME_NAME.get(wr["biome"], "")], ctx.get("close", Callable()), w))
	var tags := HFlowContainer.new()
	tags.add_theme_constant_override("h_separation", 4)
	tags.add_theme_constant_override("v_separation", 4)
	tags.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for t in WorldGeo.region_tags(id, r):
		tags.add_child(chip(t[0], t[1], t[2]))
	if tags.get_child_count() > 0:
		box.add_child(tags)
	var tw := floorf((w - 8) / 3.0)
	var tiles := _row(4)
	tiles.add_child(tile("Held by", _owner_value(owner, you), tw, "The alliance holding the most claim points holds the region."))
	var d := WorldGeo.depth(id)
	tiles.add_child(tile("Danger", danger(d), tw, "Danger %d of 4: deeper lands have tougher beasts, slower claims and richer goods." % d))
	tiles.add_child(tile("Troops", _troops(feed, id), tw, "" if feed.sight(id) else "You see troops only in your land and next to it, or where your men stand."))
	box.add_child(tiles)
	for e in feed.events:
		if e["region"] == id and e["endAt"] > feed.now_ms():
			box.add_child(event_row(e, feed.now_ms(), w, not compact))
	var mine: int = feed.squads.get(id, 0)
	if mine > 0:
		box.add_child(HudTheme.label("%d of your men stand here" % mine, HudTheme.BODY, HudTheme.GOLD))
	if you != null and feed.sight(id) and not r.is_empty() and not compact:
		var ours := int(r["live"][you])
		box.add_child(HudTheme.label("%s men here: %d of %d" % [WorldGeo.alliance_name(you), ours, feed.quota()], HudTheme.BODY, HudTheme.MUTED))
	for m in feed.lords:
		if m["region"] != id:
			continue
		var wl := WorldGeo.warlord(m["id"])
		var what := "fallen, back later" if m.get("fallen", false) else "a raid is coming" if m.get("raid", false) else ("his hall" if m["seat"] else "his land")
		var men := " · %s men" % WorldGeo.rough_men(m["men"]) if m.has("men") and not m.get("fallen", false) else ""
		box.add_child(_wrap("Warlord %s: %s%s" % [wl.get("name", m["id"]), what, men], w, HudTheme.BAD if m.get("raid", false) else HudTheme.INK))
	if r.has("landmark"):
		var lm := WorldGeo.landmark_of(id)
		var st := {"guarded": "guarded", "unclaimed": "guardian slain, free to claim", "damaged": "damaged", "restored": "restored"}
		box.add_child(_wrap("Landmark %s: %s" % [lm.get("name", "?"), st.get(r["landmark"]["state"], "")], w))
	if not compact:
		var res: Dictionary = wr.get("res", {})
		if not res.is_empty():
			var goods := HFlowContainer.new()
			goods.add_theme_constant_override("h_separation", 4)
			goods.mouse_filter = Control.MOUSE_FILTER_IGNORE
			var keys := res.keys()
			keys.sort_custom(func(a: String, b: String) -> bool: return res[a] > res[b])
			for g in keys:
				goods.add_child(good_chip(g, int(res[g])))
			box.add_child(goods)
	var act := WorldGeo.region_action(ctx.get("mode", "enter"))
	var cb: Callable = ctx.get("march") if act["act"] == "march" else ctx.get("enter")
	var key: String = "" if ctx.get("phone", false) else ("Enter" if act["key"] == "⏎" else act["key"])
	var go := action(act["label"], key, cb)
	go.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	box.add_child(go)
	var hint: String = act["hint"]
	if ctx.get("phone", false):
		hint = hint.replace("double-click", "double-tap").replace("Click", "Tap")
	box.add_child(_wrap(hint, w, HudTheme.MUTED))


## A good with its kit icon and its amount in pips.
static func good_chip(g: String, n: int) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", HudTheme.chip_box())
	p.tooltip_text = "%s: %s" % [WorldGeo.GOOD_NAME.get(g, g), WorldGeo.AMOUNT[clampi(n, 0, 3)]]
	p.mouse_filter = Control.MOUSE_FILTER_PASS
	var r := _row(3)
	var ic := HudTheme.icon("res-" + g)
	if ic:
		r.add_child(HudTheme.icon_rect("res-" + g, 18))
	else:
		r.add_child(HudTheme.label(WorldGeo.GOOD_NAME.get(g, g), HudTheme.SMALL, HudTheme.INK, HudTheme.bold_font()))
	for i in n:
		var c := ColorRect.new()
		c.color = HudTheme.GOLD
		c.custom_minimum_size = Vector2(5, 5)
		c.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		r.add_child(c)
	p.add_child(r)
	return p


## A world event: its icon, name and time left; its rule under it when `rule`.
static func event_row(e: Dictionary, now: float, w: float, rule := true) -> Control:
	var look: Dictionary = GameData.table("src/war/world-view/eventLook")["EVENT_LOOK"][e["kind"]]
	var info: Dictionary = GameData.table("src/war/world/events")["EVENT_INFO"][e["kind"]]
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 1)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var r := _row(5)
	r.add_child(HudTheme.icon_rect(look["icon"], 20))
	var n := HudTheme.label(info["name"], HudTheme.BODY, Color(look["color"]), HudTheme.bold_font())
	n.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	r.add_child(n)
	r.add_child(HudTheme.label("%s left" % WorldGeo.clock(maxi(0, ceili((e["endAt"] - now) / 1000.0))), HudTheme.BODY, HudTheme.INK))
	v.add_child(r)
	if rule:
		var rl: String = info["rule"]
		v.add_child(_wrap(rl.left(1).to_upper() + rl.substr(1) + ".", w, HudTheme.MUTED))
	return v


## The march order into `box`: from his squad's region to `to`. ctx: {send: Callable, cancel: Callable, phone}.
static func order_card(box: VBoxContainer, feed: WorldFeed, from: String, to: String, w: float, ctx: Dictionary) -> void:
	var men: int = feed.squads.get(from, 0)
	var r: Dictionary = feed.regions.get(to, {})
	var owner := int(r.get("owner", -1))
	box.add_child(head(owner, "March to " + WorldGeo.region_name(to), "from %s · %d men" % [WorldGeo.region_name(from), men], Callable(), w))
	var tw := floorf((w - 8) / 3.0)
	var tiles := _row(4)
	tiles.add_child(tile("Travel", HudTheme.label(WorldGeo.clock(int(WorldGeo.travel_ms(from, to) / 1000.0)), HudTheme.BODY, HudTheme.INK, HudTheme.bold_font()), tw, "From the region's exit; men further from it take a little longer"))
	tiles.add_child(tile("Held by", _owner_value(owner, feed.you), tw))
	tiles.add_child(tile("Danger", danger(WorldGeo.depth(to)), tw))
	box.add_child(tiles)
	if feed.sight(to) and feed.you != null:
		var after := int(r.get("live", [0, 0, 0, 0])[feed.you]) + men
		box.add_child(HudTheme.label("Your alliance there after: %d of %d" % [after, feed.quota()], HudTheme.BODY, HudTheme.BAD if after > feed.quota() else HudTheme.MUTED))
		if after > feed.quota():
			box.add_child(_wrap("Full: some men wait in line until there is room.", w, HudTheme.BAD))
	else:
		box.add_child(_wrap("Hidden: you cannot see how many men stand there.", w, HudTheme.MUTED))
	if r.get("contested", false):
		box.add_child(chip("Fighting there now", "bad"))
	var bar := _row(8)
	bar.alignment = BoxContainer.ALIGNMENT_END
	var phone: bool = ctx.get("phone", false)
	bar.add_child(action("Cancel", "" if phone else "Esc", ctx["cancel"], false))
	bar.add_child(action("March", "" if phone else "Enter", ctx["send"]))
	box.add_child(bar)
