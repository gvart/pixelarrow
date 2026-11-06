// pixelsim GDExtension entry: registers the sim classes (docs/impl/godot-port.md G-02).
#include <gdextension_interface.h>
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/core/defs.hpp>
#include <godot_cpp/godot.hpp>

#include "grid.h"
#include "rng.h"

using namespace godot;

static void initialize_pixelsim(ModuleInitializationLevel level) {
	if (level != MODULE_INITIALIZATION_LEVEL_SCENE) return;
	GDREGISTER_CLASS(Rng);
	GDREGISTER_CLASS(JsMath);
	GDREGISTER_CLASS(Grid);
}

static void uninitialize_pixelsim(ModuleInitializationLevel level) {}

extern "C" GDExtensionBool GDE_EXPORT pixelsim_init(GDExtensionInterfaceGetProcAddress get_proc_address, GDExtensionClassLibraryPtr library, GDExtensionInitialization *init) {
	GDExtensionBinding::InitObject obj(get_proc_address, library, init);
	obj.register_initializer(initialize_pixelsim);
	obj.register_terminator(uninitialize_pixelsim);
	obj.set_minimum_library_initialization_level(MODULE_INITIALIZATION_LEVEL_SCENE);
	return obj.init();
}
