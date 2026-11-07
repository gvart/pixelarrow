// P8 wave C: the region room's settlements and politics (server/src/war/room.ts W-63 shared settlements, W-64 pacts,
// W-150 oaths, W-61 peace and alliance works, W-185 town jobs, with ./roomSettlements.ts and src/war/net/works.ts),
// line for line: the banner by ground, the settlements as each player sees them, building on a settlement's ground,
// the camps that found one, attacks on settlements and claim points being taken, a settlement laid down again on a
// fresh field, its reports, presence and store goods, the oaths' household and lieges, the pacts in alliesOf and claims,
// peace() (labour, guards, works, town jobs) and the town jobs on the wire. What the DO books of them is the store's
// (settle.h).
#include "room.h"

#include <algorithm>
#include <cmath>

#include "js_json.h"
#include "js_math.h"
#include "room_cargo.h"
#include "sim_data.h"
#include "snapshot.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::Variant;
using T = SettleTables;

namespace {

godot::String G(const std::string &s) { return godot::String::utf8(s.c_str()); }
std::string S(const Variant &v) { return godot::String(v).utf8().get_data(); }
bool dead(const Dictionary &u) { return S(u["state"]) == "dead"; }
bool truthy(const Dictionary &d, const char *k) { return d.has(k) && d[k].booleanize(); }
bool civ(const Dictionary &u) { return S(u["cls"]).rfind("civ_", 0) == 0; }
std::string owner_of(int pid) { return "p:" + std::to_string(pid); }
// /^p:(\d+)$/ on an owner: its player id (-1: not a player's)
int pid_of(const std::string &o) {
	if (o.size() < 3 || o.compare(0, 2, "p:") != 0 || !std::all_of(o.begin() + 2, o.end(), [](char c) { return c >= '0' && c <= '9'; })) return -1;
	return std::stoi(o.substr(2));
}
bool in_circle(const RoomSettle &s, double x, double y) { return (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) <= s.r * s.r; }
bool in_plot(const Plot &p, double x, double y) { return x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1; }
const Array arr(const Dictionary &d, const char *k) { return d.get(k, Array()); }

// roomSettlements.ts bannerOf: the settlement whose banner his men fly here (lord before citizen before garrison)
const RoomSettle *banner_of(const std::vector<RoomSettle> &list, int pid) {
	const RoomSettle *best = nullptr;
	int rank = 9;
	for (const RoomSettle &s : list)
		for (const SettleMember &m : s.members)
			if (m.pid == pid) {
				const int r = m.role == "lord" ? 0 : m.role == "citizen" ? 1 : 2;
				if (s.team && r < rank) best = &s, rank = r;
				break;
			}
	return best;
}

// roomSettlements.ts householdOf: `other` a citizen or the garrison of a settlement `owner` is lord of, or sworn to him
std::function<bool(const std::string &, const std::string &)> household_of(std::vector<RoomSettle> list, std::vector<Oath> oaths) {
	return [list = std::move(list), oaths = std::move(oaths)](const std::string &owner, const std::string &other) {
		const int lord = pid_of(owner), pid = pid_of(other);
		if (lord < 0 || pid < 0) return false;
		for (const Oath &x : oaths)
			if (x.lord == lord && x.vassal == pid) return true;
		for (const RoomSettle &s : list)
			if (s.lord == lord)
				for (const SettleMember &m : s.members)
					if (m.pid == pid) return true;
		return false;
	};
}

// roomSettlements.ts buildRefusal
std::optional<std::string> build_refusal(const std::vector<RoomSettle> &list, int pid, const std::vector<double> &tiles) {
	for (size_t i = 0; i + 1 < tiles.size(); i += 2) {
		const double x = tiles[i], y = tiles[i + 1];
		for (const RoomSettle &s : list) {
			if (!in_circle(s, x + 0.5, y + 0.5)) continue;
			const SettleMember *me = nullptr, *other = nullptr;
			for (const SettleMember &m : s.members)
				if (m.pid == pid && m.role != "garrison") {
					me = &m;
					break;
				}
			for (const SettleMember &m : s.members)
				if (m.pid != pid && m.plot && in_plot(*m.plot, x, y)) {
					other = &m;
					break;
				}
			if (me && me->role == "lord") {
				if (other) return "That is a citizen's plot in " + s.name;
				continue;
			}
			if (me && me->plot && in_plot(*me->plot, x, y)) continue;
			return me ? "Build on your own plot in " + s.name : s.name + " is " + s.lordName + "'s ground: ask its lord for a plot";
		}
	}
	return std::nullopt;
}

// roomSettlements.ts ownBuildings: its banner's, on its ground
std::vector<Dictionary> own_buildings(const Dictionary &snap, const RoomSettle &s) {
	std::vector<Dictionary> out;
	if (!s.team) return out;
	const Array bs = arr(snap, "buildings");
	for (int64_t i = 0; i < bs.size(); i++) {
		const Dictionary b = bs[i];
		if (int(b["team"]) == *s.team && !truthy(b, "pre") && S(b["state"]) != "destroyed" && in_circle(s, b["x"], b["y"])) out.push_back(b);
	}
	return out;
}

// roomSettlements.ts piecesOf: its plain pieces (built, standing; no wall, bridge, stairs, brazier or chest), centre first
Array pieces_of(const Dictionary &snap, const RoomSettle &s) {
	std::vector<Dictionary> own;
	for (const Dictionary &b : own_buildings(snap, s)) {
		const auto &B = data().economy.BUILDINGS;
		const auto d = B.find(S(b["type"]));
		const std::string st = S(b["state"]);
		if (d != B.end() && !truthy(b, "pre") && d->second.wall.empty() && !d->second.bridge && d->second.access.empty() && !d->second.brazier && !d->second.chest && !d->second.prebuilt &&
			(st == "done" || st == "damaged"))
			own.push_back(b);
	}
	std::stable_sort(own.begin(), own.end(), [&](const Dictionary &a, const Dictionary &b) {
		const int ia = a["id"], ib = b["id"];
		if (ia == s.centre) return ib != s.centre;
		if (ib == s.centre) return false;
		return ia < ib;
	});
	Array out;
	for (const Dictionary &b : own) {
		Dictionary p, goods;
		const Dictionary g = b.get("goods", Dictionary());
		const Array ks = g.keys();
		for (int64_t i = 0; i < ks.size(); i++) {
			const double n = g[ks[i]];
			if (n > 1e-6) goods[ks[i]] = js::round(n * 1000) / 1000;
		}
		p["type"] = b["type"], p["x"] = b["x"], p["y"] = b["y"], p["rot"] = b["rot"];
		p["hp"] = js::round(double(b["hp"]) / std::max(1.0, double(b["maxHp"])) * 1000) / 1000;
		if (goods.size()) p["goods"] = goods;
		out.push_back(p);
	}
	return out;
}

// src/war/net/works.ts workSite: where work `id` stands in the region (fixed by its data)
std::pair<double, double> work_site(const std::string &id, const Dictionary &meta, const Grid &grid, const char *quadrant) {
	const double w = meta["w"], h = meta["h"], cx = w / 2, cy = h / 2;
	const Array pre = arr(meta, "prebuilt");
	const auto first = [&](const char *type) -> const Dictionary {
		for (int64_t i = 0; i < pre.size(); i++)
			if (S(Dictionary(pre[i])["type"]) == type) return pre[i];
		return Dictionary();
	};
	if (id == "wonder") {
		Dictionary p = first("stoa");
		if (p.is_empty()) p = first("statue");
		if (!p.is_empty()) return { p["x"], p["y"] };
		const auto t = work_site("temple", meta, grid, quadrant);
		return { std::min(w - 1, t.first + 12), t.second };
	}
	if (id == "temple") {
		Dictionary t = first("temple");
		if (t.is_empty()) t = first("shrine");
		return t.is_empty() ? std::pair<double, double>{ cx, cy } : std::pair<double, double>{ t["x"], t["y"] };
	}
	if (id == "road") {
		const std::string q = quadrant ? quadrant : "";
		const std::string want = q == "NW" ? "E" : q == "NE" ? "W" : q == "SE" ? "W" : "E";
		const Array es = arr(meta, "entries");
		Dictionary e;
		for (int64_t i = 0; i < es.size() && e.is_empty(); i++)
			if (S(Dictionary(es[i])["side"]) == want) e = es[i];
		if (e.is_empty() && es.size()) e = es[0];
		if (e.is_empty()) return { cx, cy };
		const double dx = cx - double(e["x"]), dy = cy - double(e["y"]), hd = js::hypot(dx, dy), d = hd ? hd : 1;
		return { js::round(double(e["x"]) + (dx / d) * 16), js::round(double(e["y"]) + (dy / d) * 16) };
	}
	std::pair<double, double> best{ cx, cy };
	double bh = -1;
	const double R = std::min(64.0, std::floor(std::min(w, h) / 3));
	for (double y = std::max(0.0, cy - R); y < std::min(h, cy + R); y += 8)
		for (double x = std::max(0.0, cx - R); x < std::min(w, cx + R); x += 8) {
			const size_t i = size_t(std::floor(y) * w + std::floor(x));
			const double v = i < grid.height.size() ? grid.height[i] : 0;
			if (v > bh) bh = v, best = { x, y };
		}
	return best;
}

} // namespace

