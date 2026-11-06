## Headless test runner: every res://tests/**/test_*.gd, every method named test_*.
## Usage: godot --headless --path godot -s res://tests/run.gd
## A test fails by calling fail(msg) on its TestCase; the process exits 1 on any failure.
extends SceneTree


func _init() -> void:
	var failed := 0
	var passed := 0
	for path in _find("res://tests"):
		var script: GDScript = load(path)
		for m in script.get_script_method_list():
			var name: String = m["name"]
			if not name.begins_with("test_"):
				continue
			var t: TestCase = script.new()
			t.call(name)
			if t.failures.is_empty():
				passed += 1
			else:
				failed += 1
				for f in t.failures:
					printerr("FAIL %s::%s: %s" % [path.get_file(), name, f])
	print("%d passed, %d failed" % [passed, failed])
	quit(1 if failed > 0 else 0)


func _find(dir: String) -> PackedStringArray:
	var out := PackedStringArray()
	for d in DirAccess.get_directories_at(dir):
		out.append_array(_find(dir.path_join(d)))
	for f in DirAccess.get_files_at(dir):
		if f.begins_with("test_") and f.ends_with(".gd"):
			out.append(dir.path_join(f))
	return out
