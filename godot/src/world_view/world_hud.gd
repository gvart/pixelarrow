## The world screen's panels (src/war/world-view/main.ts) in Control nodes, placed by the region HUD's zone solver
## (HudLayout) so no two meet, at the HUD's UI scale and layouts (Hud.mode_for, Hud.scale_for):
##
##   band     the top strip: "World map", the season, his alliance, the season's time left; Roads and Fit
##   squads   his men: where his group stands (tap: select it, its neighbours glow), on the road with the time to go
##   season   the standings: land score, score an hour, market towns; who holds Omphalos and how a season is won
##   events   the world event running now (tap: select its region) and the next one
##   card     the selected region's card, docked in the season panel's place (phone portrait: at the bottom)
##   order    the march order; toast: a short line of what happened
##
## Zones: desktop and phone landscape: squads top left, events bottom left, season or card top right, order and toast
## bottom centre. Portrait: squads and season top, the card or the events at the bottom, full width.
class_name WorldHud
extends Control

var screen: WorldScreen
var feed: WorldFeed
var density := 1.0
var mode := "desktop"
var ui_scale := 1.0
var frame_art := Vector2.ZERO
var band_h := 30.0
var placed := {}
var band: Band
var squads: PanelContainer
var season: PanelContainer
var events: PanelContainer
var card: PanelContainer
var order: PanelContainer
var toast: PanelContainer
var _toast_text := ""
var _toast_t := 0.0
var _built_for := Vector2i.ZERO


func setup(screen_: WorldScreen, feed_: WorldFeed, density_: float) -> void:
	screen = screen_
	feed = feed_
	density = density_
	theme = HudTheme.theme()
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_TOP_LEFT)
	rebuild()


func phone() -> bool:
	return mode != "desktop"


## Panel widths (art px) by layout.
func width(id: String) -> float:
	if mode == "portrait":
		return frame_art.x - 8 if id in ["card", "order", "events", "toast"] else floorf((frame_art.x - 14) / 2.0)
	return {"squads": 220.0, "season": 260.0, "events": 250.0, "card": 300.0, "order": 300.0, "toast": 320.0}[id] if mode == "desktop" \
		else {"squads": 200.0, "season": 236.0, "events": 220.0, "card": 290.0, "order": 290.0, "toast": 280.0}[id]


func rebuild() -> void:
	for c in get_children():
		c.queue_free()
	var win := get_viewport().get_visible_rect().size
	var logical := win / density
	mode = Hud.mode_for(logical.x, logical.y)
	ui_scale = Hud.scale_for(logical.x, logical.y) * density
	scale = Vector2(ui_scale, ui_scale)
	frame_art = (win / ui_scale).floor()
	size = frame_art
	_built_for = Vector2i(win)
	band = Band.new()
	band.hud = self
	add_child(band)
	for n in ["squads", "season", "events", "card", "order", "toast"]:
		var p := PanelContainer.new()
		p.mouse_filter = Control.MOUSE_FILTER_STOP
		var v := VBoxContainer.new()
		v.add_theme_constant_override("separation", 5)
		v.mouse_filter = Control.MOUSE_FILTER_IGNORE
		p.add_child(v)
		add_child(p)
		set(n, p)
	refresh()


func _process(dt: float) -> void:
	if Vector2i(get_viewport().get_visible_rect().size) != _built_for:
		rebuild()
		screen.fit()
	if _toast_t > 0:
		_toast_t -= dt
		if _toast_t <= 0:
			refresh()


func say(text: String, secs := 3.5) -> void:
	_toast_text = text
	_toast_t = secs
	refresh()


static func _clear(p: PanelContainer) -> VBoxContainer:
	var v: VBoxContainer = p.get_child(0)
	for c in v.get_children():
		v.remove_child(c)
		c.queue_free()
	return v


func _head(v: VBoxContainer, title: String, right := "") -> void:
	var h := WorldCard._row(6)
	var t := HudTheme.title(title)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(t)
	if right != "":
		h.add_child(HudTheme.label(right, HudTheme.SMALL, HudTheme.MUTED))
	v.add_child(h)


## Every panel from the feed now, then the layout.
func refresh() -> void:
	if feed == null or band == null:
		return
	band.refresh()
	_squads()
	_season()
	_events()
	var sel := screen.map.selected
	var show_card := sel != "" and screen.ordering == "" and not WorldGeo.region(sel).is_empty()
	card.visible = show_card
	if show_card:
		var v := _clear(card)
		WorldCard.region_card(v, feed, sel, width("card") - 16, {
			"mode": screen.mode_of(sel), "compact": phone(), "phone": phone(),
			"enter": func() -> void: screen.enter(sel), "march": func() -> void: screen.open_order(sel), "close": func() -> void: screen.select(""),
		})
	order.visible = screen.ordering != ""
	if order.visible:
		WorldCard.order_card(_clear(order), feed, screen.map.squad_at, screen.ordering, width("order") - 16, {
			"send": func() -> void: screen.send_order(), "cancel": func() -> void: screen.close_order(), "phone": phone(),
		})
	toast.visible = _toast_t > 0
	if toast.visible:
		var v := _clear(toast)
		var l := WorldCard._wrap(_toast_text, width("toast") - 16)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(l)
	lay()


