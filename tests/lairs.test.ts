import { describe, expect, it } from 'vitest';
import { getMap } from '../src/online/world';
import { applyBossState, beastLoc, bossDefenders, bossMaxHp, lairAt, lairBeasts, segmentOutcome, worldBossSites, bossLoot } from '../src/online/lairs';
import { onlineBattleSetup } from '../src/online/battle';
import { starterOnlineArmy, DEFAULT_FORMATIONS } from '../src/online/rules';
import { Battle } from '../src/sim/battle';
import { encounterOf } from '../src/data/beasts';
import { ARC_LAIRS, ASSAULT, GARRISON } from '../src/data/arc';
import { TERRAIN, WORKS } from '../src/data/terrain';
import { bandBeast } from '../src/game/beasts';
import { Campaign } from '../src/game/campaign';
import { armySpec } from '../src/game/armySpec';
import { deserialize, serialize } from '../src/game/save';
import type { Outcome } from '../src/game/loot';
import { isCaptain } from '../src/sim/stats';
import { Rng } from '../src/sim/rng';
import { ladderFloor } from '../src/duel/ladder';
import { dangerAt } from '../src/world/map';
import { generateBattlefield, randomSite, type BattleSite } from '../src/world/battlefield';
import { World, hasCaptain, partyArmy } from '../src/world/world';
import { assaultCases } from '../src/dev/arcBalance';

const W = getMap('test30');

describe('beast lairs on the map', () => {
  it("every region of kind 'lair' holds a beast picked from the seed; nothing else does", () => {
    const kinds = new Set<string>();
    for (const seed of [12345, 777, 1, 2, 3, 4, 5, 6]) {
      for (const r of W.all()) {
        const l = lairAt(W, seed, r.id);
        expect(lairAt(W, seed, r.id)).toEqual(l);
        expect(!!l).toBe(r.kind === 'lair');
        if (!l) continue;
        kinds.add(l.enc);
        expect(l.tier).toBeGreaterThanOrEqual(r.tier);
        expect(beastLoc(W, seed, r.id)).toBe(true);
      }
    }
    expect(kinds.size).toBeGreaterThanOrEqual(3);
  });

  it("a lair's beast carries its hoard; the same epoch gives the same beast", () => {
    const seed = 4242;
    const r = W.all().find((x) => x.kind === 'lair')!;
    const l = lairAt(W, seed, r.id)!;
    const a = lairBeasts(seed, r, l, 0);
    expect(lairBeasts(seed, r, l, 0)).toEqual(a);
    expect(encounterOf(a)).toBe(l.enc);
    expect(a.flatMap((x) => Object.values(x.equip)).length).toBeGreaterThan(0);
  });
});

describe('world bosses', () => {
  it('a Kraken on a coastal plot and a Titan in the hills, away from the spawns', () => {
    const spawns = new Set(W.spawns());
    for (const seed of [12345, 777, 4242]) {
      const sites = worldBossSites(W, seed);
      expect(worldBossSites(W, seed)).toEqual(sites);
      const kr = sites.find((s) => s.boss === 'kraken')!;
      const ti = sites.find((s) => s.boss === 'titan')!;
      expect(kr && ti).toBeTruthy();
      expect(kr.loc).not.toBe(ti.loc);
      expect(W.info(kr.loc).coast).toBe(true);
      expect(W.info(ti.loc).site.base).toBe('hills');
      for (const s of sites) {
        expect(W.info(s.loc).kind).toBe('plot');
        expect(spawns.has(s.loc)).toBe(false);
        expect(beastLoc(W, seed, s.loc)).toBe(true);
      }
    }
  });

  it('a raid segment starts from the stored wounds and replays to the same damage', () => {
    const max = bossMaxHp('kraken', 8);
    const parts = Array.from({ length: max.parts }, (_, i) => (i === 1 ? 0 : max.part));
    const { heroes, hp0 } = bossDefenders('kraken', 8, max.body - 1000, parts, '3:1:9');
    const army = starterOnlineArmy(5, { nextId: 1 }, 'p_');
    const setup = applyBossState(onlineBattleSetup(99, { heroes: army, formations: [...DEFAULT_FORMATIONS], bot: true }, { heroes, formations: [...DEFAULT_FORMATIONS], bot: true }, null), hp0, 120);
    const run = () => {
      const b = new Battle(JSON.parse(JSON.stringify(setup)));
      b.startBattle();
      while (b.phase !== 'ended') {
        b.step();
        b.drainEvents();
      }
      return { hash: b.hash(), result: b.result() };
    };
    const x = run();
    const y = run();
    expect(y.hash).toBe(x.hash);
    const seg = segmentOutcome(setup, x.result);
    expect(seg.body).toBeLessThanOrEqual(max.body - 1000);
    expect(seg.parts[1]).toBe(0);
    expect(seg.dealt).toBeGreaterThanOrEqual(0);
    expect(x.result.ticks).toBeLessThanOrEqual(120 * 20 + 1);
  });

  it('the hoard split is by damage share and the same every time', () => {
    const a = bossLoot('titan', 'k', 7, 0.5, 'x_');
    expect(bossLoot('titan', 'k', 7, 0.5, 'x_')).toEqual(a);
    expect(a.length).toBe(12);
    expect(bossLoot('titan', 'k', 8, 0.01, 'y_')).toEqual([]);
    for (const it of a) expect(['rare', 'epic', 'legendary']).toContain(it.rarity);
  });
});

