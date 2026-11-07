#include "host.h"
#include "sim_wild.h"

#include <algorithm>
#include <set>

#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/variant/string.hpp>

namespace sim {

godot::String ps(const std::string &s) { return godot::String::utf8(s.c_str()); }

double SimWarlordsHost::influence_w() { return s->works->influence().w; }
// m.mask[t] ?? 0
int SimWarlordsHost::influence_at(double t) {
	const auto &m = s->works->influence().mask;
	return t >= 0 && t < double(m.size()) ? m[size_t(t)] : 0;
}
int SimWarlordsHost::spawn_wild(const std::string &owner, const std::string &kind, double count, double x, double y, const SpawnScale &k) {
	return s->spawnWild(owner, kind, count, x, y, k);
}
void SimWarlordsHost::drop_pile(double x, double y, const std::vector<Lot> &lots, const std::vector<Item> &items) { s->piles->drop(x, y, lots, items, s->tick); }
// The order as the TS director writes it (its JSON object, in its key order, is the order's src).
void SimWarlordsHost::order(const WarlordOrder &o) {
	godot::Dictionary d;
	d["kind"] = ps(o.kind);
	d["squad"] = o.squad;
	if (o.kind == "move") d["x"] = o.x, d["y"] = o.y;
	else if (o.kind == "load") {
		godot::Dictionary from;
		from["building"] = *o.building;
		d["from"] = from;
	} else if (o.kind == "attackBuilding") {
		if (o.building) d["building"] = *o.building;
		else d["siege"] = *o.siege;
	} else if (o.kind == "merge") d["into"] = o.into;
	s->order(godot::order_from(d));
}
void SimWarlordsHost::drop_squad(int squad) { s->dropSquad(squad); }
void SimWarlordsHost::bot_set(int squad, const Behaviour &b) { bots->set(squad, b); }
void SimWarlordsHost::bot_clear(int squad) { bots->clear(squad); }

WarlordsSnap warlords_snap(Sim &s) {
	WarlordsSnap o;
	o.tick = s.tick;
	o.units.reserve(s.units.size());
	for (const Unit *u : s.units) o.units.push_back({ u->id, u->squad->id, u->x, u->y, !u->alive, u->cls });
	for (const Squad *q : s.squads) {
		WarlordsSnap::Squad x;
		x.present = true;
		x.id = q->id, x.team = q->team, x.owner = q->owner, x.order = q->order;
		for (const Unit *u : q->units) x.units.push_back(u->id);
		o.squads.push_back(std::move(x));
	}
	o.has_buildings = true;
	for (const BuildingSnap &b : s.works->building_snaps()) {
		WarlordsSnap::Building x;
		x.id = b.id, x.team = b.team, x.type = b.type, x.state = b.state, x.x = b.x, x.y = b.y, x.ruin = b.ruin;
		x.has_goods = b.goods.has_value();
		if (b.goods) x.goods = b.goods->kv;
		o.buildings.push_back(std::move(x));
	}
	o.has_sieges = true;
	for (const SiegeSnap &e : s.siege->snaps(s.tick)) o.sieges.push_back({ e.id, e.team, e.type, e.state, e.x, e.y });
	// ...(region.lairs?.length || region.claimPoints?.length || mobs.added() ? { lairs, claims: mobs.claimSnaps() } : {})
	if (!s.mobRegion.lairs.empty() || !s.mobRegion.claimPoints.empty() || s.mobs->added()) {
		o.has_claims = true;
		for (const ClaimSnap &c : s.mobs->claim_snaps()) o.claims.push_back(c.team);
	}
	return o;
}

RegionMemory sim_memory(Sim &s) {
	RegionMemory m;
	m.pieces = s.works->pre_rows();
	for (size_t i = 0; i < s.mobRegion.claimPoints.size(); i++) {
		const auto *c = s.mobs->claim_point(int(i));
		m.claims.push_back(c ? c->team : -1);
	}
	m.guardians = s.bosses->memo();
	m.landmark = s.landmarks->flags();
	return m;
}

void sim_recall(Sim &s, const RegionMemory &m, double elapsed) {
	s.bosses->spawn();
	const bool held = std::any_of(m.claims.begin(), m.claims.end(), [](int t) { return t >= 0; });
	// a slain guardian whose 24 h ran out while nobody held the region is back: its landmark as the season found it
	const bool back = std::any_of(m.guardians.begin(), m.guardians.end(), [&](const BossMemo &g) { return g.state == "slain" && !held && g.left <= elapsed; });
	std::set<int> landmark;
	for (const Building *b : s.works->prebuilt())
		if (b->pre->landmark) landmark.insert(b->pre->i);
	std::vector<Works::PreRowIn> rows;
	for (const PreRow &r : m.pieces)
		if (!back || !landmark.count(r.i)) rows.push_back({ r.i, r.hp, r.ruin, r.gone });
	s.works->load_pre_rows(rows);
	s.mobHost->dirty = true;
	for (size_t i = 0; i < m.claims.size(); i++)
		if (m.claims[i] >= 0) s.mobs->grant(int(i), m.claims[i]);
	s.mobHost->flush();
	for (const BossMemo &g : m.guardians) {
		if (g.state != "slain" && g.state != "away") continue;
		if (g.state == "slain" && back) continue;
		const double left = g.left - elapsed;
		if (g.state == "away" && left <= 0) continue;
		s.bosses->down(g.id, std::max(left, held ? data().boss_sim.BOSS.retry : 0.0), g.state == "away");
	}
	if (!back) s.landmarks->remember(m.landmark.first, m.landmark.second);
}

RoomSummary room_summary(const AiSnap &snap) {
	const size_t n = size_t(data().season.ALLIANCES);
	RoomSummary o{ std::vector<double>(n, 0), std::vector<double>(n, 0) };
	for (const ClaimSnap &c : snap.claims)
		if (c.state == "claimed" && c.team >= 0 && size_t(c.team) < n) o.claims[c.team]++;
	for (const AiSnap::Unit &u : snap.units) {
		const int t = u.squad >= 0 && size_t(u.squad) < snap.squads.size() ? snap.squads[u.squad].team : -1;
		if (!u.dead && u.cls.rfind("civ_", 0) != 0 && t >= 0 && size_t(t) < n) o.live[t]++;
	}
	return o;
}

// index.ts dropSquad: W-72 proposal, a fallen warlord's band leaves the field at its border, unreported
} // namespace sim

