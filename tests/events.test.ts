/**
 * EV-01: the overland event engine (design/gdd/campaign-events.md R1-R4, F1).
 * The deck here is a minimal test deck; the real one is EV-02's.
 */
import { describe, expect, it } from 'vitest';
import { Campaign, captainBounty } from '../src/game/campaign';
import { EVENT_DECK, EVENT_RULES, EV_KEY, fx, type EventDef } from '../src/data/events';
import { liveDeck } from '../src/data/eventDeck';
import { deserialize, migrate, serialize } from '../src/game/save';
import { FLAGS_CAP, JOURNAL_CAP, bountyMultOf, partyArmy } from '../src/world/world';
import { applyBattleBonus, resolveBattle, type Outcome } from '../src/game/loot';
import { MAX_ARMY } from '../src/data/units';
import { itemValue } from '../src/data/items';
import { gearTotal } from '../src/game/gear';
import { makeHero, makeItem } from '../src/game/heroes';
import { Rng } from '../src/sim/rng';
import type { BattleResult, UnitResult } from '../src/sim/types';

const FIXTURES = import.meta.glob<string>('./fixtures/saves/*.json', { eager: true, query: '?raw', import: 'default' });

/** A minimal deck exercising the triggers, a cost, a chance and the deserters chain. */
const DECK: EventDef[] = [
  {
    id: 'deserters', trigger: 'march', weight: 1, cond: { notFlags: ['deserters_joined'] }, cooldownDays: 2,
    choices: [
      { key: 'take', effects: [fx.recruit('raw', 1, 2), fx.setFlag('deserters_joined')] },
      { key: 'away', effects: [] },
      { key: 'rob', effects: [fx.gold(30)], chance: { p: 0.5, fail: [fx.wound('one_random', 24)] } },
    ],
  },
  {
    id: 'shrine', trigger: 'march', weight: 1, cond: {}, cooldownDays: 2,
    choices: [
      { key: 'offer', cost: [fx.gold(-30)], effects: [fx.nextBattle('xp')] },
      { key: 'pass', effects: [] },
    ],
  },
  {
    id: 'deserters_hunt', trigger: 'flag', weight: 1, cond: { flags: ['deserters_joined'] }, unique: true, cooldownDays: 0,
    after: { flag: 'deserters_joined', days: [4, 8] },
    choices: [
      { key: 'fight', effects: [fx.spawnBand('mercs', { captain: true, hunts: true, bountyMult: 2 })] },
      { key: 'hand', effects: [fx.gold(60)] },
    ],
  },
  { id: 'village_fair', trigger: 'arrive_village', weight: 1, cond: {}, cooldownDays: 0, choices: [{ key: 'ok', effects: [fx.food(10)] }, { key: 'no', effects: [] }] },
  { id: 'camp_night', trigger: 'camp', weight: 1, cond: {}, cooldownDays: 0, choices: [{ key: 'ok', effects: [fx.supplies(5)] }, { key: 'no', effects: [] }] },
  { id: 'spoils', trigger: 'after_battle', weight: 1, cond: {}, cooldownDays: 0, choices: [{ key: 'ok', effects: [fx.gold(10)] }, { key: 'no', effects: [] }] },
];

/** A campaign whose world draws from `deck`, with no bands to interrupt the march. */
function camp(seed = 7, deck: readonly EventDef[] = DECK): Campaign {
  const c = Campaign.fresh(seed);
  c.world.deck = deck;
  c.world.s.parties = [];
  c.world.s.lastSpawn = 1e12; // and none spawn
  return c;
}

/** Reload a campaign through the save format (as after the app was killed). */
function reload(c: Campaign, deck: readonly EventDef[] = DECK): Campaign {
  const r = new Campaign(deserialize(serialize(c.sync()))!);
  r.world.deck = deck;
  return r;
}

/** The two far ends of the map's settlements, to march between. */
function legs(c: Campaign) {
  const w = c.world;
  const home = w.map.settlements[w.map.start];
  const byDistance = w.map.settlements.filter((s) => s.kind !== 'lair').sort((a, b) => Math.hypot(b.x - home.x, b.y - home.y) - Math.hypot(a.x - home.x, a.y - home.y));
  // the farthest one the party can walk to
  const far = byDistance.find((s) => w.setDestination(s.x, s.y))!;
  w.stop();
  return [far, home];
}

