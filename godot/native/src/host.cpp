#include "host.h"

#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/variant/string.hpp>

namespace sim {

static godot::String ps(const std::string &s) { return godot::String::utf8(s.c_str()); }

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

void WarHost::step() {
	sim->step();
	sim->bots_tick();
	if (!lords) return;
	// the snapshot is only read on a think tick (WARLORD.think): the rest get one with its tick only
	sim::WarlordsSnap s;
	if (sim->s->tick % int(sim::data().warlords.WARLORD.think) == 0) s = sim::warlords_snap(*sim->s);
	else s.tick = sim->s->tick;
	for (auto &n : lords->tick(s)) notes.push_back(std::move(n));
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
	ClassDB::bind_method(D_METHOD("step"), &WarHost::step);
	ClassDB::bind_method(D_METHOD("warlord_notes"), &WarHost::warlord_notes);
	ClassDB::bind_method(D_METHOD("warlord_snaps"), &WarHost::warlord_snaps);
	ClassDB::bind_method(D_METHOD("warlord_men"), &WarHost::warlord_men);
}

} // namespace godot
