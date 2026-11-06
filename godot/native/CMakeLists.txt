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
# V8's own Math.sin/cos/atan2/pow... (third_party/v8/README.md), so floats match the TS sim
add_library(pixelsim SHARED ${SIM_SOURCES} "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/src/base/ieee754.cc")
target_include_directories(pixelsim PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8")
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
        CXX_VISIBILITY_PRESET hidden
        VISIBILITY_INLINES_HIDDEN ON
        POSITION_INDEPENDENT_CODE ON
        LIBRARY_OUTPUT_DIRECTORY "$<1:${OUTPUT_DIR}>"
        RUNTIME_OUTPUT_DIRECTORY "$<1:${OUTPUT_DIR}>"
        PREFIX "lib"
        OUTPUT_NAME "pixelsim${GODOTCPP_SUFFIX}"
)

# V8's math is compiled as Node compiles it: clang's default FMA contraction. On arm64 that fuses some of fdlibm's
# multiply-adds (Node on Apple silicon does the same, measured); x86-64 baseline has no FMA, so it changes nothing there.
# The sim's own code above stays uncontracted, as V8's JIT never fuses JS arithmetic.
if(NOT MSVC)
    set_source_files_properties("${CMAKE_CURRENT_SOURCE_DIR}/third_party/v8/src/base/ieee754.cc" PROPERTIES COMPILE_OPTIONS "-ffp-contract=on")
endif()
