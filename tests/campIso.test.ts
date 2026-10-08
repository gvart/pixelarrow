import { describe, expect, it } from 'vitest';
import { Campaign } from '../src/game/campaign';
import { World } from '../src/world/world';
import { campBlocker } from '../src/world/camp';
import { fieldLayout, onlineLayout } from '../src/world/campLayout';
import { G, groundLayout, renderBellTent, renderIsoGround, renderPavilion, renderRidgeTent, renderShip, renderStakes, screenTile, tileScreen } from '../src/art/campIso';
import { demoShard } from '../src/online/demoShard';
import type { CampView } from '../src/online/camps';

/** A world with the party on a tile where it may camp (nearest the start), camped. */
function camped(seed = 7): Campaign {
  const c = Campaign.fresh(seed);
  const w = c.world;
  const m = w.map;
  const st = m.settlements[m.start];
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      if (campBlocker(m, x, y)) continue;
      const d = Math.hypot(x - st.x, y - st.y);
      if (!best || d < best.d) best = { x, y, d };
    }
  w.s.x = best!.x + 0.5;
  w.s.y = best!.y + 0.5;
  expect(w.makeCamp()).toBeNull();
  w.addSupplies(100);
  return c;
}

describe('iso grid', () => {
  it('maps tiles to the screen and back', () => {
    for (const [x, y] of [[0, 0], [3, 1], [7, 9], [0.5, 2.25]]) {
      const s = tileScreen(x, y);
      const t = screenTile(s.x, s.y);
      expect(t.x).toBeCloseTo(x);
      expect(t.y).toBeCloseTo(y);
    }
    expect(tileScreen(1, 0)).toEqual({ x: 16, y: 8 });
    expect(tileScreen(0, 1)).toEqual({ x: -16, y: 8 });
  });
});

describe('camp sprites', () => {
  it('render volumes that stand on their tile corner with a shadow and no black outline', () => {
    for (const s of [renderPavilion(2), renderPavilion(3), renderBellTent(1), renderRidgeTent(0), renderStakes(0, 3), renderShip(false), renderShip(true)]) {
      expect(s.px.w).toBeGreaterThan(8);
      expect(s.ox).toBeGreaterThan(0);
      expect(s.oy).toBeGreaterThan(0);
      let opaque = 0;
      let black = 0;
      for (let i = 0; i < s.px.data.length; i += 4) {
        if (s.px.data[i + 3] > 200) opaque++;
        if (s.px.data[i + 3] > 200 && s.px.data[i] < 12 && s.px.data[i + 1] < 12 && s.px.data[i + 2] < 12) black++;
      }
      expect(opaque).toBeGreaterThan(60);
      expect(black).toBe(0);
    }
  });

  it('draws the ground of a tile window with every kind', () => {
    const w = 8;
    const h = 6;
    const kinds = new Uint8Array(w * h).fill(G.grass);
    const clearing = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (x < 2) kinds[y * w + x] = G.forest;
        if (x > 5) kinds[y * w + x] = y > 3 ? G.sea : G.sand;
        if (x >= 2 && x <= 4 && y >= 1 && y <= 3) {
          kinds[y * w + x] = G.mown;
          clearing[y * w + x] = 1;
        }
      }
    kinds[5] = G.dirt;
    kinds[0] = G.rock;
    const px = renderIsoGround({ w, h, kinds, seed: 3, clearing });
    const L = groundLayout(w, h);
    expect(px.w).toBe(L.pw);
    expect(px.h).toBe(L.ph);
    // the middle of a sea tile is blue-ish, of a mown tile greenish-straw
    const sea = tileScreen(7, 5);
    const c = px.get(L.ox + sea.x, L.oy + sea.y + 8);
    expect(c & 255).toBeGreaterThan((c >> 16) & 255);
    const mown = tileScreen(3, 2);
    const m = px.get(L.ox + mown.x, L.oy + mown.y + 8);
    expect((m >> 8) & 255).toBeGreaterThan(140);
  });
});

