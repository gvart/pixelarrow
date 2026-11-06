// Shim for V8's src/base/build_config.h: only V8_CC_MSVC is used.
#pragma once
#if defined(_MSC_VER) && !defined(__clang__)
#define V8_CC_MSVC 1
#else
#define V8_CC_MSVC 0
#endif