// what the room holds of the settlements and politics (room.ts fields)
struct RoomPolitics {
	std::vector<RoomSettle> settles;
	std::vector<Oath> oaths;
	std::vector<PactIn> pacts;
	std::vector<GuardWatch> guards;
	struct TownJob {
		int id = 0, pid = 0;
		double x = 0, y = 0;
	};
	std::vector<TownJob> townJobs;
	struct WorkSite {
		std::string work;
		int team = 0;
		double x = 0, y = 0;
	};
	std::vector<WorkSite> workSites;
	JsMap<int, std::vector<Dictionary>> later; // messages owed (a banner changed), sent after the tick's
	JsSet<int> tried; // camps tried as settlements (saved)
	JsMap<std::string, double> hpSeen;
	JsMap<std::string, int> attackAt, takeAt;
};

RoomPolitics &Room::P() const {
	if (!pol_) pol_ = std::make_shared<RoomPolitics>();
	return *pol_;
}

// ---------------------------------------------------------------- W-63 shared settlements

std::optional<int> Room::bannerTeam(int pid) const {
	const RoomSettle *s = banner_of(P().settles, pid);
	return s && s->team && *s->team < int(per.size()) ? s->team : std::nullopt;
}

void Room::setOaths(const std::vector<Oath> &list) {
	RoomPolitics &pp = P();
	pp.oaths = list;
	sim.works->set_ties(household_of(pp.settles, list));
	JsMap<std::string, Oath> want;
	for (const Oath &o : list) want[owner_of(o.vassal)] = o;
	std::vector<std::string> owners;
	for (const auto &[k, l] : sim.works->lieges) owners.push_back(k);
	std::sort(owners.begin(), owners.end());
	for (const std::string &owner : owners)
		if (!want.count(owner)) {
			Dictionary o;
			o["kind"] = "setLiege", o["owner"] = G(owner), o["to"] = Variant(), o["pct"] = 0;
			roomOrder(o);
		}
	for (const auto &[owner, o] : want) {
		const auto cur = sim.works->lieges.find(owner);
		if (cur == sim.works->lieges.end() || cur->second.to != owner_of(o.lord) || cur->second.pct != o.pct) {
			Dictionary d;
			d["kind"] = "setLiege", d["owner"] = G(owner), d["to"] = G(owner_of(o.lord)), d["pct"] = o.pct;
			roomOrder(d);
		}
	}
}

