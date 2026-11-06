## The TS golden traces (npm run traces:godot) are present and readable: the sim port compares against them.
extends TestCase

const DIR := "res://tests/golden"


func test_traces_load() -> void:
	if not DirAccess.dir_exists_absolute(DIR):
		fail("no %s: run npm run traces:godot first" % DIR)
		return
	var files := DirAccess.get_files_at(DIR)
	check(files.size() > 0, "no traces in " + DIR)
	for f in files:
		var t = JSON.parse_string(FileAccess.get_file_as_string(DIR.path_join(f)))
		check(t is Dictionary and t.has("frames") and t["frames"].size() > 0, "bad trace " + f)
