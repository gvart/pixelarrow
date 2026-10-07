/**
 * The settings modal: opened from the menu and from Telegram's ⋯ → Settings
 * on any screen. One scrolling list (sound first, then language, then battle
 * pauses), so it fits the smallest phones in both languages.
 */
import Phaser from 'phaser';
import { Button, addText, type UIMetrics } from './kit';
import { ScrollList, openModal } from './widgets';
import { ellipsize } from './textfit';
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

type Toggle = { [K in keyof Settings]-?: Settings[K] extends boolean ? K : never }[keyof Settings];
type Volume = 'musicVol' | 'sfxVol';
type Row =
  | { kind: 'toggle'; key: Toggle; label: TKey }
  | { kind: 'volume'; key: Volume; label: TKey }
  | { kind: 'lang'; label: TKey }
  | { kind: 'tutorial'; label: TKey }
  | { kind: 'open'; what: 'notify' | 'about'; label: TKey };

interface UiScene extends Phaser.Scene {
  ui: Phaser.GameObjects.Container;
  m: UIMetrics;
}

const ROWS: Row[] = [
  { kind: 'toggle', key: 'sound', label: 'settings.sound' },
  { kind: 'volume', key: 'musicVol', label: 'settings.music' },
  { kind: 'volume', key: 'sfxVol', label: 'settings.effects' },
  { kind: 'lang', label: 'settings.language' },
  { kind: 'toggle', key: 'haptics', label: 'settings.haptics' },
  { kind: 'toggle', key: 'dmgNumbers', label: 'settings.dmgNumbers' },
  { kind: 'toggle', key: 'pauseContact', label: 'settings.pauseContact' },
  { kind: 'toggle', key: 'pauseFlank', label: 'settings.pauseFlank' },
  { kind: 'toggle', key: 'pauseRout', label: 'settings.pauseRout' },
  { kind: 'toggle', key: 'pauseDeath', label: 'settings.pauseDeath' },
  { kind: 'tutorial', label: 'settings.tutorial' },
  { kind: 'open', what: 'notify', label: 'settings.notifications' },
  { kind: 'open', what: 'about', label: 'settings.about' },
  { kind: 'toggle', key: 'analytics', label: 'settings.analytics' },
];
const LANG_CYCLE: LangSetting[] = ['auto', 'en', 'ru'];
/** Scenes that may be rebuilt when the language changes (never a running battle). */
const REBUILD_ON_LANG = new Set(['Menu', 'World', 'Settlement', 'Army', 'Hero', 'Online', 'OnlineArmy', 'OnlineClan', 'Kit']);

const open = new WeakMap<Phaser.Scene, Phaser.GameObjects.Container>();

