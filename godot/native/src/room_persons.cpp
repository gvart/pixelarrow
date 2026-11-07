// The persons in the region room (server/src/war/room.ts), line for line: what a join with persons and its line leave
// behind (personsHere, spawnsNew, released), the transfers (depart, arrive), musters and hires, W-80 the larder, the
// paths and levels, a level-up spend, the battle honours of a finished fight, the tick's books (raids, faded souls, forts
// stormed) and the room's save and restore (saveState, restore, recount).
#include "room.h"

#include <cmath>

#include <godot_cpp/variant/string.hpp>

#include "js_json.h"
#include "js_math.h"
#include "room_cargo.h"
#include "room_store.h"
#include "sim_data.h"
#include "snapshot.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::Variant;

namespace {

godot::String G(const std::string &s) { return godot::String::utf8(s.c_str()); }
std::string S(const Variant &v) { return godot::String(v).utf8().get_data(); }
bool dead(const Dictionary &u) { return S(u["state"]) == "dead"; }
std::string owner_of(int pid) { return "p:" + std::to_string(pid); }
int pid_of(const std::string &o) {
	if (o.size() < 3 || o.compare(0, 2, "p:") != 0 || !std::all_of(o.begin() + 2, o.end(), [](char c) { return c >= '0' && c <= '9'; })) return -1;
	return std::stoi(o.substr(2));
}
bool is_civ(const std::string &cls) { return data().civilians.CIV_CLASSES.count(cls) > 0; }
constexpr int MAX_SQUAD = 12; // protocol.ts MAX_SQUAD (soldiers.ts SQUAD_MAX)

Array ints(const std::vector<int> &v) {
	Array a;
	for (int x : v) a.push_back(x);
	return a;
}

Behaviour hold(double x, double y, double r) {
	Behaviour b;
	b.kind = "hold";
	b.x = x;
	b.y = y;
	b.has_radius = true;
	b.radius = r;
	return b;
}

// the snapshot unit of that id (by index first)
Dictionary unit_at(const Array &us, int id) {
	if (id >= 0 && id < us.size() && int(Dictionary(us[id])["id"]) == id) return us[id];
	for (int64_t i = 0; i < us.size(); i++)
		if (int(Dictionary(us[i])["id"]) == id) return us[i];
	return Dictionary();
}

} // namespace

// M5e raids (holding buildings raided or fallen: their captives go free, the DO writes it), W-68 named souls faded or
// taken by the wild (the DO marks them gone), and the teams that stormed a foe's hold (honours)
void Room::personsTick(TickOut &out, const std::vector<Dictionary> &evs) {
	for (const Dictionary &e : evs)
		if (S(e["kind"]) == "raid") out.raided.push_back(int(e["building"]));
	for (const Dictionary &e : evs) {
		const std::string k = S(e["kind"]);
		if ((k == "soulFaded" || k == "soulLost") && e.has("pid") && e["pid"].get_type() == Variant::STRING && !S(e["pid"]).empty()) out.faded.push_back(S(e["pid"]));
	}
	for (const Dictionary &e : evs)
		if (S(e["kind"]) == "raid" && e.has("by") && int(e["by"]) != int(e["team"])) stormed.insert(int(e["by"]));
}

// A join now would spawn new squads (it is not a rejoin of squads standing here): the DO loads its persons first.
bool Room::spawnsNew(int pid) const {
	const auto p = players.find(pid);
	return !(p != players.end() && !p->second.online && !squadsOf(pid).empty());
}

// Persons on the field (alive) or waiting in the line.
std::set<std::string> Room::personsHere() const {
	std::set<std::string> out;
	// the sim's own snapshot: men spawned since the last tick (a join this tick) are here too
	const Array us = sim::snapshot(sim)["units"];
	for (int64_t i = 0; i < us.size(); i++) {
		const Dictionary u = us[i];
		if (u.has("pid") && (!dead(u) || u.has("down"))) out.insert(S(u["pid"])); // W-79: a man down is still here
	}
	for (const Waiting &w : queue)
		for (const Group &g : w.groups)
			if (g.persons)
				for (const WarPerson &p : *g.persons) out.insert(p.id);
	return out;
}

