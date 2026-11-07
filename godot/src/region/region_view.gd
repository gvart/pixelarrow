## The iso region view (docs/impl/godot-port.md P9): the ground (Ground), the map objects and the units sorted by depth
## (Objects, Units), the fog of war (Fog) from a live C++ Sim, and an RTS camera. Command line (after `--`):
##   --region <id>          region (default elaia)
##   --at <x>,<y>           tile point the camera centres on; --zoom <z> (default 1)
##   --spawn <name>         a seeded scenario on the live sim (RegionView.SCENARIOS)
##   --ticks <n>            play the scenario n ticks before the first frame
##   --shot <png>           render, wait for the ground, save the viewport and quit; --wait <frames> before it
##   --bench <seconds>      log frame times for that long, then quit
class_name RegionView
extends Node2D

const SIM_HZ := 10.0

var region: Region
var d: ViewData
var iso: Iso
var ground: Ground
var objects: Objects
var units: Units
var fog: Fog
var cam: Camera2D
var sim: Sim
var scenario: Scenario
var _acc := 0.0
var _args := {}
## Bench: us spent in the ground, objects and units updates, and frames counted.
var _parts := [0, 0, 0, 0]


func _ready() -> void:
	_args = _parse(OS.get_cmdline_user_args())
	var id: String = _args.get("region", "elaia")
	region = Region.load_id(id)
	d = ViewData.load_id(id)
	iso = Iso.of(d)
	RenderingServer.set_default_clear_color(Color(0.04, 0.05, 0.07))
	ground = Ground.new()
	ground.setup(d, iso)
	add_child(ground)
	objects = Objects.new()
	objects.z_index = 1000
	add_child(objects)
	objects.setup(region, iso)
	units = Units.new()
	objects.add_child(units)
	units.setup(iso, objects)
	fog = Fog.new()
	fog.z_index = 2000
	add_child(fog)
	fog.setup(iso, region)
	cam = Camera2D.new()
	add_child(cam)
	cam.make_current()
	var at: PackedStringArray = String(_args.get("at", "%f,%f" % [region.w / 2.0, region.h / 2.0])).split(",")
	focus(float(at[0]), float(at[1]), float(_args.get("zoom", "1")))
	var spawn: String = _args.get("spawn", "")
	if spawn != "":
		scenario = Scenario.make(spawn, region, Vector2(float(at[0]), float(at[1])))
		sim = scenario.sim
		units.classes = scenario.classes
		units.teams = scenario.teams
		fog.team = scenario.fog_team
		# --ticks n: the scenario played n ticks ahead (shots of a fight under way)
		for k in int(_args.get("ticks", "0")):
			scenario.step()
			if k >= int(_args["ticks"]) - 2:
				_snap()
		_snap()
	if _args.has("shot"):
		_shot.call_deferred(_args["shot"], int(_args.get("wait", "30")))
	elif _args.has("bench"):
		_bench.call_deferred(float(_args["bench"]))


## Centre the camera on a tile point (at its level), zoomed.
func focus(x: float, y: float, zoom: float) -> void:
	cam.zoom = Vector2(zoom, zoom)
	cam.position = Vector2(iso.sx(x, y), iso.sy(x, y, iso.z_at(x, y)))


## The world rect the camera shows.
func view_rect() -> Rect2:
	var size := get_viewport_rect().size / cam.zoom
	return Rect2(cam.get_screen_center_position() - size / 2.0, size)


func _process(dt: float) -> void:
	_camera_keys(dt)
	if sim:
		_acc += dt
		var steps := 0
		while _acc >= 1.0 / SIM_HZ and steps < 3:
			_acc -= 1.0 / SIM_HZ
			scenario.step()
			_snap()
			steps += 1
		units.alpha = clampf(_acc * SIM_HZ, 0.0, 1.0)
	var view := view_rect()
	var t0 := Time.get_ticks_usec()
	ground.update_view(view)
	var t1 := Time.get_ticks_usec()
	objects.update_view(view, cam.zoom.x)
	var t2 := Time.get_ticks_usec()
	units.draw_units(view, cam.zoom.x, Time.get_ticks_msec())
	var t3 := Time.get_ticks_usec()
	fog.update_fog(dt)
	_parts[0] += t1 - t0
	_parts[1] += t2 - t1
	_parts[2] += t3 - t2
	_parts[3] += 1


func _snap() -> void:
	var snap := sim.digest()
	units.push(snap, int(snap["tick"]))
	if fog.team >= 0:
		fog.set_state(sim.fog_state(fog.team), sim.fog_size())


func _camera_keys(dt: float) -> void:
	var v := Vector2.ZERO
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		v.x -= 1
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		v.x += 1
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		v.y -= 1
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		v.y += 1
	cam.position += v * dt * 900.0 / cam.zoom.x


func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.pressed and (e.button_index == MOUSE_BUTTON_WHEEL_UP or e.button_index == MOUSE_BUTTON_WHEEL_DOWN):
		var ladder := [0.5, 1.0, 2.0, 3.0]
		var k := ladder.find(cam.zoom.x)
		k = clampi((k if k >= 0 else 1) + (1 if e.button_index == MOUSE_BUTTON_WHEEL_UP else -1), 0, ladder.size() - 1)
		cam.zoom = Vector2(ladder[k], ladder[k])
	elif e is InputEventMouseMotion and e.button_mask & (MOUSE_BUTTON_MASK_LEFT | MOUSE_BUTTON_MASK_MIDDLE):
		cam.position -= e.relative / cam.zoom.x


## Wait for the ground over the view, `frames` more, save the viewport as PNG, quit.
func _shot(path: String, frames: int) -> void:
	for k in 600:
		ground.update_view(view_rect(), true)
		if ground.missing == 0:
			break
		await get_tree().process_frame
	for k in frames:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(path)
	print("shot ", path, " ", img.get_size())
	get_tree().quit()


## Frame times over `secs`: mean, p95, worst (ms) and fps, with the sim's step time and unit count.
func _bench(secs: float) -> void:
	for k in 120:
		ground.update_view(view_rect(), true)
		await get_tree().process_frame
	var times := PackedFloat32Array()
	var t_end := Time.get_ticks_msec() + secs * 1000.0
	_parts = [0, 0, 0, 0]
	var last := Time.get_ticks_usec()
	while Time.get_ticks_msec() < t_end:
		await get_tree().process_frame
		var now := Time.get_ticks_usec()
		times.append((now - last) / 1000.0)
		last = now
	var sorted := times.duplicate()
	sorted.sort()
	var mean := 0.0
	for t in times:
		mean += t
	mean /= times.size()
	print("bench: %d frames, mean %.2f ms (%.1f fps), p95 %.2f ms, worst %.2f ms; units %d drawn %d; sim step %.2f ms; process %.2f ms" % [times.size(), mean, 1000.0 / mean, sorted[int(sorted.size() * 0.95)], sorted[-1], units.count, units.drawn, scenario.step_ms if scenario else 0.0, Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0])
	print("bench parts (ms a frame): ground %.2f, objects %.2f, units %.2f" % [_parts[0] / 1000.0 / _parts[3], _parts[1] / 1000.0 / _parts[3], _parts[2] / 1000.0 / _parts[3]])
	get_tree().quit()


static func _parse(a: PackedStringArray) -> Dictionary:
	var out := {}
	var k := 0
	while k < a.size():
		if a[k].begins_with("--"):
			var key := a[k].substr(2)
			if k + 1 < a.size() and not a[k + 1].begins_with("--"):
				out[key] = a[k + 1]
				k += 1
			else:
				out[key] = ""
		k += 1
	return out
