/**
 * Settings → Notifications (the bot's messages, per type, plus quiet hours)
 * and Settings → About (terms, privacy, refunds). Both are modals on top of
 * the settings list (src/ui/settings.ts).
 *
 * The switches live on the server (/api/notify/settings, the same row the
 * bot's /settings command edits). Outside Telegram, or offline, the modal
 * says so and the switches stay disabled. `demo` (layout check, gallery)
 * uses in-memory data.
 */
import Phaser from 'phaser';
import { Button, addText, type UIMetrics } from './kit';
import { ScrollList, openModal } from './widgets';
import { ellipsize, wrapText, LINE_H } from './textfit';
import { SIZE } from './theme';
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

type Row = { kind: 'type'; type: NotifyType } | { kind: 'quiet' };
const ROWS: Row[] = [...NOTIFY_TYPES.map((type) => ({ kind: 'type' as const, type })), { kind: 'quiet' }];

/** Opens the notification switches. */
export function openNotifySettings(scene: UiScene, opts: { source?: NotifySource; onClose?: () => void } = {}): Phaser.GameObjects.Container {
  const src = opts.source ?? liveSource;
  const { VW, VH } = scene.m;
  const rowH = SIZE.btnH;
  const step = rowH + SIZE.gap;
  const w = Math.min(VW - 16, 220);
  const noteLines = 3;
  const want = 26 + noteLines * LINE_H + 6 + ROWS.length * step + 8 + SIZE.btnH + 12;
  const m = openModal(scene, { title: t('notify.title'), w, h: Math.min(want, VH - 16), onClose: opts.onClose });
  const { c, x, y, h } = m;
  const iw = w - 16;
  let note: Phaser.GameObjects.GameObject | null = null;
  const setNote = (s: string, font: 'dim' | 'red' = 'dim') => {
    note?.destroy();
    note = addText(scene, x + 8, y + 26, wrapText(s, iw, noteLines).lines.join('\n'), font);
    c.add(note);
  };
  setNote(t('common.loading'));
  let st: NotifySettings | null = null;
  let busy = false;
  const listY = y + 26 + noteLines * LINE_H + 6;
  const listH = h - (listY - y) - SIZE.btnH - 18;
  const buttons = new Map<string, Button>();
  const isOn = (r: Row) => (st ? (r.kind === 'quiet' ? st.quiet : st.types.find((x) => x.type === r.type)?.on ?? true) : false);
  let list: ScrollList | null = new ScrollList(scene, c, x + 8, listY, iw, listH, {
    count: ROWS.length,
    rowH,
    render: (i, row, rw) => {
      const r = ROWS[i];
      const label: TKey = r.kind === 'quiet' ? 'notify.quiet' : (`notify.type.${r.type}` as TKey);
      row.add(addText(scene, 0, 8, ellipsize(t(label).toUpperCase(), rw - 46), 'ink'));
      const on = isOn(r);
      const id = r.kind === 'quiet' ? 'notify.quiet' : `notify.${r.type}`;
      const b = new Button(scene, rw - 40, 1, 40, 22, { label: on ? t('common.on') : t('common.off'), style: on ? 'buttonSel' : 'button', id });
      if (!st) b.setEnabled(false, t('notify.offline'));
      b.setOnClick(() => void toggle(r));
      buttons.set(id, b);
      row.add(b);
    },
  });
  const toggle = async (r: Row) => {
    if (!st || busy) return;
    busy = true;
    haptic('light');
    try {
      st = await src.save(r.kind === 'quiet' ? { quiet: !st.quiet } : { on: { [r.type]: !isOn(r) } });
      if (!c.active) return;
      setNote(st.blocked ? t('notify.blocked') : t('notify.note'), st.blocked ? 'red' : 'dim');
    } catch {
      if (c.active) setNote(t('notify.failed'), 'red');
    } finally {
      busy = false;
      if (c.active) list?.refresh();
    }
  };
  const bw = Math.min(110, w - 40);
  c.add(new Button(scene, x + (w - bw) / 2, y + h - SIZE.btnH - 9, bw, SIZE.btnH, { label: t('common.close'), icon: 'check', onClick: () => m.close() }));
  c.once('destroy', () => {
    list?.destroy();
    list = null;
  });
  void src
    .load()
    .then((s) => {
      if (!c.active) return;
      st = s;
      setNote(s.blocked ? t('notify.blocked') : t('notify.note'), s.blocked ? 'red' : 'dim');
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
  const w = Math.min(VW - 16, 220);
  const iw = w - 16;
  const note = wrapText(t('about.note'), iw, 6);
  const step = SIZE.btnH + SIZE.gap;
  const want = 26 + note.lines.length * LINE_H + 8 + PAGES.length * step + 8 + SIZE.btnH + 12;
  const m = openModal(scene, { title: t('about.title'), w, h: Math.min(want, VH - 16), onClose });
  const { c, x, y, h } = m;
  c.add(addText(scene, x + 8, y + 26, note.lines.join('\n'), 'ink'));
  let by = y + 26 + note.lines.length * LINE_H + 8;
  for (const p of PAGES) {
    c.add(new Button(scene, x + 8, by, iw, SIZE.btnH, { label: t(p.label), id: `about.${p.page}`, onClick: () => openExternalLink(legalUrl(p.page, lang())) }));
    by += step;
  }
  const bw = Math.min(110, w - 40);
  c.add(new Button(scene, x + (w - bw) / 2, y + h - SIZE.btnH - 9, bw, SIZE.btnH, { label: t('common.close'), icon: 'check', onClick: () => m.close() }));
  return c;
}
