/**
 * QA-03 world and campaign fixes (docs/v5/qa/PLAYTHROUGH.md S2-1, S2-2, S3-4, S4;
 * the rules are in docs/v5/stories/QAFIX-WORLD/NOTES.md).
 */
import { describe, expect, it } from 'vitest';
import { Campaign } from '../src/game/campaign';
import { WORLD_RULES, partyArmy, type PartyState } from '../src/world/world';
import { campBlocker } from '../src/world/camp';
import type { Outcome } from '../src/game/loot';
import { armyLine, encounterCopy, encounterOffers } from '../src/game/encounter';
import { setLang, t, tOr } from '../src/i18n';
import { generateMap } from '../src/world/map';
import { SITE_TAP_MARGIN, pickSettlement, renderWorldMap } from '../src/art/overlandMap';
import { fmtSigned } from '../src/i18n/numbers';
import { campaignSetup, settleBattle, startLairAssault, timedOut } from '../src/game/campaignBattle';
import { emptyLog, whyLine } from '../src/game/report';
import { Battle } from '../src/sim/battle';

setLang('en');

/** The party on the first tile near the start town where it may camp, camped. */
function camped(seed: number): Campaign {
  const c = Campaign.fresh(seed);
  const w = c.world;
  const m = w.map;
  const st = m.settlements[m.start];
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (campBlocker(m, x, y)) continue;
      const d = Math.hypot(x - st.x, y - st.y);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  w.s.x = best!.x + 0.5;
  w.s.y = best!.y + 0.5;
  expect(w.makeCamp()).toBeNull();
  return c;
}

/** A strong band right on top of the camp, and no other band on the map. */
function bandOnCamp(c: Campaign): PartyState {
  const w = c.world;
  const p = w.spawnParty('lair')!;
  w.s.parties = [p];
  p.x = w.s.x + 0.3;
  p.y = w.s.y;
  p.idle = 0;
  p.power = Math.max(partyArmy(p, { nextId: 1 }).power, c.playerInfo().power * 3);
  w.s.safeUntil = 0;
  return p;
}

/** Rest in camp for `hours` as the World scene does; the encounters that opened. */
function rest(c: Campaign, hours: number): number[] {
  const met: number[] = [];
  for (let h = 0; h < hours; h += 0.25) {
    delete c.world.s.pendingEvent;
    const r = c.world.advance(0.25, c.playerInfo(), true);
    c.tickWorld(r.hours);
    for (const e of r.events) if (e.type === 'encounter') met.push(e.party);
  }
  return met;
}

const lost = (over: Partial<Outcome> = {}): Outcome => ({ victory: false, draw: false, gold: 20, picks: 0, loot: [], heroes: [], enemyKilled: 0, enemyTotal: 6, lost: 0, ...over });

describe('S2-1: a defeat in camp gives the army a real breather', () => {
  it('the band that won leaves the army alone for WORLD_RULES.defeatRespiteH game hours of rest', () => {
    const c = camped(7);
    const p = bandOnCamp(c);
    // control: without the defeat the band falls on the camp at once
    expect(rest(c, 1)).toContain(p.id);
    c.afterPartyBattle(p.id, lost());
    expect(WORLD_RULES.defeatRespiteH).toBeGreaterThanOrEqual(12);
    expect(rest(c, WORLD_RULES.defeatRespiteH - 0.5)).not.toContain(p.id);
  });

  it('the map comes back with the rest stopped after a defeat (once), not after a win', () => {
    const c = camped(7);
    const p = bandOnCamp(c);
    c.afterPartyBattle(p.id, lost());
    expect(c.takeRestHalt()).toBe(true);
    expect(c.takeRestHalt()).toBe(false);
    const q = bandOnCamp(c);
    c.afterPartyBattle(q.id, lost({ victory: true, enemyKilled: 6 }));
    expect(c.takeRestHalt()).toBe(false);
  });

  it('no band falls on an army with no fit man', () => {
    const c = camped(9);
    const p = bandOnCamp(c);
    for (const h of c.data.heroes) h.wound = 200;
    expect(c.playerInfo().fit).toBe(0);
    expect(rest(c, 6)).not.toContain(p.id);
    // one man back on his feet: the band comes
    c.data.heroes[0].wound = 0;
    p.x = c.world.s.x + 0.3;
    p.y = c.world.s.y;
    p.idle = 0;
    expect(rest(c, 2)).toContain(p.id);
  });
});

