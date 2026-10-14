/**
 * The event card and the journal (EV-03; design/gdd/campaign-events.md R4 and "Touch UI needs",
 * design/ux/screens-campaign.md C-4, interaction-patterns.md P12, screen-flow.md §4).
 *
 * The card is a decision sheet docked at the bottom over a dim scrim: a vignette niche, the title,
 * the body and 2-3 choices. One choice is terracotta, the others bronze; under each, what it does in
 * words with an icon (a cost carries a minus: never colour only). A choice the army can't pay is
 * disabled with its reason (R4.4). No X and no tap outside: Back asks to take the choice that costs
 * nothing (R4.5). After a choice the card turns into the result: what happened, and Continue.
 *
 * The card owns no state. `Campaign.pendingEvent()` says what is open (it drops an id the deck no
 * longer has, so a content change can't freeze the map); `Campaign.chooseEvent()` resolves it,
 * clears `pendingEvent` and writes the journal; the card saves at once. The pending event was saved
 * when it was drawn (R4.1), so a reload with the card open shows the same card, and the choice
 * gives the same outcome (it is seeded by the event).
 *
 * Every scene that can hold a pending event (World, Settlement, Camp) opens the card when one is
 * pending and none is shown: on create, and on the map whenever `advance` stops for one.
 */
import Phaser from 'phaser';
import { ScrollArea, addIcon, type FontKey, type UIMetrics } from '../kit';
import { addScrollHint, confirmDialog } from '../widgets';
import { MOSAIC } from '../tokens';
import { BUTTON_MAX } from '../sizeClass';
import { uiId } from '../layout';
import { MButton, addNiche, mtext, mw, openParchmentSheet, sheetActionsH, sheetWidth, wrapWords, SHEET_TITLE_H, type ParchmentSheetHandle } from '../mosaic';
import { hapticNotify } from '../../platform/haptics';
import { navLayer } from '../../platform/nav';
import { state } from '../../state';
import { t, tOr, type TKey } from '../../i18n';
import { eventById, type Effect, type EventChoice, type EventDef, type EventTrigger } from '../../data/events';
import type { ChoiceBlock, EventResolution } from '../../game/campaign';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };

const PAD = 8;
const BODY = 7;
const SMALL = 6.5;
const BTN_H = 24;
/** Height of a line of effect tokens (a 9 px icon beside 6.5 px text). */
const TOK_H = 11;
const ICON = 9;
const NICHE_W = 26;
const NICHE_H = 30;

// ------------------------------------------------------------------ text of the deck (events.<lang>.ts)

const evText = (id: string, part: string, fallback = ''): string => tOr(`event.${id}.${part}`, fallback);
export const eventTitle = (id: string): string => evText(id, 'title', id);
export const choiceLabel = (id: string, key: string): string => evText(id, `c.${key}`, key);
/** The result line of a choice (its failure line when its chance failed). */
export const resultLine = (id: string, key: string, ok: boolean): string => (ok ? evText(id, `r.${key}`) : evText(id, `f.${key}`) || evText(id, `r.${key}`));

/** The vignette's icon by where the event found the army (an icon until the art pass, G8). */
const TRIGGER_ICON: Record<EventTrigger, string> = { march: 'march', arrive_village: 'map', arrive_town: 'shop', camp: 'tent', after_battle: 'swords', flag: 'log' };

// ------------------------------------------------------------------ effects in words (R2)

export interface Token {
  icon?: string;
  text: string;
  font: FontKey;
  /** Start a new line before this token. */
  br?: boolean;
}

const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `-${-n}` : '0');
const gainFont = (n: number): FontKey => (n < 0 ? 'pBad' : 'pGood');

