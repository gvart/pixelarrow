import { describe, expect, it } from 'vitest';
import { ELEV, FOG_ELEV, ROW_H, TILE_W, baseHexAt, boardBounds, clampCenter, drawOrder, fromUnit, hexBase, hexTop, inTile, inTopFace, pickHex, shardHexes, zoomLimits } from '../src/online/board';
import { hexDistance, hexId, hexToPixel, HEX_DIRS, SHARD_RADIUS, type Axial, type HexType } from '../src/online/hex';
import { LiveArmies, allSteps, poseOf, sightSteps } from '../src/online/liveArmies';
import { planMarch, type PlanHex } from '../src/online/marchPlan';
import { hexActions, type ActInput } from '../src/online/hexActions';
import { ONLINE_RULES } from '../src/online/rules';
import { demoShard } from '../src/online/demoShard';
import type { LiveArmyMsg } from '../src/online/protocol';

describe('war-table board projection', () => {
  it('puts hex centres on whole pixels and rows half a tile apart', () => {
    expect(hexBase(0, 0)).toEqual({ x: 0, y: 0 });
    expect(hexBase(1, 0)).toEqual({ x: TILE_W, y: 0 });
    expect(hexBase(0, 1)).toEqual({ x: TILE_W / 2, y: ROW_H });
    expect(hexTop(2, -3, 9)).toEqual({ x: 2 * TILE_W - 1.5 * TILE_W, y: -3 * ROW_H - 9 });
    // the board is an affine image of the true hex grid
    for (const h of [{ q: 0, r: 0 }, { q: 4, r: -2 }, { q: -7, r: 5 }]) {
      const u = hexToPixel(h, 1);
      const b = fromUnit(u.x, u.y);
      expect(b.x).toBeCloseTo(hexBase(h.q, h.r).x, 6);
      expect(b.y).toBeCloseTo(hexBase(h.q, h.r).y, 6);
    }
  });

  it('round-trips ground-level picking for every hex of a shard', () => {
    for (const h of shardHexes(8)) {
      const c = hexBase(h.q, h.r);
      expect(baseHexAt(c.x, c.y)).toEqual(h);
      expect(baseHexAt(c.x + 9, c.y + 2)).toEqual(h);
    }
  });

  it('tops and side faces: what a tile covers', () => {
    expect(inTopFace(0, 0)).toBe(true);
    expect(inTopFace(13, 0)).toBe(true);
    expect(inTopFace(0, 9.5)).toBe(true);
    expect(inTopFace(13, 9)).toBe(false); // outside the lower right edge
    expect(inTile(0, 14, 6)).toBe(true); // the front side face of a 6 px tile
    expect(inTile(0, 17, 6)).toBe(false);
    expect(inTile(0, -12, 13)).toBe(false); // nothing above the top face
  });

  it('picks the raised tile drawn on top, the fog parchment only where no tile is', () => {
    const types = new Map<string, HexType>();
    // a mountain in front of a plain: its face reaches up into the plain's row
    types.set(hexId(0, 0), 'plains');
    types.set(hexId(0, 1), 'mountain');
    types.set(hexId(1, 0), 'water');
    const elevOf = (q: number, r: number) => {
      const t = types.get(hexId(q, r));
      return t ? ELEV[t] : hexDistance({ q, r }, { q: 0, r: 0 }) <= 5 ? FOG_ELEV : null;
    };
    const plain = hexTop(0, 0, ELEV.plains);
    expect(pickHex(plain.x, plain.y, elevOf)).toEqual({ q: 0, r: 0 });
    const mountain = hexTop(0, 1, ELEV.mountain);
    expect(pickHex(mountain.x, mountain.y, elevOf)).toEqual({ q: 0, r: 1 });
    // the mountain's top covers the lower part of the plain's tile
    expect(pickHex(plain.x + 6, plain.y + 8, elevOf)).toEqual({ q: 0, r: 1 });
    // the mountain's front side face belongs to it too
    expect(pickHex(mountain.x, mountain.y + 10 + ELEV.mountain - 2, elevOf)).toEqual({ q: 0, r: 1 });
    // fog parchment (flat) where no raised tile stands
    const fog = hexTop(-3, 2, FOG_ELEV);
    expect(pickHex(fog.x, fog.y, elevOf)).toEqual({ q: -3, r: 2 });
    // outside the shard
    const far = hexTop(20, 0, 0);
    expect(pickHex(far.x, far.y, elevOf)).toBeNull();
  });

  it('draws back to front and bounds the whole shard', () => {
    const order = drawOrder([{ q: 1, r: 2 }, { q: 0, r: -1 }, { q: -1, r: 2 }]);
    expect(order).toEqual([{ q: 0, r: -1 }, { q: -1, r: 2 }, { q: 1, r: 2 }]);
    const b = boardBounds(SHARD_RADIUS);
    for (const h of shardHexes(SHARD_RADIUS).filter((x) => hexDistance(x, { q: 0, r: 0 }) === SHARD_RADIUS)) {
      const t = hexTop(h.q, h.r, ELEV.mountain);
      expect(t.x).toBeGreaterThanOrEqual(b.x);
      expect(t.x).toBeLessThanOrEqual(b.x + b.w);
      expect(t.y - 10).toBeGreaterThanOrEqual(b.y);
    }
    expect(clampCenter(1e6, -1e6, b)).toEqual({ x: b.x + b.w, y: b.y });
    const z = zoomLimits(2);
    expect(z.start).toBe(3);
    expect(Number.isInteger(z.start)).toBe(true);
    expect(z.min).toBeLessThan(z.start);
    expect(z.max).toBeGreaterThan(z.start);
  });
});

