/**
 * The battle menu (BTL-01; design/ux/hud.md §D "⋯ battle menu", ELEMENT_MAP E179, E183, E185, E195, E208):
 * the ⋯ key in the top bar opens it. It holds what must not sit next to FIGHT! or the order bar:
 * - deployment: Leave, Reset all (offline), Sound, Settings;
 * - the fight offline: Retreat, Sound, Settings;
 * - the tutorial: Skip tutorial, Sound, Settings;
 * - a battle that cannot pause (`realtimeLocked`: live duels, raids, war): Retreat and Sound only, under
 *   the line "The battle continues" (A11Y-18).
 * Leave, Retreat and Reset all are destructive: each opens its confirm (A11Y-08), never acts at once.
 * Sound toggles in place; the menu stays open. An optional sheet: the X, Back and the shade close it.
 */
import Phaser from 'phaser';
import { type UIMetrics } from '../kit';
import { uiId } from '../layout';
import { MButton, mtext, mw, openParchmentSheet, wrapWords, SHEET_TITLE_H, type MButtonVariant, type ParchmentSheetHandle } from '../mosaic';
import { LINE_H } from '../textfit';
import { t, type TKey } from '../../i18n';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };

export type BattleMenuItem = 'retreat' | 'leave' | 'resetAll' | 'skip' | 'sound' | 'settings';

export interface BattleMenuState {
  phase: 'deploy' | 'battle' | 'ended';
  /** The battle cannot pause (live duel, raid, war attack). */
  realtimeLocked: boolean;
  tutorial: boolean;
  /** An online battle (no Reset all: the deployment is the server's). */
  online: boolean;
}

/** What the menu offers right now, top to bottom (hud.md §D; A11Y-08, A11Y-18). */
export function battleMenuItems(s: BattleMenuState): BattleMenuItem[] {
  if (s.tutorial) return ['skip', 'sound', 'settings'];
  if (s.phase === 'deploy') return s.online ? ['leave', 'sound', 'settings'] : ['leave', 'resetAll', 'sound', 'settings'];
  if (s.phase === 'ended') return ['sound', 'settings'];
  return s.realtimeLocked ? ['retreat', 'sound'] : ['retreat', 'sound', 'settings'];
}

/** The line over the items: a locked fight says the battle runs on while the menu is open. */
export function battleMenuNote(s: BattleMenuState): TKey | null {
  return s.phase === 'battle' && s.realtimeLocked && !s.tutorial ? 'battle.menu.continues' : null;
}

const ICON: Record<BattleMenuItem, string> = { retreat: 'flag', leave: 'back', resetAll: 'repair', skip: 'fast', sound: 'sound', settings: 'gear' };
const LABEL: Record<Exclude<BattleMenuItem, 'sound'>, TKey> = {
  retreat: 'battle.menu.retreat',
  leave: 'battle.menu.leave',
  resetAll: 'battle.menu.resetAll',
  skip: 'battle.menu.skip',
  settings: 'battle.menu.settings',
};

export interface BattleMenuOpts {
  state: BattleMenuState;
  /** Sound is on now. */
  soundOn: () => boolean;
  /** Flip the sound setting (the menu redraws its row). */
  toggleSound: () => void;
  /** An item other than Sound was picked: the menu has closed first. */
  onPick: (item: Exclude<BattleMenuItem, 'sound'>) => void;
  /** Closed without picking (X, Back, the shade). */
  onDismiss?: () => void;
}

export interface BattleMenuHandle {
  readonly items: readonly BattleMenuItem[];
  /** Pick an item as a tap would (scripts). */
  pick(item: BattleMenuItem): void;
  close(): void;
  readonly closed: boolean;
  readonly sheet: ParchmentSheetHandle;
}

const ROW_H = 24;
const GAP = 4;
const PAD = 8;
const NOTE = 7;

/** A row is a button: at most 240 wide (landscape-v6 §2.3), centred in the sheet's body (a side panel can be wider). */
const ROW_MAX_W = 240;
function rowBox(body: { x: number; w: number }): { x: number; w: number } {
  const w = Math.min(body.w, ROW_MAX_W);
  return { x: body.x + Math.floor((body.w - w) / 2), w };
}

