#include "honours.h"

#include <map>

#include "sim_data.h"

namespace sim {

std::vector<std::pair<std::string, Honour>> honours_of(const std::vector<HonourPerson> &persons, const HonourContext &ctx) {
	// counts per team: only summed, so the order of a std::map cannot show
	std::map<int, double> took, fell;
	for (const HonourPerson &x : persons) {
		took[x.team] += 1;
		if (x.state != "fit") fell[x.team] += 1;
	}
	const auto foes = [&](int team) {
		double a = 0;
		for (const auto &[t, n] : took) a += t == team ? 0 : n;
		return a;
	};
	const auto foe_fell = [&](int team) {
		double a = 0;
		for (const auto &[t, n] : fell) a += t == team ? 0 : n;
		return a;
	};
	const auto won = [&](int team) {
		const double f = foes(team);
		const auto fi = fell.find(team);
		return f > 0 && (fi != fell.end() ? fi->second : 0) / took.at(team) < foe_fell(team) / f;
	};
	const double squad_max = data().soldiers.SQUAD_MAX;
	std::vector<std::pair<std::string, Honour>> out;
	const auto set = [&](const std::string &pid, Honour h) {
		for (auto &e : out)
			if (e.first == pid) {
				e.second = std::move(h);
				return;
			}
		out.emplace_back(pid, std::move(h));
	};
	for (const HonourPerson &x : persons) {
		if (x.state == "dead" || x.state == "captive") continue;
		const bool fit = x.state == "fit";
		if (ctx.stormed.count(x.team)) set(x.pid, { "Took the fort at " + ctx.region, "dmg" });
		else if (fit && ctx.chokepoint && ctx.has_holder && ctx.holder == x.team && won(x.team) && foes(x.team) >= squad_max / 2) set(x.pid, { "Held " + ctx.region, "block" });
		else if (fit && won(x.team) && foes(x.team) >= squad_max) set(x.pid, { "Veteran of " + ctx.region, "hp" });
	}
	return out;
}

} // namespace sim
