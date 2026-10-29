/**
 * W-69 chat links: an item or a man shown in a chat line as a gold tag ([Bronze Kopis], [Damon, Hoplite L3]) whose
 * hover is the full card. A message carries `links` (at most LINK_MAX snapshots taken when it was sent) and its text
 * holds one private-use character per tag (LINK_CHAR + the link's index): a tag counts as one character toward
 * CHAT_MAX, and the word filter never sees it. The server checks the snapshots against LINK (known ids, capped sizes)
 * and masks their free words; the client renders them with the item and soldier card renderers.
 */
import { z } from 'zod';
import { CIV_CLASSES, CIV_TOOLS, CLASSES, isCivClass, isClassId } from '../../data/classes';
import { itemDisplayName } from '../../data/affixes';
import { ITEMS, type Item, type Slot } from '../../data/items';
import type { Hero } from '../../data/units';
import { SKILLS } from '../sim/skills';
import type { HonourStat, WarPerson, WarSkillId } from '../types';
import { maskText } from './chatFilter';

/** Tags a message may hold. */
export const LINK_MAX = 3;
/** A link's JSON may be this long at most. */
export const LINK_CHARS = 3000;
/** Link i's place in the text: String.fromCharCode(LINK_CHAR + i). */
export const LINK_CHAR = 0xe000;
const PRIVATE = /[-]/g;
const SPLIT = /([-])/;

const str = (n: number) => z.string().max(n);
const int = (max: number) => z.number().int().min(0).max(max);
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
const SLOTS = ['weapon', 'armor', 'helmet', 'shield', 'trinket'] as const;
const HONOUR_STATS = ['hp', 'dmg', 'armor', 'block', 'accuracy'] as const satisfies readonly HonourStat[];

/** An item as linked: what its card needs (the uid seeds its rolls when `aff` / `pow` are not set). */
const ITEM = z.object({
  uid: z.string().min(1).max(40),
  def: z.string().max(40).refine((d) => d in ITEMS || d in CIV_TOOLS, 'unknown item'),
  rarity: z.enum(RARITIES),
  cond: z.number().min(0).max(100),
  aff: str(160).optional(),
  pow: str(40).optional(),
  q: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  mc: z.number().min(0).max(100).optional(),
  mk: str(48).optional(),
});
export type ItemSnap = z.infer<typeof ITEM>;

const MAN = z.object({
  k: z.literal('man'),
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(40),
  cls: str(32),
  lv: z.number().int().min(1).max(99),
  xp: int(1e7),
  attrs: z.object({ str: int(40), agi: int(40), end: int(40), wil: int(40) }),
  traits: z.array(str(32)).max(8),
  perks: z.array(str(40)).max(24),
  skills: z.array(z.string().refine((s) => s in SKILLS, 'unknown skill')).max(4),
  kills: int(1e6),
  battles: int(1e6),
  deeds: z.array(z.object({ id: str(40), name: str(60) })).max(16),
  scars: int(9),
  honours: z.array(z.object({ name: str(60), stat: z.enum(HONOUR_STATS) })).max(8),
  gear: z.object(Object.fromEntries(SLOTS.map((s) => [s, ITEM.optional()])) as Record<Slot, z.ZodOptional<typeof ITEM>>),
});

/** One link on the wire (the server parses messages with it). */
export const LINK = z.union([z.object({ k: z.literal('item'), it: ITEM }), MAN]).refine((l) => JSON.stringify(l).length <= LINK_CHARS, 'link too big');
export type ChatLinkData = z.infer<typeof LINK>;
export type ManLink = z.infer<typeof MAN>;

const snapItem = (it: Item): ItemSnap => ({
  uid: it.uid, def: it.def, rarity: it.rarity, cond: Math.round(it.cond),
  ...(it.aff !== undefined ? { aff: it.aff } : {}), ...(it.pow !== undefined ? { pow: it.pow } : {}), ...(it.q !== undefined ? { q: it.q } : {}),
  ...(it.mc !== undefined ? { mc: it.mc } : {}), ...(it.mk !== undefined ? { mk: it.mk } : {}),
});

export const itemLink = (it: Item): ChatLinkData => ({ k: 'item', it: snapItem(it) });

