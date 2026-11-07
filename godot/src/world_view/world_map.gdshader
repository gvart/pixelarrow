// The world map's washes over the painting (src/war/world-view/map.ts draw, W-43): per region (region-ids.png, red =
// 1-based index in regions.json `order`) a wash (neutral grey or the owner's colour), a band of the owner's colour just
// inside its border (a world event's colour while one runs there), the contender's hatch over a fight, and a glow
// (the squad's targets, the selected region, an event). Arrays are by region index; alpha 0 = none.
shader_type canvas_item;

uniform sampler2D ids : filter_nearest;
uniform vec2 map_size = vec2(2048.0, 1536.0);
uniform vec4 wash[40];
uniform vec4 band[40];
uniform vec4 hatch[40];
uniform vec4 glow[40];

int region_at(vec2 uv) {
	return int(texture(ids, uv).r * 255.0 + 0.5);
}

void fragment() {
	vec3 c = texture(TEXTURE, UV).rgb;
	int i = region_at(UV);
	if (i > 0 && i <= 40) {
		vec4 w = wash[i - 1];
		c = mix(c, w.rgb, w.a);
		vec2 p = UV * map_size;
		vec4 h = hatch[i - 1];
		if (h.a > 0.0 && mod(p.x - p.y, 26.0) < 4.95) {
			c = mix(c, h.rgb, h.a);
		}
		vec4 g = glow[i - 1];
		c = mix(c, g.rgb, g.a);
		vec4 b = band[i - 1];
		if (b.a > 0.0) {
			// inside the border: a neighbour 4.5 map px away in some direction is another region (or the sea)
			vec2 d = 4.5 / map_size;
			bool edge = false;
			for (int a = 0; a < 8; a++) {
				float t = float(a) * 0.785398;
				if (region_at(UV + vec2(cos(t), sin(t)) * d) != i) {
					edge = true;
				}
			}
			if (edge) {
				c = mix(c, b.rgb, b.a);
			}
		}
	}
	COLOR = vec4(c, 1.0);
}