godot::Array Room::titheReports() const {
	Array out;
	const Array bs = arr(snap, "buildings");
	for (int64_t i = 0; i < bs.size(); i++) {
		const Dictionary b = bs[i];
		const int payer = b.has("owner") ? pid_of(S(b["owner"])) : -1, receiver = b.has("titheTo") ? pid_of(S(b["titheTo"])) : -1;
		if (!truthy(b, "tithe") || payer <= 0 || receiver <= 0) continue;
		Dictionary r;
		r["building"] = b["id"], r["type"] = b["type"], r["payer"] = payer, r["receiver"] = receiver, r["goods"] = b["tithe"];
		out.push_back(r);
	}
	return out;
}

void Room::setSettlements(const std::vector<RoomSettle> &list) {
	RoomPolitics &pp = P();
	pp.settles = list;
	std::stable_sort(pp.settles.begin(), pp.settles.end(), [](const RoomSettle &a, const RoomSettle &b) { return a.id < b.id; });
	sim.works->set_ties(household_of(pp.settles, pp.oaths));
	const Array towns = arr(snap, "townLevels");
	for (const RoomSettle &s : pp.settles) {
		if (!s.team || *s.team >= int(per.size())) continue;
		for (int64_t i = 0; i < towns.size(); i++) {
			const Dictionary t = towns[i];
			if (int(t["id"]) != s.centre) continue;
			if (int(t["team"]) != *s.team) {
				Dictionary o;
				o["kind"] = "rebanner", o["centre"] = s.centre, o["team"] = *s.team;
				roomOrder(o);
			}
			break;
		}
	}
	std::vector<int> pids;
	for (const auto &[pid, p] : players) pids.push_back(pid);
	std::sort(pids.begin(), pids.end());
	for (int pid : pids) {
		Player &p = players.find(pid)->second;
		const std::optional<int> b = bannerTeam(pid);
		const auto o = own.find(pid);
		const int want = b ? *b : o != own.end() ? o->second : p.team;
		if (want == p.team) continue;
		for (int id : squadsOf(pid)) {
			Dictionary d;
			d["kind"] = "turnSquad", d["squad"] = id, d["team"] = want;
			roomOrder(d);
			teams[id] = want;
		}
		p.team = want;
		if (p.enc) p.feed = std::make_shared<EconomyFeed>(); // influence and nodes of the new banner
		townSent.erase(pid);
		if (p.online) {
			Dictionary m, you;
			you["id"] = pid, you["team"] = want;
			m["t"] = "welcome", m["v"] = Net::NET_VERSION, m["region"] = G(regionId), m["you"] = you;
			Array sq;
			for (int id : squadsOf(pid)) sq.push_back(id);
			m["squads"] = sq, m["tick"] = currentTick(), m["quota"] = quota();
			tellLater(pid, m);
		}
	}
}

