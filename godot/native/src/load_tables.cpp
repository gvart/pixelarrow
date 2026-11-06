#include "load_tables.h"

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/string.hpp>

#include "sim_data.h"

using godot::Array;
using godot::Dictionary;
using godot::String;
using godot::Variant;

namespace sim {

static std::string str(const Variant &v) { return String(v).utf8().get_data(); }
static std::optional<double> opt(const Dictionary &d, const char *k) { return d.has(k) ? std::optional<double>(double(d[k])) : std::nullopt; }
static Dictionary sub(const Dictionary &d, const char *k) { return d[k]; }

static void load_depth(DepthTables &t, const Dictionary &m) {
	const Array rules = m["DEPTH"];
	for (int64_t i = 0; i < rules.size(); i++) {
		const Dictionary r = rules[i];
		DepthRule o;
		o.mob = r["mob"];
		o.respawn = r["respawn"];
		const Dictionary c = r["claim"];
		o.claim.ticks = c["ticks"];
		o.claim.men = c["men"];
		o.claim.players = c["players"];
		o.yield = r["yield"];
		const Array l = r["lairs"];
		o.lairs[0] = l[0];
		o.lairs[1] = l[1];
		o.score = r["score"];
		t.rules.push_back(o);
	}
	const Dictionary rd = m["REGION_DEPTH"];
	const Array ids = rd.keys();
	for (int64_t i = 0; i < ids.size(); i++) t.region_depth[str(ids[i])] = rd[ids[i]];
	const Dictionary h = m["HOST"];
	t.host.captain.hp = sub(h, "captain")["hp"];
	t.host.captain.dmg = sub(h, "captain")["dmg"];
	t.host.guard.hp = sub(h, "guard")["hp"];
	t.host.guard.dmg = sub(h, "guard")["dmg"];
	t.host.raid.every = sub(h, "raid")["every"];
	t.host.raid.men = sub(h, "raid")["men"];
	t.host.raid.r = sub(h, "raid")["r"];
	const Dictionary e = m["EARLY"];
	t.early = { e["depth"], e["clear"], e["rise"], e["hp"], e["giveUp"], e["again"] };
}

static void load_soldiers(SoldierTables &t, const Dictionary &m) {
	t.ARMY_MAX = int(m["ARMY_MAX"]);
	t.SQUAD_MAX = int(m["SQUAD_MAX"]);
	const Dictionary f = m["FALL"];
	t.FALL = { f["wounded"], f["perEnd"], f["physician"], f["cap"] };
	const Dictionary x = m["XP"];
	t.XP = { x["perDmg"], x["kill"], x["survived"], x["objective"] };
	t.CAPTURE_R = m["CAPTURE_R"];
}

static void load_skills(SkillTables &t, const Dictionary &m) {
	const Dictionary fam = m["FAMILY_OF"];
	for (const Variant &k : Array(fam.keys())) t.FAMILY_OF[str(k)] = str(fam[k]);
	const Dictionary f = m["F"];
	for (const Variant &k : Array(f.keys())) t.F[str(k)] = f[k];
	t.MAX_FLAGS = m["MAX_FLAGS"];
	const Dictionary fx = m["FLAG_FX"];
	t.FLAG_FX = { fx["holdBlock"], fx["finishDmg"], fx["finishHp"], fx["fireReach"], fx["firePitch"] };
	const Dictionary sk = m["SKILLS"];
	for (const Variant &k : Array(sk.keys())) {
		const Dictionary d = sk[k];
		SkillDef s;
		s.family = str(d["family"]);
		s.kind = str(d["kind"])[0];
		s.dmg = opt(d, "dmg");
		s.reach = opt(d, "reach");
		s.armor = opt(d, "armor");
		s.block = opt(d, "block");
		s.accuracy = opt(d, "accuracy");
		s.range = opt(d, "range");
		s.ammo = opt(d, "ammo");
		s.bp = opt(d, "bp");
		s.flag = opt(d, "flag");
		t.SKILLS[str(k)] = s;
	}
	const Dictionary pool = m["SKILL_POOL"];
	for (const Variant &k : Array(pool.keys())) {
		auto &v = t.SKILL_POOL[str(k)];
		for (const Variant &id : Array(pool[k])) v.push_back(str(id));
	}
	for (const Variant &l : Array(m["SKILL_LEVELS"])) t.SKILL_LEVELS.push_back(l);
	const Dictionary act = m["ACTIVES"];
	for (const Variant &k : Array(act.keys())) t.ACTIVES[str(k)] = { sub(act, str(k).c_str())["out"], sub(act, str(k).c_str())["in"] };
	const Dictionary a = m["ACTIVE"];
	t.ACTIVE = { a["cooldown"], a["perWil"], a["buff"] };
}

static void load_deeds(DeedTables &t, const Dictionary &m) {
	t.DEEDS_MAX = m["DEEDS_MAX"];
	t.SCARS_MAX = m["SCARS_MAX"];
	const Dictionary d = m["DEED"];
	t.DEED = { d["gate"], d["last"], d["slayer"] };
	const Dictionary n = m["DEED_NAME"];
	for (const Variant &k : Array(n.keys())) t.DEED_NAME[str(k)] = str(n[k]);
}

static void load_food(FoodTables &t, const Dictionary &m) {
	const Dictionary h = m["HUNGER"];
	HungerRules &H = t.HUNGER;
	H.max = h["max"];
	H.decay = h["decay"];
	H.eatAt = h["eatAt"];
	H.hungry = h["hungry"];
	H.starving = h["starving"];
	H.ration = h["ration"];
	H.food = h["food"];
	H.kit = h["kit"];
	H.packFood = h["packFood"];
	H.storeR = h["storeR"];
	H.every = h["every"];
	H.drain = h["drain"];
	H.floor = h["floor"];
	const Array p = h["pace"], a = h["attack"];
	for (int i = 0; i < 3; i++) H.pace[i] = p[i], H.attack[i] = a[i];
	for (const Variant &n : Array(m["HUNGER_NAMES"])) t.HUNGER_NAMES.push_back(str(n));
}

static void load_mobs(MobTables &t, const Dictionary &m) {
	t.MOB_TEAM = int(m["MOB_TEAM"]);
	t.MOB_OWNER = str(m["MOB_OWNER"]);
	const Dictionary mobs = m["MOBS"];
	for (const Variant &k : Array(mobs.keys())) {
		const Dictionary d = mobs[k];
		MobDef o;
		o.base = str(d["base"]);
		o.hp = d["hp"];
		o.dmg = d["dmg"];
		o.speed = d["speed"];
		o.atk = opt(d, "atk");
		o.armor = opt(d, "armor");
		o.block = opt(d, "block");
		o.reach = opt(d, "reach");
		o.knock = opt(d, "knock");
		o.venom = d.get("venom", false);
		o.count = d["count"];
		o.aggro = d["aggro"];
		o.leash = d["leash"];
		o.passive = d.get("passive", false);
		o.skittish = opt(d, "skittish");
		if (d.has("dash")) {
			const Dictionary x = d["dash"];
			MobDash dash;
			dash.min = x["min"];
			dash.max = x["max"];
			dash.ticks = x["ticks"];
			dash.speed = x["speed"];
			dash.cd = x["cd"];
			dash.dmg = x["dmg"];
			dash.knock = opt(x, "knock");
			dash.once = x.get("once", false);
			o.dash = dash;
		}
		o.cry = d.has("cry") ? str(d["cry"]) : "";
		t.MOBS[str(k)] = o;
	}
	for (const Variant &k : Array(m["MOB_KINDS"])) t.MOB_KINDS.push_back(str(k));
	t.GUARD_R = m["GUARD_R"];
	t.RESPAWN = m["RESPAWN"];
	const Dictionary c = m["CLAIM"];
	t.CLAIM = { c["ticks"], c["men"], c["at"], c["contest"], c["r"] };
}

static void load_wild(WildTables &t, const Dictionary &m) {
	const Dictionary ks = m["CHIEF_KINDS"];
	for (const Variant &k : Array(ks.keys())) {
		const Dictionary d = ks[k];
		t.CHIEF_KINDS[str(k)] = { d["scale"], d["tint"], d["hp"], d["dmg"], d["armor"], d["escort"] };
	}
	for (const Variant &v : Array(m["WAR_CHIEFS"])) {
		const Dictionary d = v;
		t.WAR_CHIEFS.push_back({ str(d["id"]), str(d["name"]), str(d["title"]), str(d["kind"]) });
	}
}

static void load_bosses(BossTables &t, const Dictionary &m) {
	for (const Variant &v : Array(m["WAR_BOSSES"])) {
		const Dictionary d = v;
		WarBoss b{ str(d["id"]), str(d["name"]), d.has("deed") ? std::optional<std::string>(str(d["deed"])) : std::nullopt };
		b.tier = int(d["tier"]);
		for (const Variant &s : Array(d["signature"])) b.signature.push_back(str(s));
		for (const Variant &p : Array(d["phases"])) b.phases.push_back(p);
		if (d.has("rare")) b.rare = WarBoss::Rare{ str(sub(d, "rare")["good"]), sub(d, "rare")["n"] };
		t.WAR_BOSSES.push_back(b);
	}
	const Dictionary tiers = m["BOSS_TIERS"];
	for (const Variant &k : Array(tiers.keys())) {
		const Dictionary d = tiers[k];
		BossTier o;
		o.picks = int(d["picks"]);
		for (const Variant &e : Array(d["rarity"])) o.rarity.push_back({ str(Array(e)[0]), Array(e)[1] });
		o.minTier = d["minTier"];
		o.trophy = d["trophy"];
		o.signature = d["signature"];
		t.BOSS_TIERS[String(k).to_int()] = o;
	}
}

static void load_world(CaptiveTables &t, const Dictionary &m) {
	for (const Variant &v : Array(m["WORLD_REGIONS"])) {
		const Dictionary d = v;
		const Dictionary pos = d["pos"];
		t.WORLD_REGIONS.push_back({ str(d["id"]), pos["x"], pos["y"] });
	}
}

static void load_civilians(CivilianTables &t, const Dictionary &c) {
	t.REGION_CAP = c["REGION_CAP"];
	const Dictionary v = c["CIV"], k = c["COOK"], s = c["SMITH"], f = c["FORAGE"], h = c["HUNT"], w = c["WORK"], clip = c["CLIP"];
	t.CIV = { v["quota"], v["fleeR"], v["calmR"], v["calm"], v["fleeSpeed"], v["away"], v["every"], v["at"], v["dmg"], v["armor"], v["hp"] };
	t.CIV_QUOTA = c["CIV_QUOTA"];
	t.COOK = { k["batch"], k["food"], k["salt"], k["rations"], k["saltBonus"], k["feedR"], k["fedTicks"], k["inn"], k["heal"] };
	t.SMITH = { s["batch"], s["copper"], s["tin"], s["bronze"], s["repairR"], s["repair"] };
	t.ENGINEER.build = sub(c, "ENGINEER")["build"];
	t.FORAGER.gather = sub(c, "FORAGER")["gather"];
	t.FORAGE = { f["woodsman"], f["prospector"], f["pitchman"], f["masterBuilder"] };
	t.HUNT = { h["r"], h["hides"] };
	t.CIV_XP = c["CIV_XP"];
	t.WORK = { w["perLevel"], w["perTier"], w["perRarity"] };
	const Array ks = clip.keys();
	for (int64_t i = 0; i < ks.size(); i++) t.CLIP[str(ks[i])] = str(clip[ks[i]]);
	const Array at = c["AT_BUILDING"];
	t.AT_BUILDING.clear();
	for (int64_t i = 0; i < at.size(); i++) t.AT_BUILDING.push_back(str(at[i]));
}

static void load_civ_classes(CivilianTables &t, const Dictionary &m) {
	const Dictionary cc = m["CIV_CLASSES"], tools = m["CIV_TOOLS"];
	Array ks = cc.keys();
	for (int64_t i = 0; i < ks.size(); i++) {
		const Dictionary d = cc[ks[i]], a = d["attrs"];
		CivClassDef def;
		def.name = str(d["name"]);
		const Array ak = a.keys();
		for (int64_t j = 0; j < ak.size(); j++) def.attrs.push_back({ str(ak[j]), a[ak[j]] });
		const Array tl = d["tools"];
		for (int64_t j = 0; j < tl.size(); j++) def.tools.push_back(str(tl[j]));
		t.CIV_CLASSES[str(ks[i])] = def;
	}
	ks = tools.keys();
	for (int64_t i = 0; i < ks.size(); i++) t.CIV_TOOLS[str(ks[i])] = int(sub(tools, String(ks[i]).utf8().get_data())["tier"]);
}

void load_tables(Data &d, const Dictionary &tables) {
	const auto has = [&](const char *k) { return tables.has(k); };
	const auto at = [&](const char *k) -> Dictionary { return tables[k]; };
	if (has("src/war/sim/depth")) load_depth(d.depth, at("src/war/sim/depth"));
	if (has("src/war/sim/soldiers")) load_soldiers(d.soldiers, at("src/war/sim/soldiers"));
	if (has("src/data/units")) d.soldiers.MAX_LEVEL = at("src/data/units")["MAX_LEVEL"];
	if (has("src/data/perks")) d.soldiers.POINTS_PER_LEVEL = at("src/data/perks")["POINTS_PER_LEVEL"];
	if (has("src/war/sim/skills")) load_skills(d.skills, at("src/war/sim/skills"));
	if (has("src/war/sim/honours")) d.honours.HONOURS_MAX = at("src/war/sim/honours")["HONOURS_MAX"];
	if (has("src/war/sim/deeds")) load_deeds(d.deeds, at("src/war/sim/deeds"));
	if (has("src/war/sim/food")) load_food(d.food, at("src/war/sim/food"));
	if (has("src/war/sim/captives")) {
		const Dictionary c = at("src/war/sim/captives")["CAPTIVE"];
		d.captives.CAPTIVE = { c["askMs"], c["holdMs"], c["refuse"], c["refusePerLevel"], c["soulMs"], c["barMs"] };
	}
	if (has("src/war/world/regions")) load_world(d.captives, at("src/war/world/regions"));
	if (has("src/war/sim/civilians")) {
		const Dictionary c = at("src/war/sim/civilians");
		const Dictionary p = c["PHYSICIAN"], r = c["REMEDY"], v = c["VENOM"];
		d.civilians.PHYSICIAN = { p["r"], p["surgeonR"], p["heal"], p["near"] };
		d.civilians.REMEDY = { r["bandage"], r["feedR"], r["theriac"] };
		d.civilians.VENOM = { v["ticks"], v["share"] };
		load_civilians(d.civilians, c);
	}
	if (has("src/data/classes")) load_civ_classes(d.civilians, at("src/data/classes"));
	if (has("src/data/items")) {
		const Array r = at("src/data/items")["RARITIES"];
		d.civilians.RARITIES.clear();
		for (int64_t i = 0; i < r.size(); i++) d.civilians.RARITIES.push_back(str(r[i]));
	}
	if (has("src/data/affixes")) {
		const Dictionary a = at("src/data/affixes")["AFFIXES"];
		d.civilians.DEFT = sub(a, "deft")["step"];
		d.civilians.BOUNTIFUL = sub(a, "bountiful")["step"];
	}
	if (has("src/war/sim/mobs")) load_mobs(d.mobs, at("src/war/sim/mobs"));
	if (has("src/data/warWild")) load_wild(d.wild, at("src/data/warWild"));
	if (has("src/data/warBosses")) load_bosses(d.bosses, at("src/data/warBosses"));
}

} // namespace sim
