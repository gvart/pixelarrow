/**
 * The in-game menu of the war pages (the region view, the world map): Esc with nothing else to close (no tool, panel,
 * radial or selection: the page says so with `idle`) opens it; F10 opens the settings at once. Resume, Settings,
 * World map (from a region), Main menu (index.html).
 */
import { keys } from '../input/keys';
import { icon, uiZoom } from '../view/hud/kit';
import { openSettings, settingsOpen, type SettingsHooks } from './settings';
import { injectMenuCss } from './style';

export interface GameMenuOpts {
  /** Nothing on the page would take this Esc (read before the page's own handlers run). */
  idle(): boolean;
  /** From a region: back to the world map. */
  world?: () => void;
  hooks?: SettingsHooks;
}

/** Install the menu's keys; call it before the page's own key handlers so Esc is judged before they act on it. */
export function mountGameMenu(o: GameMenuOpts): void {
  let card: HTMLElement | null = null;
  const close = () => { card?.remove(); card = null; };
  const settings = () => { close(); openSettings('controls', o.hooks); };
  const show = () => {
    injectMenuCss();
    card = document.createElement('div');
    card.className = 'rf mn-modal';
    card.style.zoom = String(uiZoom());
    card.innerHTML = `<div class="rf-card mn-card" style="width:300px">
      <div class="mn-h"><span class="rf-name">Menu</span><span class="rf-dim" style="margin-left:auto;font-size:11px">the war goes on meanwhile</span></div>
      <button class="mn-big pri" data-k="resume">${icon('act-move', 24)}<div class="t">Resume</div><kbd>Esc</kbd></button>
      <button class="mn-big" data-k="settings">${icon('act-upgrade', 24)}<div class="t">Settings</div><kbd>${keys.label('menu.settings') || '—'}</kbd></button>
      ${o.world ? `<button class="mn-big" data-k="world">${icon('mode-biomes', 24)}<div class="t">World map</div><kbd>${keys.label('go.world')}</kbd></button>` : ''}
      <button class="mn-big" data-k="menu">${icon('act-cancel', 24)}<div class="t">Main menu</div></button>
    </div>`;
    document.body.appendChild(card);
    card.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === card) close(); });
    const by = (k: string) => card!.querySelector<HTMLElement>(`[data-k=${k}]`);
    by('resume')!.onclick = close;
    by('settings')!.onclick = settings;
    if (o.world) by('world')!.onclick = o.world;
    by('menu')!.onclick = () => (location.href = 'index.html');
    by('resume')!.focus();
  };
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (settingsOpen()) return;
    if (card) {
      // the menu is up: the page's keys wait (Tab, Enter and Space still work its buttons); arrows move, Esc closes
      e.stopImmediatePropagation();
      const items = [...card.querySelectorAll<HTMLElement>('.mn-big')], i = items.indexOf(document.activeElement as HTMLElement);
      const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if (d) { e.preventDefault(); items[(Math.max(0, i) + d + items.length) % items.length].focus(); }
      if (e.code === 'Escape') { e.preventDefault(); close(); }
      return;
    }
    const a = keys.act(e);
    if (a === 'menu.settings' || a === 'help.keys') { e.preventDefault(); e.stopImmediatePropagation(); openSettings('controls', o.hooks); }
    else if (a === 'back' && o.idle()) { e.preventDefault(); e.stopImmediatePropagation(); show(); }
  }, true);
}
