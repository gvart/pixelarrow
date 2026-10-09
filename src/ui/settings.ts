/**
 * The settings modal: opened from the menu and from Telegram's ⋯ → Settings
 * on any screen. One scrolling list (sound first, then language, then battle
 * pauses), so it fits the smallest phones in both languages.
 */
import Phaser from 'phaser';
import { Button, addIcon, addText, panelImage, type UIMetrics } from './kit';
import { ScrollList, Tabs, confirmDialog } from './widgets';
import { Stepper, Toggle, openSheet } from './v3';
import { SURFACE } from './tokens';
import { motion, setReducedMotion } from './motion';
import { ellipsize, measureText, wrapText } from './textfit';
import { SIZE } from './theme';
import { state } from '../state';
import { haptic, setHaptics } from '../platform/telegram';
import type { Settings } from '../game/save';
import { audio } from '../audio';
import { t, type LangSetting, type TKey } from '../i18n';
import { refreshLang } from './lang';
import { canResume, progressOf } from '../game/tutorial';
import { openAbout, openNotifySettings } from './notifySettings';
import { analyticsToggled } from '../platform/monitoring';

type ToggleKey = { [K in keyof Settings]-?: Settings[K] extends boolean ? K : never }[keyof Settings];
type Volume = 'musicVol' | 'sfxVol';
type Row =
  | { kind: 'section'; label: TKey }
  | { kind: 'toggle'; key: ToggleKey; label: TKey }
  | { kind: 'motion'; label: TKey }
  | { kind: 'volume'; key: Volume; label: TKey }
  | { kind: 'lang' }
  | { kind: 'tutorial'; label: TKey }
  | { kind: 'open'; what: 'notify' | 'about'; label: TKey }
  | { kind: 'newCampaign'; label: TKey };

interface UiScene extends Phaser.Scene {
  ui: Phaser.GameObjects.Container;
  m: UIMetrics;
}

/** Grouped: Audio, Language, Battle pauses, Accessibility, Account. */
const ROWS: Row[] = [
  { kind: 'section', label: 'settings.sec.audio' },
  { kind: 'toggle', key: 'sound', label: 'settings.sound' },
  { kind: 'volume', key: 'musicVol', label: 'settings.music' },
  { kind: 'volume', key: 'sfxVol', label: 'settings.effects' },
  { kind: 'section', label: 'settings.language' },
  { kind: 'lang' },
  { kind: 'section', label: 'settings.sec.battle' },
  { kind: 'toggle', key: 'dmgNumbers', label: 'settings.dmgNumbers' },
  { kind: 'toggle', key: 'pauseContact', label: 'settings.pauseContact' },
  { kind: 'toggle', key: 'pauseFlank', label: 'settings.pauseFlank' },
  { kind: 'toggle', key: 'pauseRout', label: 'settings.pauseRout' },
  { kind: 'toggle', key: 'pauseDeath', label: 'settings.pauseDeath' },
  { kind: 'section', label: 'settings.sec.access' },
  { kind: 'motion', label: 'settings.reduceMotion' },
  { kind: 'toggle', key: 'haptics', label: 'settings.haptics' },
  { kind: 'section', label: 'settings.sec.account' },
  { kind: 'tutorial', label: 'settings.tutorial' },
  { kind: 'open', what: 'notify', label: 'settings.notifications' },
  { kind: 'open', what: 'about', label: 'settings.about' },
  { kind: 'toggle', key: 'analytics', label: 'settings.analytics' },
  { kind: 'newCampaign', label: 'settings.newCampaign' },
];
const LANGS_SET: LangSetting[] = ['auto', 'en', 'ru'];
/** One icon per section. */
const SECTION_ICON: Partial<Record<TKey, string>> = {
  'settings.sec.audio': 'horn',
  'settings.language': 'map',
  'settings.sec.battle': 'swords',
  'settings.sec.access': 'eye',
  'settings.sec.account': 'people',
};
/** Scenes that may be rebuilt when the language changes (never a running battle). */
const REBUILD_ON_LANG = new Set(['Menu', 'Codex', 'World', 'Settlement', 'Army', 'Hero', 'Online', 'OnlineArmy', 'OnlineClan', 'Kit']);

