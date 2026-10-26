/**
 * The sound settings (the corner's Sound button, or N): mute, then master, music, effects and ambience sliders in
 * steps 0..10, applied live and kept in localStorage (../sound/mix.ts). A card under the corner buttons.
 */
import type { WarAudio } from '../sound/warAudio';
import type { WarSoundSettings } from '../sound/mix';
import { uiZoom } from './kit';
import { keys } from '../../input/keys';

const ROWS: [keyof WarSoundSettings, string][] = [['masterVol', 'Master'], ['musicVol', 'Music'], ['sfxVol', 'Effects'], ['ambVol', 'Ambience']];

export function mountSoundPanel(audio: WarAudio): void {
  const css = document.createElement('style');
  css.textContent = '#rfSound input[type=range]{width:120px;height:16px;padding:0;border:0;background:none;accent-color:var(--rf-title)} #rfSound .sd-row{display:flex;align-items:center;gap:6px;height:24px} #rfSound .sd-row span:first-child{width:62px} #rfSound .sd-row .rf-num{width:18px;text-align:right}';
  document.head.appendChild(css);
  const card = document.createElement('div');
  card.id = 'rfSound';
  card.className = 'rf rf-card';
  card.style.cssText = 'top:96px;right:4px;width:240px;display:none;pointer-events:auto;padding:4px 8px 8px';
  card.addEventListener('pointerdown', (e) => e.stopPropagation());
  const s = audio.settings;
  card.innerHTML = `<div class="rf-head"><span class="rf-name">Sound</span><button class="rf-tbtn x" data-k="close" title="close (N)" style="margin-left:auto">✕</button></div>
    <div class="sd-row"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" data-k="sound" ${s.sound ? 'checked' : ''} style="width:14px;height:14px">Sound on</label></div>
    ${ROWS.map(([k, name]) => `<div class="sd-row"><span>${name}</span><input type="range" min="0" max="10" step="1" data-k="${k}" value="${s[k]}"><span class="rf-num" data-v="${k}">${s[k]}</span></div>`).join('')}
    <div class="rf-dim" style="font-size:11px;margin-top:4px">All sounds are made live in the browser (no recordings).</div>`;
  document.body.appendChild(card);
  const set = (k: keyof WarSoundSettings, v: number | boolean) => audio.apply({ ...audio.settings, [k]: v });
  card.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement, k = el.dataset.k as keyof WarSoundSettings | undefined;
    if (!k) return;
    if (k === 'sound') set(k, el.checked);
    else {
      set(k, Number(el.value));
      const out = card.querySelector<HTMLElement>(`[data-v="${k}"]`);
      if (out) out.textContent = el.value;
    }
  });
  // a short preview of the effects level
  card.addEventListener('change', (e) => { if ((e.target as HTMLElement).dataset.k === 'sfxVol') audio.ui('tap'); });
  const toggle = (on = card.style.display === 'none') => {
    card.style.zoom = String(uiZoom());
    card.style.display = on ? '' : 'none';
    btn.classList.toggle('on', on);
  };
  card.querySelector<HTMLElement>('[data-k=close]')!.onclick = () => toggle(false);
  const btn = document.createElement('button');
  btn.className = 'rf-tbtn';
  btn.id = 'rfSoundBtn';
  btn.textContent = 'Sound';
  btn.title = 'sound: mute and volumes (N)';
  btn.onclick = () => toggle();
  document.getElementById('rfDev')?.append(btn);
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (keys.is(e, 'panel.sound')) toggle();
  });
}
