// What the sim reads of the civilian profession trees (src/data/professions.ts): each node's tree and each tree's root,
// from the exported table src/data/professions (SimData.load "professions"), and heldNodes.
#pragma once

#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

namespace sim {

struct ProfTables {
	std::unordered_map<std::string, std::string> NODE_PROF; // PROF_NODES[id].prof
	std::unordered_map<std::string, std::string> PROF_ROOT;
};
void load_professions(const godot::Dictionary &t, ProfTables &out);

// The nodes a civilian of `prof` holds: his root and his picks of that tree (other ids in `perks` are ignored).
// Only membership is read, so an unordered set stands in for the TS Set.
std::unordered_set<std::string> held_nodes(const std::string &prof, const std::vector<std::string> &perks);

} // namespace sim