/** One effect as a token, or null for the bookkeeping the player doesn't see (flags, the silent garrison cut: EV-02 decision 7). */
export function effectToken(e: Effect): Token | null {
  switch (e.k) {
    case 'gold':
      return { icon: 'coin', text: t('evc.fx.gold', { n: signed(e.n) }), font: gainFont(e.n) };
    case 'food':
      return { icon: 'food', text: t('evc.fx.food', { n: signed(e.n) }), font: gainFont(e.n) };
    case 'supplies':
      return { icon: 'wood', text: t('evc.fx.supplies', { n: signed(e.n) }), font: gainFont(e.n) };
    case 'recruit':
      return { icon: 'people', text: t('evc.fx.recruit', { n: e.n }), font: 'pGood' };
    case 'xp':
      return { icon: 'xp', text: t(`evc.fx.xp.${e.target}` as TKey, { n: e.n }), font: 'pGood' };
    case 'wound':
      return { icon: 'heart', text: t(`evc.fx.wound.${e.target}` as TKey, { h: e.hours }), font: 'pBad' };
    case 'heal':
      return { icon: 'heart', text: t('evc.fx.heal'), font: 'pGood' };
    case 'item':
      return { icon: 'chest', text: t('evc.fx.item', { rarity: tOr(`rarity.${e.rarity}`, e.rarity) }), font: 'pGood' };
    case 'spawnBand': {
      const m = e.mods;
      const bits = [t(`evc.fx.band.${e.kind}` as TKey)];
      if (m.captain) bits.push(t('evc.fx.band.captain'));
      if (m.hunts) bits.push(t('evc.fx.band.hunts'));
      if ((m.bountyMult ?? 1) > 1) bits.push(t('evc.fx.band.bounty', { n: m.bountyMult! }));
      return { icon: 'swords', text: bits.join(', '), font: 'pBad' };
    }
    case 'reveal':
      return { icon: 'eye', text: t(typeof e.at === 'object' ? 'evc.fx.reveal.radius' : 'evc.fx.reveal.lair'), font: 'pGood' };
    case 'retrain':
      return { icon: 'pen', text: t('evc.fx.retrain'), font: 'pGood' };
    case 'priceMod':
      return { icon: 'scales', text: t('evc.fx.price', { p: signed(e.pct), d: e.days }), font: e.pct > 0 ? 'pBad' : 'pGood' };
    case 'closeSettlement':
      return { icon: 'lock', text: t('evc.fx.closed', { d: e.days }), font: 'pBad' };
    case 'nextBattle':
      return { icon: 'laurel', text: t(`evc.fx.next.${e.bonus}` as TKey), font: 'pGood' };
    default:
      return null;
  }
}

const tokens = (fx: readonly Effect[]): Token[] => fx.map(effectToken).filter((x): x is Token => !!x);

/** What a choice does, in words: its cost, its effects, and for a gamble the odds and what happens if it fails. */
export function choiceTokens(c: EventChoice): Token[] {
  const cost = tokens(c.cost ?? []);
  const fx = tokens(c.effects);
  if (!c.chance) return cost.length + fx.length ? [...cost, ...fx] : [{ text: t('evc.fx.none'), font: 'pSec' }];
  // the cost is paid whatever happens; the odds come after it, then what a success and a failure bring
  const none: Token = { text: t('evc.fx.none'), font: 'pSec' };
  const fail = tokens(c.chance.fail);
  return [
    ...cost,
    { icon: 'bolt', text: t('evc.fx.chance', { p: Math.round(c.chance.p * 100) }), font: 'pSec', br: cost.length > 0 },
    ...(fx.length ? fx : [none]),
    { text: t('evc.fx.else'), font: 'pSec', br: true },
    ...(fail.length ? fail : [none]),
  ];
}

export const blockText = (b: ChoiceBlock): string => t(`evc.block.${b.why}` as TKey, { need: b.need, have: b.have });

/** Lay tokens out in rows `w` wide (a token too wide for a row wraps its own words; nothing is cut). Returns the height. */
function layTokens(scene: Phaser.Scene, c: Phaser.GameObjects.Container | null, x0: number, y0: number, w: number, toks: Token[]): number {
  let x = 0;
  let y = 0;
  const GAPX = 6;
  for (const tk of toks) {
    const iw = tk.icon ? ICON + 2 : 0;
    const tw = mw(tk.text, tk.font, SMALL);
    if ((tk.br || x + iw + tw > w) && x > 0) {
      x = 0;
      y += TOK_H;
    }
    const lines = iw + tw > w ? wrapWords(tk.text, w - iw, (s) => mw(s, tk.font, SMALL)) : [tk.text];
    if (c) {
      if (tk.icon) {
        const ic = addIcon(scene, x0 + x, y0 + y, tk.icon);
        ic.setScale(ICON / Math.max(1, ic.width));
        c.add(ic);
      }
      c.add(mtext(scene, x0 + x + iw, y0 + y + 1.5, lines.join('\n'), tk.font, { size: SMALL }));
    }
    const lw = Math.max(...lines.map((l) => mw(l, tk.font, SMALL)));
    x += iw + lw + GAPX;
    y += (lines.length - 1) * TOK_H;
  }
  return y + TOK_H;
}

