#include "js_json.h"

#include <cmath>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/packed_float64_array.hpp>
#include <godot_cpp/variant/packed_int32_array.hpp>
#include <godot_cpp/variant/packed_int64_array.hpp>
#include <godot_cpp/variant/string.hpp>

#include "js_math.h"
#include "state.h"

namespace sim {

using godot::Variant;

static void num(std::string &out, double v) {
	if (!std::isfinite(v)) out += "null"; // JSON.stringify(NaN), (Infinity)
	else out += js::number_to_string(v);
}

void js_stringify(std::string &out, const Variant &v) {
	switch (v.get_type()) {
		case Variant::NIL: out += "null"; return;
		case Variant::BOOL: out += bool(v) ? "true" : "false"; return;
		case Variant::INT: num(out, double(int64_t(v))); return;
		case Variant::FLOAT: num(out, double(v)); return;
		case Variant::STRING:
		case Variant::STRING_NAME: state::json_string(out, godot::String(v).utf8().get_data()); return;
		case Variant::DICTIONARY: {
			const godot::Dictionary d = v;
			const godot::Array keys = d.keys();
			out += '{';
			for (int64_t i = 0; i < keys.size(); i++) {
				if (i) out += ',';
				state::json_string(out, godot::String(keys[i]).utf8().get_data());
				out += ':';
				js_stringify(out, d[keys[i]]);
			}
			out += '}';
			return;
		}
		case Variant::PACKED_INT32_ARRAY:
		case Variant::PACKED_INT64_ARRAY:
		case Variant::PACKED_FLOAT64_ARRAY:
		case Variant::ARRAY: {
			const godot::Array a = v;
			out += '[';
			for (int64_t i = 0; i < a.size(); i++) {
				if (i) out += ',';
				js_stringify(out, a[i]);
			}
			out += ']';
			return;
		}
		default: out += "null"; return;
	}
}

std::string js_stringify(const Variant &v) {
	std::string out;
	js_stringify(out, v);
	return out;
}

} // namespace sim