/** March back and forth for up to `hours`; stop at the first event drawn and return its id. */
function marchUntilEvent(c: Campaign, hours = 24 * 20): string | null {
  const w = c.world;
  const [a, b] = legs(c);
  for (let t = 0, leg = 0; t < hours; ) {
    if (!w.moving) {
      const to = leg++ % 2 === 0 ? a : b;
      w.setDestination(to.x, to.y);
    }
    const r = w.advance(1, c.playerInfo());
    t += Math.max(r.hours, 0.05);
    const ev = r.events.find((e) => e.type === 'event');
    if (ev?.type === 'event') return ev.id;
  }
  return null;
}

/** Play `n` events: march, and resolve each with a fixed policy. Returns the journal. */
function play(c: Campaign, n: number, pick: (keys: string[]) => string): string[] {
  for (let i = 0; i < n; i++) {
    if (!marchUntilEvent(c)) break;
    const pe = c.pendingEvent()!;
    const open = pe.choices.filter((ch) => !ch.blocked).map((ch) => ch.key);
    c.chooseEvent(pick(open));
  }
  return c.world.s.journal;
}

describe('event draw (R3)', () => {
  it('a march draws an event from the deck and saves it as pendingEvent', () => {
    const c = camp();
    const id = marchUntilEvent(c);
    expect(id).not.toBeNull();
    expect(c.world.s.pendingEvent).toMatchObject({ id });
  });

  it('the same save and the same actions draw the same events (AC 1)', () => {
    const policy = (keys: string[]) => keys[keys.length - 1];
    const a = camp(21);
    const b = camp(21);
    const ja = play(a, 6, policy);
    expect(ja.length).toBeGreaterThanOrEqual(4);
    expect(play(b, 6, policy)).toEqual(ja);
    expect(b.data.gold).toBe(a.data.gold);
    expect(b.data.heroes.map((h) => [h.id, h.wound])).toEqual(a.data.heroes.map((h) => [h.id, h.wound]));
    // frame timing does not matter: the same march in smaller steps draws the same first event
    const c = camp(21);
    const d = camp(21);
    const [to] = legs(c);
    c.world.setDestination(to.x, to.y);
    d.world.setDestination(to.x, to.y);
    let ec: string | null = null;
    let ed: string | null = null;
    for (let i = 0; i < 400 && !ec; i++) ec = c.world.advance(1, c.playerInfo()).events.find((e) => e.type === 'event') ? c.world.s.pendingEvent!.id : null;
    for (let i = 0; i < 1600 && !ed; i++) ed = d.world.advance(0.25, d.playerInfo()).events.find((e) => e.type === 'event') ? d.world.s.pendingEvent!.id : null;
    expect(ed).toBe(ec);
    expect(d.world.s.time).toBeCloseTo(c.world.s.time, 5);
  });

  it('different worlds draw at different times', () => {
    const times = [3, 4, 5, 6].map((s) => {
      const c = camp(s);
      marchUntilEvent(c);
      return Math.round(c.world.s.time);
    });
    expect(new Set(times).size).toBeGreaterThan(1);
  });

  it('paces events: at most EVENTS_PER_DAY per day and EVENT_MIN_GAP_H between them', () => {
    const c = camp(9);
    const times: number[] = [];
    for (let i = 0; i < 8; i++) {
      if (!marchUntilEvent(c)) break;
      times.push(c.world.s.time);
      // the last choice: never a hunting band that would end the march
      c.chooseEvent(c.pendingEvent()!.choices.filter((ch) => !ch.blocked).at(-1)!.key);
    }
    expect(times.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(EVENT_RULES.minGapH - 1e-6);
    const days = times.map((t) => Math.floor(t / 24));
    expect(new Set(days).size).toBe(days.length);
  });

  it('roughly matches the march rate: one check per 12 h of travel at 10%', () => {
    // no gap, no cap: count the checks that hit over a long march
    const c = camp(13, [{ id: 'x', trigger: 'march', weight: 1, cond: {}, cooldownDays: 0, choices: [{ key: 'a', effects: [] }, { key: 'b', effects: [] }] }]);
    let hits = 0;
    const start = c.world.s.time;
    while (c.world.s.time - start < 24 * 100) {
      if (!marchUntilEvent(c, 24 * 100)) break;
      hits++;
      c.chooseEvent('a');
      c.world.s.eventsToday = [0, 0];
      delete c.world.s.eventCd[EV_KEY.gap];
    }
    const checks = (c.world.s.time - start) / EVENT_RULES.marchEveryH;
    expect(hits / checks).toBeGreaterThan(0.05);
    expect(hits / checks).toBeLessThan(0.16);
  });

  it('the map pauses while an event is pending (R4.2)', () => {
    const c = camp();
    marchUntilEvent(c);
    const t = c.world.s.time;
    const food = c.world.food;
    const r = c.world.advance(5, c.playerInfo());
    expect(r.hours).toBe(0);
    expect(r.events).toEqual([{ type: 'event', id: c.world.s.pendingEvent!.id }]);
    expect(c.world.s.time).toBe(t);
    expect(c.world.food).toBe(food);
  });

  it('the shipped deck is EV-02 content (live since EV-03); an empty deck draws nothing and leaves the march unchanged', () => {
    expect(EVENT_DECK).toEqual([]);
    const a = Campaign.fresh(5);
    const b = Campaign.fresh(5);
    expect(a.world.deck).toBe(liveDeck());
    a.world.deck = EVENT_DECK;
    b.world.deck = [];
    const [to] = legs(a);
    a.world.setDestination(to.x, to.y);
    b.world.setDestination(to.x, to.y);
    for (let i = 0; i < 200; i++) {
      const ra = a.world.advance(1, a.playerInfo());
      const rb = b.world.advance(1, b.playerInfo());
      expect(ra.events.some((e) => e.type === 'event')).toBe(false);
      expect(ra).toEqual(rb);
    }
    expect(a.world.s.pendingEvent).toBeUndefined();
    expect(a.world.s.eventCd).toEqual({});
  });

  it('arrival, camp and after-battle triggers draw their own events', () => {
    // arrival: walk into a village
    const c = camp(17, DECK.filter((d) => d.trigger === 'arrive_village'));
    const villages = c.world.map.settlements.filter((s) => s.kind === 'village');
    let arrived = 0;
    for (const v of villages.concat(villages, villages)) {
      c.world.s.inside = -1;
      if (!c.world.setDestination(v.x, v.y, v.id)) continue;
      for (let i = 0; i < 400; i++) {
        const r = c.world.advance(1, c.playerInfo());
        if (r.events.some((e) => e.type === 'arrive')) {
          arrived++;
          break;
        }
      }
      if (c.world.s.pendingEvent) break;
      c.world.s.eventsToday = [0, 0];
      delete c.world.s.eventCd[EV_KEY.gap];
    }
    expect(arrived).toBeGreaterThan(0);
    expect(c.world.s.pendingEvent?.id).toBe('village_fair');
    // camp: nights in camp
    const k = camp(17, DECK.filter((d) => d.trigger === 'camp'));
    const [far] = legs(k);
    k.world.setDestination(far.x, far.y);
    for (let i = 0; i < 6 && !k.world.camp; i++) {
      k.world.advance(1, k.playerInfo());
      k.world.makeCamp();
    }
    expect(k.world.camp).not.toBeNull();
    for (let n = 0; n < 60 && !k.world.s.pendingEvent; n++) k.world.advance(24, k.playerInfo(), true);
    expect(k.world.s.pendingEvent?.id).toBe('camp_night');
    // after battle: a won party battle rolls the after_battle trigger
    let hit = 0;
    for (let s = 1; s <= 30; s++) {
      const b = camp(s, DECK.filter((d) => d.trigger === 'after_battle'));
      b.data.fought = s;
      b.afterPartyBattle(-1, outcome());
      if (b.world.s.pendingEvent?.id === 'spoils') hit++;
    }
    expect(hit).toBeGreaterThan(2);
    expect(hit).toBeLessThan(16);
  });
});

describe('resolving an event (R4)', () => {
  it('pendingEvent is in the save before display: a reload shows the same event and outcome (AC 2)', () => {
    let tried = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const c = camp(seed, DECK.filter((d) => d.id === 'deserters'));
      if (!marchUntilEvent(c)) continue; // a quiet world: no event in 20 days
      tried++;
      const killed = reload(c, DECK); // the app is killed with the card open
      expect(killed.world.s.pendingEvent).toEqual(c.world.s.pendingEvent);
      expect(killed.pendingEvent()!.def.id).toBe('deserters');
      const a = c.chooseEvent('rob')!;
      const b = killed.chooseEvent('rob')!;
      expect(b).toEqual(a);
      expect(killed.sync()).toEqual(c.sync());
    }
    expect(tried).toBeGreaterThanOrEqual(5);
  });

  it('applies the cost, rolls the chance from the seed, clears the event and writes the journal', () => {
    let ok = 0;
    let fail = 0;
    for (let seed = 1; seed <= 14; seed++) {
      const c = camp(seed, DECK.filter((d) => d.id === 'deserters'));
      if (!marchUntilEvent(c)) continue;
      const gold = c.data.gold;
      const r = c.chooseEvent('rob')!;
      expect(c.world.s.pendingEvent).toBeUndefined();
      if (r.ok) {
        ok++;
        expect(c.data.gold).toBe(gold + 30);
        expect(c.world.s.journal.at(-1)).toBe('deserters:rob');
      } else {
        fail++;
        expect(c.data.gold).toBe(gold);
        expect(c.data.heroes.some((h) => h.wound === 24)).toBe(true);
        expect(c.world.s.journal.at(-1)).toBe('deserters:rob:fail');
      }
    }
    expect(ok).toBeGreaterThan(0);
    expect(fail).toBeGreaterThan(0);
  });

  it('a choice whose cost cannot be paid is disabled with the reason (R4.4)', () => {
    const c = camp(4, DECK.filter((d) => d.id === 'shrine'));
    marchUntilEvent(c);
    c.data.gold = 20;
    const pe = c.pendingEvent()!;
    expect(pe.choices).toEqual([
      { key: 'offer', blocked: { why: 'gold', need: 30, have: 20 } },
      { key: 'pass', blocked: null },
    ]);
    expect(c.chooseEvent('offer')).toBeNull();
    expect(c.world.s.pendingEvent).toBeDefined();
    c.data.gold = 30;
    expect(c.chooseEvent('offer')!.ok).toBe(true);
    expect(c.data.gold).toBe(0);
    expect(c.world.hasFlag(EV_KEY.next('xp'))).toBe(true);
  });

  it('recruits join for free up to the army cap; a full army cannot take them', () => {
    const c = camp(6, DECK.filter((d) => d.id === 'deserters'));
    marchUntilEvent(c);
    const n = c.data.heroes.length;
    const gold = c.data.gold;
    c.chooseEvent('take');
    expect(c.data.heroes.length).toBe(n + 2);
    expect(c.data.gold).toBe(gold);
    expect(new Set(c.data.heroes.map((h) => h.id)).size).toBe(c.data.heroes.length);
    // a full army
    const f = camp(6, DECK.filter((d) => d.id === 'deserters'));
    marchUntilEvent(f);
    while (f.data.heroes.length < MAX_ARMY) f.data.heroes.push(makeHero(new Rng(f.data.heroes.length), f.data, 'greek', 'raw', 1, 1));
    expect(f.pendingEvent()!.choices[0].blocked).toEqual({ why: 'room', need: MAX_ARMY, have: MAX_ARMY });
    // one place left: one joins, the other is refused
    f.data.heroes.pop();
    expect(f.chooseEvent('take')!.notes).toContain('room');
    expect(f.data.heroes.length).toBe(MAX_ARMY);
  });

  it('an event id the deck no longer holds is dropped instead of pausing the map forever', () => {
    const c = camp();
    marchUntilEvent(c);
    const r = reload(c, []);
    expect(r.pendingEvent()).toBeNull();
    expect(r.world.s.pendingEvent).toBeUndefined();
    expect(r.world.advance(1, r.playerInfo()).hours).toBeGreaterThan(0);
  });
});