func _squads() -> void:
	var v := _clear(squads)
	var w := width("squads") - 16
	_head(v, "Your men")
	var sq: Array = feed.view.get("squads", [])
	var road: Variant = feed.transit[0] if not feed.transit.is_empty() else null
	if not sq.is_empty():
		var s: Dictionary = sq[0]
		var b := Button.new()
		b.focus_mode = Control.FOCUS_NONE
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.text = "%s  ·  %d men" % [WorldGeo.region_name(s["region"]), int(s["men"])]
		b.tooltip_text = "Select them: the lands they can march to glow"
		b.custom_minimum_size = Vector2(w, 30)
		b.clip_text = true
		if screen.map.squad_at == s["region"]:
			HudTheme.slot_on(b, true)
		b.pressed.connect(func() -> void: screen.select(s["region"]))
		v.add_child(b)
		var parts := []
		for c in s.get("classes", {}):
			parts.append("%d %s" % [int(s["classes"][c]), HudWords.class_name_of(c).to_lower()])
		if not parts.is_empty():
			v.add_child(WorldCard._wrap(", ".join(parts), w, HudTheme.MUTED))
	if road != null:
		var r := WorldCard._row(6)
		var l := HudTheme.label("%s → %s" % [WorldGeo.region_name(road["from"]), WorldGeo.region_name(road["to"])], HudTheme.BODY)
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		l.clip_text = true
		l.custom_minimum_size = Vector2(40, 0)
		r.add_child(l)
		var queued: bool = road["state"] == "queued"
		r.add_child(HudTheme.label("waiting: full" if queued else WorldGeo.clock(maxi(0, ceili((road["arriveAt"] - feed.now_ms()) / 1000.0))), HudTheme.BODY, HudTheme.BAD if queued else HudTheme.INK, HudTheme.bold_font()))
		v.add_child(r)
	if sq.is_empty() and road == null:
		v.add_child(WorldCard._wrap("Enter your home to bring them onto the field.", w, HudTheme.MUTED))
	var tap := "Tap" if phone() else "Click"
	var hint := "Everyone travels together." if road != null else "%s them, then a glowing land to march." % tap
	if mode == "desktop" and road == null:
		hint += " Double-click any land to enter it."
	v.add_child(WorldCard._wrap(hint, w, HudTheme.MUTED))


func _season() -> void:
	var v := _clear(season)
	var w := width("season") - 16
	var snap: Dictionary = feed.view.get("snap", {})
	_head(v, "Season", _left_text())
	var scores = feed.view.get("scores")
	var rows := WorldGeo.standings(snap.get("regions", []))
	rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return (scores[a["id"]] > scores[b["id"]]) if scores is Array else (a["rate"] > b["rate"]))
	var grid := GridContainer.new()
	var towns := mode != "portrait"
	grid.columns = 5 if towns else 4
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 3)
	grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for hd in ["", "Alliance", "Land", "/h"] + (["Towns"] if towns else []):
		var l := HudTheme.label(hd, HudTheme.SMALL, HudTheme.MUTED)
		l.tooltip_text = {"Land": "Land held so far: each hour, Omphalos counts 10, a frontier town 3, a gate 2, other land 1", "/h": "What the land held now adds each hour", "Towns": "Market towns held"}.get(hd, "")
		l.mouse_filter = Control.MOUSE_FILTER_PASS if l.tooltip_text != "" else Control.MOUSE_FILTER_IGNORE
		if hd != "" and hd != "Alliance":
			l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		grid.add_child(l)
	for r in rows:
		var a: int = r["id"]
		var me: bool = a == feed.you
		var ic := TextureRect.new()
		ic.texture = WorldCard.banner(a)
		ic.custom_minimum_size = Vector2(12, 17)
		ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		ic.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		grid.add_child(ic)
		var n := HudTheme.label(WorldGeo.alliance_name(a) + (" (you)" if me and mode == "desktop" else ""), HudTheme.BODY, HudTheme.GOLD if me else HudTheme.INK, HudTheme.bold_font() if me else null)
		n.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(n)
		for t in [str(int(scores[a])) if scores is Array else "—", "+%d" % r["rate"]] + ([str(r["towns"])] if towns else []):
			var l := HudTheme.label(t, HudTheme.BODY, HudTheme.GOOD if t.begins_with("+") else HudTheme.INK)
			l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			grid.add_child(l)
	v.add_child(grid)
	var holder := int(feed.regions.get("omphalos", {}).get("owner", -1))
	v.add_child(WorldCard._wrap("Omphalos: %s" % ("held by " + WorldGeo.alliance_name(holder) if holder >= 0 else "unclaimed"), w, HudTheme.INK))
	var heg = snap.get("score", {}).get("hegemony")
	if heg is Dictionary:
		v.add_child(WorldCard._wrap("%s wins in %s unless someone retakes a town" % [WorldGeo.alliance_name(int(heg["alliance"])), WorldGeo.clock(maxi(0, int((heg["endsAt"] - feed.now_ms()) / 1000.0)))], w, HudTheme.GOLD))
	if mode == "desktop":
		v.add_child(WorldCard._wrap("Hold Omphalos and 3 of the 4 frontier towns for 24 h to win early. Otherwise the most land wins on day 28.", w, HudTheme.MUTED))


