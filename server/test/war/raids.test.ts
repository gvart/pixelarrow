/** M5e captives held at forts, freed by raids (server/src/war/persons.ts applyFight, freeRaided, releaseRegion). */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { applyFight, CAPTIVE_MS, claimForJoin, freeRaided, HEAL, HOLD_MAX, releaseRegion, type PersonRow } from '../../src/war/persons';
import type { FightReport, PersonResult } from '../../../src/war/types';

const DB = () => env.DB!;
const REGION = 'test-ridge';
const row = (id: string) => DB().prepare('SELECT * FROM war_persons WHERE id = ?1').bind(id).first<PersonRow>();
const post = (token: string, path: string, json: unknown = {}) => api(`/api/war${path}`, { method: 'POST', token, json });

/** The player's squad taken captive by team 1 in one fight, held at `forts[i]` (undefined: no fort). */
async function captured(me: { playerId: number; token: string }, foe: { playerId: number }, forts: (number | undefined)[], fightId: string, now = Date.now()) {
  await post(me.token, '/dev/seed', {});
  const ids = ((await DB().prepare("SELECT id FROM war_persons WHERE player_id = ?1 AND state = 'active' ORDER BY slot").bind(me.playerId).all<{ id: string }>()).results).map((r) => r.id).slice(0, forts.length);
  const got = await claimForJoin(DB(), me.playerId, REGION, [ids], new Set(), now);
  if (typeof got === 'string') throw new Error(got);
  const report: FightReport = {
    tick: 10,
    persons: [
      ...got[0].map((p, i): PersonResult => ({ pid: p.id, owner: `p:${me.playerId}`, team: 0, state: 'captive', captor: 1, ...(forts[i] !== undefined ? { fort: forts[i] } : {}), xp: 0, kills: 0, dmg: 0, levelUps: 0, hero: p.hero })),
      { pid: 'ghost', owner: `p:${foe.playerId}`, team: 1, state: 'fit', xp: 0, kills: 0, dmg: 0, levelUps: 0, hero: got[0][0].hero },
    ],
    loot: {},
  };
  expect(await applyFight(DB(), fightId, REGION, report, now)).toBe(true);
  return ids;
}

describe('captives held at a fort', () => {
  it('a raid on a fort frees the captives held there (home, wounded); others stay; repeating it changes nothing', async () => {
    const me = await devLogin(7811), foe = await devLogin(7812);
    const now = Date.now();
    const [a, b, c] = await captured(me, foe, [3, 3, 7], 'raid:f:1', now - 1000);
    expect(await row(a)).toMatchObject({ state: 'captive', held_at: REGION, held_fort: 3, captor_pid: foe.playerId });
    expect(await freeRaided(DB(), REGION, [3, 3], now)).toBe(2);
    for (const id of [a, b]) expect(await row(id)).toMatchObject({ state: 'wounded', until_at: now + HEAL.field, player_id: me.playerId, captor: null, captor_pid: null, held_at: null, held_fort: null });
    expect(await row(c)).toMatchObject({ state: 'captive', held_fort: 7 });
    expect(await freeRaided(DB(), REGION, [3], now)).toBe(0);
    expect(await freeRaided(DB(), 'elsewhere', [7], now)).toBe(0);
    // a man taken after the raid (a retried write) stays held
    await DB().prepare('UPDATE war_persons SET until_at = ?2 WHERE id = ?1').bind(c, now + 5000 + CAPTIVE_MS).run();
    expect(await freeRaided(DB(), REGION, [7], now)).toBe(0);
    expect(await freeRaided(DB(), REGION, [7], now + 5000)).toBe(1);
  });

  it(`a fort holds ${HOLD_MAX}; the rest go free, wounded; no fort: held, but no raid frees him`, async () => {
    const me = await devLogin(7813), foe = await devLogin(7814);
    for (let k = 0; k < HOLD_MAX - 1; k++)
      await DB().prepare("INSERT INTO war_persons (id, player_id, state, held_at, held_fort, until_at) VALUES (?1, ?2, 'captive', ?3, 5, ?4)").bind(`full-${k}`, foe.playerId, REGION, Date.now() + CAPTIVE_MS).run();
    const [a, b, c] = await captured(me, foe, [5, 5, undefined], 'raid:f:2');
    expect(await row(a)).toMatchObject({ state: 'captive', held_fort: 5 });
    expect(await row(b)).toMatchObject({ state: 'wounded', held_fort: null, captor_pid: null });
    expect(await row(c)).toMatchObject({ state: 'captive', held_fort: null, held_at: REGION });
    // a fresh room: its forts are gone, their captives go free; the one held nowhere stays
    await releaseRegion(DB(), REGION);
    expect(await row(a)).toMatchObject({ state: 'wounded', held_at: null });
    expect(await row(c)).toMatchObject({ state: 'captive' });
  });
});
