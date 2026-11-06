#include "trade.h"

#include "js_math.h"
#include "sim_data.h"

namespace sim {

using godot::Dictionary;

void load_trade(const Dictionary &t, TradeTables &o) {
	const Dictionary porter = t["PORTER"], pile = t["PILE"], cart = t["CART"], loads = t["CART_LOADS"], escort = t["ESCORT"], safe = t["SAFE"];
	o.PORTER = { porter["loads"], porter["slow"], porter["every"] };
	o.PILE = { pile["merge"], pile["max"], pile["reach"], pile["decay"], pile["wear"], pile["spoil"], pile["salvage"] };
	o.CART = { cart["halt"], cart["resume"], cart["capture"], cart["beside"], cart["guard"], cart["reach"], cart["driver"], cart["captureXp"], cart["gatherR"], cart["crewLag"], cart["short"] };
	o.CART_LOADS["handcart"] = loads["handcart"];
	o.CART_LOADS["wagon"] = loads["wagon"];
	o.PACK_MULES = t["PACK_MULES"];
	o.ESCORT = { escort["engage"], escort["leash"], escort["ring"] };
	o.SAFE = { safe["tag"], safe["units"], safe["fighter"] };
	o.CLAIM_TICKS = t["CLAIM_TICKS"];
}

Pile *Piles::drop(double x, double y, const std::vector<Lot> &lots, const std::vector<Item> &items, double tick, double spoilt, const PileClaim *claim) {
	const auto &PILE = data().trade.PILE;
	Hold h = new_hold();
	put_lots(h, lots);
	if (spoilt > 0) spoil(h, spoilt);
	h.items.insert(h.items.end(), items.begin(), items.end());
	if (h.items.empty() && h.lots.empty()) return nullptr;
	if (in_rects(safe_ ? &*safe_ : nullptr, x, y)) return nullptr;
	const double add = loads(h);
	const std::optional<std::string> owner = claim ? std::optional<std::string>(claim->owner) : std::nullopt;
	Pile *p = nullptr;
	for (Pile &q : piles) {
		const std::optional<std::string> qo = q.claim ? std::optional<std::string>(q.claim->owner) : std::nullopt;
		if (js::pow(q.x - x, 2) + js::pow(q.y - y, 2) <= PILE.merge * PILE.merge && loads(q.hold) + add <= PILE.max && qo == owner) {
			p = &q;
			break;
		}
	}
	if (!p) {
		piles.push_back(Pile{ nextId++, x, y, new_hold(), 0, 0, -1, claim ? std::optional<PileClaim>(*claim) : std::nullopt });
		p = &piles.back();
	} else if (claim && p->claim) p->claim->until = claim->until;
	put_lots(p->hold, h.lots);
	p->hold.items.insert(p->hold.items.end(), h.items.begin(), h.items.end());
	p->until = tick + PILE.decay;
	return p;
}

Pile *Piles::get(int id) {
	for (Pile &p : piles)
		if (p.id == id) return &p;
	return nullptr;
}

void Piles::tick(double tick) {
	for (int i = int(piles.size()) - 1; i >= 0; i--) {
		const Pile &p = piles[i];
		bool spent = p.hold.items.empty();
		if (spent)
			for (const Lot &l : p.hold.lots)
				if (!(l.n <= 1e-9)) {
					spent = false;
					break;
				}
		if (tick >= p.until || spent) piles.erase(piles.begin() + i);
	}
}

} // namespace sim
