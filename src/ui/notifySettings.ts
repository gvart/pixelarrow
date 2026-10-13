/**
 * Settings → Notifications (the bot's messages, per type, plus quiet hours)
 * and Settings → About (terms, privacy, refunds). Both are pages of the
 * settings sheet (src/ui/settings.ts, M-15): a sheet as wide as the settings
 * that takes its place, with a back chevron instead of an X; the chevron, Back
 * or a tap outside bring the settings back (the overlay stack, V5-029).
 *
 * The switches live on the server (/api/notify/settings, the same row the
 * bot's /settings command edits). Outside Telegram, or offline, the page
 * says so and the switches stay disabled. `demo` (layout check, gallery)
 * uses in-memory data.
 */
import Phaser from 'phaser';
import { Button, addText, type UIMetrics } from './kit';
import { Toggle } from './mosaic/toggles';
import { ScrollList, type Modal } from './widgets';
import { ellipsize, measureText, wrapText, LINE_H } from './textfit';
import { SIZE } from './theme';
import { MOSAIC } from './tokens';
import { uiFrame } from './layout';
import { openParchmentSheet } from './mosaic/ParchmentSheet';
import { MIconButton } from './mosaic/iconButton';
import { online } from '../platform/cloud';
import { NOTIFY_TYPES, type NotifySettings, type NotifyType } from '../platform/api';
import { haptic, openExternalLink } from '../platform/telegram';
import { lang, t, type TKey } from '../i18n';
import { legalUrl, type LegalPage } from './legal';

interface UiScene extends Phaser.Scene {
  ui: Phaser.GameObjects.Container;
  m: UIMetrics;
}

export interface NotifySource {
  load(): Promise<NotifySettings>;
  save(change: { on?: Partial<Record<NotifyType, boolean>>; quiet?: boolean }): Promise<NotifySettings>;
}

const liveSource: NotifySource = {
  async load() {
    if (!(await online.signIn())) throw new Error('offline');
    return online.api.notifySettings();
  },
  save: (change) => online.api.saveNotifySettings(change),
};

/** In-memory settings (layout check, gallery). */
export function demoNotifySource(over: Partial<NotifySettings> = {}): NotifySource {
  let st: NotifySettings = { types: NOTIFY_TYPES.map((type) => ({ type, on: type !== 'market' })), quiet: true, tzOffset: 180, blocked: false, ...over };
  return {
    load: async () => st,
    save: async (change) => {
      st = {
        ...st,
        types: st.types.map((x) => ({ ...x, on: change.on?.[x.type] ?? x.on })),
        quiet: change.quiet ?? st.quiet,
      };
      return st;
    },
  };
}

/** Width of the settings sheet and of its pages (they take each other's place). */
export const settingsSheetW = (VW: number): number => Math.min(VW - 8, 240);

/** Title sizes of a page, largest first; 6.5 UI px is the readable floor (A11Y-09). */
const TITLE_SIZES = [9, 8.5, 8, 7.5, 7, 6.5];

/**
 * A page of the settings sheet: a docked sheet as wide as the settings, a back
 * chevron at the left of its title and no X (one close affordance, G5).
 * Closing it (chevron, Back, a tap outside) uncovers the settings again.
 */
export function openSettingsPage(scene: UiScene, o: { title: string; h: number; id: string; onClose?: () => void }): Modal {
  const w = settingsSheetW(scene.m.VW);
  const m = openParchmentSheet(scene, { w, h: o.h, dock: 'bottom', closeButton: false, onClose: o.onClose, id: o.id });
  const { c, x, y } = m;
  c.add(new MIconButton(scene, x + 3, y + 1, 22, 22, { icon: 'chevL', label: t('common.back'), variant: 'secondary', id: `${o.id}.back`, onClick: () => m.close() }));
  // centred like every sheet title; moved right of the chevron when it would not fit there at a readable size
  const fit = (room: number) => TITLE_SIZES.find((z) => measureText(o.title, false, z, 'roman') <= room);
  const centred = fit(w - 52);
  const room = centred ? w - 52 : w - 34;
  const cx = centred ? x + w / 2 : x + 26 + room / 2;
  const txt = addText(scene, cx, y + 9, o.title, 'rInk', 0.5).setFontSize(centred ?? fit(room) ?? 6.5);
  uiFrame(txt, c, room, 24, cx - room / 2, y);
  c.add(txt);
  const g = scene.add.graphics();
  g.lineStyle(0.7, MOSAIC.parchEdge, 0.7);
  g.lineBetween(x + 26, y + 21, x + w - 8, y + 21);
  c.add(g);
  return m;
}

