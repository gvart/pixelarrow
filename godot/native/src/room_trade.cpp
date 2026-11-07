// The holders and trade in the region room (server/src/war/room.ts), line for line (docs/impl/godot-port.md P8 wave
// B): mends of stash items at a workplace and the items freed when their order goes (unmend), M6e a crafted item into
// its owner's chest (deposit), a slain guardian's loot pile (M7e, W-62 WAKE.loot), the region's holds for D1
// (holdRows), M6f the carriers and their cargo bridges (carrier, inCourt, takeCargo, giveCargo), W-143..W-145 what
// stands at the NPC town (npcSlots, cartsOf, giveCart), M6g hand-off windows and their swap, W-184..W-195 the town
// board's bands and watched Build jobs, his army for the board's reading, and the mends saved and restored.
#include "room.h"

#include <algorithm>
#include <cmath>

#include <godot_cpp/variant/string.hpp>

#include "bosses.h"
#include "js_math.h"
#include "npc_market.h"
#include "room_trade_store.h"
#include "roster.h"
#include "sim_data.h"
#include "sim_wild.h"
#include "snapshot.h"
#include "stories.h"
#include "town_board.h"
#include "trade.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::Variant;

namespace {
constexpr double EPS = 1e-6;
constexpr double HANDOFF_REACH = 4, HANDOFF_TICKS = 600; // room.ts HANDOFF
godot::String G(const std::string &s) { return godot::String::utf8(s.c_str()); }
std::string S(const Variant &v) { return godot::String(v).utf8().get_data(); }
std::string owner_of(int pid) { return "p:" + std::to_string(pid); }
int pid_of(const std::string &o) {
	if (o.size() < 3 || o.compare(0, 2, "p:") != 0 || !std::all_of(o.begin() + 2, o.end(), [](char c) { return c >= '0' && c <= '9'; })) return -1;
	return std::stoi(o.substr(2));
}
std::string N(double v) { return js::number_to_string(v); }
std::string hkey(int a, int b) { return a < b ? std::to_string(a) + ":" + std::to_string(b) : std::to_string(b) + ":" + std::to_string(a); }

// room.ts subtract: what of bundle b got across, given r came back
std::pair<Cost, std::vector<std::string>> subtract(const Bundle &b, const Bundle &r) {
	Cost g = bundle_goods(b);
	const Cost rest = bundle_goods(r);
	for (const auto &[k, n] : rest.kv) g.set(k, g.get(k) - n);
	Cost out;
	for (const auto &[k, n] : g.kv)
		if (n > 1e-9) out.set(k, n);
	std::vector<std::string> left, uids;
	for (const Item &i : r.items) left.push_back(i.uid);
	for (const Item &i : b.items)
		if (std::find(left.begin(), left.end(), i.uid) == left.end()) uids.push_back(i.uid);
	return { out, uids };
}
} // namespace

// the room's wave-B state (room.ts mends, handoffs, townJobs, townBands)
struct RoomTrade {
	struct Mend {
		std::string uid;
		int pid = 0, building = 0;
		std::string def;
	};
	std::vector<Mend> mends;
	std::map<std::string, Room::HandoffWindow> handoffs; // looked up by key only
	std::vector<Room::TownJob> townJobs;
	std::set<int> townBands;
};

RoomTrade &Room::tr() const {
	if (!trade_) trade_ = std::make_shared<RoomTrade>();
	return *trade_;
}

// M5h4: repair or salvage the player's stash item at workplace `building` of his team ("" when sent to the sim; it may
// still refuse it: the tick then hands the uid back)
std::string Room::mend(int pid, const std::string &kind, int building, const Item &item) {
	const auto p = players.find(pid);
	if (p == players.end() || !p->second.online) return "notJoined";
	const Array bs = snap.get("buildings", Array());
	Variant team;
	for (int64_t i = 0; i < bs.size(); i++)
		if (int(Dictionary(bs[i])["id"]) == building) {
			team = Dictionary(bs[i])["team"];
			break;
		}
	if (team.get_type() == Variant::NIL || int(team) != p->second.team) return "badTarget";
	const Building *b = sim.works->piece(building);
	if (!b || !sim.works->may_use(*b, owner_of(pid), p->second.team)) return "notAllowed";
	for (const auto &m : tr().mends)
		if (m.uid == item.uid) return "bad";
	Dictionary o;
	o["kind"] = G(kind);
	o["team"] = p->second.team;
	o["building"] = building;
	o["owner"] = G(owner_of(pid));
	o["item"] = item_full_to(item);
	sim.order(godot::order_from(o));
	tr().mends.push_back({ item.uid, pid, building, item.def });
	return "";
}

