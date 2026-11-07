## The minimap (src/war/view/hud/minimap.ts): the whole region in a square well with a bronze frame, turned to the iso
## camera's north so it stands as a diamond; hillshaded terrain and water, buildings by owner, his men and the foes he
## sees, the camera's view. Click or drag it to move the camera there. Redrawn at 4 Hz.
class_name Minimap
extends Control

const TERRAIN := {"grass": Color("#55663a"), "forest": Color("#34482a"), "sand": Color("#a58f5e"), "marsh": Color("#4a5a44"),
	"rock": Color("#6d6a63"), "road": Color("#8d7a5a"), "snow": Color("#d8dbe0"), "dirt": Color("#6e5a3e")}
const WATER := Color("#2e5a78")

var input: RegionInput
var client: WarClient
var region: Region
var side := 168.0
var _tex: ImageTexture
var _t := 0.0
var _drag := false
var team_colors: Array[Color] = []


func build(input_: RegionInput, client_: WarClient, region_: Region, side_: float) -> void:
	input = input_
	client = client_
	region = region_
	side = side_
	custom_minimum_size = Vector2(side, side)
	size = custom_minimum_size
	mouse_filter = Control.MOUSE_FILTER_STOP
	tooltip_text = "The region: click to look there"
	for a in GameData.table("src/war/world/alliances")["ALLIANCES"]:
		team_colors.append(Color(a["color"]))
	_tex = ImageTexture.create_from_image(terrain_image(region))


## The region's terrain, a pixel a tile: terrain colour lit by the height step to the north-west, water blue.
static func terrain_image(r: Region) -> Image:
	var img := Image.create(r.w, r.h, false, Image.FORMAT_RGB8)
	for y in r.h:
		for x in r.w:
			var i := y * r.w + x
			var c: Color
			if r.water_at(i) > 0:
				c = WATER.lightened(0.05 * r.height_at(i))
			else:
				c = TERRAIN.get(Region.TERRAIN[r.terrain_at(i)], Color.DIM_GRAY)
				var hn := r.height_at(i - r.w - 1) if x > 0 and y > 0 else r.height_at(i)
				var d := r.height_at(i) - hn
				c = c.lightened(0.18 * d) if d > 0 else c.darkened(-0.18 * d)
				c = c.lightened(0.025 * r.height_at(i))
			img.set_pixel(x, y, c)
	return img


## Tile point -> point in the well (the diamond), and back.
func to_map(t: Vector2) -> Vector2:
	var inner := side - 14.0
	var k := inner / (region.w + region.h) * 0.98
	return Vector2(7 + inner / 2.0 + (t.x - t.y) * k, 7 + inner / 2.0 + (t.x + t.y - (region.w + region.h) / 2.0) * k)


func to_tile(p: Vector2) -> Vector2:
	var inner := side - 14.0
	var k := inner / (region.w + region.h) * 0.98
	var a := (p.x - 7 - inner / 2.0) / k
	var b := (p.y - 7 - inner / 2.0) / k + (region.w + region.h) / 2.0
	return Vector2(clampf((a + b) / 2.0, 0, region.w), clampf((b - a) / 2.0, 0, region.h))


func _process(dt: float) -> void:
	_t += dt
	if _t > 0.25:
		_t = 0.0
		queue_redraw()


func _gui_input(e: InputEvent) -> void:
	if (e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT) or e is InputEventScreenTouch:
		_drag = e.pressed
		if e.pressed:
			input.focus(to_tile(e.position))
		accept_event()
	elif (e is InputEventMouseMotion and _drag) or e is InputEventScreenDrag:
		input.focus(to_tile(e.position))
		accept_event()


func _draw() -> void:
	var box := HudTheme.panel_box()
	draw_style_box(box, Rect2(Vector2.ZERO, size))
	var well := Rect2(6, 6, side - 12, side - 12)
	draw_rect(well, HudTheme.SUNK)
	# the terrain diamond: tile (x, y) to the well by to_map's linear map
	var o := to_map(Vector2.ZERO)
	var ex := to_map(Vector2(1, 0)) - o
	var ey := to_map(Vector2(0, 1)) - o
	draw_set_transform_matrix(Transform2D(ex, ey, o))
	draw_texture(_tex, Vector2.ZERO)
	draw_set_transform_matrix(Transform2D.IDENTITY)
	var me := client.team()
	for b in client.snap.get("buildings", []):
		var p := to_map(Vector2(b["x"], b["y"]))
		var t := int(b["team"])
		var c := team_colors[t] if t >= 0 and t < team_colors.size() else Color(0.75, 0.7, 0.6)
		draw_rect(Rect2(p - Vector2(2, 2), Vector2(4, 4)), c)
	var squads := {}
	for q in client.snap.get("squads", []):
		squads[int(q["id"])] = q
	for u in client.snap.get("units", []):
		if u["state"] == "dead":
			continue
		var q: Dictionary = squads.get(int(u["squad"]), {})
		var p := to_map(Vector2(u["x"], u["y"]))
		if client.is_mine(q):
			draw_rect(Rect2(p - Vector2(1, 1), Vector2(2.5, 2.5)), Color(0.98, 0.9, 0.55))
		elif int(q.get("team", -1)) == me:
			draw_rect(Rect2(p - Vector2(1, 1), Vector2(2, 2)), Color(0.6, 0.85, 0.5))
		else:
			draw_rect(Rect2(p - Vector2(1, 1), Vector2(2.5, 2.5)), HudTheme.BAD)
	# the camera's view
	if input and input.view:
		var r := input.view_tiles()
		var pts := PackedVector2Array()
		for c in [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y), r.position]:
			pts.append(to_map(c))
		draw_polyline(pts, Color(0.95, 0.9, 0.75, 0.8), 1.0)
	# gold corners
	for c in [Vector2(3, 3), Vector2(side - 3, 3), Vector2(3, side - 3), Vector2(side - 3, side - 3)]:
		draw_rect(Rect2(c - Vector2(3, 3), Vector2(6, 6)), HudTheme.GOLD_LO)
