/**
 * LF-01: the battle's live bugs from docs/v5/audit/PLAY.md, reproduced on a
 * real sim. B3 card and badge numerals, B5 the stale "Contact soon" hint,
 * B6 Shoot on with nothing in range.
 */
import { describe, expect, it, vi } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { generateEnemyArmy } from '../src/game/enemy';
import { standardArmy } from '../src/game/heroes';
import { Battle } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';

// battleHud.ts draws with Phaser; its HUD rules are pure. Phaser itself needs a browser.
vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C }, Scene: C } };
});
const { CONTACT_SOON_PACES, CONTACT_SOON_S, ContactSoon, NO_TARGET_S, OutOfRange, cardGroups, groupNumeral, nearestFoe, noTargetInRange } = await import('../src/ui/battleHud');

/** The player's army with nobody in group III (Reserve) and someone in IV (Flank): PLAY B3's case. */
function emptyReserve(): Battle {
  const ids = { nextId: 1 };
  const player = standardArmy(new Rng(1234), ids);
  for (const h of player) if (h.group === 2) h.group = 0;
  player[player.length - 1].group = 3;
  const enemy = generateEnemyArmy(new Rng(7), ids, player, 0).heroes;
  return new Battle({ seed: 7, armies: [armySpec(player, false), armySpec(enemy, true)] });
}

describe('B3: a group keeps its numeral from deployment to the end', () => {
  it('the card and the field badge agree with an empty Reserve, in deployment and in battle', () => {
    const b = emptyReserve();
    const flank = b.groups.find((g) => g.side === 0 && g.name === 'Flank')!;
    expect(b.members(flank.id).length).toBeGreaterThan(0);
    const deployCard = cardGroups(b, 0, true).find((c) => c.gid === flank.id)!;
    expect(deployCard.numeral).toBe('IV');
    expect(groupNumeral(b.groups, flank.id)).toBe('IV');
    b.startBattle();
    for (let i = 0; i < 40; i++) b.step();
    const battleCard = cardGroups(b, 0, false).find((c) => c.gid === flank.id)!;
    expect(battleCard.numeral).toBe('IV');
    expect(groupNumeral(b.groups, flank.id)).toBe(battleCard.numeral);
  });

  it('a wiped-out group never renumbers the others', () => {
    const b = emptyReserve();
    b.startBattle();
    const phalanx = b.groups.find((g) => g.side === 0 && g.name === 'Phalanx')!;
    for (const u of b.members(phalanx.id)) u.state = 'dead';
    const cards = cardGroups(b, 0, false);
    for (const c of cards) expect(c.numeral).toBe(groupNumeral(b.groups, c.gid));
  });

  it('men fighting alone show a star', () => {
    const b = emptyReserve();
    b.startBattle();
    const u = b.units.find((x) => x.side === 0 && x.state === 'ready')!;
    b.issue(0, { kind: 'detach', unit: u.id });
    b.step();
    const solo = b.groups.find((g) => g.individual && g.side === 0)!;
    expect(groupNumeral(b.groups, solo.id)).toBe('*');
    expect(cardGroups(b, 0, false).find((c) => c.gid === solo.id)?.numeral).toBe('*');
  });
});

/** A battle just started (the armies at their deployment lines) and the player's Flank group. */
function started(): { b: Battle; gid: number } {
  const b = emptyReserve();
  b.startBattle();
  return { b, gid: b.groups.find((g) => g.side === 0 && g.name === 'Flank')!.id };
}

/** Leave one enemy standing, `d` paces in front of the group's first man. */
function foeAt(b: Battle, gid: number, d: number): void {
  const u = b.activeMembers(gid)[0];
  const e = b.units.find((x) => x.side === 1 && x.state === 'ready')!;
  for (const x of b.units) if (x.side === 1 && x !== e) x.state = 'fled';
  e.x = u.x;
  e.y = u.y + d;
}

describe('B5: "Contact soon" never goes stale', () => {
  it('is not said while the enemy is far away (PLAY: 30 s with nothing nearby)', () => {
    const { b, gid } = started();
    expect(nearestFoe(b, gid)).toBeGreaterThan(CONTACT_SOON_PACES);
    const soon = new ContactSoon();
    for (let s = 0; s <= 30; s++) expect(soon.check(b, gid, s)).toBe(false);
  });

  it('is said when an enemy comes within 6 paces, and clears after 6 s', () => {
    const { b, gid } = started();
    foeAt(b, gid, CONTACT_SOON_PACES - 1);
    const soon = new ContactSoon();
    expect(soon.check(b, gid, 10)).toBe(true);
    expect(soon.check(b, gid, 10 + CONTACT_SOON_S - 0.1)).toBe(true);
    expect(soon.check(b, gid, 10 + CONTACT_SOON_S)).toBe(false);
    expect(soon.check(b, gid, 40)).toBe(false);
  });

  it('clears when the enemy draws away, and starts afresh when one closes again', () => {
    const { b, gid } = started();
    const soon = new ContactSoon();
    foeAt(b, gid, 3);
    expect(soon.check(b, gid, 0)).toBe(true);
    foeAt(b, gid, 20);
    expect(soon.check(b, gid, 1)).toBe(false);
    foeAt(b, gid, 3);
    expect(soon.check(b, gid, 30)).toBe(true);
  });
});

describe('B6: Shoot on with nothing in range says so on the card', () => {
  /** A started battle and the player's missile group (Shoot is on by default for pure missile-men). */
  function shooters(): { b: Battle; gid: number; range: number } {
    const { b } = started();
    const g = b.groups.find((x) => x.side === 0 && b.activeMembers(x.id).some((u) => u.stats.range > 0 && u.ammo > 0))!;
    expect(g.fireAtWill).toBe(true);
    return { b, gid: g.id, range: Math.max(...b.activeMembers(g.id).map((u) => u.stats.range)) };
  }

  it('at the deployment lines nobody is in range, and after 3 s the card says Out of range', () => {
    const { b, gid } = shooters();
    expect(noTargetInRange(b, gid)).toBe(true);
    const oor = new OutOfRange();
    expect(oor.check(b, gid, 0)).toBe(false);
    expect(oor.check(b, gid, NO_TARGET_S)).toBe(false);
    expect(oor.check(b, gid, NO_TARGET_S + 0.1)).toBe(true);
  });

  it('clears as soon as an enemy is in range', () => {
    const { b, gid, range } = shooters();
    const oor = new OutOfRange();
    oor.check(b, gid, 0);
    expect(oor.check(b, gid, 10)).toBe(true);
    foeAt(b, gid, range - 1);
    expect(noTargetInRange(b, gid)).toBe(false);
    expect(oor.check(b, gid, 11)).toBe(false);
  });

  it('is never shown with Shoot off, or once the missiles are spent', () => {
    const { b, gid } = shooters();
    b.issue(0, { kind: 'loose', group: gid, on: false });
    expect(noTargetInRange(b, gid)).toBe(false);
    b.issue(0, { kind: 'loose', group: gid, on: true });
    expect(noTargetInRange(b, gid)).toBe(true);
    for (const u of b.activeMembers(gid)) u.ammo = 0;
    expect(noTargetInRange(b, gid)).toBe(false);
  });
});
