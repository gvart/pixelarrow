/**
 * The settings modal: opened from the menu and from Telegram's ⋯ → Settings
 * on any screen. One scrolling list (sound first, then language, then battle
 * pauses), so it fits the smallest phones in both languages.
 */
import Phaser from 'phaser';
import { Button, addIcon, addText, mosaicPanelImage, type UIMetrics } from './kit';
import { ScrollList, Tabs, confirmDialog } from './widgets';
import { Stepper, Toggle } from './mosaic/toggles';
import { openParchmentSheet } from './mosaic/ParchmentSheet';
import { SURFACE, TEXT_MIN } from './tokens';
import { flashReduced, motion, setReducedMotion, shakeReduced } from './motion';
import { ellipsize, measureText, wrapText } from './textfit';
import { SIZE } from './theme';
import { state } from '../state';
import { haptic, setHaptics } from '../platform/haptics';
import type { Settings } from '../game/save';
import { audio } from '../audio';
import { t, type LangSetting, type TKey } from '../i18n';
import { refreshLang } from './lang';
import { canResume, progressOf } from '../game/tutorial';
import { openAbout, openNotifySettings, settingsSheetW } from './notifySettings';
import { addSyncBadge } from './online';
import { online } from '../platform/cloud';
import { analyticsToggled } from '../platform/monitoring';
import { SPEEDS, speedLabel, startSpeed } from './input/pace';
import { openControls } from './settings/controls';
import { platform, type InputHints } from '../platform';
import { deviceKV } from '../platform/storage';
import { canUsePasswordForms, openAccountForm } from './account';
import { openAccountPage } from './account/accountPage';
import { readPending } from './account/flows';

type ToggleKey = { [K in keyof Settings]-?: NonNullable<Settings[K]> extends boolean ? K : never }[keyof Settings];
type Volume = 'musicVol' | 'sfxVol';
type Row =
  | { kind: 'section'; label: TKey }
  | { kind: 'toggle'; key: ToggleKey; label: TKey }
  | { kind: 'motion'; label: TKey }
  | { kind: 'feel'; key: 'reduceShake' | 'reduceFlash'; label: TKey }
  | { kind: 'volume'; key: Volume; label: TKey }
  | { kind: 'speed'; label: TKey }
  | { kind: 'lang' }
  | { kind: 'tutorial'; label: TKey }
  | { kind: 'open'; what: 'notify' | 'about' | 'controls'; label: TKey }
  | { kind: 'sync'; label: TKey }
  | { kind: 'account'; label: TKey }
  | { kind: 'newCampaign'; label: TKey; sub: TKey };

interface UiScene extends Phaser.Scene {
  ui: Phaser.GameObjects.Container;
  m: UIMetrics;
}

/**
 * Grouped: Audio, Language, Battle pauses, Accessibility, Account (M-15).
 * A setting gets a row only once the game honours it. Reduce shake and Reduce
 * flash (FL-01) follow Reduce motion until the player sets them. Left-hand (BTL-01) mirrors the
 * battle's medallion rail, eye and top bar. The battle speed (CT-06) is the
 * speed battles open at.
 */
export const ROWS: readonly Row[] = [
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
  { kind: 'speed', label: 'settings.battleSpeed' },
  { kind: 'section', label: 'settings.sec.access' },
  { kind: 'motion', label: 'settings.reduceMotion' },
  { kind: 'feel', key: 'reduceShake', label: 'settings.reduceShake' },
  { kind: 'feel', key: 'reduceFlash', label: 'settings.reduceFlash' },
  { kind: 'toggle', key: 'haptics', label: 'settings.haptics' },
  { kind: 'toggle', key: 'leftHand', label: 'settings.leftHand' },
  { kind: 'section', label: 'settings.sec.account' },
  { kind: 'account', label: 'account.row' },
  { kind: 'sync', label: 'menu.cloudSave' },
  { kind: 'tutorial', label: 'settings.tutorial' },
  { kind: 'open', what: 'notify', label: 'settings.notifications' },
  { kind: 'open', what: 'about', label: 'settings.about' },
  { kind: 'toggle', key: 'analytics', label: 'settings.analytics' },
  { kind: 'newCampaign', label: 'menu.newCampaign', sub: 'settings.newCampaignSub' },
];
/** Controls → Keyboard shortcuts (input-v6.md §5.1): only while a keyboard is likely or was used; before Account. */
const CONTROLS_ROWS: readonly Row[] = [
  { kind: 'section', label: 'controls.sec' },
  { kind: 'open', what: 'controls', label: 'controls.title' },
];

