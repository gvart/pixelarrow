/** W-66 the Tunnel of Shades: the floor of 6 living men, one raised every 10 min, lazily from war_tunnel; souls past it. */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { armyCount, claimSoul } from '../../src/war/persons';
import { settleTunnelFor } from '../../src/war/raise';
import { makePerson } from '../../../src/war/sim/roster';
import { TUNNEL } from '../../../src/war/sim/tunnel';
import { ARMY_MAX } from '../../../src/war/sim/soldiers';

const DB = () => env.DB!;
const T0 = 1_900_000_000_000;
const MIN = 60_000;
const soul = (id: string, cls = 'hoplite') => makePerson(`soul-${id}`, cls, { level: 3 });

/** A player whose army of n archers all fell: 0 alive, a tunnel to wait on. */
async function wiped(pidSeed: number, n = 4): Promise<{ token: string; playerId: number }> {
  const me = await devLogin(pidSeed);
  for (let k = 0; k < n; k++) expect(await claimSoul(DB(), me.playerId, soul(`${pidSeed}-${k}`, 'archer'), 'test-ridge', T0 - 60 * MIN)).toBe(true);
  await DB().prepare("UPDATE war_persons SET state = 'dead', updated_at = ?2 WHERE player_id = ?1").bind(me.playerId, T0 - 30 * MIN).run();
  return me;
}

describe('the Tunnel of Shades', () => {
  it('no tunnel before a player ever had a man', async () => {
    const me = await devLogin(7661);
    expect(await settleTunnelFor(DB(), me.playerId, T0)).toMatchObject({ alive: 0, nextAt: null, pending: 0 });
  });

  it('0 men: the clock starts, 1 man after 10 min, then up to 6 and never past it', async () => {
    const me = await wiped(7662);
    const v0 = await settleTunnelFor(DB(), me.playerId, T0);
    expect(v0).toMatchObject({ alive: 0, floor: TUNNEL.floor, nextAt: T0 + 10 * MIN, pending: 6, raised: 0 });
    expect(await settleTunnelFor(DB(), me.playerId, T0 + 9 * MIN)).toMatchObject({ alive: 0, nextAt: T0 + 10 * MIN });
    const v1 = await settleTunnelFor(DB(), me.playerId, T0 + 10 * MIN);
    expect(v1).toMatchObject({ alive: 1, nextAt: T0 + 20 * MIN, pending: 5, raised: 1 });
    // the raised man: level 1, at home, active, starter gear, the class of the fallen
    const man = await DB().prepare("SELECT cls, level, state, region, gear FROM war_persons WHERE player_id = ?1 AND state = 'active'").bind(me.playerId).first<{ cls: string; level: number; state: string; region: string | null; gear: string }>();
    expect(man).toMatchObject({ cls: 'archer', level: 1, state: 'active', region: null });
    expect(JSON.parse(man!.gear)).toEqual(makePerson('x', 'archer').hero.equip);
    // a long absence catches up, but stops at the floor
    const v6 = await settleTunnelFor(DB(), me.playerId, T0 + 5 * 60 * MIN);
    expect(v6).toMatchObject({ alive: 6, nextAt: null, pending: 0, raised: 5 });
    expect(await settleTunnelFor(DB(), me.playerId, T0 + 50 * 60 * MIN)).toMatchObject({ alive: 6, nextAt: null, raised: 0 });
    expect(await armyCount(DB(), me.playerId)).toBe(6);
  });

  it('two racing reads raise a due man once', async () => {
    const me = await wiped(7663);
    await settleTunnelFor(DB(), me.playerId, T0);
    const [a, b] = await Promise.all([settleTunnelFor(DB(), me.playerId, T0 + 10 * MIN), settleTunnelFor(DB(), me.playerId, T0 + 10 * MIN)]);
    expect(a.raised + b.raised).toBe(1);
    expect(await armyCount(DB(), me.playerId)).toBe(1);
  });

  it('souls still join past the floor, up to ARMY_MAX; the tunnel stays quiet above it', async () => {
    const me = await wiped(7664);
    await settleTunnelFor(DB(), me.playerId, T0);
    await settleTunnelFor(DB(), me.playerId, T0 + 60 * MIN);
    expect(await armyCount(DB(), me.playerId)).toBe(6);
    for (let k = 6; k < ARMY_MAX; k++) expect(await claimSoul(DB(), me.playerId, soul(`7664-x${k}`), 'test-ridge', T0 + 61 * MIN)).toBe(true);
    expect(await armyCount(DB(), me.playerId)).toBe(ARMY_MAX);
    expect(await settleTunnelFor(DB(), me.playerId, T0 + 120 * MIN)).toMatchObject({ alive: ARMY_MAX, nextAt: null, pending: 0, raised: 0 });
  });

  it('the wipe state: 0 alive, 6 pending, the first rise 10 min after the read; GET /api/war/tunnel and the roster show it', async () => {
    const me = await wiped(7665, 2);
    const t = await (await api('/api/war/tunnel', { token: me.token })).json<{ alive: number; floor: number; nextAt: number; pending: number }>();
    expect(t).toMatchObject({ alive: 0, floor: 6, pending: 6 });
    expect(t.nextAt).toBeGreaterThan(Date.now() + 9 * MIN);
    const r = await (await api('/api/war/roster', { token: me.token })).json<{ tunnel: { nextAt: number; pending: number } }>();
    expect(r.tunnel).toMatchObject({ nextAt: t.nextAt, pending: 6 });
    expect((await api('/api/war/tunnel')).status).toBe(401);
  });
});
