/**
 * EV-02: the starter event deck (design/gdd/campaign-events.md R5, R6, F2).
 * The deck ships OFF (V5-070): the flag-off tests prove live players see no
 * event and the world is untouched; the flag-on tests prove the content.
 */
import { describe, expect, it } from 'vitest';
import { Campaign } from '../src/game/campaign';
import { EVENT_DECK, type EventDef } from '../src/data/events';
import { EVENT_DECK_ENABLED, NARRATIVE_CARDS, RETRAIN_SPENDABLE, STARTER_DECK, liveDeck } from '../src/data/eventDeck';
import { evTable, eventEconomy } from '../src/dev/eventBalance';
import { EVENTS_EN } from '../src/i18n/events.en';
import { EVENTS_RU } from '../src/i18n/events.ru';

/** A campaign whose world draws from `deck`, with no bands to interrupt the march. */
function camp(seed: number, deck: readonly EventDef[]): Campaign {
  const c = Campaign.fresh(seed);
  c.world.deck = deck;
  c.world.s.parties = [];
  c.world.s.lastSpawn = 1e12;
  return c;
}

/** The farthest settlement the party can walk to from the start. */
function farTown(c: Campaign) {
  const w = c.world;
  const home = w.map.settlements[w.map.start];
  const far = w.map.settlements
    .filter((s) => s.kind !== 'lair')
    .sort((a, b) => Math.hypot(b.x - home.x, b.y - home.y) - Math.hypot(a.x - home.x, a.y - home.y))
    .find((s) => w.setDestination(s.x, s.y))!;
  w.stop();
  return far;
}

const sets = (d: EventDef) => d.choices.flatMap((c) => [...(c.cost ?? []), ...c.effects, ...(c.chance?.fail ?? [])]).flatMap((e) => (e.k === 'setFlag' ? [e.name] : []));
const reads = (d: EventDef) => [...(d.after ? [d.after.flag] : []), ...(d.cond.flags ?? [])];

describe('the flag (V5-064, V5-070)', () => {
  it('ships off: the live deck is empty and the engine default draws nothing', () => {
    expect(EVENT_DECK_ENABLED).toBe(false);
    expect(liveDeck()).toEqual([]);
    expect(EVENT_DECK).toEqual([]);
    expect(liveDeck(true)).toBe(STARTER_DECK);
  });

  it('off: a world given liveDeck() marches exactly like one with no deck, and no event is ever pending', () => {
    const a = Campaign.fresh(11);
    const b = Campaign.fresh(11);
    a.world.deck = liveDeck();
    b.world.deck = [];
    const to = farTown(a);
    a.world.setDestination(to.x, to.y);
    b.world.setDestination(to.x, to.y);
    for (let i = 0; i < 400; i++) {
      const ra = a.world.advance(1, a.playerInfo());
      const rb = b.world.advance(1, b.playerInfo());
      expect(ra).toEqual(rb);
      expect(a.world.s.pendingEvent).toBeUndefined();
    }
    for (let i = 0; i < 40; i++) expect(a.world.tryEvent('after_battle', `b${i}`, a.playerInfo())).toBeNull();
    expect(a.world.s).toEqual(b.world.s);
  });

  it('on: the same march draws events, deterministically', () => {
    const run = () => {
      const c = camp(11, liveDeck(true));
      const w = c.world;
      const home = w.map.settlements[w.map.start];
      const far = farTown(c);
      const seen: string[] = [];
      for (let t = 0, leg = 0; t < 24 * 30 && seen.length < 2; ) {
        if (!w.moving) {
          const to = leg++ % 2 === 0 ? far : home;
          w.setDestination(to.x, to.y);
        }
        t += Math.max(w.advance(1, c.playerInfo()).hours, 0.05);
        const pe = c.pendingEvent();
        if (!pe) continue;
        seen.push(pe.def.id);
        c.chooseEvent(pe.choices.find((x) => !x.blocked)!.key);
      }
      return seen;
    };
    const first = run();
    expect(first.length).toBeGreaterThan(0);
    expect(run()).toEqual(first);
  }, 60_000);
});

