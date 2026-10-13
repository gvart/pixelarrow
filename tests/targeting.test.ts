/**
 * CT-02 targeting (design/gdd/controls.md R3): a tap on an enemy focuses a
 * missile group's fire, the range ring, "Out of range" on the card (B6
 * complete) and "Advance to range". Real sims; battleHud's rules are pure.
 */
import { describe, expect, it, vi } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { generateEnemyArmy } from '../src/game/enemy';
import { standardArmy } from '../src/game/heroes';
import { Battle, DT, TICK_RATE } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { setLang, t, type TKey } from '../src/i18n';
import { measureText } from '../src/ui/textfit';

vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C }, Scene: C } };
});
const { KEY_MIN_W, OutOfRange, advanceToRange, enemyTap, groupCentre, isMissileGroup, medianRange, noTargetInRange, orderKeyWidths, orderLabels, rangeRing } = await import('../src/ui/battleHud');

/** A started battle (armies at their deployment lines), the player's missile group and a melee group. */
function started(seed = 7): { b: Battle; shooters: number; melee: number } {
  const ids = { nextId: 1 };
  const player = standardArmy(new Rng(1234), ids);
  const enemy = generateEnemyArmy(new Rng(seed), ids, player, 0).heroes;
  const b = new Battle({ seed, armies: [armySpec(player, false), armySpec(enemy, true)] });
  b.startBattle();
  const mine = b.groups.filter((g) => g.side === 0 && b.activeMembers(g.id).length > 0);
  const shooters = mine.find((g) => b.activeMembers(g.id).every((u) => u.stats.range > 0))!.id;
  const melee = mine.find((g) => !isMissileGroup(b, g.id))!.id;
  return { b, shooters, melee };
}

/** The enemy groups that have men, farthest from `gid` first. */
function foes(b: Battle, gid: number): number[] {
  const c = groupCentre(b, gid)!;
  return b.groups
    .filter((g) => g.side === 1 && b.activeMembers(g.id).length > 0)
    .map((g) => ({ id: g.id, d: Math.hypot(groupCentre(b, g.id)!.x - c.x, groupCentre(b, g.id)!.y - c.y) }))
    .sort((a, b2) => b2.d - a.d)
    .map((g) => g.id);
}

const runFor = (b: Battle, s: number) => {
  for (let i = 0; i < s * TICK_RATE && b.phase === 'battle'; i++) b.step();
};

describe('R3.1-2: a tap on an enemy', () => {
  it('with a missile group selected focuses its fire on that group; a second tap clears it', () => {
    const { b, shooters } = started();
    const foe = foes(b, shooters)[0];
    expect(isMissileGroup(b, shooters)).toBe(true);
    const tap = enemyTap(b, shooters, foe);
    expect(tap).toEqual({ kind: 'focus', target: foe });
    b.issue(0, { kind: 'focus', group: shooters, target: foe });
    expect(b.groups[shooters].focus).toBe(foe);
    expect(enemyTap(b, shooters, foe)).toEqual({ kind: 'focus', target: -1 });
    // another enemy group moves the focus instead of clearing it
    const other = foes(b, shooters)[1];
    expect(enemyTap(b, shooters, other)).toEqual({ kind: 'focus', target: other });
  });

  it('with a melee group, or shooters out of missiles, attacks as before', () => {
    const { b, shooters, melee } = started();
    const foe = foes(b, shooters)[0];
    expect(enemyTap(b, melee, foe)).toEqual({ kind: 'attack' });
    for (const u of b.activeMembers(shooters)) u.ammo = 0;
    expect(enemyTap(b, shooters, foe)).toEqual({ kind: 'attack' });
  });
});

describe('R3.3: the range ring', () => {
  it('is drawn at the median range round a missile group, and not for a melee group', () => {
    const { b, shooters, melee } = started();
    expect(rangeRing(b, melee)).toBeNull();
    const r = medianRange(b, shooters);
    expect(r).toBeGreaterThan(0);
    const c = groupCentre(b, shooters)!;
    const ring = rangeRing(b, shooters, 32)!;
    expect(ring).toHaveLength(32);
    for (const p of ring) {
      // never short of the range; longer only where the ground falls away (+0.8 a height level)
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      expect(d).toBeGreaterThanOrEqual(r - 1e-9);
      expect(d - r).toBeLessThanOrEqual(0.8 * 4 + 1e-9);
    }
  });

  it('takes the median, not the longest weapon', () => {
    const { b, shooters } = started();
    const mem = b.activeMembers(shooters);
    mem.forEach((u, i) => (u.stats = { ...u.stats, range: i === 0 ? 30 : 10 }));
    if (mem.length >= 3) expect(medianRange(b, shooters)).toBe(10);
  });
});

