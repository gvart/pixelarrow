## Base for tests (run by res://tests/run.gd).
class_name TestCase
extends RefCounted

var failures: PackedStringArray = []


func fail(msg: String) -> void:
	failures.append(msg)


func check(ok: bool, msg: String) -> void:
	if not ok:
		fail(msg)
