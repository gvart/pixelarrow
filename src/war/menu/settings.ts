/**
 * Settings, from the menu and in game (Esc, F10): Controls (every war key, two slots each, rebinding through
 * ../input; replaces the campaign's src/ui/settings/controls.ts and shortcutsSheet.ts), Display (the HUD's UI scale)
 * and Sound (mute and the four volumes). Everything is kept in localStorage as before: `war.bindings`, `war.uiScale`,
 * `pixelarrow.war.sound`.
 *
 * Rebinding: click a key (or Enter on it), press the new one. Esc cancels, Backspace or Delete clears the slot. A key
 * another live action holds moves here and that action takes this slot's old key (a swap); Esc, Tab and browser keys
 * cannot be bound, nor fixed actions changed.
 */
import { ACTION_IDS, ACTIONS, SECTIONS, type ActionId } from '../input/actions';
import { assign, conflictsWith, defaultBindings, refused, resetAction, type Binding, type Slot } from '../input/bindings';
import { keyLabel, keys } from '../input/keys';
import { setUiScale, uiScale, uiZoom, UI_SCALES, type UiScale } from '../view/hud/kit';
import { DEFAULT_SOUND, loadSound, parseSound, saveSound, type WarSoundSettings } from '../view/sound/mix';
import { injectMenuCss } from './style';

export type SettingsTab = 'controls' | 'display' | 'sound';

