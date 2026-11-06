// JS Math functions whose results differ from the C++ ones, ported bit for bit (tests/sim/test_js_math.gd checks them
// against V8). The sim calls these, never std::hypot or std::round.
#pragma once

#include <cmath>
#include <limits>

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

} // namespace js
