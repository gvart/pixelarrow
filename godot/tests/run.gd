## Headless test runner: every res://tests/**/test_*.gd, every method named test_*.
## Usage: godot --headless --path godot -s res://tests/run.gd [-- <part of a file path> ...]  (only those files)
## A test fails by calling fail(msg) on its TestCase, or by raising any engine or script error while it runs (a
## runtime error aborts the method without a fail() call); the process exits 1 on any failure.
extends SceneTree


## Counts every error the engine logs, so a test that dies mid-way can't pass.
class Errors extends Logger:
	var seen := PackedStringArray()

	func _log_error(function: String, file: String, line: int, code: String, rationale: String, _editor_notify: bool, _error_type: int, _script_backtraces: Array[ScriptBacktrace]) -> void:
		seen.append("%s (%s:%d %s)" % [rationale if rationale != "" else code, file.get_file(), line, function])


var _ran := false


## The tests run on the first frame, once the root is in the tree (a test may put nodes under it).
func _process(_delta: float) -> bool:
	if not _ran:
		_ran = true
		_run()
	return false


func _run() -> void:
	var errors := Errors.new()
	OS.add_logger(errors)
	var failed := 0
	var passed := 0
	var only := OS.get_cmdline_user_args()
	for path in _find("res://tests"):
		if not only.is_empty() and not Array(only).any(func(o: String) -> bool: return o in path):
			continue
		var script: GDScript = load(path)
		if script == null or not script.can_instantiate():
			failed += 1
			printerr("FAIL %s: the script does not load (parse error above)" % path.get_file())
			continue
		for m in script.get_script_method_list():
			var name: String = m["name"]
			if not name.begins_with("test_"):
				continue
			var t: TestCase = script.new()
			errors.seen.clear()
			t.call(name)
			for e in errors.seen:
				t.failures.append("error: " + e)
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
