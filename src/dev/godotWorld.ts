/**
 * The world map's input for the Godot port (docs/impl/godot-port.md P11): a WorldView exactly as the TS world screen
 * gets it from its source (src/war/world-view/source.ts MockSource.view), so the Godot feed (godot/src/world_view/
 * world_feed.gd) reads the same shape the live world (or the C++ LocalWorld) hands it. The mock world of source.ts at a
 * fixed clock; the player plays Elaia (the slice, G-05): his alliance and his one squad of 12 at its home.
 * Written to godot/view/world/fixture.json by scripts/godot/view.mjs (generated, not committed).
 */
import { mockWorld, type WorldView } from '../war/world-view/source';
import { DEFAULT_CAP, splitQuota } from '../war/net/protocol';

/** The fixture's clock: the snapshot's `at` (epoch ms). */
export const FIXTURE_NOW = Date.UTC(2026, 10, 8, 12, 0, 0);

export function worldFixture(now = FIXTURE_NOW): WorldView {
  const w = mockWorld(now);
  w.snap.you = { id: 1, alliance: 3 };
  const squads = [{ region: 'elaia', men: 12, classes: { hoplite: 12 }, ids: [] }];
  return { snap: w.snap, squads, scores: w.scores, endsAt: w.endsAt, quota: splitQuota(DEFAULT_CAP), status: 'offline', convoys: w.convoys, boards: w.boards };
}
