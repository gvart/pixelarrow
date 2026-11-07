## A man's look on the map (src/war/view/look.ts): lookOf seeded from his person id (a class spawn: `unit:<id>`), his
## tier from his level, and the GPU recolour (src/war/view/lookShader.ts): his class's block of the palette texture
## (godot/view/look.json, look.bin, exported by src/dev/godotLook.ts) maps each colour-group pixel to his colour, any
## other saturated red takes his team's dye, then the team multiply. One material for every look sprite: a sprite
## carries its look in its modulate (look_color), so the men of all classes and teams batch per sheet.
class_name Look
extends RefCounted

const M32 := 0xFFFFFFFF
const FOLKS := ["greek", "phoenician", "celtic", "thracian"]

## look.json: palette size, rows per class, variants per group, class -> block, the lookOf tables.
static var data := {}
static var _palette: ImageTexture
static var _material: ShaderMaterial


static func load_data() -> bool:
	if not data.is_empty():
		return true
	var p := ViewData.DIR.path_join("look.json")
	if not FileAccess.file_exists(p):
		return false
	data = JSON.parse_string(FileAccess.get_file_as_string(p))
	return true


## look.ts hash32 (FNV-1a over the UTF-16 code units; ids are ASCII).
static func hash32(s: String) -> int:
	var h := 0x811c9dc5
	for i in s.length():
		h = ((h ^ s.unicode_at(i)) * 0x01000193) & M32
	return h


## Math.imul as an unsigned 32-bit product.
static func imul(a: int, b: int) -> int:
	a &= M32
	b &= M32
	return (a * (b & 0xFFFF) + (((a * (b >> 16)) & 0xFFFF) << 16)) & M32


## look.ts draw: the k-th uniform number in [0, 1) of a seed.
static func draw(h: int, k: int) -> float:
	var x := imul(h ^ imul(k + 1, 0x9e3779b9), 0x85ebca6b)
	x ^= x >> 13
	x = imul(x, 0xc2b2ae35)
	x ^= x >> 16
	return float(x) / 4294967296.0


static func _pick(w: Array, u: float) -> int:
	var sum := 0.0
	for v in w:
		sum += v
	var acc := 0.0
	for i in w.size():
		acc += w[i]
		if u * sum < acc:
			return i
	return w.size() - 1


## look.ts tierOf without gear: by level (1-3 basic, 4-7 veteran, 8+ elite; 0 none: 1).
static func tier_of(level: float) -> int:
	var l := level if level > 0.0 else 1.0
	return 2 if l >= 8.0 else (1 if l >= 4.0 else 0)


## look.ts lookOf: [tier, skin, cloak, crest, trim, hair].
static func look_of(seed: String, cls: String, level: float) -> PackedInt32Array:
	load_data()
	var h := hash32(seed)
	var cultures: Array = data["cultures"].get(cls, [])
	var folk := "greek"
	if data["thracian"].has(cls):
		folk = "thracian"
	elif not cultures.is_empty():
		folk = cultures[floori(draw(h, 0) * cultures.size())]
	var st: Array = data["steps"]
	return PackedInt32Array([
		tier_of(level),
		_pick(data["skinW"][folk], draw(h, 1)),
		floori(draw(h, 2) * st[0]),
		floori(draw(h, 3) * st[1]),
		floori(draw(h, 4) * st[2]),
		_pick(data["hairW"][folk], draw(h, 5)),
	])


## Does the class draw through the look (its sheet has colour groups)?
static func has_class(cls: String) -> bool:
	return load_data() and data["index"].has(cls)


## The modulate a look sprite carries (lookShader.ts lookCode): r = skin << 5 | cloak << 2 | crest,
## g = trim << 6 | hair << 3, b and a the block code ((block x 4 + team) x 3 + tier), a kept over half so no sprite
## is culled as transparent.
static func look_color(cls: String, team: int, l: PackedInt32Array) -> Color:
	var fx := (int(data["index"][cls]) * 4 + (team & 3)) * 3 + l[0]
	return Color8((l[1] << 5) | (l[2] << 2) | l[3], (l[4] << 6) | (l[5] << 3), fx & 255, 128 + (fx >> 8))


