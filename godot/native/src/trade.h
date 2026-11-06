// M6 trade in the region sim (src/war/sim/trade.ts), line for line: porters', carts' and safe zones' constants (from the
// exported table src/war/sim/trade, SimData.load "trade"), safe-zone rects and loot piles.
#pragma once

#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

#include "holders.h"

namespace sim {

struct TradeTables {
	struct { double loads, slow, every; } PORTER{};
	struct { double merge, max, reach, decay, wear, spoil, salvage; } PILE{};
	struct { double halt, resume, capture, beside, guard, reach, driver, captureXp, gatherR, crewLag, short_; } CART{};
	std::unordered_map<std::string, double> CART_LOADS; // handcart, wagon
	double PACK_MULES = 18;
	struct { double engage, leash, ring; } ESCORT{};
	struct { double tag, units, fighter; } SAFE{};
	double CLAIM_TICKS = 6000;
};
void load_trade(const godot::Dictionary &t, TradeTables &out);

struct Rect {
	double x, y, w, h;
};
inline bool in_rect(const Rect &r, double x, double y) { return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }
inline bool in_rects(const std::vector<Rect> *rs, double x, double y) {
	if (!rs) return false;
	for (const Rect &r : *rs)
		if (in_rect(r, x, y)) return true;
	return false;
}

// E3: a fallen man's kit: only `owner`'s squads take from it until tick `until`, then anyone.
struct PileClaim {
	std::string owner, name;
	double until;
};
struct Pile {
	int id;
	double x, y;
	Hold hold;
	double until, salv;
	int by;
	std::optional<PileClaim> claim;
};

// Loot piles of a region. Pointers returned stay valid until the next drop or tick.
class Piles {
public:
	std::vector<Pile> piles;
	int nextId = 0;

	// safe: the region's safe rects (RegionData.safe; null: none)
	explicit Piles(std::optional<std::vector<Rect>> safe) : safe_(std::move(safe)) {}

	Pile *drop(double x, double y, const std::vector<Lot> &lots, const std::vector<Item> &items, double tick, double spoilt = 0, const PileClaim *claim = nullptr);
	Pile *get(int id);
	bool open(const Pile &p, const std::string &owner, double tick) const { return !p.claim || p.claim->owner == owner || tick >= p.claim->until; }
	void tick(double tick);
	void load_root(int next_id) { nextId = next_id; }

private:
	std::optional<std::vector<Rect>> safe_;
};

} // namespace sim
