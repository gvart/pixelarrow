import { describe, expect, it } from 'vitest';
import { claimBlocker, claimFirstHint, claimNeed, claimView, eventHelp, eventLine, eventWhen, takeLine, TERRITORY } from '../../src/war/view/hud/explain';
import { EVENT_KINDS, EVENT_REGIONS } from '../../src/war/world/events';
import { regionCardHtml, type CardCtx } from '../../src/war/world-view/regionCard';
import { eventCardHtml } from '../../src/war/view/hud/worldEvents';
import type { BossSnap, ClaimSnap, LairSnap } from '../../src/war/types';

const claim = (o: Partial<ClaimSnap> = {}): ClaimSnap => ({ id: 0, x: 10, y: 10, team: -1, squad: -1, progress: 0, lairs: [], state: 'open', men: 3, players: 1, ...o });
const lair = (kind: LairSnap['kind'], o: Partial<LairSnap> = {}): LairSnap => ({ id: 0, kind, x: 0, y: 0, squad: 1, alive: 4, count: 6, state: 'home', aggro: 10, leash: 20, guard: 8, nodes: 0, ...o });
const boss = (o: Partial<BossSnap> = {}): BossSnap => ({ id: 'b', name: 'the Chimera', squad: 1, unit: 1, x: 0, y: 0, hp: 10, maxHp: 10, phase: 0, phases: [1], state: 'idle', raid: 0, scale: 1, ...o });
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ');

describe('world events in plain words', () => {
  it('says what, what to do and the full rule for every kind', () => {
    for (const kind of EVENT_KINDS) {
      const h = eventHelp({ kind, region: EVENT_REGIONS[kind][0] });
      expect(h.what.length, kind).toBeGreaterThan(20);
      expect(h.todo.length, kind).toBeGreaterThan(15);
      expect(h.rule.length, kind).toBeGreaterThan(h.what.length);
    }
    expect(eventLine({ kind: 'soulStorm', region: 'kleisoura' })).toBe('Soul storm: fallen warriors rise 4x as often in Kleisoura Pass, a chance for new men');
    expect(eventHelp({ kind: 'soulStorm', region: 'kleisoura' }).todo).toMatch(/squad.*claim the souls/);
  });

  it('names the boss and the landmark of the region', () => {
    expect(eventHelp({ kind: 'bossWake', region: 'canyons' }).what).toContain('The Chimera');
    expect(eventHelp({ kind: 'landmarkSiege', region: 'canyons' }).what).not.toContain('the landmark');
  });

  it('tells starts in from ends in', () => {
    expect(eventWhen({ startAt: 3_657_000, endAt: 9e9 }, 0)).toBe('starts in 1:00:57');
    expect(eventWhen({ startAt: 0, endAt: 125_000 }, 1000)).toBe('ends in 2:04');
  });

  it('the region card is a compact card: a short goal, chips for the clock and place, a map button; the rest in details', () => {
    const e = { id: 0, kind: 'soulStorm' as const, region: 'kleisoura', startAt: 3_657_000, endAt: 9e9 };
    const html = eventCardHtml(e, 'Kleisoura Pass', false, 0), t = text(html);
    expect(t).toContain('Next · Soul storm');
    expect(t).toContain('Claim souls in Kleisoura Pass');
    expect(html).toMatch(/class="qc-chip" title="starts in 1:00:57">.*in 1:00:57/);
    expect(t).toContain('Show on map');
    // the details fold: what to do and the full rule, behind (i)
    const more = html.slice(html.indexOf('class="qc-more"'));
    expect(html).toContain('data-qc-i');
    expect(text(more)).toContain('When it starts Go there with a squad');
    expect(text(more)).toContain('Stand a man within');
    expect(html.indexOf('Stand a man within')).toBeGreaterThan(html.indexOf('class="qc-more"'));
  });

  it('every event has a short goal, about six words, with no numbers', () => {
    for (const kind of EVENT_KINDS) for (const region of EVENT_REGIONS[kind]) {
      const g = eventHelp({ kind, region }).goal;
      expect(g.split(' ').length, g).toBeLessThanOrEqual(7);
      expect(g, g).not.toMatch(/[0-9]/);
    }
    expect(eventHelp({ kind: 'bossWake', region: 'canyons' }).goal).toBe('Slay the Chimera');
  });
});