export function manLink(p: WarPerson): ManLink {
  const h = p.hero;
  return {
    k: 'man', id: p.id, name: h.name, cls: h.cls ?? 'militia', lv: h.level, xp: h.xp, attrs: { ...h.attrs },
    traits: [...h.traits], perks: [...(h.perks as unknown as string[])], skills: [...(p.skills ?? [])], kills: h.kills, battles: h.battles,
    deeds: (p.deeds ?? []).map((d) => ({ id: d.id, name: d.name })), scars: p.scars ?? 0, honours: (p.honours ?? []).map((x) => ({ name: x.name, stat: x.stat })),
    gear: Object.fromEntries(Object.entries(h.equip).flatMap(([s, it]) => (it ? [[s, snapItem(it)]] : []))),
  };
}

/** The linked item as an Item (its card). */
export const linkItem = (it: ItemSnap): Item => ({ ...it });

/** The linked man as a person (the soldier card; what the link does not carry is blank). */
export function linkPerson(m: ManLink): WarPerson {
  const hero = {
    id: m.id, name: m.name, culture: 'greek', level: m.lv, xp: m.xp, traits: m.traits, look: {}, kills: m.kills, battles: m.battles, group: 0,
    attrs: m.attrs, points: 0, perks: m.perks, wound: 0, cls: m.cls,
    equip: Object.fromEntries(Object.entries(m.gear).flatMap(([s, it]) => (it ? [[s, linkItem(it)]] : []))),
  } as unknown as Hero;
  return { id: m.id, hero, skills: m.skills as WarSkillId[], deeds: m.deeds, scars: m.scars, honours: m.honours };
}

export const className = (cls: string) => (isCivClass(cls) ? CIV_CLASSES[cls].name : CLASSES[isClassId(cls) ? cls : 'militia'].name);

const itemName = (it: ItemSnap) => {
  const tool = CIV_TOOLS[it.def];
  return tool ? tool.name.replace(/^./, (c) => c.toUpperCase()) : itemDisplayName(it);
};

/** The tag's words, without the brackets: the item's name, or "Damon, Hoplite L3". */
export const linkLabel = (l: ChatLinkData) => (l.k === 'item' ? itemName(l.it) : `${l.name}, ${className(l.cls)} L${l.lv}`);

/** The draft's `[label]` of each picked link as its tag character (picks not in the text any more are dropped). */
export function encodeDraft(draft: string, picked: ChatLinkData[]): { text: string; links: ChatLinkData[] } {
  let text = draft.replace(PRIVATE, '');
  const links: ChatLinkData[] = [];
  for (const l of picked) {
    if (links.length >= LINK_MAX) break;
    const tag = `[${linkLabel(l)}]`, at = text.indexOf(tag);
    if (at < 0) continue;
    text = text.slice(0, at) + String.fromCharCode(LINK_CHAR + links.length) + text.slice(at + tag.length);
    links.push(l);
  }
  return { text, links };
}

/** Private-use characters that are not one of the `n` links' tags are dropped. */
export const cleanTags = (text: string, n: number) => text.replace(PRIVATE, (c) => (c.charCodeAt(0) - LINK_CHAR < n ? c : ''));

/** The word filter on the words between the tags. */
export const maskTagged = (text: string) => text.split(SPLIT).map((s, i) => (i % 2 ? s : maskText(s))).join('');

/** A link's free words (names) through the word filter. */
export function maskLink(l: ChatLinkData): ChatLinkData {
  const it = (x: ItemSnap) => (x.mk !== undefined ? { ...x, mk: maskText(x.mk) } : x);
  if (l.k === 'item') return { k: 'item', it: it(l.it) };
  return {
    ...l, name: maskText(l.name), deeds: l.deeds.map((d) => ({ ...d, name: maskText(d.name) })), honours: l.honours.map((x) => ({ ...x, name: maskText(x.name) })),
    gear: Object.fromEntries(Object.entries(l.gear).map(([s, x]) => [s, x && it(x)])),
  };
}

/** The text as runs of words and links (a tag whose link is missing drops out). */
export type TagPart = string | { link: ChatLinkData; i: number };
export function tagParts(text: string, links: readonly ChatLinkData[] = []): TagPart[] {
  return text.split(SPLIT).flatMap((s, i): TagPart[] => {
    if (!(i % 2)) return s ? [s] : [];
    const n = s.charCodeAt(0) - LINK_CHAR, link = links[n];
    return link ? [{ link, i: n }] : [];
  });
}

/** The text with each tag as "[label]" (plain contexts). */
export const tagText = (text: string, links?: readonly ChatLinkData[]) => tagParts(text, links).map((p) => (typeof p === 'string' ? p : `[${linkLabel(p.link)}]`)).join('');