describe('flags and chains (AC 3)', () => {
  it('deserters -> deserters_hunt: the flag makes the follow-up due 4-8 days later, once', () => {
    const c = camp(8, DECK.filter((d) => d.id === 'deserters' || d.id === 'deserters_hunt'));
    expect(marchUntilEvent(c)).toBe('deserters');
    c.chooseEvent('take');
    const set = c.world.s.flags.deserters_joined;
    expect(set).toBe(c.world.today);
    // not before its delay
    const id = marchUntilEvent(c, 24 * 30);
    expect(id).toBe('deserters_hunt');
    const waited = c.world.today - set;
    expect(waited).toBeGreaterThanOrEqual(4);
    expect(waited).toBeLessThanOrEqual(8);
    // stand and fight: a hunting band with a captain and a double bounty
    const before = c.world.s.parties.length;
    c.chooseEvent('fight');
    expect(c.world.s.parties.length).toBe(before + 1);
    const band = c.world.s.parties.at(-1)!;
    expect(band).toMatchObject({ kind: 'mercs', hunts: true, bountyMult: 2, mode: 'chase' });
    expect(band.tier).toBeGreaterThanOrEqual(2);
    expect(bountyMultOf(band)).toBe(2);
    // unique: never again, even with the flag still set
    expect(c.world.s.eventCd.deserters_hunt).toBe(EVENT_RULES.usedDay);
    c.world.s.parties = [];
    expect(marchUntilEvent(c, 24 * 10)).toBeNull();
  });

  it('a hunting band chases a far stronger party', () => {
    const c = camp(8);
    const band = c.world.spawnEventBand('bandits', { hunts: true, size: 0.3 }, new Rng(4))!;
    expect(band.size).toBeGreaterThan(0);
    const d0 = Math.hypot(band.x - c.world.s.x, band.y - c.world.s.y);
    for (let i = 0; i < 20; i++) c.world.advance(0.25, { ...c.playerInfo(), power: band.power * 10 });
    const b = c.world.party(band.id);
    expect(b?.mode ?? 'chase').toBe('chase');
    if (b) expect(Math.hypot(b.x - c.world.s.x, b.y - c.world.s.y)).toBeLessThan(d0);
  });

  it('notFlags and the arc stage gate events; the arc sets host_musters as a flag', () => {
    const host: EventDef = { id: 'host_musters', trigger: 'flag', weight: 1, cond: {}, unique: true, cooldownDays: 0, after: { flag: 'host_musters', days: [0, 0] }, choices: [{ key: 'arms', effects: [] }] };
    const c = camp(12, [host]);
    expect(c.world.advance(2, c.playerInfo()).events).toEqual([]);
    expect(c.world.setFlag('host_musters')).toBe(true);
    const r = c.world.advance(2, c.playerInfo());
    expect(r.events).toEqual([{ type: 'event', id: 'host_musters' }]);
    // flag events ignore the gap but count toward the daily cap
    expect(c.world.s.eventsToday).toEqual([c.world.today, 1]);
  });

  it('flags are capped at FLAGS_CAP keys and the journal at JOURNAL_CAP lines', () => {
    const c = camp();
    for (let i = 0; i < FLAGS_CAP; i++) expect(c.world.setFlag(`f${i}`)).toBe(true);
    expect(c.world.setFlag('one_too_many')).toBe(false);
    expect(c.world.setFlag('f3', 9)).toBe(true);
    for (let i = 0; i < JOURNAL_CAP + 5; i++) c.world.logJournal(`e${i}:a`);
    expect(c.world.s.journal).toHaveLength(JOURNAL_CAP);
    expect(c.world.s.journal.at(-1)).toBe(`e${JOURNAL_CAP + 4}:a`);
  });
});

