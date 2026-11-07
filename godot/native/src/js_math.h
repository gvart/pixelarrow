// JS Math functions whose results can differ from the C++ ones, ported bit for bit (tests/sim/test_js_math.gd checks them
// against V8). The sim calls these, never std::hypot, std::round, std::sin, std::pow...
#pragma once

#include <charconv>
#include <cmath>
#include <cstdlib>
#include <limits>
#include <string>

#include "src/base/ieee754.h"

namespace js {

// V8's Math.hypot for two arguments (src/builtins/math.tq): normalise by the larger magnitude, Kahan-sum the squares,
// sqrt times the max. std::hypot and sqrt(x*x + y*y) differ from it in the last bit.
inline double hypot(double a, double b) {
	const double inf = std::numeric_limits<double>::infinity();
	if (std::isinf(a) || std::isinf(b)) return inf;
	if (std::isnan(a) || std::isnan(b)) return std::numeric_limits<double>::quiet_NaN();
	const double x = std::fabs(a), y = std::fabs(b), m = x > y ? x : y;
	if (m == 0) return 0;
	double sum = 0, comp = 0;
	for (double v : { x, y }) {
		const double n = v / m;
		const double summand = n * n - comp;
		const double pre = sum + summand;
		comp = (pre - sum) - summand;
		sum = pre;
	}
	return std::sqrt(sum) * m;
}

// Math.round: to the nearest integer, ties toward +infinity, -0 kept for -0.5 <= x <= -0.
inline double round(double x) {
	if (std::isnan(x) || std::isinf(x)) return x;
	double r = std::ceil(x);
	if (r - 0.5 > x) r -= 1;
	if (r == 0 && std::signbit(x)) return -0.0;
	return r;
}

// Math.sin, cos, tan, atan2 and log2: V8's fdlibm ports (third_party/v8), never the platform libm.
inline double sin(double x) { return v8::base::ieee754::sin(x); }
inline double cos(double x) { return v8::base::ieee754::cos(x); }
inline double tan(double x) { return v8::base::ieee754::tan(x); }
inline double atan2(double y, double x) { return v8::base::ieee754::atan2(y, x); }
inline double log2(double x) { return v8::base::ieee754::log2(x); }

// Math.pow and `**` as V8 runs them under its default --use-std-math-pow (src/numbers/ieee754.cc math::pow): x*x for
// y == 2, sqrt(x + 0) for y == 0.5, else the platform std::pow (so it matches Node on the same platform, and differs
// between platforms: docs/impl/godot-port.md "Cross-platform math").
inline double pow(double x, double y) {
	if (std::isnan(y)) return std::numeric_limits<double>::quiet_NaN();
	if (std::isinf(y) && (x == 1 || x == -1)) return std::numeric_limits<double>::quiet_NaN();
	if (std::isnan(x)) x = std::numeric_limits<double>::quiet_NaN();
	if (y == 2) return x * x;
	if (y == 0.5) return std::isinf(x) ? std::numeric_limits<double>::infinity() : std::sqrt(x + 0);
	return std::pow(x, y);
}

// Number::toString (JSON.stringify of a finite number): the shortest digits that read back as the same double (the
// closest of them), laid out as ECMAScript says: plain up to 21 integer digits, 0.000001 and up without an exponent,
// else d.ddde+n. NaN and the infinities as String() gives them; -0 is "0".
inline std::string number_to_string(double v) {
	if (std::isnan(v)) return "NaN";
	if (std::isinf(v)) return v > 0 ? "Infinity" : "-Infinity";
	if (v == 0) return "0";
	char buf[64];
	if (v == std::floor(v) && std::fabs(v) < 9007199254740992.0) {
		auto r = std::to_chars(buf, buf + sizeof buf, (long long)v);
		return std::string(buf, r.ptr);
	}
	auto r = std::to_chars(buf, buf + sizeof buf, v, std::chars_format::scientific);
	std::string sci(buf, r.ptr), out;
	if (sci[0] == '-') {
		out = "-";
		sci.erase(0, 1);
	}
	const size_t e = sci.find('e');
	std::string digits;
	for (size_t i = 0; i < e; i++)
		if (sci[i] != '.') digits += sci[i];
	const int k = int(digits.size()), n = std::atoi(sci.c_str() + e + 1) + 1;
	if (k <= n && n <= 21) out += digits + std::string(n - k, '0');
	else if (0 < n && n <= 21) out += digits.substr(0, n) + "." + digits.substr(n);
	else if (-6 < n && n <= 0) out += "0." + std::string(-n, '0') + digits;
	else {
		out += digits.substr(0, 1);
		if (k > 1) out += "." + digits.substr(1);
		out += n - 1 >= 0 ? "e+" : "e-";
		out += std::to_string(std::abs(n - 1));
	}
	return out;
}

} // namespace js
