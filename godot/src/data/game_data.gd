## The game's tables, exported from the TS source by `npm run data:godot` (scripts/godot/data.mjs) into res://data.
## table("src/war/sim/economy") is that module's JSON-safe exports by name. JSON numbers arrive as floats: int() them
## where the TS code relies on integers.
class_name GameData
extends RefCounted

const DIR := "res://data"

static var _tables := {}
static var _manifest := {}


static func table(name: String) -> Dictionary:
	if not _tables.has(name):
		var t = _read(DIR.path_join("tables").path_join(name + ".json"))
		assert(t is Dictionary, "no table " + name)
		_tables[name] = t
	return _tables[name]


## What the exporter wrote: table export kinds, region sizes, sha256 and sample tiles.
static func manifest() -> Dictionary:
	if _manifest.is_empty():
		_manifest = _read(DIR.path_join("manifest.json"))
	return _manifest


static func _read(path: String) -> Variant:
	return JSON.parse_string(FileAccess.get_file_as_string(path))