export interface SettingsHooks {
  /** The UI scale changed (the HUD re-zooms). */
  onScale?: () => void;
  /** The sound settings changed (the live mixer applies and keeps them); without it they are only stored. */
  onSound?: (s: WarSoundSettings) => void;
  /** Current sound settings (the live mixer's), else the stored ones. */
  sound?: () => WarSoundSettings;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SCALE_NAME = (v: UiScale) => (v === 'auto' ? 'Auto' : `${v}×`);
const VOLS: [keyof WarSoundSettings, string][] = [['masterVol', 'Master'], ['musicVol', 'Music'], ['sfxVol', 'Effects'], ['ambVol', 'Ambience']];

let open: { close(): void } | null = null;
export const settingsOpen = () => !!open;

/** Open the settings over the page; `onClose` runs when it shuts (Esc, Close). */
export function openSettings(tab: SettingsTab = 'controls', hooks: SettingsHooks = {}, onClose: () => void = () => undefined): void {
  if (open) return;
  injectMenuCss();
  const modal = document.createElement('div');
  modal.className = 'rf mn-modal';
  modal.style.zoom = String(uiZoom());
  modal.innerHTML = `<div class="rf-card mn-card mn-set" role="dialog" aria-label="Settings">
    <div class="mn-h"><span class="rf-name">Settings</span><button class="rf-tbtn x" data-k="close" title="Close (Esc)" style="margin-left:auto">✕</button></div>
    <div class="mn-tabs" role="tablist">${(['controls', 'display', 'sound'] as SettingsTab[]).map((t) => `<button class="rf-tab" role="tab" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
    <div class="body"></div>
    <div class="mn-row" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--rf-rule)"><span class="mn-msg" data-k="msg" style="margin:0;flex:1"></span><button class="rf-tbtn" data-k="reset">Reset all keys</button><button class="rf-tbtn pri" data-k="done">Done</button></div>
  </div>`;
  document.body.appendChild(modal);
  const body = modal.querySelector<HTMLElement>('.body')!, msg = modal.querySelector<HTMLElement>('[data-k=msg]')!;
  const say = (t: string, tone: '' | 'good' | 'bad' = '') => { msg.textContent = t; msg.className = `mn-msg ${tone}`; };
  let cur: SettingsTab = tab;
  let capture: { id: ActionId; slot: Slot } | null = null;

  const render = () => {
    for (const b of modal.querySelectorAll<HTMLElement>('[data-tab]')) b.classList.toggle('on', b.dataset.tab === cur);
    modal.querySelector<HTMLElement>('[data-k=reset]')!.style.display = cur === 'controls' ? '' : 'none';
    if (cur === 'controls') body.innerHTML = controlsHtml(capture);
    else if (cur === 'display') body.innerHTML = displayHtml();
    else body.innerHTML = soundHtml(hooks.sound?.() ?? loadSound());
  };
  const keyBtn = (id: ActionId, slot: Slot) => body.querySelector<HTMLElement>(`[data-key="${id}"][data-slot="${slot}"]`);

  const startCapture = (id: ActionId, slot: Slot) => {
    capture = { id, slot };
    keys.suspend(true);
    render();
    keyBtn(id, slot)?.focus();
    say(`Press a key for "${ACTIONS[id].label}". Esc cancels, Backspace clears.`);
  };
  const endCapture = () => {
    const was = capture;
    capture = null;
    keys.suspend(false);
    render();
    if (was) keyBtn(was.id, was.slot)?.focus();
  };
  const onCaptureKey = (e: KeyboardEvent) => {
    if (!capture) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) return; // wait for the key
    const { id, slot } = capture;
    if (e.code === 'Escape') { say(''); return endCapture(); }
    if (e.code === 'Backspace' || e.code === 'Delete') {
      keys.set(assign(keys.map, id, slot, null, 'swap'));
      say(`"${ACTIONS[id].label}" has no ${slot ? 'second' : 'first'} key now.`);
      return endCapture();
    }
    const b: Binding = { code: e.code, ...(e.ctrlKey || e.metaKey ? { mod: true as const } : {}), ...(e.altKey ? { alt: true as const } : {}), ...(e.shiftKey ? { shift: true as const } : {}) };
    const why = refused(b);
    if (why) { say(`${keyLabel(b)} is ${why === 'browser' ? "the browser's" : 'kept for moving through menus'}; pick another.`, 'bad'); return; }
    const other = conflictsWith(keys.map, id, b);
    if (other && !ACTIONS[other].rebindable) { say(`${keyLabel(b)} is fixed to "${ACTIONS[other].label}".`, 'bad'); return; }
    keys.set(assign(keys.map, id, slot, b, 'swap'));
    say(other ? `${keyLabel(b)} moved here from "${ACTIONS[other].label}", which took the old key.` : `"${ACTIONS[id].label}": ${keyLabel(b)}.`, 'good');
    endCapture();
  };

  const close = () => {
    if (capture) endCapture();
    removeEventListener('keydown', onKey, true);
    modal.remove();
    open = null;
    onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (capture) return onCaptureKey(e);
    // the page's own keys stay off while the settings are up
    e.stopImmediatePropagation();
    if (e.code === 'Escape' || (keys.act(e) === 'menu.settings')) { e.preventDefault(); close(); }
  };
  addEventListener('keydown', onKey, true);

  modal.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === modal) close(); });
  modal.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('button,[data-scale]');
    if (!el) return;
    if (el.dataset.k === 'close' || el.dataset.k === 'done') return close();
    if (el.dataset.k === 'reset') { keys.set(defaultBindings()); say('Every key is back to its default.', 'good'); return render(); }
    if (el.dataset.tab) { cur = el.dataset.tab as SettingsTab; say(''); return render(); }
    if (el.dataset.key) return startCapture(el.dataset.key as ActionId, Number(el.dataset.slot) as Slot);
    if (el.dataset.def) { keys.set(resetAction(keys.map, el.dataset.def as ActionId)); say(`"${ACTIONS[el.dataset.def as ActionId].label}" is back to its default.`); return render(); }
    if (el.dataset.scale) {
      const v = el.dataset.scale === 'auto' ? 'auto' : (Number(el.dataset.scale) as UiScale);
      setUiScale(v);
      modal.style.zoom = String(uiZoom());
      hooks.onScale?.();
      say(`UI scale: ${SCALE_NAME(v)}.`);
      return render();
    }
  });
  const setSound = (s: WarSoundSettings) => {
    if (hooks.onSound) hooks.onSound(s);
    else saveSound(s);
  };
  modal.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement, k = el.dataset.snd as keyof WarSoundSettings | undefined;
    if (!k) return;
    const s = { ...(hooks.sound?.() ?? loadSound()) };
    if (k === 'sound') s.sound = el.checked;
    else (s[k] as number) = Number(el.value);
    setSound(parseSound(JSON.stringify(s)));
    const out = body.querySelector<HTMLElement>(`[data-v="${k}"]`);
    if (out) out.textContent = el.value;
  });
  open = { close };
  render();
  modal.querySelector<HTMLElement>(`[data-tab="${cur}"]`)?.focus();
}

function controlsHtml(capture: { id: ActionId; slot: Slot } | null): string {
  const m = keys.map, d = defaultBindings();
  const cell = (id: ActionId, slot: Slot) => {
    const b = m[id][slot], cap = capture?.id === id && capture.slot === slot;
    const fixed = !ACTIONS[id].rebindable;
    return `<button class="mn-key${cap ? ' cap' : b ? '' : ' empty'}" data-key="${id}" data-slot="${slot}" ${fixed ? 'disabled' : ''} title="${fixed ? 'fixed' : 'click, then press a key'}">${cap ? 'Press a key…' : b ? esc(keyLabel(b)) : '—'}</button>`;
  };
  const changed = (id: ActionId) => JSON.stringify(m[id]) !== JSON.stringify(d[id]);
  let html = '<div class="mn-kb">';
  for (const sec of SECTIONS) {
    html += `<div class="sec">${sec}</div>`;
    for (const id of ACTION_IDS.filter((x) => ACTIONS[x].section === sec)) {
      const a = ACTIONS[id];
      html += `<div class="lb${a.rebindable ? '' : ' fixed'}">${esc(a.label)}${a.kind === 'hold' ? ' <span class="rf-dim">(hold)</span>' : ''}</div>${cell(id, 0)}${cell(id, 1)}`;
      html += changed(id) ? `<button class="rf-tbtn x" data-def="${id}" title="back to the default">↺</button>` : '<span></span>';
    }
  }
  return html + `</div><div class="rf-dim" style="font-size:11px;margin:10px 0 2px">Mouse: left click selects (Shift adds, drag a box), right click gives the context order, the wheel zooms. Keys work by place on the keyboard, on any layout.</div>`;
}

function displayHtml(): string {
  const v = uiScale();
  return `<div class="rf-cap">UI scale</div>
    <div class="mn-scale">${UI_SCALES.map((s) => `<button class="rf-tbtn${s === v ? ' on' : ''}" data-scale="${s}">${SCALE_NAME(s)}</button>`).join('')}</div>
    <div class="rf-dim" style="font-size:11.5px;margin-top:6px">How big the HUD, its panels and the menus are drawn. Auto picks by the window (now ${uiZoom().toFixed(2)} CSS px per art px).</div>`;
}

function soundHtml(s: WarSoundSettings): string {
  return `<div class="rf-cap">Sound</div>
    <label class="mn-row" style="height:28px"><input type="checkbox" data-snd="sound" ${s.sound ? 'checked' : ''}>Sound on</label>
    ${VOLS.map(([k, n]) => `<div class="mn-sl"><span>${n}</span><input type="range" min="0" max="10" step="1" data-snd="${k}" value="${s[k]}"><span class="rf-num" data-v="${k}">${s[k]}</span></div>`).join('')}
    <div class="rf-dim" style="font-size:11px;margin-top:6px">Defaults: master ${DEFAULT_SOUND.masterVol}, music ${DEFAULT_SOUND.musicVol}, effects ${DEFAULT_SOUND.sfxVol}, ambience ${DEFAULT_SOUND.ambVol}. Every sound is made live in the browser.</div>`;
}
