// The persons in the region sim (src/war/sim/index.ts), line for line: the re-bake after a level-up, the captives' hold,
// the fight results (resultsOf, endFight), the room's person calls (dropPersons, reportPersons, hurtPersons, person,
// setPerson, refreshPerks) and the cargo bridges (cargo).
#include "sim.h"
#include "sim_data.h"
#include "sim_events.h"

namespace sim {

namespace {
constexpr double INF_CAP = std::numeric_limits<double>::infinity();
}

// M5d: a person's new hero after a level-up: baked again (HP keeps its wounds).
void Sim::rebake(Unit &u) {
	const WarStats st = with_perks(war_stats_of(*u.person), fxOf(u.squad->owner));
	u.hp = std::max(1.0, std::min(st.maxHp, u.hp + st.maxHp - u.maxHp));
	u.maxHp = st.maxHp;
	u.st = st;
	u.stKey = st_fresh();
	setRates(u);
	addReslot(*u.squad);
}

// M5e: the nearest building of `team` that holds captives to (x, y), or none.
std::optional<int> Sim::holdOf(int team, double x, double y) {
	std::optional<int> best;
	double bd = INF_CAP;
	for (int id = 0;; id++) {
		const Building *b = works->piece(id);
		if (!b) break;
		if (b->team != team || !holds(b)) continue;
		const double d = works->dist2(id, x, y);
		if (d < bd) bd = d, best = id;
	}
	return best;
}

// M5d: the fight report (WarBuildSim.endFight).
FightReport Sim::endFight() {
	std::vector<PersonResult> persons = resultsOf(units);
	for (Unit *u : units) {
		u->dealt = u->kills = u->obj = 0;
		u->engaged = u->repaired = false;
		u->bossHit.reset(), u->key(Unit::K_BOSSHIT); // TS u.bossHit = undefined: the key stays
	}
	slain.clear();
	for (size_t i = 0; i < reslotQueue.size(); i++) reslot(*reslotQueue[i]);
	reslotQueue.clear();
	FightReport out{ tick, std::move(persons), std::move(loot) };
	loot.clear();
	return out;
}

// The fight results of `of` so far (each person's XP, kills, state); their tallies stay for the caller to clear.
std::vector<PersonResult> Sim::resultsOf(const std::vector<Unit *> &of) {
	const SoldierTables &S = data().soldiers;
	const DeedTables &D = data().deeds;
	std::vector<std::pair<int, int>> took; // team -> its soldiers who took part (a Map: insertion order)
	for (const Unit *u : units)
		if (u->engaged && u->squad->team != MOB_TEAM) {
			auto it = std::find_if(took.begin(), took.end(), [&](const auto &e) { return e.first == u->squad->team; });
			if (it == took.end()) took.emplace_back(u->squad->team, 1);
			else it->second++;
		}
	std::vector<PersonResult> persons;
	for (Unit *up : of) {
		Unit &u = *up;
		if (!u.person || u.reported || u.downAt || (u.alive && !u.engaged && !u.obj && !u.repaired)) continue; // W-79: a man down is not reported yet
		const WarPerson p = *u.person;
		const int team = u.squad->team;
		int foes = 0;
		for (const auto &[tm, n] : took)
			if (tm != team) foes += n;
		std::string state = u.alive ? "fit" : u.wounded ? "wounded" : "dead";
		std::optional<int> captor, fort;
		if (state == "wounded") {
			// captive: no friendly within CAPTURE_R, the nearest foe soldier within it takes him
			bool friendly = false;
			const double R2 = S.CAPTURE_R * S.CAPTURE_R;
			double bd = R2;
			for (const Unit *o : units) {
				if (!o->alive || o->squad->team == MOB_TEAM || o->squad->team == NEUTRAL_TEAM) continue; // W-65: roaming folk take no captives
				const double d2 = js::pow(o->x - u.x, 2) + js::pow(o->y - u.y, 2);
				if (d2 > R2) continue;
				if (o->squad->team == team) {
					friendly = true;
					break;
				}
				if (d2 <= bd) bd = d2, captor = o->squad->team;
			}
			if (friendly) captor.reset();
			if (captor) {
				state = "captive";
				fort = holdOf(*captor, u.x, u.y);
				godot::Dictionary e = ev(tick, "capture");
				e["unit"] = u.id;
				e["pid"] = gstr(p.id);
				e["captor"] = *captor;
				note(e);
				// M6c: his worn kit to a pile at the capture tile (he walks home in a militia tunic)
				std::vector<Item> worn;
				for (const auto &[slot, it] : p.hero.equip) worn.push_back(it);
				piles->drop(u.x, u.y, {}, worn, tick);
			}
		}
		double xp = std::floor(u.dealt * S.XP.perDmg) + u.kills * S.XP.kill + u.obj + (u.alive && foes >= S.SQUAD_MAX ? S.XP.survived : 0);
		if (state == "wounded" || state == "captive") xp = std::floor(xp / 2);
		if (state == "dead") xp = 0;
		int levelUps = 0;
		const HeroXp g = gain_xp(HeroXp{ p.hero.level, p.hero.xp, p.hero.points }, xp, levelUps);
		Hero hero = p.hero;
		hero.level = g.level, hero.xp = g.xp, hero.points = g.points;
		hero.kills = p.hero.kills + u.kills;
		hero.battles = p.hero.battles + (u.engaged ? 1 : 0);
		if (state == "dead" || state == "captive") hero.equip.clear();
		// E3 (deeds.h): what he did, on his record once; a wound that he lived through leaves a scar
		std::vector<Deed> did;
		if (p.hero.kills == 0 && u.kills > 0) did.push_back(plain_deed("firstBlood"));
		if (p.hero.kills < D.DEED.slayer && hero.kills >= D.DEED.slayer) did.push_back(plain_deed("manSlayer"));
		if (u.bossHit)
			for (const std::string &b : *u.bossHit)
				if (std::find(slain.begin(), slain.end(), b) != slain.end()) did.push_back(slayer_deed(b));
		if (state == "fit" && u.engaged && foes > 0) {
			const std::optional<int> f = holdOf(team, u.x, u.y);
			if (f && works->dist2(*f, u.x, u.y) <= D.DEED.gate * D.DEED.gate) did.push_back(plain_deed("heldGate"));
		}
		if (state == "wounded") did.push_back(plain_deed("survivor"));
		const bool scar = state == "wounded";
		std::vector<Deed> all, fresh;
		add_deeds(p.deeds ? *p.deeds : std::vector<Deed>{}, did, all, fresh);
		WarPerson q = p;
		q.hero = hero;
		if (!all.empty()) q.deeds = all;
		if (scar) q.scars = std::min(D.SCARS_MAX, (p.scars ? *p.scars : 0) + 1);
		u.person = q;
		if (levelUps) {
			godot::Dictionary e = ev(tick, "levelUp");
			e["unit"] = u.id;
			e["pid"] = gstr(p.id);
			e["level"] = hero.level;
			note(e);
		}
		if (levelUps && u.alive) rebake(u);
		if (!u.alive) u.reported = true;
		PersonResult r;
		r.pid = p.id, r.owner = u.squad->owner, r.team = team, r.state = state, r.captor = captor, r.fort = fort;
		r.xp = xp, r.kills = u.kills, r.dmg = js::round(u.dealt), r.levelUps = levelUps, r.hero = hero;
		r.deeds = fresh, r.scar = scar;
		persons.push_back(std::move(r));
	}
	// E3 Last man standing: the only one of his team in the report (DEED.last or more of them) to walk off fit
	std::vector<std::pair<int, std::vector<PersonResult *>>> byTeam; // a Map: insertion order
	for (PersonResult &x : persons) {
		auto it = std::find_if(byTeam.begin(), byTeam.end(), [&](const auto &e) { return e.first == x.team; });
		if (it == byTeam.end()) byTeam.push_back({ x.team, { &x } });
		else it->second.push_back(&x);
	}
	for (auto &[tm, xs] : byTeam) {
		std::vector<PersonResult *> fit;
		for (PersonResult *x : xs)
			if (x->state == "fit") fit.push_back(x);
		if (double(xs.size()) < D.DEED.last || fit.size() != 1) continue;
		PersonResult &x = *fit[0];
		Unit *live = nullptr;
		for (Unit *m : units)
			if (m->person && m->person->id == x.pid) {
				live = m;
				break;
			}
		if (!live || !live->person) continue;
		std::vector<Deed> all, fresh;
		add_deeds(live->person->deeds ? *live->person->deeds : std::vector<Deed>{}, { plain_deed("lastStanding") }, all, fresh);
		if (fresh.empty()) continue;
		live->person->deeds = all;
		x.deeds.insert(x.deeds.end(), fresh.begin(), fresh.end());
	}
	return persons;
}

// a resumed region whose save predates a fight write-back: men D1 has already sent home leave without a report
void Sim::dropPersons(const std::vector<std::string> &ids) {
	const std::set<std::string> gone(ids.begin(), ids.end());
	for (Unit *u : units) {
		if (!u->alive || !u->person || !gone.count(u->person->id)) continue;
		u->alive = false;
		u->hp = 0;
		u->reported = true;
		u->squad->alive--;
		u->tgt = nullptr;
		if (!u->job.empty()) works->set_job(*u, "");
		addReslot(*u->squad);
	}
	for (size_t i = 0; i < reslotQueue.size(); i++)
		if (reslotQueue[i]->alive > 0) reslot(*reslotQueue[i]);
	reslotQueue.clear();
}

// M4: these living men leave mid-fight (a transfer): their fight so far, reported now, tallies cleared
std::vector<PersonResult> Sim::reportPersons(const std::vector<std::string> &ids) {
	const std::set<std::string> of(ids.begin(), ids.end());
	std::vector<Unit *> sel;
	for (Unit *u : units)
		if (u->alive && u->person && of.count(u->person->id)) sel.push_back(u);
	std::vector<PersonResult> out = resultsOf(sel);
	for (Unit *u : sel) {
		u->dealt = u->kills = u->obj = 0;
		u->engaged = u->repaired = false;
		u->bossHit.reset(), u->key(Unit::K_BOSSHIT);
	}
	for (size_t i = 0; i < reslotQueue.size(); i++) reslot(*reslotQueue[i]);
	reslotQueue.clear();
	return out;
}

// M4: men arriving from another region come in with the hit points they left with
void Sim::hurtPersons(const std::vector<std::pair<std::string, double>> &lost) {
	for (Unit *u : units) {
		if (!u->alive || !u->person) continue;
		const auto it = std::find_if(lost.begin(), lost.end(), [&](const auto &e) { return e.first == u->person->id; });
		if (it != lost.end() && it->second > 0) u->hp = std::max(1.0, std::min(u->hp, u->maxHp - it->second));
	}
}

void Sim::refreshPerks(const std::string &owner) {
	for (Unit *u : units)
		if (u->alive && u->person && u->squad->owner == owner) rebake(*u);
}

const WarPerson *Sim::person(const std::string &id) const {
	for (const Unit *u : units)
		if (u->alive && u->person && u->person->id == id) return &*u->person;
	return nullptr;
}

bool Sim::setPerson(const WarPerson &p) {
	Unit *u = nullptr;
	for (Unit *x : units)
		if (x->alive && x->person && x->person->id == p.id) {
			u = x;
			break;
		}
	if (!u) return false;
	u->person = p;
	rebake(*u);
	for (size_t i = 0; i < reslotQueue.size(); i++) reslot(*reslotQueue[i]);
	reslotQueue.clear();
	return true;
}

// M6e-M6i (server bridges): live holds the server moves goods in and out of (stalls, hand-offs, transits)
std::optional<CargoAt> Sim::cargo(const CargoRef &ref) {
	if (ref.reserve) return CargoAt{ { CargoSlot{ &works->reserve_of(*ref.reserve), INF_CAP, -1, -1 } }, *ref.reserve, "" };
	if (ref.building) {
		const Building *b = works->piece(*ref.building);
		Hold *hd = works->hold_of(*ref.building);
		if (!b || !hd) return std::nullopt;
		const double cap = b->def->chest ? b->def->chest + townLv->perk_at(b->team, b->x, b->y).store : INF_CAP;
		return CargoAt{ { CargoSlot{ hd, cap, b->x, b->y } }, b->team, b->owner };
	}
	if (ref.cart) {
		SiegeEngine *e = siege->get(*ref.cart);
		if (!e || !e->hold || e->state == "destroyed") return std::nullopt;
		return CargoAt{ { CargoSlot{ &*e->hold, siege->cart_cap(e->id), e->x, e->y } }, e->team, e->owner };
	}
	std::optional<std::set<std::string>> want;
	if (ref.persons) want.emplace(ref.persons->begin(), ref.persons->end());
	std::vector<Unit *> men;
	for (Unit *u : units)
		if (u->alive && (want ? u->person && want->count(u->person->id) : ref.squad && u->squad->id == *ref.squad)) men.push_back(u);
	if (men.empty()) return std::nullopt;
	CargoAt out{ {}, men[0]->squad->team, men[0]->squad->owner };
	for (Unit *u : men) {
		if (!u->pack) u->pack = new_hold();
		out.slots.push_back(CargoSlot{ &*u->pack, data().trade.PORTER.loads, u->x, u->y });
	}
	return out;
}

} // namespace sim