// ------------------------------------------------------------------ AR-02: lairs as assault targets (campaign-arc.md R2, F1, F3)

describe('lair garrisons (R2.1, F1, F3)', () => {
  const lairsOf = (w: World) => w.map.settlements.filter((s) => s.kind === 'lair');

  it('every lair has a garrison of 10 + round(danger x 6) men with a captain, never a beast', () => {
    for (const seed of [1, 2, 3, 4]) {
      const w = new World(World.fresh(seed));
      expect(lairsOf(w)).toHaveLength(ARC_LAIRS);
      for (const st of lairsOf(w)) {
        const danger = dangerAt(w.map, st.x, st.y);
        const full = GARRISON.base + Math.round(danger * GARRISON.danger);
        expect(w.garrisonFull(st.id)).toBe(full);
        expect(w.garrisonSize(st.id)).toBe(full);
        const g = w.garrison(st.id)!;
        expect(g.size).toBe(full);
        expect(g.tier).toBe(w.lairTier);
        expect(g.level).toBe(GARRISON.level + Math.round(danger * GARRISON.levelDanger + w.days * GARRISON.levelDays));
        expect(bandBeast(g.seed)).toBeNull();
        expect(hasCaptain(g)).toBe(true);
        const army = partyArmy(g, { nextId: 1 });
        expect(army.heroes).toHaveLength(full);
        expect(army.heroes.filter((h) => isCaptain(h))).toHaveLength(1);
        // R4: bandit camps and pirate coves swarm, Galatae camps rush
        expect(army.doctrine).toBe(st.band === 'raiders' ? 'rush' : 'swarm');
        expect(w.garrison(st.id)).toEqual(g);
      }
    }
  });

  it('the assault army: the garrison with its 2 free stakes, keyed to the lair, and it never retreats', () => {
    const c = Campaign.fresh(5);
    expect(WORKS.garrisonStakes).toBe(2);
    for (const st of lairsOf(c.world)) {
      const e = c.garrisonEnemy(st.id)!;
      expect(e.works).toEqual({ stakes: 2, ditch: 0, laager: 0 });
      expect(e.holdField).toBe(true);
      expect(c.assaultSite(st.id)).toMatchObject({ assault: true });
    }
    // field bands carry neither
    for (const p of c.world.s.parties) {
      const e = c.partyEnemy(p.id)!;
      expect(e.works).toBeUndefined();
      expect(e.holdField).toBeUndefined();
    }
  });

  it('regrowth: lost men come back one per 24 h up to full (F3); a new loss keeps what regrew', () => {
    const w = new World(World.fresh(7));
    const id = lairsOf(w)[0].id;
    const full = w.garrisonFull(id);
    const seed0 = w.garrison(id)!.seed;
    w.loseGarrison(id, 5);
    expect(w.garrisonSize(id)).toBe(full - 5);
    expect(w.garrison(id)!.seed).not.toBe(seed0); // re-rolled: a fallen captain has been replaced
    w.s.time += 23.9;
    expect(w.garrisonSize(id)).toBe(full - 5);
    w.s.time += 0.1;
    expect(w.garrisonSize(id)).toBe(full - 4);
    w.s.time += 48;
    w.loseGarrison(id, 3); // 2 still lost, plus 3
    expect(w.s.lairs[id]).toMatchObject({ fallen: false, lost: 5 });
    expect(w.garrisonSize(id)).toBe(full - 5);
    w.s.time += 24 * 30;
    expect(w.garrisonSize(id)).toBe(full);
    w.loseGarrison(id, 99);
    expect(w.garrisonSize(id)).toBe(0);
    expect(w.garrison(id)).toBeNull();
  });
});