void Room::setPacts(const std::vector<PactIn> &list) { P().pacts = list; }

std::string Room::pactWith(int a, int b) const {
	bool any = false;
	for (const PactIn &x : P().pacts)
		if ((x.a == a && x.b == b) || (x.a == b && x.b == a)) {
			if (x.kind == "pact") return "pact";
			any = true;
		}
	return any ? "truce" : "";
}

godot::Array Room::settlementsFor(int pid) const {
	Array out;
	for (const RoomSettle &s : P().settles) {
		Dictionary d;
		d["id"] = s.id, d["centre"] = s.centre, d["x"] = s.x, d["y"] = s.y, d["r"] = s.r, d["name"] = G(s.name), d["lord"] = s.lord, d["lordName"] = G(s.lordName);
		d["team"] = s.team ? Variant(*s.team) : Variant(), d["level"] = s.level, d["overlord"] = s.overlord ? Variant(*s.overlord) : Variant(), d["tribute"] = s.tribute;
		Array plots;
		Variant role;
		for (const SettleMember &m : s.members) {
			if (m.plot) {
				Dictionary p;
				p["pid"] = m.pid, p["x0"] = m.plot->x0, p["y0"] = m.plot->y0, p["x1"] = m.plot->x1, p["y1"] = m.plot->y1;
				plots.push_back(p);
			}
			if (m.pid == pid && role.get_type() == Variant::NIL) role = G(m.role);
		}
		d["plots"] = plots, d["role"] = role;
		out.push_back(d);
	}
	return out;
}

void Room::tellLater(int pid, const Dictionary &m) { P().later[pid].push_back(m); }

void Room::flushLater(TickOut &out) {
	RoomPolitics &pp = P();
	for (const auto &[pid, ms] : pp.later) {
		const auto p = players.find(pid);
		if (p != players.end() && p->second.online)
			for (const Dictionary &m : ms) out.msgs[pid].push_back(m);
	}
	pp.later.clear();
}

// an order the room itself gives (turnSquad, rebanner, setLiege): to the sim at the next step
void Room::roomOrder(const Dictionary &o) { sim.order(godot::order_from(o)); }