/** The sheet's rows: ROWS, plus the Controls section with a keyboard. */
export function settingsRows(keyboard: boolean): readonly Row[] {
  if (!keyboard) return ROWS;
  const at = ROWS.findIndex((r) => r.kind === 'section' && r.label === 'settings.sec.account');
  return [...ROWS.slice(0, at), ...CONTROLS_ROWS, ...ROWS.slice(at)];
}

/**
 * The Account row (accounts-v6.md §8.1, V6-ACCT-07): signed in, the name and Open (AU-09); a guest where the
 * platform has email forms, "Guest: this browser only" and Log in; a sign-up waiting for its link, "Confirm
 * your email" and Open; no session and no form (Telegram before its silent sign-in answered), Offline.
 */
export function accountRow(o: { signedIn: boolean; name: string | null; forms: boolean; pending: boolean }): { sub: string; action: 'open' | 'login' } {
  if (o.signedIn) return { sub: o.name ?? '', action: 'open' };
  if (!o.forms) return { sub: t('settings.sync.offline'), action: 'open' };
  return o.pending ? { sub: t('account.row.pending'), action: 'open' } : { sub: t('account.row.guest'), action: 'login' };
}

/** Calls `cb` with the new rows when a keyboard appears or goes (a tablet pairing one), without reopening Settings. */
export function watchRows(hints: Pick<InputHints, 'keyboard' | 'onChange'>, cb: (rows: readonly Row[]) => void): () => void {
  let kb = hints.keyboard();
  return hints.onChange(() => {
    if (hints.keyboard() === kb) return;
    kb = hints.keyboard();
    cb(settingsRows(kb));
  });
}
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

/** The last pending sign-up hint read (accounts-v6.md §5.5). */
let pendingHint = false;
const accountRowNow = () => accountRow({ signedIn: online.signedIn, name: online.playerName, forms: canUsePasswordForms(), pending: pendingHint });

/**
 * The settings sheet (slides up; Back, a tap outside or the X shut it):
 * sections with switches, steppers and the language as a segmented control.
 * `onClose` runs when it closes.
 */