describe('effects (R2)', () => {
  /** Resolve a one-choice event with `effects` on a fresh campaign. */
  function resolve(effects: ReturnType<typeof fx.gold>[], seed = 3): Campaign {
    const def: EventDef = { id: 'fx', trigger: 'march', weight: 1, cond: {}, cooldownDays: 0, choices: [{ key: 'go', effects }, { key: 'no', effects: [] }] };
    const c = camp(seed, [def]);
    c.world.s.pendingEvent = { id: 'fx', seed: 99 };
    expect(c.chooseEvent('go')).not.toBeNull();
    return c;
  }

  it('gold, food and supplies are clamped at 0 and the caps', () => {
    const c = resolve([fx.gold(-10_000), fx.food(-10_000), fx.supplies(25)]);
    expect(c.data.gold).toBe(0);
    expect(c.world.food).toBe(0);
    expect(c.world.supplies).toBeGreaterThan(0);
  });

  it('xp, wounds, heal and items', () => {
    const c = resolve([fx.xp('all', 5), fx.wound('lowest', 12), fx.item('rare', 'helmet')]);
    expect(c.data.heroes.every((h) => h.xp >= 5 || h.level > 1)).toBe(true);
    expect(c.data.heroes.filter((h) => h.wound === 12)).toHaveLength(1);
    const it = c.data.stash.at(-1)!;
    expect(it.rarity).toBe('rare');
    expect(c.data.stash.filter((x) => x.uid === it.uid)).toHaveLength(1);
    expect(resolve([fx.wound('all', 12), fx.heal()]).wounded()).toHaveLength(0);
  });

  it('nextBattle, retrain, setFlag and clearFlag ride the flags', () => {
    const c = resolve([fx.nextBattle('gold'), fx.retrain(), fx.retrain(), fx.setFlag('a', 7), fx.setFlag('b'), fx.clearFlag('b')]);
    expect(c.world.s.flags).toMatchObject({ [EV_KEY.next('gold')]: 1, a: 7 });
    expect(c.world.hasFlag('b')).toBe(false);
    expect(c.freeRetrains()).toBe(2);
    expect(c.useFreeRetrain()).toBe(true);
    expect(c.useFreeRetrain()).toBe(true);
    expect(c.useFreeRetrain()).toBe(false);
  });

  it('priceMod and closeSettlement change a settlement for some days', () => {
    const c = camp();
    const town = c.world.map.settlements.find((s) => s.kind === 'town' && s.id !== c.world.map.start)!;
    const before = c.world.recruits(town.id, c.data.heroes);
    const wares = c.world.wares(town.id);
    c.world.s.pendingEvent = { id: 'fx', seed: 1 };
    c.world.deck = [{ id: 'fx', trigger: 'march', weight: 1, cond: {}, cooldownDays: 0, choices: [{ key: 'go', effects: [fx.priceMod(town.id, -10, 5)] }, { key: 'no', effects: [] }] }];
    c.chooseEvent('go');
    expect(c.world.recruits(town.id, c.data.heroes).map((r) => r.price)).toEqual(before.map((r) => Math.round(r.price * 0.9)));
    expect(c.world.wares(town.id).map((w) => w.price)).toEqual(wares.map((w) => Math.round(itemValue(w.item) * 1.5 * 0.9)));
    c.world.s.time += 24 * 5 + 1;
    expect(c.world.priceMult(town.id)).toBe(1);
    c.world.closeSettlement(town.id, 2);
    expect(c.world.recruits(town.id, c.data.heroes)).toEqual([]);
    expect(c.world.wares(town.id)).toEqual([]);
    expect(c.world.hire(town.id, 0, c.data, c.data.heroes)).toBeNull();
  });

  it('weakenGarrison and reveal act on the nearest lair', () => {
    const hidden = camp(3).world.nearestLair({ unknown: true })!;
    expect(camp(3).world.s.found).not.toContain(hidden.id);
    const c = resolve([fx.weakenGarrison('nearest', 3), fx.reveal('nearest')]);
    const lair = c.world.nearestLair({ standing: true })!;
    expect(c.world.s.lairs[lair.id]).toMatchObject({ fallen: false, lost: 3 });
    expect(c.world.s.found).toContain(hidden.id);
  });
});