describe('the starter deck (R1, R5, R6)', () => {
  it('has 24 events with unique ids, 2-3 choices with unique keys, at least one free', () => {
    expect(STARTER_DECK).toHaveLength(24);
    expect(new Set(STARTER_DECK.map((d) => d.id)).size).toBe(24);
    for (const d of STARTER_DECK) {
      const keys = d.choices.map((c) => c.key);
      expect(new Set(keys).size, d.id).toBe(keys.length);
      if (NARRATIVE_CARDS.includes(d.id)) expect(d.choices, d.id).toHaveLength(1);
      else {
        expect(d.choices.length, d.id).toBeGreaterThanOrEqual(2);
        expect(d.choices.length, d.id).toBeLessThanOrEqual(3);
      }
      expect(d.choices.some((c) => !c.cost?.length), `${d.id} has a free choice`).toBe(true);
      expect(d.weight, d.id).toBeGreaterThanOrEqual(0);
      expect(d.trigger === 'flag', `${d.id}: flag events (only) carry 'after'`).toBe(d.after !== undefined);
    }
  });

  it('covers the GDD R6 list', () => {
    const ids = STARTER_DECK.map((d) => d.id);
    for (const id of ['deserters', 'deserters_hunt', 'shrine_ares', 'ares_wrath', 'plague_town', 'caravan', 'rival_challenge', 'rival_returns', 'oracle', 'deserter_map', 'ford_toll', 'host_musters']) expect(ids).toContain(id);
  });

  it('chains: at least a third of the events set a flag a later event reads; every flag read is set (or is the arc\'s); every follow-up clears its flag', () => {
    const read = new Set(STARTER_DECK.flatMap(reads));
    const setters = STARTER_DECK.filter((d) => sets(d).some((f) => read.has(f)));
    expect(setters.length * 3).toBeGreaterThanOrEqual(STARTER_DECK.length);
    const set = new Set(STARTER_DECK.flatMap(sets));
    for (const f of read) expect(set.has(f) || f === 'host_musters', f).toBe(true);
    for (const f of set) expect(read.has(f) || STARTER_DECK.some((d) => d.cond.notFlags?.includes(f)), `${f} is read`).toBe(true);
    for (const d of STARTER_DECK.filter((x) => x.after && !x.unique)) {
      for (const c of d.choices) {
        const all = [...c.effects, ...(c.chance?.fail ?? [])];
        expect(all.some((e) => e.k === 'clearFlag' && e.name === d.after!.flag), `${d.id}:${c.key} clears ${d.after!.flag}`).toBe(true);
      }
    }
  });

  it('the oracle stays dormant (weight 0) until a screen can spend its retrain', () => {
    const oracle = STARTER_DECK.find((d) => d.id === 'oracle')!;
    expect(oracle.weight).toBe(RETRAIN_SPENDABLE ? oracle.weight : 0);
    expect(oracle.unique).toBe(true);
  });

  it('F2: the EV table has no dominated choice', () => {
    const table = evTable();
    expect(table).toHaveLength(STARTER_DECK.reduce((a, d) => a + d.choices.length, 0));
    expect(table.filter((x) => x.dominatedBy).map((x) => `${x.id}:${x.key} < ${x.dominatedBy}`)).toEqual([]);
  });

  it('every choice of every event resolves (all branches walked), flag on', () => {
    const c = camp(1, liveDeck(true));
    let seed = 1;
    for (const d of STARTER_DECK) {
      for (const ch of d.choices) {
        c.data.gold = 500;
        c.world.addFood(100);
        if (c.data.heroes.length > 12) c.data.heroes.length = 12;
        c.world.s.pendingEvent = { id: d.id, seed: seed++ };
        const res = c.chooseEvent(ch.key);
        expect(res, `${d.id}:${ch.key}`).not.toBeNull();
        expect(c.world.s.pendingEvent).toBeUndefined();
        expect(c.world.s.journal.at(-1)).toMatch(new RegExp(`^${d.id}:${ch.key}`));
      }
    }
  });

  it('the deserters chain plays out on the shipped content (flag on)', () => {
    const c = camp(4, liveDeck(true));
    c.world.s.time = 3 * 24;
    c.world.s.pendingEvent = { id: 'deserters', seed: 9 };
    const men = c.data.heroes.length;
    c.chooseEvent('take');
    expect(c.data.heroes.length).toBe(men + 2);
    expect(c.world.hasFlag('deserters_joined')).toBe(true);
    let hunt: string | null = null;
    for (let day = 4; day <= 12 && !hunt; day++) {
      c.world.s.time = day * 24 + 1;
      hunt = c.world.tryEvent('flag', `d${day}`, c.playerInfo());
    }
    expect(hunt).toBe('deserters_hunt');
    const day = Math.floor(c.world.s.time / 24);
    expect(day).toBeGreaterThanOrEqual(3 + 4);
    expect(day).toBeLessThanOrEqual(3 + 8);
    c.data.gold = 100;
    c.chooseEvent('pay');
    expect(c.data.gold).toBe(40);
    expect(c.world.hasFlag('deserters_joined')).toBe(false);
  });
});

describe('the economy, flag on (Balance targets)', () => {
  it('a scripted 40-battle campaign: 0.3-0.5 events per battle, -10..+25 g of event gold per battle', () => {
    for (const policy of ['random', 'greedy'] as const) {
      const e = eventEconomy(24, 40, policy);
      const perBattle = e.events / e.battles;
      expect(perBattle, policy).toBeGreaterThanOrEqual(0.3);
      expect(perBattle, policy).toBeLessThanOrEqual(0.5);
      const gold = e.gold / e.battles;
      expect(gold, policy).toBeGreaterThanOrEqual(-10);
      expect(gold, policy).toBeLessThanOrEqual(25);
    }
  }, 60_000);
});

describe('the text (R5, G12)', () => {
  const EN = EVENTS_EN as Record<string, string>;
  const RU = EVENTS_RU as Record<string, string>;
  const expected = STARTER_DECK.flatMap((d) => [
    `event.${d.id}.title`,
    `event.${d.id}.body`,
    ...d.choices.flatMap((c) => [`event.${d.id}.c.${c.key}`, `event.${d.id}.r.${c.key}`, ...(c.chance ? [`event.${d.id}.f.${c.key}`] : [])]),
  ]);

  it('every event, choice, result and failure has a string, and nothing else is there', () => {
    expect(Object.keys(EN).sort()).toEqual([...expected].sort());
    expect(Object.keys(RU).sort()).toEqual([...expected].sort());
  });

  it('en and ru: bodies <= 280 characters, labels <= 24, nothing empty, no numbers or params (the chips carry them)', () => {
    for (const T of [EN, RU]) {
      for (const [k, v] of Object.entries(T)) {
        expect(v.trim().length, k).toBeGreaterThan(0);
        expect(v, k).not.toMatch(/[0-9{}]/);
        if (k.endsWith('.body')) expect(v.length, k).toBeLessThanOrEqual(280);
        if (k.includes('.c.')) expect(v.length, k).toBeLessThanOrEqual(24);
      }
    }
  });

  it('ru is a translation, not a copy', () => {
    for (const k of Object.keys(EN)) expect(RU[k], k).not.toBe(EN[k]);
  });
});
