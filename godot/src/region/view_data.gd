## A region's view data (npm run view:godot, src/dev/godotView.ts): the iso map's visual cells and the art baker's
## per-cell picks, as the Phaser client computes them, plus the atlas of every frame the cells draw. Read from
## res://view/<id>/ (plain files, not Godot resources: the folder has a .gdignore).
class_name ViewData
extends RefCounted

const DIR := "res://view"

var meta: Dictionary
## Visual cells (fw x fh, 2 x 2 per tile).
var fw: int
var fh: int
## Per cell: atlas slot of its frame (-1: none drawn), surface level, four corner levels (N, E, S, W).
var slot: PackedInt32Array
var fz: PackedFloat32Array
var fc: PackedFloat32Array
## Per cell: kind (meta.kinds index), ramp (1: corners not all its level), baked light code, tint code, foam sides,
## wall cuts, wall stone (0 none, else meta.stones index + 1), flags (1 lit water, 2 peat, 4/8 shore cell whose sheet's
## first / second terrain is wet, 16 under the peaks).
var fk: PackedByteArray
var ramp: PackedByteArray
var shade: PackedByteArray
var tint: PackedByteArray
var foam: PackedByteArray
var cut: PackedByteArray
var stone: PackedByteArray
var flags: PackedByteArray
## Per cell: corner shares of a smoothed transition frame in eighths, 4 bits each (NW, NE, SW, SE); 0xffff none.
var corners: PackedByteArray
## Per cell: the water light (RGBA).
var light: PackedByteArray
## Per tile: tile set (meta.sets index), surface level, lowest and highest level units on it are drawn at, and a level
## no point of its surface rises above.
var set_of: PackedByteArray
var z: PackedFloat32Array
var zu: PackedFloat32Array
var zh: PackedFloat32Array
var zm: PackedFloat32Array
var pages: Array[Texture2D] = []


static func load_id(id: String) -> ViewData:
	var d := ViewData.new()
	var dir := DIR.path_join(id)
	d.meta = JSON.parse_string(FileAccess.get_file_as_string(dir.path_join("meta.json")))
	d.fw = int(d.meta["fw"])
	d.fh = int(d.meta["fh"])
	var raw := FileAccess.get_file_as_bytes(dir.path_join("cells.bin")).decompress(int(d.meta["bytes"]), FileAccess.COMPRESSION_GZIP)
	assert(raw.size() == int(d.meta["bytes"]), "%s: cells.bin is %d bytes, not %d" % [id, raw.size(), int(d.meta["bytes"])])
	var n := d.fw * d.fh
	var nt := int(d.meta["w"]) * int(d.meta["h"])
	var at := [0]
	var take := func(bytes: int) -> PackedByteArray:
		var p := raw.slice(at[0], at[0] + bytes)
		at[0] += bytes
		return p
	d.slot = take.call(4 * n).to_int32_array()
	d.fz = take.call(4 * n).to_float32_array()
	d.fc = take.call(16 * n).to_float32_array()
	d.fk = take.call(n)
	d.ramp = take.call(n)
	d.shade = take.call(n)
	d.tint = take.call(n)
	d.foam = take.call(n)
	d.cut = take.call(n)
	d.stone = take.call(n)
	d.flags = take.call(n)
	d.corners = take.call(2 * n)
	d.light = take.call(4 * n)
	d.set_of = take.call(nt)
	d.z = take.call(4 * nt).to_float32_array()
	d.zu = take.call(4 * nt).to_float32_array()
	d.zh = take.call(4 * nt).to_float32_array()
	d.zm = take.call(4 * nt).to_float32_array()
	assert(at[0] == raw.size(), "%s: %d of %d bytes read" % [id, at[0], raw.size()])
	for k in int(d.meta["pages"]):
		d.pages.append(image_texture(dir.path_join("atlas%d.png" % k)))
	return d


## Cell i's corner shares (see `corners`).
func corners_at(i: int) -> int:
	return corners.decode_u16(2 * i)


## A plain PNG under res://view as a texture.
static func image_texture(path: String) -> ImageTexture:
	var img := Image.load_from_file(ProjectSettings.globalize_path(path))
	assert(img != null, "cannot read " + path)
	return ImageTexture.create_from_image(img)
