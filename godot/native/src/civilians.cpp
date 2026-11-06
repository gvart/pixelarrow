#include "civilians.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <limits>

#include "professions.h"
#include "sim_data.h"

namespace sim {

static const CivilianTables &C() { return data().civilians; }

double fall_share(double ws, bool physician, double bandages, bool venom) {
	const CivilianTables &c = C();
	return std::max(0.0, std::min(data().soldiers.FALL.cap, ws + (physician ? c.PHYSICIAN.near : 0) + c.REMEDY.bandage * bandages - (venom ? c.VENOM.share : 0)));
}

std::string civ_job(const std::string &cls) { return C().CIV_CLASSES.count(cls) ? cls.substr(4) : ""; }

std::string civ_clip(const std::string &job) {
	const auto it = C().CLIP.find(job);
	return it == C().CLIP.end() ? "" : it->second;
}

bool at_building(const std::string &job) {
	const auto &a = C().AT_BUILDING;
	return std::find(a.begin(), a.end(), job) != a.end();
}

// JS Number(v) of an affix value ("" is 0; anything not a whole decimal number is NaN; undefined: NaN).
static double js_number(const std::optional<std::string> &v) {
	if (!v) return std::numeric_limits<double>::quiet_NaN();
	size_t a = 0, b = v->size();
	while (a < b && std::isspace((unsigned char)(*v)[a])) a++;
	while (b > a && std::isspace((unsigned char)(*v)[b - 1])) b--;
	if (a == b) return 0;
	const std::string s = v->substr(a, b - a);
	char *end = nullptr;
	const double x = std::strtod(s.c_str(), &end);
	return end == s.c_str() + s.size() ? x : std::numeric_limits<double>::quiet_NaN();
}

static std::vector<std::string> split(const std::string &s, char c) {
	std::vector<std::string> out;
	size_t at = 0;
	for (;;) {
		const size_t k = s.find(c, at);
		out.push_back(s.substr(at, k == std::string::npos ? std::string::npos : k - at));
		if (k == std::string::npos) return out;
		at = k + 1;
	}
}

ToolMods tool_mods(const Item *item) {
	ToolMods m;
	if (!item || !item->aff) return m;
	for (const std::string &part : split(*item->aff, ',')) {
		const std::vector<std::string> kv = split(part, ':');
		const std::string &k = kv[0];
		const std::optional<std::string> v = kv.size() > 1 ? std::optional<std::string>(kv[1]) : std::nullopt;
		if (k == "deft") m.deft += C().DEFT * js_number(v);
		if (k == "bountiful") m.bountiful += C().BOUNTIFUL * js_number(v);
	}
	return m;
}

double work_rate(double level, const Item *tool) {
	const CivilianTables &c = C();
	const auto def = tool ? c.CIV_TOOLS.find(tool->def) : c.CIV_TOOLS.end();
	const double tier = def != c.CIV_TOOLS.end() ? def->second : 1;
	double rar = 0;
	if (tool) {
		const auto it = std::find(c.RARITIES.begin(), c.RARITIES.end(), tool->rarity);
		rar = std::max(0.0, it == c.RARITIES.end() ? -1.0 : double(it - c.RARITIES.begin()));
	}
	return (1 + c.WORK.perLevel * (level - 1)) * (1 + c.WORK.perTier * (tier - 1) + c.WORK.perRarity * rar) * (1 + tool_mods(tool).deft); // M5h: Deft
}

CivHero fresh_civilian(const std::string &cls, const std::optional<std::string> &id_) {
	const std::string id = id_ ? *id_ : "war-" + cls;
	const CivClassDef &def = C().CIV_CLASSES.at(cls);
	CivHero h;
	h.id = id;
	h.name = def.name;
	h.culture = "greek";
	h.look.tunic = "tunicWhite";
	h.weapon.uid = id + "-tool";
	h.weapon.def = def.tools[0];
	h.weapon.rarity = "common";
	h.weapon.cond = 100;
	h.attrs = def.attrs;
	h.cls = cls;
	return h;
}

std::optional<std::pair<std::string, Item>> wornest(const CivEquip &equip) {
	std::optional<std::pair<std::string, Item>> best;
	for (const auto &[slot, it] : equip)
		if (it && it->cond < 100 && (!best || it->cond < best->second.cond)) best = std::make_pair(slot, *it);
	return best;
}

double flee_pace(bool flee) { return flee ? C().CIV.fleeSpeed : 1; }

double civ_room(bool roaming, double teams, double have, double townCap) {
	if (roaming) return C().CIV_QUOTA; // W-65: roaming folk are no team's civilians
	return std::floor(C().CIV_QUOTA / teams) + townCap - have; // M7a: a town's houses feed more
}

CivRates civ_rates(const std::string &civ, std::optional<double> work, const std::vector<std::string> &perks, double fxWork) {
	const CivilianTables &c = C();
	CivRates r;
	const double w = work ? *work : 1;
	if (civ == "forager") r.wrate = c.FORAGER.gather * w;
	else if (!civ.empty()) r.wrate = w;
	if (civ == "engineer") r.brate = c.ENGINEER.build * w;
	else if (!civ.empty()) r.brate = w;
	// M5h node effects: Master Builder, the forager's yields (Woodsman, Prospector, Pitchman, Herb Finder, Weaver), Field Surgeon
	std::optional<std::unordered_set<std::string>> held;
	if (!civ.empty()) held = held_nodes(civ, perks);
	if (held && held->count("masterBuilder") && r.brate && *r.brate != 0) *r.brate *= c.FORAGE.masterBuilder;
	// W-84: the demigod's quick hands, on every man of his who works
	if (fxWork != 0 && !std::isnan(fxWork)) r.wrate = (r.wrate ? *r.wrate : 1) * (1 + fxWork), r.brate = (r.brate ? *r.brate : 1) * (1 + fxWork);
	if (civ == "forager" && held) {
		std::vector<std::pair<std::string, double>> m;
		if (held->count("woodsman")) m.push_back({ "wood", c.FORAGE.woodsman });
		if (held->count("prospector")) // m.copper = m.tin = m.iron = m.silver = m.salt: assigned right to left
			for (const char *k : { "salt", "silver", "iron", "tin", "copper" }) m.push_back({ k, c.FORAGE.prospector });
		if (held->count("pitchman")) m.push_back({ "pitch", c.FORAGE.pitchman });
		r.gmul = m;
		r.herbs = held->count("herbFinder") > 0;
		r.flax = held->count("weaver") > 0;
	}
	r.fieldR = held && held->count("fieldSurgeon") ? c.PHYSICIAN.surgeonR : c.PHYSICIAN.r;
	return r;
}

} // namespace sim
