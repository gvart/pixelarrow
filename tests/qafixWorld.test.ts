/**
 * QA-03 world and campaign fixes (docs/v5/qa/PLAYTHROUGH.md S2-1, S2-2, S3-4, S4;
 * the rules are in docs/v5/stories/QAFIX-WORLD/NOTES.md).
 */
import { describe, expect, it } from 'vitest';
import { Campaign } from '../src/game/campaign';
import { WORLD_RULES, partyArmy, type PartyState } from '../src/world/world';
import { campBlocker } from '../src/world/camp';
import type { Outcome } from '../src/game/loot';
import { armyLine, encounterCopy } from '../src/game/encounter';
import { setLang, t } from '../src/i18n';
import { fmtSigned } from '../src/i18n/numbers';

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

describe('S2-2: the encounter sheet counts the army right', () => {
  it('no man fit: "0 fit, 5 wounded", never more men than the army has, and the sheet says the wounded will fight', () => {
    const c = Campaign.fresh(7);
    c.data.heroes = c.data.heroes.slice(0, 5);
    for (const h of c.data.heroes) h.wound = 30;
    const a = armyLine(c);
    expect(a).toEqual({ fit: 0, wounded: 5, lastStand: true, key: 'wld.enc.armyLastStand' });
    expect(t(a.key, { fit: a.fit, w: a.wounded })).toBe('Your army: no man fit, 5 wounded. The wounded will fight.');
  });

  it('some wounded: fit + wounded is the army, and the odds count only the fit men who march', () => {
    const c = Campaign.fresh(7);
    c.data.heroes = c.data.heroes.slice(0, 5);
    c.data.heroes[0].wound = 30;
    c.data.heroes[1].wound = 30;
    const a = armyLine(c);
    expect(a).toEqual({ fit: 3, wounded: 2, lastStand: false, key: 'wld.enc.armyWounded' });
    expect(c.playerInfo().size).toBe(3);
    expect(c.fitHeroes().every((h) => (h.wound ?? 0) <= 0)).toBe(true);
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
