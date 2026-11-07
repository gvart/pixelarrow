// Wave D of the region room (docs/impl/godot-port.md P8): the region's life round the sim, ported line for line from
// server/src/war/room.ts (startGuide .. summary, the tick's guide, story, encounter and warlord parts, world events,
// memory and recall), server/src/war/guide.ts RoomGuide, ./stories.ts RoomStories, ./encounters.ts RoomEncounters,
// ./taskWatch.ts GatherWatch and src/war/net/mastery.ts wildDeeds. The pure guide rules are net_guide.h; the story and
// encounter runners stories.h and encounters.h; the warlords warlords.h (on the sim as host.h drives them).
//
// Cargo (cargo.ts tollOf, robOf; index.ts cargo for packs and carts) is room_cargo.h's and Sim::cargo.
#include "room.h"

#include <algorithm>
#include <cmath>
#include <regex>

#include <godot_cpp/variant/string.hpp>

#include "encounters.h"
#include "room_cargo.h"
#include "host.h"
#include "js_json.h"
#include "js_math.h"
#include "net_guide.h"
#include "sim_data.h"
#include "sim_wild.h"
#include "snapshot.h"
#include "start.h"

namespace sim {

using godot::Array;
using godot::Dictionary;
using godot::Variant;

// the life's own copies of what room.ts imports (they are static in room.cpp)
static godot::String gs(const std::string &s) { return godot::String::utf8(s.c_str()); }
static std::string u8(const Variant &v) { return godot::String(v).utf8().get_data(); }
static bool dead(const Dictionary &u) { return u8(u["state"]) == "dead"; }
static std::string owner_of(int pid) { return "p:" + std::to_string(pid); }
// /^p:(\d+)$/: the digits ("" none)
static std::string pid_digits(const std::string &owner) {
	static const std::regex re("^p:(\\d+)$");
	std::smatch m;
	return std::regex_match(owner, m, re) ? m[1].str() : "";
}
static int pid_of(const std::string &owner) {
	const std::string d = pid_digits(owner);
	return d.empty() ? -1 : int(std::stod(d));
}
static Dictionary goods_dict(const std::vector<std::pair<std::string, double>> &g) {
	Dictionary d;
	for (const auto &[k, n] : g) d[gs(k)] = n;
	return d;
}
// Record<string, number> as a JS object fills: a key added again keeps its place
static void add_to(std::vector<std::pair<std::string, double>> &g, const std::string &k, double n) {
	for (auto &e : g)
		if (e.first == k) return void(e.second += n);
	g.push_back({ k, n });
}

// index.ts cargo() of a squad's packs or a cart (room_cargo.h has cargo.ts tollOf and robOf)
static std::vector<CargoSlot> cargo_squad(Sim &s, int squad) {
	CargoRef r;
	r.squad = squad;
	const auto at = s.cargo(r);
	return at ? at->slots : std::vector<CargoSlot>{};
}
static std::vector<CargoSlot> cargo_cart(Sim &s, int id) {
	CargoRef r;
	r.cart = id;
	const auto at = s.cargo(r);
	return at ? at->slots : std::vector<CargoSlot>{};
}

// ---------------------------------------------------------------- the life's state

using Tally = std::vector<std::pair<std::string, double>>;

struct GuideRun {
	int pid = 0;
	std::string path;
	GuideSave save;
	GuideWatch watch;
	std::optional<std::string> road;
};
struct StoryEntry {
	std::shared_ptr<StoryRun> run;
	std::shared_ptr<Tally> goods;
};
struct EncEntry {
	std::shared_ptr<EncounterRun> run;
	std::shared_ptr<Tally> goods;
};
struct Moved {
	int pid;
	Array notes;
};

struct RoomLife {
	godot::PackedByteArray cells;
	StoryRegion storyRegion;
	EncRegion encRegion;
	// RoomGuide
	JsMap<int, std::shared_ptr<GuideRun>> guides;
	Array guideDone;
	// RoomStories
	JsMap<int, StoryEntry> stories;
	std::vector<std::pair<int, std::vector<StoryNote>>> storyMoved;
	// RoomEncounters
	JsMap<int, EncEntry> encs;
	std::vector<std::pair<int, std::vector<EncNote>>> encMoved;
	std::vector<int> waiting; // a JS Set: insertion order
	// warlords (createWarlords on the room's seed)
	SimWarlordsHost lordHost;
	std::unique_ptr<WarlordsRegion> lordRegion;
	std::unique_ptr<Warlords> lords;
	std::vector<WarlordNote> notes; // this tick's
	// W-62 world events
	Array worldEvents;
	// GatherWatch
	struct Was {
		std::string r;
		double n;
		bool cut;
	};
	std::map<int, Was> was; // only looked up
	JsMap<std::string, double> acc;
	std::set<int> up;
	bool looked = false;
	// W-73: each lair's state as last seen
	std::map<int, std::string> wildSeen; // only looked up
	// the tick's books
	Array storied, met;
};

Room::~Room() = default;

void Room::startLife(const godot::PackedByteArray &cells, const Grid &fresh, bool warlords) {
	life = std::make_shared<RoomLife>();
	RoomLife &L = *life;
	L.cells = cells;
	L.storyRegion = { regionId, fresh.w, fresh.h, fresh.cost, npc_spot(meta) };
	L.encRegion = encounter_region(meta, fresh);
	if (warlords) {
		L.lordHost.s = &sim;
		L.lordHost.bots = &bots;
		L.lordRegion = std::make_unique<WarlordsRegion>(warlords_region(meta, w, h));
		L.lords = std::make_unique<Warlords>(*L.lordRegion, double(seed), L.lordHost);
		if (L.lords->none()) L.lords.reset();
	}
}

// ---------------------------------------------------------------- RoomGuide (server/src/war/guide.ts)

static Dictionary guide_msg(const GuideSave &save, const std::string &step = "", bool paid = false) {
	Dictionary m;
	m["t"] = "guide";
	Array done;
	for (const std::string &d : save.done) done.push_back(gs(d));
	m["done"] = done;
	if (save.hidden) m["hidden"] = true;
	if (!step.empty()) m["step"] = gs(step);
	if (paid) m["paid"] = true;
	return m;
}

static void guide_finish(RoomLife &L, GuideRun &r, const std::string &step, bool paid) {
	const auto &steps = guide_steps(r.path);
	const auto st = std::find_if(steps.begin(), steps.end(), [&](const GuideStep &s) { return s.id == step; });
	auto &done = r.save.done;
	if (st == steps.end() || std::find(done.begin(), done.end(), step) != done.end()) return; // another path's work counts for nothing here
	if (step == "hire" && std::find(done.begin(), done.end(), "sell") == done.end()) return; // a trader buys his first load at home: this is the deal abroad
	done.push_back(step);
	Dictionary d;
	d["pid"] = r.pid;
	d["step"] = gs(step);
	d["paid"] = paid;
	d["reward"] = paid ? goods_dict(st->reward) : Dictionary();
	d["save"] = guide_save_dict(r.save);
	L.guideDone.push_back(d);
	if (!guide_open(&r.save, r.path)) L.guides.erase(r.pid);
}

Variant Room::startGuide(int pid, const Variant &saveIn, const std::string &homeIn) {
	const auto pit = players.find(pid);
	if (pit == players.end()) return Variant();
	const int team = pit->second.team;
	const std::string owner = owner_of(pid);
	snap = sim::snapshot(sim); // W-79: admit() spawned his squads after the last tick; their packs get the rations
	// his whole army (D1, set by the DO), else his fighters on this field (as the soul gate counts)
	double army;
	const auto a = armies.find(pid);
	if (a != armies.end()) army = a->second;
	else {
		army = 0;
		const Array us = snap["units"];
		for (int64_t i = 0; i < us.size(); i++) {
			const Dictionary u = us[i];
			const std::string *o = ownerAt(int(u["squad"]));
			if (!dead(u) && o && *o == owner && u8(u["cls"]).rfind("civ_", 0) != 0) army++;
		}
	}
	const auto pp = paths.find(pid);
	const PlayerPath way = pp == paths.end() ? NO_PATH : pp->second;
	const double cap = soldier_cap(way.path);
	// RoomGuide.start
	RoomLife &L = *life;
	const std::string homeId = !homeIn.empty() ? homeIn : home && team == *home ? regionId : "";
	if (homeId.empty() || (homeId != regionId && way.path != "trader")) return Variant();
	const std::optional<GuideSave> save = guide_save_from(saveIn);
	const GuideSave s0 = save.value_or(GuideSave{});
	if (!guide_open(&s0, way.path)) return guide_msg(s0);
	const GuideSpots spots = guide_spots(meta, L.cells, team);
	const bool fights = way.path.empty() || way.path == "warrior";
	const auto hand = homeId == regionId ? guide_hand(regionId, meta, way.path) : std::nullopt;
	const bool fresh = !L.guides.count(pid);
	if (fresh) {
		auto r = std::make_shared<GuideRun>();
		r->pid = pid;
		r->path = way.path;
		r->save = s0;
		r->watch = watch_for(way.path, meta, team, owner, homeId, spots.lair);
		if (hand) r->road = hand->road;
		L.guides[pid] = r;
	}
	std::shared_ptr<GuideRun> run = L.guides.at(pid);
	// a new run holds the save itself (TS: one object): what its steps finish below shows in the message
	GuideSave s1 = s0;
	const GuideSave &s = fresh ? run->save : s1;
	// W-79: the start squad's march rations (HUNGER.kit into each of his men's packs)
	if (!save) {
		const Array qs = snap["squads"];
		for (int64_t i = 0; i < qs.size(); i++) {
			const Dictionary q = qs[i];
			if (u8(q.get("owner", "")) != owner) continue;
			for (const CargoSlot &slot : cargo_squad(sim, int(q["id"]))) put(*slot.hold, "ration", data().food.HUNGER.kit, regionId);
		}
	}
	const GuideTables &G = data().guide;
	const auto has = [&](const char *st) { return std::find(s.done.begin(), s.done.end(), st) != s.done.end(); };
	if (fights && !has("lair")) {
		const Array ls = snap.get("lairs", Array());
		bool standing = false;
		for (int64_t i = 0; i < ls.size(); i++) {
			const Dictionary l = ls[i];
			if (js::hypot(double(l["x"]) - spots.lair.x, double(l["y"]) - spots.lair.y) < 0.5 && u8(l["state"]) != "cleared") standing = true;
		}
		if (!standing) {
			sim.mobHost->dirty = true;
			sim.mobs->add({ G.lair.kind, spots.lair.x, spots.lair.y, G.lair.count, false, std::nullopt });
			sim.mobHost->flush();
		}
	}
	if (fights) {
		if (army >= cap) guide_finish(L, *run, "soul", false);
		else if (!has("soul")) {
			const Array ss = snap.get("souls", Array());
			bool any = false;
			for (int64_t i = 0; i < ss.size() && !any; i++) {
				const Dictionary q = ss[i];
				any = may_hold(way, u8(q["cls"])) && js::hypot(double(q["x"]) - spots.soul.x, double(q["y"]) - spots.soul.y) < G.near;
			}
			if (!any) {
				const auto f = G.familyStart.find(way.family);
				sim.spawnSoul(spots.soul.x, spots.soul.y, !way.family.empty() && f != G.familyStart.end() ? f->second[0] : "hoplite", G.soul.level, "shrine"); // a soul he can take (W-101)
			}
		}
	}
	return guide_msg(s);
}

Variant Room::guideSaveOf(int pid) const {
	const auto r = life->guides.find(pid);
	return r == life->guides.end() ? Variant() : Variant(guide_save_dict(r->second->save));
}

Variant Room::guideHide(int pid) {
	const auto r = life->guides.find(pid);
	if (r == life->guides.end()) return Variant();
	const std::shared_ptr<GuideRun> run = r->second;
	run->save.hidden = true;
	life->guides.erase(pid);
	return guide_save_dict(run->save);
}

void Room::guideMark(int pid, const std::string &step) {
	const auto r = life->guides.find(pid);
	if (r != life->guides.end()) r->second->watch.flags.add(step);
}

void Room::guideDeparted(int pid, const std::string &to) {
	const auto r = life->guides.find(pid);
	if (r != life->guides.end() && r->second->road == to) r->second->watch.flags.add("next");
}

// ---------------------------------------------------------------- RoomStories (server/src/war/stories.ts)

static Dictionary story_msg(const StorySave &save, const std::vector<StoryNote> *notes = nullptr) {
	Dictionary m;
	m["t"] = "story";
	m["save"] = save_to_dict(save);
	if (notes && !notes->empty()) m["notes"] = story_notes(*notes);
	return m;
}

static void drop_reward(Sim &sim, Tally &goods, const StoryReward &r, XY at, const std::optional<Item> &item) {
	if (r.goods)
		for (const auto &[k, n] : *r.goods) add_to(goods, k, n);
	if (item) sim.piles->drop(at.x, at.y, {}, { *item }, sim.tick);
	if (r.soul) sim.spawnSoul(at.x + 1, at.y, r.soul->cls, r.soul->level, "lair");
}

Variant Room::startStory(int pid, const Variant &saveIn) {
	const auto pit = players.find(pid);
	if (pit == players.end()) return Variant();
	const auto pp = paths.find(pid);
	const Story *story = story_of(regionId, pp == paths.end() ? "" : pp->second.path); // W-147: a home's chain is his path's
	if (!story) return Variant();
	RoomLife &L = *life;
	const auto had = L.stories.find(pid);
	// the goods it owes ride with the run (a fresh object on a rejoin would lose what its host still pays in)
	std::shared_ptr<Tally> goods = had != L.stories.end() ? had->second.goods : std::make_shared<Tally>();
	std::shared_ptr<StoryRun> run;
	if (had != L.stories.end()) run = had->second.run;
	else {
		StoryHost host;
		host.add_lair = [this](const LairAsk &d) {
			sim.mobHost->dirty = true;
			sim.mobs->add({ d.kind, d.x, d.y, d.count, d.lead, d.chief });
			sim.mobHost->flush();
		};
		host.spawn_soul = [this](double x, double y, const std::string &cls, double level) { sim.spawnSoul(x, y, cls, level, "lair"); };
		host.give = [this, goods](const StoryReward &r, XY at, const std::optional<Item> &item) { drop_reward(sim, *goods, r, at, item); };
		StoryMe me;
		me.team = pit->second.team;
		me.owner = owner_of(pid);
		run = std::make_shared<StoryRun>(L.storyRegion, *story, save_from(*story, saveIn), me, std::move(host));
	}
	if (!run->save.done) L.stories[pid] = { run, goods };
	return story_msg(run->save);
}

void Room::storyChoose(int pid, const std::string &option) {
	const auto r = life->stories.find(pid);
	if (r == life->stories.end()) return;
	const auto notes = r->second.run->choose(story_snap(snap), option);
	if (notes && !notes->empty()) life->storyMoved.push_back({ pid, *notes });
}

void Room::storyTrade(int pid, const std::string &op, double coin, double abroad) {
	const auto r = life->stories.find(pid);
	if (r != life->stories.end()) {
		const auto notes = r->second.run->trade(story_snap(sim::snapshot(sim)), op, coin, abroad);
		if (!notes.empty()) life->storyMoved.push_back({ pid, notes });
	}
	if (op != "sell") guideMark(pid, "hire"); // W-170 the trader's chain: goods he carried in, then what he spends it on
	else if (abroad > 0) guideMark(pid, "sell");
}

// ---------------------------------------------------------------- RoomEncounters (server/src/war/encounters.ts)

static constexpr double ROB_REACH = 30;
static constexpr size_t AWAY_MAX = 6;

static Dictionary enc_msg(const EncSave &save, const std::vector<EncNote> *notes = nullptr) {
	Dictionary m;
	m["t"] = "encounter";
	m["save"] = enc_save_to_dict(save);
	if (notes && !notes->empty()) m["notes"] = enc_notes(*notes);
	return m;
}

static void keep_away(EncSave &s, const std::vector<std::string> &lines) {
	std::vector<std::string> all = s.away.value_or(std::vector<std::string>{});
	all.insert(all.end(), lines.begin(), lines.end());
	if (all.size() > AWAY_MAX) all.erase(all.begin(), all.end() - AWAY_MAX);
	s.away = all;
}

// welcomeBack: the message for a player coming in; W-219: what happened while he was gone goes with it, once
static Dictionary welcome_back(EncounterRun &run) {
	const Dictionary msg = enc_msg(run.save);
	if (run.save.away) {
		run.save.away.reset();
		run.due = true;
	}
	return msg;
}

Variant Room::startEncounters(int pid, const Variant &saveIn) {
	const auto pit = players.find(pid);
	if (pit == players.end()) return Variant();
	RoomLife &L = *life;
	const auto had = L.encs.find(pid);
	if (had != L.encs.end()) return welcome_back(*had->second.run);
	auto goods = std::make_shared<Tally>();
	const std::string me = owner_of(pid);
	EncHost host;
	host.add_lair = [this](const EncLairAsk &d) {
		sim.mobHost->dirty = true;
		sim.mobs->add({ d.kind, d.x, d.y, d.count, false, std::nullopt });
		sim.mobHost->flush();
	};
	host.spawn_soul = [this](double x, double y, const std::string &cls, double level) { sim.spawnSoul(x, y, cls, level, "lair"); };
	host.give = [this, goods](const StoryReward &r, XY at, const std::optional<Item> &item) { drop_reward(sim, *goods, r, at, item); };
	host.toll = [this, me](double share) {
		const Dictionary s = sim::snapshot(sim);
		std::vector<CargoSlot> slots;
		const Array qs = s["squads"], es = s.get("sieges", Array());
		for (int64_t i = 0; i < qs.size(); i++)
			if (u8(Dictionary(qs[i]).get("owner", "")) == me)
				for (const CargoSlot &x : cargo_squad(sim, int(Dictionary(qs[i])["id"]))) slots.push_back(x);
		for (int64_t i = 0; i < es.size(); i++)
			if (Dictionary(es[i]).has("owner") && u8(Dictionary(es[i])["owner"]) == me)
				for (const CargoSlot &x : cargo_cart(sim, int(Dictionary(es[i])["id"]))) slots.push_back(x);
		cargo_toll(slots, share);
	};
	// W-219 as a raid (W-91): what they can carry, nothing more, from the load in their reach
	host.rob = [this, me](const EncBand &band) {
		const Dictionary s = sim::snapshot(sim);
		std::vector<CargoSlot> slots;
		const Array qs = s["squads"], es = s.get("sieges", Array());
		for (int64_t i = 0; i < es.size(); i++) {
			const Dictionary c = es[i];
			if (c.has("owner") && u8(c["owner"]) == me && u8(c["state"]) != "destroyed" && js::hypot(double(c["x"]) - band.x, double(c["y"]) - band.y) <= ROB_REACH)
				for (const CargoSlot &x : cargo_cart(sim, int(c["id"]))) slots.push_back(x);
		}
		for (int64_t i = 0; i < qs.size(); i++)
			if (u8(Dictionary(qs[i]).get("owner", "")) == me)
				for (const CargoSlot &x : cargo_squad(sim, int(Dictionary(qs[i])["id"])))
					if (js::hypot(x.x - band.x, x.y - band.y) <= ROB_REACH) slots.push_back(x);
		const Tally took = cargo_rob(slots, band.alive * data().trade.PORTER.loads);
		sim.dropSquad(band.squad);
		return took;
	};
	EncMe m;
	m.team = pit->second.team;
	m.owner = me;
	m.seed = double(seed);
	const auto &defs = data().encounters.defs;
	auto run = std::make_shared<EncounterRun>(L.encRegion, defs, enc_save_from(defs, saveIn), m, std::move(host), story_of(regionId));
	L.encs[pid] = { run, goods };
	return welcome_back(*run);
}

void Room::encounterChoose(int pid, const std::string &option) {
	const auto r = life->encs.find(pid);
	if (r == life->encs.end()) return;
	const auto notes = r->second.run->choose(enc_snap(snap), option);
	if (notes && !notes->empty()) life->encMoved.push_back({ pid, *notes });
}

void Room::encountersRoad(int pid, double loads, const std::string &key) {
	const GuideTables &G = data().guide;
	if (loads < G.robbers.minLoads) return;
	const uint32_t h = hash_string(gs("robbers:" + js::number_to_string(double(seed)) + ":" + std::to_string(pid) + ":" + key));
	Mulberry rng(h ? h : 1);
	if (rng.next() < G.robbers.chance && std::find(life->waiting.begin(), life->waiting.end(), pid) == life->waiting.end()) life->waiting.push_back(pid);
}

// ---------------------------------------------------------------- world events, warlords, memory, summary

void Room::setWorldEvents(const Array &evs) {
	life->worldEvents = evs;
	bool storm = false;
	for (int64_t i = 0; i < evs.size(); i++) storm = storm || u8(Dictionary(evs[i])["kind"]) == "soulStorm";
	sim.souls->set_storm(storm ? data().guide.stormChance : 1);
}

double Room::bossLoot() const {
	for (int64_t i = 0; i < life->worldEvents.size(); i++)
		if (u8(Dictionary(life->worldEvents[i])["kind"]) == "bossWake") return data().guide.wake.loot;
	return 1;
}

void Room::wakeGuardians() {
	sim.bosses->spawn();
	sim.bosses->wake(data().guide.wake.hp);
	snap = sim::snapshot(sim);
}

void Room::setWarlordAge(double days) {
	if (life->lords) life->lords->setAge(days);
}

static Dictionary record_dict(const Record &r) {
	Dictionary d;
	for (const auto &[k, v] : r) d[gs(k)] = v;
	return d;
}
static Record record_of(const Variant &v) {
	Record r;
	if (v.get_type() != Variant::DICTIONARY) return r;
	const Dictionary d = v;
	const Array ks = d.keys();
	for (int64_t i = 0; i < ks.size(); i++) r.push_back({ u8(ks[i]), double(d[ks[i]]) });
	return r;
}

Variant Room::warlordMemory() const {
	if (!life->lords) return Variant();
	const WarlordMemory m = life->lords->memory();
	Dictionary d, freed;
	d["fallen"] = record_dict(m.fallen);
	for (const auto &[k, r] : m.freed) freed[gs(k)] = record_dict(r);
	d["freed"] = freed;
	return d;
}

Variant Room::warlordsState() const { return life && life->lords ? Variant(life->lords->exportState()) : Variant(); }

void Room::loadWarlords(const Dictionary &st) {
	if (life && life->lords) life->lords->importState(st);
}

void Room::recallWarlords(const Dictionary &d) {
	if (!life->lords) return;
	WarlordMemory m;
	m.fallen = record_of(d.get("fallen", Variant()));
	const Dictionary fr = d.get("freed", Dictionary());
	const Array ks = fr.keys();
	for (int64_t i = 0; i < ks.size(); i++) m.freed.push_back({ u8(ks[i]), record_of(fr[ks[i]]) });
	life->lords->recall(m);
}

void Room::warlordFell(const std::string &id, double at) {
	if (life->lords) life->lords->fell(id, at);
}

int Room::present() const {
	std::set<std::string> pids;
	const Array us = snap["units"];
	for (int64_t i = 0; i < us.size(); i++) {
		const Dictionary u = us[i];
		if (dead(u) || u8(u["cls"]).rfind("civ_", 0) == 0) continue;
		const std::string *o = ownerAt(int(u["squad"]));
		if (o && o->rfind("p:", 0) == 0) pids.insert(*o);
	}
	return int(pids.size());
}

Dictionary Room::memory() {
	const RegionMemory m = sim_memory(sim);
	Dictionary d, lm;
	Array pieces, claims, guardians;
	for (const PreRow &r : m.pieces) {
		Dictionary p;
		p["i"] = r.i;
		p["hp"] = r.hp;
		p["ruin"] = r.ruin;
		p["gone"] = r.gone;
		p["team"] = r.team;
		pieces.push_back(p);
	}
	for (int c : m.claims) claims.push_back(c);
	for (const BossMemo &g : m.guardians) {
		Dictionary x;
		x["id"] = gs(g.id);
		x["state"] = gs(g.state);
		x["left"] = g.left;
		guardians.push_back(x);
	}
	lm["captured"] = m.landmark.first;
	lm["restored"] = m.landmark.second;
	d["pieces"] = pieces;
	d["claims"] = claims;
	d["guardians"] = guardians;
	d["landmark"] = lm;
	return d;
}

void Room::recall(const Dictionary &d, double elapsed) {
	RegionMemory m;
	const Array pieces = d.get("pieces", Array()), claims = d.get("claims", Array()), guardians = d.get("guardians", Array());
	for (int64_t i = 0; i < pieces.size(); i++) {
		const Dictionary p = pieces[i];
		m.pieces.push_back({ int(p["i"]), double(p["hp"]), bool(p["ruin"]), p.get("gone", false).booleanize(), int(p.get("team", 0)) });
	}
	for (int64_t i = 0; i < claims.size(); i++) m.claims.push_back(int(claims[i]));
	for (int64_t i = 0; i < guardians.size(); i++) {
		const Dictionary g = guardians[i];
		m.guardians.push_back({ u8(g["id"]), u8(g["state"]), double(g["left"]) });
	}
	const Dictionary lm = d.get("landmark", Dictionary());
	m.landmark = { lm.get("captured", false).booleanize(), lm.get("restored", false).booleanize() };
	sim_recall(sim, m, std::max(0.0, std::floor(elapsed)));
	snap = sim::snapshot(sim);
}

Dictionary Room::summary() {
	const int n = Net::ALLIANCES;
	std::vector<int> claims(n, 0), channel(n, 0);
	const Array cs = snap.get("claims", Array());
	for (int64_t i = 0; i < cs.size(); i++) {
		const Dictionary c = cs[i];
		const std::string st = u8(c["state"]);
		const int team = c["team"], sq = c["squad"];
		if (st == "claimed" && team >= 0 && team < n) claims[team]++;
		const auto t = sq >= 0 ? teams.find(sq) : teams.end();
		const bool taking = c.has("taking") && c["taking"].get_type() == Variant::STRING && !u8(c["taking"]).empty();
		if ((st == "channel" || st == "contested" || taking) && t != teams.end() && t->second < n) channel[t->second]++;
	}
	Dictionary out;
	Array live0, cl, ch;
	for (int i = 0; i < n && i < int(live.size()); i++) live0.push_back(live[i]);
	for (int x : claims) cl.push_back(x);
	for (int x : channel) ch.push_back(x);
	out["live"] = live0;
	out["claims"] = cl;
	out["channel"] = ch;
	// M7f: its landmark, favour and prestige per alliance, a ruined town
	if (snap.has("landmark") && snap["landmark"].get_type() == Variant::DICTIONARY) {
		const Dictionary lm = snap["landmark"];
		const Array bs = snap.get("bosses", Array());
		bool alive = false, away = false;
		std::vector<double> left;
		for (int64_t i = 0; i < bs.size(); i++) {
			const Dictionary b = bs[i];
			const std::string st = u8(b["state"]);
			alive = alive || (st != "slain" && st != "away");
			away = away || st == "away";
			if (b.has("respawnIn") && b["respawnIn"].get_type() != Variant::NIL) left.push_back(b["respawnIn"]);
		}
		const std::string guardian = alive ? "alive" : away ? "away" : "slain";
		Dictionary l;
		const int holder = lm["holder"];
		l["id"] = lm["id"];
		l["holder"] = holder >= 0 && holder < n ? holder : -1;
		l["guardian"] = gs(guardian);
		if (guardian != "alive" && !left.empty()) l["back"] = std::ceil(*std::min_element(left.begin(), left.end()) / 600);
		l["state"] = lm["state"];
		l["hp"] = js::round(double(lm["hp"]) * 100) / 100;
		l["garrisoned"] = lm["garrisoned"];
		out["landmark"] = l;
	}
	// W-76 proposal: the warlords here, for the world map (rounded: a report only when it changes)
	if (life->lords) {
		const Record fell = life->lords->memory().fallen;
		Array lords;
		for (const WarlordSnapOut &w : life->lords->snaps()) {
			Dictionary d;
			int held = 0;
			double men = 0;
			for (const auto &h : w.holds) held += h.state == "held", men += h.men;
			d["id"] = gs(w.id);
			d["holds"] = held;
			d["men"] = men;
			if (w.has_raid) d["raid"] = std::ceil(w.raid.in / 100) * 10;
			else if (w.raiding) d["raid"] = 0;
			if (w.fallen)
				for (const auto &[k, v] : fell)
					if (k == w.id) d["fell"] = v;
			lords.push_back(d);
		}
		out["lords"] = lords;
	}
	if (Array(meta.get("prebuilt", Array())).size()) {
		Array pr;
		bool any = false;
		for (int t = 0; t < n; t++) {
			const double v = js::round(sim.towns->prestige(t) * 100) / 100;
			any = any || v > 0;
			pr.push_back(v);
		}
		if (any) out["prestige"] = pr;
		const Array ts = snap.get("towns", Array());
		for (int64_t i = 0; i < ts.size(); i++) {
			const Dictionary t = ts[i];
			if (int(t["claim"]) >= 0 && t.get("ruined", false).booleanize()) {
				out["ruined"] = true;
				break;
			}
		}
	}
	return out;
}

// ---------------------------------------------------------------- the tick's hooks

void Room::lifeLords(TickOut &out) {
	RoomLife &L = *life;
	L.notes.clear();
	if (!L.lords) return;
	L.lords->setPlayers(present());
	// the snapshot is only read on a think tick (WARLORD.think): the rest get one with its tick only (as host.cpp)
	WarlordsSnap s;
	if (sim.tick % int(data().warlords.WARLORD.think) == 0) s = warlords_snap(sim);
	else s.tick = sim.tick;
	L.notes = L.lords->tick(s);
	for (const WarlordNote &n : L.notes) out.warlord.push_back(warlord_note_dict(n));
}

// GatherWatch.step and .built (server/src/war/taskWatch.ts)
void Room::lifeGather() {
	RoomLife &L = *life;
	const Array us = snap["units"], bs = snap.get("buildings", Array());
	std::map<int, RoomLife::Was> seen;
	for (int64_t i = 0; i < us.size(); i++) {
		const Dictionary u = us[i];
		if (dead(u)) continue;
		const int id = u["id"];
		const auto prev = L.was.find(id);
		const std::string carry = u.has("carry") && u["carry"].get_type() == Variant::STRING ? u8(u["carry"]) : "";
		const double load = u.get("load", 0);
		if ((carry == "wood" || carry == "stone") && load > 0) {
			seen[id] = { carry, load, u8(u["state"]) == "gather" || (prev != L.was.end() && prev->second.cut && prev->second.r == carry) };
			continue;
		}
		if (prev == L.was.end() || !prev->second.cut) continue;
		const std::string *o = ownerAt(int(u["squad"]));
		const std::string p = pid_digits(o ? *o : "");
		if (p.empty()) continue;
		L.acc[p + ":" + (prev->second.r == "wood" ? "gatherWood" : "gatherStone")] += prev->second.n;
	}
	L.was = std::move(seen);
	for (int64_t i = 0; i < bs.size(); i++) {
		const Dictionary b = bs[i];
		const std::string ow = b.has("owner") && b["owner"].get_type() == Variant::STRING ? u8(b["owner"]) : "";
		if (u8(b["state"]) != "done" || b.get("pre", false).booleanize() || ow.empty() || L.up.count(int(b["id"]))) continue;
		L.up.insert(int(b["id"]));
		const std::string p = L.looked ? pid_digits(ow) : "";
		if (!p.empty()) L.acc[p + ":built"] += 1;
	}
	L.looked = true;
}

void Room::lifeMessages(TickOut &out, const std::vector<Dictionary> &evs) {
	RoomLife &L = *life;
	const auto on = [&](int pid) { const auto p = players.find(pid); return p != players.end() && p->second.online; };
	const auto tell = [&](int pid, const Dictionary &m) { out.msgs[pid].push_back(m); };
	Array evArr;
	for (const Dictionary &e : evs) evArr.push_back(e);
	// W-62: guide steps done (the DO pays and stores them), told to the player (RoomGuide.tick)
	{
		std::vector<std::shared_ptr<GuideRun>> runs;
		for (auto &[pid, r] : L.guides) runs.push_back(r);
		for (const auto &r : runs) {
			for (const Dictionary &e : evs)
				if (u8(e["kind"]) == "soulRefused" && u8(e.get("why", "")) == "full" && e.has("owner") && u8(e["owner"]) == r->watch.owner) {
					guide_finish(L, *r, "soul", false); // a full army: nothing to claim (a stranger, W-101: another soul will do)
					break;
				}
			watch_events(r->watch, evs);
			for (const std::string &step : done_now(r->watch, snap).v) guide_finish(L, *r, step, true);
		}
		for (int64_t i = 0; i < L.guideDone.size(); i++) {
			const Dictionary d = L.guideDone[i];
			const int pid = d["pid"];
			if (on(pid)) tell(pid, guide_msg(*guide_save_from(d["save"]), u8(d["step"]), bool(d["paid"])));
		}
	}
	// W-65: story steps done (the DO stores and pays them), told to the player (RoomStories.tick)
	L.storied = Array();
	{
		const StorySnap ss = story_snap(snap);
		const std::vector<StoryEvent> se = story_events(evArr);
		for (auto &[pid, r] : L.stories) {
			const auto notes = r.run->tick(ss, se);
			if (!notes.empty()) L.storyMoved.push_back({ pid, notes });
		}
		const auto moved = std::move(L.storyMoved);
		L.storyMoved.clear();
		for (const auto &[pid, notes] : moved) {
			const auto r = L.stories.find(pid);
			if (r == L.stories.end()) continue;
			const StorySave save = r->second.run->save;
			Dictionary d;
			d["pid"] = pid;
			d["save"] = save_to_dict(save);
			d["goods"] = goods_dict(*r->second.goods);
			d["notes"] = story_notes(notes);
			L.storied.push_back(d);
			r->second.goods->clear();
			if (on(pid)) tell(pid, story_msg(save, &notes));
			if (save.done) L.stories.erase(pid);
		}
	}
	// W-65: random encounters (the DO stores and pays them), told to the player (RoomEncounters.tick)
	L.met = Array();
	{
		const EncSnap es = enc_snap(snap);
		const std::vector<StoryEvent> ee = enc_events(evArr);
		for (int pid : std::vector<int>(L.waiting)) {
			const auto r = L.encs.find(pid);
			if (r == L.encs.end()) continue; // his run starts as he rejoins here: the robbers are patient
			L.waiting.erase(std::find(L.waiting.begin(), L.waiting.end(), pid));
			if (!r->second.run->save.open) {
				const EncounterDef *def = data().encounters.def(data().guide.robbers.id);
				L.encMoved.push_back({ pid, def ? r->second.run->fire(es, *def, std::nullopt) : std::vector<EncNote>{} });
			}
		}
		// W-221: his men fell while he was gone, by whose hand, and what lies there: told once when he is back
		const Array us = snap["units"];
		for (const Dictionary &e : evs) {
			if (u8(e["kind"]) != "fall") continue;
			const auto pid = pid_of_unit(es, int(e["unit"]));
			if (!pid || std::isnan(*pid) || on(int(*pid))) continue;
			const auto r = L.encs.find(int(*pid));
			if (r == L.encs.end()) continue;
			std::string by;
			if (e.has("by") && e["by"].get_type() != Variant::NIL)
				for (int64_t i = 0; i < us.size(); i++)
					if (Dictionary(us[i])["id"] == e["by"]) {
						by = u8(Dictionary(us[i])["cls"]);
						break;
					}
			static const std::regex lead("^\\d+ ");
			std::string line = "Your men fell to " + (by.empty() ? std::string("a foe") : std::regex_replace(foes_word(by, 2), lead, "", std::regex_constants::format_first_only)) + ".";
			if (e.has("dropped") && e["dropped"].get_type() == Variant::DICTIONARY) {
				EncGoods g;
				const Dictionary gd = Dictionary(e["dropped"])["goods"];
				const Array ks = gd.keys();
				for (int64_t i = 0; i < ks.size(); i++) g.push_back({ u8(ks[i]), double(gd[ks[i]]) });
				line += " " + goods_words(g) + " lies where they fell.";
			}
			EncSave &sv = r->second.run->save;
			if (!sv.away || std::find(sv.away->begin(), sv.away->end(), line) == sv.away->end()) keep_away(sv, { line });
			r->second.run->due = true;
		}
		for (auto &[pid, r] : L.encs) {
			const auto notes = r.run->tick(es, ee);
			if (!notes.empty()) L.encMoved.push_back({ pid, notes });
			else if (r.run->due) {
				Dictionary d;
				d["pid"] = pid;
				d["save"] = enc_save_to_dict(r.run->save);
				d["goods"] = Dictionary();
				L.met.push_back(d);
			}
			r.run->due = false;
		}
		const auto moved = std::move(L.encMoved);
		L.encMoved.clear();
		for (const auto &[pid, notes] : moved) {
			const auto r = L.encs.find(pid);
			if (r == L.encs.end()) continue;
			EncSave &sv = r->second.run->save;
			if (!on(pid)) {
				std::vector<std::string> lines;
				for (const EncNote &n : notes)
					if (const auto l = away_line(n, data().encounters.defs)) lines.push_back(*l);
				if (!lines.empty()) keep_away(sv, lines);
			}
			Dictionary d;
			d["pid"] = pid;
			d["save"] = enc_save_to_dict(sv);
			d["goods"] = goods_dict(*r->second.goods);
			d["notes"] = enc_notes(notes);
			L.met.push_back(d);
			r->second.goods->clear();
			if (on(pid)) tell(pid, enc_msg(sv, &notes));
		}
	}
}

void Room::lifeLordMessages(TickOut &out) {
	RoomLife &L = *life;
	if (L.notes.empty()) return;
	for (const auto &[pid, p] : players) {
		if (!p.online) continue;
		Array ev;
		for (const WarlordNote &n : L.notes)
			if (!n.team || *n.team == p.team) ev.push_back(warlord_note_dict(n));
		if (ev.size()) {
			Dictionary m;
			m["t"] = "warlords";
			m["ev"] = ev;
			out.msgs[pid].push_back(m);
		}
	}
}

void Room::lifeFeed(Player &p, std::map<int, std::vector<Dictionary>> &out, Dictionary &lords, std::string &lordKey) {
	RoomLife &L = *life;
	EconomyFeed &feed = *p.feed;
	if (!L.lords || (feed.lordSent && sim.tick % Net::WILD_EVERY != 0)) return;
	if (lords.is_empty()) {
		Array list;
		for (const WarlordSnapOut &w : L.lords->snaps()) list.push_back(warlord_snap_dict(w));
		lords["t"] = "warlords";
		lords["list"] = list;
		lordKey = js_stringify(lords);
	}
	if (feed.lordSent != lordKey) {
		feed.lordSent = lordKey;
		out[p.pid].push_back(lords);
	}
}

// mastery.ts wildDeeds: the tick's deeds of the wild (online: no `self`)
static Array wild_deeds(const Dictionary &s, const std::vector<Dictionary> &evs, std::map<int, std::string> &seen) {
	Array out;
	const Array us = s["units"], qs = s["squads"];
	struct Stand {
		int pid, team;
		std::vector<XY> men;
	};
	std::optional<std::vector<Stand>> men; // a JS Map: insertion order
	const double R2 = js::pow(data().guide.masteryNear, 2);
	const auto near = [&](double x, double y, std::optional<int> team) {
		if (!men) {
			men.emplace();
			for (int64_t i = 0; i < us.size(); i++) {
				const Dictionary u = us[i];
				if (dead(u) || u.get("wounded", false).booleanize() || u8(u["cls"]).rfind("civ_", 0) == 0) continue;
				const int sq = u["squad"];
				if (sq < 0 || sq >= qs.size()) continue;
				const Dictionary q = qs[sq];
				const int pid = pid_of(u8(q.get("owner", "")));
				if (pid < 0) continue;
				auto e = std::find_if(men->begin(), men->end(), [&](const Stand &x) { return x.pid == pid; });
				if (e == men->end()) men->push_back({ pid, int(q["team"]), {} }), e = men->end() - 1;
				e->men.push_back({ u["x"], u["y"] });
			}
		}
		std::vector<int> pids;
		for (const Stand &e : *men) {
			if (team && e.team != *team) continue;
			for (const XY &m : e.men)
				if (js::pow(m.x - x, 2) + js::pow(m.y - y, 2) <= R2) {
					pids.push_back(e.pid);
					break;
				}
		}
		return pids;
	};
	const auto deed = [&](int pid, const char *kind, const Variant &key) {
		Dictionary d;
		d["pid"] = pid;
		d["kind"] = kind;
		d["key"] = key;
		out.push_back(d);
	};
	const Array ls = s.get("lairs", Array());
	for (int64_t i = 0; i < ls.size(); i++) {
		const Dictionary l = ls[i];
		const int id = l["id"];
		const auto was = seen.find(id);
		const std::optional<std::string> w = was == seen.end() ? std::nullopt : std::optional<std::string>(was->second);
		seen[id] = u8(l["state"]);
		if (!w || *w == "cleared" || u8(l["state"]) != "cleared") continue;
		for (int pid : near(l["x"], l["y"], std::nullopt)) deed(pid, "lair", godot::String::num_int64(id));
	}
	for (const Dictionary &e : evs) {
		const std::string k = u8(e["kind"]);
		if (k == "chiefSlain" && int(e["by"]) >= 0)
			for (int pid : near(e["x"], e["y"], int(e["by"]))) deed(pid, "chief", e["chief"]);
		if (k == "secret" && u8(e.get("what", "")) == "done") {
			const int pid = pid_of(u8(e.get("owner", "")));
			if (pid >= 0) deed(pid, "secret", e["quest"]);
		}
	}
	return out;
}

void Room::lifeBooks(TickOut &out, const std::vector<Dictionary> &evs) {
	RoomLife &L = *life;
	out.guided = L.guideDone;
	L.guideDone = Array();
	out.storied = L.storied;
	out.met = L.met;
	out.wild = wild_deeds(snap, evs, L.wildSeen);
	if (sim.tick % Net::LABOUR_EVERY == 0) {
		for (const auto &[k, n] : L.acc) {
			const size_t c = k.find(':');
			out.gathered.push_back(Array::make(std::stod(k.substr(0, c)), gs(k.substr(c + 1)), n));
		}
		L.acc.clear();
	}
}

} // namespace sim
