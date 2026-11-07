// Shared pieces of the modules' saves and loads (sim_state.cpp): the shapes several modules hold (items, costs, holds,
// stats) and Variant <-> graph for the dictionaries the C++ keeps as JSON (events, orders, persons).
#pragma once

#include <optional>
#include <vector>

#include <godot_cpp/variant/variant.hpp>

#include "classes.h"
#include "holders.h"
#include "item.h"
#include "state.h"

namespace sim {

state::Val state_of(state::Graph &g, const godot::Variant &v);
godot::Variant variant_of(const state::Val &v);

state::Val save_item(state::Graph &g, const Item &it);
Item load_item(const state::Val &v);
state::Val save_cost(state::Graph &g, const Cost &c);
Cost load_cost(const state::Val &v);
state::Val save_hold(state::Graph &g, const Hold &h);
Hold load_hold(const state::Val &v);
std::optional<Hold> load_opt_hold(const state::Val &v);
state::Val save_stats(state::Graph &g, const WarStats &s);
WarStats load_stats(const state::Obj *o);

// a typed array from the graph into a vector of its length (the fresh sim's own content under a diff)
template <class T>
void load_typed(const state::Val &v, std::vector<T> &out) {
	if (v.k == state::Val::Ref) v.o->fill(out);
}
// number[] fields
template <class T>
std::vector<T> load_nums(const state::Val &v) {
	std::vector<T> out;
	if (v.k == state::Val::Ref)
		for (const state::Val &x : v.o->vals) out.push_back(T(x.n));
	return out;
}
inline std::vector<std::string> load_strs(const state::Val &v) {
	std::vector<std::string> out;
	if (v.k == state::Val::Ref)
		for (const state::Val &x : v.o->vals) out.push_back(x.s);
	return out;
}

} // namespace sim
