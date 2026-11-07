// pixelsim GDExtension entry: registers the sim classes (docs/impl/godot-port.md G-02).
#include <gdextension_interface.h>
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/core/defs.hpp>
#include <godot_cpp/godot.hpp>

#include "boss_probe.h"
#include "encounters.h"
#include "goods_probe.h"
#include "grid.h"
#include "landmarks.h"
#include "prebuilt.h"
#include "probe.h"
#include "rng.h"
#include "roam_probe.h"
#include "roster.h"
#include "sim.h"
#include "secrets.h"
#include "siege_probe.h"
#include "sim_data.h"
#include "souls.h"
#include "stories.h"
#include "town_level.h"
#include "tunnel.h"
#include "vision.h"
#include "warlords_probe.h"
#include "host.h"
#include "wild_probe.h"
#include "works_probe.h"

using namespace godot;

static void initialize_pixelsim(ModuleInitializationLevel level) {
	if (level != MODULE_INITIALIZATION_LEVEL_SCENE) return;
	GDREGISTER_CLASS(Rng);
	GDREGISTER_CLASS(JsMath);
	GDREGISTER_CLASS(Grid);
	GDREGISTER_CLASS(SimProbe);
	GDREGISTER_CLASS(Vision);
	GDREGISTER_CLASS(SimData);
	GDREGISTER_CLASS(Tunnel);
	GDREGISTER_CLASS(StoryRun);
	GDREGISTER_CLASS(Sim);
	GDREGISTER_CLASS(WildProbe);
	GDREGISTER_CLASS(MobsProbe);
	GDREGISTER_CLASS(RoamProbe);
	GDREGISTER_CLASS(CivProbe);
	GDREGISTER_CLASS(GoodsProbe);
	GDREGISTER_CLASS(Souls);
	GDREGISTER_CLASS(Secrets);
	GDREGISTER_CLASS(Landmarks);
	GDREGISTER_CLASS(TownLevels);
	GDREGISTER_CLASS(WorksProbe);
	GDREGISTER_CLASS(BossProbe);
	GDREGISTER_CLASS(SiegeProbe);
	GDREGISTER_CLASS(EncounterRun);
	GDREGISTER_CLASS(Towns);
	GDREGISTER_CLASS(Roster);
	GDREGISTER_CLASS(WarlordsProbe);
	GDREGISTER_CLASS(WarHost);
}

static void uninitialize_pixelsim(ModuleInitializationLevel level) {}

extern "C" GDExtensionBool GDE_EXPORT pixelsim_init(GDExtensionInterfaceGetProcAddress get_proc_address, GDExtensionClassLibraryPtr library, GDExtensionInitialization *init) {
	GDExtensionBinding::InitObject obj(get_proc_address, library, init);
	obj.register_initializer(initialize_pixelsim);
	obj.register_terminator(uninitialize_pixelsim);
	obj.set_minimum_library_initialization_level(MODULE_INITIALIZATION_LEVEL_SCENE);
	return obj.init();
}
