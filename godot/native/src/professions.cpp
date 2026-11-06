#include "professions.h"

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/string.hpp>

#include "sim_data.h"

namespace sim {

static std::string str(const godot::Variant &v) { return godot::String(v).utf8().get_data(); }

void load_professions(const godot::Dictionary &t, ProfTables &o) {
	const godot::Dictionary nodes = t["PROF_NODES"], roots = t["PROF_ROOT"];
	const godot::Array ids = nodes.keys(), profs = roots.keys();
	for (int64_t i = 0; i < ids.size(); i++) o.NODE_PROF[str(ids[i])] = str(godot::Dictionary(nodes[ids[i]])["prof"]);
	for (int64_t i = 0; i < profs.size(); i++) o.PROF_ROOT[str(profs[i])] = str(roots[profs[i]]);
}

std::unordered_set<std::string> held_nodes(const std::string &prof, const std::vector<std::string> &perks) {
	const ProfTables &P = data().professions;
	std::unordered_set<std::string> out{ P.PROF_ROOT.at(prof) };
	for (const std::string &id : perks) {
		const auto it = P.NODE_PROF.find(id);
		if (it != P.NODE_PROF.end() && it->second == prof) out.insert(id);
	}
	return out;
}

} // namespace sim
