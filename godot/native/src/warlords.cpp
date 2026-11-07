#include "warlords.h"

#include <algorithm>
#include <cmath>
#include <limits>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/string.hpp>

#include "js_math.h"
#include "sim_data.h"
#include "vision.h"

namespace sim {

static std::string w8(const godot::Variant &v) { return godot::String(v).utf8().get_data(); }
static std::vector<double> nums(const godot::Array &a) {
	std::vector<double> out;
	for (int64_t i = 0; i < a.size(); i++) out.push_back(a[i]);
	return out;
}
// Whole numbers only here (seeds, ticks, seconds), as JS prints them.
static std::string num(double v) { return std::to_string(int64_t(v)); }
static uint32_t hash(const std::string &s) { return hash_string(godot::String::utf8(s.c_str())); }
static const WarlordTables &T() { return data().warlords; }

void load_warlord_tables(const godot::Dictionary &tables, WarlordTables &out) {
	if (tables.has("src/data/warWarlords")) {
		const godot::Dictionary m = tables["src/data/warWarlords"];
		const godot::Array ws = m["WARLORDS"];
		out.WARLORDS.clear();
		for (int64_t i = 0; i < ws.size(); i++) {
			const godot::Dictionary d = ws[i], l = d["lines"];
			WarlordDef w;
			w.id = w8(d["id"]), w.name = w8(d["name"]), w.title = w8(d["title"]), w.band = w8(d["band"]), w.seat = w8(d["seat"]), w.kind = w8(d["kind"]);
			w.men = d["men"], w.lord = d["lord"], w.tint = d["tint"], w.scale = d["scale"];
			w.lines = { w8(l["rise"]), w8(l["took"]), w8(l["warn"]), w8(l["freed"]), w8(l["fallen"]) };
			out.WARLORDS.push_back(w);
		}
		const godot::Dictionary W = m["WARLORD"];
		auto &o = out.WARLORD;
		o.think = W["think"];
		const godot::Dictionary gr = W["grow"], g = W["garrison"], lt = W["lieutenant"], lo = W["lord"], r = W["raid"], lt2 = W["loot"], rc = W["recall"];
		o.grow = { gr["seat"], gr["march"], gr["marchDay"] };
		o.maxHold = W["maxHold"];
		o.garrison.base = nums(g["base"]);
		o.garrison.max = nums(g["max"]);
		o.garrison.perDay = g["perDay"], o.garrison.press = g["press"], o.garrison.cap = g["cap"], o.garrison.hall = g["hall"];
		o.holdR = W["holdR"];
		o.lieutenant = { lt["hp"], lt["dmg"], lt["armor"] };
		o.lord = { lo["hp"], lo["dmg"], lo["armor"] };
		o.reinforce = W["reinforce"], o.quiet = W["quiet"], o.retake = W["retake"], o.back = W["back"];
		o.raid.every = r["every"], o.raid.maxDiv = r["maxDiv"], o.raid.warn = r["warn"];
		o.raid.men = nums(r["men"]);
		o.raid.perPlayer = r["perPlayer"], o.raid.max = r["max"], o.raid.reach = r["reach"], o.raid.guard = r["guard"], o.raid.cartGuard = r["cartGuard"];
		o.raid.stay = r["stay"], o.raid.at = r["at"];
		const godot::Dictionary h = lt2["holding"], ld = lt2["lord"];
		o.loot.holding = { h["coin"], h["goods"], h["per"] };
		o.loot.lord.coin = ld["coin"], o.loot.lord.goods = ld["goods"], o.loot.lord.per = ld["per"];
		const godot::Array rr = ld["rarity"];
		o.loot.lord.rarity.clear();
		for (int64_t i = 0; i < rr.size(); i++) {
			const godot::Array e = rr[i];
			o.loot.lord.rarity.push_back({ w8(e[0]), double(e[1]) });
		}
		o.cap = W["cap"], o.arrive = W["arrive"];
		o.recall.leave = rc["leave"];
		o.recall.line = w8(rc["line"]);
		const godot::Dictionary sp = m["SPOILS"];
		const godot::Array ks = sp.keys();
		for (int64_t i = 0; i < ks.size(); i++) out.SPOILS[w8(ks[i])] = w8(sp[ks[i]]);
	}
	if (tables.has("src/war/sim/warlords")) out.DAY_TICKS = godot::Dictionary(tables["src/war/sim/warlords"])["DAY_TICKS"];
	if (tables.has("src/war/world/regions")) {
		const godot::Array rs = godot::Dictionary(tables["src/war/world/regions"])["WORLD_REGIONS"];
		out.WORLD_REGIONS.clear();
		for (int64_t i = 0; i < rs.size(); i++) {
			const godot::Dictionary d = rs[i], p = d["pos"];
			WarlordTables::World w{ w8(d["id"]), w8(d["role"]), p["x"], p["y"], {} };
			const godot::Array adj = d["adj"];
			for (int64_t k = 0; k < adj.size(); k++) w.adj.push_back(w8(adj[k]));
			out.WORLD_REGIONS.push_back(w);
		}
	}
	if (tables.has("src/war/world/alliances")) out.ALLIANCES = int(godot::Array(godot::Dictionary(tables["src/war/world/alliances"])["ALLIANCES"]).size());
}

static const WarlordTables::World *world(const std::string &id) {
	for (const auto &r : T().WORLD_REGIONS)
		if (r.id == id) return &r;
	return nullptr;
}

std::vector<std::string> warlord_domain(const WarlordDef &w) {
	const auto *seat = world(w.seat);
	if (!seat) return {};
	std::vector<std::string> out{ seat->id };
	for (const std::string &id : seat->adj) {
		const auto it = data().depth.region_depth.find(id);
		const double d = it != data().depth.region_depth.end() ? it->second : 1;
		const auto *r = world(id);
		if (d >= 1 && d <= 2 && !(r && r->role == "home")) out.push_back(id);
	}
	return out;
}

std::vector<const WarlordDef *> warlords_of(const std::string &region) {
	std::vector<const WarlordDef *> out;
	for (const WarlordDef &w : T().WARLORDS) {
		const auto dom = warlord_domain(w);
		if (std::find(dom.begin(), dom.end(), region) != dom.end()) out.push_back(&w);
	}
	return out;
}

// sideTo(from, to): the dominant axis of the direction to the neighbour.
std::string edge_side(const std::string &a, const std::string &b) {
	const auto *ra = world(a), *rb = world(b);
	if (!ra || !rb || std::find(ra->adj.begin(), ra->adj.end(), b) == ra->adj.end()) return "";
	const double dx = rb->x - ra->x, dy = rb->y - ra->y;
	if (std::abs(dy) >= std::abs(dx)) return dy < 0 ? "N" : "S";
	return dx < 0 ? "W" : "E";
}

static void set(Record &r, const std::string &k, double v) {
	for (auto &e : r)
		if (e.first == k) {
			e.second = v;
			return;
		}
	r.push_back({ k, v });
}
static const double *get(const Record &r, const std::string &k) {
	for (const auto &e : r)
		if (e.first == k) return &e.second;
	return nullptr;
}

WarlordLoot warlord_loot(const WarlordDef &w, const std::string &what, double depth, const std::string &seed) {
	const auto &LT = T().WARLORD.loot;
	const double coin = what == "holding" ? LT.holding.coin : LT.lord.coin, goods = what == "holding" ? LT.holding.goods : LT.lord.goods;
	const double per = what == "holding" ? LT.holding.per : LT.lord.per, m = 1 + per * depth;
	const auto sp = T().SPOILS.find(w.kind);
	WarlordLoot out;
	set(out.goods, "coin", js::round(coin * m));
	set(out.goods, sp != T().SPOILS.end() ? sp->second : "hides", js::round(goods * m));
	if (what == "holding") return out;
	Mulberry rng(hash(w.id + ":" + seed + ":warlordloot") ? hash(w.id + ":" + seed + ":warlordloot") : 1);
	std::vector<std::string> pool;
	for (const auto &[id, tier] : data().bosses.BASE_ITEMS)
		if (tier <= 2 + std::floor(depth / 2)) pool.push_back(id);
	out.has_item = true;
	out.def = pool[size_t(std::floor(rng.next() * double(pool.size())))];
	// rng.weighted
	const auto &entries = LT.lord.rarity;
	double total = 0;
	for (const auto &e : entries) total += e.second;
	double r = rng.next() * total;
	out.rarity = entries.back().first;
	for (const auto &e : entries) {
		r -= e.second;
		if (r < 0) {
			out.rarity = e.first;
			break;
		}
	}
	return out;
}

// A line with its blanks filled (the first {k}: String.replace with a string), each sentence capitalised
// (/(^|\. )([a-z])/g). No value holds a `$` pattern.
static std::string fill(const std::string &line, const std::string &k, const std::string &v) {
	std::string s = line;
	const std::string pat = "{" + k + "}";
	const size_t at = s.find(pat);
	if (at != std::string::npos) s.replace(at, pat.size(), v);
	const auto lower = [](char c) { return c >= 'a' && c <= 'z'; };
	for (size_t p = 0; p < s.size();) {
		if (p == 0 && lower(s[0])) {
			s[0] = char(s[0] - 'a' + 'A');
			p = 1;
		} else if (p + 2 < s.size() && s[p] == '.' && s[p + 1] == ' ' && lower(s[p + 2])) {
			s[p + 2] = char(s[p + 2] - 'a' + 'A');
			p += 3;
		} else p++;
	}
	return s;
}
static std::string placeName(const Warlords::Place &p, const std::string &kind) { return !p.lair ? "the claim banner" : kind == "bandit" ? "the bandit camp" : "the den"; }
static std::string thing(const std::string &type) {
	std::string t = type;
	while (!t.empty() && t.back() >= '0' && t.back() <= '9') t.pop_back();
	std::string out;
	for (char c : t) {
		if (c >= 'A' && c <= 'Z') out += ' ';
		out += c;
	}
	for (char &c : out)
		if (c >= 'A' && c <= 'Z') c = char(c - 'A' + 'a');
	return out;
}
// Buildings a raid may go for: anything finished that is no wall, gate, tower, bridge, stair or field work.
static bool RAIDABLE(const std::string &t) {
	for (const char *w : { "wall", "Wall", "palisade", "rampart", "Gate", "Tower", "Bridge", "Stairs", "ladder", "stakes", "ditch", "brazier", "towerBridge" })
		if (t.find(w) != std::string::npos) return false;
	return true;
}
static double d2(double ax, double ay, double bx, double by) { return js::pow(ax - bx, 2) + js::pow(ay - by, 2); }

Warlords::Warlords(const WarlordsRegion &r, double sd, WarlordsHost &h)
		: region(r), seed(sd), host(h), depth(depth_of(r.depth)), rule(depth_rule(r.depth)), rng(1) {
	const auto defs = warlords_of(region.depth.id);
	if (defs.empty()) return;
	const uint32_t hs = hash(region.depth.id + ":" + seedStr() + ":warlords");
	rng = Mulberry(hs ? hs : 1);
	const auto &W = T().WARLORD;
	for (const WarlordDef *def : defs) {
		Lord l;
		l.def = def;
		l.seat = def->seat == region.depth.id;
		const std::string side = l.seat ? "" : edge_side(region.depth.id, def->seat);
		const WarlordsRegion::Entry *e = nullptr;
		if (!side.empty())
			for (const auto &x : region.entries)
				if (x.side == side) {
					e = &x;
					break;
				}
		if (!e && !region.entries.empty()) e = &region.entries[0];
		l.gate = inside(e ? e->x + e->w / 2 : region.w / 2, e ? e->y + e->h / 2 : region.h / 2);
		std::vector<Place> cps, lairs;
		for (size_t i = 0; i < region.claimPoints.size(); i++) cps.push_back({ "c" + std::to_string(i), region.claimPoints[i].first, region.claimPoints[i].second, false });
		for (size_t i = 0; i < region.lairs.size(); i++) {
			const LairEntry &x = region.lairs[i];
			if (x.kind == def->kind && !x.captain) lairs.push_back({ "l" + std::to_string(i), x.x, x.y, true });
		}
		// seat: his hall (claim point 0) first, the rest by distance from it; march: by distance from the border
		const std::pair<double, double> from = l.seat && !cps.empty() ? std::make_pair(cps[0].x, cps[0].y) : l.gate;
		const auto d = [&](const Place &p) { return js::pow(p.x - from.first, 2) + js::pow(p.y - from.second, 2); };
		l.places = cps;
		l.places.insert(l.places.end(), lairs.begin(), lairs.end());
		std::stable_sort(l.places.begin(), l.places.end(), [&](const Place &a, const Place &b) {
			const double k = d(a) - d(b);
			return k != 0 ? k < 0 : a.key < b.key;
		});
		l.reinforceAt = W.reinforce;
		l.raidAt = W.raid.every;
		lords.push_back(std::move(l));
	}
}

std::string Warlords::seedStr() const { return num(seed); }
double Warlords::data_back() const { return T().WARLORD.back; }

std::pair<double, double> Warlords::inside(double x, double y) const {
	return { std::max(2.0, std::min(region.w - 3, x)), std::max(2.0, std::min(region.h - 3, y)) };
}

const WarlordsSnap::Unit *Warlords::unit(int id) const {
	const auto it = units.find(id);
	return it != units.end() ? it->second : nullptr;
}
const WarlordsSnap::Squad *Warlords::squad(int id) const {
	if (id < 0 || id >= int(snap.squads.size()) || !snap.squads[id].present) return nullptr;
	return &snap.squads[id];
}
std::vector<int> Warlords::squadMen(int id) const {
	std::vector<int> out;
	if (const auto *q = squad(id))
		for (int u : q->units)
			if (alive(unit(u))) out.push_back(u);
	return out;
}
std::optional<std::pair<double, double>> Warlords::centre(int id) const {
	const auto men = squadMen(id);
	if (men.empty()) return std::nullopt;
	double x = 0, y = 0;
	for (int u : men) x += unit(u)->x, y += unit(u)->y;
	return std::make_pair(x / double(men.size()), y / double(men.size()));
}
// At least `n` living fighting men of other teams within r of (x,y) (team: only that team's).
bool Warlords::foesNear(double x, double y, double r, std::optional<int> team, double n) const {
	for (const auto &u : snap.units) {
		if (!alive(&u) || u.cls.rfind("civ_", 0) == 0) continue;
		const auto *q = squad(u.squad);
		if (!q || q->team == MOB_TEAM || (team ? q->team != *team : q->team >= T().ALLIANCES)) continue;
		if (js::pow(u.x - x, 2) + js::pow(u.y - y, 2) <= r * r && --n <= 0) return true;
	}
	return false;
}
double Warlords::menAll() const {
	double n = 0;
	for (const auto &q : snap.squads)
		if (q.present && q.team == MOB_TEAM && q.owner.rfind("warlord:", 0) == 0) n += double(squadMen(q.id).size());
	return n;
}

void Warlords::setPlayers(double n) { players = std::max(0.0, std::floor(n)); }

// Garrison size of a holding taken at age `since` (his hall: G.hall more, still within G.max).
double Warlords::size(const WarlordDef &w, double since, bool hall) const {
	const auto &G = T().WARLORD.garrison;
	const size_t d = size_t(std::min(depth, double(G.base.size() - 1)));
	const double base = std::min(G.max[d], G.base[d] + (hall ? G.hall : 0) + std::floor(std::max(0.0, age - since) * G.perDay));
	return std::max(1.0, std::min(G.cap, js::round(base * w.men * (1 + G.press * (press() - 1)))));
}
// Holdings his age allows here (and the players present; seat at least his hall).
double Warlords::target(const Lord &l) const {
	const auto &W = T().WARLORD;
	const double a = std::max(0.0, age - l.born);
	const double byAge = l.seat ? 1 + std::floor(a / W.grow.seat) : a < W.grow.marchDay ? 0 : 1 + std::floor((a - W.grow.marchDay) / W.grow.march);
	return std::min({ W.maxHold, double(l.places.size()), byAge, 1 + players });
}
int Warlords::influenced(double x, double y) {
	const double w = host.influence_w(), t = std::floor(y) * w + std::floor(x);
	return host.influence_at(t) & ((1 << T().ALLIANCES) - 1);
}
// The next place he may take: free of him, of alliances and their ground, not freed lately.
const Warlords::Place *Warlords::nextPlace(Lord &l) {
	for (const Place &p : l.places) {
		if (std::any_of(l.holds.begin(), l.holds.end(), [&](const auto &h) { return h->place == p.key; })) continue;
		if (std::any_of(lords.begin(), lords.end(), [&](const Lord &o) {
				return &o != &l && std::any_of(o.holds.begin(), o.holds.end(), [&](const auto &h) { return h->place == p.key; });
			}))
			continue;
		const double *f = get(l.freed, p.key);
		if (f && age - *f < T().WARLORD.retake / T().DAY_TICKS) continue;
		if (!p.lair) {
			const int i = std::stoi(p.key.substr(1));
			if (snap.has_claims && i < int(snap.claims.size())) {
				const int team = snap.claims[i];
				if (team >= 0 && team != MOB_TEAM) continue;
			}
		}
		if (influenced(p.x, p.y)) continue;
		return &p;
	}
	return nullptr;
}

void Warlords::say(const Lord &l, const std::string &what, const std::string &text, double x, double y, std::optional<std::string> place, std::optional<int> team,
		std::optional<double> in) {
	notes.push_back({ tick_, what, l.def->id, l.def->name, text, x, y, place, team, in });
}

int Warlords::spawn(Lord &l, double n, double x, double y, const std::string &lead) {
	const auto &W = T().WARLORD;
	SpawnScale k;
	k.hp = rule.mob;
	k.dmg = rule.mob;
	if (!lead.empty()) {
		k.has_lead = true;
		if (lead == "lord") k.lead = { W.lord.hp * l.def->lord, W.lord.dmg, W.lord.armor };
		else k.lead = { W.lieutenant.hp, W.lieutenant.dmg, W.lieutenant.armor };
	}
	return host.spawn_wild("warlord:" + l.def->id, l.def->kind, std::min(12.0, n), x, y, k);
}
// Lay a garrison on place p at once (a fresh room catching up, his hall).
void Warlords::garrison(Lord &l, const Place &p, double since, bool march, std::optional<std::pair<double, double>> from) {
	const auto &W = T().WARLORD;
	const bool hall = l.seat && !l.places.empty() && p.key == l.places[0].key && !p.lair;
	const auto [sx, sy] = march && from ? *from : std::make_pair(p.x, p.y);
	const int sq = spawn(l, size(*l.def, since, hall), sx, sy, hall ? "lord" : "lt");
	if (sq < 0) return;
	auto h = std::make_shared<Hold>();
	*h = { p.key, p.x, p.y, sq, {}, march ? "marching" : "held", since, -1, hall, tick_ };
	l.holds.push_back(h);
	Behaviour b;
	b.x = p.x, b.y = p.y;
	if (march) b.kind = "attackMove";
	else b.kind = "hold", b.has_radius = true, b.radius = W.holdR;
	host.bot_set(sq, b);
	if (!march) say(l, "took", fill(l.def->lines.took, "place", placeName(p, l.def->kind)), p.x, p.y, p.key);
}
// Where his men set out from: his nearest held holding to (x,y), else the border (march) or nothing.
std::optional<std::pair<double, double>> Warlords::source(const Lord &l, double x, double y, const std::string *not_) const {
	std::optional<std::pair<double, double>> best;
	double bd = std::numeric_limits<double>::infinity();
	for (const auto &h : l.holds) {
		if (h->state != "held" || (not_ && h->place == *not_)) continue;
		const auto c = centre(h->squad);
		if (!c) continue;
		const double d = d2(c->first, c->second, x, y);
		if (d < bd) bd = d, best = c;
	}
	if (best) return best;
	if (l.seat) return std::nullopt;
	return l.gate;
}

static Behaviour hold_at(double x, double y, double r) {
	Behaviour b;
	b.kind = "hold", b.x = x, b.y = y, b.has_radius = true, b.radius = r;
	return b;
}
static Behaviour attack_move(double x, double y) {
	Behaviour b;
	b.kind = "attackMove", b.x = x, b.y = y;
	return b;
}
static std::vector<Lot> lots(const WarlordLoot &drop, const std::string &region) {
	std::vector<Lot> out;
	for (const auto &[r, n] : drop.goods) out.push_back({ r, n, region, std::nullopt });
	return out;
}
static const Warlords::Place &placeOf(const Warlords::Lord &l, const std::string &key) {
	return *std::find_if(l.places.begin(), l.places.end(), [&](const Warlords::Place &x) { return x.key == key; });
}

void Warlords::free(Lord &l, const std::shared_ptr<Hold> &h) {
	l.holds.erase(std::remove(l.holds.begin(), l.holds.end(), h), l.holds.end());
	set(l.freed, h->place, age);
	host.bot_clear(h->squad);
	for (int q : h->extra) host.bot_clear(q);
	const Place &p = placeOf(l, h->place);
	const std::string id = region.depth.id;
	const WarlordLoot drop = warlord_loot(*l.def, "holding", depth, id + ":" + seedStr() + ":" + h->place + ":" + num(tick_));
	host.drop_pile(h->x, h->y, lots(drop, id), {});
	say(l, "freed", fill(l.def->lines.freed, "place", placeName(p, l.def->kind)), h->x, h->y, h->place);
}
void Warlords::fall(Lord &l, double x, double y) {
	l.fallen = age;
	l.lord = -1;
	l.warn.reset();
	const std::string id = region.depth.id, key = id + ":" + seedStr() + ":" + l.def->id + ":" + num(tick_);
	const WarlordLoot drop = warlord_loot(*l.def, "lord", depth, key);
	std::vector<Item> items;
	if (drop.has_item) {
		const uint32_t hs = hash(key + ":lord");
		Mulberry r(hs ? hs : 1);
		IdSource ids;
		Item it = make_item(r, ids, drop.def, drop.rarity);
		it.uid = "warlord:" + key;
		items.push_back(it);
	}
	host.drop_pile(x, y, lots(drop, id), items);
	say(l, "fallen", l.def->lines.fallen, x, y);
}

// Raid targets: the nearest undefended alliance building or cart within reach of a holding of his.
std::optional<Warlords::Warning> Warlords::raidTarget(const Lord &l) const {
	const auto &R = T().WARLORD.raid;
	std::optional<Warning> best;
	double bd = R.reach * R.reach;
	const auto consider = [&](double x, double y, int team, double guard, double men, std::optional<int> building, std::optional<int> siege, const std::string &what) {
		for (const auto &h : l.holds) {
			if (h->state != "held") continue;
			const double d = d2(h->x, h->y, x, y);
			if (d >= bd || foesNear(x, y, guard, team, men)) continue;
			bd = d;
			best = Warning{ x, y, team, building, siege, h->place, tick_ + R.warn, what };
		}
	};
	// W-91: what stands empty first (nearest); else what fewer men hold than he would send: he does not fight an even battle
	const double party = std::min(R.max, R.men[size_t(std::min(depth, double(R.men.size() - 1)))] + R.perPlayer * (players - 1));
	for (const double held : { 1.0, party }) {
		for (const auto &b : snap.buildings) {
			if (b.team < 0 || b.team >= T().ALLIANCES || (b.state != "done" && b.state != "damaged") || b.ruin || !RAIDABLE(b.type)) continue;
			consider(b.x, b.y, b.team, R.guard, held, b.id, std::nullopt, thing(b.type));
		}
		if (best) return best;
	}
	for (const auto &e : snap.sieges) {
		if ((e.type != "handcart" && e.type != "wagon") || e.state == "destroyed" || e.team == MOB_TEAM) continue;
		consider(e.x, e.y, e.team, R.cartGuard, 1, std::nullopt, e.id, e.type == "wagon" ? "wagon" : "cart");
	}
	return best;
}
bool Warlords::standing(std::optional<int> building, std::optional<int> siege, int team) const {
	if (building) {
		for (const auto &b : snap.buildings)
			if (b.id == *building) return b.team == team && (b.state == "done" || b.state == "damaged") && !b.ruin;
		return false;
	}
	for (const auto &e : snap.sieges)
		if (siege && e.id == *siege) return e.state != "destroyed" && e.team == team;
	return false;
}

double Warlords::holdMen(const Hold &h) const {
	double n = double(squadMen(h.squad).size());
	for (int q : h.extra) n += double(squadMen(q).size());
	return n;
}

// His fall: every holding and party here walks off to the border, the places free and nothing dropped.
void Warlords::withdraw(Lord &l) {
	const auto &W = T().WARLORD;
	const double until = tick_ + W.recall.leave;
	for (const auto &h : l.holds) {
		const Place &p = placeOf(l, h->place);
		if (h->state == "held") say(l, "recall", fill(fill(W.recall.line, "place", placeName(p, l.def->kind)), "band", l.def->band), h->x, h->y, h->place);
	}
	std::vector<int> qs;
	for (const auto &h : l.holds) {
		qs.push_back(h->squad);
		qs.insert(qs.end(), h->extra.begin(), h->extra.end());
	}
	for (const auto &x : l.parties) qs.push_back(x->squad);
	for (int q : qs) {
		l.gone.push_back(std::make_shared<Gone>(Gone{ q, until }));
		host.bot_clear(q);
		WarlordOrder o;
		o.kind = "move", o.squad = q, o.x = l.gate.first, o.y = l.gate.second;
		host.order(o);
	}
	l.holds.clear();
	l.parties.clear();
	l.warn.reset();
}

void Warlords::think(Lord &l) {
	const auto &W = T().WARLORD;
	// fallen: what still stands here walks off; the gone leave the field at the border
	if (down(l) && (!l.holds.empty() || !l.parties.empty())) withdraw(l);
	for (const auto g : std::vector<std::shared_ptr<Gone>>(l.gone)) {
		const auto c = centre(g->squad);
		if (c && tick_ < g->until && d2(c->first, c->second, l.gate.first, l.gate.second) > js::pow(W.arrive, 2)) continue;
		if (c) host.drop_squad(g->squad);
		host.bot_clear(g->squad);
		l.gone.erase(std::remove(l.gone.begin(), l.gone.end(), g), l.gone.end());
	}
	// the fallen is back after WARLORD.back days, grown from nothing (his hall laid anew)
	if (l.fallen && !down(l)) l.born = *l.fallen + W.back, l.fallen.reset(), l.laid = false;
	// a fresh room lays out what his age gives him (at least one player assumed: he was busy while nobody looked)
	if (!l.laid && !down(l)) {
		l.laid = true;
		const double had = players;
		players = std::max(players, 1.0);
		const double n = target(l);
		for (double i = double(l.holds.size()); i < n; i++) {
			const Place *p = nextPlace(l);
			if (!p) break;
			garrison(l, *p, l.born, false);
		}
		players = had;
		if (!l.holds.empty()) say(l, "rise", l.def->lines.rise, l.holds[0]->x, l.holds[0]->y);
	}

	// holdings: arrived, freed; his hall's lord
	for (const auto h : std::vector<std::shared_ptr<Hold>>(l.holds)) {
		if (h->at >= tick_) continue; // laid this pass: the snapshot does not show it yet
		if (h->lt < 0) {
			const auto *q = squad(h->squad);
			if (q && !q->units.empty()) {
				h->lt = q->units[0];
				if (h->hall && !l.fallen) l.lord = h->lt;
			}
		}
		if (h->hall && l.lord >= 0 && !alive(unit(l.lord))) {
			const auto *u = unit(l.lord);
			fall(l, u ? u->x : h->x, u ? u->y : h->y);
		}
		if (!holdMen(*h)) {
			if (h->state == "held") free(l, h);
			else l.holds.erase(std::remove(l.holds.begin(), l.holds.end(), h), l.holds.end()), host.bot_clear(h->squad); // a band cut down on the way: nothing taken
			continue;
		}
		const auto c = centre(h->squad);
		if (c && h->state == "marching" && d2(c->first, c->second, h->x, h->y) <= js::pow(W.arrive, 2)) {
			h->state = "held";
			host.bot_set(h->squad, hold_at(h->x, h->y, W.holdR));
			const Place &p = placeOf(l, h->place);
			say(l, "took", fill(l.def->lines.took, "place", placeName(p, l.def->kind)), h->x, h->y, h->place);
		}
	}

	// parties: reinforcements join their holding; raids march, hit, go home
	for (const auto pt : std::vector<std::shared_ptr<Party>>(l.parties)) {
		if (pt->at >= tick_) continue;
		const auto c = centre(pt->squad);
		if (!c) {
			l.parties.erase(std::remove(l.parties.begin(), l.parties.end(), pt), l.parties.end());
			host.bot_clear(pt->squad);
			continue;
		}
		std::shared_ptr<Hold> h;
		for (const auto &x : l.holds)
			if (x->place == pt->to) {
				h = x;
				break;
			}
		Raid *r = pt->raid ? &*pt->raid : nullptr;
		if (r && r->phase == "march" && d2(c->first, c->second, r->x, r->y) <= js::pow(W.raid.at, 2)) {
			r->phase = "hit";
			r->until = tick_ + W.raid.stay;
			host.bot_clear(pt->squad);
			// W-91: goods behind a door: his men break in and fill their packs first (the time at the door is on top of the stay), then batter it
			const WarlordsSnap::Building *goods = nullptr;
			if (r->building)
				for (const auto &x : snap.buildings)
					if (x.id == *r->building) {
						goods = &x;
						break;
					}
			if (goods && goods->has_goods && std::any_of(goods->goods.begin(), goods->goods.end(), [](const auto &g) { return g.second >= 1; })) {
				r->loot = r->hasLoot = true;
				r->until += W.raid.stay;
				WarlordOrder o;
				o.kind = "load", o.squad = pt->squad, o.building = *r->building;
				host.order(o);
			} else {
				WarlordOrder o;
				o.kind = "attackBuilding", o.squad = pt->squad;
				if (r->building) o.building = r->building;
				else o.siege = r->siege;
				host.order(o);
			}
		} else if (r && r->loot && r->phase == "hit" && tick_ < r->until && standing(r->building, r->siege, r->team) &&
				!(squad(pt->squad) && squad(pt->squad)->order == "load")) {
			r->loot = false; // packs full (or the door kept them out): the rest of the stay at the walls
			WarlordOrder o;
			o.kind = "attackBuilding", o.squad = pt->squad, o.building = *r->building;
			host.order(o);
		} else if (r && (r->phase == "march" || r->phase == "hit") && (tick_ >= r->until || !standing(r->building, r->siege, r->team))) {
			r->phase = "home";
			std::shared_ptr<Hold> home = h && h->state == "held" ? h : nullptr;
			if (!home)
				for (const auto &x : l.holds)
					if (x->state == "held") {
						home = x;
						break;
					}
			if (home) pt->to = home->place, host.bot_set(pt->squad, attack_move(home->x, home->y));
			else host.bot_set(pt->squad, hold_at(c->first, c->second, W.holdR));
		} else if ((!r || r->phase == "home") && h && h->state == "held" && d2(c->first, c->second, h->x, h->y) <= js::pow(W.arrive, 2)) {
			// home: into the garrison while it has room (a squad holds 12), else they hold beside it
			const double g = double(squadMen(h->squad).size()), n = double(squadMen(pt->squad).size());
			if (g > 0 && g + n <= 12) {
				WarlordOrder o;
				o.kind = "merge", o.squad = pt->squad, o.into = h->squad;
				host.order(o);
				host.bot_clear(pt->squad);
			} else h->extra.push_back(pt->squad), host.bot_set(pt->squad, hold_at(h->x, h->y, W.holdR));
			l.parties.erase(std::remove(l.parties.begin(), l.parties.end(), pt), l.parties.end());
		} else if ((!r || r->phase == "home") && !(h && h->state == "held")) {
			// the holding they head for was freed under them: home to another he holds, if any
			for (const auto &x : l.holds)
				if (x->state == "held") {
					pt->to = x->place, host.bot_set(pt->squad, attack_move(x->x, x->y));
					break;
				}
		}
	}

	if (players < 1 || down(l)) return; // nobody here, or he is fallen: he holds, nothing more
	const double room = W.cap - menAll();

	// growth: a band marches on the next place
	if (double(l.holds.size()) < target(l) && room > 0) {
		const Place *p = nextPlace(l);
		const auto src = p ? source(l, p->x, p->y) : std::nullopt;
		if (p && src) garrison(l, *p, age, true, src);
	}

	// reinforcements: a short holding gets men from his nearest other one (march: over the border)
	if (tick_ >= l.reinforceAt) {
		l.reinforceAt = tick_ + W.reinforce;
		for (size_t i = 0; i < l.holds.size(); i++) {
			const auto h = l.holds[i];
			if (h->state != "held" || std::any_of(l.parties.begin(), l.parties.end(), [&](const auto &x) { return x->to == h->place && !x->raid; })) continue;
			const double want = size(*l.def, h->since, h->hall) - double(squadMen(h->squad).size()), left = W.cap - menAll();
			if (want <= 0 || left <= 0) continue;
			const bool backed = h->hall && std::any_of(l.holds.begin(), l.holds.end(), [&](const auto &x) { return x != h && x->state == "held"; });
			if (!backed && foesNear(h->x, h->y, W.quiet)) continue;
			const auto src = source(l, h->x, h->y, &h->place);
			if (!src) continue;
			const int sq = spawn(l, std::min(want, left), src->first, src->second);
			if (sq < 0) continue;
			auto pt = std::make_shared<Party>();
			pt->squad = sq, pt->to = h->place, pt->at = tick_;
			l.parties.push_back(pt);
			host.bot_set(sq, attack_move(h->x, h->y));
		}
	}

	// raids: warn, then go
	const auto &R = W.raid;
	if (l.warn && tick_ >= l.warn->at) {
		const Warning w = *l.warn;
		std::shared_ptr<Hold> h;
		for (const auto &x : l.holds)
			if (x->place == w.from && x->state == "held") {
				h = x;
				break;
			}
		l.warn.reset();
		if (h && standing(w.building, w.siege, w.team)) {
			const double n = std::min({ R.max, R.men[size_t(std::min(depth, double(R.men.size() - 1)))] + R.perPlayer * (players - 1), W.cap - menAll() });
			const int sq = n > 0 ? spawn(l, n, h->x, h->y, "lt") : -1; // W-79: a lieutenant leads it
			if (sq >= 0) {
				auto pt = std::make_shared<Party>();
				pt->squad = sq, pt->to = h->place, pt->at = tick_;
				pt->raid = Raid{ "march", w.x, w.y, w.building, w.siege, tick_ + R.stay * 4, w.team, false };
				l.parties.push_back(pt);
				host.bot_set(sq, attack_move(w.x, w.y));
				say(l, "raid", fill(l.def->lines.warn, "what", w.what) + "!", w.x, w.y, std::nullopt, w.team);
			}
		}
	} else if (!l.warn && tick_ >= l.raidAt && std::any_of(l.holds.begin(), l.holds.end(), [&](const auto &h) { return h->state == "held" && h->at < tick_; }) &&
			!std::any_of(l.parties.begin(), l.parties.end(), [](const auto &x) { return x->raid && x->raid->phase != "home"; })) {
		l.raidAt = tick_ + js::round(R.every / std::min(players, R.maxDiv)) + std::floor(rng.next() * 601); // rng.int(0, 600)
		const auto w = raidTarget(l);
		if (w) {
			l.warn = w;
			say(l, "warn", fill(l.def->lines.warn, "what", w->what) + " in " + num(js::round(R.warn / 10)) + " s", w->x, w->y, std::nullopt, w->team, R.warn);
		}
	}
}

std::vector<WarlordNote> Warlords::tick(const WarlordsSnap &s) {
	tick_ = s.tick;
	age += 1 / T().DAY_TICKS;
	notes.clear();
	if (std::fmod(tick_, T().WARLORD.think) != 0) return {};
	snap = s;
	has_snap = true;
	units.clear();
	for (const auto &u : snap.units) units[u.id] = &u;
	for (Lord &l : lords) think(l);
	return notes;
}

std::vector<WarlordSnapOut> Warlords::snaps() const {
	std::vector<WarlordSnapOut> out;
	for (const Lord &l : lords) {
		WarlordSnapOut o;
		const WarlordDef &d = *l.def;
		o.id = d.id, o.name = d.name, o.title = d.title, o.band = d.band, o.kind = d.kind, o.tint = d.tint, o.scale = d.scale, o.seat = l.seat;
		o.fallen = down(l);
		o.lord = l.lord >= 0 && alive(unit(l.lord)) ? l.lord : -1;
		for (const auto &h : l.holds) o.holds.push_back({ h->place, h->x, h->y, has_snap ? holdMen(*h) : 0, h->hall ? l.lord : h->lt, h->state });
		if (l.warn) o.has_raid = true, o.raid = { l.warn->x, l.warn->y, l.warn->team, std::max(0.0, l.warn->at - tick_) };
		o.raiding = std::any_of(l.parties.begin(), l.parties.end(), [](const auto &p) { return p->raid && p->raid->phase != "home"; });
		out.push_back(o);
	}
	return out;
}

void Warlords::raidNow(double after) {
	for (Lord &l : lords) l.raidAt = tick_ + after;
}

WarlordMemory Warlords::memory() const {
	WarlordMemory m;
	for (const Lord &l : lords)
		if (l.fallen) set(m.fallen, l.def->id, *l.fallen);
	for (const Lord &l : lords) {
		bool found = false;
		for (auto &e : m.freed)
			if (e.first == l.def->id) e.second = l.freed, found = true;
		if (!found) m.freed.push_back({ l.def->id, l.freed });
	}
	return m;
}

void Warlords::recall(const WarlordMemory &m) {
	for (Lord &l : lords) {
		if (const double *f = get(m.fallen, l.def->id)) l.fallen = *f;
		for (const auto &e : m.freed)
			if (e.first == l.def->id) {
				for (const auto &[k, v] : e.second) set(l.freed, k, v);
				break;
			}
	}
}

void Warlords::fell(const std::string &id, double at) {
	Lord *l = nullptr;
	for (Lord &x : lords)
		if (x.def->id == id) {
			l = &x;
			break;
		}
	// a fall already back from, or older than the one he is down for, changes nothing
	if (!l || age - at >= T().WARLORD.back || (l->fallen && *l->fallen >= at)) return;
	l->fallen = at;
	l->lord = -1;
}

// ---------------------------------------------------------------- exportState / importState

namespace {
godot::String g8(const std::string &s) { return godot::String::utf8(s.c_str()); }
godot::Array int_array(const std::vector<int> &v) {
	godot::Array a;
	for (int x : v) a.push_back(x);
	return a;
}
godot::Dictionary record_dict(const Record &r) {
	godot::Dictionary d;
	for (const auto &[k, v] : r) d[g8(k)] = v;
	return d;
}
godot::Variant opt_num(const std::optional<double> &v) { return v ? godot::Variant(*v) : godot::Variant(); }
std::optional<int> opt_int(const godot::Dictionary &d, const char *k) {
	return d.has(k) && d[k].get_type() != godot::Variant::NIL ? std::optional<int>(int(d[k])) : std::nullopt;
}
} // namespace

godot::Dictionary Warlords::exportState() const {
	godot::Array ls;
	for (const Lord &l : lords) {
		godot::Array holds, parties, gone;
		for (const auto &h : l.holds) {
			godot::Dictionary d;
			d["place"] = g8(h->place), d["x"] = h->x, d["y"] = h->y, d["squad"] = h->squad, d["extra"] = int_array(h->extra), d["state"] = g8(h->state);
			d["since"] = h->since, d["lt"] = h->lt, d["hall"] = h->hall, d["at"] = h->at;
			holds.push_back(d);
		}
		for (const auto &p : l.parties) {
			godot::Dictionary d;
			d["squad"] = p->squad, d["to"] = g8(p->to), d["at"] = p->at;
			if (p->raid) {
				const Raid &r = *p->raid;
				godot::Dictionary x;
				x["phase"] = g8(r.phase), x["x"] = r.x, x["y"] = r.y;
				if (r.building) x["building"] = *r.building;
				if (r.siege) x["siege"] = *r.siege;
				x["until"] = r.until, x["team"] = r.team;
				if (r.hasLoot) x["loot"] = r.loot;
				d["raid"] = x;
			}
			parties.push_back(d);
		}
		for (const auto &x : l.gone) {
			godot::Dictionary d;
			d["squad"] = x->squad, d["until"] = x->until;
			gone.push_back(d);
		}
		godot::Variant warn;
		if (l.warn) {
			const Warning &w = *l.warn;
			godot::Dictionary d;
			d["x"] = w.x, d["y"] = w.y, d["team"] = w.team, d["from"] = g8(w.from), d["at"] = w.at;
			if (w.building) d["building"] = *w.building;
			if (w.siege) d["siege"] = *w.siege;
			d["what"] = g8(w.what);
			warn = d;
		}
		godot::Dictionary d;
		d["holds"] = holds, d["parties"] = parties, d["freed"] = record_dict(l.freed), d["fallen"] = opt_num(l.fallen), d["born"] = l.born, d["lord"] = l.lord;
		d["laid"] = l.laid, d["reinforceAt"] = l.reinforceAt, d["raidAt"] = l.raidAt, d["warn"] = warn, d["gone"] = gone;
		ls.push_back(d);
	}
	godot::Dictionary out;
	out["age"] = age, out["players"] = players, out["lords"] = ls, out["rng"] = int64_t(rng.state);
	return out;
}

// Object.assign of each saved lord onto the fresh one (only the keys the save has)
void Warlords::importState(const godot::Dictionary &s) {
	age = double(s["age"]);
	players = double(s["players"]);
	const godot::Array ls = s.get("lords", godot::Array());
	for (int64_t i = 0; i < ls.size() && i < int64_t(lords.size()); i++) {
		Lord &l = lords[size_t(i)];
		const godot::Dictionary x = ls[i];
		if (x.has("holds")) {
			l.holds.clear();
			const godot::Array a = x["holds"];
			for (int64_t k = 0; k < a.size(); k++) {
				const godot::Dictionary d = a[k];
				auto h = std::make_shared<Hold>();
				h->place = w8(d["place"]), h->x = d["x"], h->y = d["y"], h->squad = int(d["squad"]), h->state = w8(d["state"]);
				const godot::Array ex = d["extra"];
				for (int64_t j = 0; j < ex.size(); j++) h->extra.push_back(int(ex[j]));
				h->since = d["since"], h->lt = int(d["lt"]), h->hall = bool(d["hall"]), h->at = d["at"];
				l.holds.push_back(h);
			}
		}
		if (x.has("parties")) {
			l.parties.clear();
			const godot::Array a = x["parties"];
			for (int64_t k = 0; k < a.size(); k++) {
				const godot::Dictionary d = a[k];
				auto p = std::make_shared<Party>();
				p->squad = int(d["squad"]), p->to = w8(d["to"]), p->at = d["at"];
				if (d.has("raid")) {
					const godot::Dictionary r = d["raid"];
					Raid y;
					y.phase = w8(r["phase"]), y.x = r["x"], y.y = r["y"], y.building = opt_int(r, "building"), y.siege = opt_int(r, "siege");
					y.until = r["until"], y.team = int(r["team"]);
					if (r.has("loot")) y.loot = bool(r["loot"]), y.hasLoot = true;
					p->raid = y;
				}
				l.parties.push_back(p);
			}
		}
		if (x.has("freed")) {
			const godot::Dictionary f = x["freed"];
			const godot::Array ks = f.keys();
			l.freed.clear();
			for (int64_t k = 0; k < ks.size(); k++) set(l.freed, w8(ks[k]), double(f[ks[k]]));
		}
		if (x.has("fallen")) l.fallen = x["fallen"].get_type() == godot::Variant::NIL ? std::nullopt : std::optional<double>(double(x["fallen"]));
		if (x.has("born")) l.born = x["born"];
		if (x.has("lord")) l.lord = int(x["lord"]);
		if (x.has("laid")) l.laid = bool(x["laid"]);
		if (x.has("reinforceAt")) l.reinforceAt = x["reinforceAt"];
		if (x.has("raidAt")) l.raidAt = x["raidAt"];
		if (x.has("warn")) {
			l.warn.reset();
			if (x["warn"].get_type() == godot::Variant::DICTIONARY) {
				const godot::Dictionary d = x["warn"];
				Warning w;
				w.x = d["x"], w.y = d["y"], w.team = int(d["team"]), w.from = w8(d["from"]), w.at = d["at"];
				w.building = opt_int(d, "building"), w.siege = opt_int(d, "siege"), w.what = w8(d["what"]);
				l.warn = w;
			}
		}
		if (x.has("gone")) {
			l.gone.clear();
			const godot::Array a = x["gone"];
			for (int64_t k = 0; k < a.size(); k++) {
				const godot::Dictionary d = a[k];
				l.gone.push_back(std::make_shared<Gone>(Gone{ int(d["squad"]), double(d["until"]) }));
			}
		}
	}
	rng.state = uint32_t(int64_t(s["rng"]));
}

} // namespace sim