std::optional<std::string> Room::groundRefusal(int pid, int team, const Dictionary &o) {
	const RoomPolitics &pp = P();
	if (pp.settles.empty()) return std::nullopt;
	const std::string kind = S(o["kind"]);
	std::vector<double> tiles;
	const auto add = [&](const char *k) {
		const Array a = arr(o, k);
		for (int64_t i = 0; i < a.size(); i++) tiles.push_back(a[i]);
	};
	if (kind == "placeBuilding") {
		const auto &B = data().economy.BUILDINGS;
		const auto d = B.find(S(o["type"]));
		if (d == B.end() || d->second.brazier || d->second.access == "ladder") return std::nullopt; // field pieces before foe walls
		for (int t : sim.works->check_placement(team, S(o["type"]), o["x"], o["y"], int(o.get("rot", 0))).tiles) tiles.push_back(t);
	} else if (kind == "placeWall") add("points"), add("towers"), add("gates");
	else if (kind == "placeBridge") add("points");
	else return std::nullopt;
	return build_refusal(pp.settles, pid, tiles);
}

bool Room::presence(int pid, int id) const {
	const RoomPolitics &pp = P();
	const auto s = std::find_if(pp.settles.begin(), pp.settles.end(), [&](const RoomSettle &x) { return x.id == id; });
	if (s == pp.settles.end()) return false;
	const std::string me = owner_of(pid);
	const Array us = snap["units"];
	int n = 0;
	for (int64_t i = 0; i < us.size(); i++) {
		const Dictionary u = us[i];
		const auto o = owners.find(int(u["squad"]));
		if (!dead(u) && !civ(u) && o != owners.end() && o->second == me && in_circle(*s, u["x"], u["y"])) n++;
	}
	return n >= T::SETTLE_PRESENCE;
}

godot::Array Room::settlementReports() const {
	Array out;
	const Array us = snap["units"], towns = arr(snap, "townLevels");
	for (const RoomSettle &s : P().settles) {
		std::set<std::string> people;
		for (const SettleMember &m : s.members)
			if (m.role != "garrison") people.insert(owner_of(m.pid));
		bool tended = false;
		for (int64_t i = 0; i < us.size() && !tended; i++) {
			const Dictionary u = us[i];
			const auto o = owners.find(int(u["squad"]));
			tended = !dead(u) && o != owners.end() && people.count(o->second) && in_circle(s, u["x"], u["y"]);
		}
		Variant level = 0;
		for (int64_t i = 0; i < towns.size(); i++)
			if (int(Dictionary(towns[i])["id"]) == s.centre) {
				level = Dictionary(towns[i])["level"];
				break;
			}
		Dictionary r, persist;
		persist["pieces"] = pieces_of(snap, s);
		r["id"] = s.id, r["level"] = level, r["tended"] = tended, r["persist"] = persist;
		out.push_back(r);
	}
	return out;
}

godot::Dictionary Room::storeGoods(int id) {
	Dictionary out;
	const RoomPolitics &pp = P();
	const auto s = std::find_if(pp.settles.begin(), pp.settles.end(), [&](const RoomSettle &x) { return x.id == id; });
	if (s == pp.settles.end()) return out;
	for (const Dictionary &b : own_buildings(snap, *s)) { // storesOf: with goods, chests aside
		if (!b.has("goods") || S(b["type"]) == "chest") continue;
		CargoRef ref;
		ref.building = int(b["id"]);
		const auto at = sim.cargo(ref);
		if (!at) continue;
		for (const CargoSlot &sl : at->slots) // cargo.ts contents
			for (const Lot &l : sl.hold->lots)
				if (l.n > 1e-6) out[G(l.r)] = double(out.get(G(l.r), 0.0)) + l.n;
	}
	return out;
}