/** A paragraph wrapped to `w`, narrower (`w - indent`) for the lines beside the vignette (the first `beside` px). Returns its height. */
function para(scene: Phaser.Scene, c: Phaser.GameObjects.Container | null, x: number, y: number, str: string, w: number, indent = 0, beside = 0): number {
  const lh = (10 * BODY) / 7;
  const narrow = wrapWords(str, w - indent, (s) => mw(s, 'pInk', BODY));
  const k = indent ? Math.min(narrow.length, Math.ceil(beside / lh)) : narrow.length;
  const rest = narrow.slice(k).join(' ');
  const wide = rest ? wrapWords(rest, w, (s) => mw(s, 'pInk', BODY)) : [];
  if (c) {
    if (k) c.add(mtext(scene, x + indent, y, narrow.slice(0, k).join('\n'), 'pInk', { size: BODY }));
    if (wide.length) c.add(mtext(scene, x, y + k * lh, wide.join('\n'), 'pInk', { size: BODY }));
  }
  return Math.ceil((k + wide.length) * lh);
}

// ------------------------------------------------------------------ the card

export interface EventCardHandle {
  readonly id: string;
  /** The choice Back takes (the first free one the army can take). */
  readonly freeKey: string | null;
  /** Take a choice as a tap on it does (scripts). False when it is blocked or the card is gone. */
  choose(key: string): boolean;
  /** Close the card or its result page (the event stays pending if it was not answered). */
  close(): void;
  readonly closed: boolean;
}

export interface EventCardOpts {
  /** The card is done: the result page closed (`res`), or the event vanished (null). */
  onDone?: (res: EventResolution | null) => void;
}

/**
 * Open the pending event's card on `scene`, or return null when nothing is pending (an id the deck no
 * longer has is dropped by `pendingEvent()`, so the caller's map runs again).
 */
