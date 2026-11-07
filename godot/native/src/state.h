// Sim save and restore (src/war/sim/state.ts): the graph codec for the sim's live state. The C++ sim has no JS heap, so
// each module builds the object graph its TS twin hands to encodeGraph (sim_state.cpp, the modules' save / load): one Obj
// per JS object, array, Map, Set or typed array, keyed by the C++ object it stands for so shared references and cycles come
// out shared, with the TS key order. encode() then runs encodeGraph over it and writes the JSON text JSON.stringify gives
// (V8's number format, js::number_to_string); decode() parses such a text back into a graph the modules read from.
#pragma once

#include <cstdint>
#include <algorithm>
#include <cstring>
#include <deque>
#include <optional>
#include <string>
#include <type_traits>
#include <unordered_map>
#include <vector>

namespace sim::state {

// src/war/sim/state.ts STATE_VERSION: the save format (a save of another version does not load)
constexpr int STATE_VERSION = 2;

struct Obj;

// One JS value: undefined, null, a boolean, a number, a string, a reference to an object of the graph, or a constant
// object named by its externals() key (a building def, the region...).
struct Val {
	enum Kind : uint8_t { Undef, Null, Bool, Num, Str, Ref, Ext } k = Undef;
	bool b = false;
	double n = 0;
	std::string s; // Str: the string; Ext: the constant's key
	Obj *o = nullptr;

	Val() = default;
	Val(double v) : k(Num), n(v) {}
	Val(int v) : k(Num), n(v) {}
	Val(int64_t v) : k(Num), n(double(v)) {}
	Val(uint32_t v) : k(Num), n(v) {}
	Val(bool v) : k(Bool), b(v) {}
	Val(const char *v) : k(Str), s(v) {}
	Val(const std::string &v) : k(Str), s(v) {}
	Val(Obj *v) : k(v ? Ref : Null), o(v) {}
	static Val null() { Val v; v.k = Null; return v; }
	static Val ext(const std::string &key) { Val v; v.k = Ext; v.s = key; return v; }
	// a string, or null when empty (the TS `string | null` fields the C++ keeps as "")
	static Val strOrNull(const std::string &v) { return v.empty() ? null() : Val(v); }
	template <class T>
	static Val opt(const std::optional<T> &v) { return v ? Val(*v) : null(); }

	bool isNull() const { return k == Null; }
	bool isUndef() const { return k == Undef; }
	bool nullish() const { return k == Null || k == Undef; }
	double num() const { return n; }
	int i() const { return int(n); }
	const std::string &str() const { return s; }
	// the string, "" for null or undefined
	std::string strOr() const { return k == Str ? s : std::string(); }
};

// Typed-array element types, as their constructor names.
enum class TA : uint8_t { Int8, Uint8, Uint8Clamped, Int16, Uint16, Int32, Uint32, Float32, Float64 };
const char *ta_name(TA t);
int ta_size(TA t);
bool ta_of(const std::string &name, TA &out);

// One entry of the graph: 'o' a plain object (keys in insertion order), 'c' a class instance (name: its class, the Rng),
// 'a' an array, 'm' a Map (vals: key, value, key, value...), 's' a Set, 't' a typed array (its little-endian bytes).
struct Obj {
	char kind = 'o';
	std::vector<std::string> keys;
	std::vector<Val> vals;
	std::string name; // 'c': the class
	TA ta = TA::Uint8; // 't'
	std::vector<uint8_t> bytes; // 't'
	size_t length = 0; // 't': elements
	// decode: a typed array sent as a diff against the importing sim's own array ('d') or zeros ('z'): index, value pairs
	char form = 't';
	std::vector<std::pair<size_t, double>> diff;

