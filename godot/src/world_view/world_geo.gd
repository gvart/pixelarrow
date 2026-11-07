## The world map's pure rules (docs/impl/godot-port.md P11), ported from src/war/world-view and src/war/world: the
## world graph's borders and travel times (graph.ts edge), season score rates and standings, the fog of the map
## (geo.ts), the warlords' pennants and cards (lords.ts, warWarlords.ts domainOf), where a squad on the road is
## (map.ts transitPos), the camera's fit, and the region card's words (regionCard.ts). Checked against TS vectors
## (tests/world_view/test_world_view.gd). Numbers stay doubles (Arrays, never Vector2) so they match TS bit for bit.
class_name WorldGeo
extends RefCounted

static var _regions := {}


static func world_regions() -> Array:
	return GameData.table("src/war/world/regions")["WORLD_REGIONS"]


## A world region (WORLD_REGIONS row) by id, {} when none.
static func region(id: String) -> Dictionary:
	if _regions.is_empty():
		for r in world_regions():
			_regions[r["id"]] = r
	return _regions.get(id, {})


static func region_name(id: String) -> String:
	return String(region(id).get("name", id))


static func alliances() -> Array:
	return GameData.table("src/war/world/alliances")["ALLIANCES"]


static func alliance_name(a: int) -> String:
	return String(alliances()[a]["name"]) if a >= 0 and a < alliances().size() else "Nobody"


## An alliance's colour on the map (the shared team palette, src/war/world/palette.ts).
static func color(a: int) -> Color:
	return Color(alliances()[a]["color"]) if a >= 0 and a < alliances().size() else Color("#888888")


static func geo() -> Dictionary:
	return GameData.table("src/war/world-view/geo")


static func is_market(id: String) -> bool:
	return geo()["MARKET_TOWNS"].has(id)


static func is_chokepoint(id: String) -> bool:
	for p in geo()["PURPOSE"].get(id, []):
		if String(p).begins_with("chokepoint"):
			return true
	return false


# ---------- the world graph (src/war/world/graph.ts) ----------

static func _side(from: Dictionary, to: Dictionary) -> String:
	var dx: float = to["pos"]["x"] - from["pos"]["x"]
	var dy: float = to["pos"]["y"] - from["pos"]["y"]
	if absf(dy) >= absf(dx):
		return "N" if dy < 0 else "S"
	return "W" if dx < 0 else "E"


## The border between adjacent a and b: {a, b, sideA, sideB, ms}; {} when they do not touch.
static func edge(a: String, b: String) -> Dictionary:
	var ra := region(a)
	var rb := region(b)
	if ra.is_empty() or rb.is_empty() or not ra["adj"].has(b):
		return {}
	var d := JsMath.hypot(rb["pos"]["x"] - ra["pos"]["x"], rb["pos"]["y"] - ra["pos"]["y"])
	var per: float = GameData.table("src/war/world/graph")["EDGE_MS_PER_UNIT"]
	return {"a": a, "b": b, "sideA": _side(ra, rb), "sideB": _side(rb, ra), "ms": JsMath.round_js(d * per / 1000.0) * 1000.0}


## Travel time of a transfer from the exit zone (source.ts travelMs).
static func travel_ms(from: String, to: String) -> float:
	var scale: float = GameData.table("src/war/world/alliances")["WAR_SEASON"]["travelScale"]
	return JsMath.round_js(float(edge(from, to).get("ms", 0.0)) * scale)


# ---------- the season (geo.ts) ----------

## Season score per hour a region yields its owner now.
static func score_rate(r: Dictionary) -> int:
	var owner := int(r["owner"])
	if owner < 0:
		return 0
	var id: String = r["id"]
	if id == "omphalos":
		for i in r["live"].size():
			if r["live"][i] > 0 and i != owner:
				return 0
		return 10
	if geo()["FRONTIER_TOWNS"].has(id):
		return 3
	if geo()["GATES"].has(id):
		return 2
	return 1 if region(id).get("role") == "neutral" else 0


## Score rate, market towns held and the Omphalos holder per alliance: [{id, rate, towns, frontier, omphalos}].
static func standings(regions: Array) -> Array:
	var out := []
	for a in alliances():
		var row := {"id": int(a["id"]), "rate": 0, "towns": 0, "frontier": 0, "omphalos": false}
		for r in regions:
			if int(r["owner"]) != row["id"]:
				continue
			row["rate"] += score_rate(r)
			if is_market(r["id"]):
				row["towns"] += 1
			if geo()["FRONTIER_TOWNS"].has(r["id"]):
				row["frontier"] += 1
			if r["id"] == "omphalos":
				row["omphalos"] = true
		out.append(row)
	return out


## Fog of the map: troops show in regions the alliance owns, borders or stands in (`own`: region ids as keys).
static func in_sight(id: String, you: Variant, by_id: Dictionary, own: Dictionary) -> bool:
	if you == null:
		return false
	var me := int(you)
	if own.has(id) or int(by_id.get(id, {}).get("owner", -9)) == me:
		return true
	for n in region(id).get("adj", []):
		if int(by_id.get(n, {}).get("owner", -9)) == me:
			return true
	return false


