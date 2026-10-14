/**
 * AU-08 Two campaigns (design/ux/accounts-v6.md §4.5, V6-ACCT-07): after a log-in, this browser's
 * campaign and the account's both have a won battle and this device never synced with the account.
 * A decision sheet (no X; an outside tap does nothing): two cards side by side at ≥ 600 CSS px of sheet,
 * stacked below, each with day, men, gold and battles won and a ✓ on the selected one (never colour
 * alone). The one with more progress is preselected, so pressing the primary keeps today's rule.
 * Keeping the one with fewer battles won is confirmed first. Back leaves the choice open: nothing is
 * written here or on the server until the player picks, and the hub asks again.
 */
import { t, type TKey } from '../../i18n';
import { addIcon, scaleIcon, ScrollArea } from '../kit';
import { MButton, mosaicImage, mtext, openParchmentSheet, sheetWidth, GAP, SHEET_TITLE_H, type ParchmentSheetHandle } from '../mosaic';
import { makePressable } from '../mosaic/base';
import type { UiScene } from '../mosaic/subShell';
import { uiId } from '../layout';
import { RS } from '../../platform/renderScale';
import { confirmDialog, toast } from '../widgets';
import { keepsLessProgress, summarize } from '../../platform/saveSync';
import type { SaveData } from '../../game/save';
import { online } from '../../platform/cloud';
import { state } from '../../state';

export type Keep = 'local' | 'cloud';

export interface TwoCampaignsOpts {
  local: SaveData;
  cloud: SaveData;
  prefer: Keep;
  /** Applies the choice; false when it could not be done (the sheet stays open). */
  keep: (k: Keep) => Promise<boolean>;
}

const BTN_H = 24;
const TEXT = 7;
const CARD_PAD = 6;

/** "Day 12 · 9 men · 344 gold · 6 battles won". */
export function statsLine(s: SaveData): string {
  const v = summarize(s);
  return t('sync.two.stats', { day: v.day, men: t('sync.two.men', { n: v.men }), gold: v.gold, won: t('sync.two.won', { n: v.won }) });
}

