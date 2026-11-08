## The tables the C++ sim reads (SimData.load), as godot/tests/sim/test_traces.gd _load gathers them. Until the local
## room (P8) owns the game's start-up, the region view loads them through here.
class_name SimTables
extends RefCounted

const WILD := [
	"src/war/sim/depth", "src/war/sim/soldiers", "src/data/units", "src/data/perks", "src/war/sim/skills", "src/war/sim/honours",
	"src/war/sim/deeds", "src/war/sim/food", "src/war/sim/captives", "src/war/world/regions", "src/war/sim/mobs", "src/data/warWild",
	"src/data/warBosses", "src/war/world/start", "src/data/items", "src/data/affixes", "src/data/classes", "src/data/gearRules",
	"src/data/sets", "src/data/traits", "src/war/sim/classes", "src/data/warPerks", "src/war/sim/civilians",
]

static var _done := false


static func load() -> void:
	if _done:
		return
	_done = true
	var t := {"war_stats": GameData.table("derived/war_stats")["WAR_STATS"], "src/war/sim/civilians": GameData.table("src/war/sim/civilians")}
	for n in WILD:
		t[n] = GameData.table(n)
	for n in ["economy", "holders", "trade", "crafting", "works"]:
		t[n] = GameData.table("src/war/sim/" + n)
	t["town_level"] = GameData.table("src/war/sim/townLevel")
	for n in ["professions", "recipes", "items", "affixes", "classes"]:
		t[n] = GameData.table("src/data/" + n)
	t["derived_crafting"] = GameData.table("derived/crafting")
	t["siege"] = GameData.table("src/war/sim/siege")
	for n in ["src/war/sim/bosses", "src/war/sim/roam", "src/war/sim/prebuilt", "src/war/sim/roster", "src/data/names"]:
		t[n] = GameData.table(n)
	t["souls"] = GameData.table("src/war/sim/souls")
	t["landmarks"] = GameData.table("src/war/sim/landmarks")
	t["war_landmarks"] = GameData.table("src/data/warLandmarks")
	t["item_paint"] = GameData.table("derived/item_paint")
	t["derived_boss_loot"] = GameData.table("derived/boss_loot")
	var st := GameData.table("src/data/warStories")
	t["war_chiefs"] = GameData.table("src/data/warWild")["WAR_CHIEFS"]
	t["world_regions"] = GameData.table("src/war/world/regions")["WORLD_REGIONS"]
	t["hidden"] = st["HIDDEN"]
	t["hidden_text"] = st["HIDDEN_TEXT"]
	for n in ["src/war/sim/depth", "src/data/warWarlords", "src/war/sim/warlords", "src/war/world/regions", "src/war/world/alliances"]:
		t[n] = GameData.table(n)
	for n in ["src/war/sim/allianceAi", "src/war/sim/aiSeason", "src/war/world/season"]:
		t[n] = GameData.table(n)
	for n in ["src/data/classes", "src/data/items", "src/data/affixes"]:
		t[n] = GameData.table(n)
	for n in ["src/data/warNpcTowns", "src/data/warTownBoard"]: # the room's NPC towns and boards (npc_market.h, town_board.h)
		t[n] = GameData.table(n)
	# the room's life and the world: the guide, stories, encounters, the world events (net_guide.h, world.h)
	for n in ["src/war/net/guide", "src/war/net/mastery", "src/war/region/compact", "src/data/warStories", "src/war/world/events", "src/data/warEncounters", "src/war/sim/encounters"]:
		t[n] = GameData.table(n)
	SimData.load(t)