export function openEventCard(scene: UiScene, o: EventCardOpts = {}): EventCardHandle | null {
  const camp = state.campaign;
  const pe = camp.pendingEvent();
  if (!pe) return null;
  // R4.1: the draw wrote pendingEvent; make sure the save holds it before the card shows
  void state.save();
  const def = pe.def;
  const { VW, VH } = scene.m;
  // the box the sheet gets: v5's in compact portrait, a centred dialog ≤ 320 in landscape (landscape-v6 §3.4)
  const w = sheetWidth(scene, { w: VW - 8, dock: 'bottom', shadeCloses: false, closeButton: false });
  const iw = w - PAD * 2;
  const blocked = new Map(pe.choices.map((c) => [c.key, c.blocked] as const));
  const free = def.choices.find((c) => !c.cost?.length && !blocked.get(c.key)) ?? null;
  const primary = def.choices.find((c) => !blocked.get(c.key)) ?? null;

  // the choices block: a button, then what it does (or why it can't be taken)
  const rowTokens = def.choices.map((c) => {
    const b = blocked.get(c.key);
    return b ? [{ icon: 'lock', text: blockText(b), font: 'pBad' as FontKey }, ...choiceTokens(c)] : choiceTokens(c);
  });
  const bodyText = evText(def.id, 'body');
  const bodyH = Math.max(NICHE_H, para(scene, null, 0, 0, bodyText, iw, NICHE_W + 6, NICHE_H)) + 6;
  const maxH = VH - 12;
  // Each button with its words under it; on a short screen (320x568 in Telegram) that leaves the body no
  // room, so the words go into the scrolling text under the body, each under its choice's name, and the
  // buttons stay fixed at the bottom (never a cut label, never a button under a scroll mask).
  let rowH = rowTokens.map((tk) => BTN_H + 2 + layTokens(scene, null, 0, 0, iw, tk) + 4);
  const tight = maxH - SHEET_TITLE_H - PAD * 2 - rowH.reduce((a, b) => a + b, 0) < Math.min(bodyH, 70);
  if (tight) rowH = rowTokens.map(() => BTN_H + 4);
  const choicesH = rowH.reduce((a, b) => a + b, 0);
  /** In the tight layout: each choice's name and its words, under the body. */
  const outcomes = (c: Phaser.GameObjects.Container | null, y0: number): number => {
    let y = y0;
    def.choices.forEach((ch, i) => {
      const nl = wrapWords(choiceLabel(def.id, ch.key).toUpperCase(), iw, (q) => mw(q, 'rInk', SMALL));
      if (c) c.add(mtext(scene, 0, y, nl.join('\n'), 'rInk', { size: SMALL }));
      y += nl.length * TOK_H;
      y += layTokens(scene, c, 1, y, iw - 2, rowTokens[i]) + 4;
    });
    return y - y0;
  };
  const h = Math.min(maxH, SHEET_TITLE_H + bodyH + (tight ? outcomes(null, 0) : 0) + choicesH + PAD * 2);

  let state_: 'card' | 'result' | 'closed' = 'card';
  let result: EventResolution | null = null;
  let sheet: ParchmentSheetHandle;
  const handle: EventCardHandle = {
    id: def.id,
    freeKey: free?.key ?? null,
    choose: (key) => pick(key),
    close: () => sheet.close(),
    get closed() {
      return state_ === 'closed';
    },
  };

  const finish = () => {
    if (state_ === 'closed') return;
    state_ = 'closed';
    o.onDone?.(result);
  };

  const pick = (key: string): boolean => {
    // the card answers only its own event (a stale card never resolves another one)
    if (state_ !== 'card' || camp.world.s.pendingEvent?.id !== def.id) return false;
    const res = camp.chooseEvent(key);
    if (!res) return false;
    result = res;
    void state.save();
    hapticNotify(res.ok ? 'success' : 'warning');
    state_ = 'result';
    sheet.close();
    sheet = openResult(scene, def, res, finish);
    return true;
  };

  sheet = openParchmentSheet(scene, {
    title: eventTitle(def.id),
    w,
    h,
    dock: 'bottom',
    shadeCloses: false,
    closeButton: false,
    id: 'event.card',
    // closed without an answer (scripts): the event stays pending, and the scene opens the card again
    onClose: () => {
      if (state_ !== 'card') return;
      state_ = 'closed';
      o.onDone?.(null);
    },
  });
  const s = sheet;
  uiId(s.c, `event.${def.id}`);
  // Back: the free choice, after a confirm (screen-flow.md §4); never a costed one. This layer is
  // registered after the sheet's own (which would just close it), so Back reaches it first.
  const guard = scene.add.container(0, 0);
  s.c.add(guard);
  navLayer(guard, () => {
    if (state_ !== 'card') return;
    if (!free) {
      hapticNotify('warning');
      return false;
    }
    const label = choiceLabel(def.id, free.key);
    // after Back has put this layer back (returning false): the confirm's own layer must sit above it
    void Promise.resolve().then(() => {
      if (state_ === 'card' && guard.scene) confirmDialog(scene, { title: t('evc.chooseQ'), body: t('evc.chooseBody', { label }), ok: label, cancel: t('evc.chooseNo'), onOk: () => pick(free.key) });
    });
    return false;
  }, scene);

  // the choices, from the bottom of the sheet up
  const x = s.x + PAD;
  let cy = s.y + s.h - PAD - choicesH;
  def.choices.forEach((c, i) => {
    const b = blocked.get(c.key);
    // a button stays a button, not a banner: ≤ 240 wide (landscape-v6 §2.3; a phone's card is narrower anyway)
    const btn = new MButton(scene, x, cy, Math.min(iw, BUTTON_MAX), BTN_H, {
      label: choiceLabel(def.id, c.key),
      variant: b ? 'disabled' : c === primary ? 'primary' : 'secondary',
      disabledReason: b ? blockText(b) : undefined,
      id: `event.choice.${c.key}`,
      onClick: () => void pick(c.key),
    });
    s.c.add(btn);
    if (!tight) layTokens(scene, s.c, x + 1, cy + BTN_H + 2, iw - 2, rowTokens[i]);
    cy += rowH[i];
  });

  // the vignette and the body; the body scrolls when the screen is short
  const top = s.body.y;
  const room = s.y + s.h - PAD - choicesH - top - 4;
  const area = new ScrollArea(scene, s.c, x, top, iw, Math.max(20, room), scene.m.S);
  addNiche(scene, area.content, 1, 0, NICHE_W - 1, NICHE_H);
  const ic = addIcon(scene, (NICHE_W - 12) / 2, NICHE_H - 17, TRIGGER_ICON[def.trigger] ?? 'log');
  area.content.add(ic);
  let contentH = Math.max(NICHE_H, para(scene, area.content, 0, 0, bodyText, iw, NICHE_W + 6, NICHE_H));
  if (tight) contentH += 6 + outcomes(area.content, contentH + 6);
  area.setContentHeight(contentH + 2);
  if (contentH + 2 > room) addScrollHint(scene, s.c, area, MOSAIC.parch);
  s.c.once('destroy', () => area.destroy());

  // the scene's own teardown (a restart, a resize) closes the card; the event stays pending and reopens
  scene.events.once('shutdown', () => (state_ = 'closed'));
  return handle;
}