void sim::Sim::dropSquad(int id) {
	for (Unit *u : units) {
		if (!u->alive || u->squad->id != id) continue;
		u->alive = false;
		u->hp = 0;
		u->reported = true;
		u->squad->alive--;
		u->tgt = nullptr;
		if (!u->job.empty()) works->set_job(*u, "");
	}
}

namespace godot {

Ref<WarHost> WarHost::create(const Ref<Sim> &sim) {
	Ref<WarHost> h;
	ERR_FAIL_COND_V_MSG(sim.is_null(), h, "WarHost.create: no sim");
	h.instantiate();
	h->sim = sim;
	h->lordHost.s = sim->s;
	h->lordHost.bots = sim->bots;
	return h;
}

bool WarHost::start_warlords(double age, double players, const Variant &raid) {
	lordRegion = std::make_unique<sim::WarlordsRegion>(sim::warlords_region(sim->meta, sim->s->grid->w, sim->s->grid->h));
	lords = std::make_unique<sim::Warlords>(*lordRegion, 1, lordHost);
	if (lords->none()) {
		lords.reset();
		return false;
	}
	lords->setAge(age);
	lords->setPlayers(players);
	if (raid.get_type() != Variant::NIL) lords->raidNow(double(raid) * 10);
	return true;
}

void WarHost::start_season(double seed, double length_ms, double age, const Variant &held) {
	sim::Sim &S = *sim->s;
	S.spawnMobs();
	if (held.get_type() == Variant::ARRAY) {
		sim::RegionMemory m = sim::sim_memory(S);
		const Array h = held;
		m.claims.clear();
		for (int64_t i = 0; i < h.size(); i++) m.claims.push_back(int(h[i]));
		sim::sim_recall(S, m, 0);
	}
	lordRegion = std::make_unique<sim::WarlordsRegion>(sim::warlords_region(sim->meta, S.grid->w, S.grid->h));
	lords = std::make_unique<sim::Warlords>(*lordRegion, seed, lordHost);
	if (lords->none()) lords.reset();
	else lords->setAge(age);
	std::vector<sim::AiEntry> entries;
	const Array es = sim->meta.get("entries", Array());
	for (int64_t i = 0; i < es.size(); i++) {
		const Dictionary e = es[i];
		entries.push_back({ String(e["side"]).utf8().get_data(), e["x"], e["y"], e["w"], e["h"] });
	}
	ais.clear();
	for (int a = 0; a < sim::data().season.ALLIANCES; a++) ais.push_back(std::make_unique<sim::AllianceAi>(S, *sim->bots, entries, a));
	clock = std::make_unique<sim::SeasonClock>(0, length_ms);
}

bool WarHost::step() {
	if (clock && clock->ended) return true;
	sim->step();
	sim->bots_tick();
	const int tick = sim->s->tick;
	const sim::AllyAiTables &A = sim::data().ally;
	// the season's snapshot is only read on an AI think tick and a report tick
	std::shared_ptr<const sim::AiSnap> snap;
	if (clock && (tick % int(A.think) == 0 || tick % int(A.report) == 0)) snap = std::make_shared<const sim::AiSnap>(sim::ai_snap(*sim->s));
	if (lords) {
		if (clock) {
			double n = 0;
			for (const auto &ai : ais) n += ai->present();
			lords->setPlayers(n);
		}
		// the snapshot is only read on a think tick (WARLORD.think): the rest get one with its tick only
		sim::WarlordsSnap s;
		if (tick % int(sim::data().warlords.WARLORD.think) == 0) s = sim::warlords_snap(*sim->s);
		else s.tick = tick;
		for (auto &n : lords->tick(s)) notes.push_back(std::move(n));
	}
	if (!clock) return false;
	const double now = tick * A.tickMs;
	if (snap)
		for (const auto &ai : ais) ai->tick(snap);
	if (tick % int(A.report) == 0) {
		const sim::RoomSummary r = sim::room_summary(*snap);
		clock->report(sim->s->region.id, r.claims, r.live, now);
	}
	return clock->advance(now).has_value() || clock->ended.has_value();
}

static Array nums(const std::vector<double> &v) {
	Array a;
	for (double x : v) a.push_back(x);
	return a;
}

Array WarHost::ai_stats() const {
	Array out;
	for (const auto &ai : ais) {
		const sim::AllianceAiStats st = ai->stats();
		Dictionary d;
		d["raised"] = st.raised, d["squads"] = st.squads, d["orders"] = st.orders, d["bots"] = st.bots;
		d["target"] = st.target, d["doing"] = sim::ps(st.doing), d["laid"] = st.laid;
		d["men"] = ai->men(), d["present"] = ai->present();
		out.push_back(d);
	}
	return out;
}

Dictionary WarHost::clock_state() const {
	Dictionary d;
	if (!clock) return d;
	d["scores"] = nums(clock->scores);
	d["accruedAt"] = clock->accruedAt;
	if (clock->hegemony) {
		Dictionary h;
		h["alliance"] = clock->hegemony->alliance, h["since"] = clock->hegemony->since;
		d["hegemony"] = h;
	} else d["hegemony"] = Variant();
	if (clock->ended) {
		Dictionary e;
		e["at"] = clock->ended->at, e["reason"] = sim::ps(clock->ended->reason);
		e["winner"] = clock->ended->winner >= 0 ? Variant(clock->ended->winner) : Variant();
		e["scores"] = nums(clock->ended->scores);
		d["ended"] = e;
	} else d["ended"] = Variant();
	Array owners, claims;
	for (const sim::ClockRegion &r : clock->regions) {
		owners.push_back(r.owner);
		if (r.id == sim->s->region.id) claims = nums(r.claims);
	}
	d["owners"] = owners;
	d["claims"] = claims;
	return d;
}

Array WarHost::claim_rows() const {
	Array out;
	const sim::Sim &S = *sim->s;
	if (S.mobRegion.lairs.empty() && S.mobRegion.claimPoints.empty() && !S.mobs->added()) return out;
	for (const sim::ClaimSnap &c : S.mobs->claim_snaps())
		out.push_back(Array::make(c.id, c.team, sim::ps(c.state), c.squad, c.progress, c.taking.empty() ? Variant() : Variant(sim::ps(c.taking))));
	return out;
}

Array WarHost::siege_rows() const {
	Array out;
	for (const sim::SiegeSnap &e : sim->s->siege->snaps(sim->s->tick)) out.push_back(Array::make(e.id, sim::ps(e.type), e.team, e.x, e.y, sim::ps(e.state), e.hp));
	return out;
}

Array WarHost::warlord_notes() {
	Array out;
	for (const auto &n : notes) out.push_back(sim::warlord_note_dict(n));
	notes.clear();
	return out;
}

Array WarHost::warlord_snaps() const {
	Array out;
	if (lords)
		for (const auto &o : lords->snaps()) out.push_back(sim::warlord_snap_dict(o));
	return out;
}

void WarHost::_bind_methods() {
	ClassDB::bind_static_method("WarHost", D_METHOD("create", "sim"), &WarHost::create);
	ClassDB::bind_method(D_METHOD("start_warlords", "age", "players", "raid"), &WarHost::start_warlords);
	ClassDB::bind_method(D_METHOD("start_season", "seed", "length_ms", "age", "held"), &WarHost::start_season);
	ClassDB::bind_method(D_METHOD("step"), &WarHost::step);
	ClassDB::bind_method(D_METHOD("ai_stats"), &WarHost::ai_stats);
	ClassDB::bind_method(D_METHOD("clock_state"), &WarHost::clock_state);
	ClassDB::bind_method(D_METHOD("claim_rows"), &WarHost::claim_rows);
	ClassDB::bind_method(D_METHOD("siege_rows"), &WarHost::siege_rows);
	ClassDB::bind_method(D_METHOD("warlord_notes"), &WarHost::warlord_notes);
	ClassDB::bind_method(D_METHOD("warlord_snaps"), &WarHost::warlord_snaps);
	ClassDB::bind_method(D_METHOD("warlord_men"), &WarHost::warlord_men);
}

} // namespace godot
