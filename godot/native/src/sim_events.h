// The WarEvents of the event log (src/war/types.ts WarEvent) as their JSON objects: the sim notes them where index.ts
// does, the modules' own events (crafted, secret, landmark, the guardians', the wild's, roaming life's, souls') turned
// into the same shape. A field TS leaves undefined is left out.
#pragma once

#include <string>

#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/string.hpp>

#include "bosses.h"
#include "crafting.h"
#include "landmarks.h"
#include "mobs.h"
#include "roam.h"
#include "secrets.h"
#include "souls.h"

namespace sim {

inline godot::String gstr(const std::string &s) { return godot::String::utf8(s.c_str()); }
// {t, kind}, the rest added in the TS key order
godot::Dictionary ev(double t, const char *kind);
godot::Dictionary ev_of(const CraftedEvent &e);
godot::Dictionary ev_of(const SecretEvent &e);
godot::Dictionary ev_of(const LmEvent &e);
godot::Dictionary ev_of(const BossNote &e);
godot::Dictionary ev_of(double t, const MobNote &e);
godot::Dictionary ev_of(double t, const RoamNote &e);
// soulClaimed's person: what souls holds of him (id, name, cls, level), as the trace digests it
godot::Dictionary ev_of(const SoulEvent &e);

} // namespace sim
