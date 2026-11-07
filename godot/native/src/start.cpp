#include "start.h"

#include <algorithm>
#include <limits>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/string.hpp>

#include "sim_data.h"

namespace sim {

static std::string u8(const godot::Variant &v) { return godot::String(v).utf8().get_data(); }

void load_start_tables(const godot::Dictionary &tables, StartTables &out) {
	if (!tables.has("src/war/world/start")) return;
	const godot::Dictionary m = tables["src/war/world/start"];
	const godot::Dictionary paths = m["PATHS"];
	const godot::Array ids = m["PATH_IDS"];
	for (int64_t i = 0; i < ids.size(); i++) {
		const godot::Dictionary p = paths[ids[i]];
		out.PATHS.push_back({ u8(ids[i]), { p["cap"], p["workers"], p["carts"] } });
	}
	const godot::Dictionary fs = m["FAMILIES"];
	const godot::Array fk = fs.keys();
	for (int64_t i = 0; i < fk.size(); i++) {
		const godot::Dictionary un = godot::Dictionary(fs[fk[i]])["unlocks"];
		std::map<std::string, double> &v = out.FAMILIES[u8(fk[i])];
		const godot::Array ck = un.keys();
		for (int64_t k = 0; k < ck.size(); k++) v[u8(ck[k])] = un[ck[k]];
	}
}

static const StartTables::Path *path_of(const std::string &id) {
	for (const auto &[k, p] : data().start.PATHS)
		if (k == id) return &p;
	return nullptr;
}

// the most any path has (Math.max of none: -Infinity)
static double most(double StartTables::Path::*k) {
	double m = -std::numeric_limits<double>::infinity();
	for (const auto &[id, p] : data().start.PATHS) m = std::max(m, p.*k);
	return m;
}

double soldier_cap(const std::string &path) { return !path.empty() ? path_of(path)->cap : most(&StartTables::Path::cap); }
double worker_cap(const std::string &path) { return !path.empty() ? path_of(path)->workers : most(&StartTables::Path::workers); }
double cart_cap(const std::string &path) { return !path.empty() ? path_of(path)->carts : most(&StartTables::Path::carts); }

static bool is_civ(const std::string &cls) { return data().civilians.CIV_CLASSES.count(cls) > 0; }

static std::optional<std::string> family_of(const std::string &cls) {
	const auto it = data().skills.FAMILY_OF.find(cls);
	return it != data().skills.FAMILY_OF.end() ? std::optional<std::string>(it->second) : std::nullopt;
}

bool may_hold(const PlayerPath &p, const std::string &cls) {
	if (p.path.empty() || is_civ(cls)) return true;
	const std::optional<std::string> fam = family_of(cls);
	if (p.path != "warrior") return fam && *fam != "rider";
	return fam && *fam == p.family && p.level.value_or(1) >= unlock_level(p.family, cls);
}

double unlock_level(const std::string &family, const std::string &cls) {
	if (family.empty()) return 1;
	const auto f = data().start.FAMILIES.find(family);
	if (f == data().start.FAMILIES.end()) return 1;
	const auto it = f->second.find(cls);
	return it != f->second.end() && it->second ? it->second : 1;
}

std::string man_refusal(const PlayerPath &p, const std::string &cls, double soldiers, double workers) {
	if (!may_hold(p, cls)) {
		const std::optional<std::string> fam = family_of(cls);
		return p.path == "warrior" && fam && *fam == p.family ? "locked" : "family";
	}
	if (is_civ(cls)) return workers >= worker_cap(p.path) ? "household" : "";
	return soldiers >= soldier_cap(p.path) ? "full" : "";
}

PlayerPath player_path_from(const godot::Dictionary &d) {
	PlayerPath p;
	if (d.has("path") && d["path"].get_type() != godot::Variant::NIL) p.path = u8(d["path"]);
	if (d.has("family") && d["family"].get_type() != godot::Variant::NIL) p.family = u8(d["family"]);
	if (d.has("level") && d["level"].get_type() != godot::Variant::NIL) p.level = double(d["level"]);
	return p;
}

} // namespace sim