const outcome = (victory: boolean, killed: number): Outcome => ({ victory, draw: false, gold: 0, picks: victory ? 2 : 0, loot: [], heroes: [], enemyKilled: killed, enemyTotal: 16, lost: 0 });

describe('assault outcomes (R2.4, R2.5)', () => {
  it('a victory razes the lair: no more bands from it, and a fallen lair drops nothing more', () => {
    const c = Campaign.fresh(11);
    const w = c.world;
    const lairs = w.map.settlements.filter((s) => s.kind === 'lair');
    const sp = c.afterLairAssault(lairs[0].id, outcome(true, 16));
    expect(sp.fallen).toBe(true);
    expect(sp.enemyRetreated).toBe(false);
    expect(sp.hoard).toHaveLength(3);
    expect(w.lairFallen(lairs[0].id)).toBe(true);
    expect(w.lairsFallen).toBe(1);
    expect(w.garrison(lairs[0].id)).toBeNull();
    expect(c.garrisonEnemy(lairs[0].id)).toBeNull();
    expect(c.razeLair(lairs[0].id)).toEqual([]);
    for (const st of lairs.slice(1, -1)) c.afterLairAssault(st.id, outcome(true, 16));
    const last = lairs[lairs.length - 1].id;
    for (let i = 0; i < 40; i++) expect(w.spawnParty('lair')!.home).toBe(last);
    c.afterLairAssault(last, outcome(true, 16));
    expect(w.lairsFallen).toBe(ARC_LAIRS);
    expect(w.spawnParty('lair')).toBeNull();
    expect(w.spawnParty('town')).not.toBeNull();
  });

  it('the hoard goes first in the loot, and every piece of it is an extra pick', () => {
    const c = Campaign.fresh(12);
    const id = c.world.map.settlements.find((s) => s.kind === 'lair')!.id;
    const o = outcome(true, 16);
    const it = { ...c.lairHoard(id)[0], uid: 'x1' };
    o.loot = [it];
    o.picks = 1;
    const sp = c.afterLairAssault(id, o);
    expect(o.loot.slice(0, 3)).toEqual(sp.hoard);
    expect(o.loot[3]).toBe(it);
    expect(o.picks).toBe(4);
  });

  it('a defeat or retreat leaves it standing, its dead lost until they regrow', () => {
    const c = Campaign.fresh(13);
    const w = c.world;
    const id = w.map.settlements.find((s) => s.kind === 'lair')!.id;
    const full = w.garrisonFull(id);
    const sp = c.afterLairAssault(id, outcome(false, 4));
    expect(sp).toMatchObject({ fallen: false, hoard: [] });
    expect(w.lairFallen(id)).toBe(false);
    expect(w.garrisonSize(id)).toBe(full - 4);
    c.afterLairAssault(id, { ...outcome(false, 0), retreated: true });
    expect(w.garrisonSize(id)).toBe(full - 4);
  });

  it('a garrison with no men left falls without a battle', () => {
    const c = Campaign.fresh(14);
    const id = c.world.map.settlements.find((s) => s.kind === 'lair')!.id;
    c.world.loseGarrison(id, 99);
    expect(c.garrisonEnemy(id)).toBeNull();
    expect(c.razeLair(id)).toHaveLength(3);
    expect(c.world.lairFallen(id)).toBe(true);
  });

  it('only lairs can be razed or garrisoned', () => {
    const c = Campaign.fresh(15);
    const town = c.world.map.start;
    expect(c.world.garrison(town)).toBeNull();
    expect(c.world.garrisonSize(town)).toBe(0);
    expect(c.razeLair(town)).toEqual([]);
    c.world.loseGarrison(town, 3);
    expect(c.world.s.lairs[town]).toBeUndefined();
  });
});

