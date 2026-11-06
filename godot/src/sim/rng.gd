## Small deterministic PRNG (mulberry32), bit for bit the TS one (src/sim/rng.ts). The state is one uint32 held in a
## 64-bit int: every step masks to 32 bits, and _imul multiplies in 16-bit halves so nothing overflows.
## Never use randf()/randi() inside the simulation.
class_name Rng
extends RefCounted

const MASK := 0xFFFFFFFF

var state: int


func _init(seed: int) -> void:
	state = seed & MASK
	if state == 0:
		state = 0x9e3779b9


## Uniform float in [0, 1).
func next() -> float:
	state = (state + 0x6d2b79f5) & MASK
	var t := state
	t = _imul(t ^ (t >> 15), t | 1)
	t ^= (t + _imul(t ^ (t >> 7), t | 61)) & MASK
	return float(t ^ (t >> 14)) / 4294967296.0


func range_f(lo: float, hi: float) -> float:
	return lo + (hi - lo) * next()


func int_in(lo: int, hi_inclusive: int) -> int:
	return lo + floori(next() * (hi_inclusive - lo + 1))


func chance(p: float) -> bool:
	return next() < p


func pick(arr: Array) -> Variant:
	return arr[floori(next() * arr.size())]


## Weighted pick over [[value, weight], ...]; weights need not be normalised.
func weighted(entries: Array) -> Variant:
	var total := 0.0
	for e in entries:
		total += e[1]
	var r := next() * total
	for e in entries:
		r -= e[1]
		if r < 0:
			return e[0]
	return entries[-1][0]


func shuffle(arr: Array) -> Array:
	for i in range(arr.size() - 1, 0, -1):
		var j := floori(next() * (i + 1))
		var tmp = arr[i]
		arr[i] = arr[j]
		arr[j] = tmp
	return arr


## Math.imul: the low 32 bits of a * b, both uint32 (as uint32).
static func _imul(a: int, b: int) -> int:
	a &= MASK
	b &= MASK
	var lo := (a & 0xFFFF) * b
	var hi := ((a >> 16) * b) & 0xFFFF
	return (lo + (hi << 16)) & MASK


## FNV-1a over UTF-16 code units, as the TS hashString (charCodeAt), so non-BMP characters hash the same.
static func hash_string(s: String) -> int:
	var h := 0x811c9dc5
	var u := s.to_utf16_buffer()
	for i in range(0, u.size(), 2):
		h ^= u.decode_u16(i)
		h = _imul(h, 0x01000193)
	return h