describe('S2-2: the encounter sheet counts the army right, and only fit men fight', () => {
  it('no man fit: "no man fit, 5 wounded", the odds count no one, and the only choice is to let them go', () => {
    const c = Campaign.fresh(7);
    c.data.heroes = c.data.heroes.slice(0, 5);
    for (const h of c.data.heroes) h.wound = 30;
    const a = armyLine(c);
    expect(a).toEqual({ fit: 0, wounded: 5, noneFit: true, power: 0, key: 'wld.enc.armyNoneFit' });
    expect(t(a.key, { fit: a.fit, w: a.wounded })).toBe('Your army: no man fit, 5 wounded');
    // nobody fights: no Attack, no ransom, no flight to fail; the band is let go
    for (const byPlayer of [true, false])
      expect(encounterOffers({ byPlayer, ratio: 50, failedFlee: false, canRansom: true, noneFit: true })).toEqual({ attack: false, ransom: false, letGo: true, flee: false });
    const copy = encounterCopy({ ratio: 50, byPlayer: true, inCamp: true, failedFlee: false, flee: false, letGo: true, noneFit: true });
    expect(copy.advice).toBe('wld.enc.adv.noneFit');
    expect(t(copy.advice)).toBe('No man is fit to fight. Let them go, and rest.');
  });

  it('some wounded: fit + wounded is the army, and the odds count only the fit men who march', () => {
    const c = Campaign.fresh(7);
    c.data.heroes = c.data.heroes.slice(0, 5);
    c.data.heroes[0].wound = 30;
    c.data.heroes[1].wound = 30;
    const a = armyLine(c);
    expect(a).toMatchObject({ fit: 3, wounded: 2, noneFit: false, key: 'wld.enc.armyWounded' });
    expect(a.power).toBe(c.playerInfo().power);
    expect(c.playerInfo().size).toBe(3);
    expect(c.fitHeroes().every((h) => (h.wound ?? 0) <= 0)).toBe(true);
    expect(encounterOffers({ byPlayer: false, ratio: 2, failedFlee: false, canRansom: false, noneFit: false })).toEqual({ attack: true, ransom: false, letGo: false, flee: true });
    expect(encounterOffers({ byPlayer: true, ratio: 0.5, failedFlee: false, canRansom: false, noneFit: false })).toEqual({ attack: true, ransom: false, letGo: true, flee: false });
    expect(encounterOffers({ byPlayer: false, ratio: 2, failedFlee: true, canRansom: true, noneFit: false })).toEqual({ attack: true, ransom: false, letGo: false, flee: false });
  });
});

describe('S4: the encounter sheet never contradicts its own choices', () => {
  const offers = (flee: boolean, letGo: boolean) => ({ flee, letGo });
  it('a hard fight suggests only what the sheet offers', () => {
    expect(encounterCopy({ ratio: 2, byPlayer: false, inCamp: false, failedFlee: false, ...offers(true, false) }).advice).toBe('wld.enc.adv.hardFlee');
    expect(encounterCopy({ ratio: 2, byPlayer: true, inCamp: false, failedFlee: false, ...offers(false, true) }).advice).toBe('wld.enc.adv.hardLetGo');
    // flight failed: neither flight nor letting them go is on the sheet
    const cut = encounterCopy({ ratio: 2, byPlayer: false, inCamp: false, failedFlee: true, ...offers(false, false) });
    expect(cut.advice).toBe('wld.enc.adv.hard');
    expect(t(cut.advice)).not.toMatch(/flee|rest/i);
    expect(encounterCopy({ ratio: 1, byPlayer: false, inCamp: false, failedFlee: false, ...offers(true, false) }).advice).toBe('wld.enc.adv.even');
  });

  it('"You have caught up with them" only when they would let you go', () => {
    expect(encounterCopy({ ratio: 0.9, byPlayer: true, inCamp: false, failedFlee: false, ...offers(false, true) }).mood).toBe('wld.enc.mood.caught');
    // the host (or any band at least as strong) turns on you: it won't let you go
    const host = encounterCopy({ ratio: 1.6, byPlayer: true, inCamp: false, failedFlee: false, ...offers(true, false) });
    expect(host.mood).toBe('wld.enc.mood.stand');
    expect(t(host.mood)).not.toMatch(/caught up/i);
    expect(encounterCopy({ ratio: 0.2, byPlayer: true, inCamp: false, failedFlee: false, ...offers(false, true) }).mood).toBe('wld.enc.mood.surrender');
    expect(encounterCopy({ ratio: 2, byPlayer: false, inCamp: true, failedFlee: false, ...offers(true, false) }).mood).toBe('wld.enc.mood.camp');
  });
});