describe('camp layouts', () => {
  it('lays the field camp out around the pavilion with the structures where they were built', () => {
    const c = camped();
    const w = c.world;
    const camp = w.camp!;
    const build = (id: 'tent' | 'fire' | 'forge' | 'training' | 'palisade') => {
      for (const i of camp.zone) {
        const x = i % w.map.w;
        const y = Math.floor(i / w.map.w);
        if (w.build(id, x, y) === null) return { x, y };
      }
      throw new Error(`no room for ${id}`);
    };
    const fire = build('fire');
    build('tent');
    build('forge');
    const L = fieldLayout(w.map, camp, 9);
    expect(L.w).toBeGreaterThan(10);
    expect(L.kinds.length).toBe(L.w * L.h);
    // the clearing is the zone, mown
    let mown = 0;
    for (let i = 0; i < L.kinds.length; i++) if (L.clearing[i]) mown++;
    expect(mown).toBeGreaterThanOrEqual(camp.zone.length * 4 - 1);
    const pav = L.things.find((t) => t.key === 'pavilion')!;
    expect(L.toIso(camp.x, camp.y)).toEqual({ x: pav.x, y: pav.y });
    expect(L.things.find((t) => t.key === 'firepit')!).toMatchObject(L.toIso(fire.x, fire.y));
    expect(L.spots.fire).toBeTruthy();
    expect(L.spots.forge).toBeTruthy();
    expect(L.spots.beds).toHaveLength(1);
    // the men's tents: five for nine men
    expect(L.things.filter((t) => t.key.startsWith('ridge'))).toHaveLength(5);
    expect(L.routes.length).toBeGreaterThan(2);
    // nothing stands on anything else (except the ghost and the flat yards)
    const solid = L.things.filter((t) => !t.flat && !t.key.startsWith('ghost'));
    for (const a of solid)
      for (const b of solid) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.key} over ${b.key}`).toBe(false);
      }
    // a placement ghost
    const L2 = fieldLayout(w.map, camp, 9, { id: 'training', x: camp.x, y: camp.y });
    expect(L2.things.some((t) => t.key === 'ghost:yard')).toBe(true);
    // the palisade rings the clearing
    build('palisade');
    const L3 = fieldLayout(w.map, camp, 9);
    expect(L3.things.filter((t) => t.key.startsWith('stakes')).length).toBeGreaterThan(10);
    expect(L3.things.some((t) => t.key === 'gate0')).toBe(true);
  });

  it('lays the online camp out with every slot, a ship on a coast and the plot to claim', () => {
    const d = demoShard();
    const v = d.camp.view(d.now);
    const home = v.camps.find((c) => c.home)!;
    const L = onlineLayout(home, { coast: true, seed: 5, home: true, rosterSize: 8, now: d.now });
    expect(L.coastal).toBe(true);
    expect(L.things.some((t) => t.key.startsWith('ship'))).toBe(true);
    for (let s = 0; s < home.slots; s++) {
      const t = L.slotTile(s);
      expect(L.slotAt(t.x, t.y)).toBe(s);
      expect(L.slotAt(t.x + 1, t.y + 1)).toBe(s);
    }
    expect(L.slotAt(0, 0)).toBe(-1);
    for (const b of home.buildings) expect(L.things.some((t) => t.sel === `${b.slot}`)).toBe(true);
    const plots = L.things.filter((t) => t.key === 'plot');
    expect(plots).toHaveLength(home.slots - home.buildings.length);
    expect(L.things.some((t) => t.key === 'pavilion3')).toBe(true);
    expect(L.things.some((t) => t.key === 'stall')).toBe(true);
    // a ghost on the first empty slot
    const empty = plots[0].sel!;
    const L2 = onlineLayout(home, { coast: false, seed: 5, home: true, rosterSize: 8, now: d.now, ghost: { slot: Number(empty), kind: 'watchtower' } });
    expect(L2.things.some((t) => t.key === 'ghost:tower1' && t.sel === empty)).toBe(true);
    expect(L2.things.some((t) => t.key.startsWith('ship'))).toBe(false);
    // the plot to claim
    const L3 = onlineLayout(null as CampView | null, { coast: false, seed: 9, home: false, rosterSize: 4, now: d.now });
    expect(L3.things.some((t) => t.key === 'banner')).toBe(true);
    expect(L3.things.some((t) => t.key === 'pavilion3')).toBe(false);
  });

  it('shows a construction stage for a building going up', () => {
    const d = demoShard();
    const v = d.camp.view(d.now);
    const home = v.camps.find((c) => c.home)!;
    const busy = home.buildings.find((b) => b.building !== null);
    expect(busy).toBeTruthy();
    const L = onlineLayout(home, { coast: false, seed: 5, home: true, rosterSize: 8, now: d.now });
    const t = L.things.find((x) => x.sel === `${busy!.slot}`)!;
    expect(t.stage).toBeDefined();
    const later = onlineLayout(home, { coast: false, seed: 5, home: true, rosterSize: 8, now: busy!.doneAt! - 1 });
    expect(later.things.find((x) => x.sel === `${busy!.slot}`)!.stage).toBe(2);
  });

  it('keeps the camp data of a save round trip (reserve flags)', () => {
    const c = camped(11);
    c.setReserve(c.data.heroes[0].id, true);
    const back = new Campaign(JSON.parse(JSON.stringify(c.sync())));
    expect(back.data.heroes[0].reserve).toBe(true);
    expect(new World(back.data.world).camp).toBeTruthy();
  });
});