	// plain objects: append a key (the TS insertion order)
	Obj &set(const char *key, const Val &v) {
		keys.emplace_back(key);
		vals.push_back(v);
		return *this;
	}
	// arrays and Sets: append an item; Maps: a key and its value
	Obj &push(const Val &v) {
		vals.push_back(v);
		return *this;
	}
	Obj &put(const Val &key, const Val &v) {
		vals.push_back(key);
		vals.push_back(v);
		return *this;
	}
	// decode side: the value of a key (undefined when absent), whether the key is there
	const Val &get(const char *key) const;
	bool has(const char *key) const;
	size_t size() const { return kind == 'm' ? vals.size() / 2 : vals.size(); }
	double elem(size_t j) const; // 't': element j as a number

	// typed arrays: apply this entry onto `data` (n elements of type T: the importing sim's fresh array for 'd')
	template <class T>
	void fill(T *data, size_t n) const {
		if (form == 't') std::memcpy(data, bytes.data(), std::min(bytes.size(), n * sizeof(T)));
		else {
			if (form == 'z') std::memset(data, 0, n * sizeof(T));
			for (auto &[j, v] : diff) {
				if constexpr (std::is_floating_point_v<T>) data[j] = T(v);
				else data[j] = T(int64_t(v));
			}
		}
	}
	template <class T>
	void fill(std::vector<T> &v) const {
		v.resize(length);
		fill(v.data(), length);
	}
};

// The graph under construction (save) or decoded (load). Objects are made through it; `of` keys an object by the C++
// thing it stands for, so a second reference to the same thing gets the same Obj.
class Graph {
	std::deque<Obj> pool;
	std::unordered_map<const void *, Obj *> by;
	std::unordered_map<std::string, Obj *> names;

public:
	Obj *make(char kind) {
		pool.emplace_back();
		pool.back().kind = kind;
		return &pool.back();
	}
	Obj *object() { return make('o'); }
	Obj *array() { return make('a'); }
	// the Obj already made for `key`, or nullptr
	Obj *find(const void *key) const {
		auto it = by.find(key);
		return it == by.end() ? nullptr : it->second;
	}
	// objects keyed by a name (a person by his id)
	Obj *named(const std::string &key) const {
		auto it = names.find(key);
		return it == names.end() ? nullptr : it->second;
	}
	void name(const std::string &key, Obj *o) { names[key] = o; }
	void bind(const void *key, Obj *o) { by[key] = o; }
	Obj *keyed(const void *key, char kind) {
		Obj *o = make(kind);
		by[key] = o;
		return o;
	}
	template <class T>
	Obj *typed(TA t, const std::vector<T> &v) { return typed(t, v.data(), v.size(), sizeof(T)); }
	Obj *typed(TA t, const void *data, size_t n, size_t elemSize);
	Obj *rng(uint32_t state) {
		Obj *o = make('c');
		o->name = "Rng";
		o->set("state", Val(state));
		return o;
	}
	// numbers as an array (number[] fields)
	template <class T>
	Obj *nums(const std::vector<T> &v) {
		Obj *o = array();
		o->vals.reserve(v.size());
		for (auto &x : v) o->vals.emplace_back(double(x));
		return o;
	}
	Obj *strs(const std::vector<std::string> &v) {
		Obj *o = array();
		for (auto &x : v) o->vals.emplace_back(x);
		return o;
	}
	std::deque<Obj> &all() { return pool; }
};

// state.ts encodeGraph + JSON.stringify of exportState's { v, region, seed, shapes, objs, root }. base: the same root of a
// fresh sim (its typed arrays are the diff baseline), or nullptr. head false: encodeGraph's own { shapes, objs, root }
// (the bots' exportState).
std::string encode(const Val &root, Obj *base, const std::string &region, uint32_t seed, bool head = true);

// A save parsed: v, region, seed and the graph (refs resolved; typed arrays left as their form and diff). False: a
// malformed text.
struct Decoded {
	int v = 0;
	std::string region;
	double seed = 0;
	Graph g;
	Val root;
};
bool decode(const std::string &text, Decoded &out, bool head = true);

// JSON.stringify of a string (quotes and escapes) and of a number (V8's Number::toString; finite).
void json_string(std::string &out, const std::string &s);

} // namespace sim::state
