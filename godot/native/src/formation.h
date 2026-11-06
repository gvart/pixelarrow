// Formation slots (src/war/sim/formation.ts), line for line.
#pragma once

#include <cmath>
#include <vector>

#include "rng.h"

namespace sim {

enum class Shape { Line, Column, Wedge, Loose };

// Slot offsets in tiles for n units as flat [forward, right, ...] pairs in the squad's frame, centred on the anchor.
inline std::vector<double> formation_offsets(Shape shape, int n, Mulberry &rng) {
	std::vector<double> out;
	if (shape == Shape::Wedge) {
		for (int rank = 0, i = 0; i < n; rank++) {
			const int left = n - i;
			const int in_rank = left - (rank + 1) < rank + 2 ? left : rank + 1;
			for (int k = 0; k < in_rank; k++, i++) {
				out.push_back(-double(rank) * 0.9); // -0 for rank 0, as JS (an int -0 is +0)
				out.push_back(k - (in_rank - 1) / 2.0);
			}
		}
	} else {
		const int cols = shape == Shape::Column ? (n < 2 ? n : 2) : (n + 1) / 2;
		const double gap = shape == Shape::Loose ? 1.8 : 1;
		for (int i = 0; i < n; i++) {
			const int rank = i / cols;
			const int in_rank = cols < n - rank * cols ? cols : n - rank * cols;
			double f = -double(rank) * gap;
			double r = ((i % cols) - (in_rank - 1) / 2.0) * gap;
			if (shape == Shape::Loose) {
				f += -0.3 + (0.3 - -0.3) * rng.next();
				r += -0.3 + (0.3 - -0.3) * rng.next();
			}
			out.push_back(f);
			out.push_back(r);
		}
	}
	double mf = 0;
	for (size_t i = 0; i < out.size(); i += 2) mf += out[i];
	mf /= n;
	for (size_t i = 0; i < out.size(); i += 2) out[i] -= mf;
	return out;
}

} // namespace sim