/** The result page: what happened, in words, and Continue (an optional sheet: Back or the shade close it too). */
function openResult(scene: UiScene, def: EventDef, res: EventResolution, done: () => void): ParchmentSheetHandle {
  const { VW, VH } = scene.m;
  // the box the sheet gets: v5's in compact portrait, the §3.4 placement elsewhere (landscape-v6)
  const w = sheetWidth(scene, { w: scene.m.cls === 'compact' && scene.m.land ? 1 : VW - 8, dock: 'bottom', closeButton: false });
  const iw = w - PAD * 2;
  const c = def.choices.find((x) => x.key === res.key)!;
  const line = resultLine(def.id, res.key, res.ok);
  const happened = [...tokens(c.cost ?? []), ...tokens(res.ok ? c.effects : c.chance?.fail ?? [])];
  const notes = res.notes.map((n) => tOr(`evc.note.${n}`, '')).filter(Boolean);
  const label = `${choiceLabel(def.id, res.key)}${res.ok ? '' : ` · ${t('evc.failed')}`}`;
  const actions = [{ label: t('menu.continue'), icon: 'check', variant: 'primary' as const, id: 'event.continue', onClick: () => s.close() }];
  const measure = (cc: Phaser.GameObjects.Container | null, x: number, y: number): number => {
    let yy = y;
    const lh = wrapWords(label, iw, (q) => mw(q, 'pSec', BODY));
    if (cc) cc.add(mtext(scene, x, yy, lh.join('\n'), 'pSec', { size: BODY }));
    yy += lh.length * 10 + 4;
    yy += para(scene, cc, x, yy, line, iw) + 5;
    if (happened.length) yy += layTokens(scene, cc, x, yy, iw, happened) + 2;
    for (const n of notes) {
      const nl = wrapWords(n, iw, (q) => mw(q, 'pBad', SMALL));
      if (cc) cc.add(mtext(scene, x, yy, nl.join('\n'), 'pBad', { size: SMALL }));
      yy += nl.length * TOK_H;
    }
    return yy - y;
  };
  const contentH = measure(null, 0, 0);
  const h = Math.min(VH - 12, SHEET_TITLE_H + contentH + PAD * 2 + sheetActionsH(actions, w));
  const s = openParchmentSheet(scene, { title: eventTitle(def.id), w, h, dock: 'bottom', closeButton: false, actions, id: 'event.result', onClose: done });
  const area = new ScrollArea(scene, s.c, s.body.x, s.body.y, iw, s.body.h, scene.m.S);
  measure(area.content, 0, 0);
  area.setContentHeight(contentH);
  if (contentH > s.body.h) addScrollHint(scene, s.c, area, MOSAIC.parch);
  s.c.once('destroy', () => area.destroy());
  return s;
}

// ------------------------------------------------------------------ the journal

/** One journal line (`id:key` or `id:key:fail`, world.ts logJournal) in words, or null for an event the deck no longer has. */
export function journalEntry(line: string): { title: string; choice: string; result: string; ok: boolean } | null {
  const [id, key, fail] = line.split(':');
  if (!id || !key || !eventById(state.campaign.world.deck, id)) return null;
  const ok = fail !== 'fail';
  return { title: eventTitle(id), choice: choiceLabel(id, key), result: resultLine(id, key, ok), ok };
}