describe('S3-4: a lair assault that runs out of time', () => {
  /** The first lair's assault fought with no orders: the garrison holds its walls, the army waits outside. */
  function stalledAssault() {
    const c = Campaign.fresh(5);
    const lair = c.world.map.settlements.find((s) => s.kind === 'lair')!;
    const pending = startLairAssault(c, lair.id, 4242)!;
    const heroes = c.fitHeroes();
    const sim = new Battle(campaignSetup(pending, heroes));
    sim.startBattle();
    while (sim.phase !== 'ended') sim.step();
    return { c, pending, sim, heroes };
  }

  it('is a draw (time ran out), not a defeat, and pays only for the men it killed', () => {
    const { c, pending, sim } = stalledAssault();
    expect(sim.tick).toBeGreaterThanOrEqual(sim.timeLimitTicks);
    expect(timedOut(sim)).toBe(true);
    const gold0 = c.data.gold;
    const last = settleBattle(c, pending, sim, pending.enemy.heroes);
    const o = last.outcome;
    expect(o.victory).toBe(false);
    expect(o.draw).toBe(true);
    expect(o.timedOut).toBe(true);
    expect(o.picks).toBe(0);
    // no pay for standing outside the walls: kill gold and kill XP only
    expect(o.gold).toBeLessThanOrEqual(o.enemyKilled * 12 * 1.5);
    if (o.enemyKilled === 0) expect(o.gold).toBe(0);
    expect(c.data.gold - gold0).toBe(o.gold);
    for (const h of o.heroes) if (h.kills === 0) expect(h.xp).toBe(0);
  });

  it('the why-line says time ran out; at a lair, that the garrison held its walls', () => {
    expect(whyLine(emptyLog(), 0, 'draw', { timedOut: true, walls: true })).toEqual([{ key: 'why.timeoutWalls', params: {} }]);
    expect(whyLine(emptyLog(), 0, 'draw', { timedOut: true })).toEqual([{ key: 'why.timeout', params: {} }]);
    expect(t('why.timeoutWalls')).toBe('Time ran out. The garrison held its walls.');
    // a draw that did not run out of time keeps its line
    expect(whyLine(emptyLog(), 0, 'draw')).toEqual([{ key: 'why.draw', params: {} }]);
  });

  it('the assault sheet says a garrison holds its walls before it charges', () => {
    expect(t('arc.as.walls')).toMatch(/holds its walls/);
    expect(t('arc.as.tell', { tell: 'charges at once.' })).toMatch(/^Once you reach the wall/);
  });
});

describe('S4: the why-line against a lone beast', () => {
  it('speaks of the beast, not of "their line"', () => {
    const lost = whyLine(emptyLog(), 0, 'defeat', { beast: true });
    expect(lost).toEqual([{ key: 'why.lost.beast', params: {} }]);
    expect(t('why.lost.beast')).not.toMatch(/line/i);
    expect(whyLine(emptyLog(), 0, 'victory', { beast: true })).toEqual([{ key: 'why.won.beast', params: {} }]);
    // an army keeps its line
    expect(whyLine(emptyLog(), 0, 'defeat')).toEqual([{ key: 'why.lost.held', params: {} }]);
  });
});

describe('S4: lair names vary within a campaign', () => {
  it('no two Galatae or bandit lairs of one map share a name, the names are the same for the same seed, and each has en and ru', () => {
    let galatae = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const lairs = generateMap(seed).settlements.filter((s) => s.kind === 'lair');
      const named = lairs.filter((s) => s.name !== 'Pirate cove').map((s) => s.name);
      expect(new Set(named).size).toBe(named.length);
      expect(generateMap(seed).settlements.filter((s) => s.kind === 'lair').map((s) => s.name)).toEqual(lairs.map((s) => s.name));
      for (const s of lairs) {
        // the map art keys its look off the name (overlandMap.ts lairProp)
        expect(/Galatae/.test(s.name)).toBe(s.band === 'raiders');
        if (/Galatae/.test(s.name)) galatae++;
        for (const l of ['en', 'ru'] as const) {
          setLang(l);
          expect(tOr(`arc.lairName.${s.name}`, '')).not.toBe('');
        }
        setLang('en');
      }
    }
    expect(galatae).toBeGreaterThan(40);
  });
});

