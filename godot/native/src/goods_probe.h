// GoodsProbe: replays the TS vectors of economy, holders, trade and crafting (src/dev/vectors/<module>.ts) through the
// C++ ports and returns the same shapes, for tests/sim/test_<module>.gd to compare bit for bit.
#pragma once

#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>

namespace godot {

class GoodsProbe : public RefCounted {
	GDCLASS(GoodsProbe, RefCounted)

public:
	static Dictionary economy(const Dictionary &vec);
	static Dictionary building(const String &type);
	static Dictionary holders(const Dictionary &vec);
	static Dictionary trade(const Dictionary &vec, const Array &safe);
	static Dictionary crafting_rules(const Dictionary &rules);
	static Array crafting_run(const Dictionary &run);

protected:
	static void _bind_methods();
};

} // namespace godot
