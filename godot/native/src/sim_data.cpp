#include "sim_data.h"

#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/core/error_macros.hpp>

namespace sim {

static Data DATA;
static bool LOADED = false;
const Data &data() { return DATA; }

static WarStats stats_of(const godot::Dictionary &d) {
	WarStats s;
	s.maxHp = d["maxHp"];
	s.dmg = d["dmg"];
	s.reach = d["reach"];
	s.atkTicks = int(d["atkTicks"]);
	s.rangedDmg = d["rangedDmg"];
	s.range = d["range"];
	s.ammo = d["ammo"];
	s.shotTicks = int(d["shotTicks"]);
	s.shotSpeed = d["shotSpeed"];
	const godot::String m = d["missile"];
	s.missile = m == "stone" ? STONE : m == "javelin" ? JAVELIN : ARROW;
	s.accuracy = d["accuracy"];
	s.armor = d["armor"];
	s.block = d["block"];
	s.ap = d["ap"];
	s.speed = d["speed"];
	s.knock = d.get("knock", 0.0);
	s.bp = d["bp"];
	s.ws = d["ws"];
	s.flags = int(d["flags"]);
	s.work = d.get("work", -1.0);
	s.breach = d.get("breach", -1.0);
	return s;
}

} // namespace sim

namespace godot {

void SimData::load(const Dictionary &tables) {
	sim::Data d;
	const Dictionary ws = tables["war_stats"];
	const Array ids = ws.keys();
	for (int64_t i = 0; i < ids.size(); i++) d.classes.by_id[String(ids[i]).utf8().get_data()] = sim::stats_of(ws[ids[i]]);
	ERR_FAIL_COND_MSG(!d.classes.by_id.count("militia"), "war_stats has no militia");
	sim::load_items(tables, d.items);
	sim::load_story_tables(tables, d.stories);
	sim::load_soul_tables(tables, d.souls);
	sim::load_town_tables(tables, d.town);
	sim::load_landmark_tables(tables, d.landmarks);
	sim::DATA = std::move(d);
	sim::LOADED = true;
}

bool SimData::loaded() { return sim::LOADED; }

int SimData::sight_of(const String &cls) { return sim::DATA.classes.sight_of(cls.utf8().get_data()); }

void SimData::_bind_methods() {
	ClassDB::bind_static_method("SimData", D_METHOD("load", "tables"), &SimData::load);
	ClassDB::bind_static_method("SimData", D_METHOD("loaded"), &SimData::loaded);
	ClassDB::bind_static_method("SimData", D_METHOD("sight_of", "cls"), &SimData::sight_of);
}

} // namespace godot
