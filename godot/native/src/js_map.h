// JS Map and Set semantics where the order shows only in a save (state.ts walks them in insertion order): a key set again
// keeps its place, a deleted one goes, a new one goes last. Lookups by key as std::map; iteration in insertion order.
#pragma once

#include <list>
#include <map>
#include <utility>

namespace sim {

template <class K, class V>
class JsMap {
	std::list<std::pair<K, V>> items;
	std::map<K, typename std::list<std::pair<K, V>>::iterator> ix;

	void reindex() {
		ix.clear();
		for (auto it = items.begin(); it != items.end(); ++it) ix.emplace(it->first, it);
	}

public:
	JsMap() = default;
	JsMap(const JsMap &o) : items(o.items) { reindex(); }
	JsMap &operator=(const JsMap &o) {
		items = o.items;
		reindex();
		return *this;
	}
	using iterator = typename std::list<std::pair<K, V>>::iterator;
	using const_iterator = typename std::list<std::pair<K, V>>::const_iterator;
	iterator begin() { return items.begin(); }
	iterator end() { return items.end(); }
	const_iterator begin() const { return items.begin(); }
	const_iterator end() const { return items.end(); }
	iterator find(const K &k) {
		auto it = ix.find(k);
		return it == ix.end() ? items.end() : it->second;
	}
	const_iterator find(const K &k) const {
		auto it = ix.find(k);
		return it == ix.end() ? items.end() : const_iterator(it->second);
	}
	size_t count(const K &k) const { return ix.count(k); }
	V &operator[](const K &k) {
		auto it = ix.find(k);
		if (it != ix.end()) return it->second->second;
		items.emplace_back(k, V());
		ix.emplace(k, std::prev(items.end()));
		return items.back().second;
	}
	V &at(const K &k) { return ix.at(k)->second; }
	const V &at(const K &k) const { return ix.at(k)->second; }
	size_t erase(const K &k) {
		auto it = ix.find(k);
		if (it == ix.end()) return 0;
		items.erase(it->second);
		ix.erase(it);
		return 1;
	}
	iterator erase(iterator it) {
		ix.erase(it->first);
		return items.erase(it);
	}
	void clear() {
		items.clear();
		ix.clear();
	}
	size_t size() const { return items.size(); }
	bool empty() const { return items.empty(); }
};

template <class K>
class JsSet {
	std::list<K> items;
	std::map<K, typename std::list<K>::iterator> ix;

	void reindex() {
		ix.clear();
		for (auto it = items.begin(); it != items.end(); ++it) ix.emplace(*it, it);
	}

public:
	JsSet() = default;
	JsSet(const JsSet &o) : items(o.items) { reindex(); }
	JsSet &operator=(const JsSet &o) {
		items = o.items;
		reindex();
		return *this;
	}
	using const_iterator = typename std::list<K>::const_iterator;
	const_iterator begin() const { return items.begin(); }
	const_iterator end() const { return items.end(); }
	size_t count(const K &k) const { return ix.count(k); }
	bool insert(const K &k) {
		if (ix.count(k)) return false;
		items.push_back(k);
		ix.emplace(k, std::prev(items.end()));
		return true;
	}
	size_t erase(const K &k) {
		auto it = ix.find(k);
		if (it == ix.end()) return 0;
		items.erase(it->second);
		ix.erase(it);
		return 1;
	}
	void clear() {
		items.clear();
		ix.clear();
	}
	size_t size() const { return items.size(); }
	bool empty() const { return items.empty(); }
};

} // namespace sim