// M6e: a crafted item into its owner's chest (of the team) nearest the workplace with room for it, else the maker's
// pack, else the team's home strongroom in the region; its uid the event's key (c:<key>)
void Room::deposit(Dictionary &e) {
	Dictionary item = Dictionary(e["item"]).duplicate(true);
	item["uid"] = G("c:" + regionId + ":" + run + ":" + N(double(e["order"])));
	e["item"] = item;
	const Item it = item_from(item);
	const Array bs = snap.get("buildings", Array());
	Dictionary wp;
	for (int64_t i = 0; i < bs.size(); i++)
		if (Dictionary(bs[i])["id"] == e["building"]) {
			wp = bs[i];
			break;
		}
	std::vector<Dictionary> chests;
	for (int64_t i = 0; i < bs.size(); i++) {
		const Dictionary b = bs[i];
		if (S(b["type"]) == "chest" && b.has("owner") && S(b["owner"]) == S(e["owner"]) && b["team"] == e["team"] && S(b["state"]) == "done") chests.push_back(b);
	}
	const auto d2 = [&](const Dictionary &b) {
		const double dx = double(b["x"]) - double(wp["x"]), dy = double(b["y"]) - double(wp["y"]);
		return dx * dx + dy * dy;
	};
	std::stable_sort(chests.begin(), chests.end(), [&](const Dictionary &a, const Dictionary &b) { return (!wp.is_empty() ? d2(a) - d2(b) : double(a["id"]) - double(b["id"])) < 0; });
	const Bundle one{ {}, { it } };
	for (const Dictionary &c : chests) {
		CargoRef ref;
		ref.building = int(c["id"]);
		const auto at = sim.cargo(ref);
		if (at && cargo_room(at->slots) >= 0.2 - EPS && cargo_fill(at->slots, one).items.empty()) return;
	}
	// no chest with room: the maker carries it in his pack (the stash lists packs)
	if (e.has("pid") && e["pid"].get_type() != Variant::NIL && !S(e["pid"]).empty()) {
		CargoRef ref;
		ref.persons = std::vector<std::string>{ S(e["pid"]) };
		const auto maker = sim.cargo(ref);
		if (maker && maker->owner == S(e["owner"]) && cargo_fill(maker->slots, one).items.empty()) return;
	}
	CargoRef ref;
	ref.reserve = int(e["team"]);
	sim.cargo(ref)->slots[0].hold->items.push_back(it);
}

// M6e: the region's holders of players for the D1 snapshot (war_region_holds): chests, carts, each squad's packs
std::vector<HoldRow> Room::holdRows() {
	std::vector<HoldRow> out;
	const auto row = [&](const std::string &ref, const std::string &kind, int pid, int team, const CargoAt &at) {
		auto [goods, items] = cargo_contents(at.slots);
		out.push_back({ ref, kind, pid, team, goods, items });
	};
	const Array bs = snap.get("buildings", Array()), ss = snap.get("sieges", Array()), sq = snap["squads"], us = snap["units"];
	for (int64_t i = 0; i < bs.size(); i++) {
		const Dictionary b = bs[i];
		const int pid = S(b["type"]) == "chest" && b.has("owner") ? pid_of(S(b["owner"])) : -1;
		if (pid < 0) continue;
		CargoRef ref;
		ref.building = int(b["id"]);
		if (const auto at = sim.cargo(ref)) row("b:" + N(b["id"]), "chest", pid, b["team"], *at);
	}
	for (int64_t i = 0; i < ss.size(); i++) {
		const Dictionary s = ss[i];
		const int pid = s.has("owner") ? pid_of(S(s["owner"])) : -1;
		if (pid < 0 || S(s["state"]) == "destroyed") continue;
		CargoRef ref;
		ref.cart = int(s["id"]);
		if (const auto at = sim.cargo(ref)) row("c:" + N(s["id"]), "cart", pid, s["team"], *at);
	}
	for (int64_t i = 0; i < sq.size(); i++) {
		const Dictionary s = sq[i];
		const int pid = pid_of(S(s["owner"]));
		if (pid < 0) continue;
		const Array ids = s["units"];
		bool pack = false;
		for (int64_t k = 0; k < ids.size() && !pack; k++) {
			const int u = ids[k];
			pack = u >= 0 && u < us.size() && Dictionary(us[u]).has("pack");
		}
		if (!pack) continue;
		CargoRef ref;
		ref.squad = int(s["id"]);
		if (const auto at = sim.cargo(ref)) row("k:" + N(s["id"]), "packs", pid, s["team"], *at);
	}
	return out;
}

