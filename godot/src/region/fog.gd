## Fog of war (W-39, src/war/view/fog.ts) for one team from the live sim's vision: dark over unexplored cells, dimmed over
## explored ones, clear where the team sees. Each vision cell is a mesh piece at its height (its top diamond, its front
## faces down to level 0), painted back to front into an offscreen view without blending, so the front-most surface
## owns each pixel as fog.ts's texel table does; each pixel samples the cells' alphas bilinearly at the surface point it
## shows (soft edges). A new state eases in over EASE seconds. The offscreen fog is laid over the screen.
class_name Fog
extends Node2D

const DARK := 0.93
const DIM := 0.55
const EASE := 0.35
const RGB := Color(8 / 255.0, 10 / 255.0, 16 / 255.0)

var team := -1
var iso: Iso
var _vp: SubViewport
var _cam: Camera2D
var _mesh: MeshInstance2D
var _mat: ShaderMaterial
var _overlay: CanvasLayer
var _cur: ImageTexture
var _prev: ImageTexture
var _state := PackedByteArray()
var _size := Vector3i.ZERO
var _t := 1.0
var _region: Region


func setup(iso_: Iso, region: Region) -> void:
	iso = iso_
	_region = region


## A new fog state per vision cell (0 unexplored, 1 explored, 2 seen) on a grid `size` (cells across, down, tiles each).
func set_state(state: PackedByteArray, size: Vector3i) -> void:
	if size != _size:
		_size = size
		_build()
	if state == _state:
		return
	var img := Image.create_from_data(size.x, size.y, false, Image.FORMAT_R8, state)
	if _state.is_empty():
		_prev.update(img)
	else:
		_prev.update(Image.create_from_data(size.x, size.y, false, Image.FORMAT_R8, _state))
	_cur.update(img)
	_state = state
	_t = 0.0
	_overlay.visible = true


func update_fog(dt: float) -> void:
	if not _vp:
		return
	var main := get_viewport()
	if _vp.size != Vector2i(main.get_visible_rect().size):
		_vp.size = Vector2i(main.get_visible_rect().size)
	var c := main.get_camera_2d()
	_cam.position = c.get_screen_center_position()
	_cam.zoom = c.zoom
	_t = minf(1.0, _t + dt / EASE)
	_mat.set_shader_parameter("t", _t)


func _build() -> void:
	var gw := _size.x
	var gh := _size.y
	var C := _size.z
	var blank := Image.create(gw, gh, false, Image.FORMAT_R8)
	_cur = ImageTexture.create_from_image(blank)
	_prev = ImageTexture.create_from_image(blank)
	_vp = SubViewport.new()
	_vp.world_2d = World2D.new()
	_vp.transparent_bg = true
	_vp.disable_3d = true
	_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_vp.size = Vector2i(get_viewport().get_visible_rect().size)
	add_child(_vp)
	_cam = Camera2D.new()
	_vp.add_child(_cam)
	_cam.make_current()
	_mat = ShaderMaterial.new()
	_mat.shader = load("res://src/region/fog.gdshader")
	_mat.set_shader_parameter("cur", _cur)
	_mat.set_shader_parameter("prev", _prev)
	_mat.set_shader_parameter("grid", Vector2(gw, gh))
	_mat.set_shader_parameter("dark", DARK)
	_mat.set_shader_parameter("dim", DIM)
	_mat.set_shader_parameter("rgb", RGB)
	_mesh = MeshInstance2D.new()
	_mesh.mesh = mesh_of(iso, gw, gh, C)
	_mesh.material = _mat
	_vp.add_child(_mesh)
	_overlay = CanvasLayer.new()
	_overlay.layer = 1
	_overlay.visible = false
	var tr := TextureRect.new()
	tr.texture = _vp.get_texture()
	tr.set_anchors_preset(Control.PRESET_FULL_RECT)
	tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.add_child(tr)
	add_child(_overlay)


## The fog cells as a mesh, back to front: each cell's top diamond at its highest tile's drawn level, its SE and SW
## faces down to level 0; UV is the cell-unit point of the surface a pixel shows (on a face: its top edge's).
static func mesh_of(iso_: Iso, gw: int, gh: int, C: int) -> ArrayMesh:
	var v := PackedVector2Array()
	var uv := PackedVector2Array()
	var idx := PackedInt32Array()
	var quad := func(p: Array, q: Array) -> void:
		var b := v.size()
		for k in 4:
			v.append(p[k])
			uv.append(q[k])
		idx.append_array([b, b + 1, b + 2, b, b + 2, b + 3])
	for s in range(gw + gh - 1):
		for cx in range(maxi(0, s - gh + 1), mini(gw - 1, s) + 1):
			var cy := s - cx
			var x0 := cx * C
			var y0 := cy * C
			var z := 0.0
			for y in range(y0, mini(iso_.h, y0 + C)):
				for x in range(x0, mini(iso_.w, x0 + C)):
					z = maxf(z, iso_.ztop(x, y))
			var N := iso_.world(x0, y0, z)
			var E := iso_.world(x0 + C, y0, z)
			var S := iso_.world(x0 + C, y0 + C, z)
			var W := iso_.world(x0, y0 + C, z)
			var uN := Vector2(cx, cy)
			var uE := Vector2(cx + 1, cy)
			var uS := Vector2(cx + 1, cy + 1)
			var uW := Vector2(cx, cy + 1)
			if z > 0.0:
				var dz := Vector2(0, z * Iso.LH)
				quad.call([E, S, S + dz, E + dz], [uE, uS, uS, uE])
				quad.call([S, W, W + dz, S + dz], [uS, uW, uW, uS])
			quad.call([N, E, S, W], [uN, uE, uS, uW])
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = v
	arr[Mesh.ARRAY_TEX_UV] = uv
	arr[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return m
