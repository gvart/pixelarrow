// src/war/net/protocol.ts parseClientMsg: the zod schema of every client message (clientMsgSchema: the base messages,
// checks, dev helpers, and the order schema inside `order`), ported rule for rule (docs/impl/godot-port.md P8 wave D).
// What zod gives back is what the room gets: objects keep only the schema's keys, in the schema's order (unknown keys
// stripped; holder refs are strict), records keep their own keys in order. A message that fails anywhere, or whose JSON
// text is longer than MAX_CLIENT_MSG UTF-16 units, is null (std::nullopt): the `parse` error.
#pragma once

#include <optional>

#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/variant.hpp>

namespace sim {

constexpr int MAX_CLIENT_MSG = 4096;

// raw: the message as JSON.parse would give it (a Dictionary from the client); its text length is that of
// JSON.stringify(raw), as the local transport sends it
std::optional<godot::Dictionary> parse_client_msg(const godot::Variant &raw);

} // namespace sim