// M6f: the player's own carrier: his squad's packs or his cart (nullopt: not his, or gone)
std::optional<CargoAt> Room::carrier(int pid, const Carrier &from) {
	const std::string me = owner_of(pid);
	if (from.squad) {
		const std::string *o = ownerAt(*from.squad);
		if (!o || *o != me) return std::nullopt;
		CargoRef ref;
		ref.squad = *from.squad;
		return sim.cargo(ref);
	}
	if (!from.cart) return std::nullopt;
	CargoRef ref;
	ref.cart = *from.cart;
	const auto at = sim.cargo(ref);
	return at && at->owner == me ? at : std::nullopt;
}

// M6f: the carrier stands in the town's market court (a region with no court: anywhere)
bool Room::inCourt(int pid, const Carrier &from) {
	const auto at = carrier(pid, from);
	if (!at) return false;
	const Array safe = meta.get("safe", Array());
	if (!safe.size()) return true;
	std::vector<Rect> rs;
	for (int64_t i = 0; i < safe.size(); i++) {
		const Dictionary c = safe[i];
		rs.push_back({ c["x"], c["y"], c["w"], c["h"] });
	}
	for (const CargoSlot &s : at->slots)
		if (in_rects(&rs, s.x, s.y)) return true;
	return false;
}

std::optional<Bundle> Room::takeCargo(int pid, const Carrier &from, const Cost &goods, const std::vector<std::string> &uids, std::optional<double> seal) {
	const auto at = carrier(pid, from);
	return at ? cargo_take_out(at->slots, goods, uids, seal) : std::nullopt;
}

Bundle Room::giveCargo(int pid, const Carrier &to, const Bundle &b) {
	const auto at = carrier(pid, to);
	return at ? cargo_fill(at->slots, b) : b;
}

// W-143: every pack and cart of his standing at this region's NPC town
std::vector<CargoSlot> Room::npcSlots(int pid) {
	const XY at = npc_spot(meta);
	const double r2 = data().market.reach * data().market.reach;
	std::vector<CargoSlot> out;
	const auto take = [&](const CargoRef &ref) {
		if (const auto c = sim.cargo(ref))
			for (const CargoSlot &s : c->slots)
				if ((s.x - at.x) * (s.x - at.x) + (s.y - at.y) * (s.y - at.y) <= r2) out.push_back(s);
	};
	for (int q : squadsOf(pid)) {
		CargoRef ref;
		ref.squad = q;
		take(ref);
	}
	for (int c : cartsOf(pid)) {
		CargoRef ref;
		ref.cart = c;
		take(ref);
	}
	return out;
}

// W-145: his carts here
std::vector<int> Room::cartsOf(int pid) {
	const std::string me = owner_of(pid);
	const Dictionary sn = sim::snapshot(sim);
	const Array ss = sn.get("sieges", Array());
	std::vector<int> out;
	for (int64_t i = 0; i < ss.size(); i++) {
		const Dictionary e = ss[i];
		const std::string type = S(e["type"]);
		if ((type == "handcart" || type == "wagon") && e.has("owner") && S(e["owner"]) == me && S(e["state"]) != "destroyed") out.push_back(e["id"]);
	}
	return out;
}

// W-145: a cart of his rolls up beside his men, the first of his squads crewing it if it has no other cart
std::optional<int> Room::giveCart(int pid, const std::string &type) {
	const auto p = players.find(pid);
	const std::vector<int> qs = squadsOf(pid);
	std::optional<CargoAt> at;
	if (!qs.empty()) {
		CargoRef ref;
		ref.squad = qs[0];
		at = sim.cargo(ref);
	}
	if (p == players.end() || !at || at->slots.empty()) return std::nullopt;
	const bool crewed = !cartsOf(pid).empty();
	return sim.spawnCart(p->second.team, owner_of(pid), type, at->slots[0].x + 2, at->slots[0].y, crewed ? std::nullopt : std::optional<int>(qs[0]));
}

