# pixelsim: the war sim and local room as a Godot GDExtension (docs/impl/godot-port.md G-02).
# Build: cmake -S godot/native -B build/native -DCMAKE_BUILD_TYPE=Release && cmake --build build/native -j
# The library lands in godot/bin/, where godot/pixelsim.gdextension points.
cmake_minimum_required(VERSION 3.17)
project(pixelsim LANGUAGES CXX)

include(FetchContent)
FetchContent_Declare(
    godot-cpp
    GIT_REPOSITORY https://github.com/godotengine/godot-cpp.git
    GIT_TAG godot-4.5-stable
    GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(godot-cpp)

file(GLOB SIM_SOURCES CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/src/*.cpp")
add_library(pixelsim SHARED ${SIM_SOURCES})
target_link_libraries(pixelsim PRIVATE godot-cpp)

# Floats must round exactly as V8 does: no fused multiply-add, no fast-math (docs/impl/godot-port.md "Float drift").
if(MSVC)
    target_compile_options(pixelsim PRIVATE /fp:precise /fp:contract-)
else()
    target_compile_options(pixelsim PRIVATE -ffp-contract=off -fno-fast-math)
endif()

get_target_property(GODOTCPP_SUFFIX godot-cpp GODOTCPP_SUFFIX)
set(OUTPUT_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../bin/")
set_target_properties(
    pixelsim
    PROPERTIES
        CXX_STANDARD 17
        CXX_EXTENSIONS OFF
        CXX_VISIBILITY_PRESET ${GODOTCPP_SYMBOL_VISIBILITY}
        POSITION_INDEPENDENT_CODE ON
        LIBRARY_OUTPUT_DIRECTORY "$<1:${OUTPUT_DIR}>"
        RUNTIME_OUTPUT_DIRECTORY "$<1:${OUTPUT_DIR}>"
        PREFIX "lib"
        OUTPUT_NAME "pixelsim${GODOTCPP_SUFFIX}"
)
