import { describe, expect, it } from 'vitest';
import { PublicSummaryV1 } from '../../server/src/public/schema';
import fixture from '../src/fixtures/summary.v1.json';

// The landing builds against src/fixtures/summary.v1.json (LAND-04). It was produced by the real game
// Worker (scripts/proxy-e2e.mjs --write-fixture: real routes, the real cron, read through this proxy),
// and this test holds it to the server's strict schema, so a schema change breaks the landing build here.
describe('summary fixture', () => {
  it('passes the server\'s strict PublicSummaryV1 schema (unknown keys rejected)', () => {
    expect(PublicSummaryV1.parse(fixture)).toEqual(fixture);
  });

  it('names only obvious fixture players, never a real one', () => {
    const f = PublicSummaryV1.parse(fixture);
    const names = [
      ...f.duels.live, ...f.duels.async, ...f.war.players, ...f.bossSlayers,
      ...f.champions.war, ...f.champions.duel,
    ].map((r) => r.name);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n).toMatch(/^Fixture/);
  });

  it('fills every board LAND-04 renders', () => {
    const f = PublicSummaryV1.parse(fixture);
    for (const rows of [f.duels.live, f.duels.async, f.war.alliances, f.war.players, f.war.regions, f.bossSlayers, f.bosses, f.champions.war, f.champions.duel]) {
      expect(rows.length).toBeGreaterThan(0);
    }
  });
});