// the two carriers stand within HANDOFF.reach tiles of each other
bool Room::near(int a, const Carrier &ca, int b, const Carrier &cb) {
	const auto x = carrier(a, ca), y = carrier(b, cb);
	if (!x || !y) return false;
	const double r2 = HANDOFF_REACH * HANDOFF_REACH;
	for (const CargoSlot &s : x->slots)
		for (const CargoSlot &t : y->slots)
			if ((s.x - t.x) * (s.x - t.x) + (s.y - t.y) * (s.y - t.y) <= r2) return true;
	return false;
}

// M6g hand-off: offer sets (or changes, clearing both confirms) his half of the window, confirm marks his consent,
// cancel closes it; the window lasts HANDOFF.ticks and needs both carriers near
Room::HandoffGot Room::handoff(int pid, int other, const std::string &op, const std::optional<HandoffHalf> &half) {
	HandoffGot got;
	const auto p = players.find(pid), q = players.find(other);
	if (p == players.end() || !p->second.online || q == players.end() || pid == other) return got.error = "notJoined", got.detail = "both must be here", got;
	auto &hs = tr().handoffs;
	const std::string k = hkey(pid, other);
	auto w = hs.find(k);
	if (w != hs.end() && currentTick() > w->second.until) hs.erase(w), w = hs.end();
	if (op == "cancel") {
		if (w == hs.end()) return got.error = "bad", got.detail = "no window", got;
		got.window = w->second;
		hs.erase(w);
		return got;
	}
	if (op == "offer") {
		if (!half || !carrier(pid, half->from)) return got.error = "notOwner", got.detail = "not your carrier", got;
		if (w == hs.end()) {
			HandoffWindow n;
			n.a = std::min(pid, other), n.b = std::max(pid, other), n.until = currentTick() + int(HANDOFF_TICKS);
			w = hs.emplace(k, n).first;
		}
		w->second.halves[pid] = *half;
		w->second.ok.clear();
	} else {
		if (w == hs.end() || !w->second.halves.count(pid) || !w->second.halves.count(other)) return got.error = "bad", got.detail = "both halves first", got;
		auto &ok = w->second.ok;
		if (std::find(ok.begin(), ok.end(), pid) == ok.end()) ok.push_back(pid);
	}
	const HandoffWindow &win = w->second;
	const auto ha = win.halves.find(win.a), hb = win.halves.find(win.b);
	if (ha != win.halves.end() && hb != win.halves.end() && !near(win.a, ha->second.from, win.b, hb->second.from))
		return got.error = "badTarget", got.detail = "stand within " + N(HANDOFF_REACH) + " tiles", got;
	got.window = win;
	got.ready = win.ok.size() == 2;
	return got;
}

// a ready window swapped at once, all or nothing (refused: nothing moves)
std::string Room::swapHandoff(int a, int b) {
	auto &hs = tr().handoffs;
	const auto it = hs.find(hkey(a, b));
	if (it == hs.end()) return "expired";
	const HandoffWindow w = it->second;
	hs.erase(it);
	if (w.ok.size() != 2 || currentTick() > w.until) return "expired";
	const HandoffHalf &ha = w.halves.at(w.a), &hb = w.halves.at(w.b);
	if (!near(w.a, ha.from, w.b, hb.from)) return "walked off";
	const CargoAt xa = *carrier(w.a, ha.from), xb = *carrier(w.b, hb.from);
	const auto ba = cargo_take_out(xa.slots, ha.goods, ha.uids);
	if (!ba) return "lacks his half";
	const auto bb = cargo_take_out(xb.slots, hb.goods, hb.uids);
	if (!bb) return cargo_fill(xa.slots, *ba), "lacks his half";
	const Bundle ra = cargo_fill(xb.slots, *ba), rb = cargo_fill(xa.slots, *bb);
	if (!ra.lots.empty() || !ra.items.empty() || !rb.lots.empty() || !rb.items.empty()) {
		// no room: undo (each side takes back what crossed and gets his own half again)
		const auto sa = subtract(*ba, ra), sb = subtract(*bb, rb);
		cargo_take_out(xb.slots, sa.first, sa.second);
		cargo_take_out(xa.slots, sb.first, sb.second);
		cargo_fill(xa.slots, *ba), cargo_fill(xb.slots, *bb);
		return "no room";
	}
	return "";
}