# ---------- the warlords (lords.ts, src/data/warWarlords.ts) ----------

static func warlords() -> Array:
	return GameData.table("src/data/warWarlords")["WARLORDS"]


static func warlord(id: String) -> Dictionary:
	for w in warlords():
		if w["id"] == id:
			return w
	return {}


## His domain: his seat, then its neighbours of depth 1-2 that are no home.
static func domain_of(w: Dictionary) -> Array:
	var seat := region(w.get("seat", ""))
	if seat.is_empty():
		return []
	var depth: Dictionary = GameData.table("src/war/sim/depth")["REGION_DEPTH"]
	var out := [seat["id"]]
	for id in seat["adj"]:
		var d: float = depth.get(id, 1)
		if d >= 1 and d <= 2 and region(id).get("role") != "home":
			out.append(id)
	return out


static func _reports(id: String, regions: Array) -> Dictionary:
	var out := {}
	for r in regions:
		for l in r.get("lords", []):
			if l["id"] == id:
				out[r["id"]] = l
	return out


static func _raid_live(l: Variant, now: float) -> bool:
	return l is Dictionary and l.has("raid") and now < float(l["raid"]["at"]) + float(GameData.table("src/war/world-view/lords")["RAID_SHOW_MS"])


static func _back_of(reps: Dictionary, now: float) -> float:
	var m := 0.0
	for l in reps.values():
		var t: float = l.get("backAt", 0.0)
		if t > now:
			m = maxf(m, t)
	return m


## Every warlord's pennants: [{id, region, seat, tint, holds?, men?, raid?, fallen?}].
static func lord_marks(regions: Array, now: float) -> Array:
	var out := []
	for w in warlords():
		var reps := _reports(w["id"], regions)
		var dom := domain_of(w)
		if _back_of(reps, now) > 0:
			out.append({"id": w["id"], "region": dom[0], "seat": true, "tint": w["tint"], "fallen": true})
			continue
		for i in dom.size():
			var l = reps.get(dom[i])
			if l != null and l["holds"] <= 0 and not _raid_live(l, now):
				continue
			var m := {"id": w["id"], "region": dom[i], "seat": i == 0, "tint": w["tint"]}
			if l != null:
				m["holds"] = l["holds"]
				m["men"] = l["men"]
			if _raid_live(l, now):
				m["raid"] = true
			out.append(m)
	return out


## What his card shows: {known, holds, men, lands, raid?: {region, at}, backAt?}.
static func lord_info(id: String, regions: Array, now: float) -> Dictionary:
	var w := warlord(id)
	var reps := _reports(id, regions)
	var back := _back_of(reps, now)
	if back > 0:
		return {"known": true, "holds": 0, "men": 0, "lands": [], "backAt": back}
	var out := {"known": reps.size() > 0, "holds": 0, "men": 0, "lands": []}
	for r in (domain_of(w) if not w.is_empty() else []):
		var l = reps.get(r)
		if l != null and l["holds"] > 0:
			out["holds"] += l["holds"]
			out["men"] += l["men"]
			out["lands"].append(r)
	for r in reps:
		if _raid_live(reps[r], now):
			out["raid"] = {"region": r, "at": reps[r]["raid"]["at"]}
			break
	return out


## Men as a rough count ("~10"): a garrison is a guess from afar.
static func rough_men(n: float) -> String:
	if n <= 0:
		return "0"
	if n < 5:
		return "a few"
	return "~%d" % int(JsMath.round_js(n / 5.0) * 5)


## The pennants' scale in map px at zoom k: a hall's cloth stays PENNANT_PX wide on screen.
static func pennant_scale(k: float) -> float:
	var t: Dictionary = GameData.table("src/war/world-view/lords")
	var w: float = t["PENNANT_W"]
	return minf(maxf(w * k, t["PENNANT_PX"][0]), t["PENNANT_PX"][1]) / (w * k)


# ---------- the map's geometry (map.ts) ----------

## m:ss (or h:mm:ss).
static func clock(sec: int) -> String:
	var h := sec / 3600
	var m := (sec % 3600) / 60
	var s := sec % 60
	return "%d:%02d:%02d" % [h, m, s] if h else "%d:%02d" % [m, s]


## Days and the clock to go: "9d 4:00:00" (the season panel), the clock alone under a day.
static func span(sec: int) -> String:
	return "%dd %s" % [sec / 86400, clock(sec % 86400)] if sec >= 86400 else clock(sec)