describe('S4: a town is tapped on its picture, not on the open ground beside it', () => {
  it('the tap area is what is drawn on the settlement (not its plain ground) give or take SITE_TAP_MARGIN, with no holes; the old one reached past it', () => {
    const all = () => true;
    let open = 0;
    let clearing = 0;
    let places = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const m = generateMap(seed);
      const art = renderWorldMap(m);
      for (const s of m.settlements.filter((q) => q.kind !== 'lair')) {
        const site = art.sites.find((q) => q.id === s.id && q.kind !== 'landmark')!;
        const pix = site.sprite.pix;
        const body = site.sprite.body;
        expect(body).toBeDefined();
        const near = (x: number, y: number, r: number, solid: (k: number) => boolean): boolean => {
          for (let j = -r; j <= r; j++)
            for (let i = -r; i <= r; i++) {
              const px = Math.floor(x - site.x) + i;
              const py = Math.floor(y - site.y) + j;
              if (pix.inside(px, py) && solid(py * pix.w + px)) return true;
            }
          return false;
        };
        // its buildings, walls, fields and paving; the plain ground it is drawn on doesn't count
        const drawnNear = (x: number, y: number, r: number) => near(x, y, r, (k) => body![k] > 0);
        const paintedNear = (x: number, y: number, r: number) => near(x, y, r, (k) => pix.data[k * 4 + 3] > 0);
        // the points the tap area leaves out, and which of them connect to the open ground outside
        const x0 = site.x - 16;
        const y0 = site.y - 16;
        const bw = site.w + 32;
        const bh = site.h + 32;
        const tap = new Uint8Array(bw * bh);
        for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) tap[j * bw + i] = pickSettlement(m.settlements, art.sites, x0 + i, y0 + j, all)?.id === s.id ? 1 : 0;
        const outside = new Uint8Array(bw * bh);
        const stack: number[] = [0];
        outside[0] = 1;
        while (stack.length) {
          const k = stack.pop()!;
          const i = k % bw;
          const j = (k - i) / bw;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ni = i + di;
            const nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= bw || nj >= bh) continue;
            const nk = nj * bw + ni;
            if (outside[nk] || tap[nk]) continue;
            outside[nk] = 1;
            stack.push(nk);
          }
        }
        // the rule before QAFIX-WORLD: 11 px round the tile, or anywhere in the picture's box
        const oldHit = (x: number, y: number) => Math.hypot(s.x * 8 + 4 - x, s.y * 8 - y) < 11 || (x > site.x + 4 && x < site.x + site.w - 4 && y > site.y + 4 && y < site.y + site.h - 2);
        for (let j = 0; j < bh; j++)
          for (let i = 0; i < bw; i++) {
            const x = x0 + i;
            const y = y0 + j;
            const k = j * bw + i;
            const drawn = drawnNear(x, y, SITE_TAP_MARGIN);
            // no holes: a point left out is open ground that reaches the outside
            if (!tap[k]) expect(outside[k]).toBe(1);
            // picked: near something drawn, or ground walled in by it
            if (tap[k]) expect(drawn || paintedNear(x, y, 0)).toBe(true);
            if (oldHit(x, y) && !tap[k]) {
              open++;
              if (paintedNear(x, y, 0)) clearing++;
            }
            // off the picture, only the margin round what is drawn
            if (tap[k] && !paintedNear(x, y, 0)) expect(drawn).toBe(true);
          }
        // the settlement's own tile is on its picture
        expect(pickSettlement(m.settlements, art.sites, s.x * 8 + 4, s.y * 8 + 4, all)?.id).toBe(s.id);
        places++;
      }
    }
    expect(places).toBeGreaterThan(50);
    // the old tap area reached open ground, much of it the plain ground the settlement is drawn on; that ground is ground now
    expect(open).toBeGreaterThan(1000);
    expect(clearing).toBeGreaterThan(300);
  });
});

describe('S4: the camp line never writes "food -0 a day"', () => {
  it('a signed whole number rounds first, then signs', () => {
    expect(fmtSigned(-0.3)).toBe('0');
    expect(fmtSigned(0.4)).toBe('0');
    expect(fmtSigned(-0)).toBe('0');
    expect(fmtSigned(2.4)).toBe('+2');
    expect(fmtSigned(-1.6)).toBe('-2');
    expect(fmtSigned(1500)).toBe('+1,500');
  });
});