std::vector<std::string> Room::mendUids() const {
	std::vector<std::string> out;
	for (const auto &m : tr().mends) out.push_back(m.uid);
	return out;
}

// mend items whose order is gone without a crafted event: per workplace and item kind the room holds no more items
// than its queue has repair / salvage orders (the newest go back first)
std::vector<std::string> Room::unmend(const std::set<std::string> &done) {
	auto &ms = tr().mends;
	ms.erase(std::remove_if(ms.begin(), ms.end(), [&](const RoomTrade::Mend &m) { return done.count(m.uid) > 0; }), ms.end());
	if (ms.empty()) return {};
	std::map<std::string, int> open; // looked up by key only
	const Array bs = snap.get("buildings", Array());
	for (int64_t i = 0; i < bs.size(); i++) {
		const Dictionary b = bs[i];
		const Array q = b.get("queue", Array());
		for (int64_t k = 0; k < q.size(); k++) {
			const Dictionary o = q[k];
			if (S(o["kind"]) != "craft") open[N(b["id"]) + "|" + S(o["recipe"])]++;
		}
	}
	std::vector<std::string> freed;
	for (int i = int(ms.size()) - 1; i >= 0; i--) {
		const std::string key = std::to_string(ms[i].building) + "|" + ms[i].def;
		const auto f = open.find(key);
		const int n = f != open.end() ? f->second : 0;
		int held = 0;
		for (int j = 0; j <= i; j++)
			if (std::to_string(ms[j].building) + "|" + ms[j].def == key) held++;
		if (held > n) freed.push_back(ms[i].uid), ms.erase(ms.begin() + i);
	}
	return freed;
}

// W-185: a Kill's band set down where it fights alone, on ground walkable from the town
Room::TownBand Room::townBand(const Dictionary &band, const std::string &seed) {
	const auto [x, y] = bandSpot(seed);
	AddLair d;
	d.kind = S(band["kind"]);
	d.x = x, d.y = y;
	d.count = double(band["count"]);
	d.lead = band.has("lead");
	if (band.has("chief")) d.chief = S(band["chief"]);
	sim.mobHost->dirty = true;
	const int lair = sim.mobs->add(d);
	sim.mobHost->flush();
	tr().townBands.insert(lair);
	return { lair, x, y };
}

bool Room::townBandIs(int lair) const { return tr().townBands.count(lair) > 0; }

std::pair<double, double> Room::bandSpot(const std::string &seed) {
	const XY town = npc_spot(meta);
	const auto &bd = data().board.band;
	const double nearR = bd.near, far = bd.far, apart = bd.apart;
	const int tries = int(bd.tries);
	const Array lairs = sim::snapshot(sim).get("lairs", Array()), safe = meta.get("safe", Array());
	uint32_t h = 0x811c9dc5u;
	const godot::String gs = G(seed);
	for (int64_t i = 0; i < gs.length(); i++) h = (h ^ uint32_t(gs[i])) * 0x01000193u;
	const double PI = 3.141592653589793;
	for (int i = 0; i < tries; i++) {
		h = (h ^ uint32_t(i)) * 0x01000193u;
		const double a = double(h % 360) * (PI / 180), d = nearR + double((h >> 9) % uint32_t(far - nearR));
		const double x = js::round(town.x + js::cos(a) * d) + 0.5, y = js::round(town.y + js::sin(a) * d) + 0.5;
		if (x < 4 || y < 4 || x > w - 5 || y > this->h - 5) continue;
		bool bad = false;
		for (int64_t k = 0; k < safe.size() && !bad; k++) {
			const Dictionary c = safe[k];
			const double cx = c["x"], cy = c["y"], cw = c["w"], ch = c["h"];
			bad = x >= cx - 8 && x <= cx + cw + 8 && y >= cy - 8 && y <= cy + ch + 8;
		}
		for (int64_t k = 0; k < lairs.size() && !bad; k++) {
			const Dictionary l = lairs[k];
			bad = S(l["state"]) != "cleared" && js::hypot(double(l["x"]) - x, double(l["y"]) - y) < apart;
		}
		if (bad) continue;
		if (sim.siegeHost.walkable(town.x, town.y, x, y)) return { x, y };
	}
	// nothing free on the ring: the first walkable ground nearer in, whatever stands there
	for (double d = nearR; d > 6; d -= 4)
		for (int k = 0; k < 8; k++) {
			const double x = town.x + js::cos((k * PI) / 4) * d, y = town.y + js::sin((k * PI) / 4) * d;
			if (sim.siegeHost.walkable(town.x, town.y, x, y)) return { x, y };
		}
	return { town.x, town.y };
}

