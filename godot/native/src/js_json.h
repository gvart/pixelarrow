// JSON.stringify of a Variant as V8 writes it (docs/impl/godot-port.md P8): objects in their keys' insertion order (a
// Dictionary keeps it), numbers as Number::toString (js::number_to_string; ints and floats alike), strings escaped as
// JSON.stringify escapes them, null for nil. The room's change keys (JSON.stringify(wild) ...) and the frame codec's
// JSON blocks (src/war/net/codec.ts records) go through it, so a frame matches the TS byte for byte.
#pragma once

#include <string>

#include <godot_cpp/variant/variant.hpp>

namespace sim {

std::string js_stringify(const godot::Variant &v);
void js_stringify(std::string &out, const godot::Variant &v);
// JSON.parse as V8 reads it: numbers correctly rounded (Godot's JSON is not; a save's numbers must read back exactly),
// integral ones within 2^53 as ints, objects as Dictionaries in key order. ok false: a malformed text. (state.cpp: its
// parser.)
godot::Variant js_parse(const std::string &text, bool &ok);

} // namespace sim
