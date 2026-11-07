// MemorySettle (settle.h): src/dev/roomStore.ts's wave C line for line, with server/src/war/settlements.ts, oaths.ts,
// crown.ts, works.ts and favour.ts as the rules it keeps; and the small tables of works.ts and favour.ts.
#include "settle.h"

#include <algorithm>
#include <cmath>
#include <limits>

#include "js_math.h"

namespace sim {

namespace {

constexpr double EPS = 1e-6, HOUR = 3600000.0;
using T = SettleTables;

std::string S(const godot::Variant &v) { return godot::String(v).utf8().get_data(); }
godot::String G(const std::string &s) { return godot::String::utf8(s.c_str()); }
godot::Variant opt(const std::optional<int> &v) { return v ? godot::Variant(*v) : godot::Variant(); }
godot::Variant opt(const std::optional<double> &v) { return v ? godot::Variant(*v) : godot::Variant(); }
std::optional<int> oint(const godot::Dictionary &d, const char *k) { return d.has(k) && d[k].get_type() != godot::Variant::NIL ? std::optional<int>(int(d[k])) : std::nullopt; }
std::optional<double> onum(const godot::Dictionary &d, const char *k) { return d.has(k) && d[k].get_type() != godot::Variant::NIL ? std::optional<double>(double(d[k])) : std::nullopt; }
// src/war/world/alliances.ts ALLIANCES
const char *const ALLIANCE_NAMES[] = { "Dodona", "Skythia", "Kyrene", "Elaia" };
const char *const ALLIANCE_HOMES[] = { "dodona", "skythia", "kyrene", "elaia" };
const char *const ALLIANCE_QUADRANTS[] = { "NW", "NE", "SE", "SW" };

WorkStage stage(Cost goods, double labour, std::vector<std::pair<std::string, double>> bonus) {
	WorkStage s;
	s.goods = std::move(goods), s.labour = labour;
	for (const auto &[k, v] : bonus) {
		s.keys.push_back(k);
		if (k == "repairCost") s.repairCost = v;
		else if (k == "sight") s.sight = v;
		else if (k == "travel") s.travel = v;
		else s.tasks = v;
	}
	return s;
}

godot::Dictionary plot_to(const std::optional<Plot> &p) {
	godot::Dictionary d;
	if (!p) return d;
	d["x0"] = p->x0, d["y0"] = p->y0, d["x1"] = p->x1, d["y1"] = p->y1;
	return d;
}
std::optional<Plot> plot_from(const godot::Variant &v) {
	if (v.get_type() != godot::Variant::DICTIONARY) return std::nullopt;
	const godot::Dictionary d = v;
	return Plot{ d["x0"], d["y0"], d["x1"], d["y1"] };
}
godot::Dictionary cost_dict(const Cost &c) {
	godot::Dictionary d;
	for (const auto &[k, n] : c.kv) d[G(k)] = n;
	return d;
}
Cost goods_of(const godot::Dictionary &d) {
	Cost c;
	const godot::Array ks = d.keys();
	for (int64_t i = 0; i < ks.size(); i++) c.set(S(ks[i]), double(d[ks[i]]));
	return c;
}
template <typename V>
V *in(std::vector<std::pair<int, V>> &m, int k) {
	for (auto &e : m)
		if (e.first == k) return &e.second;
	return nullptr;
}
template <typename V>
const V *in(const std::vector<std::pair<int, V>> &m, int k) {
	for (const auto &e : m)
		if (e.first == k) return &e.second;
	return nullptr;
}
template <typename V>
void put(std::vector<std::pair<int, V>> &m, int k, V v) { // Map.set
	if (V *x = in(m, k)) *x = std::move(v);
	else m.emplace_back(k, std::move(v));
}

} // namespace

std::vector<std::pair<int, double>> fight_kills(const FightReport &r) {
	std::vector<std::pair<int, double>> out;
	for (const PersonResult &x : r.persons) {
		const std::string &o = x.owner;
		if (o.size() < 3 || o.compare(0, 2, "p:") != 0 || !std::all_of(o.begin() + 2, o.end(), [](char c) { return c >= '0' && c <= '9'; })) continue;
		const int pid = std::stoi(o.substr(2));
		if (double *k = in(out, pid)) *k += x.kills;
		else out.emplace_back(pid, x.kills);
	}
	return out;
}

// ---------------------------------------------------------------- the tables

const std::vector<std::pair<std::string, std::vector<WorkStage>>> &SettleTables::works() {
	static const std::vector<std::pair<std::string, std::vector<WorkStage>>> w{
		{ "temple", { stage({ { { "stone", 600 }, { "marble", 120 }, { "coin", 300 } } }, 24, { { "repairCost", 0.6 } }) } },
		{ "road", { stage({ { { "stone", 400 }, { "wood", 500 } } }, 20, { { "travel", 0.85 } }) } },
		{ "beacons", { stage({ { { "wood", 300 }, { "stone", 200 }, { "pitch", 60 } } }, 12, { { "sight", 2 } }) } },
		{ "wonder",
			{ stage({ { { "stone", 2000 }, { "wood", 1500 }, { "coin", 600 } } }, 60, { { "travel", 0.95 } }), stage({ { { "marble", 600 }, { "stone", 1200 }, { "bronze", 200 } } }, 90, { { "sight", 1 } }),
				stage({ { { "marble", 300 }, { "silver", 120 }, { "pitch", 200 }, { "coin", 1500 } } }, 120, { { "repairCost", 0.85 }, { "tasks", 1.5 } }) } },
	};
	return w;
}
const std::vector<WorkStage> *SettleTables::stagesOf(const std::string &id) {
	for (const auto &[k, s] : works())
		if (k == id) return &s;
	return nullptr;
}
double SettleTables::favourXp(int l) { return l <= 1 ? 0 : 200.0 * (l - 1) * (l - 1); }
int SettleTables::favourLevel(double xp) {
	for (int l = FAVOUR_MAX; l >= 2; l--)
		if (xp >= favourXp(l)) return l;
	return 1;
}
const std::vector<std::pair<std::string, std::string>> &SettleTables::pays() {
	static const std::vector<std::pair<std::string, std::string>> p{ { "win", "warrior" }, { "battle", "warrior" }, { "boss", "warrior" }, { "lair", "warrior" }, { "land", "warrior" }, { "built", "builder" },
		{ "sold", "trader" }, { "carried", "trader" } };
	return p;
}
const std::vector<std::pair<std::string, double>> &SettleTables::hourCap() {
	static const std::vector<std::pair<std::string, double>> c{ { "land", 30 }, { "sold", 600 }, { "carried", 600 } };
	return c;
}

godot::Dictionary SettleTables::constants() {
	godot::Dictionary c, settle, earn, land, pays, cap;
	c["SETTLE_EVERY"] = SETTLE_EVERY;
	c["ATTACK_COOLDOWN"] = ATTACK_COOLDOWN;
	settle["r"] = SETTLE_R, settle["presence"] = SETTLE_PRESENCE, settle["nameMax"] = SETTLE_NAME_MAX;
	c["SETTLE"] = settle;
	c["WORK_R"] = WORK_R;
	c["LAIR_NEAR"] = LAIR_NEAR;
	c["LAND_TICKS"] = LAND_TICKS;
	c["FAVOUR_LOG"] = FAVOUR_LOG;
	godot::Array ws;
	for (const auto &[id, stages] : works()) {
		godot::Dictionary w;
		godot::Array ss;
		for (const WorkStage &s : stages) {
			godot::Dictionary d, b;
			for (const std::string &k : s.keys) b[G(k)] = k == "repairCost" ? *s.repairCost : k == "sight" ? *s.sight : k == "travel" ? *s.travel : *s.tasks;
			d["goods"] = cost_dict(s.goods), d["labour"] = s.labour, d["bonus"] = b;
			ss.push_back(d);
		}
		w["id"] = G(id), w["stages"] = ss;
		ws.push_back(w);
	}
	c["WORKS"] = ws;
	godot::Array xp;
	for (int l = 0; l <= FAVOUR_MAX; l++) xp.push_back(favourXp(l));
	c["FAVOUR_XP"] = xp;
	land["claim"] = EARN_LAND_CLAIM, land["claimsCap"] = EARN_LAND_CLAIMS_CAP, land["region"] = EARN_LAND_REGION;
	earn["lair"] = EARN_LAIR, earn["built"] = EARN_BUILT, earn["land"] = land;
	c["FAVOUR_EARN"] = earn;
	for (const auto &[k, v] : SettleTables::pays()) pays[G(k)] = G(v);
	c["PAYS"] = pays;
	for (const auto &[k, v] : hourCap()) cap[G(k)] = v;
	c["HOUR_CAP"] = cap;
	c["LABOUR_FAVOUR"] = LABOUR_FAVOUR;
	c["RATE_DEFAULT"] = RATE_DEFAULT;
	godot::Array al;
	for (int a = 0; a < 4; a++) {
		godot::Dictionary d;
		d["name"] = ALLIANCE_NAMES[a], d["home"] = ALLIANCE_HOMES[a], d["quadrant"] = ALLIANCE_QUADRANTS[a];
		al.push_back(d);
	}
	c["ALLIANCE_LIST"] = al;
	return c;
}
const char *SettleTables::allianceName(int a) { return a >= 0 && a < 4 ? ALLIANCE_NAMES[a] : nullptr; }
const char *SettleTables::allianceHome(int a) { return a >= 0 && a < 4 ? ALLIANCE_HOMES[a] : nullptr; }
const char *SettleTables::allianceQuadrant(int a) { return a >= 0 && a < 4 ? ALLIANCE_QUADRANTS[a] : nullptr; }

// ---------------------------------------------------------------- settlements (settlements.ts)

std::optional<int> MemorySettle::allianceOf(int pid) {
	const int *a = in(alliances, pid);
	return a ? std::optional<int>(*a) : std::nullopt;
}

std::vector<int> MemorySettle::membersOf(int alliance) {
	std::vector<int> out;
	for (const auto &[pid, a] : alliances)
		if (a == alliance) out.push_back(pid);
	return out;
}

std::string MemorySettle::nameOf(int pid) const {
	const std::string *n = in(names, pid);
	return n ? *n : "";
}

MemorySettle::SettleRec *MemorySettle::settlement(int id) {
	for (SettleRec &s : settles)
		if (s.id == id) return &s;
	return nullptr;
}

std::vector<MemorySettle::SettleRec *> MemorySettle::overlords(SettleRec &s) {
	std::vector<SettleRec *> out;
	for (SettleRec *cur = &s; cur->overlord && out.size() < 16;) {
		SettleRec *o = settlement(*cur->overlord);
		if (!o || std::any_of(out.begin(), out.end(), [&](SettleRec *x) { return x->id == o->id; })) break;
		out.push_back(cur = o);
	}
	return out;
}

std::vector<RoomSettle> MemorySettle::regionSettlements(const std::string &region) {
	std::vector<SettleRec *> rows;
	for (SettleRec &s : settles)
		if (s.region == region) rows.push_back(&s);
	std::stable_sort(rows.begin(), rows.end(), [](SettleRec *a, SettleRec *b) { return a->id < b->id; });
	std::vector<const MemberRec *> ms;
	for (const MemberRec &m : members)
		if (std::any_of(rows.begin(), rows.end(), [&](SettleRec *s) { return s->id == m.settlement; })) ms.push_back(&m);
	std::stable_sort(ms.begin(), ms.end(), [](const MemberRec *a, const MemberRec *b) { return a->since != b->since ? a->since < b->since : a->pid < b->pid; });
	std::vector<RoomSettle> out;
	for (SettleRec *r : rows) {
		RoomSettle s;
		std::optional<int> cur = r->overlord;
		for (int n = 0; cur && n < 16; n++) {
			SettleRec *o = settlement(*cur);
			if (!o || std::find(s.overlordLords.begin(), s.overlordLords.end(), o->lord) != s.overlordLords.end()) break;
			s.overlordLords.push_back(o->lord);
			cur = o->overlord;
		}
		s.id = r->id, s.centre = r->centre, s.x = r->x, s.y = r->y, s.r = r->r ? r->r : T::SETTLE_R, s.name = r->name, s.lord = r->lord;
		const std::string *nm = in(names, r->lord);
		s.lordName = nm ? *nm : "Player " + std::to_string(r->lord);
		s.team = allianceOf(r->lord), s.level = r->level, s.overlord = r->overlord, s.tribute = r->tribute;
		for (const MemberRec *m : ms)
			if (m->settlement == r->id) s.members.push_back({ m->pid, m->role, m->plot });
		out.push_back(std::move(s));
	}
	return out;
}

std::variant<int, std::string> MemorySettle::found(const std::string &region, int centre, double x, double y, int lord, const std::function<std::string(double, double, double)> &mapOk, double now) {
	for (const SettleRec &s : settles)
		if (s.region == region && s.centre == centre) return s.id;
	const double cx = js::round(x), cy = js::round(y), cr = T::SETTLE_R;
	for (const SettleRec &o : settles)
		if (o.region == region && !(js::hypot(cx - o.x, cy - o.y) >= cr + o.r)) return std::string("Too close to another settlement");
	const std::string why = mapOk(cx, cy, cr);
	if (!why.empty()) return why;
	const int id = nextSettle++;
	SettleRec s;
	s.id = id, s.region = region, s.centre = centre, s.x = cx, s.y = cy, s.r = cr, s.name = "Camp", s.lord = lord, s.tendedAt = now, s.persist = "{}";
	settles.push_back(s);
	members.push_back({ id, lord, "lord", std::nullopt, now });
	syncTies(lord);
	return id;
}

int MemorySettle::addSettlement(const godot::Dictionary &d) {
	const int id = nextSettle++;
	SettleRec s;
	s.id = id, s.region = S(d["region"]), s.centre = d["centre"], s.x = d["x"], s.y = d["y"], s.r = d["r"], s.name = S(d["name"]), s.lord = d["lord"];
	s.level = d.get("level", 0), s.overlord = oint(d, "overlord"), s.tribute = d.get("tribute", 0), s.tendedAt = d.get("tendedAt", 0), s.persist = S(d.get("persist", "{}"));
	settles.push_back(s);
	members.push_back({ id, s.lord, "lord", std::nullopt, 0 });
	return id;
}

void MemorySettle::addMember(int settlement, int pid, const std::string &role, const std::optional<Plot> &plot, double now) {
	for (MemberRec &m : members)
		if (m.settlement == settlement && m.pid == pid) return void((m.role = role, m.plot = plot));
	members.push_back({ settlement, pid, role, plot, now });
}

void MemorySettle::report(int id, std::optional<double> level, const std::optional<std::string> &persist, bool tended, double now) {
	SettleRec *s = settlement(id);
	if (!s) return;
	if (level) s->level = *level;
	if (persist) s->persist = *persist;
	if (tended) s->tendedAt = now;
}

SettleStore::Attack MemorySettle::logAttack(int by, int victim, double now) {
	SettleRec *v = settlement(victim);
	if (!v) return {};
	std::vector<SettleRec *> hit{ v };
	for (SettleRec *o : overlords(*v)) hit.push_back(o);
	godot::Dictionary l;
	l["settlement"] = victim, l["kind"] = "attack", l["actor"] = by, l["at"] = now;
	settleLog.push_back(l);
	Attack a;
	for (SettleRec *h : hit)
		if (h->lord != by && std::find(a.tell.begin(), a.tell.end(), h->lord) == a.tell.end()) a.tell.push_back(h->lord);
	return a;
}

void MemorySettle::rekey(const std::string &region, const std::vector<std::pair<int, int>> &moved) {
	for (SettleRec &s : settles)
		if (s.region == region) s.centre = -s.id;
	for (const auto &[id, c] : moved)
		if (SettleRec *s = settlement(id)) s->centre = c;
}

std::vector<std::pair<int, std::string>> MemorySettle::persisted(const std::string &region) {
	std::vector<std::pair<int, std::string>> out;
	for (const SettleRec &s : settles)
		if (s.region == region) out.emplace_back(s.id, s.persist);
	std::stable_sort(out.begin(), out.end(), [](const auto &a, const auto &b) { return a.first < b.first; });
	return out;
}

// ---------------------------------------------------------------- oaths (oaths.ts)

void MemorySettle::swear(int vassal, int lord, std::optional<double> pct) {
	oaths.erase(std::remove_if(oaths.begin(), oaths.end(), [&](const auto &o) { return o.first == vassal; }), oaths.end());
	oaths.emplace_back(vassal, lord);
	if (pct) put(rates, lord, *pct);
	syncTies(vassal);
}

void MemorySettle::syncTies(int pid) {
	std::optional<int> lord;
	for (const auto &[v, l] : oaths)
		if (v == pid) {
			lord = l;
			break;
		}
	std::optional<int> seat;
	if (lord) {
		const SettleRec *best = nullptr;
		for (const SettleRec &s : settles)
			if (s.lord == *lord && (!best || s.id < best->id)) best = &s;
		if (best) seat = best->id;
	}
	const double *rate = lord ? in(rates, *lord) : nullptr;
	for (SettleRec &s : settles)
		if (s.lord == pid) s.overlord = seat, s.tribute = !seat || !lord ? 0 : rate ? *rate : T::RATE_DEFAULT;
}

std::optional<int> MemorySettle::liegeOf(int pid) {
	for (const auto &[v, l] : oaths)
		if (v == pid) return l;
	return std::nullopt;
}

double MemorySettle::tributeCut(int seller, double coin) {
	const std::optional<int> lord = coin > 0 ? liegeOf(seller) : std::nullopt;
	if (!lord) return 0;
	const double *rate = in(rates, *lord);
	return std::floor(((coin * (rate ? *rate : T::RATE_DEFAULT)) / 100) * 100 + 1e-6) / 100; // cents
}

std::vector<Oath> MemorySettle::sworn() {
	std::vector<std::pair<int, int>> os = oaths;
	std::stable_sort(os.begin(), os.end(), [](const auto &a, const auto &b) { return a.first < b.first; });
	std::vector<Oath> out;
	for (const auto &[v, l] : os) {
		const double *rate = in(rates, l);
		out.push_back({ v, l, rate ? *rate : T::RATE_DEFAULT });
	}
	return out;
}

void MemorySettle::reportHeld(const std::string &region, const godot::Array &rows) {
	godot::Array keep;
	for (int64_t i = 0; i < held.size(); i++)
		if (S(godot::Dictionary(held[i])["region"]) != region) keep.push_back(held[i]);
	held = keep;
	if (rows.size()) {
		godot::Dictionary h;
		h["region"] = G(region), h["rows"] = rows.duplicate(true);
		held.push_back(h);
	}
}

// ---------------------------------------------------------------- crown (crown.ts)

int MemorySettle::addPact(int a, int b, const std::string &kind, std::optional<double> endsAt) {
	const int id = int(pacts.size()) + 1;
	pacts.push_back({ id, a, b, kind, "active", endsAt, std::nullopt });
	return id;
}

std::vector<SettleStore::PactRec> MemorySettle::pactsOf() {
	std::vector<PactRec> out;
	for (const PactRec &p : pacts)
		if (p.state == "active") out.push_back(p);
	return out;
}

SettleStore::PactBreak MemorySettle::pactAttack(int by, int victim, double now) {
	const SettleRec *v = settlement(victim);
	if (!v) return {};
	const std::optional<int> va = allianceOf(by), vb = allianceOf(v->lord);
	if (!va || !vb || *va == *vb) return {};
	std::vector<PactRec *> ps;
	for (PactRec &p : pacts)
		if (p.state == "active" && p.endsAt.value_or(std::numeric_limits<double>::infinity()) > now && ((p.a == *va && p.b == *vb) || (p.a == *vb && p.b == *va))) ps.push_back(&p);
	if (ps.empty()) return {};
	const std::string *nm = in(names, by);
	const std::string who = nm ? *nm : "#" + std::to_string(by);
	PactBreak out;
	bool pact = false;
	for (PactRec *p : ps) p->state = "broken", p->brokenBy = by, p->endsAt = now, out.broken.push_back(p->id), pact = pact || p->kind == "pact";
	for (const auto &[pid, a] : alliances)
		if (a == *va || a == *vb) out.tell.push_back(pid);
	out.text = who + " of " + ALLIANCE_NAMES[*va] + " broke the " + (pact ? "pact" : "truce") + " with " + ALLIANCE_NAMES[*vb];
	return out;
}

int MemorySettle::addOrder(int alliance, const std::string &kind, const std::string &region, double expiresAt) {
	const int id = int(orders.size()) + 1;
	orders.push_back({ id, alliance, kind, region, "open", expiresAt });
	return id;
}

void MemorySettle::bookFight(const std::string &region, const std::vector<std::pair<int, double>> &tally, double now) {
	std::vector<const OrderRec *> os;
	for (const OrderRec &o : orders)
		if (o.region == region && o.state == "open" && (o.kind == "attack" || o.kind == "defend") && o.expiresAt > now) os.push_back(&o);
	if (os.empty()) return;
	for (const auto &[pid, kills] : tally) {
		const std::optional<int> a = allianceOf(pid);
		for (const OrderRec *o : os) {
			if (!a || o->alliance != *a) continue;
			auto sh = std::find_if(shares.begin(), shares.end(), [&](const Share &x) { return x.order == o->id && x.pid == pid; });
			if (sh != shares.end()) sh->share += 1 + kills;
			else shares.push_back({ o->id, pid, 1 + kills });
		}
	}
}

// ---------------------------------------------------------------- alliance works (works.ts)

MemorySettle::WorkRec *MemorySettle::work(int a, const std::string &id) {
	for (WorkRec &w : works)
		if (w.alliance == a && w.work == id) return &w;
	return nullptr;
}

double MemorySettle::addLabour(int a, const std::string &id, const std::vector<std::pair<int, double>> &by, double now) {
	const std::vector<WorkStage> *stages = T::stagesOf(id);
	if (!stages) return 0;
	WorkRec *r = work(a, id);
	if (r && r->doneAt && *r->doneAt) return 0;
	double left = (*stages)[r ? r->stage : 0].labour * 3600 - (r ? r->labour : 0), put = 0;
	if (!r) works.push_back({ a, id, {}, 0, 0, std::nullopt });
	std::vector<std::pair<int, double>> sorted = by;
	std::stable_sort(sorted.begin(), sorted.end(), [](const auto &x, const auto &y) { return x.first < y.first; });
	for (const auto &[pid, secs] : sorted) {
		const double n = std::min(secs, left);
		if (!(n > EPS)) continue;
		left -= n;
		put += n;
		auto g = std::find_if(gifts.begin(), gifts.end(), [&](const Gift &x) { return x.alliance == a && x.work == id && x.pid == pid; });
		if (g != gifts.end()) g->labour += n;
		else gifts.push_back({ a, id, pid, n });
		if (double *st = in(stats, pid)) *st += n;
		else stats.emplace_back(pid, n);
	}
	if (!(put > EPS)) return 0;
	work(a, id)->labour += put;
	finish(a, id, now);
	return put;
}

void MemorySettle::finish(int a, const std::string &id, double now) {
	const std::vector<WorkStage> &stages = *T::stagesOf(id);
	WorkRec *r = work(a, id);
	if (!r || (r->doneAt && *r->doneAt) || r->stage >= int(stages.size())) return;
	const WorkStage &st = stages[r->stage];
	for (const auto &[k, n] : st.goods.kv)
		if (r->goods.get(k) < n - EPS) return;
	if (r->labour < st.labour * 3600 - EPS) return;
	if (r->stage + 1 >= int(stages.size())) r->doneAt = now, r->stage += 1;
	else if (now > 0) r->stage += 1, r->goods = Cost(), r->labour = 0;
}

std::vector<std::string> MemorySettle::openWorks(int a) {
	std::vector<std::string> out;
	for (const auto &[id, s] : T::works())
		if (!std::any_of(works.begin(), works.end(), [&](const WorkRec &w) { return w.alliance == a && w.doneAt && w.work == id; })) out.push_back(id);
	return out;
}

std::vector<std::pair<int, Sim::TeamBonus>> MemorySettle::bonusesOf() {
	std::vector<std::pair<int, std::vector<std::pair<std::string, int>>>> by;
	for (const WorkRec &r : works)
		if (r.doneAt || r.stage > 0) {
			const std::vector<WorkStage> *st = T::stagesOf(r.work);
			const int n = r.doneAt ? (st ? int(st->size()) : 0) : r.stage;
			if (auto *x = in(by, r.alliance)) x->emplace_back(r.work, n);
			else by.emplace_back(r.alliance, std::vector<std::pair<std::string, int>>{ { r.work, n } });
		}
	std::vector<std::pair<int, Sim::TeamBonus>> out;
	for (const auto &[a, done] : by) {
		std::optional<double> repair, sight;
		for (const auto &[id, n] : done) { // foldBonus: shares multiply, sight adds
			const std::vector<WorkStage> *st = T::stagesOf(id);
			for (int i = 0; st && i < n && i < int(st->size()); i++) {
				const WorkStage &s = (*st)[i];
				if (s.repairCost) repair = repair.value_or(1) * *s.repairCost;
				if (s.sight) sight = sight.value_or(0) + *s.sight;
			}
		}
		Sim::TeamBonus b;
		if (repair) b.repairCost = repair, b.keys.push_back("repairCost");
		if (sight && *sight) b.sight = sight, b.keys.push_back("sight");
		if (!b.keys.empty()) out.emplace_back(a, b);
	}
	return out;
}

void MemorySettle::giveWork(int a, const std::string &id, const Cost &goods) {
	if (!work(a, id)) works.push_back({ a, id, {}, 0, 0, std::nullopt });
	WorkRec *r = work(a, id);
	for (const auto &[k, n] : goods.kv) r->goods.set(k, r->goods.get(k) + n);
}

// ---------------------------------------------------------------- favour (favour.ts)

void MemorySettle::addFavour(int pid, double amount, const std::string &reason, double now) {
	for (const auto &[why, only] : T::pays())
		if (why == reason) {
			const std::optional<PlayerPath> p = pathOf(pid);
			if ((p && !p->path.empty() ? p->path : only) != only) return;
		}
	const double *cap = nullptr;
	for (const auto &[why, c] : T::hourCap())
		if (why == reason) cap = &c;
	if (!cap) return favourOf(pid, js::round(amount), reason, now);
	const double hour = std::floor(now / HOUR);
	auto r = std::find_if(favour.begin(), favour.end(), [&](const FavourRec &f) { return f.pid == pid; });
	const double had = r != favour.end() && r->landHour == hour ? r->landN : 0, n = std::min(js::round(amount), *cap - had);
	if (!(n > 0)) return;
	favourOf(pid, n, reason, now);
	for (FavourRec &f : favour)
		if (f.pid == pid) f.landHour = hour, f.landN = had + n;
}

void MemorySettle::favourOf(int pid, double n, const std::string &reason, double now) {
	if (!(n > 0)) return;
	auto f = std::find_if(favour.begin(), favour.end(), [&](const FavourRec &x) { return x.pid == pid; });
	if (f != favour.end()) f->xp += n, f->level = T::favourLevel(f->xp);
	else favour.push_back({ pid, n, double(T::favourLevel(n)), 0, 0 });
	favourLog.push_back({ pid, now, n, reason });
	if (std::count_if(favourLog.begin(), favourLog.end(), [&](const LogRec &l) { return l.pid == pid; }) > T::FAVOUR_LOG)
		favourLog.erase(std::find_if(favourLog.begin(), favourLog.end(), [&](const LogRec &l) { return l.pid == pid; }));
}

std::optional<double> MemorySettle::favourLevelOf(int pid) const {
	for (const FavourRec &f : favour)
		if (f.pid == pid) return f.level;
	return std::nullopt;
}

std::vector<std::pair<int, double>> MemorySettle::levelsOf(const std::vector<int> &pids) {
	std::vector<std::pair<int, double>> out;
	for (int p : pids) {
		std::optional<double> l = favourLevelOf(p);
		if (!l) {
			const std::optional<PlayerPath> way = pathOf(p);
			if (way) l = way->level;
		}
		out.emplace_back(p, l.value_or(1));
	}
	return out;
}

// ---------------------------------------------------------------- the rest

void MemorySettle::ally(int pid, int alliance, const std::string &name) {
	put(alliances, pid, alliance);
	put(names, pid, name);
}

void MemorySettle::addGuard(const std::string &region, const GuardWatch &w) { guards.emplace_back(region, w); }

std::vector<GuardWatch> MemorySettle::guardsIn(const std::string &region) {
	std::vector<GuardWatch> out;
	for (const auto &[r, w] : guards)
		if (r == region) out.push_back(w);
	return out;
}

void MemorySettle::notify(const std::vector<int> &pids, const godot::Dictionary &msg) {
	godot::Dictionary n;
	godot::Array ps;
	for (int p : pids) ps.push_back(p);
	n["pids"] = ps, n["msg"] = msg.duplicate(true);
	news.push_back(n);
}

void MemorySettle::dump(godot::Dictionary &out) const {
	godot::Array ss, ms, os, ps, sh, ws, gs, st, fs, fl, al, nm, rt, od, gd;
	for (const SettleRec &s : settles) {
		godot::Dictionary d;
		d["id"] = s.id, d["region"] = G(s.region), d["centre"] = s.centre, d["x"] = s.x, d["y"] = s.y, d["r"] = s.r, d["name"] = G(s.name), d["lord"] = s.lord;
		d["level"] = s.level, d["overlord"] = opt(s.overlord), d["tribute"] = s.tribute, d["tendedAt"] = s.tendedAt, d["persist"] = G(s.persist);
		ss.push_back(d);
	}
	for (const MemberRec &m : members) {
		godot::Dictionary d;
		d["settlement"] = m.settlement, d["pid"] = m.pid, d["role"] = G(m.role), d["plot"] = m.plot ? godot::Variant(plot_to(m.plot)) : godot::Variant(), d["since"] = m.since;
		ms.push_back(d);
	}
	for (const Oath &o : const_cast<MemorySettle *>(this)->sworn()) {
		godot::Dictionary d;
		d["vassal"] = o.vassal, d["lord"] = o.lord, d["pct"] = o.pct;
		os.push_back(d);
	}
	for (const PactRec &p : pacts) {
		godot::Dictionary d;
		d["id"] = p.id, d["a"] = p.a, d["b"] = p.b, d["kind"] = G(p.kind), d["state"] = G(p.state), d["endsAt"] = opt(p.endsAt), d["brokenBy"] = opt(p.brokenBy);
		ps.push_back(d);
	}
	for (const Share &s : shares) {
		godot::Dictionary d;
		d["order"] = s.order, d["pid"] = s.pid, d["share"] = s.share;
		sh.push_back(d);
	}
	for (const WorkRec &w : works) {
		godot::Dictionary d;
		d["alliance"] = w.alliance, d["work"] = G(w.work), d["goods"] = cost_dict(w.goods), d["labour"] = w.labour, d["stage"] = w.stage, d["doneAt"] = opt(w.doneAt);
		ws.push_back(d);
	}
	for (const Gift &g : gifts) {
		godot::Dictionary d;
		d["alliance"] = g.alliance, d["work"] = G(g.work), d["pid"] = g.pid, d["labour"] = g.labour;
		gs.push_back(d);
	}
	for (const auto &[pid, n] : stats) {
		godot::Dictionary d;
		d["pid"] = pid, d["labour"] = n;
		st.push_back(d);
	}
	for (const FavourRec &f : favour) {
		godot::Dictionary d;
		d["pid"] = f.pid, d["xp"] = f.xp, d["level"] = f.level, d["landHour"] = f.landHour, d["landN"] = f.landN;
		fs.push_back(d);
	}
	for (const LogRec &l : favourLog) {
		godot::Dictionary d;
		d["pid"] = l.pid, d["at"] = l.at, d["amount"] = l.amount, d["reason"] = G(l.reason);
		fl.push_back(d);
	}
	for (const auto &[p, a] : alliances) al.push_back(godot::Array::make(p, a));
	for (const auto &[p, n] : names) nm.push_back(godot::Array::make(p, G(n)));
	for (const auto &[p, r] : rates) rt.push_back(godot::Array::make(p, r));
	for (const OrderRec &o : orders) {
		godot::Dictionary d;
		d["id"] = o.id, d["alliance"] = o.alliance, d["kind"] = G(o.kind), d["region"] = G(o.region), d["state"] = G(o.state), d["expiresAt"] = o.expiresAt;
		od.push_back(d);
	}
	for (const auto &[r, w] : guards) {
		godot::Dictionary d, x;
		x["id"] = w.id, x["team"] = w.team, x["taker"] = w.taker, x["men"] = w.men;
		d["region"] = G(r), d["watch"] = x;
		gd.push_back(d);
	}
	godot::Array oa;
	for (const auto &[v, l] : oaths) oa.push_back(godot::Array::make(v, l));
	out["settlements"] = ss, out["members"] = ms, out["settleLog"] = settleLog.duplicate(true), out["oaths"] = os, out["held"] = held.duplicate(true), out["pacts"] = ps;
	out["shares"] = sh, out["works"] = ws, out["gifts"] = gs, out["stats"] = st, out["favour"] = fs, out["favourLog"] = fl, out["news"] = news.duplicate(true);
	// beyond the TS dump (its seeds, which the vectors never read back): what a file needs to load the same
	out["alliances"] = al, out["names"] = nm, out["rates"] = rt, out["orders"] = od, out["guards"] = gd, out["sworn"] = oa, out["nextSettle"] = nextSettle;
}

void MemorySettle::load(const godot::Dictionary &d) {
	const auto arr = [&](const char *k) { return godot::Array(d.get(k, godot::Array())); };
	settles.clear(), members.clear(), oaths.clear(), rates.clear(), pacts.clear(), orders.clear(), shares.clear(), works.clear(), gifts.clear(), stats.clear(), favour.clear(), favourLog.clear();
	alliances.clear(), names.clear(), guards.clear();
	for (const godot::Variant &v : arr("settlements")) {
		const godot::Dictionary x = v;
		SettleRec s;
		s.id = x["id"], s.region = S(x["region"]), s.centre = x["centre"], s.x = x["x"], s.y = x["y"], s.r = x["r"], s.name = S(x["name"]), s.lord = x["lord"], s.level = x["level"];
		s.overlord = oint(x, "overlord"), s.tribute = x["tribute"], s.tendedAt = x["tendedAt"], s.persist = S(x["persist"]);
		settles.push_back(s);
	}
	for (const godot::Variant &v : arr("members")) {
		const godot::Dictionary x = v;
		members.push_back({ x["settlement"], x["pid"], S(x["role"]), plot_from(x["plot"]), x["since"] });
	}
	settleLog = arr("settleLog").duplicate(true), held = arr("held").duplicate(true), news = arr("news").duplicate(true);
	for (const godot::Variant &v : arr("sworn")) oaths.emplace_back(int(godot::Array(v)[0]), int(godot::Array(v)[1]));
	for (const godot::Variant &v : arr("rates")) rates.emplace_back(int(godot::Array(v)[0]), double(godot::Array(v)[1]));
	for (const godot::Variant &v : arr("pacts")) {
		const godot::Dictionary x = v;
		pacts.push_back({ x["id"], x["a"], x["b"], S(x["kind"]), S(x["state"]), onum(x, "endsAt"), oint(x, "brokenBy") });
	}
	for (const godot::Variant &v : arr("orders")) {
		const godot::Dictionary x = v;
		orders.push_back({ x["id"], x["alliance"], S(x["kind"]), S(x["region"]), S(x["state"]), x["expiresAt"] });
	}
	for (const godot::Variant &v : arr("shares")) {
		const godot::Dictionary x = v;
		shares.push_back({ x["order"], x["pid"], x["share"] });
	}
	for (const godot::Variant &v : arr("works")) {
		const godot::Dictionary x = v;
		works.push_back({ x["alliance"], S(x["work"]), goods_of(x["goods"]), x["labour"], x["stage"], onum(x, "doneAt") });
	}
	for (const godot::Variant &v : arr("gifts")) {
		const godot::Dictionary x = v;
		gifts.push_back({ x["alliance"], S(x["work"]), x["pid"], x["labour"] });
	}
	for (const godot::Variant &v : arr("stats")) stats.emplace_back(int(godot::Dictionary(v)["pid"]), double(godot::Dictionary(v)["labour"]));
	for (const godot::Variant &v : arr("favour")) {
		const godot::Dictionary x = v;
		favour.push_back({ x["pid"], x["xp"], x["level"], x["landHour"], x["landN"] });
	}
	for (const godot::Variant &v : arr("favourLog")) {
		const godot::Dictionary x = v;
		favourLog.push_back({ x["pid"], x["at"], x["amount"], S(x["reason"]) });
	}
	for (const godot::Variant &v : arr("alliances")) alliances.emplace_back(int(godot::Array(v)[0]), int(godot::Array(v)[1]));
	for (const godot::Variant &v : arr("names")) names.emplace_back(int(godot::Array(v)[0]), S(godot::Array(v)[1]));
	for (const godot::Variant &v : arr("guards")) {
		const godot::Dictionary x = v, w = x["watch"];
		guards.emplace_back(S(x["region"]), GuardWatch{ w["id"], w["team"], w["taker"], w["men"] });
	}
	nextSettle = int(d.get("nextSettle", 1));
}

} // namespace sim