describe('live army movement', () => {
  const path: Axial[] = [0, 1, 2, 3, 4].map((q) => ({ q, r: 0 }));
  const at = [1000, 61_000, 121_000, 181_000, 241_000];

  it('cuts marches to what a viewer sees (fog stays on the server)', () => {
    const s = sightSteps(path, at, [{ q: 0, r: -3 }], 3);
    expect(s).toEqual([{ q: 0, r: 0, at: 1000, until: 61_000 }]);
    expect(sightSteps(path, at, [{ q: 9, r: 0 }], 3)).toEqual([]);
    expect(allSteps(path, at).at(-1)).toEqual({ q: 4, r: 0, at: 241_000, until: null });
  });

  it('interpolates along the path and stops at the end', () => {
    const a = { player: 2, name: 'B', clan: null, q: 0, r: 0, steps: allSteps(path, at), own: false };
    const mid = poseOf(a, 31_000);
    const p0 = fromUnit(mid.x, mid.y);
    expect(p0.x).toBeCloseTo((hexBase(0, 0).x + hexBase(1, 0).x) / 2, 5);
    expect(mid).toMatchObject({ q: 0, r: 0, moving: true, visible: true });
    expect(poseOf(a, 500)).toMatchObject({ visible: false }); // not set out yet
    expect(poseOf(a, 300_000)).toMatchObject({ q: 4, r: 0, moving: false, visible: true });
  });

  it('hides an army that walked out of sight; gaps are not interpolated', () => {
    // only hexes 0, 1 and 3 are visible
    const steps = sightSteps(path, at, [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 3, r: 0 }], 0);
    expect(steps.map((s) => s.q)).toEqual([0, 1, 3]);
    const a = { player: 2, name: 'B', clan: null, q: 0, r: 0, steps, own: false };
    expect(poseOf(a, 91_000)).toMatchObject({ q: 1, moving: true, visible: true, dx: 0, dy: 0 }); // heading into the fog
    expect(poseOf(a, 150_000)).toMatchObject({ visible: false }); // in the fog between 1 and 3
    expect(poseOf(a, 190_000)).toMatchObject({ q: 3, visible: true });
    expect(poseOf(a, 250_000)).toMatchObject({ visible: false }); // left the last visible hex
  });

  it('tracks socket messages with the server clock', () => {
    const live = new LiveArmies(1, (q) => q < 10);
    live.load([{ player: 1, q: 0, r: 0, dest: null, arriveAt: null, path: null }], { '1': 'Me' }, 10_000, 4_000);
    expect(live.skew).toBe(6_000);
    const march: LiveArmyMsg = { type: 'army_march', player: 7, name: 'Raider', clan: 3, path: path.map((h) => [h.q, h.r]), at, until: [...at.slice(1), null], now: 31_000 };
    expect(live.apply(march, 1_000)).toBe(true);
    expect(live.skew).toBe(30_000);
    const pose = live.poses(1_000).find((p) => p.player === 7)!; // server 31 s: half way to hex 1
    expect(pose).toMatchObject({ moving: true, visible: true });
    live.apply({ type: 'army_pos', player: 7, name: 'Raider', clan: 3, q: 2, r: 0, now: 40_000 }, 10_000);
    expect(live.armies.get(7)).toMatchObject({ q: 2, r: 0, steps: null });
    live.apply({ type: 'army_hide', player: 7, now: 41_000 }, 11_000);
    expect(live.armies.has(7)).toBe(false);
    // your own army never hides; its march settles when it ends
    live.ownMarch([[0, 0], [1, 0]], [30_000, 40_000]);
    expect(live.apply({ type: 'army_hide', player: 1, now: 31_000 }, 1_000)).toBe(false);
    expect(live.settle(20_000)).toBe(true); // server time 50 s
    expect(live.armies.get(1)).toMatchObject({ q: 1, r: 0, steps: null });
  });

  it('armies standing in the fog are not shown', () => {
    const live = new LiveArmies(1, (q) => q < 3);
    live.apply({ type: 'army_pos', player: 9, name: 'X', clan: null, q: 5, r: 0, now: 0 }, 0);
    expect(live.poses(0)[0].visible).toBe(false);
  });
});