void Room::setTownJobs(const std::vector<TownJob> &list) { tr().townJobs = list; }
void Room::watchTownJob(const TownJob &j) { tr().townJobs.push_back(j); }
void Room::unwatchTownJob(int id) {
	auto &js = tr().townJobs;
	js.erase(std::remove_if(js.begin(), js.end(), [&](const TownJob &j) { return j.id == id; }), js.end());
}
const std::vector<Room::TownJob> &Room::townJobs() const { return tr().townJobs; }

// W-184: his fighters and workers on the field here, for the board's reading of his strength
std::vector<BoardMan> Room::armyOf(int pid) {
	const std::string me = owner_of(pid);
	const Dictionary sn = sim::snapshot(sim);
	const Array us = sn["units"], sq = sn["squads"];
	std::vector<BoardMan> out;
	for (int64_t i = 0; i < us.size(); i++) {
		const Dictionary u = us[i];
		const int s = u["squad"];
		if (S(u["state"]) == "dead" || (u.has("wounded") && bool(u["wounded"])) || s >= sq.size() || S(Dictionary(sq[s])["owner"]) != me) continue;
		BoardMan m;
		m.cls = S(u["cls"]);
		if (u.has("level")) m.level = double(u["level"]);
		m.hp = double(u["hp"]) / std::max(1.0, double(u["maxHp"]));
		out.push_back(m);
	}
	return out;
}

// room.ts tick: crafted items into chests, a slain guardian's loot pile (its rare goods WAKE.loot times over in a boss
// wake), the mend items whose order went
void Room::tradeTick(TickOut &out, const std::vector<Dictionary> &evs) {
	std::set<std::string> done;
	for (const Dictionary &x : evs) {
		const std::string kind = S(x["kind"]);
		if (kind == "crafted") {
			Dictionary e = x.duplicate(true);
			if (S(e["what"]) == "craft") deposit(e);
			else done.insert(S(Dictionary(e["item"])["uid"]));
			out.crafted.push_back(e);
		} else if (kind == "bossSlain") out.bosses.push_back(x);
	}
	const double loot = bossLoot();
	for (int64_t i = 0; i < out.bosses.size(); i++) {
		const Dictionary e = out.bosses[i];
		BossNote n;
		n.t = e["t"];
		n.kind = S(e["kind"]);
		n.boss = S(e["boss"]);
		n.region = S(e["region"]);
		n.x = e.get("x", w / 2.0), n.y = e.get("y", h / 2.0);
		const BossPile pile = boss_pile(regionId, run, n);
		std::vector<Lot> lots;
		for (const BossGood &g : boss_goods(n.boss)) lots.push_back({ g.r, g.n * loot, regionId, std::nullopt });
		sim.piles->drop(n.x, n.y, lots, pile.items, sim.tick);
	}
	out.freed = unmend(done);
}

Array Room::mendsSaved() const {
	Array a;
	for (const auto &m : tr().mends) {
		Dictionary d;
		d["uid"] = G(m.uid);
		d["pid"] = m.pid;
		d["building"] = m.building;
		d["def"] = G(m.def);
		a.push_back(d);
	}
	return a;
}

void Room::loadMends(const Array &a) {
	auto &ms = tr().mends;
	ms.clear();
	for (int64_t i = 0; i < a.size(); i++) {
		const Dictionary d = a[i];
		ms.push_back({ S(d["uid"]), int(d["pid"]), int(d["building"]), S(d["def"]) });
	}
}

} // namespace sim
