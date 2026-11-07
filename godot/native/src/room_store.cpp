// MemoryStore (room_store.h): src/dev/roomStore.ts line for line, with server/src/war/persons.ts and captives.ts as the
// rules it keeps.
#include "room_store.h"

#include <algorithm>

#include <godot_cpp/classes/file_access.hpp>
#include <godot_cpp/classes/json.hpp>
#include <godot_cpp/variant/array.hpp>

#include "js_json.h"
#include "room_trade_store.h"
#include "sim_data.h"

namespace sim {

namespace {

// server/src/war/persons.ts HEAL.field and HOLD_MAX
constexpr double HEAL_FIELD = 6 * 3600000.0;
constexpr int HOLD_MAX = 20;

std::string S(const godot::Variant &v) { return godot::String(v).utf8().get_data(); }
godot::String G(const std::string &s) { return godot::String::utf8(s.c_str()); }
bool nil(const godot::Dictionary &d, const char *k) { return !d.has(k) || d[k].get_type() == godot::Variant::NIL; }
bool is_civ(const WarPerson &p) { return data().civilians.CIV_CLASSES.count(p.hero.cls.value_or("")) > 0; }
bool in_army(const std::string &s) { return s == "active" || s == "wounded" || s == "training"; }
// /^p:(\d+)$/ on an owner: its player id (-1: not a player's)
int pid_of(const std::string &o) {
	if (o.size() < 3 || o.compare(0, 2, "p:") != 0 || !std::all_of(o.begin() + 2, o.end(), [](char c) { return c >= '0' && c <= '9'; })) return -1;
	return std::stoi(o.substr(2));
}

// Number.prototype.toString(36) of a whole number
std::string base36(double v) {
	long long n = (long long)v;
	if (n == 0) return "0";
	const bool neg = n < 0;
	if (neg) n = -n;
	std::string s;
	while (n) s.insert(s.begin(), "0123456789abcdefghijklmnopqrstuvwxyz"[n % 36]), n /= 36;
	return neg ? "-" + s : s;
}

// the gear a soul wakes with: his class's fresh kit, the uids made anew (roomStore.ts reUid)
std::vector<std::pair<std::string, Item>> re_uid(const WarPerson &p, double now) {
	std::vector<std::pair<std::string, Item>> out;
	for (auto [slot, it] : fresh_hero(p.hero.cls.value_or("militia"), p.id).equip) {
		it.uid = p.id + "-" + slot + "-" + base36(now);
		out.emplace_back(slot, it);
	}
	return out;
}

godot::Variant opt(const std::optional<std::string> &v) { return v ? godot::Variant(G(*v)) : godot::Variant(); }
godot::Variant opt(const std::optional<double> &v) { return v ? godot::Variant(*v) : godot::Variant(); }
godot::Variant opt(const std::optional<int> &v) { return v ? godot::Variant(*v) : godot::Variant(); }
std::optional<std::string> ostr(const godot::Dictionary &d, const char *k) { return nil(d, k) ? std::nullopt : std::optional<std::string>(S(d[k])); }
std::optional<double> onum(const godot::Dictionary &d, const char *k) { return nil(d, k) ? std::nullopt : std::optional<double>(double(d[k])); }
std::optional<int> oint(const godot::Dictionary &d, const char *k) { return nil(d, k) ? std::nullopt : std::optional<int>(int(d[k])); }

godot::Array deeds_to(const std::vector<Deed> &ds) {
	godot::Array a;
	for (const Deed &x : ds) {
		godot::Dictionary o;
		o["id"] = G(x.id);
		o["name"] = G(x.name);
		a.push_back(o);
	}
	return a;
}

} // namespace

// ---------------------------------------------------------------- the JSON of the books

godot::Dictionary person_result_to(const PersonResult &x) {
	godot::Dictionary d;
	d["pid"] = G(x.pid);
	d["owner"] = G(x.owner);
	d["team"] = x.team;
	d["state"] = G(x.state);
	if (x.captor) d["captor"] = *x.captor;
	if (x.fort) d["fort"] = *x.fort;
	d["xp"] = x.xp;
	d["kills"] = x.kills;
	d["dmg"] = x.dmg;
	d["levelUps"] = x.levelUps;
	d["hero"] = hero_to(x.hero);
	if (!x.deeds.empty()) d["deeds"] = deeds_to(x.deeds);
	if (x.scar) d["scar"] = true;
	if (x.honour) {
		godot::Dictionary h;
		h["name"] = G(x.honour->name);
		h["stat"] = G(x.honour->stat);
		d["honour"] = h;
	}
	return d;
}

PersonResult person_result_from(const godot::Dictionary &d) {
	PersonResult x;
	x.pid = S(d["pid"]);
	x.owner = S(d["owner"]);
	x.team = int(d["team"]);
	x.state = S(d["state"]);
	x.captor = oint(d, "captor");
	x.fort = oint(d, "fort");
	x.xp = d["xp"];
	x.kills = d["kills"];
	x.dmg = d["dmg"];
	x.levelUps = int(d["levelUps"]);
	x.hero = hero_from(d["hero"]);
	if (d.has("deeds")) {
		const godot::Array a = d["deeds"];
		for (int64_t i = 0; i < a.size(); i++) x.deeds.push_back({ S(godot::Dictionary(a[i])["id"]), S(godot::Dictionary(a[i])["name"]) });
	}
	x.scar = bool(d.get("scar", false));
	if (d.has("honour")) x.honour = Honour{ S(godot::Dictionary(d["honour"])["name"]), S(godot::Dictionary(d["honour"])["stat"]) };
	return x;
}

godot::Dictionary fight_report_to(const FightReport &r) {
	godot::Dictionary d, loot;
	godot::Array ps;
	for (const PersonResult &x : r.persons) ps.push_back(person_result_to(x));
	for (const auto &[team, items] : r.loot) {
		godot::Array a;
		for (const Item &it : items) a.push_back(item_full_to(it));
		loot[godot::String::num_int64(team)] = a;
	}
	d["tick"] = r.tick;
	d["persons"] = ps;
	d["loot"] = loot;
	return d;
}

FightReport fight_report_from(const godot::Dictionary &d) {
	FightReport r;
	r.tick = int(d["tick"]);
	const godot::Array ps = d["persons"];
	for (int64_t i = 0; i < ps.size(); i++) r.persons.push_back(person_result_from(ps[i]));
	const godot::Dictionary loot = d.get("loot", godot::Dictionary());
	const godot::Array ks = loot.keys();
	for (int64_t i = 0; i < ks.size(); i++) {
		const godot::Array a = loot[ks[i]];
		std::vector<Item> items;
		for (int64_t j = 0; j < a.size(); j++) items.push_back(item_from(a[j]));
		r.loot[godot::String(ks[i]).to_int()] = items;
	}
	return r;
}

godot::Dictionary player_path_to(const PlayerPath &p) {
	godot::Dictionary d;
	d["path"] = p.path.empty() ? godot::Variant() : godot::Variant(G(p.path));
	d["family"] = p.family.empty() ? godot::Variant() : godot::Variant(G(p.family));
	if (p.level) d["level"] = *p.level;
	return d;
}

godot::Dictionary cost_to(const Cost &c) {
	godot::Dictionary d;
	for (const auto &[k, n] : c.kv) d[G(k)] = n;
	return d;
}

Cost cost_from(const godot::Dictionary &d) {
	Cost c;
	const godot::Array ks = d.keys();
	for (int64_t i = 0; i < ks.size(); i++) c.set(S(ks[i]), double(d[ks[i]]));
	return c;
}

// ---------------------------------------------------------------- MemoryStore

MemoryStore::Rec *MemoryStore::find(const std::string &id) {
	for (Rec &r : recs)
		if (r.id == id) return &r;
	return nullptr;
}

const MemoryStore::Rec *MemoryStore::rec(const std::string &id) const {
	for (const Rec &r : recs)
		if (r.id == id) return &r;
	return nullptr;
}

void MemoryStore::add(int pid, const WarPerson &p, const std::optional<std::string> &region) {
	Rec r;
	r.id = p.id, r.pid = pid, r.state = "active", r.region = region, r.person = p;
	recs.push_back(std::move(r));
}

void MemoryStore::setGoods(int pid, const Cost &g) {
	for (auto &e : goods)
		if (e.first == pid) return void(e.second = g);
	goods.emplace_back(pid, g);
}

void MemoryStore::setPath(int pid, const PlayerPath &way) {
	for (auto &e : paths)
		if (e.first == pid) return void(e.second = way);
	paths.emplace_back(pid, way);
}

PlayerPath MemoryStore::path(int pid) {
	for (const auto &e : paths)
		if (e.first == pid) return e.second;
	return NO_PATH;
}

int MemoryStore::count(int pid, bool civ, bool activeOnly) const {
	int n = 0;
	for (const Rec &r : recs)
		if (r.pid == pid && (activeOnly ? r.state == "active" : in_army(r.state)) && is_civ(r.person) == civ) n++;
	return n;
}

// persons.ts settle (its timers): the wounded whose time is up are fit; his captives due go free (releaseDue)
void MemoryStore::settle(int pid, double now, const WakeSoul &wake) {
	for (Rec &r : recs)
		if (r.pid == pid && r.state == "wounded" && r.until && *r.until <= now) r.state = "active", r.until.reset();
	std::vector<Rec *> due;
	for (Rec &r : recs)
		if ((r.pid == pid || r.captorPid == pid) && r.state == "captive" && r.until && *r.until <= now) due.push_back(&r);
	toSouls(due, now, wake);
}

std::variant<std::vector<std::vector<WarPerson>>, std::string> MemoryStore::claimForJoin(int pid, const std::string &region, const std::vector<std::vector<std::string>> &squads,
	const std::set<std::string> &inRoom, double now, const WakeSoul &wake) {
	std::vector<std::string> ids;
	for (const auto &s : squads) ids.insert(ids.end(), s.begin(), s.end());
	if (std::set<std::string>(ids.begin(), ids.end()).size() != ids.size()) return std::string("a soldier listed twice");
	settle(pid, now, wake);
	for (const std::string &id : ids) {
		const Rec *r = find(id);
		if (!r || r->pid != pid) return "no soldier " + id;
		if (r->state != "active") return r->person.hero.name + " is " + r->state;
		if (inRoom.count(id)) return r->person.hero.name + " is already in the field";
	}
	for (const std::string &id : ids) {
		const Rec *r = find(id);
		if (r->region && *r->region != region) return std::string("a soldier was taken meanwhile");
	}
	for (const std::string &id : ids) find(id)->region = region;
	std::vector<std::vector<WarPerson>> out;
	for (const auto &s : squads) {
		std::vector<WarPerson> g;
		for (const std::string &id : s) g.push_back(find(id)->person);
		out.push_back(std::move(g));
	}
	return out;
}

void MemoryStore::release(const std::string &region, const std::vector<std::string> &ids) {
	for (const std::string &id : ids) {
		Rec *r = find(id);
		if (r && r->region == region) r->region.reset();
	}
}

void MemoryStore::place(const std::string &region, const std::vector<std::string> &ids) {
	for (const std::string &id : ids)
		if (Rec *r = find(id)) r->region = region;
}

std::vector<std::string> MemoryStore::offField(int pid, const std::string &region, const std::set<std::string> &inRoom, double now, const WakeSoul &wake) {
	settle(pid, now, wake);
	std::vector<std::string> out;
	for (const Rec &r : recs)
		if (r.pid == pid && r.state == "active" && r.region == region && !inRoom.count(r.id)) out.push_back(r.id);
	return out;
}

std::vector<WarPerson> MemoryStore::deployed(const std::string &region, const std::vector<std::string> &ids) {
	std::vector<WarPerson> out;
	for (const Rec &r : recs)
		if (r.region == region && r.state == "active" && std::find(ids.begin(), ids.end(), r.id) != ids.end()) out.push_back(r.person);
	return out;
}

bool MemoryStore::applyFight(const std::string &id, const std::string &region, const FightReport &rep, double now) {
	if (std::find(fights.begin(), fights.end(), id) != fights.end()) return false;
	fights.push_back(id);
	std::vector<std::pair<int, std::vector<int>>> byTeam; // a Map: insertion order
	for (const PersonResult &x : rep.persons) {
		const int pid = pid_of(x.owner);
		if (pid < 0) continue;
		auto it = std::find_if(byTeam.begin(), byTeam.end(), [&](const auto &e) { return e.first == x.team; });
		if (it == byTeam.end()) byTeam.push_back({ x.team, {} }), it = std::prev(byTeam.end());
		if (std::find(it->second.begin(), it->second.end(), pid) == it->second.end()) it->second.push_back(pid);
	}
	for (auto &e : byTeam) std::sort(e.second.begin(), e.second.end());
	std::map<int, int> held;
	for (const PersonResult &x : rep.persons)
		if (x.state == "captive" && x.fort && !held.count(*x.fort)) {
			int n = 0;
			for (const Rec &r : recs)
				if (r.heldAt == region && r.heldFort == x.fort && r.state == "captive") n++;
			held[*x.fort] = n;
		}
	const auto overHold = [&](const std::optional<int> &f) {
		if (!f) return false;
		const int n = held[*f] + 1;
		held[*f] = n;
		return n > HOLD_MAX;
	};
	const double HONOURS_MAX = data().honours.HONOURS_MAX, SCARS_MAX = data().deeds.SCARS_MAX;
	const CaptiveRules &C = data().captives.CAPTIVE;
	for (const PersonResult &x : rep.persons) {
		const int pid = pid_of(x.owner);
		Rec *r = find(x.pid);
		if (pid < 0 || !r || r->pid != pid) continue;
		const WarPerson was = r->person;
		std::vector<Honour> honours = was.honours.value_or(std::vector<Honour>{});
		if (x.honour && x.state != "dead" && x.state != "captive" && double(honours.size()) < HONOURS_MAX &&
			std::none_of(honours.begin(), honours.end(), [&](const Honour &h) { return h.name == x.honour->name; }))
			honours.push_back(*x.honour);
		std::vector<Deed> all, fresh;
		add_deeds(was.deeds.value_or(std::vector<Deed>{}), x.deeds, all, fresh);
		const double scars = std::min(SCARS_MAX, was.scars.value_or(0) + (x.scar ? 1 : 0));
		WarPerson q = was;
		q.hero = x.hero;
		if (x.state == "dead") q.hero.equip.clear();
		q.honours = honours;
		if (!all.empty()) q.deeds = all;
		if (scars) q.scars = scars;
		r->person = q;
		const auto wounded = [&] { r->state = "wounded", r->until = now + HEAL_FIELD; };
		if (x.state == "wounded") wounded();
		else if (x.state == "captive" && !overHold(x.fort)) {
			r->state = "captive", r->until = now + C.holdMs, r->captor = x.captor, r->heldAt = region;
			r->captorPid.reset();
			if (x.captor)
				for (const auto &e : byTeam)
					if (e.first == *x.captor && !e.second.empty()) r->captorPid = e.second[0];
			r->heldFort = x.fort, r->region.reset();
		} else if (x.state == "captive") wounded();
		else if (x.state == "dead") r->state = "dead", r->until.reset(), r->region.reset();
	}
	return true;
}

bool MemoryStore::claimSoul(int pid, const WarPerson &p, const std::string &region) {
	const PlayerPath way = path(pid);
	const std::string cls = p.hero.cls.value_or("militia");
	const bool civ = data().civilians.CIV_CLASSES.count(cls) > 0;
	Rec *r = find(p.id);
	if (r && r->state == "soul") {
		if (!may_hold(way, cls) || count(pid, civ) >= (civ ? worker_cap(way.path) : soldier_cap(way.path))) return false;
		r->pid = pid, r->state = "active", r->until.reset(), r->captor.reset(), r->captorPid.reset(), r->heldAt.reset(), r->heldFort.reset();
		r->barPid.reset(), r->barUntil.reset(), r->region = region;
		r->person.hero.equip = p.hero.equip;
		return true;
	}
	if (!may_hold(way, cls) || r || count(pid, false) >= soldier_cap(way.path) || count(pid, false, true) >= soldier_cap(way.path)) return false;
	WarPerson q = p;
	q.hero.kills = 0, q.hero.battles = 0;
	q.honours = std::vector<Honour>{};
	add(pid, q, region);
	return true;
}

void MemoryStore::fade(const std::string &id) {
	Rec *r = find(id);
	if (r && r->state == "soul") r->state = "faded";
}

// captives.ts toSouls, for this one region: each wakes in the room (wake), else fades
int MemoryStore::toSouls(const std::vector<Rec *> &rows, double now, const WakeSoul &wake) {
	const CaptiveRules &C = data().captives.CAPTIVE;
	for (Rec *r : rows) {
		const std::string origin = r->heldAt ? *r->heldAt : r->region ? *r->region : "unknown";
		r->state = "soul", r->until = now + C.soulMs, r->heldAt = origin;
		r->captor.reset(), r->captorPid.reset(), r->heldFort.reset(), r->region.reset(), r->barPid.reset(), r->barUntil.reset();
		r->person.hero.equip = re_uid(r->person, now);
		if (!wake(StoredSoul{ r->person, C.soulMs, std::nullopt })) r->state = "faded";
	}
	return int(rows.size());
}

int MemoryStore::freeRaided(const std::string &region, const std::vector<int> &buildings, double at, const WakeSoul &wake) {
	if (buildings.empty()) return 0;
	const double holdMs = data().captives.CAPTIVE.holdMs;
	std::vector<Rec *> rows;
	for (Rec &r : recs)
		if (r.heldAt == region && r.state == "captive" && r.heldFort && std::find(buildings.begin(), buildings.end(), *r.heldFort) != buildings.end() && r.until && *r.until <= at + holdMs)
			rows.push_back(&r);
	return toSouls(rows, at, wake);
}

Cost MemoryStore::goodsOf(int pid) {
	for (const auto &e : goods)
		if (e.first == pid) return e.second;
	return Cost{};
}

void MemoryStore::take(int pid, const Cost &g) {
	Cost c = goodsOf(pid);
	for (const auto &[k, n] : g.kv) c.set(k, std::max(0.0, c.get(k) - n));
	setGoods(pid, c);
}

void MemoryStore::saveRoom(const std::string &region, const std::string &text) {
	for (auto &e : rooms)
		if (e.first == region) return void(e.second = text);
	rooms.emplace_back(region, text);
}

std::string MemoryStore::loadRoom(const std::string &region) {
	for (const auto &e : rooms)
		if (e.first == region) return e.second;
	return "";
}

godot::Variant MemoryStore::saveOf(const std::string &kind, int pid) {
	for (const auto &[k, by] : saves)
		if (k == kind)
			for (const auto &[p, v] : by)
				if (p == pid) return v;
	return godot::Variant();
}

void MemoryStore::keep(const std::string &kind, int pid, const godot::Variant &save) {
	auto k = std::find_if(saves.begin(), saves.end(), [&](const auto &e) { return e.first == kind; });
	if (k == saves.end()) k = saves.insert(saves.end(), { kind, {} });
	for (auto &[p, v] : k->second)
		if (p == pid) return void(v = save);
	k->second.emplace_back(pid, save);
}

godot::Dictionary MemoryStore::dump() const {
	godot::Array ps, fs, gs, pa, rs;
	for (const Rec &r : recs) {
		godot::Dictionary d;
		d["id"] = G(r.id);
		d["pid"] = r.pid;
		d["state"] = G(r.state);
		d["region"] = opt(r.region);
		d["until"] = opt(r.until);
		d["captor"] = opt(r.captor);
		d["heldAt"] = opt(r.heldAt);
		d["captorPid"] = opt(r.captorPid);
		d["heldFort"] = opt(r.heldFort);
		d["barPid"] = opt(r.barPid);
		d["barUntil"] = opt(r.barUntil);
		d["person"] = war_person_to(r.person);
		ps.push_back(d);
	}
	for (const std::string &f : fights) fs.push_back(G(f));
	for (const auto &[pid, c] : goods) gs.push_back(godot::Array::make(pid, cost_to(c)));
	for (const auto &[pid, w] : paths) pa.push_back(godot::Array::make(pid, player_path_to(w)));
	for (const auto &[region, text] : rooms) rs.push_back(godot::Array::make(G(region), G(text)));
	godot::Dictionary out;
	out["persons"] = ps;
	out["fights"] = fs;
	out["goods"] = gs;
	out["paths"] = pa;
	out["rooms"] = rs;
	godot::Dictionary sv;
	for (const auto &[kind, by] : saves) {
		godot::Array a;
		for (const auto &[p, v] : by) a.push_back(godot::Array::make(p, v));
		sv[G(kind)] = a;
	}
	out["saves"] = sv;
	const godot::Dictionary t = books->dump(); // wave B: the holders' and trade's books
	for (const godot::Variant &k : t.keys()) out[k] = t[k];
	return out;
}

void MemoryStore::load(const godot::Dictionary &d) {
	recs.clear(), fights.clear(), goods.clear(), paths.clear(), rooms.clear(), saves.clear();
	const godot::Array ps = d.get("persons", godot::Array()), fs = d.get("fights", godot::Array()), gs = d.get("goods", godot::Array()), pa = d.get("paths", godot::Array()),
						rs = d.get("rooms", godot::Array());
	for (int64_t i = 0; i < ps.size(); i++) {
		const godot::Dictionary x = ps[i];
		Rec r;
		r.id = S(x["id"]), r.pid = int(x["pid"]), r.state = S(x["state"]);
		r.region = ostr(x, "region"), r.heldAt = ostr(x, "heldAt");
		r.until = onum(x, "until"), r.barUntil = onum(x, "barUntil");
		r.captor = oint(x, "captor"), r.captorPid = oint(x, "captorPid"), r.heldFort = oint(x, "heldFort"), r.barPid = oint(x, "barPid");
		r.person = war_person_from(x["person"]);
		recs.push_back(std::move(r));
	}
	for (int64_t i = 0; i < fs.size(); i++) fights.push_back(S(fs[i]));
	for (int64_t i = 0; i < gs.size(); i++) goods.emplace_back(int(godot::Array(gs[i])[0]), cost_from(godot::Array(gs[i])[1]));
	for (int64_t i = 0; i < pa.size(); i++) paths.emplace_back(int(godot::Array(pa[i])[0]), player_path_from(godot::Array(pa[i])[1]));
	for (int64_t i = 0; i < rs.size(); i++) rooms.emplace_back(S(godot::Array(rs[i])[0]), S(godot::Array(rs[i])[1]));
	const godot::Dictionary sv = d.get("saves", godot::Dictionary());
	const godot::Array kinds = sv.keys();
	for (int64_t i = 0; i < kinds.size(); i++) {
		const godot::Array a = sv[kinds[i]];
		for (int64_t k = 0; k < a.size(); k++) keep(S(kinds[i]), int(godot::Array(a[k])[0]), godot::Array(a[k])[1]);
	}
	books->load(d);
}

bool MemoryStore::write(const godot::String &file) const {
	godot::Ref<godot::FileAccess> f = godot::FileAccess::open(file, godot::FileAccess::WRITE);
	if (f.is_null()) return false;
	f->store_string(godot::String::utf8(js_stringify(dump()).c_str()));
	return true;
}

bool MemoryStore::read(const godot::String &file) {
	if (!godot::FileAccess::file_exists(file)) return false;
	const godot::Variant v = godot::JSON::parse_string(godot::FileAccess::get_file_as_string(file));
	if (v.get_type() != godot::Variant::DICTIONARY) return false;
	load(v);
	return true;
}

} // namespace sim