export function openSettings(scene: UiScene, onClose?: () => void): Phaser.GameObjects.Container {
  open.get(scene)?.destroy();
  const s = state.campaign.data.settings;
  const { VW, VH } = scene.m;
  const rowH = 24;
  const step = rowH + SIZE.gap;
  const w = settingsSheetW(VW);
  let rows = settingsRows(platform.input.keyboard());
  const want = 26 + rows.length * step + 14;
  const m = openParchmentSheet(scene, { title: t('settings.title'), w, h: Math.min(want, VH - 12), dock: 'bottom', onClose });
  const { c, body } = m;
  const listH = body.h;
  let list: ScrollList | null = null;
  list = new ScrollList(scene, c, body.x, body.y, body.w, listH, {
    count: rows.length,
    rowH,
    // the controls each row renders, for element-parity while the row is scrolled out of the window (V6-066)
    ids: (i) => {
      const r = rows[i];
      if (r.kind === 'toggle' || r.kind === 'feel') return [`settings.toggle.${r.key}`];
      if (r.kind === 'motion') return ['settings.toggle.reduceMotion'];
      if (r.kind === 'volume') return [`settings.${r.key}.down`, `settings.${r.key}.up`];
      if (r.kind === 'speed') return ['settings.battleSpeed.down', 'settings.battleSpeed.up'];
      if (r.kind === 'lang') return LANGS_SET.map((l) => `settings.lang.${l}`);
      if (r.kind === 'tutorial') return ['settings.tutorial'];
      if (r.kind === 'newCampaign') return ['settings.newCampaign'];
      if (r.kind === 'open') return [`settings.open.${r.what}`];
      if (r.kind === 'sync') return ['legend.sync'];
      if (r.kind === 'account') return [accountRowNow().action === 'login' ? 'settings.account.login' : 'settings.open.account'];
      return [];
    },
    render: (i, row, rw) => {
      const r = rows[i];
      if (r.kind === 'section') {
        // a section: its icon and title over a bronze hairline
        row.add(addIcon(scene, 0, 8, SECTION_ICON[r.label] ?? 'gear'));
        row.add(addText(scene, 16, 10, ellipsize(t(r.label), rw - 16, false, 7, 'head'), 'hInk'));
        row.add(scene.add.rectangle(0, 21, rw - 4, 1, SURFACE.line).setOrigin(0, 0));
        return;
      }
      // every setting on a faint well, so a section reads as one group
      if (r.kind !== 'lang') row.add(mosaicPanelImage(scene, 0, 0, rw - 4, rowH - 1, 'parchmentWell'));
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
      const right = r.kind === 'volume' || r.kind === 'speed' ? 74 : r.kind === 'sync' ? 30 : r.kind === 'tutorial' || r.kind === 'open' || r.kind === 'newCampaign' || r.kind === 'account' ? 70 : 38;
      // a label that does not fit goes onto two lines at the readable floor (6.5 UI px, A11Y-09; never cut)
      const room = rw - right - 10;
      const label = t(r.label);
      let sub: Phaser.GameObjects.BitmapText | null = null;
      if (r.kind === 'newCampaign' || r.kind === 'sync' || r.kind === 'account') {
        // the name, and under it what it does (MENU-7), the cloud save's state (MENU-4) or who is signed in (§8.1)
        const big = measureText(label) <= room;
        const name = addText(scene, 6, 2, big ? label : ellipsize(label, room, false, TEXT_MIN), 'pInk');
        row.add(big ? name : name.setFontSize(TEXT_MIN));
        const line = r.kind === 'sync' ? t(`settings.sync.${online.status}`) : r.kind === 'account' ? ellipsize(accountRowNow().sub, room, false, TEXT_MIN) : t(r.sub);
        sub = addText(scene, 6, 12, line, 'pMuted').setFontSize(TEXT_MIN);
        row.add(sub);
      } else if (measureText(label) <= room) row.add(addText(scene, 6, 8, label, 'pInk'));
      else {
        const lines = wrapText(label, room, 2, false, TEXT_MIN).lines;
        row.add(addText(scene, 6, lines.length > 1 ? 3 : 8, lines.join('\n'), 'pInk').setFontSize(TEXT_MIN).setLineSpacing(-1.5));
      }
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
      } else if (r.kind === 'feel') {
        // A11Y-13: shows the Reduce motion value until set; a set value is kept
        const k = r.key;
        row.add(
          new Toggle(scene, rw - 4 - 34, 1, {
            on: k === 'reduceShake' ? shakeReduced(s) : flashReduced(s),
            label: t(r.label),
            id: `settings.toggle.${k}`,
            onChange: (on) => {
              s[k] = on;
              haptic('light');
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
              if (k === 'sfxVol') audio.play('block', { bus: 'ui' });
              void state.save();
            },
          }),
        );
      } else if (r.kind === 'speed') {
        // the speed battles open at (A11Y-21); a battle that offers less opens at its fastest below it (src/ui/input/pace.ts)
        const speeds = SPEEDS.offline;
        row.add(
          new Stepper(scene, rw - 4 - 70, 1, {
            value: Math.max(0, speeds.indexOf(startSpeed('offline', s.battleSpeed))),
            min: 0,
            max: speeds.length - 1,
            label: t(r.label),
            id: 'settings.battleSpeed',
            format: (i) => speedLabel(speeds[i]),
            onChange: (i) => {
              s.battleSpeed = speeds[i];
              haptic('light');
              void state.save();
            },
          }),
        );
      } else if (r.kind === 'tutorial') {
        // replay the guided battle (or resume an interrupted one); never from inside a battle
        const resume = canResume(progressOf(s));
        const b = new Button(scene, rw - 4 - 68, 1, 68, 22, { label: t(resume ? 'settings.tutorialResume' : 'settings.tutorialReplay'), icon: 'play', inline: true, small: true, tip: t('settings.tutorialTip'), id: 'settings.tutorial' });
        const busy = ['Battle', 'Results'].includes(scene.sys.settings.key);
        if (busy) b.setEnabled(false, t('settings.tutorialBusy'));
        b.setOnClick(() => {
          m.close();
          // skip and finish come back here (screen-flow §3 S09)
          scene.scene.start('Battle', { tutorial: { replay: !resume, back: { scene: scene.sys.settings.key, data: scene.sys.settings.data ?? {} } } });
        });
        row.add(b);
      } else if (r.kind === 'newCampaign') {
        // ends the march: a quiet destructive button, then a confirmation that says what is lost and kept
        const b = new Button(scene, rw - 4 - 68, 1, 68, 22, { label: t('settings.newCampaignGo'), icon: 'flag', inline: true, variant: 'destructive', small: true, id: 'settings.newCampaign', tip: t('menu.row.new') });
        const busy = ['Battle', 'Results'].includes(scene.sys.settings.key) || !state.hasSave;
        if (busy) b.setEnabled(false, state.hasSave ? t('settings.tutorialBusy') : t('menu.noSave'));
        b.setOnClick(() => confirmNewCampaign(scene));
        row.add(b);
      } else if (r.kind === 'sync' && sub) {
        // the cloud at the right explains itself on tap; the state line follows the cloud save live
        addSyncBadge(scene, row, rw - 4 - 20, 8);
        const word = sub;
        const off = online.onStatus((st) => word.active && word.setText(t(`settings.sync.${st}`)));
        word.once('destroy', off);
      } else if (r.kind === 'account') {
        const a = accountRowNow();
        if (a.action === 'login')
          row.add(new Button(scene, rw - 4 - 68, 1, 68, 22, { label: t('auth.gate.login'), inline: true, small: true, id: 'settings.account.login', onClick: () => openAccountForm(scene, 'login', { onSignedIn: () => list?.refresh() }) }));
        else row.add(new Button(scene, rw - 4 - 68, 1, 68, 22, { label: t('settings.open'), icon: 'chevR', inline: true, small: true, id: 'settings.open.account', onClick: () => openAccountPage(scene, { onClose: () => list?.refresh() }) }));
      } else if (r.kind === 'open') {
        const what = r.what;
        row.add(new Button(scene, rw - 4 - 68, 1, 68, 22, { label: t('settings.open'), icon: 'chevR', inline: true, small: true, id: `settings.open.${what}`, onClick: () => (what === 'notify' ? openNotifySettings(scene) : what === 'controls' ? openControls(scene) : openAbout(scene)) }));
      }
    },
  });
  open.set(scene, c);
  // a sign-up waiting for its link on this device (a hint): the Account row says so once it is read
  void readPending(deviceKV, Date.now()).then((p) => {
    pendingHint = !!p;
    if (p && c.scene) list?.refresh();
  });
  const offRows = watchRows(platform.input, (next) => {
    rows = next;
    list?.setCount(rows.length);
  });
  c.once('destroy', () => {
    offRows();
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
    onOk: () => void state.reset().then(() => scene.scene.start('World', {})),
  });
}
