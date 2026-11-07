// The bots' save (src/war/sim/bots.ts exportState / importState): encodeGraph({ bots, ticks, memo }, new Map()) with the
// TS key order: a Bot as bots.set makes it (b, phase, issued, target, engine, at, fire, brazier, tries, cart; plain once
// its design was refused), a Behaviour with the keys its caller gave (kind first).
#include "bots.h"
#include "state.h"

namespace sim {

using state::Graph;
using state::Obj;
using state::Val;

namespace {

Obj *behaviour(Graph &g, const Behaviour &b) {
	Obj *o = g.object();
	o->set("kind", Val(b.kind));
	if (b.kind == "escort" || b.kind == "haul") {
		o->set("cart", Val(b.cart));
		if (b.kind == "haul") {
			Obj *p = g.array();
			for (const auto &pt : b.path) p->push(Val(g.nums(std::vector<double>{ pt[0], pt[1] })));
			o->set("path", Val(p));
		}
		return o;
	}
	if (b.kind == "flank") o->set("via", Val(g.nums(std::vector<double>{ b.via[0], b.via[1] })));
	o->set("x", Val(b.x));
	o->set("y", Val(b.y));
	if (b.has_radius) o->set("radius", Val(b.radius));
	if (!b.engine.empty()) o->set("engine", Val(b.engine));
	if (b.kind == "raider") {
		o->set("w", Val(b.w));
		o->set("h", Val(b.h));
		if (b.weak) o->set("weak", Val(*b.weak));
		if (b.reach) o->set("reach", Val(*b.reach));
	}
	return o;
}

Behaviour behaviour_of(const Obj &o) {
	Behaviour b;
	b.kind = o.get("kind").strOr();
	b.x = o.get("x").num();
	b.y = o.get("y").num();
	if (o.has("radius") && !o.get("radius").isUndef()) b.has_radius = true, b.radius = o.get("radius").num();
	if (o.get("via").k == Val::Ref) b.via[0] = o.get("via").o->vals[0].num(), b.via[1] = o.get("via").o->vals[1].num();
	b.engine = o.get("engine").strOr();
	b.w = o.get("w").num();
	b.h = o.get("h").num();
	if (o.get("weak").k == Val::Num) b.weak = o.get("weak").num();
	if (o.get("reach").k == Val::Num) b.reach = o.get("reach").num();
	if (o.has("cart")) b.cart = o.get("cart").i();
	if (o.get("path").k == Val::Ref)
		for (const Val &pt : o.get("path").o->vals) b.path.push_back({ pt.o->vals[0].num(), pt.o->vals[1].num() });
	return b;
}

} // namespace

std::string Bots::exportState() const {
	Graph g;
	Obj *bs = g.make('m');
	for (int id : order) {
		const Bot &bot = bots.at(id);
		Obj *o = g.object();
		o->set("b", Val(behaviour(g, bot.b)));
		o->set("phase", Val(bot.phase));
		o->set("issued", Val(bot.issued));
		o->set("target", Val(bot.target));
		o->set("engine", Val(bot.engine));
		o->set("at", bot.at ? Val(g.nums(std::vector<double>{ (*bot.at)[0], (*bot.at)[1] })) : Val::null());
		o->set("fire", Val(bot.fire));
		o->set("brazier", Val(bot.brazier));
		o->set("tries", Val(bot.tries));
		o->set("cart", Val(bot.cart));
		if (bot.plain) o->set("plain", Val(true));
		bs->put(Val(id), Val(o));
	}
	Obj *mm = g.make('m');
	for (const auto &[team, mem] : memo) {
		Obj *m = g.make('m');
		for (const auto &[sq, s] : mem) {
			Obj *x = g.object();
			x->set("x", Val(s.x)).set("y", Val(s.y)).set("at", Val(s.at));
			m->put(Val(sq), Val(x));
		}
		mm->put(Val(team), Val(m));
	}
	Obj *root = g.object();
	root->set("bots", Val(bs)).set("ticks", Val(ticks)).set("memo", Val(mm));
	return state::encode(Val(root), nullptr, "", 0, false);
}

bool Bots::importState(const std::string &text) {
	state::Decoded d;
	if (!state::decode(text, d, false) || d.root.k != Val::Ref) return false;
	const Obj &root = *d.root.o;
	bots.clear();
	order.clear();
	memo.clear();
	if (root.get("bots").k == Val::Ref) {
		const Obj &bs = *root.get("bots").o;
		for (size_t i = 0; i + 1 < bs.vals.size(); i += 2) {
			const int id = bs.vals[i].i();
			const Obj &o = *bs.vals[i + 1].o;
			Bot bot;
			if (o.get("b").k == Val::Ref) bot.b = behaviour_of(*o.get("b").o);
			bot.phase = o.get("phase").strOr();
			bot.issued = o.get("issued").strOr();
			bot.target = o.get("target").i();
			bot.engine = o.get("engine").i();
			if (o.get("at").k == Val::Ref) bot.at = std::array<double, 2>{ o.get("at").o->vals[0].num(), o.get("at").o->vals[1].num() };
			bot.fire = o.get("fire").b;
			bot.brazier = o.get("brazier").k == Val::Num ? o.get("brazier").num() : -std::numeric_limits<double>::infinity();
			bot.tries = o.get("tries").i();
			bot.cart = o.has("cart") ? o.get("cart").i() : -1;
			bot.plain = o.get("plain").k == Val::Bool && o.get("plain").b;
			order.push_back(id);
			bots[id] = bot;
		}
	}
	if (root.get("memo").k == Val::Ref) {
		const Obj &mm = *root.get("memo").o;
		for (size_t i = 0; i + 1 < mm.vals.size(); i += 2) {
			JsMap<int, Seen> &mem = memo[mm.vals[i].i()];
			const Obj &m = *mm.vals[i + 1].o;
			for (size_t j = 0; j + 1 < m.vals.size(); j += 2) {
				const Obj &x = *m.vals[j + 1].o;
				mem[m.vals[j].i()] = Seen{ x.get("x").num(), x.get("y").num(), x.get("at").i() };
			}
		}
	}
	ticks = root.get("ticks").i();
	return true;
}

} // namespace sim
