// Fog of war (godot/src/region/fog.gd): UV is the cell-unit point of the surface; the four cell states round it
// (0 unexplored, 1 explored, 2 seen) mapped to their alphas and blended bilinearly between cell centres, the previous
// state eased into the current by t. Drawn without blending: the front-most surface owns the pixel.
shader_type canvas_item;
render_mode blend_disabled;

uniform sampler2D cur : filter_nearest;
uniform sampler2D prev : filter_nearest;
uniform vec2 grid;
uniform float t;
uniform float dark;
uniform float dim;
uniform vec3 rgb;

float alpha_of(float s) {
	return s > 1.5 / 255.0 ? 0.0 : (s > 0.5 / 255.0 ? dim : dark);
}

float sample_fog(sampler2D tex, vec2 p) {
	vec2 q = clamp(p - 0.5, vec2(0.0), grid - 1.0);
	vec2 f = floor(q);
	vec2 a = q - f;
	ivec2 i0 = ivec2(f);
	ivec2 i1 = min(i0 + 1, ivec2(grid) - 1);
	float s00 = alpha_of(texelFetch(tex, i0, 0).r);
	float s10 = alpha_of(texelFetch(tex, ivec2(i1.x, i0.y), 0).r);
	float s01 = alpha_of(texelFetch(tex, ivec2(i0.x, i1.y), 0).r);
	float s11 = alpha_of(texelFetch(tex, i1, 0).r);
	return mix(mix(s00, s10, a.x), mix(s01, s11, a.x), a.y);
}

void fragment() {
	float a = mix(sample_fog(prev, UV), sample_fog(cur, UV), t);
	COLOR = vec4(rgb, a);
}
