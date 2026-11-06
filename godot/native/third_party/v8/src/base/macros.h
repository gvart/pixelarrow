// Shim for V8's src/base/macros.h: what src/base/ieee754.cc uses.
#pragma once
#include <cstring>
#include <type_traits>
#define V8_INLINE inline
#if defined(__GNUC__) || defined(__clang__)
#define V8_WARN_UNUSED_RESULT __attribute__((warn_unused_result))
#else
#define V8_WARN_UNUSED_RESULT
#endif
namespace v8 {
namespace base {
template <class Dest, class Source>
inline Dest bit_cast(const Source &source) {
	static_assert(sizeof(Dest) == sizeof(Source), "bit_cast needs equal sizes");
	Dest dest;
	memcpy(&dest, &source, sizeof(dest));
	return dest;
}
} // namespace base
} // namespace v8
