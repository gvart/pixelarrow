/** W-69 chat links (src/war/net/chatLinks.ts): the draft codec, the wire schema's caps and the server's sanitising. */
import { describe, expect, it } from 'vitest';
import { itemDisplayName } from '../src/data/affixes';
import { chatClientMsgs, chatText, CHAT_MAX } from '../src/war/net/chat';
import { cleanTags, encodeDraft, itemLink, LINK, LINK_CHAR, LINK_MAX, linkItem, linkLabel, linkPerson, manLink, maskLink, maskTagged, tagParts, type ChatLinkData } from '../src/war/net/chatLinks';
import { makePerson } from '../src/war/sim/roster';
import { warStatsOf } from '../src/war/sim/classes';

const say = chatClientMsgs[0];
const tag = (i: number) => String.fromCharCode(LINK_CHAR + i);
const kopis = { uid: 'it-77', def: 'kopis', rarity: 'rare' as const, cond: 83, q: 2 as const, mk: 'Nikias of Dodona' };
const damon = makePerson('p-1', 'hoplite', { level: 3, tier: 1, rarity: 'uncommon', name: 'Damon' });
damon.deeds = [{ id: 'firstBlood', name: 'First blood at the ford' }];
damon.scars = 1;

describe('chat links', () => {
  it('labels an item by its rolled name and a man by name, class and level ("Damon, Hoplite L3" in the brief)', () => {
    expect(linkLabel(itemLink(kopis))).toBe(itemDisplayName(kopis));
    expect(linkLabel(manLink(damon))).toBe('Damon, Spartan hoplite L3');
  });

  it('round-trips an item and a man through the wire', () => {
    for (const l of [itemLink(kopis), manLink(damon)]) {
      const back = LINK.parse(JSON.parse(JSON.stringify(l)));
      expect(back).toEqual(l);
    }
    expect(linkItem((itemLink(kopis) as Extract<ChatLinkData, { k: 'item' }>).it)).toEqual(kopis);
    const p = linkPerson(manLink(damon) as Extract<ChatLinkData, { k: 'man' }>);
    expect(p.hero).toMatchObject({ name: 'Damon', level: 3, cls: 'hoplite', attrs: damon.hero.attrs, equip: damon.hero.equip });
    expect(p).toMatchObject({ skills: damon.skills, deeds: damon.deeds, scars: 1 });
    expect(warStatsOf(p)).toEqual(warStatsOf(damon)); // the card's numbers are his
  });

  it('turns the draft\'s [label]s into one tag character each, counted as one toward CHAT_MAX', () => {
    const i = itemLink(kopis), m = manLink(damon);
    const draft = `trade my [${linkLabel(i)}] for a day with [${linkLabel(m)}]? `;
    const { text, links } = encodeDraft(draft, [i, m, itemLink({ ...kopis, uid: 'gone' })]);
    expect(text).toBe(`trade my ${tag(0)} for a day with ${tag(1)}? `); // a typed private char is dropped; a pick no longer in the text too
    expect(links).toEqual([i, m]);
    expect(say.safeParse({ t: 'say', text, links }).success).toBe(true);
    expect(chatText({ id: 1, pid: 1, name: 'A', at: 0, text, links })).toBe(draft.replace(' ', ' '));
    expect(tagParts(text, links)).toEqual(['trade my ', { link: i, i: 0 }, ' for a day with ', { link: m, i: 1 }, '? ']);
    // a tag is one character however long its name
    const long = 'x'.repeat(CHAT_MAX - 1) + tag(0);
    expect(say.safeParse({ t: 'say', text: long, links: [i] }).success).toBe(true);
    expect(encodeDraft(`[${linkLabel(i)}]`.repeat(LINK_MAX + 1), Array(LINK_MAX + 1).fill(i)).links).toHaveLength(LINK_MAX);
  });

  it('refuses unknown items and skills, too many links and oversized ones', () => {
    const ok = (links: unknown) => say.safeParse({ t: 'say', text: `a ${tag(0)}`, links }).success;
    expect(ok([itemLink(kopis)])).toBe(true);
    expect(ok([{ k: 'item', it: { ...kopis, def: 'excalibur' } }])).toBe(false);
    expect(ok([{ ...manLink(damon), skills: ['fly'] }])).toBe(false);
    expect(ok(Array(LINK_MAX + 1).fill(itemLink(kopis)))).toBe(false);
    expect(ok([{ ...manLink(damon), name: 'x'.repeat(41) }])).toBe(false);
    expect(ok([{ ...manLink(damon), deeds: Array(16).fill({ id: 'z'.repeat(40), name: 'y'.repeat(60) }), honours: Array(8).fill({ name: 'h'.repeat(60), stat: 'hp' }) }])).toBe(false); // over LINK_CHARS
    expect(ok([])).toBe(false);
    // unknown keys are stripped, not kept
    const extra = LINK.parse({ ...itemLink(kopis), evil: '<script>' });
    expect(extra).not.toHaveProperty('evil');
  });

  it('drops stray tag characters and masks words around tags and in names', () => {
    expect(cleanTags(`a${tag(0)}b${tag(2)}cd`, 1)).toBe(`a${tag(0)}bcd`);
    expect(maskTagged(`sh1t${tag(0)}fuck you`)).toBe(`***${tag(0)}*** you`); // a tag splits words, never masked away
    const m = maskLink({ ...manLink(damon), name: 'Fuckface', deeds: [{ id: 'x', name: 'held sh1t' }] }) as Extract<ChatLinkData, { k: 'man' }>;
    expect(m.name).toBe('***');
    expect(m.deeds[0].name).toBe('held ***');
  });
});
