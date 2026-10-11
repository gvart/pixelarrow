/**
 * EV-03: the event card and the journal (design/gdd/campaign-events.md R4). The card draws with
 * Phaser; what is tested here is pure: every choice of the live deck reads in words in both
 * languages (never colour only, no missing key), a blocked choice says why, the journal reads its
 * lines back, and a pending event survives a save round trip with the same outcome (R4.1).
 */
import { describe, expect, it, vi } from 'vitest';
import { STARTER_DECK, liveDeck } from '../src/data/eventDeck';
import { Campaign } from '../src/game/campaign';
import { deserialize, serialize } from '../src/game/save';
import { setLang, LANGS } from '../src/i18n';
import { state } from '../src/state';

vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C, Zone: C }, Scene: C, Loader: { Events: {} } } };
});
const { choiceTokens, choiceLabel, eventTitle, resultLine, blockText, journalEntry } = await import('../src/ui/sheets/eventCard');

/** A campaign with `id` pending (as the draw leaves it). */
function pending(id: string, seed = 7): Campaign {
  const c = Campaign.fresh(3);
  c.world.s.pendingEvent = { id, seed };
  return c;
}

describe('the card reads in words (R4, A11Y: never colour only)', () => {
  it('the live deck is the starter deck', () => {
    expect(liveDeck()).toBe(STARTER_DECK);
  });

  for (const lang of LANGS) {
    it(`every choice of every event has a title, a label, a result and effects in words (${lang})`, () => {
      setLang(lang);
      for (const d of STARTER_DECK) {
        expect(eventTitle(d.id)).not.toBe(d.id);
        for (const c of d.choices) {
          expect(choiceLabel(d.id, c.key)).not.toBe(c.key);
          expect(choiceLabel(d.id, c.key).length).toBeLessThanOrEqual(24);
          expect(resultLine(d.id, c.key, true)).not.toBe('');
          if (c.chance) expect(resultLine(d.id, c.key, false)).not.toBe('');
          const toks = choiceTokens(c);
          expect(toks.length).toBeGreaterThan(0);
          for (const tk of toks) {
            expect(tk.text).not.toMatch(/evc\.|\{/);
            expect(tk.text.trim()).not.toBe('');
          }
          // a cost is written with a minus, not only in red
          for (const e of c.cost ?? []) if (e.k === 'gold') expect(toks.some((tk) => tk.icon === 'coin' && tk.text.includes('−'))).toBe(true);
        }
      }
    });
  }

  it('a choice the army cannot pay says why', () => {
    setLang('en');
    const c = pending('shrine_ares');
    c.data.gold = 10;
    const pe = c.pendingEvent()!;
    const offer = pe.choices.find((x) => x.key === 'offer')!;
    expect(offer.blocked).toEqual({ why: 'gold', need: 30, have: 10 });
    expect(blockText(offer.blocked!)).toBe('Need 30 gold (you have 10)');
    expect(c.chooseEvent('offer')).toBeNull();
    // the free choices stay open (R4.5): Back can always take one
    expect(pe.choices.filter((x) => !x.blocked && !STARTER_DECK.find((d) => d.id === 'shrine_ares')!.choices.find((y) => y.key === x.key)!.cost)).not.toHaveLength(0);
  });
});

describe('soft-lock safety (R4.1, R4.2)', () => {
  it('a pending event survives a save round trip and resolves to the same outcome', () => {
    const a = pending('deserters', 12345);
    const b = new Campaign(deserialize(serialize(a.sync()))!);
    expect(b.world.s.pendingEvent).toEqual({ id: 'deserters', seed: 12345 });
    expect(b.world.advance(3, b.playerInfo()).hours).toBe(0);
    const ra = a.chooseEvent('rob');
    const rb = b.chooseEvent('rob');
    expect(rb).toEqual(ra);
    expect(b.data.gold).toBe(a.data.gold);
    expect(b.world.s.pendingEvent).toBeUndefined();
    // answered: the map runs again
    expect(b.world.advance(1, b.playerInfo(), true).hours).toBeGreaterThan(0);
  });

  it('an event the deck no longer holds is dropped, so the map never waits on a card that cannot open', () => {
    const c = pending('no_such_event');
    expect(c.pendingEvent()).toBeNull();
    expect(c.world.s.pendingEvent).toBeUndefined();
  });

  it('every event has a choice Back can take: free and open on a fresh army', () => {
    for (const d of STARTER_DECK) {
      const c = pending(d.id);
      const pe = c.pendingEvent()!;
      expect(pe.choices.some((x) => !x.blocked && !d.choices.find((y) => y.key === x.key)!.cost?.length)).toBe(true);
    }
  });
});

describe('the journal (last 20)', () => {
  it('reads its lines back in words, newest kept, failures marked', () => {
    setLang('en');
    const c = pending('deserters');
    state.campaign = c;
    for (let i = 0; i < 25; i++) c.world.logJournal(i % 2 ? 'shrine_ares:pass' : 'deserters:rob:fail');
    c.world.logJournal('gone_event:x');
    expect(c.world.s.journal).toHaveLength(20);
    const rows = c.world.s.journal.map(journalEntry);
    expect(rows.at(-1)).toBeNull();
    const fail = journalEntry('deserters:rob:fail')!;
    expect(fail).toMatchObject({ title: 'Deserters on the Road', choice: 'Rob them', ok: false });
    expect(fail.result).toMatch(/fought back/);
    expect(journalEntry('shrine_ares:pass')!.ok).toBe(true);
  });
});
