## The civilian rules match TS (godot/tests/golden/vectors/civilians.json, src/dev/vectors/civilians.ts): jobs, clips,
## work rates and tool affixes, fresh civilians, the most worn item, the wounded share and the numbers the sim reads.
extends TestCase

const W := preload("res://tests/sim/wild.gd")
const MORE := ["src/war/sim/civilians", "src/data/classes", "src/data/items", "src/data/affixes"]


static func load_data() -> void:
	var t := {"war_stats": GameData.table("derived/war_stats")["WAR_STATS"]}
	for n in W.TABLES + MORE:
		t[n] = GameData.table(n)
	SimData.load(t)


## W.diff, with NaN equal to NaN (Number of a malformed affix value).
func _same(got: Variant, want: Variant, where: String) -> bool:
	var d := "" if _nans(got, want) else W.diff(got, want, where)
	if d != "":
		fail(d)
	return d == ""


func _nans(a: Variant, b: Variant) -> bool:
	if a is Array and b is Array and a.size() == b.size():
		for i in a.size():
			if not (_nans(a[i], b[i]) or W.diff(a[i], b[i]) == ""):
				return false
		return true
	return (a is float or a is int) and (b is float or b is int) and is_nan(float(a)) and is_nan(float(b))


func test_jobs_and_clips_match_ts() -> void:
	load_data()
	var v := W.vectors("civilians")
	for c in v["jobs"]:
		if not _same(CivProbe.civ_job(c[0]), c[1], "civJob(%s)" % c[0]):
			return
	for c in v["clips"]:
		if not _same([CivProbe.clip(c[0]), CivProbe.at_building(c[0])], c.slice(1), "CLIP %s" % c[0]):
			return


func test_work_rates_match_ts() -> void:
	load_data()
	var v := W.vectors("civilians")
	for c in v["rates"]:
		if not _same(CivProbe.work_rate(c[0], c[1]), c[2], "workRate(%s, %s)" % [c[0], str(c[1])]):
			return
	for c in v["mods"]:
		if not _same(CivProbe.tool_mods(c[0]), c.slice(1), "toolMods(%s)" % str(c[0])):
			return


func test_fresh_and_wornest_match_ts() -> void:
	load_data()
	var v := W.vectors("civilians")
	for c in v["fresh"]:
		if not _same(CivProbe.fresh_civilian(c[0], c[1]), c[2], "freshCivilian(%s)" % c[0]):
			return
	for c in v["worn"]:
		if not _same(CivProbe.wornest(c[0]), c[1], "wornest(%s)" % str(c[0])):
			return


func test_fall_share_and_numbers_match_ts() -> void:
	load_data()
	var v := W.vectors("civilians")
	for c in v["falls"]:
		if not _same(CivProbe.fall_share(c[0], c[1], c[2], c[3]), c[4], "fallShare(%s)" % str(c)):
			return
	_same(CivProbe.consts(), v["consts"], "consts")