describe('R3.4: Out of range on the card (B6 complete)', () => {
  it('says so at once when the focused group is beyond every shooter, and not with Shoot off', () => {
    const { b, shooters } = started();
    const foe = foes(b, shooters)[0];
    b.issue(0, { kind: 'focus', group: shooters, target: foe });
    b.issue(0, { kind: 'order', group: shooters, order: 'hold' });
    b.step();
    expect(b.groups[shooters].focusOutOfRange).toBe(true);
    const oor = new OutOfRange();
    expect(oor.check(b, shooters, b.tick * DT)).toBe(true);
    b.issue(0, { kind: 'loose', group: shooters, on: false });
    b.step();
    expect(oor.check(b, shooters, b.tick * DT)).toBe(false);
  });

  it('no missile group idles more than 10 s out of range without its card saying so', () => {
    for (const seed of [7, 11, 23]) {
      const { b, shooters } = started(seed);
      // the worst case: hold back and focus the farthest enemy group
      b.issue(0, { kind: 'order', group: shooters, order: 'hold' });
      b.issue(0, { kind: 'focus', group: shooters, target: foes(b, shooters)[0] });
      const oor = new OutOfRange();
      let silent = 0;
      let worst = 0;
      for (let i = 0; i < 40 * TICK_RATE && b.phase === 'battle'; i++) {
        b.step();
        const g = b.groups[shooters];
        const idleFar = g.fireAtWill && isMissileGroup(b, shooters) && (g.focusOutOfRange === true || noTargetInRange(b, shooters));
        const says = oor.check(b, shooters, b.tick * DT);
        silent = idleFar && !says ? silent + DT : 0;
        worst = Math.max(worst, silent);
      }
      // the AC allows 10 s; the card says it after 3 s (and a few ticks)
      expect(worst).toBeLessThanOrEqual(3.25);
      expect(worst).toBeLessThan(10);
    }
  });

  it('"Advance to range" walks the group until its focus is in range', () => {
    const { b, shooters } = started();
    const foe = foes(b, shooters)[0];
    b.issue(0, { kind: 'focus', group: shooters, target: foe });
    // the enemy stands still, so the walk alone must close the distance
    for (const g of b.groups) if (g.side === 1) b.issue(1, { kind: 'order', group: g.id, order: 'hold' });
    b.step();
    expect(b.groups[shooters].focusOutOfRange).toBe(true);
    const f = advanceToRange(b, shooters)!;
    expect(f).not.toBeNull();
    // it faces the target, and stops at 90% of the median range from it
    b.issue(0, { kind: 'form', group: shooters, cx: f.cx, cy: f.cy, fx: f.fx, fy: f.fy, frontage: b.groups[shooters].formation.frontage });
    let inRange = false;
    for (let s = 0; s < 40 && !inRange && b.phase === 'battle'; s++) {
      runFor(b, 1);
      inRange = b.groups[shooters].focus === -1 || b.groups[shooters].focusOutOfRange === false;
    }
    expect(inRange).toBe(true);
  });
});

it('R9: a canvas too narrow for the full words (Telegram full screen at 320x568) shows the keys as icons', () => {
  setLang('ru');
  const full = ['battle.ring.advance', 'battle.ring.charge', 'battle.ring.hold', 'battle.ring.shoot', 'battle.ring.back'].map((k) => t(k as TKey));
  expect(orderLabels(full, 137 - 8, 3)).toEqual({ words: full, iconOnly: true });
  setLang('en');
});

describe('R9 and V5-063: an order key keeps one name at every width, never cut, never under the text floor (QA-03 S4)', () => {
  const KEYS: TKey[] = ['battle.ring.advance', 'battle.ring.charge', 'battle.ring.hold', 'battle.ring.shoot', 'battle.ring.back'];
  for (const lang of ['en', 'ru'] as const) {
    for (const css of [320, 360, 390]) {
      it(`${lang} at ${css}`, () => {
        setLang(lang);
        // the bar: 4 UI px margins, 3 UI px gaps (1 UI px = 2 CSS px)
        const vw = Math.floor(css / 2);
        for (const fifth of [KEYS[4], 'attn.feint' as TKey]) {
          const full = [...KEYS.slice(0, 4), fifth].map((k) => t(k));
          const { words: labels, iconOnly } = orderLabels(full, vw - 8, 3);
          // the same words at every width: never "Adv." or "Back off"
          expect(labels).toEqual(full);
          if (iconOnly) continue;
          const w = orderKeyWidths(labels, vw - 8, 3);
          expect(w.reduce((a, x) => a + x, 0) + 3 * 4).toBeLessThanOrEqual(vw - 8);
          labels.forEach((l, i) => {
            expect(w[i]).toBeGreaterThanOrEqual(KEY_MIN_W);
            // KeyButton writes Inter at 6.5 (the floor) in its width less 4
            expect(measureText(l, true, 6.5), l).toBeLessThanOrEqual(w[i] - 4);
          });
        }
        // words, not icons, from 360 up
        if (css >= 360) expect(orderLabels([...KEYS].map((k) => t(k)), vw - 8, 3).iconOnly).toBe(false);
        setLang('en');
      });
    }
  }
});