## The season's time left: "9d 4:00:00 left"; "" with no clock.
func _left_text() -> String:
	var ends = feed.view.get("endsAt")
	if ends == null:
		return ""
	return "%s left" % WorldGeo.span(maxi(0, int((ends - feed.now_ms()) / 1000.0)))


func _events() -> void:
	var v := _clear(events)
	var w := width("events") - 16
	_head(v, "World events", "one every ~3 h" if mode == "desktop" else "")
	var now := feed.now_ms()
	var any := false
	for e in feed.events:
		if e["endAt"] <= now:
			continue
		any = true
		var row := WorldCard.event_row(e, now, w, mode == "desktop")
		row.add_child(HudTheme.label(WorldGeo.region_name(e["region"]), HudTheme.BODY))
		row.move_child(row.get_child(row.get_child_count() - 1), 1)
		var p := PanelContainer.new()
		var sb := StyleBoxEmpty.new()
		p.add_theme_stylebox_override("panel", sb)
		p.tooltip_text = "Show it on the map"
		p.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		var region: String = e["region"]
		p.gui_input.connect(func(ev: InputEvent) -> void:
			if (ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT) or (ev is InputEventScreenTouch and ev.pressed):
				screen.select(region, true))
		p.add_child(row)
		v.add_child(p)
	if not any:
		v.add_child(HudTheme.label("All quiet on the map", HudTheme.BODY, HudTheme.MUTED))
	var nx = feed.next_event()
	if nx is Dictionary:
		var name: String = GameData.table("src/war/world/events")["EVENT_INFO"][nx["kind"]]["name"]
		v.add_child(WorldCard._wrap("Next: %s in %s, %s" % [name, WorldGeo.clock(maxi(0, ceili((nx["startAt"] - now) / 1000.0))), WorldGeo.region_name(nx["region"])], w, HudTheme.MUTED))


## Place the panels for the current mode.
func lay() -> void:
	band.lay(frame_art.x)
	var box := func(id: String) -> Dictionary:
		var c: PanelContainer = get(id)
		var w := width(id)
		return {"id": id, "w": w, "h": settle(c, w), "node": c}
	var st := {}
	var bc := []
	if mode == "portrait":
		st["tl"] = [box.call("squads")]
		st["tr"] = [box.call("season")]
		bc.append(box.call("order") if order.visible else box.call("card") if card.visible else box.call("events"))
	else:
		st["tl"] = [box.call("squads")]
		st["bl"] = [box.call("events")]
		st["tr"] = [box.call("card") if card.visible else box.call("season")]
		if order.visible:
			bc.append(box.call("order"))
	if toast.visible:
		bc.append(box.call("toast"))
	st["bc"] = bc
	placed = HudLayout.solve(frame_art, st, band_h + 6.0, band_h + 6.0)
	for n in ["squads", "season", "events", "card", "order", "toast"]:
		get(n).visible = false
	for z in st:
		for b in st[z]:
			var c: Control = b["node"]
			var p: Dictionary = placed[b["id"]]
			c.visible = not p["off"]
			c.position = p["rect"].position.round()
			c.size = p["rect"].size
	placed["band"] = {"rect": Rect2(0, 0, frame_art.x, band_h), "off": false}


## A panel's height at width w once its wrapping words have their width: its containers are sorted now (not on the
## next frame), so the height asked is the height drawn.
static func settle(c: Control, w: float) -> float:
	for i in 3:
		c.size = Vector2(w, c.get_combined_minimum_size().y)
		_sort(c)
	return c.get_combined_minimum_size().y


static func _sort(n: Node) -> void:
	if n is Container:
		n.notification(Container.NOTIFICATION_SORT_CHILDREN)
	for c in n.get_children():
		_sort(c)