std::optional<int> Room::restorePieces(int team, double x, double y, double r, const Array &pieces) {
	if (!pieces.size() || team >= int(per.size())) return std::nullopt;
	sim.claim(team, x, y, r);
	std::set<int> before;
	{
		const Array bs = arr(sim::snapshot(sim), "buildings");
		for (int64_t i = 0; i < bs.size(); i++) before.insert(int(Dictionary(bs[i])["id"]));
	}
	const auto &B = data().economy.BUILDINGS;
	for (int64_t i = 0; i < pieces.size(); i++) {
		const Dictionary p = pieces[i];
		if (!B.count(S(p["type"]))) continue;
		Dictionary o;
		o["kind"] = "placeBuilding", o["team"] = team, o["type"] = p["type"], o["x"] = p["x"], o["y"] = p["y"], o["rot"] = p["rot"];
		sim.order(godot::order_from(o));
	}
	sim.step();
	std::vector<Dictionary> fresh;
	{
		const Array bs = arr(sim::snapshot(sim), "buildings");
		for (int64_t i = 0; i < bs.size(); i++) {
			const Dictionary b = bs[i];
			if (!before.count(int(b["id"])) && int(b["team"]) == team) fresh.push_back(b);
		}
	}
	std::optional<int> centre;
	for (int64_t i = 0; i < pieces.size(); i++) {
		const Dictionary p = pieces[i];
		const auto b = std::find_if(fresh.begin(), fresh.end(), [&](const Dictionary &q) {
			return S(q["type"]) == S(p["type"]) && std::abs(double(q["x"]) - double(p["x"])) <= 1 && std::abs(double(q["y"]) - double(p["y"])) <= 1;
		});
		if (b == fresh.end()) continue;
		const int id = (*b)["id"];
		sim.works->finish_site(id);
		const double hp = p["hp"];
		if (hp < 1) sim.works->damage(id, double((*b)["maxHp"]) * (1 - std::max(0.05, hp)));
		if (p.has("goods")) {
			CargoRef ref;
			ref.building = id;
			const auto at = sim.cargo(ref);
			if (at) {
				Bundle bundle;
				const Dictionary g = p["goods"];
				const Array ks = g.keys();
				for (int64_t k = 0; k < ks.size(); k++) bundle.lots.push_back({ S(ks[k]), double(g[ks[k]]), regionId, std::nullopt });
				cargo_fill(at->slots, bundle);
			}
		}
		const std::string type = S(p["type"]);
		if (i == 0 && (type == "camp" || type == "fort")) centre = id;
	}
	snap = sim::snapshot(sim);
	return centre;
}

