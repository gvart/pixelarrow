/**
 * W-84, W-110 the perks panel (rules: src/war/net/favour.ts; server: server/src/war/favour.ts), in the red-figure kit like
 * the Tasks window (./tasks.ts). The top bar's chip (Shift+F) opens a window: the demigod's level, the way to the next, his
 * path's perks by level (open ones lit, the next marked, the rest dim), how his path levels and what paid lately. Online it
 * reads /api/war/favour (each minute); a level gained since the last read shows a short banner (./quest.ts questBanner).
 * Offline there is no path, so no perks.
 */
import { FAVOUR_MAX, FAVOUR_REASON, favourTitle, favourView, perkRows, type FavourView } from '../../net/favour';
import { PATHS, type PathId } from '../../world/start';
import type { SandboxScene } from '../SandboxScene';
import { draggable } from './drag';
import { glyph } from './glyph';
import { closeCornerWindows, menuBtn, setBadge } from './kit';
import { esc, tipper } from './roster/ui';
import { keys } from '../../input/keys';
import { questBanner } from './quest';
import { tipHtml } from './theme';

type Mk = (id: string, css: string, html?: string) => HTMLElement;

/** "3m ago", "5h ago", "2d ago". */
const ago = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
};

/** How each path levels, one line (W-111). */
const HOW: Record<PathId, string> = {
  warrior: `Win fights, clear lairs, slay guardians and stand on your alliance's land.`,
  builder: `Build and upgrade, and give goods and work to your alliance's works.`,
  trader: `Sell goods at market and bring loads over the borders.`,
};

/** The panel's body. */
export function favourHtml(v: FavourView, now: number): string {
  const span = v.next === null ? 1 : v.next - v.from, have = v.next === null ? 1 : v.xp - v.from, f = Math.max(0, Math.min(1, have / span));
  const rows = perkRows(v.path, v.family);
  const nextAt = rows.find((r) => r.level > v.level)?.level;
  const perks = rows.map((r) => {
    const state = r.level <= v.level ? 'open' : r.level === nextAt ? 'next' : '';
    return `<div class="fv-p ${state}"><span class="fv-ln">${r.level}</span><span class="fv-pt"><b>${esc(r.name)}</b> ${esc(r.text)}</span></div>`;
  }).join('');
  const recent = v.recent.slice(0, 3).map((r) => `<div class="fv-r"><span>${esc(FAVOUR_REASON[r.reason] ?? r.reason)}</span><span class="rf-dim">${ago(now - r.at)}</span><b>+${r.amount}</b></div>`).join('');
  return `<div class="fv-top rf-well">
      <div class="fv-lvl"><div class="fv-k">Level</div><div class="fv-n">${v.level}</div></div>
      <div class="fv-mid"><div class="fv-title">${esc(v.title)}</div>
        <div class="fv-prog"><div class="rf-bar"><i class="ok" style="width:${(f * 100).toFixed(1)}%"></i></div></div>
        <div class="fv-x rf-dim">${v.next === null ? 'The highest level' : `${v.next - v.xp} favour to level ${v.level + 1}`}</div></div></div>
    ${v.path ? `<div class="rf-sec">${esc(PATHS[v.path].name)} perks</div>${perks}
    <div class="rf-sec">How you level</div><div class="fv-how rf-dim">${HOW[v.path]} Tasks and stories count too.</div>` : '<div class="fv-none rf-dim">No path here, so no perks.</div>'}
    ${recent ? `<div class="rf-sec">Lately</div>${recent}` : ''}`;
}

const CSS = `
.fv-top{display:flex;gap:10px;align-items:center;padding:8px 8px;margin:4px 0 2px}
.fv-lvl{width:52px;height:52px;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 60%,#4a3418,#140c06);border:1px solid #6a5326;box-shadow:inset 0 0 0 1px #2a1c0c,0 0 8px rgba(224,184,103,.25)}
.fv-k{font:700 8.5px/1 Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--rf-muted)}
.fv-n{font:700 24px/1.05 Cinzel,serif;color:var(--rf-gold)}
.fv-mid{flex:1;min-width:0}
.fv-title{font:700 15px/1.2 Cinzel,serif;color:var(--rf-title)}
.fv-prog{margin:5px 0 3px}.fv-prog .rf-bar{width:100%}
.fv-x{font-size:13px}
.fv-none{font-size:13px;margin:3px 2px}
.fv-p{display:flex;align-items:baseline;gap:6px;font-size:13px;line-height:1.3;padding:2px 2px;color:var(--rf-muted)}
.fv-p b{font-weight:700}
.fv-p.open{color:var(--rf-ink)}.fv-p.open b,.fv-p.open .fv-ln{color:var(--rf-gold)}
.fv-p.next{color:var(--rf-ink);background:rgba(224,184,103,.1)}
.fv-ln{width:16px;flex:none;text-align:right;font:700 13px/1 Cinzel,serif;color:var(--rf-muted)}
.fv-pt{flex:1;min-width:0}
.fv-r{display:flex;gap:6px;font-size:13px;line-height:1.35;padding:1px 2px}.fv-r span:first-child{flex:1}.fv-r b{width:40px;text-align:right;color:var(--rf-gold)}
.fv-how{font-size:13px;line-height:1.4;padding:0 2px}
#rfFavourBtn{position:relative}
`;