describe('nextBattle bonuses and the bounty multiplier', () => {
  const unit = (heroId: string, side: 0 | 1, state: UnitResult['state'], kills = 0): UnitResult =>
    ({ heroId, side, state, kills, killedBy: state === 'dead' ? 0 : -1, ko: false, hp: 10, maxHp: 50, wear: { weapon: 0, shield: 0, helmet: 0, armor: 0 } });

  it('+50% gold applies after the goldBonus cap, to the battle gold only', () => {
    const rng = new Rng(3);
    const ids = { nextId: 1 };
    const me = makeHero(rng, ids, 'greek', 'hoplite', 2, 1);
    // three men in gilded gear: together far past the +50% cap
    const mine = [me, makeHero(rng, ids, 'greek', 'hoplite', 2, 1), makeHero(rng, ids, 'greek', 'hoplite', 2, 1)];
    for (const h of mine) h.equip.trinket = { ...makeItem(rng, ids, 'owl_amulet', 'legendary', 100), aff: 'goldBonus:20' };
    expect(mine.reduce((a, h) => a + gearTotal(h, 'goldBonus'), 0)).toBeGreaterThan(0.5);
    const foes = [makeHero(rng, ids, 'greek', 'hoplite', 1, 1), makeHero(rng, ids, 'greek', 'hoplite', 1, 1)];
    const result = { winner: 0, units: [unit(me.id, 0, 'ready', 2), ...mine.slice(1).map((h) => unit(h.id, 0, 'ready')), ...foes.map((f) => unit(f.id, 1, 'dead'))] } as unknown as BattleResult;
    const { outcome } = resolveBattle(result, mine, foes, new Rng(1));
    // the battle gold is capped at +50% ...
    expect(outcome.gold).toBe(Math.round((20 + 2 * 12 + 60) * 1.5));
    const base = outcome.gold;
    const xp = outcome.heroes[0].xp;
    const picks = outcome.picks;
    const extra = applyBattleBonus(outcome, mine, { gold: true, xp: true, pick: true }, new Rng(1));
    // ... and the event's +50% comes on top of the capped gold
    expect(extra).toBe(Math.round(base * 0.5));
    expect(outcome.gold).toBe(base + extra);
    expect(outcome.heroes[0].xp).toBe(xp + Math.round(xp * 0.5));
    expect(outcome.picks).toBe(Math.min(picks + 1, outcome.loot.length));
  });

  it('the campaign spends the bonus on the next battle, before the bounty; a bountyMult band pays double', () => {
    const c = camp(8);
    const band = c.world.spawnEventBand('mercs', { captain: true, bountyMult: 2 }, new Rng(2))!;
    const enemies = partyArmy(band, { nextId: 500 }).heroes;
    const captain = enemies[0];
    c.world.setFlag(EV_KEY.next('gold'), 1);
    const result = { winner: 0, retreated: -1, units: enemies.map((h) => unit(h.id, 1, 'dead')) } as unknown as BattleResult;
    const out = outcome({ gold: 100, enemyKilled: enemies.length });
    c.data.gold = 100; // resolveBattle had paid the 100
    const spoils = c.afterPartyBattle(band.id, out, result, enemies);
    expect(spoils.bounty).toBe(captainBounty(captain.level, 2));
    expect(spoils.bounty).toBe(2 * captainBounty(captain.level));
    expect(out.gold).toBe(150 + spoils.bounty);
    expect(c.data.gold).toBe(150 + spoils.bounty);
    expect(c.world.hasFlag(EV_KEY.next('gold'))).toBe(false);
    // spent: the battle after gets nothing extra
    const again = outcome({ gold: 100 });
    c.afterPartyBattle(-1, again);
    expect(again.gold).toBe(100);
  });

  it('a malformed bountyMult in a save reads as 1..3', () => {
    expect(bountyMultOf({})).toBe(1);
    expect(bountyMultOf({ bountyMult: 9 })).toBe(3);
    expect(bountyMultOf({ bountyMult: 'x' as unknown as number })).toBe(1);
    expect(bountyMultOf({ bountyMult: NaN })).toBe(1);
  });
});

describe('save compatibility', () => {
  it('every save fixture loads and runs the engine with no change to its data', () => {
    for (const [name, raw] of Object.entries(FIXTURES)) {
      const data = migrate(JSON.parse(raw));
      expect(data, name).not.toBeNull();
      const c = new Campaign(data!);
      c.world.deck = DECK;
      expect(c.pendingEvent(), name).toBeNull();
      expect(c.world.s.flags, name).toBeTypeOf('object');
      c.world.s.inside = -1;
      c.world.s.parties = [];
      c.world.s.lastSpawn = 1e12;
      expect(() => marchUntilEvent(c, 24 * 3), name).not.toThrow();
    }
  });
});

function outcome(over: Partial<Outcome> = {}): Outcome {
  return { victory: true, draw: false, gold: 0, picks: 3, loot: [], heroes: [], enemyKilled: 0, enemyTotal: 8, lost: 0, ...over };
}