export function openTwoCampaigns(scene: UiScene, o: TwoCampaignsOpts): ParchmentSheetHandle {
  let sel: Keep = o.prefer;
  let busy = false;
  const sheetO = { title: t('sync.two.title'), w: Math.min(scene.m.VW - 16, 320), shadeCloses: false, closeButton: false, panel: 'decision' as const, id: 'sync.two' };
  const w = sheetWidth(scene, sheetO);
  const bw = w - 16;
  // two columns from 600 CSS px of sheet (accounts-v6.md §1.6), stacked below
  const two = (w * scene.m.S) / RS >= 600;
  const cw = two ? Math.floor((bw - GAP) / 2) : bw;
  const body = mtext(scene, 0, 0, t('sync.two.body'), 'pInk', { size: TEXT, maxW: bw, wrap: true });
  const note = mtext(scene, 0, 0, t('sync.two.note'), 'pSec', { size: TEXT, maxW: bw, wrap: true });
  const sides: Keep[] = ['local', 'cloud'];
  const cardTexts = sides.map((k) => ({
    title: mtext(scene, 0, 0, t(k === 'local' ? 'sync.two.local' : 'sync.two.cloud'), 'rInk', { size: 7.5, maxW: cw - CARD_PAD * 2 }),
    stats: mtext(scene, 0, 0, statsLine(k === 'local' ? o.local : o.cloud), 'pInk', { size: TEXT, maxW: cw - CARD_PAD * 2, wrap: true }),
  }));
  const cardH = Math.max(...cardTexts.map((c) => CARD_PAD + c.title.height + 3 + c.stats.height + 4 + 10 + CARD_PAD));
  // measured: keep the words and the title's height, drop the measuring objects
  const words = cardTexts.map((c) => ({ title: c.title.text, titleH: c.title.height, stats: c.stats.text }));
  for (const c of cardTexts) {
    c.title.destroy();
    c.stats.destroy();
  }
  const cardsH = two ? cardH : cardH * 2 + GAP;
  const contentH = body.height + 6 + cardsH + 6 + note.height;
  const want = SHEET_TITLE_H + contentH + 8 + BTN_H + 16;
  const h = Math.min(want, scene.m.VH - 16);
  const m = openParchmentSheet(scene, { ...sheetO, h });
  const { x, y } = m.body;
  // a short screen: the words and cards scroll above the button, which always shows
  const room = contentH - (want - h);
  const area = room < contentH ? new ScrollArea(scene, m.c, x, y, bw, Math.max(30, room), scene.m.S) : null;
  const into = area?.content ?? m.c;
  const ox = area ? 0 : x;
  let cy = area ? 0 : y;
  into.add(body.setPosition(ox, cy));
  cy += body.height + 6;

  // the cards are built once (pressable, focusable) and repainted on a pick, so keyboard focus stays put
  const cards = sides.map((k, i) => {
    const c = scene.add.container(two ? ox + i * (cw + GAP) : ox, two ? cy : cy + i * (cardH + GAP));
    makePressable(c, { w: cw, h: cardH, tip: t(k === 'local' ? 'sync.two.local' : 'sync.two.cloud'), onTap: () => pick(k) });
    uiId(c, `sync.two.${k}`);
    into.add(c);
    return c;
  });
  const paint = (): void => {
    sides.forEach((k, i) => {
      const c = cards[i];
      c.removeAll(true);
      const on = sel === k;
      c.add(mosaicImage(scene, 0, 0, cw, cardH, on ? 'parchmentSel' : 'parchment'));
      const tx = words[i];
      c.add(mtext(scene, CARD_PAD, CARD_PAD, tx.title, 'rInk', { size: 7.5, maxW: cw - CARD_PAD * 2 }));
      c.add(mtext(scene, CARD_PAD, CARD_PAD + tx.titleH + 3, tx.stats, 'pInk', { size: TEXT }));
      const ky = cardH - CARD_PAD - 9;
      // the selected card says so in words and with a tick, not by colour alone
      if (on) c.add(scaleIcon(addIcon(scene, CARD_PAD, ky - 1, 'check', 'L'), 0.75));
      c.add(mtext(scene, CARD_PAD + (on ? 12 : 0), ky, t((on ? 'sync.two.kept' : 'sync.two.keep') as TKey), on ? 'pInk' : 'pSec', { size: TEXT, maxW: cw - CARD_PAD * 2 - 12 }));
    });
  };
  const pick = (k: Keep): void => {
    if (busy || sel === k) return;
    sel = k;
    paint();
  };
  paint();
  cy += cardsH + 6;
  into.add(note.setPosition(ox, cy));
  if (area) {
    area.setContentHeight(contentH);
    m.c.once('destroy', () => area.destroy());
  }

  const go = async (): Promise<void> => {
    busy = true;
    play.setEnabled(false, t('auth.busy'));
    const ok = await o.keep(sel).catch(() => false);
    if (!m.c.scene) return;
    if (ok) {
      m.close();
      return;
    }
    busy = false;
    play.setEnabled(true);
    toast(scene, t('sync.two.failed'), 'bad');
  };
  const play = new MButton(scene, x, y + Math.min(contentH, room) + 8, bw, BTN_H, {
    label: t('sync.two.play'),
    variant: 'primary',
    id: 'sync.two.play',
    onClick: () => {
      if (busy) return;
      if (!keepsLessProgress(o, sel)) return void go();
      const kept = summarize(sel === 'local' ? o.local : o.cloud).won;
      const lost = summarize(sel === 'local' ? o.cloud : o.local).won;
      confirmDialog(scene, {
        title: t('sync.two.lessTitle'),
        body: t('sync.two.lessBody', { won: t('sync.two.won', { n: lost }), wonKept: t('sync.two.won', { n: kept }) }),
        cancel: t('common.cancel'),
        ok: t('sync.two.play'),
        destructive: true,
        onOk: () => void go(),
      });
    },
  });
  m.c.add(play);
  return m;
}

/**
 * The game's AU-08: the choice waiting in online.choice, applied through the state (the account's
 * campaign replaces this one and the game goes to the menu, or this one goes up to the account).
 * `after` runs once a 'local' choice is applied (the screen re-renders). Null when nothing waits.
 */
export function askTwoCampaigns(scene: UiScene, after?: () => void): ParchmentSheetHandle | null {
  const c = online.choice;
  if (!c) return null;
  return openTwoCampaigns(scene, {
    local: c.local,
    cloud: c.cloud,
    prefer: c.prefer,
    keep: async (k) => {
      await state.keepCampaign(k);
      if (online.choice) return false;
      if (k === 'local') after?.();
      return true;
    },
  });
}

/**
 * After a log-in on this device: the first sync with the account (state.syncAfterSignIn), then AU-08
 * when both sides have progress, else `done` (the screen that asked re-renders).
 */
export async function afterSignIn(scene: UiScene, done?: () => void): Promise<void> {
  await state.syncAfterSignIn();
  if (!scene.sys.isActive()) return;
  if (online.choice) askTwoCampaigns(scene, done);
  else done?.();
}