/** localStorage key of the level last seen (the banner shows a level gained since). */
const seenKey = (pid: number) => `rf.favour.seen.${pid}`;
const readSeen = (pid: number): number | null => {
  try {
    const v = localStorage.getItem(seenKey(pid));
    return v === null ? null : Number(v) || null;
  } catch {
    return null;
  }
};
const writeSeen = (pid: number, level: number) => {
  try {
    localStorage.setItem(seenKey(pid), String(level));
  } catch {
    /* private mode: the banner may show again */
  }
};

/** The favour the HUD shows now (the top bar's chip reads it; level 1 until the first read). */
let latest: FavourView | null = null;
export const favourNow = (): FavourView => latest ?? favourView(0);

/** The short level-up banner: what the level opened. */
export function favourBanner(level: number, v: FavourView = latest ?? favourView(0)): void {
  const got = perkRows(v.path, v.family).filter((r) => r.level === level);
  questBanner({ kind: 'done', head: 'You rise', title: `Level ${level} · ${favourTitle(level)}`, text: 'The gods smile on you, demigod.', pay: got.length ? got.map((r) => r.text).join(' ') : 'A new title among the gods' });
}

export function mountFavour(s: SandboxScene, mk: Mk): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const tip = mk('rfFavourTip', 'display:none;z-index:7');
  tip.className = 'rf rf-tip';
  const win = mk('rfFavour', 'top:40px;right:4px;width:340px;display:none;pointer-events:auto;padding:4px 8px 8px');
  win.className = 'rf rf-card rf-esc';
  draggable(win, '.rf-head');
  tipper(win, tip);
  const online = () => !!s.sim.net;
  const pid = () => s.sim.playerId ?? 0;
  let v: FavourView = favourView(0);
  const btn = menuBtn('rfFavourBtn', 'badge-rarity-legendary', 'Your perks', 'your level with the gods opens your path\'s perks', 'panel.favour', 6);
  const render = () => {
    latest = v;
    setBadge(btn, v.level, true);
    btn.dataset.tip = tipHtml(`Your perks · level ${v.level}`, `${esc(v.title)}: your level opens your path's perks`, keys.label('panel.favour'));
    if (win.style.display === 'none') return;
    const scroll = win.scrollTop;
    win.innerHTML = `<div class="rf-head rf-ph">${glyph('ui:laurel', 30)}<div style="flex:1;min-width:0"><div class="rf-name">Your perks</div><div class="sub">${online() ? `Level ${v.level} of ${FAVOUR_MAX}` : 'Offline'}</div></div><button class="rf-tbtn x" data-act="close" title="close (Esc)">×</button></div>
      ${favourHtml(v, Date.now())}`;
    win.scrollTop = scroll;
  };
  /** A fresh view: a level gained since the last one seen shows the banner. */
  const take = (x: FavourView) => {
    v = x;
    const seen = readSeen(pid());
    if (seen !== null && v.level > seen) favourBanner(v.level, v);
    if (seen === null || v.level !== seen) writeSeen(pid(), v.level);
    render();
  };
  const load = async () => {
    if (!online()) return render();
    const r = await s.sim.api<FavourView>('GET', 'favour');
    if (r && typeof r.level === 'number') take(r);
  };
  const toggle = (on = win.style.display === 'none') => {
    win.style.display = on ? '' : 'none';
    btn.classList.toggle('on', on);
    if (on) closeCornerWindows(btn.id), render(), void load();
  };
  addEventListener('keydown', (e: KeyboardEvent) => { if (keys.act(e) === 'back' && win.style.display !== 'none') toggle(false); });
  win.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest<HTMLElement>('[data-act="close"]')) toggle(false);
  });
  btn.onclick = () => toggle();
  render();
  setInterval(() => void load(), 60_000);
  setTimeout(() => void load(), 4500);
  // dev: fill the panel offline (screenshots, layout checks)
  if (import.meta.env.DEV) (window as unknown as { __favour: unknown }).__favour = {
    view: (x: FavourView) => take(x),
    make: favourView,
    open: () => toggle(true),
    banner: favourBanner,
  };
}