describe('march estimate and hex actions', () => {
  const grid = (types: Record<string, HexType>, rival: string[] = []): Map<string, PlanHex> => {
    const m = new Map<string, PlanHex>();
    for (let q = -4; q <= 4; q++)
      for (let r = -4; r <= 4; r++) {
        const k = hexId(q, r);
        m.set(k, { q, r, type: types[k] ?? 'plains', rival: rival.includes(k) });
      }
    return m;
  };

  it('finds the cheapest known path, avoiding water, mountains and rival land', () => {
    const p = planMarch(grid({}), { q: 0, r: 0 }, { q: 3, r: 0 });
    expect(p).toMatchObject({ ok: true, minutes: 18, energy: 3 });
    const walled = grid({ [hexId(1, 0)]: 'water', [hexId(1, -1)]: 'mountain' }, [hexId(0, 1)]);
    const q = planMarch(walled, { q: 0, r: 0 }, { q: 2, r: 0 });
    expect(q.ok).toBe(true);
    if (q.ok) for (const h of q.path) expect([hexId(1, 0), hexId(1, -1), hexId(0, 1)]).not.toContain(hexId(h.q, h.r));
    expect(planMarch(walled, { q: 0, r: 0 }, { q: 1, r: 0 })).toEqual({ ok: false, reason: 'impassable' });
    expect(planMarch(walled, { q: 0, r: 0 }, { q: 0, r: 1 })).toEqual({ ok: false, reason: 'rival' });
    expect(planMarch(walled, { q: 0, r: 0 }, { q: 30, r: 0 })).toEqual({ ok: false, reason: 'unknown' });
    expect(planMarch(walled, { q: 0, r: 0 }, { q: 0, r: 0 })).toEqual({ ok: false, reason: 'here' });
    expect(planMarch(grid({}), { q: 0, r: 0 }, { q: 4, r: 0 }, 3)).toEqual({ ok: false, reason: 'too_far' });
  });

  const base: ActInput = {
    owner: null,
    ours: false,
    mine: false,
    home: false,
    passable: true,
    locked: false,
    canAttack: true,
    canGarrison: false,
    waiting: 0,
    here: false,
    adjacent: true,
    marching: false,
    energy: 50,
    plan: { ok: true, path: [{ q: 0, r: 0 }, { q: 1, r: 0 }], minutes: 6, energy: 1 },
  };

  it('neutral next door: attack is the primary action, last in the row', () => {
    const acts = hexActions(base);
    expect(acts.map((a) => a.id)).toEqual(['march', 'attack']);
    expect(acts[1]).toMatchObject({ enabled: true, primary: true });
    expect(acts.filter((a) => a.primary)).toHaveLength(1);
  });

  it('says why an action is disabled', () => {
    const far = hexActions({ ...base, adjacent: false, canAttack: false });
    expect(far.find((a) => a.id === 'attack')).toMatchObject({ enabled: false, reason: 'notNext' });
    expect(far.find((a) => a.primary)?.id).toBe('march');
    expect(hexActions({ ...base, energy: 4 }).find((a) => a.id === 'attack')).toMatchObject({ enabled: false, reason: 'energy', params: { n: 4, need: ONLINE_RULES.energyPerAttack } });
    expect(hexActions({ ...base, locked: true }).find((a) => a.id === 'attack')).toMatchObject({ reason: 'locked' });
    expect(hexActions({ ...base, marching: true }).find((a) => a.id === 'attack')).toMatchObject({ reason: 'marching' });
    expect(hexActions({ ...base, energy: 0, plan: { ok: true, path: [], minutes: 30, energy: 5 } }).find((a) => a.id === 'march')).toMatchObject({ enabled: false, reason: 'energy' });
    const rival = hexActions({ ...base, owner: 9, home: true, plan: { ok: false, reason: 'rival' } });
    expect(rival.find((a) => a.id === 'march')).toMatchObject({ enabled: false, reason: 'rival' });
    expect(rival.find((a) => a.id === 'attack')).toMatchObject({ enabled: false, reason: 'home' });
    expect(hexActions({ ...base, passable: false, plan: { ok: false, reason: 'impassable' } })).toEqual([{ id: 'march', enabled: false, reason: 'impassable' }]);
    expect(hexActions({ ...base, plan: { ok: false, reason: 'too_far' } }).find((a) => a.id === 'march')).toMatchObject({ reason: 'tooFar', params: { n: ONLINE_RULES.maxMarch } });
  });

  it('own land: collect and garrison', () => {
    const own = hexActions({ ...base, owner: 1, ours: true, mine: true, here: true, canGarrison: true, waiting: 12 });
    expect(own.map((a) => a.id)).toEqual(['garrison', 'collect']);
    expect(own.find((a) => a.primary)?.id).toBe('collect');
    const away = hexActions({ ...base, owner: 1, ours: true, mine: true, waiting: 0 });
    expect(away.find((a) => a.id === 'collect')).toMatchObject({ enabled: false, reason: 'noIncome' });
    expect(away.find((a) => a.id === 'garrison')).toMatchObject({ enabled: false, reason: 'notHere' });
    expect(away.find((a) => a.primary)?.id).toBe('march');
  });
});

describe('demo shard (preview map)', () => {
  it('is deterministic and shows own, clan and rival land, armies and a live march', () => {
    const a = demoShard(1_000_000);
    const b = demoShard(1_000_000);
    expect(JSON.stringify(a.map)).toBe(JSON.stringify(b.map));
    const owners = new Set(a.map.hexes.map((h) => h.owner));
    expect(owners.has(a.map.you.id)).toBe(true);
    expect(a.map.hexes.some((h) => h.owner !== null && h.owner !== a.map.you.id && h.clan === a.map.you.clan)).toBe(true);
    expect(a.map.armies.some((x) => x.path && x.path.length > 1)).toBe(true);
    expect(a.map.hexes.filter((h) => h.def).length).toBeGreaterThan(10);
    // every visible hex is within sight of a vision source, and neighbours of home are visible
    for (const d of HEX_DIRS) expect(a.map.hexes.some((h) => h.q === a.profile.home.q + d.q && h.r === a.profile.home.r + d.r)).toBe(true);
    expect(a.hex(a.spots.neutralNext).canAttack).toBe(true);
  });
});
