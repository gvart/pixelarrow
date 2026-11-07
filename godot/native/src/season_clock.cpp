#include "season_clock.h"

#include <algorithm>
#include <cmath>

#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/string.hpp>

#include "sim_data.h"

namespace sim {

static std::string c8(const godot::Variant &v) { return godot::String(v).utf8().get_data(); }
static const SeasonTables &T() { return data().season; }

void load_season_tables(const godot::Dictionary &tables, SeasonTables &out) {
	const auto strs = [](const godot::Array &a) {
		std::vector<std::string> v;
		for (int64_t i = 0; i < a.size(); i++) v.push_back(c8(a[i]));
		return v;
	};
	if (tables.has("src/war/world/season")) {
		const godot::Dictionary s = tables["src/war/world/season"], sc = s["SCORE"], lv = s["LIVING"], hg = s["HEGEMONY"];
		out.OMPHALOS = c8(s["OMPHALOS"]);
		out.FRONTIER_TOWNS = strs(s["FRONTIER_TOWNS"]);
		out.GATES = strs(s["GATES"]);
		out.SCORE = { sc["omphalos"], sc["town"], sc["gate"], sc["neutral"], sc["ruinedTown"] };
		out.LIVING = { lv["landmark"], lv["landmarkCap"], lv["prestigeCap"], lv["sacrilege"] };
		out.HEGEMONY = { hg["towns"], hg["ms"] };
		out.HOUR_MS = s["HOUR_MS"];
	}
	if (tables.has("src/war/world/regions")) {
		const godot::Array rs = godot::Dictionary(tables["src/war/world/regions"])["WORLD_REGIONS"];
		out.WORLD_REGIONS.clear();
		for (int64_t i = 0; i < rs.size(); i++) {
			const godot::Dictionary d = rs[i];
			out.WORLD_REGIONS.push_back({ c8(d["id"]), c8(d["role"]), d.get("alliance", godot::Variant()).get_type() == godot::Variant::NIL ? -1 : int(d["alliance"]) });
		}
	}
	if (tables.has("src/war/world/alliances")) out.ALLIANCES = int(godot::Array(godot::Dictionary(tables["src/war/world/alliances"])["ALLIANCES"]).size());
}

static const SeasonTables::World *worldRegion(const std::string &id) {
	for (const auto &r : T().WORLD_REGIONS)
		if (r.id == id) return &r;
	return nullptr;
}
static bool has(const std::vector<std::string> &v, const std::string &s) { return std::find(v.begin(), v.end(), s) != v.end(); }

double score_rate(const ClockRegion &r) {
	if (r.owner < 0) return 0;
	if (r.id == T().OMPHALOS) {
		for (size_t i = 0; i < r.live.size(); i++)
			if (r.live[i] > 0 && int(i) != r.owner) return 0;
		return T().SCORE.omphalos;
	}
	if (has(T().FRONTIER_TOWNS, r.id)) return r.ruined ? T().SCORE.ruinedTown : T().SCORE.town;
	if (has(T().GATES, r.id)) return T().SCORE.gate;
	const auto *w = worldRegion(r.id);
	return w && w->role == "neutral" ? T().SCORE.neutral : 0;
}

std::vector<double> alliance_rates(const std::vector<ClockRegion> &regions) {
	const size_t n = size_t(T().ALLIANCES);
	std::vector<double> out(n, 0), lm(n, 0), pr(n, 0);
	for (const ClockRegion &r : regions) {
		if (r.owner >= 0 && size_t(r.owner) < n) out[r.owner] += score_rate(r);
		const int h = r.hasLandmark ? r.holder : -1;
		if (r.hasLandmark && r.garrisoned && h >= 0 && size_t(h) < n) lm[h] += T().LIVING.landmark;
		for (size_t i = 0; i < r.prestige.size(); i++)
			if (i < n) pr[i] += r.prestige[i];
	}
	for (size_t i = 0; i < n; i++) out[i] = out[i] + std::min(T().LIVING.landmarkCap, lm[i]) + std::min(T().LIVING.prestigeCap, pr[i]);
	return out;
}

int hegemon(const std::vector<ClockRegion> &regions) {
	int centre = -1;
	std::vector<double> towns(size_t(T().ALLIANCES), 0);
	for (const ClockRegion &r : regions) {
		if (r.id == T().OMPHALOS) centre = r.owner;
		else if (has(T().FRONTIER_TOWNS, r.id) && r.owner >= 0) towns[r.owner]++;
	}
	return centre >= 0 && towns[centre] >= T().HEGEMONY.towns ? centre : -1;
}

SeasonClock::SeasonClock(double start, double lengthMs) : startAt(start), endAt(start + lengthMs), scores(size_t(T().ALLIANCES), 0), accruedAt(start) {
	const size_t n = size_t(T().ALLIANCES);
	for (const auto &r : T().WORLD_REGIONS) regions.push_back({ r.id, r.role == "home" ? r.alliance : -1, std::vector<double>(n, 0), std::vector<double>(n, 0) });
}

double SeasonClock::endsAt() const { return hegemony ? std::min(endAt, hegemony->since + T().HEGEMONY.ms) : endAt; }

std::optional<SeasonEnd> SeasonClock::advance(double now) {
	if (ended) return std::nullopt;
	const double end = endsAt(), to = std::min(now, end);
	if (to > accruedAt) {
		const std::vector<double> rates = alliance_rates(regions);
		const double h = (to - accruedAt) / T().HOUR_MS;
		for (size_t i = 0; i < scores.size(); i++) scores[i] = scores[i] + rates[i] * h;
		accruedAt = to;
	}
	if (now < end) return std::nullopt;
	const int heg = hegemony && hegemony->since + T().HEGEMONY.ms <= endAt ? hegemony->alliance : -1;
	const double best = *std::max_element(scores.begin(), scores.end());
	std::vector<int> top;
	for (size_t i = 0; i < scores.size(); i++)
		if (scores[i] == best) top.push_back(int(i));
	SeasonEnd e;
	e.at = end;
	e.reason = heg >= 0 ? "hegemony" : "time";
	e.winner = heg >= 0 ? heg : top.size() == 1 ? top[0] : -1;
	for (double x : scores) e.scores.push_back(std::floor(x));
	ended = e;
	return ended;
}

void SeasonClock::checkHegemony(double now) {
	if (ended) return;
	const int h = hegemon(regions);
	if (h < 0) hegemony.reset();
	else if (!hegemony || hegemony->alliance != h) hegemony = Hegemony{ h, now };
}

void SeasonClock::report(const std::string &id, const std::vector<double> &rc, const std::vector<double> &rl, double now) {
	const auto *w = worldRegion(id);
	size_t i = 0;
	while (i < regions.size() && regions[i].id != id) i++;
	if (!w || i == regions.size()) return;
	const ClockRegion cur = regions[i];
	advance(now);
	const size_t n = size_t(T().ALLIANCES);
	std::vector<double> claims(n), live(n);
	for (size_t k = 0; k < n; k++) claims[k] = k < rc.size() ? rc[k] : 0, live[k] = k < rl.size() ? rl[k] : 0;
	const double best = *std::max_element(claims.begin(), claims.end());
	std::vector<int> leaders;
	for (size_t k = 0; k < n; k++)
		if (claims[k] == best && claims[k] > 0) leaders.push_back(int(k));
	const int leader = leaders.size() == 1 ? leaders[0] : -1;
	int owner = cur.owner;
	if (w->role == "home") owner = w->alliance;
	else if (leader >= 0) owner = leader;
	regions[i] = { id, owner, claims, live };
	// hegemony reads the owners only: WarWorld's check on any change comes to the same
	if (owner != cur.owner) checkHegemony(now);
}

} // namespace sim