## The visible panels' rects (art px) by id, the band apart, for the overlap tests.
func rects() -> Dictionary:
	var out := {}
	for id in placed:
		if not placed[id]["off"] and id != "band":
			out[id] = placed[id]["rect"]
	return out


## The map's free margins (screen px) for the fit: the band, 200 art px each side as the TS screen keeps for its
## columns (the map's edge may pass under them), portrait: the top panels and the bottom one.
func free_px() -> Dictionary:
	var top := band_h + 6.0
	if mode != "portrait":
		return {"top": top * ui_scale, "left": 200.0 * ui_scale, "right": 200.0 * ui_scale, "bottom": 12.0}
	var left := 0.0
	var right := 0.0
	var bottom := 6.0
	for id in placed:
		var p: Dictionary = placed[id]
		if p["off"] or id in ["band", "toast", "order", "card"]:
			continue
		var r: Rect2 = p["rect"]
		if mode == "portrait":
			if r.position.y < frame_art.y / 2.0:
				top = maxf(top, r.end.y + 6.0)
			else:
				bottom = maxf(bottom, frame_art.y - r.position.y + 6.0)
		elif r.get_center().x < frame_art.x / 2.0:
			left = maxf(left, r.end.x + 6.0)
		else:
			right = maxf(right, frame_art.x - r.position.x + 6.0)
	return {"top": top * ui_scale, "left": left * ui_scale, "right": right * ui_scale, "bottom": bottom * ui_scale}


func over_hud() -> bool:
	var c := get_viewport().gui_get_hovered_control()
	return c != null and c != self


## The top strip: "World map", the season and his alliance at the left; the season's time left on the plaque;
## Roads and Fit at the right.
class Band extends Control:
	var hud: WorldHud
	var _left: HBoxContainer
	var _plaque: PanelContainer
	var _clock: Label
	var _right: HBoxContainer
	var _roads: Button

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_STOP
		_left = WorldCard._row(8)
		_left.position = Vector2(8, 4)
		add_child(_left)
		_plaque = PanelContainer.new()
		var pb := HudTheme.panel_box(0.96)
		pb.content_margin_top = 2
		pb.content_margin_bottom = 3
		pb.content_margin_left = 14
		pb.content_margin_right = 14
		_plaque.add_theme_stylebox_override("panel", pb)
		_plaque.tooltip_text = "Time left in this season"
		_clock = HudTheme.title("", 15)
		_plaque.add_child(_clock)
		add_child(_plaque)
		_right = WorldCard._row(4)
		add_child(_right)
		if not hud.phone():
			_roads = HudTheme.slot("trade-wagon", "Trade roads", "Show the trade roads", "T", 24, func() -> void: hud.screen.toggle_routes())
			_right.add_child(_roads)
		_right.add_child(HudTheme.slot("act-move", "Fit the map", "See the whole map", "" if hud.phone() else "F", 24, func() -> void: hud.screen.fit()))

	func refresh() -> void:
		if _left == null:
			return
		for c in _left.get_children():
			_left.remove_child(c)
			c.queue_free()
		_left.add_child(HudTheme.title("World map", 15))
		var snap: Dictionary = hud.feed.view.get("snap", {})
		if not hud.phone():
			_left.add_child(HudTheme.label("Season %d" % int(snap.get("season", 0)), HudTheme.SMALL, HudTheme.MUTED))
		var you = hud.feed.you
		if you != null:
			_left.add_child(WorldCard.swatch(you))
			_left.add_child(HudTheme.label(WorldGeo.alliance_name(you), HudTheme.BODY, HudTheme.INK, HudTheme.bold_font()))
		_clock.text = hud._left_text()
		if _roads:
			HudTheme.slot_on(_roads, hud.screen.map.routes)

	func lay(w: float) -> void:
		size = Vector2(w, hud.band_h)
		var pm := _plaque.get_combined_minimum_size()
		_plaque.size = pm
		_plaque.position = Vector2(roundf((w - pm.x) / 2.0), 0)
		var rm := _right.get_combined_minimum_size()
		_right.size = rm
		_right.position = Vector2(w - rm.x - 4, 3)
		# the words give way before they would meet the plaque
		var room := _plaque.position.x - 14
		var x := 8.0
		for c in _left.get_children():
			x += c.get_combined_minimum_size().x + 8
			c.visible = x <= room

	## The plaque's rect (art px), which hangs below the strip.
	func plaque_rect() -> Rect2:
		return Rect2(_plaque.position, _plaque.get_combined_minimum_size())

	func _draw() -> void:
		draw_rect(Rect2(0, 0, size.x, hud.band_h), HudTheme.GLASS)
		draw_line(Vector2(0, hud.band_h - 0.5), Vector2(size.x, hud.band_h - 0.5), HudTheme.GOLD_LO, 1.0)