describe('claiming in plain words', () => {
  it('reads the claim channel from the depth table', () => {
    expect(claimNeed(1)).toEqual({ men: 3, players: 1, secs: 30 });
    expect(claimNeed(2)).toEqual({ men: 6, players: 1, secs: 60 });
    expect(claimNeed(3)).toEqual({ men: 9, players: 2, secs: 90 });
    expect(claimNeed(4)).toEqual({ men: 12, players: 3, secs: 120 });
  });

  it('names what guards a locked point: the boss, the captain, else the lairs', () => {
    const c = claim({ state: 'locked', lairs: [0, 1, 2] });
    expect(claimBlocker(c, [lair('wolf'), lair('wolf'), lair('ibex', { guard: 0 })], [])).toBe('clear 2 wolf packs round it first');
    expect(claimBlocker(c, [lair('bandit', { captain: true }), lair('wolf')], [])).toBe('defeat the bandit captain first');
    expect(claimBlocker(c, [lair('wolf')], [boss()])).toBe('defeat the Chimera first');
    expect(claimBlocker(c, [lair('wolf')], [boss({ state: 'slain' })])).toBe('clear 1 wolf pack round it first');
  });

  it('gives each state and the next step', () => {
    const lairs = [lair('bear')];
    expect(claimView(claim({ state: 'locked', lairs: [0] }), 0, 1, lairs, []).state).toBe('Guarded: clear 1 bear den round it first.');
    expect(claimView(claim(), 0, 1, [], []).next).toContain('hold it with 3 men for 30 s');
    const ch = claimView(claim({ state: 'channel', progress: 0.4, squad: 3 }), 0, 1, [], []);
    expect(ch.label).toBe('Claiming 12/30 s');
    expect(ch.next).toContain('Keep 3 men within 5 tiles');
    expect(claimView(claim({ state: 'channel', men: 9, players: 2 }), 0, 3, [], []).next).toContain('2+ players');
    expect(claimView(claim({ state: 'claimed', team: 2 }), 0, 1, [], []).label).toBe('Held: Kyrene');
    expect(claimView(claim({ state: 'claimed', team: 0 }), 0, 1, [], []).next).toContain('B');
  });

  it('a held point: how to take it, the taking, and the holder warned', () => {
    expect(claimView(claim({ state: 'claimed', team: 2 }), 0, 2, [], []).state).toBe('Held by Kyrene: clear its defenders, then hold it 60 s to take it.');
    expect(claimView(claim({ state: 'claimed', team: 2 }), 0, 1, [], []).next).toContain('truce or pact');
    const mine = claimView(claim({ state: 'claimed', team: 2, taking: 'channel', by: 0, progress: 0.5, squad: 4 }), 0, 1, [], []);
    expect(mine).toMatchObject({ label: 'Taking 15/30 s', state: 'Taking it from Kyrene: 15 of 30 s.' });
    expect(claimView(claim({ state: 'claimed', team: 2, taking: 'defended', by: 0, squad: 4 }), 0, 1, [], []).label).toBe('Defended');
    const theirs = claimView(claim({ state: 'claimed', team: 0, taking: 'channel', by: 2, progress: 0.2, squad: 4 }), 0, 1, [], []);
    expect(theirs).toMatchObject({ label: 'Being taken!', tone: 'bad', state: 'Kyrene is taking it: 6 of 30 s.' });
    expect(TERRITORY).toContain('A point another alliance holds is taken the same way');
  });

  it('the build bar says how to get ground', () => {
    expect(claimFirstHint([claim()], 0, 1, [], [])).toMatch(/^No ground of yours here.*right-click the banner and hold it with 3 men for 30 s/);
    expect(claimFirstHint([claim({ state: 'locked', lairs: [0] })], 0, 2, [lair('bandit', { captain: true })], [])).toContain('opens once you defeat the bandit captain; then select your men, right-click the banner and hold it with 6 men for 60 s');
    expect(claimFirstHint([claim({ state: 'claimed', team: 1 })], 0, 1, [], [])).toContain('new men come only from souls');
  });

  it('the world map card says how to take a region', () => {
    expect(takeLine('dodona-n', -1, [0, 0, 0, 0], 0)).toBe('Unclaimed: clear the lairs guarding a claim point, then hold it with 3 men for 30 s.');
    expect(takeLine('canyons', -1, [0, 0, 0, 0], 0)).toBe('Unclaimed: defeat the Chimera, then hold it with 9 men of 2+ players for 90 s.');
    expect(takeLine('dodona', 0, [0, 0, 0, 0], 0)).toBe('Your home: it can never fall.');
    expect(takeLine('kleisoura', 2, [0, 0, 1, 0], 0)).toContain('Held by Kyrene (1 point)');
    const ctx: CardCtx = { you: 0, seen: true, mine: 0, quota: 150, mode: 'enter', color: () => '#336699', now: 0 };
    const html = regionCardHtml('canyons', { ...ctx, region: { id: 'canyons', owner: -1, claims: [0, 0, 0, 0], live: [0, 0, 0, 0], contested: false, besieged: false } });
    expect(text(html)).toContain('Unclaimed: defeat the Chimera');
    expect(html).toContain('How territory works');
    expect(TERRITORY).toContain('depth 3 9 men of 2+ players for 90 s');
  });
});
