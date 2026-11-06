#include "economy.h"

#include <cmath>
#include <cstdint>

#include <godot_cpp/variant/array.hpp>

#include "js_math.h"
#include "sim_data.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::String;

static std::string str(const godot::Variant &v) { return String(v).utf8().get_data(); }

Cost cost_of(const Dictionary &d) {
	Cost c;
	const Array ks = d.keys();
	for (int64_t i = 0; i < ks.size(); i++) c.set(str(ks[i]), double(d[ks[i]]));
	return c;
}

static BuildingDef building_of(const Dictionary &d) {
	BuildingDef b;
	b.w = d["w"];
	b.h = d["h"];
	b.hp = d["hp"];
	b.cost = cost_of(d["cost"]);
	b.labour = d["labour"];
	b.workers = d["workers"];
	b.influence = d["influence"];
	b.material = str(d["material"]);
	b.store = d.get("store", false);
	b.wall = str(d.get("wall", ""));
	b.perTile = d.get("perTile", false);
	if (d.has("yields")) {
		const Dictionary y = d["yields"];
		b.yields = BuildingDef::Yields{ str(y["res"]), y["max"], y["regrow"], y["rate"] };
	}
	b.tier = d.get("tier", 0.0);
	b.walk = d.get("walk", 0.0);
	b.cap = d.get("cap", 0.0);
	b.depth = d.get("depth", 0.0);
	b.access = str(d.get("access", ""));
	b.door = d.get("door", false);
	b.burnable = d.get("burnable", false);
	b.bridge = d.get("bridge", false);
	if (d.has("upgrade")) {
		const Dictionary u = d["upgrade"];
		b.upgrade = BuildingDef::Upgrade{ str(u["to"]), cost_of(u["cost"]), u["labour"] };
	}
	b.brazier = d.get("brazier", false);
	b.field = str(d.get("field", ""));
	if (d.has("workplace")) {
		const Dictionary w = d["workplace"];
		BuildingDef::Workplace wp{ str(w["kind"]), int(w["level"]), std::nullopt };
		if (w.has("spots")) {
			std::vector<Spot> spots;
			const Array sa = w["spots"];
			for (int64_t i = 0; i < sa.size(); i++) {
				const Array s = sa[i];
				spots.push_back(Spot{ s[0], s[1], s[2], s[3] });
			}
			wp.spots = spots;
		}
		b.workplace = wp;
	}
	b.chest = d.get("chest", 0.0);
	b.prebuilt = d.get("prebuilt", false);
	b.cache = d.get("cache", 0.0);
	b.house = d.get("house", false);
	return b;
}

void load_economy(const Dictionary &t, EconomyTables &o) {
	const Dictionary bs = t["BUILDINGS"];
	const Array types = bs.keys();
	for (int64_t i = 0; i < types.size(); i++) {
		o.types.push_back(str(types[i]));
		o.BUILDINGS[o.types.back()] = building_of(bs[types[i]]);
	}
	const Dictionary ns = t["RESOURCE_NODES"];
	const Array ids = ns.keys();
	for (int64_t i = 0; i < ids.size(); i++) {
		const Dictionary n = ns[ids[i]];
		o.RESOURCE_NODES[str(ids[i])] = NodeDef{ str(n["res"]), n["max"], n["regrow"], n["rate"], n["slots"], n.get("rare", false) };
	}
	o.NEUTRAL_TEAM = int(t["NEUTRAL_TEAM"]);
	const Dictionary ruin = t["RUIN"], rep = t["REPAIR"], walls = t["WALLS"], chest = t["CHEST"], staff = t["STAFF"], terms = t["TERMS"], lock = t["LOCK"];
	o.RUIN = { ruin["slow"], ruin["spill"], ruin["rebuild"] };
	o.REPAIR = { rep["step"], rep["cost"], rep["labour"] };
	o.WALLS = { walls["stoneMelee"] };
	o.CHEST = { chest["cap"], chest["guard"] };
	o.STAFF = { staff["every"], staff["reach"] };
	const Array access = t["ACCESS"];
	for (int64_t i = 0; i < access.size(); i++) o.ACCESS.push_back(str(access[i]));
	o.TERMS = { terms["share"], terms["fee"] };
	o.LOCK = { lock["wood"], lock["stone"], lock["perMan"], lock["tell"] };
	o.HOUSE = { Dictionary(t["HOUSE"])["cap"] };
	const Dictionary br = t["BRAZIER"], field = t["FIELD"], kiln = t["KILN"];
	o.BRAZIER = { br["radius"], br["pitch"], br["life"] };
	const Dictionary stakes = field["stakes"], ditch = field["ditch"];
	o.FIELD_STAKES = { stakes["slow"], stakes["dmg"] };
	o.FIELD_DITCH = { ditch["slow"], ditch["dmg"] };
	o.KILN = { kiln["wood"], kiln["pineR"], kiln["pineBoost"], kiln["pineMax"], kiln["fromPine"] };
	const Array pines = t["PINES"];
	for (int64_t i = 0; i < pines.size(); i++) o.PINES.insert(str(pines[i]));
	const Dictionary bridge = t["BRIDGE"], span = bridge["maxSpan"], kit = bridge["kit"];
	o.BRIDGE.maxSpanWood = span["wood"];
	o.BRIDGE.maxSpanStone = span["stone"];
	const Array widths = bridge["widths"];
	for (int64_t i = 0; i < widths.size(); i++) o.BRIDGE.widths.push_back(widths[i]);
	o.BRIDGE.width = bridge["width"];
	o.BRIDGE.piece = bridge["piece"];
	o.BRIDGE.ramp = bridge["ramp"];
	o.BRIDGE.cost = bridge["cost"];
	o.BRIDGE.kitWood = str(kit["wood"]);
	o.BRIDGE.kitStone = str(kit["stone"]);
	const Dictionary wk = t["WALL_KIT"];
	const auto kit_of = [&](const char *m) {
		const Dictionary k = wk[m];
		return EconomyTables::Kit{ str(k["segment"]), str(k["tower"]), str(k["gate"]) };
	};
	o.WALL_KIT_WOOD = kit_of("wood");
	o.WALL_KIT_TIMBER = kit_of("timber");
	o.WALL_KIT_STONE = kit_of("stone");
	o.SEGMENT = t["SEGMENT"];
	o.CARRY = t["CARRY"];
	o.CLAIM_RADIUS = t["CLAIM_RADIUS"];
	o.CANCEL_REFUND = t["CANCEL_REFUND"];
	const Dictionary dem = t["DEMOLISH"];
	o.DEMOLISH = { dem["refund"], dem["ticks"] };
	o.WORK_DEFENCE = t["WORK_DEFENCE"];
}

