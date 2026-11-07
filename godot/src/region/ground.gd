## A region's ground: chunks of 32 x 32 visual cells as meshes (GroundMesh), built on demand round the camera within a
## time budget per frame, drawn back to front (chunk x + y ascending: a chunk's cliffs and sides overhang only chunks
## painted after it), the far ones freed (an LRU pool, as the Phaser scene's chunk canvases).
class_name Ground
extends Node2D

const CHUNK := 32
## Chunks kept built.
const POOL := 160
## Ms of chunk building per frame (at least one chunk is built).
const BUDGET_MS := 6.0

var d: ViewData
var iso: Iso
var painter: GroundMesh
var material_: ShaderMaterial
## key -> [MeshInstance2D or null (nothing to draw), last frame used]
var _chunks := {}
var _frame := 0
## Chunks over the view not built yet (0: the view is fully drawn; for the shot and bench scripts).
var missing := 0


func setup(data: ViewData, iso_: Iso) -> void:
	d = data
	iso = iso_
	painter = GroundMesh.new(d, iso, CHUNK)
	material_ = ShaderMaterial.new()
	material_.shader = load("res://src/region/ground.gdshader")
	material_.set_shader_parameter("atlas0", d.pages[0])
	material_.set_shader_parameter("atlas1", d.pages[1] if d.pages.size() > 1 else d.pages[0])
	var stones: Array = d.meta["stones"]
	for k in stones.size():
		material_.set_shader_parameter("stone%d" % k, ViewData.image_texture(ViewData.DIR.path_join("stones/%s.png" % stones[k])))


## The chunks whose cells can show in world rect `view` (their tops up to iso.top levels and their cliffs below).
func chunks_over(view: Rect2) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	var nc := ceili(float(d.fw) / CHUNK)
	var nr := ceili(float(d.fh) / CHUNK)
	# cell (x, y) at level z draws at u = x - y (px OX + u * 16), v = x + y (px OY + v * 8 - z * LH, up to 2 * LH more below)
	var u0 := floori((view.position.x - iso.ox) / 16.0) - 2
	var u1 := ceili((view.end.x - iso.ox) / 16.0) + 2
	var v0 := floori((view.position.y - iso.oy - 3.0 * Iso.LH) / 8.0) - 2
	var v1 := ceili((view.end.y - iso.oy + (iso.top + 2.0) * Iso.LH) / 8.0) + 2
	var cx0 := maxi(0, floori((u0 + v0) / 2.0 / CHUNK))
	var cx1 := mini(nc - 1, floori((u1 + v1) / 2.0 / CHUNK))
	var cy0 := maxi(0, floori((v0 - u1) / 2.0 / CHUNK))
	var cy1 := mini(nr - 1, floori((v1 - u0) / 2.0 / CHUNK))
	for cy in range(cy0, cy1 + 1):
		for cx in range(cx0, cx1 + 1):
			# the chunk's cells' u and v ranges against the view's
			var cu0 := (cx - cy - 1) * CHUNK
			var cu1 := (cx - cy + 1) * CHUNK
			var cv0 := (cx + cy) * CHUNK
			var cv1 := (cx + cy + 2) * CHUNK
			if cu1 < u0 or cu0 > u1 or cv1 < v0 or cv0 > v1:
				continue
			out.append(Vector2i(cx, cy))
	return out


## Build what the view needs (nearest the middle first, within the budget; `all`: every one now) and free the oldest.
func update_view(view: Rect2, all := false) -> void:
	_frame += 1
	var want := chunks_over(view)
	var mid := view.get_center()
	var todo: Array[Vector2i] = []
	for c in want:
		var key := GroundMesh.chunk_key(c.x, c.y)
		if _chunks.has(key):
			_chunks[key][1] = _frame
		else:
			todo.append(c)
	todo.sort_custom(func(a: Vector2i, b: Vector2i) -> bool: return _dist(a, mid) < _dist(b, mid))
	var t0 := Time.get_ticks_usec()
	var built := 0
	for c in todo:
		if not all and built > 0 and (Time.get_ticks_usec() - t0) / 1000.0 > BUDGET_MS:
			break
		_build(c)
		built += 1
	missing = todo.size() - built
	if _chunks.size() > POOL:
		var keys := _chunks.keys()
		keys.sort_custom(func(a: int, b: int) -> bool: return _chunks[a][1] < _chunks[b][1])
		for k in keys.slice(0, _chunks.size() - POOL):
			if _chunks[k][1] == _frame:
				break
			if _chunks[k][0]:
				_chunks[k][0].queue_free()
			_chunks.erase(k)


func _dist(c: Vector2i, mid: Vector2) -> float:
	var x := (c.x + 0.5) * CHUNK / 2.0
	var y := (c.y + 0.5) * CHUNK / 2.0
	return Vector2(iso.sx(x, y), iso.sy(x, y, 0)).distance_squared_to(mid)


func _build(c: Vector2i) -> void:
	var mesh := painter.build(c.x * CHUNK, c.y * CHUNK, CHUNK)
	var node: MeshInstance2D = null
	if mesh:
		node = MeshInstance2D.new()
		node.mesh = mesh
		node.material = material_
		node.texture = d.pages[0]
		node.z_index = c.x + c.y
		node.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		add_child(node)
	_chunks[GroundMesh.chunk_key(c.x, c.y)] = [node, _frame]