// every SETTLE_EVERY (after campsTick): claim points being taken, finished camps to found, attacks on settlements
godot::Dictionary Room::settleTick() {
	RoomPolitics &pp = P();
	const int tick = snap["tick"];
	if (tick % T::SETTLE_EVERY) return Dictionary();
	Array found, attacks, taking;
	const Array claims = arr(snap, "claims"), bs = arr(snap, "buildings"), us = snap["units"];
	for (int64_t i = 0; i < claims.size(); i++) {
		const Dictionary c = claims[i];
		const std::string tk = c.has("taking") && c["taking"].get_type() != Variant::NIL ? S(c["taking"]) : "";
		if (tk.empty() || (tk == "channel" && double(c["progress"]) <= 0) || !c.has("by") || double(c["by"]) < 0) continue;
		const std::string k = std::to_string(int(c["id"])) + ":" + std::to_string(int(c["by"]));
		const auto at = pp.takeAt.find(k);
		if (at != pp.takeAt.end() && tick - at->second < T::ATTACK_COOLDOWN) continue;
		pp.takeAt[k] = tick;
		Dictionary t;
		t["point"] = c["id"], t["holder"] = c["team"], t["by"] = c["by"];
		taking.push_back(t);
	}
	if (!isHome)
		for (int64_t i = 0; i < bs.size(); i++) {
			const Dictionary b = bs[i];
			const std::string type = S(b["type"]), st = S(b["state"]);
			const int id = b["id"];
			if ((type != "camp" && type != "fort") || truthy(b, "pre") || (st != "done" && st != "damaged") || pp.tried.count(id)) continue;
			const auto lord = campBy.find(id);
			if (lord == campBy.end()) continue;
			pp.tried.insert(id);
			if (std::any_of(pp.settles.begin(), pp.settles.end(), [&](const RoomSettle &s) { return s.centre == id || in_circle(s, b["x"], b["y"]); })) continue; // a camp of a settlement
			Dictionary f;
			f["centre"] = id, f["x"] = b["x"], f["y"] = b["y"], f["lord"] = lord->second;
			found.push_back(f);
		}
	// attacks: a settlement's pieces or its people's men there lost hp while a foe player's men struck near
	JsMap<std::string, double> seen;
	for (const RoomSettle &s : pp.settles) {
		if (!s.team) continue;
		std::set<std::string> people;
		for (const SettleMember &m : s.members) people.insert(owner_of(m.pid));
		const auto near = [&](double x, double y, double k) { return (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) <= (s.r + k) * (s.r + k); };
		bool hurt = false;
		for (const Dictionary &b : own_buildings(snap, s)) {
			const std::string k = "b" + std::to_string(int(b["id"]));
			const auto was = pp.hpSeen.find(k);
			if (was != pp.hpSeen.end() && double(b["hp"]) < was->second - 1e-6) hurt = true;
			seen[k] = b["hp"];
		}
		for (int64_t i = 0; i < us.size(); i++) {
			const Dictionary u = us[i];
			const auto o = owners.find(int(u["squad"]));
			if (o == owners.end() || !people.count(o->second) || !near(u["x"], u["y"], 0)) continue;
			const std::string k = "u" + std::to_string(int(u["id"]));
			const double hp = dead(u) ? 0 : double(u["hp"]);
			const auto was = pp.hpSeen.find(k);
			if (was != pp.hpSeen.end() && hp < was->second - 1e-6) hurt = true;
			if (!dead(u)) seen[k] = hp;
		}
		if (!hurt) continue;
		std::set<int> by;
		for (int64_t i = 0; i < us.size(); i++) {
			const Dictionary u = us[i];
			const auto t = teams.find(int(u["squad"]));
			if (S(u["state"]) != "attack" || (t != teams.end() && t->second == *s.team) || !near(u["x"], u["y"], 12)) continue;
			const auto o = owners.find(int(u["squad"]));
			const int pid = o != owners.end() ? pid_of(o->second) : -1;
			if (pid >= 0 && !std::any_of(s.members.begin(), s.members.end(), [&](const SettleMember &m) { return m.pid == pid; })) by.insert(pid);
		}
		for (int pid : by) {
			const std::string k = std::to_string(s.id) + ":" + std::to_string(pid);
			const auto at = pp.attackAt.find(k);
			if (at != pp.attackAt.end() && tick - at->second < T::ATTACK_COOLDOWN) continue;
			pp.attackAt[k] = tick;
			Dictionary a;
			a["by"] = pid, a["victim"] = s.id;
			attacks.push_back(a);
		}
	}
	pp.hpSeen = seen;
	if (!found.size() && !attacks.size() && !taking.size()) return Dictionary();
	Dictionary out;
	out["found"] = found, out["attacks"] = attacks, out["taking"] = taking;
	return out;
}

// ---------------------------------------------------------------- W-61 peace: guards, works, town jobs

void Room::setGuards(const std::vector<GuardWatch> &list) { P().guards = list; }

void Room::watchTownJob(int id, int pid, double x, double y) { P().townJobs.push_back({ id, pid, x, y }); }

void Room::unwatchTownJob(int id) {
	auto &js = P().townJobs;
	js.erase(std::remove_if(js.begin(), js.end(), [&](const RoomPolitics::TownJob &j) { return j.id == id; }), js.end());
}

std::vector<int> Room::pathPlayers() const {
	std::vector<int> out;
	for (const auto &[pid, w] : paths) out.push_back(pid);
	return out;
}

void Room::setWorks(int team, const std::vector<std::string> &ids) {
	RoomPolitics &pp = P();
	pp.workSites.clear();
	for (const std::string &work : ids) {
		const auto at = work_site(work, meta, *sim.grid, T::allianceQuadrant(team));
		pp.workSites.push_back({ work, team, at.first, at.second });
	}
}

