// Shim for V8's src/base/overflowing-math.h: what src/base/ieee754.cc uses. Signed wraparound goes through the unsigned
// type (defined behaviour), as in V8; Divide is plain IEEE division (V8 wraps it only to silence UB checkers).
#pragma once
#include <type_traits>
namespace v8 {
namespace base {
template <typename T>
inline T SubWithWraparound(T a, T b) {
	using U = std::make_unsigned_t<T>;
	return static_cast<T>(static_cast<U>(a) - static_cast<U>(b));
}
template <typename T>
inline T NegateWithWraparound(T a) {
	using U = std::make_unsigned_t<T>;
	return static_cast<T>(U(0) - static_cast<U>(a));
}
template <typename T>
inline T Divide(T x, T y) { return x / y; }
} // namespace base
} // namespace v8