const open = new WeakMap<Phaser.Scene, Phaser.GameObjects.Container>();

/**
 * The settings sheet (slides up; Back, a tap outside or Close shut it):
 * sections with switches, steppers and the language as a segmented control.
 * `onClose` runs when it closes.
 */
export function openSettings(scene: UiScene, onClose?: () => void): Phaser.GameObjects.Container {
  open.get(scene)?.destroy();
  const s = state.campaign.data.settings;
  const { VW, VH } = scene.m;
  const rowH = 24;
  const step = rowH + SIZE.gap;
  const w = Math.min(VW - 8, 240);
  const want = 26 + ROWS.length * step + 8 + SIZE.btnH + 14;
  const m = openSheet(scene, { title: t('settings.title'), w, h: Math.min(want, VH - 12), onClose });
  const { c, body } = m;
  const listH = body.h - SIZE.btnH - 8;
  let list: ScrollList | null = null;
  list = new ScrollList(scene, c, body.x, body.y, body.w, listH, {
    count: ROWS.length,
    rowH,
    render: (i, row, rw) => {
      const r = ROWS[i];
      if (r.kind === 'section') {
        // a section: its icon and title over a bronze hairline
        row.add(addIcon(scene, 0, 8, SECTION_ICON[r.label] ?? 'gear'));
        row.add(addText(scene, 16, 10, ellipsize(t(r.label), rw - 16, false, 7, 'head'), 'head'));
        row.add(scene.add.rectangle(0, 21, rw - 4, 1, SURFACE.line).setOrigin(0, 0));
        return;
      }
      // every setting on a faint well, so a section reads as one group
      if (r.kind !== 'lang') row.add(panelImage(scene, 0, 0, rw - 4, rowH - 1, r.kind === 'newCampaign' ? 'cardLocked' : 'inset'));
      if (r.kind === 'lang') {
        const cur = LANGS_SET.indexOf(s.lang ?? 'auto');
        row.add(
          new Tabs(scene, 0, 0, rw - 4, LANGS_SET.map((l) => t(`settings.lang.${l}`)), {
            selected: cur,
            ids: LANGS_SET.map((l) => `settings.lang.${l}`),
            onChange: (k) => {
              s.lang = LANGS_SET[k];
              void state.save();
              if (refreshLang()) {
                // rebuild the screen in the new language and bring the settings back
                m.close();
                if (REBUILD_ON_LANG.has(scene.sys.settings.key)) {
                  scene.events.once('create', () => openSettings(scene, onClose));
                  scene.scene.restart(scene.sys.settings.data);
                } else openSettings(scene, onClose);
              }
            },
          }),
        );
        return;
      }
      const right = r.kind === 'volume' ? 74 : r.kind === 'tutorial' || r.kind === 'open' || r.kind === 'newCampaign' ? 70 : 38;
      // a label that does not fit goes onto two smaller lines (never cut)
      const room = rw - right - 6;
      const label = t(r.label);
      if (measureText(label) <= room - 4) row.add(addText(scene, 6, 8, label, 'ink'));
      else row.add(addText(scene, 6, 3, wrapText(label, room - 4, 2, false, 6).lines.join('\n'), 'ink').setFontSize(6).setLineSpacing(-1.5));
      if (r.kind === 'toggle') {
        const k = r.key;
        row.add(
          new Toggle(scene, rw - 4 - 34, 1, {
            on: !!s[k],
            label: t(r.label),
            id: `settings.toggle.${k}`,
            onChange: (on) => {
              s[k] = on;
              if (k === 'haptics') setHaptics(s.haptics);
              if (k === 'sound') audio.refresh();
              if (k === 'analytics') analyticsToggled();
              haptic('light');
              void state.save();
            },
          }),
        );
      } else if (r.kind === 'motion') {
        row.add(
          new Toggle(scene, rw - 4 - 34, 1, {
            on: motion.reduced,
            label: t(r.label),
            id: 'settings.toggle.reduceMotion',
            onChange: (on) => {
              s.reduceMotion = on;
              setReducedMotion(on);
              void state.save();
            },
          }),
        );
      } else if (r.kind === 'volume') {
        const k = r.key;
        row.add(
          new Stepper(scene, rw - 4 - 70, 1, {
            value: s[k],
            min: 0,
            max: 10,
            label: t(r.label),
            id: `settings.${k}`,
            onChange: (v) => {
              s[k] = v;
              audio.refresh();
              if (k === 'sfxVol') audio.play('block');
              void state.save();
            },
          }),
        );
      } else if (r.kind === 'tutorial') {
        // replay the guided battle (or resume an interrupted one); never from inside a battle
        const resume = canResume(progressOf(s));
        const b = new Button(scene, rw - 4 - 68, 1, 68, 22, { label: t(resume ? 'settings.tutorialResume' : 'settings.tutorialReplay'), icon: 'play', inline: true, variant: 'ghost', small: true, tip: t('settings.tutorialTip'), id: 'settings.tutorial' });
        const busy = ['Battle', 'Results'].includes(scene.sys.settings.key);
        if (busy) b.setEnabled(false, t('settings.tutorialBusy'));
        b.setOnClick(() => {
          m.close();
          scene.scene.start('Battle', { tutorial: { replay: !resume } });
        });
        row.add(b);
      } else if (r.kind === 'newCampaign') {
        // ends the march: a quiet destructive button, then a confirmation that says what is lost and kept
        const b = new Button(scene, rw - 4 - 68, 1, 68, 22, { label: t('settings.newCampaignGo'), icon: 'flag', inline: true, variant: 'destructive', small: true, id: 'settings.newCampaign', tip: t('menu.row.new') });
        const busy = ['Battle', 'Results'].includes(scene.sys.settings.key) || !state.hasSave;
        if (busy) b.setEnabled(false, state.hasSave ? t('settings.tutorialBusy') : t('menu.noSave'));
        b.setOnClick(() => (m.close(), confirmNewCampaign(scene)));
        row.add(b);
      } else if (r.kind === 'open') {
        const what = r.what;
        row.add(new Button(scene, rw - 4 - 68, 1, 68, 22, { label: t('settings.open'), icon: 'chevR', inline: true, variant: 'ghost', small: true, id: `settings.open.${what}`, onClick: () => (what === 'notify' ? openNotifySettings(scene) : openAbout(scene)) }));
      }
    },
  });
  c.add(new Button(scene, body.x, body.y + body.h - SIZE.btnH, body.w, SIZE.btnH, { label: t('common.close'), variant: 'ghost', id: 'settings.close', onClick: () => m.close() }));
  open.set(scene, c);
  c.once('destroy', () => {
    if (open.get(scene) === c) open.delete(scene);
    list?.destroy();
    list = null;
  });
  return c;
}

/**
 * "New campaign": confirmed (destructive), saying what is lost (the warband,
 * stash, gold and map) and what is kept (settings, Duels, the online war,
 * Drachmae and looks), then a fresh march on the world map.
 */
export function confirmNewCampaign(scene: UiScene): Phaser.GameObjects.Container {
  const c = state.campaign.data;
  return confirmDialog(scene, {
    title: t('menu.resetTitle'),
    body: t('menu.resetBodyFull', { men: c.heroes.length, gold: c.gold, day: Math.floor(c.world.time / 24) + 1 }),
    cancel: t('common.cancel'),
    ok: t('menu.resetOk'),
    destructive: true,
    onOk: () => void state.reset().then(() => scene.scene.start('World')),
  });
}
