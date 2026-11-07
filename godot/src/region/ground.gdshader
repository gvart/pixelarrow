// The ground's one material (godot/src/region/ground_mesh.gd): each vertex's UV picks its texture by UV.x / 4
// (0, 1: atlas pages; 2..5: the wall stones, repeating), its colour multiplies the texel (light and tint fills draw the
// atlas's white texel in their colour).
shader_type canvas_item;
render_mode blend_mix;

uniform sampler2D atlas0 : filter_nearest;
uniform sampler2D atlas1 : filter_nearest;
uniform sampler2D stone0 : filter_nearest, repeat_enable;
uniform sampler2D stone1 : filter_nearest, repeat_enable;
uniform sampler2D stone2 : filter_nearest, repeat_enable;
uniform sampler2D stone3 : filter_nearest, repeat_enable;

varying vec4 tint;

void vertex() {
	tint = COLOR;
}

void fragment() {
	float m = floor(UV.x / 4.0);
	vec2 uv = vec2(UV.x - m * 4.0, UV.y);
	vec4 t;
	if (m < 0.5) {
		t = texture(atlas0, uv);
	} else if (m < 1.5) {
		t = texture(atlas1, uv);
	} else {
		vec2 r = fract(uv);
		if (m < 2.5) t = texture(stone0, r);
		else if (m < 3.5) t = texture(stone1, r);
		else if (m < 4.5) t = texture(stone2, r);
		else t = texture(stone3, r);
	}
	COLOR = t * tint;
}
