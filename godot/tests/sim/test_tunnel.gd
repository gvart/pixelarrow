## The Tunnel of Shades matches TS (godot/tests/golden/vectors/tunnel.json, src/dev/vectors/tunnel.ts): the settled
## clock, the countdowns and the card and HUD lines, value for value.
extends TestCase

static var v: Dictionary = GameData.read_exact("res://tests/golden/vectors/tunnel.json")


func test_rules_match_ts() -> void:
	var r := Tunnel.rules()
	for src in [v["tunnel"], GameData.table("src/war/sim/tunnel")["TUNNEL"]]:
		check(diff(r, src) == "", "TUNNEL %s, TS %s" % [r, src])


func test_settle_matches_ts() -> void:
	var now: float = v["now"]
	for c in v["settle"]:
		var d := diff(Tunnel.settle(c[0], now), c[1])
		check(d == "", "settle %s: %s" % [c[0], d])


func test_clock_and_span_match_ts() -> void:
	for c in v["clock"]:
		check(Tunnel.clock(c[0]) == c[1], "clock(%d) = %s, TS %s" % [c[0], Tunnel.clock(c[0]), c[1]])
		check(Tunnel.span(c[0]) == c[2], "span(%d) = %s, TS %s" % [c[0], Tunnel.span(c[0]), c[2]])


func test_wipe_card_matches_ts() -> void:
	var now: float = v["now"]
	for c in v["wipes"]:
		check(Tunnel.wiped(c[0]) == c[1], "wiped %s" % [c[0]])
		var d := diff(Tunnel.wipe_next(c[0]), c[2])
		check(d == "", "wipeNext %s: %s" % [c[0], d])
		check(Tunnel.wipe_line(c[0], now) == c[3], "wipeLine %s = %s, TS %s" % [c[0], Tunnel.wipe_line(c[0], now), c[3]])


func test_lines_match_ts() -> void:
	var now: float = v["now"]
	for c in v["lines"]:
		var got = Tunnel.tunnel_line(c[0], c[1], now, c[2])
		check(diff(got, c[3]) == "", "tunnelLine %s = %s, TS %s" % [c.slice(0, 3), got, c[3]])
	for c in v["hints"]:
		check(Tunnel.tunnel_hint(c[0]) == c[1], "tunnelHint(%d)" % c[0])


## "" when a and b are the same JSON value (numbers by value, dictionaries by keys), else where they differ.
static func diff(a: Variant, b: Variant, at := "") -> String:
	var num := [TYPE_INT, TYPE_FLOAT]
	if typeof(a) in num and typeof(b) in num:
		return "" if float(a) == float(b) else "%s: %s vs %s" % [at, a, b]
	if a is Dictionary and b is Dictionary:
		if a.size() != b.size() or not a.keys().all(func(k): return b.has(k)):
			return "%s: keys %s vs %s" % [at, a.keys(), b.keys()]
		for k in a:
			var d := diff(a[k], b[k], "%s.%s" % [at, k])
			if d != "":
				return d
		return ""
	if (a is Array or a is PackedStringArray) and (b is Array or b is PackedStringArray):
		if a.size() != b.size():
			return "%s: %d items vs %d" % [at, a.size(), b.size()]
		for i in a.size():
			var d := diff(a[i], b[i], "%s[%d]" % [at, i])
			if d != "":
				return d
		return ""
	if typeof(a) != typeof(b) or a != b:
		return "%s: %s vs %s" % [at, a, b]
	return ""
