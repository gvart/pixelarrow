## The world map's one input (docs/impl/godot-port.md P11): a world source hands it WorldViews, the exact shape the TS
## world screen gets (src/war/world-view/source.ts WorldView), and it keeps what the map draws (state.ts applyView).
##
## A WorldView, as JSON (src/war/net/world.ts):
##   snap      WorldSnapshot: {season, score: SeasonSnap, at (epoch ms), you: {id, alliance}, alliances, regions:
##             [RegionState {id, owner, claims, live, contested, besieged, landmark?, prestige?, ruined?, lords?}],
##             transit: [TransitSnap], events?: {active, next}, last?, crests?, crown?, convoys?, boards?}
##   squads    [{region, men, classes, ids}]: his one group where it stands (W-87)
##   waiting?  his men waiting at home; scores (per alliance, or null); endsAt (epoch ms, or null); quota (per
##             alliance); status; convoys?, boards?, titles?, ladders?
##
## A source is any object with `view() -> Dictionary` (that WorldView, now) and `transfer(from, to) -> Dictionary`
## ({ok: [TransitSnap]} or {error: text}), and optionally `tick(dt)`. Today WorldFixture (the TS mock world); the C++
## LocalWorld drops in as `feed.source = <LocalWorld>`.
class_name WorldFeed
extends RefCounted

signal changed

## Pulls the source's view this often (s), and at once after a transfer.
const PULL := 1.0

var source: Object
var view := {}
## id -> RegionState
var regions := {}
## Region id -> his men standing there.
var squads := {}
var transit := []
var you: Variant = null
## The world events running now; each warlord's pennants (WorldGeo.lord_marks).
var events := []
var lords := []
var _at := 0.0
var _since := 0.0
var _pull := 0.0


static func make(source_: Object) -> WorldFeed:
	var f := WorldFeed.new()
	f.source = source_
	f.push(source_.call("view"))
	return f


## The world's clock now (epoch ms): the last view's `at` plus the time since it came.
func now_ms() -> float:
	return _at + _since * 1000.0


## Copy a fresh view into the map's state.
func push(v: Dictionary) -> void:
	view = v
	var snap: Dictionary = v.get("snap", {})
	regions = {}
	for r in snap.get("regions", []):
		regions[r["id"]] = r
	transit = snap.get("transit", [])
	squads = {}
	for s in v.get("squads", []):
		squads[s["region"]] = int(s["men"])
	you = snap.get("you", {}).get("alliance")
	if you != null:
		you = int(you)
	_at = float(snap.get("at", 0.0))
	_since = 0.0
	var ev = snap.get("events")
	events = ev.get("active", []) if ev is Dictionary else []
	lords = WorldGeo.lord_marks(snap.get("regions", []), now_ms())
	changed.emit()


func tick(dt: float) -> void:
	_since += dt
	if source.has_method("tick"):
		source.call("tick", dt)
	_pull += dt
	if _pull >= PULL:
		_pull = 0.0
		push(source.call("view"))


## His whole group in `from` leaves for the neighbour `to`.
func transfer(from: String, to: String) -> Dictionary:
	var r: Dictionary = source.call("transfer", from, to)
	push(source.call("view"))
	return r


## The running events and the next as the snapshot has them.
func next_event() -> Variant:
	var ev = view.get("snap", {}).get("events")
	return ev.get("next") if ev is Dictionary else null


func sight(id: String) -> bool:
	return WorldGeo.in_sight(id, you, regions, squads)


func quota() -> int:
	var q: Array = view.get("quota", [])
	return int(q[you]) if you != null and you < q.size() else 150
