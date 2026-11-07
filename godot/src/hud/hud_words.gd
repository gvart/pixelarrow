## The plain words the HUD shows (W-70: no ids, no jargon): class and building names, what a squad is doing, why an
## order or a join was refused. From the DOM HUD (src/war/view/hud/hud.ts CLASS_NAME, squadState.ts, kit.ts icons).
class_name HudWords
extends RefCounted

const CLASS_NAME := {"militia": "Militia", "hoplite": "Hoplites", "celt_sword": "Swordsmen", "archer": "Archers", "slinger": "Slingers", "javelineer": "Javelineers"}
const UNIT_ICON := {"militia": "unit-militia", "hoplite": "unit-hoplite", "celt_sword": "unit-swordsman", "archer": "unit-archer", "slinger": "unit-slinger", "javelineer": "unit-javelineer"}
const DOING := {"idle": "Standing", "move": "Marching", "attack": "Fighting", "hold": "Holding", "attackMove": "Advancing", "stop": "Standing",
	"gather": "Gathering", "build": "Building", "formation": "Forming up", "civWork": "Working", "claimRegion": "Claiming", "claimSoul": "Fetching a soul"}
const BUILDING_NAME := {"camp": "Camp", "storehouse": "Storehouse", "outpost": "Outpost", "fort": "Fort", "farm": "Farm", "olivePress": "Olive press", "barracks": "Barracks"}
const BUILDING_ICON := {"camp": "bld-camp", "storehouse": "bld-storehouse", "outpost": "bld-outpost", "fort": "bld-fort", "farm": "bld-farm", "olivePress": "bld-olive-press", "barracks": "bld-barracks"}
const GOOD_ICON := {"food": "res-food", "wood": "res-wood", "stone": "res-stone", "iron": "res-iron", "coin": "res-coin", "marble": "res-marble"}
const ERROR := {
	"notOwner": "Those men are not yours", "notJoined": "Your army has not arrived yet", "badTarget": "Can't do that there",
	"bad": "That order did not work", "forbidden": "Not allowed here", "notYourGround": "Not your ground", "atPeace": "You are at peace with them",
	"notAllowed": "Not allowed",
}
const REFUSED := {
	"version": "This game is out of date", "region": "This region is closed", "player": "You are already here", "team": "You fight for another side here",
	"army": "Your army can't enter", "squads": "You lead too many squads", "quota": "The region is full",
}
const PLACE_WHY := {
	"bounds": "Off the map", "noBuild": "This ground is kept clear", "water": "Water", "rock": "Rock", "blocked": "Blocked",
	"overlap": "Overlaps a building", "influence": "Not your ground: build round your town", "slope": "Too steep", "node": "On a resource",
}


static func class_name_of(cls: String) -> String:
	return CLASS_NAME.get(cls, cls.capitalize())


static func unit_icon(cls: String) -> String:
	return UNIT_ICON.get(cls, "unit-militia")


static func doing(order: String) -> String:
	return DOING.get(order, order.capitalize())


static func men(n: int) -> String:
	return "%d %s" % [n, "man" if n == 1 else "men"]


## Big numbers short: 1234 -> 1234, 12345 -> 12.3k.
static func num(n: float) -> String:
	if n >= 100000:
		return "%dk" % int(n / 1000)
	if n >= 10000:
		return "%.1fk" % (n / 1000.0)
	return str(int(n))


static func cost_words(cost: Dictionary) -> String:
	if cost.is_empty():
		return "Free"
	var parts := PackedStringArray()
	for k in cost:
		parts.append("%d %s" % [int(cost[k]), k])
	return ", ".join(parts)