type Row = { kind: 'type'; type: NotifyType } | { kind: 'quiet' };
const ROWS: Row[] = [...NOTIFY_TYPES.map((type) => ({ kind: 'type' as const, type })), { kind: 'quiet' }];

/** Opens the notification switches. */
export function openNotifySettings(scene: UiScene, opts: { source?: NotifySource; onClose?: () => void } = {}): Phaser.GameObjects.Container {
  const src = opts.source ?? liveSource;
  const { VW, VH } = scene.m;
  const rowH = SIZE.btnH;
  const step = rowH + SIZE.gap;
  const w = settingsSheetW(VW);
  const noteLines = 3;
  const want = 26 + noteLines * LINE_H + 6 + ROWS.length * step + 12;
  const m = openSettingsPage(scene, { title: t('notify.title'), h: Math.min(want, VH - 12), id: 'notify', onClose: opts.onClose });
  const { c, x, y, h } = m;
  const iw = w - 16;
  let note: Phaser.GameObjects.GameObject | null = null;
  const setNote = (s: string, font: 'pMuted' | 'pBad' = 'pMuted') => {
    note?.destroy();
    note = addText(scene, x + 8, y + 26, wrapText(s, iw, noteLines).lines.join('\n'), font);
    c.add(note);
  };
  setNote(t('common.loading'));
  let st: NotifySettings | null = null;
  let busy = false;
  const listY = y + 26 + noteLines * LINE_H + 6;
  const listH = h - (listY - y) - 12;
  const isOn = (r: Row) => (st ? (r.kind === 'quiet' ? st.quiet : st.types.find((x) => x.type === r.type)?.on ?? true) : false);
  let list: ScrollList | null = new ScrollList(scene, c, x + 8, listY, iw, listH, {
    count: ROWS.length,
    rowH,
    render: (i, row, rw) => {
      const r = ROWS[i];
      const label: TKey = r.kind === 'quiet' ? 'notify.quiet' : (`notify.type.${r.type}` as TKey);
      row.add(addText(scene, 0, 8, ellipsize(t(label), rw - 44), 'pInk'));
      const on = isOn(r);
      const id = r.kind === 'quiet' ? 'notify.quiet' : `notify.${r.type}`;
      row.add(new Toggle(scene, rw - 4 - 34, 1, { on, label: t(label), id, disabled: st ? undefined : t('notify.offline'), onChange: () => void toggle(r) }));
    },
  });
  const toggle = async (r: Row) => {
    if (!st || busy) return;
    busy = true;
    haptic('light');
    try {
      st = await src.save(r.kind === 'quiet' ? { quiet: !st.quiet } : { on: { [r.type]: !isOn(r) } });
      if (!c.active) return;
      setNote(st.blocked ? t('notify.blocked') : t('notify.note'), st.blocked ? 'pBad' : 'pMuted');
    } catch {
      if (c.active) setNote(t('notify.failed'), 'pBad');
    } finally {
      busy = false;
      if (c.active) list?.refresh();
    }
  };
  c.once('destroy', () => {
    list?.destroy();
    list = null;
  });
  void src
    .load()
    .then((s) => {
      if (!c.active) return;
      st = s;
      setNote(s.blocked ? t('notify.blocked') : t('notify.note'), s.blocked ? 'pBad' : 'pMuted');
      list?.refresh();
    })
    .catch(() => {
      if (c.active) setNote(t('notify.offline'));
    });
  return c;
}

const PAGES: { page: LegalPage; label: TKey }[] = [
  { page: 'terms', label: 'about.terms' },
  { page: 'privacy', label: 'about.privacy' },
  { page: 'refunds', label: 'about.refunds' },
];

/** Settings → About: what the game is, the legal pages, where to get help with a purchase. */
export function openAbout(scene: UiScene, onClose?: () => void): Phaser.GameObjects.Container {
  const { VW, VH } = scene.m;
  const w = settingsSheetW(VW);
  const iw = w - 16;
  const note = wrapText(t('about.note'), iw, 6);
  const step = SIZE.btnH + SIZE.gap;
  const want = 26 + note.lines.length * LINE_H + 8 + PAGES.length * step + 12;
  const m = openSettingsPage(scene, { title: t('about.title'), h: Math.min(want, VH - 12), id: 'about', onClose });
  const { c, x, y } = m;
  c.add(addText(scene, x + 8, y + 26, note.lines.join('\n'), 'pInk'));
  let by = y + 26 + note.lines.length * LINE_H + 8;
  for (const p of PAGES) {
    c.add(new Button(scene, x + 8, by, iw, SIZE.btnH, { label: t(p.label), id: `about.${p.page}`, onClick: () => openExternalLink(legalUrl(p.page, lang())) }));
    by += step;
  }
  return c;
}