## Where a squad on the road is now (map px): from's centre to the crossing to to's centre, by time; queued: just
## inside the target. `art`: regions.json regions.
static func transit_pos(art: Dictionary, t: Dictionary, now: float) -> Array:
	var a: Dictionary = art.get(t["from"], {})
	var b: Dictionary = art.get(t["to"], {})
	if a.is_empty() or b.is_empty():
		return [0.0, 0.0]
	var ac: Array = a["centroid"]
	var bc: Array = b["centroid"]
	var c: Array = a["crossings"].get(t["to"], b["crossings"].get(t["from"], [(ac[0] + bc[0]) / 2.0, (ac[1] + bc[1]) / 2.0]))
	var f := 1.0 if t["state"] == "queued" else clampf((now - t["departAt"]) / maxf(1.0, t["arriveAt"] - t["departAt"]), 0.0, 1.0)
	var d1 := JsMath.hypot(c[0] - ac[0], c[1] - ac[1])
	var d2 := JsMath.hypot(bc[0] - c[0], bc[1] - c[1])
	if t["state"] == "queued":
		return [c[0] + (bc[0] - c[0]) * 0.18, c[1] + (bc[1] - c[1]) * 0.18]
	var s := f * (d1 + d2)
	if s <= d1:
		return [ac[0] + ((c[0] - ac[0]) * s) / d1, ac[1] + ((c[1] - ac[1]) * s) / d1]
	s -= d1
	return [c[0] + ((bc[0] - c[0]) * s) / d2, c[1] + ((bc[1] - c[1]) * s) / d2]


## The camera that fits the whole map (size W x H) into a view of view_w x view_h less the px kept free for panels:
## [k (screen px per map px), x, y (the map px at the view's top left)].
static func fit(art_size: Array, view_w: float, view_h: float, free: Dictionary) -> Array:
	var w: float = view_w - free["left"] - free["right"]
	var h: float = view_h - free["top"] - free["bottom"]
	var k := minf(w / art_size[0], h / art_size[1])
	return [k, -free["left"] / k - (w / k - art_size[0]) / 2.0, -free["top"] / k - (h / k - art_size[1]) / 2.0]


# ---------- the region card's words (regionCard.ts) ----------

const BIOME_NAME := {
	"dodona": "Oak forest", "skythia": "Steppe", "kyrene": "Desert", "elaia": "Terraced coast", "mountains": "Mountains",
	"marsh": "Marsh", "coast": "Coast", "plateau": "Plateau",
}
const DANGER := ["Weak beasts", "Low", "Moderate", "High", "Deadly"]
const GOOD_NAME := {
	"food": "Food", "wood": "Wood", "stone": "Stone", "iron": "Iron", "copper": "Copper", "tin": "Tin", "silver": "Silver",
	"horses": "Horses", "marble": "Marble", "salt": "Salt",
}
const AMOUNT := ["", "some", "plenty", "rich"]


## What the region is, in a few plain words: "Home of Kyrene", "Dodona borderland", "Wild land", "Heart of the world".
static func region_kind(id: String) -> String:
	var w := region(id)
	if w.is_empty():
		return ""
	var a: int = int(w["alliance"]) if w.get("alliance") != null else -1
	match w["role"]:
		"home":
			return "Home of %s" % alliance_name(a)
		"entry":
			return "%s borderland" % alliance_name(a)
		"center":
			return "Heart of the world"
	return "Wild land"


static func depth(id: String) -> int:
	return int(GameData.table("src/war/sim/depth")["REGION_DEPTH"].get(id, 1))


static func landmark_of(id: String) -> Dictionary:
	for l in GameData.table("src/data/warLandmarks")["LANDMARKS"]:
		if l["region"] == id:
			return l
	return {}


## The region's tags: [[text, cls, tip]] (home, market, chokepoint, fighting, siege, landmark).
static func region_tags(id: String, r: Variant) -> Array:
	var w := region(id)
	var out := []
	var rs: Dictionary = r if r is Dictionary else {}
	if w.get("role") == "home":
		out.append(["Home", "gold", "%s's home: it can never fall. Men wake here again." % alliance_name(int(w["alliance"]))])
	if is_market(id):
		out.append(["Market town", "gold", "A market: buy and sell goods here%s." % (". No fighting inside its market court" if geo()["FRONTIER_TOWNS"].has(id) else "")])
	if is_chokepoint(id):
		var where := ""
		for p in geo()["PURPOSE"].get(id, []):
			if String(p).begins_with("chokepoint"):
				var m := RegEx.create_from_string("\\(([^)]+)\\)").search(p)
				if m:
					where = m.get_string(1)
				break
		out.append(["Chokepoint", "", "The only road through%s: easy to block, ambush spots above it." % (" (%s)" % where if where != "" else "")])
	if rs.get("besieged", false):
		out.append(["Under siege", "bad", "Siege engines are at its walls."])
	elif rs.get("contested", false):
		out.append(["Fighting", "bad", "More than one alliance has troops here."])
	var lm := landmark_of(id)
	if rs.get("landmark") and not lm.is_empty():
		out.append(["Landmark", "", "%s: a guarded wonder; hold and restore it for its power." % lm["name"]])
	return out


## The card's primary action for a click's mode (enter, march, haul, squad): {label, act, key, hint}.
static func region_action(mode: String) -> Dictionary:
	match mode:
		"haul":
			return {"label": "Haul here", "act": "haul", "key": "Click", "hint": "Shift-click: haul from here"}
		"march":
			return {"label": "March here", "act": "march", "key": "Click", "hint": "Sends all your men"}
		"squad":
			return {"label": "Enter region", "act": "enter", "key": "⏎", "hint": "Click a glowing neighbour to march there"}
	return {"label": "Enter region", "act": "enter", "key": "⏎", "hint": "or double-click it"}