godot::Dictionary Room::peace() {
	if (int(snap["tick"]) % Net::LABOUR_EVERY) return Dictionary();
	const RoomPolitics &pp = P();
	const double secs = Net::LABOUR_EVERY / 10.0;
	townRest(secs);
	Array labour, guards, works, jobs;
	for (const auto &[k, n] : sim.labourLog) { // takeLabour
		const size_t i = k.rfind('|');
		const int pid = pid_of(k.substr(0, i));
		if (pid < 0) continue;
		Dictionary l;
		l["pid"] = pid, l["site"] = std::stoi(k.substr(i + 1)), l["secs"] = n;
		labour.push_back(l);
	}
	sim.labourLog.clear();
	const Array towns = arr(snap, "townLevels"), us = snap["units"];
	std::vector<Dictionary> men;
	for (int64_t i = 0; i < us.size(); i++)
		if (!dead(us[i])) men.push_back(us[i]);
	const auto pidAt = [&](const Dictionary &u) {
		const auto o = owners.find(int(u["squad"]));
		return o != owners.end() ? pid_of(o->second) : -1;
	};
	const auto d2 = [](const Dictionary &u, double x, double y) { return (double(u["x"]) - x) * (double(u["x"]) - x) + (double(u["y"]) - y) * (double(u["y"]) - y); };
	for (const GuardWatch &g : pp.guards) {
		Dictionary t;
		for (int64_t i = 0; i < towns.size() && t.is_empty(); i++)
			if (int(Dictionary(towns[i])["team"]) == g.team) t = towns[i];
		int n = 0;
		if (!t.is_empty())
			for (const Dictionary &u : men)
				if (!civ(u) && pidAt(u) == g.taker && d2(u, t["x"], t["y"]) <= double(t["r"]) * double(t["r"])) n++;
		Dictionary r;
		r["id"] = g.id, r["held"] = n >= g.men, r["secs"] = secs;
		guards.push_back(r);
	}
	for (const auto &w : pp.workSites) {
		std::map<int, double> by; // a JS object of player ids: ascending keys
		for (const Dictionary &u : men) {
			const int pid = pidAt(u);
			const auto t = teams.find(int(u["squad"]));
			if (pid < 0 || t == teams.end() || t->second != w.team || d2(u, w.x, w.y) > T::WORK_R * T::WORK_R) continue;
			by[pid] += secs;
		}
		if (by.empty()) continue;
		Dictionary r, b;
		for (const auto &[pid, n] : by) b[G(std::to_string(pid))] = n;
		r["team"] = w.team, r["work"] = G(w.work), r["by"] = b;
		works.push_back(r);
	}
	for (const auto &j : pp.townJobs) {
		int n = 0;
		for (const Dictionary &u : men)
			if (pidAt(u) == j.pid && d2(u, j.x, j.y) <= T::WORK_R * T::WORK_R) n++;
		if (!n) continue;
		Dictionary r;
		r["id"] = j.id, r["pid"] = j.pid, r["secs"] = n * secs;
		jobs.push_back(r);
	}
	if (!labour.size() && !guards.size() && !works.size() && !jobs.size()) return Dictionary();
	Dictionary out;
	out["labour"] = labour, out["guards"] = guards, out["works"] = works;
	if (jobs.size()) out["townJobs"] = jobs;
	return out;
}

bool Room::townWorking() const { return pol_ && !pol_->townJobs.empty(); }

// works.ts atTownWork: a man standing free by a town job his owner holds is drawn at work, turned to it
godot::Dictionary Room::atTownWork(const Dictionary &u) const {
	if (S(u["state"]) != "idle" || truthy(u, "work") || truthy(u, "task")) return u;
	const auto o = owners.find(int(u["squad"]));
	for (const auto &j : P().townJobs) {
		const double x = u["x"], y = u["y"];
		if (o != owners.end() && o->second == owner_of(j.pid) && (x - j.x) * (x - j.x) + (y - j.y) * (y - j.y) <= T::WORK_R * T::WORK_R) {
			Dictionary v = u.duplicate(false);
			v["state"] = "build";
			v["facing"] = js::atan2(j.y - y, j.x - x);
			return v;
		}
	}
	return u;
}

void Room::settleSave(Dictionary &settle) const {
	Array t;
	if (pol_)
		for (int id : pol_->tried) t.push_back(id);
	settle["tried"] = t;
}

void Room::settleLoad(const Dictionary &settle) {
	RoomPolitics &pp = P();
	pp.tried.clear();
	const Array t = arr(settle, "tried");
	for (int64_t i = 0; i < t.size(); i++) pp.tried.insert(int(t[i]));
}

} // namespace sim
