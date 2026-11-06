## A region map (src/war/types.ts RegionData): `meta` holds every field but the three layers, which are read per tile
## from `cells`, one little-endian u16 per tile: height | terrain << 4 | water << 7 (src/war/region/compact.ts).
class_name Region
extends RefCounted

## Index order of the terrain bits (src/war/region/compact.ts TERRAIN).
const TERRAIN := ["grass", "forest", "sand", "marsh", "rock", "road", "snow", "dirt"]

var id: String
var w: int
var h: int
var meta: Dictionary
var cells: PackedByteArray


static func load_id(region_id: String) -> Region:
	var dir := GameData.DIR.path_join("regions")
	var r := Region.new()
	r.meta = GameData.read_exact(dir.path_join(region_id + ".json"))
	r.cells = FileAccess.get_file_as_bytes(dir.path_join(region_id + ".cells"))
	r.id = r.meta["id"]
	r.w = int(r.meta["w"])
	r.h = int(r.meta["h"])
	assert(r.cells.size() == r.w * r.h * 2, "%s: %d bytes of cells for %dx%d" % [region_id, r.cells.size(), r.w, r.h])
	return r


func height_at(i: int) -> int:
	return cells.decode_u16(i * 2) & 15


func terrain_at(i: int) -> int:
	return (cells.decode_u16(i * 2) >> 4) & 7


func water_at(i: int) -> int:
	return cells.decode_u16(i * 2) >> 7


## The movement grid of this region (the C++ sim's Grid, godot/native/src/grid.h).
func grid() -> Grid:
	return Grid.build(cells, w, h, meta, GameData.table("src/war/region/objects")["OBJECT_BLOCKS"])
