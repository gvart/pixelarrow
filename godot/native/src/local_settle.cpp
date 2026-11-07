// P8 wave C round LocalRoom: what server/src/war/regionDO.ts does round the settlements and politics, as
// src/dev/vectors/room.ts TsLocal does it (the room vectors replay it): the region's settlements, oaths and pacts polled
// into the room and each open socket's view sent when it changed; a fresh field's settlements laid down again; the
// reports and tithes; the peace poll (guards, the home's works, every alliance's bonuses, the levels); and each tick's
// books (favour.ts favourTick and builtFavour, the works' labour, the camps that found, attacks, claims being taken).
#include "local_room.h"

#include <cmath>

#include "js_json.h"

namespace godot {

namespace {

std::string S(const Variant &v) { return String(v).utf8().get_data(); }
String G(const std::string &s) { return String::utf8(s.c_str()); }
std::optional<double> onum(const Variant &v) { return v.get_type() == Variant::NIL ? std::nullopt : std::optional<double>(double(v)); }
Array arr(const Dictionary &d, const char *k) { return d.get(k, Array()); }
int pid_of(const std::string &o) { // /^p:(\d+)$/
	if (o.size() < 3 || o.compare(0, 2, "p:") != 0) return -1;
	for (size_t i = 2; i < o.size(); i++)
		if (o[i] < '0' || o[i] > '9') return -1;
	return std::stoi(o.substr(2));
}

struct Standing {
	int pid = 0, team = 0;
	std::vector<std::pair<double, double>> men;
};
// favour.ts standing: players with living fighters in the snapshot (in the units' order)
std::vector<Standing> standing(const Dictionary &s) {
	std::vector<Standing> out;
	const Array us = s["units"], qs = s["squads"];
	for (int64_t i = 0; i < us.size(); i++) {
		const Dictionary u = us[i];
		if (S(u["state"]) == "dead" || S(u["cls"]).rfind("civ_", 0) == 0) continue;
		const int sq = u["squad"];
		if (sq < 0 || sq >= qs.size()) continue;
		const Dictionary q = qs[sq];
		const int pid = pid_of(S(q.get("owner", "")));
		if (pid < 0) continue;
		auto e = std::find_if(out.begin(), out.end(), [&](const Standing &x) { return x.pid == pid; });
		if (e == out.end()) out.push_back({ pid, int(q["team"]), {} }), e = out.end() - 1;
		e->men.push_back({ double(u["x"]), double(u["y"]) });
	}
	return out;
}

} // namespace

using T = sim::SettleTables;

void LocalRoom::loadSettlements() {
	auto &s = store->politics();
	const std::string region = S(sim->meta["id"]);
	room->setSettlements(s.regionSettlements(region));
	room->setOaths(s.sworn());
	std::vector<sim::PactIn> pacts;
	for (const auto &p : s.pactsOf())
		if (!p.endsAt || *p.endsAt > now()) pacts.push_back({ p.a, p.b, p.kind });
	room->setPacts(pacts);
	for (int p : conns)
		if (live.count(p) && settleSent.count(p)) sendSettlements(p);
}

void LocalRoom::sendSettlements(int p, bool fresh) {
	const Array list = room->settlementsFor(p);
	const std::string k = sim::js_stringify(list);
	const auto at = settleSent.find(p);
	if (!fresh && at != settleSent.end() && at->second == k) return;
	settleSent[p] = k;
	if (!live.count(p)) return;
	Dictionary m;
	m["t"] = "settlements", m["list"] = list;
	tell(p, m);
}

void LocalRoom::restoreSettlements() {
	auto &s = store->politics();
	const std::string region = S(sim->meta["id"]);
	const auto rows = s.persisted(region);
	if (rows.empty()) return;
	const auto list = s.regionSettlements(region);
	std::vector<std::pair<int, int>> moved;
	for (const auto &[id, text] : rows) {
		const auto st = std::find_if(list.begin(), list.end(), [&](const sim::RoomSettle &x) { return x.id == id; });
		bool ok = false;
		const Variant v = sim::js_parse(text, ok);
		const Array pieces = ok && v.get_type() == Variant::DICTIONARY ? arr(v, "pieces") : Array();
		if (st == list.end() || !st->team || !pieces.size()) continue;
		const auto centre = room->restorePieces(*st->team, st->x, st->y, st->r, pieces);
		if (centre) moved.push_back({ st->id, *centre });
	}
	s.rekey(region, moved);
}

void LocalRoom::reportSettlements(bool all) {
	const Array rs = room->settlementReports();
	for (int64_t i = 0; i < rs.size(); i++) {
		const Dictionary x = rs[i];
		const int id = x["id"];
		const std::string p = sim::js_stringify(x["persist"]);
		const auto at = persistSent.find(id);
		const bool fresh = all || at == persistSent.end() || at->second != p;
		const double level = x["level"];
		store->politics().report(id, level > 0 ? std::optional<double>(level) : std::nullopt, fresh ? std::optional<std::string>(p) : std::nullopt, x["tended"], now());
		persistSent[id] = p;
	}
}

void LocalRoom::reportTithes() {
	const Array rows = room->titheReports();
	const std::string key = sim::js_stringify(rows);
	if (key == heldKey) return;
	store->politics().reportHeld(S(sim->meta["id"]), rows);
	heldKey = key;
}

void LocalRoom::pollPeace() {
	auto &s = store->politics();
	const std::string region = S(sim->meta["id"]);
	room->setGuards(s.guardsIn(region));
	for (int a = 0; T::allianceName(a); a++)
		if (region == T::allianceHome(a)) {
			room->setWorks(a, s.openWorks(a));
			break;
		}
	const auto b = s.bonusesOf();
	for (int a = 0; T::allianceName(a); a++) {
		const auto at = std::find_if(b.begin(), b.end(), [&](const auto &x) { return x.first == a; });
		sim->s->setBonus(a, at != b.end() ? at->second : sim::Sim::TeamBonus{});
	}
	const auto players = room->pathPlayers();
	if (!players.empty())
		for (const auto &[p, level] : s.levelsOf(players)) room->setLevel(p, level);
}

void LocalRoom::politics(const sim::Room::TickOut &res) {
	auto &s = store->politics();
	const std::string region = S(sim->meta["id"]);
	const double t = now();
	const int tick = room->currentTick();
	const Dictionary snap = room->snapshot();
	// favourTick (W-66): lairs cleared, land held
	{
		const Array lairs = arr(snap, "lairs");
		std::optional<std::vector<Standing>> men;
		for (int64_t i = 0; i < lairs.size(); i++) {
			const Dictionary l = lairs[i];
			const int id = l["id"];
			const std::string state = S(l["state"]);
			const auto was = lairsSeen.find(id);
			const bool had = was != lairsSeen.end();
			const std::string before = had ? was->second : "";
			lairsSeen[id] = state;
			if (!had || before == "cleared" || state != "cleared" || room->townBandIs(id)) continue;
			if (!men) men = standing(snap);
			const double lx = l["x"], ly = l["y"];
			for (const Standing &e : *men)
				if (std::any_of(e.men.begin(), e.men.end(), [&](const auto &m) { return (m.first - lx) * (m.first - lx) + (m.second - ly) * (m.second - ly) <= T::LAIR_NEAR * T::LAIR_NEAR; }))
					s.addFavour(e.pid, T::EARN_LAIR, "lair", t);
		}
	}
	if (tick % T::LAND_TICKS == 7) { // landFavour
		std::vector<std::pair<int, double>> held;
		const Array claims = arr(snap, "claims");
		for (int64_t i = 0; i < claims.size(); i++) {
			const Dictionary c = claims[i];
			const int team = c["team"];
			if (S(c["state"]) != "claimed" || team < 0) continue;
			auto h = std::find_if(held.begin(), held.end(), [&](const auto &x) { return x.first == team; });
			if (h == held.end()) held.push_back({ team, 0 }), h = held.end() - 1;
			h->second++;
		}
		double most = 0;
		for (const auto &[team, n] : held) most = std::max(most, n);
		int owner = -1, tied = 0;
		for (const auto &[team, n] : held)
			if (n == most) owner = team, tied++;
		if (!(most > 0 && tied == 1)) owner = -1;
		for (const Standing &e : standing(snap)) {
			const auto h = std::find_if(held.begin(), held.end(), [&](const auto &x) { return x.first == e.team; });
			const double n = std::min(T::EARN_LAND_CLAIMS_CAP, h != held.end() ? h->second : 0.0) * T::EARN_LAND_CLAIM + (e.team == owner ? T::EARN_LAND_REGION : 0);
			if (n > 0) s.addFavour(e.pid, n, "land", t);
		}
	}
	if (!res.peace.is_empty()) {
		const Array works = arr(res.peace, "works"), labour = arr(res.peace, "labour"), jobs = arr(res.peace, "townJobs");
		std::vector<std::pair<int, double>> secs;
		for (int64_t i = 0; i < labour.size(); i++) secs.push_back({ int(Dictionary(labour[i])["pid"]), double(Dictionary(labour[i])["secs"]) });
		for (int64_t i = 0; i < works.size(); i++) {
			const Dictionary w = works[i], by = w["by"];
			std::vector<std::pair<int, double>> v;
			const Array ks = by.keys();
			for (int64_t k = 0; k < ks.size(); k++) v.push_back({ S(ks[k]) == "" ? 0 : std::stoi(S(ks[k])), double(by[ks[k]]) });
			s.addLabour(w["team"], S(w["work"]), v, t);
			secs.insert(secs.end(), v.begin(), v.end());
		}
		for (int64_t i = 0; i < jobs.size(); i++) secs.push_back({ int(Dictionary(jobs[i])["pid"]), double(Dictionary(jobs[i])["secs"]) * T::LABOUR_FAVOUR });
		// builtFavour: owed in lumps of BUILT_LUMP, the players in the order first touched
		std::vector<int> touched;
		for (const auto &[p, n] : secs) {
			builtOwed[p] += n * T::EARN_BUILT;
			if (std::find(touched.begin(), touched.end(), p) == touched.end()) touched.push_back(p);
		}
		for (int p : touched) {
			const double have = builtOwed[p];
			if (have < T::BUILT_LUMP) continue;
			const double pay = std::floor(have);
			builtOwed[p] = have - pay;
			s.addFavour(p, pay, "built", t);
		}
	}
	if (tick % 300 == 1) pollPeace(); // PEACE_POLL
	const Dictionary &st = res.settle;
	const Array found = arr(st, "found"), attacks = arr(st, "attacks"), taking = arr(st, "taking");
	if (found.size()) {
		const bool home = [&] {
			for (int a = 0; T::allianceName(a); a++)
				if (region == T::allianceHome(a)) return true;
			return false;
		}();
		const auto refusal = [&](double x, double y, double r) -> std::string { // settlements.ts foundRefusal
			const Dictionary sn = room->snapshot();
			if (home) return "Not in a home region";
			const Array cs = arr(sn, "claims"), bs = arr(sn, "buildings");
			for (int64_t i = 0; i < cs.size(); i++)
				if (std::hypot(double(Dictionary(cs[i])["x"]) - x, double(Dictionary(cs[i])["y"]) - y) <= r) return "Too near a claim point";
			for (int64_t i = 0; i < bs.size(); i++) {
				const Dictionary b = bs[i];
				if (b.get("pre", false).booleanize() && std::hypot(double(b["x"]) - x, double(b["y"]) - y) <= r) return b.get("landmark", false).booleanize() ? "Too near a landmark" : "Too near a town";
			}
			return "";
		};
		for (int64_t i = 0; i < found.size(); i++) {
			const Dictionary f = found[i];
			const auto got = s.found(region, f["centre"], f["x"], f["y"], f["lord"], refusal, t);
			if (const auto *why = std::get_if<std::string>(&got)) {
				Dictionary m;
				m["t"] = "crownNews", m["kind"] = "noFounding", m["text"] = G("Your camp stands, but it founds no settlement. " + *why + "."), m["region"] = G(region);
				s.notify({ int(f["lord"]) }, m);
			}
		}
		loadSettlements();
	}
	for (int64_t i = 0; i < attacks.size(); i++) {
		const Dictionary a = attacks[i];
		const int by = a["by"], victim = a["victim"];
		const auto l = s.logAttack(by, victim, t);
		std::string name;
		for (const auto &x : s.regionSettlements(region))
			if (x.id == victim) {
				name = x.name;
				break;
			}
		if (!l.tell.empty()) {
			Array broken;
			for (int b : l.broken) broken.push_back(b);
			Dictionary m;
			m["t"] = "settlementAttacked", m["settlement"] = victim, m["name"] = G(name), m["region"] = G(region), m["by"] = by, m["broken"] = broken;
			s.notify(l.tell, m);
		}
		const auto p = s.pactAttack(by, victim, t);
		if (!p.tell.empty()) {
			Dictionary m;
			m["t"] = "crownNews", m["kind"] = "pactBroken", m["text"] = G(p.text), m["region"] = G(region);
			s.notify(p.tell, m);
		}
	}
	for (int64_t i = 0; i < taking.size(); i++) {
		const Dictionary c = taking[i];
		const auto pids = s.membersOf(c["holder"]);
		if (pids.empty()) continue;
		Dictionary m;
		m["t"] = "claimAttacked", m["region"] = G(region), m["name"] = sim->meta["name"], m["point"] = c["point"], m["by"] = c["by"];
		s.notify(pids, m);
	}
	if (tick % 100 == 3) { // SETTLE_POLL
		loadSettlements();
		if (tick % 600 == 3) reportSettlements(false), reportTithes(); // SETTLE_REPORT
	}
}

void LocalRoom::settleReset() {
	settleSent.clear();
	persistSent.clear();
	heldKey.clear();
	lairsSeen.clear();
	builtOwed.clear();
}

bool LocalRoom::settleOp(const std::string &op, const Array &a, Variant &res) {
	auto &s = store->politics();
	const std::string region = S(sim->meta["id"]);
	if (op == "ally") return s.ally(a[0], a[1], S(a[2])), true;
	if (op == "settlement") {
		Dictionary d;
		d["region"] = G(region), d["tendedAt"] = 0, d["level"] = 0, d["overlord"] = Variant(), d["tribute"] = 0, d["persist"] = "{}";
		d.merge(a[0], true);
		return res = s.addSettlement(d), true;
	}
	if (op == "member") {
		std::optional<sim::Plot> plot;
		if (a[3].get_type() == Variant::DICTIONARY) {
			const Dictionary p = a[3];
			plot = sim::Plot{ p["x0"], p["y0"], p["x1"], p["y1"] };
		}
		return s.addMember(a[0], a[1], S(a[2]), plot, now()), true;
	}
	if (op == "oath") return s.swear(a[0], a[1], onum(a[2])), true;
	if (op == "pact") return res = s.addPact(a[0], a[1], S(a[2]), onum(a[3])), true;
	if (op == "order") return res = s.addOrder(a[0], S(a[1]), S(a[2]), a[3]), true;
	if (op == "guard") {
		const Dictionary g = a[0];
		return s.addGuard(region, { g["id"], g["team"], g["taker"], g["men"] }), true;
	}
	if (op == "giveWork") return s.giveWork(a[0], S(a[1]), sim::cost_from(a[2])), true;
	if (op == "townJob") {
		const Dictionary j = a[0];
		return room->watchTownJob({ j["id"], j["pid"], j["x"], j["y"] }), true;
	}
	if (op == "endTownJob") return room->unwatchTownJob(a[0]), true;
	if (op == "fresh") return restoreSettlements(), loadSettlements(), true; // ensure() on a fresh room
	if (op == "poll") return loadSettlements(), true;
	if (op == "peacePoll") return pollPeace(), true;
	if (op == "report") {
		reportSettlements(true), reportTithes();
		Dictionary r;
		r["reports"] = room->settlementReports(), r["tithes"] = room->titheReports();
		return res = r, true;
	}
	if (op == "presence") return res = room->presence(a[0], a[1]), true;
	if (op == "storeGoods") return res = room->storeGoods(a[0]), true;
	return false;
}

void LocalRoom::settleConstants(Dictionary &c) { c.merge(T::constants(), true); }

} // namespace godot