export function openBattleMenu(scene: UiScene, o: BattleMenuOpts): BattleMenuHandle {
  const { VW } = scene.m;
  const items = battleMenuItems(o.state);
  const noteKey = battleMenuNote(o.state);
  const w = Math.min(240, VW - 8);
  const inner = w - PAD * 2;
  const noteLines = noteKey ? wrapWords(t(noteKey), inner, (s) => mw(s, 'pSec', NOTE)) : [];
  const noteH = noteLines.length ? Math.ceil((noteLines.length * LINE_H * NOTE) / 7) + 6 : 0;
  const h = SHEET_TITLE_H + PAD + noteH + items.length * (ROW_H + GAP) - GAP + PAD;
  let picked = false;
  let closed = false;
  const sheet = openParchmentSheet(scene, {
    title: t('battle.menu.title'),
    w,
    h,
    dock: 'bottom',
    id: 'battle.menu',
    onClose: () => {
      closed = true;
      if (!picked) o.onDismiss?.();
    },
  });
  const { c, body } = sheet;
  let y = body.y;
  if (noteLines.length) {
    const note = mtext(scene, body.x + body.w / 2, y, noteLines.join('\n'), 'pSec', { size: NOTE, align: 0.5 });
    uiId(note, 'battle.menu.note');
    c.add(note);
    y += noteH;
  }
  const rows = new Map<BattleMenuItem, MButton>();
  const soundLabel = () => t(o.soundOn() ? 'battle.menu.soundOn' : 'battle.menu.soundOff');
  const make = (item: BattleMenuItem, ry: number): MButton => {
    const sound = item === 'sound';
    const variant: MButtonVariant = sound ? (o.soundOn() ? 'lit' : 'secondary') : item === 'settings' || item === 'skip' ? 'secondary' : 'neutral';
    const row = rowBox(body);
    const b = new MButton(scene, row.x, ry, row.w, ROW_H, {
      label: sound ? soundLabel() : t(LABEL[item]),
      icon: ICON[item],
      variant,
      id: `battle.menu.${item}`,
      onClick: () => pick(item),
    });
    c.add(b);
    rows.set(item, b);
    return b;
  };
  const pick = (item: BattleMenuItem) => {
    if (closed) return;
    if (item === 'sound') {
      o.toggleSound();
      const old = rows.get('sound');
      const ry = old?.y ?? y;
      old?.destroy();
      make('sound', ry);
      return;
    }
    picked = true;
    sheet.close();
    o.onPick(item);
  };
  items.forEach((item, i) => make(item, y + i * (ROW_H + GAP)));
  return {
    items,
    pick,
    close: () => sheet.close(),
    get closed() {
      return closed;
    },
    sheet,
  };
}

export interface AbilitySheetItem {
  key: string;
  icon: string;
  label: string;
  /** What it does, one short line. */
  sub: string;
}

/**
 * The medallion rail's "more" sheet (hud.md Z5, abilities.md R4): the
 * abilities that did not fit the rail, one row each (its name; what it does
 * under it). A pick closes the sheet, then uses the ability.
 */
export function openAbilitySheet(scene: UiScene, o: { items: AbilitySheetItem[]; onPick: (key: string) => void; onDismiss?: () => void }): ParchmentSheetHandle {
  const { VW } = scene.m;
  const w = Math.min(240, VW - 8);
  const inner = w - PAD * 2;
  const subs = o.items.map((it) => (it.sub ? wrapWords(it.sub, inner, (s) => mw(s, 'pSec', NOTE)) : []));
  const subH = (n: number) => (n ? Math.ceil((n * LINE_H * NOTE) / 7) + 2 : 0);
  const h = SHEET_TITLE_H + PAD + o.items.reduce((a, _it, i) => a + ROW_H + subH(subs[i].length) + GAP, 0) - GAP + PAD + 4;
  let picked = false;
  const sheet = openParchmentSheet(scene, {
    title: t('battle.more.title'),
    w,
    h,
    dock: 'bottom',
    id: 'battle.moreSheet',
    onClose: () => {
      if (!picked) o.onDismiss?.();
    },
  });
  const { c, body } = sheet;
  let y = body.y;
  const row = rowBox(body);
  o.items.forEach((it, i) => {
    c.add(
      new MButton(scene, row.x, y, row.w, ROW_H, {
        label: it.label,
        icon: it.icon,
        variant: 'secondary',
        id: `battle.more.${it.key}`,
        onClick: () => {
          picked = true;
          sheet.close();
          o.onPick(it.key);
        },
      }),
    );
    y += ROW_H;
    if (subs[i].length) {
      c.add(mtext(scene, body.x + 2, y + 1, subs[i].join('\n'), 'pSec', { size: NOTE }));
      y += subH(subs[i].length);
    }
    y += GAP;
  });
  return sheet;
}