## The palette texture (look.bin: raw RGBA, w x h).
static func palette() -> ImageTexture:
	if _palette == null:
		load_data()
		var w := int(data["w"])
		var hh := int(data["h"])
		var raw := FileAccess.get_file_as_bytes(ViewData.DIR.path_join("look.bin")).decompress(w * hh * 4, FileAccess.COMPRESSION_GZIP)
		_palette = ImageTexture.create_from_image(Image.create_from_data(w, hh, false, Image.FORMAT_RGBA8, raw))
	return _palette


## The look material (lookShader.ts applyLook), team tints and dyes from Units.
static func material() -> ShaderMaterial:
	if _material != null:
		return _material
	load_data()
	var tint := func(c: Color) -> String: return "vec3(%.4f, %.4f, %.4f)" % [c.r, c.g, c.b]
	var tt: Array = Units.TEAM_TINT
	var code := """shader_type canvas_item;
uniform sampler2D palette : filter_nearest;
varying vec4 code;
void vertex() {
	code = COLOR;
}
vec4 pal(float x, float y) {
	return texelFetch(palette, ivec2(int(x), int(y)), 0);
}
void fragment() {
	vec4 t = texture(TEXTURE, UV);
	float R = floor(code.r * 255.0 + 0.5), G = floor(code.g * 255.0 + 0.5);
	float e = floor(code.b * 255.0 + 0.5) + 256.0 * (floor(code.a * 255.0 + 0.5) - 128.0);
	float q = floor((e + 0.5) / 3.0), tier = e - q * 3.0;
	float ci = floor((q + 0.5) / 4.0), team = q - ci * 4.0;
	float skin = floor((R + 0.5) / 32.0), cloak = floor((R - skin * 32.0 + 0.5) / 4.0), crest = R - skin * 32.0 - cloak * 4.0;
	float trim = floor((G + 0.5) / 64.0), hair = floor((G - trim * 64.0 + 0.5) / 8.0);
	vec3 c = t.rgb;
	bool hit = false;
	if (t.a > 0.99) {
		float y0 = ci * %d.0;
		vec3 k = floor(pal(0.0, y0).rgb * 255.0 + 0.5);
		vec3 c8 = floor(c * 255.0 + 0.5);
		float slot = mod(dot(c8, k), %d.0);
		vec4 src = pal(slot, y0 + 1.0);
		if (src.a > 0.5 && all(lessThan(abs(floor(src.rgb * 255.0 + 0.5) - c8), vec3(0.5)))) {
			float g = floor(pal(slot, y0 + 2.0).r * 255.0 / 16.0 + 0.5);
			float v = g < 0.5 ? cloak : g < 1.5 ? crest : g < 2.5 ? trim : g < 3.5 ? skin : g < 4.5 ? 0.0 : hair;
			c = pal(slot, y0 + 3.0 + (team * 3.0 + tier) * %d.0 + v).rgb;
			hit = true;
		}
	}
	if (!hit && (team < 1.5 || team > 2.5)) {
		float w = %s;
		c = mix(c, team < 0.5 ? %s : team < 1.5 ? %s : %s, w);
	}
	vec3 tint = team < 0.5 ? %s : team < 1.5 ? %s : team < 2.5 ? %s : %s;
	COLOR = vec4(c * tint, t.a);
}
""" % [int(data["rows"]), int(data["w"]), int(data["variants"]), Units.RED_W, Units.DYE[0], Units.DYE[1], Units.DYE[3], tint.call(tt[0]), tint.call(tt[1]), tint.call(tt[2]), tint.call(tt[3])]
	var sh := Shader.new()
	sh.code = code
	_material = ShaderMaterial.new()
	_material.shader = sh
	_material.set_shader_parameter("palette", palette())
	return _material