std::vector<int> Room::playerIds() const {
	std::vector<int> out;
	for (const auto &[pid, p] : players) out.push_back(pid);
	return out;
}

// His men as squads to spawn: soldiers and civilians apart (W-53), so a worker stays a worker.
std::vector<Room::Group> Room::parts(const std::vector<WarPerson> &persons) const {
	std::vector<WarPerson> men, civ;
	for (const WarPerson &p : persons) (is_civ(p.hero.cls.value_or("")) ? civ : men).push_back(p);
	std::vector<Group> out;
	for (const auto *g : { &men, &civ })
		if (!g->empty()) out.push_back({ (*g)[0].hero.cls.value_or("militia"), int(g->size()), *g });
	return out;
}

// M4 transfer out (W-87): the player's whole group leaves over the entry on `side` (room.ts depart).
Room::Departed Room::depart(int pid, const std::string &side, double foeRadius) {
	Departed res;
	snap = sim::snapshot(sim); // squads spawned since the last tick
	const std::string me = owner_of(pid);
	const std::vector<int> mine = squadsOf(pid);
	const Array us = snap["units"];
	std::vector<Dictionary> ours, men;
	for (int64_t i = 0; i < us.size(); i++) {
		const Dictionary u = us[i];
		const std::string *o = ownerAt(int(u["squad"]));
		if (o && *o == me) ours.push_back(u);
	}
	for (const Dictionary &u : ours)
		if (u.has("down")) return res.error = "down", res.detail = "a man of yours is down: wait for him to get up", res;
	for (const Dictionary &u : ours)
		if (!dead(u)) men.push_back(u);
	if (men.empty()) return res.error = "notOwner", res.detail = "none of your men stand here", res;
	for (const Dictionary &u : men)
		if (!u.has("pid")) return res.error = "notOwner", res.detail = "only soldiers (persons) transfer", res;
	const int team = teams.at(int(men[0]["squad"]));
	std::vector<Dictionary> carts;
	const Array ss = snap.get("sieges", Array());
	for (int64_t i = 0; i < ss.size(); i++) {
		const Dictionary e = ss[i];
		if (e.has("owner") && S(e["owner"]) == me && is_cart_type(S(e["type"])) && S(e["state"]) != "destroyed") carts.push_back(e);
	}
	std::vector<Dictionary> spots = men;
	spots.insert(spots.end(), carts.begin(), carts.end());
	for (int64_t i = 0; i < us.size(); i++) {
		const Dictionary u = us[i];
		if (dead(u)) continue;
		const auto t = teams.find(int(u["squad"]));
		if (t != teams.end() && t->second == team) continue;
		for (const Dictionary &s : spots)
			if (js::pow(double(u["x"]) - double(s["x"]), 2) + js::pow(double(u["y"]) - double(s["y"]), 2) <= foeRadius * foeRadius)
				return res.error = "foes", res.detail = "a foe within " + js::number_to_string(foeRadius) + " tiles", res;
	}
	const NetRect e = entry(side);
	double off = -INFINITY;
	for (const Dictionary &s : spots) {
		const double x = s["x"], y = s["y"];
		off = std::max(off, js::hypot(std::max(std::max(e.x0 - x, 0.0), x - e.x1), std::max(std::max(e.y0 - y, 0.0), y - e.y1)));
	}
	const int tick = currentTick();
	for (const Dictionary &u : men) res.ids.push_back(S(u["pid"]));
	for (const Dictionary &u : men)
		if (double(u["hp"]) < double(u["maxHp"])) res.lost.emplace_back(S(u["pid"]), double(u["maxHp"]) - double(u["hp"]));
	std::vector<PersonResult> persons = sim.reportPersons(res.ids);
	if (!persons.empty()) res.fight = Fight{ regionId + ":" + epoch + ":" + std::to_string(tick) + ":out" + std::to_string(pid), FightReport{ tick, std::move(persons), {} } };
	// M6h: their packs and all his carts ride the transfer
	Dictionary packs;
	for (const std::string &id : res.ids) {
		CargoRef ref;
		ref.persons = std::vector<std::string>{ id };
		const auto at = sim.cargo(ref);
		if (!at) continue;
		const Bundle b = cargo_take_all(at->slots);
		if (!b.lots.empty() || !b.items.empty()) packs[G(id)] = bundle_to(b);
	}
	Array cs;
	for (const Dictionary &c : carts) {
		auto cart = sim.siege->stow(int(c["id"]));
		if (!cart) continue;
		Bundle b;
		for (const Lot &l : cart->second.lots)
			if (l.n > 1e-9) b.lots.push_back(l);
		b.items = cart->second.items;
		Dictionary d = bundle_to(b), x;
		x["type"] = G(cart->first);
		x["lots"] = d["lots"];
		x["items"] = d["items"];
		cs.push_back(x);
	}
	sim.dropPersons(res.ids);
	for (const Dictionary &u : men) diedAt[int(u["id"])] = tick - Net::CORPSE_TICKS; // gone, not fallen: no corpse, no blow
	live[team] -= int(men.size());
	snap = sim::snapshot(sim);
	for (int id : mine) bots.clear(id);
	res.off = off;
	if (packs.size() || cs.size()) {
		Dictionary cargo;
		cargo["packs"] = packs;
		if (cs.size()) cargo["carts"] = cs;
		res.cargo = cargo;
	}
	return res;
}