/** Open (or bring back) the settings modal on top of the scene's UI. `onClose` runs when it closes. */
export function openSettings(scene: UiScene, onClose?: () => void): Phaser.GameObjects.Container {
  open.get(scene)?.destroy();
  const s = state.campaign.data.settings;
  const { VW, VH } = scene.m;
  const rowH = SIZE.btnH;
  const step = rowH + SIZE.gap;
  const w = Math.min(VW - 16, 200);
  const want = 26 + ROWS.length * step + 8 + SIZE.btnH + 12;
  const m = openModal(scene, { title: t('settings.title'), w, h: Math.min(want, VH - 16), onClose });
  const { c, x, y, h } = m;
  const listH = h - 26 - SIZE.btnH - 18;
  let list: ScrollList | null = null;
  list = new ScrollList(scene, c, x + 8, y + 26, w - 16, listH, {
    count: ROWS.length,
    rowH,
    render: (i, row, rw) => {
      const r = ROWS[i];
      const right = r.kind === 'volume' ? 70 : r.kind === 'lang' || r.kind === 'tutorial' || r.kind === 'open' ? 66 : 42;
      row.add(addText(scene, 0, 8, ellipsize(t(r.label), rw - right - 4), 'ink'));
      if (r.kind === 'toggle') {
        const k = r.key;
        const b = new Button(scene, rw - 40, 1, 40, 22, { label: s[k] ? t('common.on') : t('common.off'), style: s[k] ? 'buttonSel' : 'button', id: `settings.toggle.${k}` });
        b.setOnClick(() => {
          s[k] = !s[k];
          b.setLabel(s[k] ? t('common.on') : t('common.off'));
          b.setSelected(s[k]);
          if (k === 'haptics') setHaptics(s.haptics);
          if (k === 'sound') audio.refresh();
          if (k === 'analytics') analyticsToggled();
          haptic('light');
          void state.save();
        });
        row.add(b);
      } else if (r.kind === 'volume') {
        const k = r.key;
        const val = addText(scene, rw - 34, 8, `${s[k]}`, 'ink', 0.5);
        const stepVol = (d: number) => {
          s[k] = Math.max(0, Math.min(10, Math.round(s[k] + d)));
          val.setText(`${s[k]}`);
          audio.refresh();
          if (k === 'sfxVol') audio.play('block');
          void state.save();
        };
        row.add(val);
        row.add(new Button(scene, rw - 68, 1, 22, 22, { label: '-', tip: t('settings.volumeDown'), id: `settings.${k}.down`, onClick: () => stepVol(-1) }));
        row.add(new Button(scene, rw - 22, 1, 22, 22, { label: '+', tip: t('settings.volumeUp'), id: `settings.${k}.up`, onClick: () => stepVol(1) }));
      } else if (r.kind === 'tutorial') {
        // Replay the guided battle (or resume an interrupted one); never from inside a battle.
        const resume = canResume(progressOf(s));
        const b = new Button(scene, rw - 64, 1, 64, 22, { label: t(resume ? 'settings.tutorialResume' : 'settings.tutorialReplay'), icon: 'play', tip: t('settings.tutorialTip'), id: 'settings.tutorial' });
        const busy = ['Battle', 'Results'].includes(scene.sys.settings.key);
        if (busy) b.setEnabled(false, t('settings.tutorialBusy'));
        b.setOnClick(() => {
          m.close();
          scene.scene.start('Battle', { tutorial: { replay: !resume } });
        });
        row.add(b);
      } else if (r.kind === 'open') {
        const what = r.what;
        row.add(
          new Button(scene, rw - 64, 1, 64, 22, {
            label: t('settings.open'),
            id: `settings.open.${what}`,
            onClick: () => (what === 'notify' ? openNotifySettings(scene) : openAbout(scene)),
          }),
        );
      } else {
        const b = new Button(scene, rw - 64, 1, 64, 22, { label: t(`settings.lang.${s.lang ?? 'auto'}`), id: 'settings.lang' });
        b.setOnClick(() => {
          s.lang = LANG_CYCLE[(LANG_CYCLE.indexOf(s.lang ?? 'auto') + 1) % LANG_CYCLE.length];
          void state.save();
          if (refreshLang()) {
            // Rebuild the screen in the new language and bring the settings back.
            m.close();
            if (REBUILD_ON_LANG.has(scene.sys.settings.key)) {
              scene.events.once('create', () => openSettings(scene, onClose));
              scene.scene.restart(scene.sys.settings.data);
            } else openSettings(scene, onClose);
          } else b.setLabel(t(`settings.lang.${s.lang}`));
        });
        row.add(b);
      }
    },
  });
  const bw = Math.min(110, w - 40);
  c.add(new Button(scene, x + (w - bw) / 2, y + h - SIZE.btnH - 9, bw, SIZE.btnH, { label: t('common.close'), icon: 'check', onClick: () => m.close() }));
  open.set(scene, c);
  c.once('destroy', () => {
    if (open.get(scene) === c) open.delete(scene);
    list?.destroy();
    list = null;
  });
  return c;
}