const BuildingDef &building(const std::string &type) { return data().economy.BUILDINGS.at(type); }

std::array<double, 2> rotated(const std::string &type, int rot) {
	const BuildingDef &d = building(type);
	return rot ? std::array<double, 2>{ d.h, d.w } : std::array<double, 2>{ d.w, d.h };
}

std::vector<int> rect_tiles(double x, double y, double w, double h) {
	const double x0 = js::round(x - w / 2), y0 = js::round(y - h / 2);
	std::vector<int> out;
	for (double ty = y0; ty < y0 + h; ty++)
		for (double tx = x0; tx < x0 + w; tx++) {
			out.push_back(int(tx));
			out.push_back(int(ty));
		}
	return out;
}

static double sign(double v) { return v > 0 ? 1 : v < 0 ? -1 : v; } // Math.sign (0 and -0 kept)

std::vector<int> line_tiles(const std::vector<double> &points) {
	std::vector<int> out;
	std::unordered_set<int64_t> seen; // membership only
	const auto push = [&](double x, double y) {
		const int64_t k = int64_t(y * 65536 + x);
		if (seen.count(k)) return;
		seen.insert(k);
		out.push_back(int(x));
		out.push_back(int(y));
	};
	for (size_t i = 0; i + 1 < points.size(); i += 2) {
		double x = std::floor(points[i]), y = std::floor(points[i + 1]);
		push(x, y);
		if (i + 3 >= points.size()) break;
		const double x1 = std::floor(points[i + 2]), y1 = std::floor(points[i + 3]);
		const double dx = std::abs(x1 - x), dy = std::abs(y1 - y), sx = sign(x1 - x), sy = sign(y1 - y);
		// walk the grid: each step moves along x or y (never both), whichever keeps nearer the line
		for (double ix = 0, iy = 0; ix < dx || iy < dy;) {
			if ((0.5 + ix) / dx < (0.5 + iy) / dy) x += sx, ix++;
			else y += sy, iy++;
			push(x, y);
		}
	}
	return out;
}

double lock_of(const BuildingDef &d) {
	const EconomyTables &E = data().economy;
	return d.house || d.store ? (d.material == "wood" ? E.LOCK.wood : E.LOCK.stone) : 0;
}

// W-88: what needs nobody to stand there (code, not a table: economy.ts keeps it unexported).
static const std::unordered_set<std::string> PASSIVE_TYPES{ "well", "statue", "board", "house", "cottage", "tent" };

bool needs_person(const std::string &t, const BuildingDef &d) {
	return !PASSIVE_TYPES.count(t) && d.wall != "segment" && d.wall != "gate" && !d.bridge && d.access.empty() && d.field.empty() && !d.brazier && !d.chest && !d.cache;
}

} // namespace sim