// M4 transfer in: `persons` of the player (alliance `team`) arrive over the entry on `side` (room.ts arrive).
Room::Arrived Room::arrive(int pid, int team, const std::vector<WarPerson> &persons, const std::string &side, const std::vector<std::pair<std::string, double>> &lost, const Dictionary &cargo) {
	Arrived res;
	// W-63: the banner by ground (the settlements' wave): his own
	if (team < int(per.size())) own[pid] = team;
	const auto p = players.find(pid);
	if (team >= int(per.size()) || (p != players.end() && p->second.team != team)) return res.error = "team", res;
	const std::vector<Group> ps = parts(persons);
	if (int(squadsOf(pid).size() + ps.size()) > Net::MAX_SQUADS) return res.error = "squads", res;
	if (std::any_of(queue.begin(), queue.end(), [&](const Waiting &w) { return w.team == team; }) || live[team] + int(persons.size()) > per[team]) return res.error = "full", res;
	if (p == players.end()) {
		Player np;
		np.pid = pid;
		np.team = team;
		players[pid] = std::move(np);
	}
	std::vector<int> spawned;
	for (const Group &g : ps) spawned.push_back(spawn(owner_of(pid), team, g, std::nullopt, side));
	res.squad = spawned.empty() ? -1 : spawned[0];
	sim.hurtPersons(lost);
	// M6h: each man's pack back; the carts roll in beside them, the first crewed by the squad
	const Dictionary packs = cargo.get("packs", Dictionary());
	const Array ks = packs.keys();
	for (int64_t i = 0; i < ks.size(); i++) {
		const std::string id = S(ks[i]);
		const bool here = std::any_of(persons.begin(), persons.end(), [&](const WarPerson &x) { return x.id == id; });
		CargoRef ref;
		ref.persons = std::vector<std::string>{ here ? id : persons[0].id };
		const auto at = sim.cargo(ref);
		if (!at) continue;
		std::vector<CargoSlot> slots = at->slots;
		if (!here)
			for (CargoSlot &s : slots) s.cap = INFINITY;
		cargo_fill(slots, bundle_from(packs[ks[i]]));
	}
	const Array carts = cargo.get("carts", Array());
	for (int64_t i = 0; i < carts.size(); i++) {
		const Dictionary cart = carts[i];
		const NetRect e = entry(side);
		CargoRef sq;
		sq.squad = res.squad;
		const auto men = sim.cargo(sq);
		const double x = (men && !men->slots.empty() ? men->slots[0].x : (e.x0 + e.x1) / 2) + i * 2, y = men && !men->slots.empty() ? men->slots[0].y : (e.y0 + e.y1) / 2;
		const int c = sim.spawnCart(team, owner_of(pid), S(cart["type"]), x, y, i == 0 ? std::optional<int>(res.squad) : std::nullopt);
		CargoRef cr;
		cr.cart = c;
		const auto at = sim.cargo(cr);
		if (!at) continue;
		std::vector<CargoSlot> slots = at->slots;
		for (CargoSlot &s : slots) s.cap = INFINITY;
		cargo_fill(slots, bundle_from(cart));
	}
	// W-197: the road's encounters (encounters.road) are the encounters' wave
	snap = sim::snapshot(sim); // a muster or a haul's next leg may come before a tick
	const bool online = players.at(pid).online;
	if (!online) {
		const NetRect e = entry(side);
		for (int id : spawned) bots.set(id, hold((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, Net::HOLD_RADIUS * 2));
	}
	if (online) {
		Dictionary you;
		you["id"] = pid;
		you["team"] = team;
		res.msg["t"] = "welcome";
		res.msg["v"] = Net::NET_VERSION;
		res.msg["region"] = G(regionId);
		res.msg["you"] = you;
		res.msg["squads"] = ints(squadsOf(pid));
		res.msg["tick"] = currentTick();
		res.msg["quota"] = quota();
	}
	return res;
}

// W-98: his men off the field here fall in beside the group, or at the team's entry with nobody standing (room.ts muster).
Room::Mustered Room::muster(int pid, const std::vector<WarPerson> &persons) {
	Mustered res;
	const auto pit = players.find(pid);
	if (pit == players.end() || persons.empty()) return res;
	const std::vector<Group> ps = parts(persons);
	if (int(squadsOf(pid).size() + ps.size()) > Net::MAX_SQUADS) return res;
	const int team = pit->second.team;
	if (std::any_of(queue.begin(), queue.end(), [&](const Waiting &w) { return w.team == team; }) || live[team] + int(persons.size()) > per[team]) return res;
	snap = sim::snapshot(sim);
	const std::vector<int> mine = squadsOf(pid);
	const Array us = snap["units"];
	double sx = 0, sy = 0;
	int n = 0;
	for (int64_t i = 0; i < us.size(); i++) {
		const Dictionary u = us[i];
		if (dead(u) || std::find(mine.begin(), mine.end(), int(u["squad"])) == mine.end()) continue;
		sx += double(u["x"]), sy += double(u["y"]), n++;
	}
	const std::optional<std::pair<double, double>> at = n ? std::optional<std::pair<double, double>>({ sx / n, sy / n }) : std::nullopt;
	for (const Group &g : ps) {
		const int id = spawn(owner_of(pid), team, g, at);
		if (!players.at(pid).online) {
			std::optional<std::pair<double, double>> c = at;
			if (!c) {
				const Array now = sim::snapshot(sim)["units"];
				for (int64_t i = 0; i < now.size() && !c; i++)
					if (int(Dictionary(now[i])["squad"]) == id) c = { double(Dictionary(now[i])["x"]), double(Dictionary(now[i])["y"]) };
			}
			if (c) bots.set(id, hold(c->first, c->second, Net::HOLD_RADIUS));
		}
	}
	snap = sim::snapshot(sim);
	res.ok = true;
	if (players.at(pid).online) {
		Dictionary you;
		you["id"] = pid;
		you["team"] = team;
		res.msg["t"] = "welcome";
		res.msg["v"] = Net::NET_VERSION;
		res.msg["region"] = G(regionId);
		res.msg["you"] = you;
		res.msg["squads"] = ints(squadsOf(pid));
		res.msg["tick"] = currentTick();
		res.msg["quota"] = quota();
	}
	return res;
}

// W-144: a hired worker falls in with the workers standing here, in their squad and on their work (room.ts hired).
Room::Mustered Room::hired(int pid, const std::vector<WarPerson> &persons) {
	const auto pit = players.find(pid);
	if (pit == players.end() || persons.empty()) return {};
	const int team = pit->second.team;
	const Array sq = snap["squads"], us = snap["units"];
	const auto units = [&](int q) {
		std::vector<Dictionary> out;
		if (q < 0 || q >= sq.size()) return out;
		const Array su = Dictionary(sq[q])["units"];
		for (int64_t k = 0; k < su.size(); k++) {
			const int u = su[k];
			if (u < us.size() && !dead(us[u])) out.push_back(us[u]);
		}
		return out;
	};
	std::optional<int> into;
	for (int q : squadsOf(pid)) {
		const auto m = units(q);
		if (!m.empty() && std::all_of(m.begin(), m.end(), [](const Dictionary &u) { return is_civ(S(u["cls"])); })) {
			into = q;
			break;
		}
	}
	if (!into || int(units(*into).size() + persons.size()) > MAX_SQUAD || std::any_of(queue.begin(), queue.end(), [&](const Waiting &w) { return w.team == team; }) ||
		live[team] + int(persons.size()) > per[team])
		return muster(pid, persons);
	const Dictionary at = units(*into)[0];
	const int id = spawn(owner_of(pid), team, { persons[0].hero.cls.value_or("militia"), int(persons.size()), persons }, std::pair<double, double>{ double(at["x"]), double(at["y"]) });
	Dictionary o;
	o["kind"] = "merge";
	o["squad"] = id;
	o["into"] = *into;
	sim.order(godot::order_from(o));
	snap = sim::snapshot(sim);
	Mustered res;
	res.ok = true;
	return res;
}

// W-80: his home strongroom's goods as the DO just read them; rations and food drawn and not booked yet still come off.
void Room::setLarder(int pid, const Cost &goods) {
	const auto d = drawn.find(pid);
	const double df = d != drawn.end() ? d->second.first : 0, dr = d != drawn.end() ? d->second.second : 0;
	larders[pid] = { std::max(0.0, goods.get("food") - df), std::max(0.0, goods.get("ration") - dr) };
}

// W-80 (the sim's larder): up to `want` rations for a man of `owner` from his strongroom: rations, else HUNGER.packFood food each.
double Room::draw(const std::string &owner, double want) {
	const int pid = pid_of(owner);
	const auto l = larders.find(pid);
	if (l == larders.end()) return 0;
	const double pf = data().food.HUNGER.packFood;
	auto &[food, ration] = l->second;
	const double r = std::min(want, std::floor(ration)), f = std::min(want - r, std::floor(food / pf));
	if (r + f <= 0) return 0;
	auto &d = drawn[pid];
	ration -= r;
	food -= f * pf;
	d.second += r;
	d.first += f * pf;
	return r + f;
}

// W-80: what each player's men drew from his strongroom since the last call (the DO takes it out of storage).
std::vector<std::pair<int, Cost>> Room::drainDrawn() {
	std::vector<std::pair<int, Cost>> out;
	for (const auto &[pid, d] : drawn) {
		Cost c;
		if (d.first > 0) c.set("food", d.first);
		if (d.second > 0) c.set("ration", d.second);
		out.emplace_back(pid, c);
	}
	drawn.clear();
	return out;
}

// W-85, W-101: the player's path (the DO reads storage); the soul gate and the cart cap read it.
void Room::setPath(int pid, const PlayerPath &way) {
	const auto it = paths.find(pid);
	const double was = it != paths.end() ? it->second.level.value_or(1) : 1;
	paths[pid] = way;
	if (way.level.value_or(1) != was) sim.refreshPerks(owner_of(pid)); // W-84: his men here take his new perks
}

// W-84: a player's level changed somewhere (the DO's poll).
void Room::setLevel(int pid, double level) {
	const auto it = paths.find(pid);
	if (it == paths.end()) return;
	PlayerPath way = it->second;
	way.level = level;
	setPath(pid, way);
}

// A level-up spend on a man of this room: his living man takes it, baked again. 'absent': no living man of his here.
std::string Room::levelUp(const std::string &id, const std::vector<std::pair<std::string, double>> &attrs, const std::optional<std::string> &skill) {
	const WarPerson *p = sim.person(id);
	if (!p) return "absent";
	const auto q = spend_level(*p, attrs, skill);
	if (const std::string *why = std::get_if<std::string>(&q)) return *why;
	sim.setPerson(std::get<WarPerson>(q));
	return "ok";
}

// Battle honours won in a finished fight go on its report (src/war/sim/honours.ts); the fort-taking slate is wiped.
void Room::honour(FightReport &report) {
	const int n = Net::ALLIANCES;
	std::vector<int> claims(n, 0);
	const Array cs = snap.get("claims", Array());
	for (int64_t i = 0; i < cs.size(); i++) {
		const Dictionary c = cs[i];
		const int t = c["team"];
		if (S(c["state"]) == "claimed" && t >= 0 && t < n) claims[t]++;
	}
	const int best = *std::max_element(claims.begin(), claims.end());
	std::vector<int> lead;
	for (int i = 0; i < n; i++)
		if (claims[i] == best && claims[i] > 0) lead.push_back(i);
	HonourContext ctx;
	ctx.region = S(meta.get("name", ""));
	for (const WorldRegion &w : data().captives.WORLD_REGIONS)
		if (w.id == regionId) ctx.region = w.name;
	ctx.chokepoint = data().room.CHOKEPOINTS.count(regionId) > 0;
	ctx.has_holder = lead.size() == 1;
	ctx.holder = lead.size() == 1 ? lead[0] : 0;
	for (int t : stormed) ctx.stormed.insert(t);
	std::vector<HonourPerson> hp;
	for (const PersonResult &x : report.persons) hp.push_back({ x.pid, x.team, x.state });
	const auto won = honours_of(hp, ctx);
	for (PersonResult &x : report.persons)
		for (const auto &[id, h] : won)
			if (id == x.pid) x.honour = h;
	stormed.clear();
}

// W-63 (room.ts settleTick, its first lines): a camp or fort site that shows is put down to the player who placed it
// (the settlements it may found are their own wave); placements refused drop off after SETTLE_EVERY ticks.
void Room::campsTick() {
	if (pendingCamps.empty()) return;
	constexpr int SETTLE_EVERY = 10;
	const Array bs = snap.get("buildings", Array());
	for (int64_t i = 0; i < bs.size(); i++) {
		const Dictionary b = bs[i];
		const std::string type = S(b["type"]);
		if ((type != "camp" && type != "fort") || b.has("pre") || campBy.count(int(b["id"]))) continue;
		const auto c = std::find_if(pendingCamps.begin(), pendingCamps.end(), [&](const PendingCamp &c) {
			return c.team == int(b["team"]) && c.type == type && std::abs(c.x - double(b["x"])) <= 3 && std::abs(c.y - double(b["y"])) <= 3;
		});
		if (c != pendingCamps.end()) campBy[int(b["id"])] = c->pid, pendingCamps.erase(c);
	}
	const int tick = snap["tick"];
	pendingCamps.erase(std::remove_if(pendingCamps.begin(), pendingCamps.end(), [&](const PendingCamp &c) { return tick - c.tick >= SETTLE_EVERY; }), pendingCamps.end());
}

// Living soldiers per alliance from the current snapshot.
void Room::recount() {
	live.assign(per.size(), 0);
	const Array us = snap["units"];
	for (int64_t i = 0; i < us.size(); i++) {
		const Dictionary u = us[i];
		if (dead(u)) continue;
		const auto t = teams.find(int(u["squad"]));
		if (t != teams.end() && t->second < int(live.size())) live[t->second]++;
	}
}

// ---------------------------------------------------------------- save and restore

namespace {

Dictionary group_to(const std::string &cls, int count, const std::optional<std::vector<WarPerson>> &persons) {
	Dictionary g;
	g["cls"] = G(cls);
	g["count"] = count;
	if (persons) {
		Array a;
		for (const WarPerson &p : *persons) a.push_back(war_person_to(p));
		g["persons"] = a;
	}
	return g;
}

template <class T, class F>
Array sparse(const std::map<int, T> &m, F f) {
	Array a;
	if (m.empty()) return a;
	a.resize(m.rbegin()->first + 1);
	for (const auto &[i, v] : m) a[i] = f(v);
	return a;
}

const char *SIM_AT = "\x02sim\x02", *BOTS_AT = "\x02bots\x02";

} // namespace

// The whole region for storage (RoomState): the sim's exact state plus the room's own books. simText: the sim's save
// (Sim.save: it needs a fresh sim of the region, the diffs' baseline, which the host keeps).
Room::Saved Room::saveState(const std::string &simText) const {
	Saved out;
	const Dictionary now = sim::snapshot(sim);
	const Array us = now["units"];
	Array pids, playersA, died, queueA, stormedA, ownA, pathsA;
	for (int64_t i = 0; i < us.size(); i++) {
		const Dictionary u = us[i];
		if (u.has("pid") && !dead(u)) pids.push_back(u["pid"]);
	}
	for (const auto &[id, t] : diedAt)
		if (currentTick() - t < Net::CORPSE_TICKS) died.push_back(Array::make(id, t));
	for (const auto &[pid, p] : players) {
		Dictionary x;
		x["pid"] = pid;
		x["team"] = p.team;
		playersA.push_back(x);
	}
	for (const Waiting &w : queue) {
		Dictionary x;
		Array gs;
		for (const Group &g : w.groups) gs.push_back(group_to(g.cls, g.count, g.persons));
		x["pid"] = w.pid;
		x["join"] = w.join;
		x["groups"] = gs;
		queueA.push_back(x);
	}
	for (int t : stormed) stormedA.push_back(t);
	for (const auto &[pid, t] : own) ownA.push_back(Array::make(pid, t));
	for (const auto &[pid, w] : paths) pathsA.push_back(Array::make(pid, player_path_to(w)));
	Dictionary settle;
	settle["own"] = ownA;
	Array campA;
	for (const auto &[b, p] : campBy) campA.push_back(Array::make(b, p));
	settle["campBy"] = campA;
	settle["tried"] = Array(); // W-63 camps tried as settlements: the settlements' wave
	Dictionary &h = out.head;
	h["v"] = 2;
	h["region"] = G(regionId);
	h["tick"] = sim.tick;
	h["players"] = playersA;
	h["owners"] = sparse(owners, [](const std::string &o) { return Variant(G(o)); });
	h["teams"] = sparse(teams, [](int t) { return Variant(t); });
	h["spawns"] = spawns;
	h["died"] = died;
	h["lastBlow"] = lastBlow;
	h["inFight"] = inFight;
	h["queue"] = queueA;
	h["pids"] = pids;
	Dictionary full = h.duplicate(false);
	full["sim"] = SIM_AT;
	full["bots"] = BOTS_AT;
	for (const char *k : { "run", "mends", "stormed", "settle", "paths" }) {
		const Variant v = std::string(k) == "run" ? Variant(G(run)) : std::string(k) == "mends" ? Variant(Array()) : std::string(k) == "stormed" ? Variant(stormedA) : std::string(k) == "settle" ? Variant(settle) : Variant(pathsA);
		h[k] = v;
		full[k] = v;
	}
	const Variant lords = warlordsState();
	if (lords.get_type() != Variant::NIL) h["warlords"] = lords, full["warlords"] = lords;
	out.sim = simText;
	out.bots = bots.exportState();
	std::string text = js_stringify(full);
	const auto splice = [&](const char *at, const std::string &with) {
		std::string key;
		js_stringify(key, Variant(at));
		const size_t i = text.find(key);
		if (i != std::string::npos) text.replace(i, key.size(), with);
	};
	splice(SIM_AT, out.sim);
	splice(BOTS_AT, out.bots);
	out.text = std::move(text);
	return out;
}

// A room rebuilt from saveState() after an eviction (this one fresh, on a fresh sim): the sim resumes where it was saved,
// every player offline with his squads on the hold AI; a man on the field storage no longer has here leaves unreported.
bool Room::restore(const Dictionary &st, const std::string &simText, const std::string &botsText, const std::set<std::string> &persons, std::string &why) {
	if (!sim.load(simText, why)) return false;
	if (!bots.importState(botsText)) return why = "bots: a malformed save", false;
	if (st.has("warlords")) loadWarlords(st["warlords"]);
	const Array os = st.get("owners", Array()), ts = st.get("teams", Array());
	for (int64_t i = 0; i < os.size(); i++)
		if (os[i].get_type() != Variant::NIL) owners[int(i)] = S(os[i]);
	for (int64_t i = 0; i < ts.size(); i++)
		if (ts[i].get_type() != Variant::NIL) teams[int(i)] = int(ts[i]);
	spawns = int(st["spawns"]);
	const Array died = st.get("died", Array());
	for (int64_t i = 0; i < died.size(); i++) diedAt[int(Array(died[i])[0])] = int(Array(died[i])[1]);
	lastBlow = int(st["lastBlow"]);
	inFight = bool(st["inFight"]);
	queue.clear();
	const Array q = st.get("queue", Array());
	for (int64_t i = 0; i < q.size(); i++) {
		const Dictionary x = q[i];
		Waiting w;
		w.pid = int(x["pid"]);
		w.join = x["join"];
		w.team = int(w.join["team"]);
		const Array gs = x["groups"];
		for (int64_t k = 0; k < gs.size(); k++) {
			const Dictionary g = gs[k];
			Group gr{ S(g["cls"]), int(g["count"]), std::nullopt };
			if (g.has("persons")) {
				std::vector<WarPerson> ps;
				const Array a = g["persons"];
				for (int64_t j = 0; j < a.size(); j++) ps.push_back(war_person_from(a[j]));
				gr.persons = ps;
			}
			w.groups.push_back(std::move(gr));
		}
		queue.push_back(std::move(w));
	}
	if (st.has("run")) run = S(st["run"]);
	stormed.clear();
	const Array sa = st.get("stormed", Array());
	for (int64_t i = 0; i < sa.size(); i++) stormed.insert(int(sa[i]));
	paths.clear();
	const Array pa = st.get("paths", Array());
	for (int64_t i = 0; i < pa.size(); i++) paths[int(Array(pa[i])[0])] = player_path_from(Array(pa[i])[1]);
	own.clear();
	campBy.clear();
	const Dictionary settle = st.get("settle", Dictionary());
	const Array oa = settle.get("own", Array()), ca = settle.get("campBy", Array());
	for (int64_t i = 0; i < oa.size(); i++) own[int(Array(oa[i])[0])] = int(Array(oa[i])[1]);
	for (int64_t i = 0; i < ca.size(); i++) campBy[int(Array(ca[i])[0])] = int(Array(ca[i])[1]);
	for (const Waiting &w : std::vector<Waiting>(queue)) dequeue(w.pid); // nobody is connected to wait: their persons go home (takeReleased)
	std::vector<std::string> gone;
	const Array pids = st.get("pids", Array());
	for (int64_t i = 0; i < pids.size(); i++)
		if (!persons.count(S(pids[i]))) gone.push_back(S(pids[i]));
	if (!gone.empty()) sim.dropPersons(gone);
	snap = sim::snapshot(sim);
	lastTick = int(snap["tick"]) - 1;
	const Array ps = st.get("players", Array());
	for (int64_t i = 0; i < ps.size(); i++) {
		const Dictionary x = ps[i];
		Player p;
		p.pid = int(x["pid"]);
		p.team = int(x["team"]);
		players[p.pid] = std::move(p);
	}
	for (int64_t i = 0; i < ps.size(); i++) leave(int(Dictionary(ps[i])["pid"])); // hold where they stand
	recount();
	return true;
}

} // namespace sim
