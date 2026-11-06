## JS Math functions whose results differ from GDScript's built-ins, ported bit for bit (checked by tests/sim/test_js_math.gd
## against V8). The sim calls these, never hypot-by-sqrt, round() or Vector2 (float32).
class_name JsMath
extends RefCounted


## V8's Math.hypot for two arguments (src/builtins/math.tq): normalise by the larger magnitude, Kahan-sum the squares,
## sqrt times the max. sqrt(x*x + y*y) differs from it in the last bit.
static func hypot(a: float, b: float) -> float:
	if is_nan(a) or is_nan(b):
		return INF if is_inf(a) or is_inf(b) else NAN
	var x := absf(a)
	var y := absf(b)
	var m := maxf(x, y)
	if m == INF:
		return INF
	if m == 0.0:
		return 0.0
	var sum := 0.0
	var comp := 0.0
	for v in [x, y]:
		var n: float = v / m
		var summand := n * n - comp
		var pre := sum + summand
		comp = (pre - sum) - summand
		sum = pre
	return sqrt(sum) * m


## Math.round: to the nearest integer, ties toward +infinity (GDScript's round() sends -2.5 to -3, JS to -2).
static func round_js(x: float) -> float:
	if is_nan(x) or is_inf(x):
		return x
	var r := ceilf(x)
	if r - 0.5 > x:
		r -= 1.0
	if r == 0.0 and (x < 0.0 or (x == 0.0 and 1.0 / x < 0.0)):
		return x * 0.0  # -0, as JS gives for -0.5 < x <= -0 (a `-0.0` literal returned here came back +0)
	return r
