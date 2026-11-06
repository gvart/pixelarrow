## The game's tables, exported from the TS source by `npm run data:godot` (scripts/godot/data.mjs) into res://data.
## table("src/war/sim/economy") is that module's JSON-safe exports by name. JSON numbers arrive as floats: int() them
## where the TS code relies on integers. Long floats come as {"f64": hex} (src/dev/godotJson.ts) and `exact` restores them.
class_name GameData
extends RefCounted

const DIR := "res://data"

static var _tables := {}
static var _manifest := {}


static func table(name: String) -> Dictionary:
	if not _tables.has(name):
		var t = read_exact(DIR.path_join("tables").path_join(name + ".json"))
		assert(t is Dictionary, "no table " + name)
		_tables[name] = t
	return _tables[name]


## What the exporter wrote: table export kinds, region sizes, sha256 and sample tiles.
static func manifest() -> Dictionary:
	if _manifest.is_empty():
		_manifest = _read(DIR.path_join("manifest.json"))
	return _manifest


## A JSON file written by src/dev/godotJson.ts exactJson, with its floats restored bit for bit.
static func read_exact(path: String) -> Variant:
	return exact(_read(path))


## Replaces every {"f64": "<16 hex>"} in v (recursively) by that exact double.
static func exact(v: Variant) -> Variant:
	if v is Dictionary:
		if v.size() == 1 and v.has("f64"):
			return f64(v["f64"])
		for k in v:
			v[k] = exact(v[k])
	elif v is Array:
		for i in v.size():
			v[i] = exact(v[i])
	return v


## The double whose big-endian IEEE 754 bits are these 16 hex digits.
static func f64(hex: String) -> float:
	var b := hex.hex_decode()
	b.reverse()
	return b.decode_double(0)


static func _read(path: String) -> Variant:
	return JSON.parse_string(FileAccess.get_file_as_string(path))