describe('the assault battlefield (R2.3)', () => {
  const sites: BattleSite[] = [];
  for (let s = 1; s <= 40; s++) sites.push(randomSite(new Rng(s)));
  const ROW = 11; // WORKS_OUT + 0.5 inside the defender's zone (0.38 x 36)

  it('a palisade row with 2 gates of 3 cells, rampart behind it, open ground before the gates, no river', () => {
    for (let s = 0; s < sites.length; s++) {
      const t = generateBattlefield(s * 97 + 1, { ...sites[s], assault: true });
      const at = (x: number, y: number) => t.cells[y * t.w + x];
      let gates = 0;
      let run = 0;
      const gateCols: number[] = [];
      for (let x = 0; x < t.w; x++) {
        const c = at(x, ROW);
        if (c === TERRAIN.sea.code) continue;
        expect(at(x, ROW - 1), `seed ${s} x ${x}`).toBe(TERRAIN.rampart.code);
        if (c === TERRAIN.palisade.code) {
          if (run) {
            gates++;
            expect(run).toBe(ASSAULT.gateW);
          }
          run = 0;
        } else {
          expect(c).toBe(TERRAIN.open.code);
          run++;
          gateCols.push(x);
        }
      }
      expect(gates, `seed ${s}`).toBe(ASSAULT.gates);
      expect(gateCols).toHaveLength(ASSAULT.gates * ASSAULT.gateW);
      for (const x of gateCols) for (let y = ROW + 1; y <= 13; y++) expect([TERRAIN.open.code, TERRAIN.scrub.code, TERRAIN.sand.code, TERRAIN.rough.code]).toContain(at(x, y));
      const pal = [...t.cells].filter((c) => c === TERRAIN.palisade.code).length;
      expect(pal).toBe([...t.cells.slice(ROW * t.w, (ROW + 1) * t.w)].filter((c) => c === TERRAIN.palisade.code).length);
      expect(t.cells.includes(TERRAIN.water.code)).toBe(false);
    }
  });

  it('a field battle is generated exactly as before (no palisade, no rampart)', () => {
    for (let s = 0; s < sites.length; s++) {
      const t = generateBattlefield(s * 97 + 1, sites[s]);
      expect(t.cells.includes(TERRAIN.palisade.code)).toBe(false);
      expect(t.cells.includes(TERRAIN.rampart.code)).toBe(false);
      expect(generateBattlefield(s * 97 + 1, { ...sites[s], assault: false })).toEqual(t);
    }
  });

  it('the garrison lays its 2 stakes 2 paces before its gates, inside its zone, and never quits the field', () => {
    for (const { world, lair } of assaultCases(2)) {
      const c = Campaign.fresh(world);
      const foe = c.garrisonEnemy(lair)!;
      const seed = world * 31 + lair;
      const b = new Battle({
        seed,
        armies: [armySpec(Campaign.fresh(world + 100).fitHeroes(), true), { ...armySpec(foe.heroes, true), doctrine: foe.doctrine, works: foe.works, holdField: foe.holdField }],
        terrain: generateBattlefield(seed, c.assaultSite(lair)),
      });
      const placed = b.works().filter((w) => w.side === 1);
      expect(placed).toHaveLength(2);
      for (const wk of placed) {
        expect(wk.type).toBe('stakes');
        for (const i of wk.cells) expect(Math.floor(i / 24)).toBe(ROW + 2);
      }
      b.startBattle();
      for (let i = 0; i < b.timeLimitTicks + 10 && b.phase !== 'ended'; i++) b.step();
      expect(b.result().retreated).not.toBe(1);
    }
  });

  it('ladder floors and online battles never get an assault field', () => {
    for (let f = 1; f <= 50; f++) expect(ladderFloor(f).site.assault).toBeUndefined();
    const a = starterOnlineArmy(6, { nextId: 1 }, 'a_');
    const setup = onlineBattleSetup(3, { heroes: a, formations: [...DEFAULT_FORMATIONS], bot: true }, { heroes: a, formations: [...DEFAULT_FORMATIONS], bot: true }, randomSite(new Rng(3)));
    expect(setup.terrain?.cells.includes(TERRAIN.palisade.code)).toBe(false);
  });
});

describe('lair state in the save (G-SAVE)', () => {
  const FIXTURES = import.meta.glob<string>('./fixtures/saves/*.json', { eager: true, query: '?raw', import: 'default' });

  it('a v6 save loads with every lair standing at full strength; a fallen and a beaten lair survive a save round trip', () => {
    const raw = Object.entries(FIXTURES).find(([f]) => f.includes('v6-'))![1];
    const c = new Campaign(deserialize(raw)!);
    for (const st of c.world.map.settlements.filter((s) => s.kind === 'lair')) {
      expect(c.world.lairFallen(st.id)).toBe(false);
      expect(c.world.garrisonSize(st.id)).toBe(c.world.garrisonFull(st.id));
    }
    const [a, b] = c.world.map.settlements.filter((s) => s.kind === 'lair');
    c.afterLairAssault(a.id, outcome(true, 16));
    c.afterLairAssault(b.id, outcome(false, 3));
    const back = new Campaign(deserialize(serialize(c.sync()))!);
    expect(back.world.lairFallen(a.id)).toBe(true);
    expect(back.world.lairsFallen).toBe(1);
    expect(back.world.garrisonSize(b.id)).toBe(c.world.garrisonSize(b.id));
    expect(back.world.garrison(b.id)).toEqual(c.world.garrison(b.id));
  });
});
