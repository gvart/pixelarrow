/**
 * W-66 the Divine favour panel (rules: src/war/net/favour.ts; server: server/src/war/favour.ts), in the red-figure kit
 * like the Tasks window (./tasks.ts). The menu bar button (Shift+F, its level as a gold badge) opens a window: the demigod's
 * title and level, the favour bar to the next level, what favour gives his newly raised men now, what the next levels
 * unlock, what earned favour lately and how it is earned. Online it reads /api/war/favour (each minute); a level gained
 * since the last read shows a short banner (./quest.ts questBanner). Offline it shows level 1.
 */
import { FAVOUR_EARN, FAVOUR_MAX, FAVOUR_REASON, favourTitle, favourUnlocks, favourView, gearRarity, type FavourView } from '../../net/favour';
import type { SandboxScene } from '../SandboxScene';
import { draggable } from './drag';
import { glyph } from './glyph';
import { closeCornerWindows, icon, menuBtn, setBadge } from './kit';
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
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** What favour gives a new man at this level, as chips. */
function bonusHtml(v: FavourView): string {
  const b = v.bonus;
  if (!b.attr && !b.gearTier) return '<div class="fv-none rf-dim">Nothing yet: at level 3 your new men get an attribute point.</div>';
  return `${b.attr ? `<div class="fv-b">${glyph('ui:star', 16)}<span><b>+${b.attr}</b> attribute point${b.attr > 1 ? 's' : ''} to spend</span></div>` : ''}${b.gearTier ? `<div class="fv-b">${icon(`badge-rarity-${gearRarity(b.gearTier)}`)}<span><b>${cap(gearRarity(b.gearTier))}</b> starting kit</span></div>` : ''}`;
}

/** The panel's body. */
export function favourHtml(v: FavourView, now: number): string {
  const span = v.next === null ? 1 : v.next - v.from, have = v.next === null ? 1 : v.xp - v.from, f = Math.max(0, Math.min(1, have / span));
  const next = Array.from({ length: Math.min(4, FAVOUR_MAX - v.level) }, (_, i) => v.level + 1 + i).map((l) => {
    const u = favourUnlocks(l);
    return `<div class="fv-lv${u.length ? ' gift' : ''}"><span class="fv-ln">${l}</span><span class="fv-lt">${esc(favourTitle(l))}</span><span class="fv-lu">${u.length ? esc(u.join(' · ')) : '<span class="rf-dim">title only</span>'}</span></div>`;
  }).join('');
  const recent = v.recent.length
    ? v.recent.slice(0, 8).map((r) => `<div class="fv-r"><span>${esc(FAVOUR_REASON[r.reason] ?? r.reason)}</span><span class="rf-dim">${ago(now - r.at)}</span><b>+${r.amount}</b></div>`).join('')
    : '<div class="rf-dim fv-none">Nothing yet. Win battles, clear lairs, finish tasks and stories, hold land.</div>';
  const E = FAVOUR_EARN;
  return `<div class="fv-top rf-well">
      <div class="fv-lvl"><div class="fv-k">Level</div><div class="fv-n">${v.level}</div></div>
      <div class="fv-mid"><div class="fv-title">${esc(v.title)}</div>
        <div class="fv-prog"><div class="rf-bar"><i class="ok" style="width:${(f * 100).toFixed(1)}%"></i></div></div>
        <div class="fv-x rf-dim">${v.next === null ? `${v.xp} favour · the highest level` : `${v.xp} / ${v.next} favour · ${v.next - v.xp} to level ${v.level + 1}`}</div></div></div>
    <div class="rf-sec">Your new men now</div>
    <div class="fv-bonus">${bonusHtml(v)}<div class="fv-note rf-dim">Men raised from now on: souls you claim and men from the tunnel. Veterans you have stay as they are.</div></div>
    ${next ? `<div class="rf-sec">Next levels</div>${next}` : ''}
    <div class="rf-sec">Earned lately</div>${recent}
    <div class="rf-sec">How favour is earned</div>
    <div class="fv-how rf-dim">Battle won ${E.win} · fought ${E.battle} · each kill ${E.kill}<br>Lair cleared ${E.lair} · guardian slain ${E.boss}<br>Daily task ${E.task.daily} · weekly ${E.task.weekly} · story step ${E.storyStep}, chain ${E.storyEnd} · encounter ${E.encounterStep}-${E.encounterEnd}<br>Land: your alliance's claim points where your men stand, and the region it owns, every 10 min (up to ${E.land.hourCap} an hour)</div>`;
}

const CSS = `
.fv-top{display:flex;gap:10px;align-items:center;padding:8px 8px;margin:4px 0 2px}
.fv-lvl{width:52px;height:52px;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 60%,#4a3418,#140c06);border:1px solid #6a5326;box-shadow:inset 0 0 0 1px #2a1c0c,0 0 8px rgba(224,184,103,.25)}
.fv-k{font:700 8.5px/1 Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--rf-muted)}
.fv-n{font:700 24px/1.05 Cinzel,serif;color:var(--rf-gold)}
.fv-mid{flex:1;min-width:0}
.fv-title{font:700 15px/1.2 Cinzel,serif;color:var(--rf-title)}
.fv-prog{margin:5px 0 3px}.fv-prog .rf-bar{width:100%}
.fv-x{font-size:11px}
.fv-bonus{padding:0 2px 2px}
.fv-b{display:flex;align-items:center;gap:6px;font-size:12px;line-height:1.3;margin:3px 0}.fv-b b{color:var(--rf-gold)}
.fv-note{font-size:10.5px;margin-top:3px}
.fv-none{font-size:11.5px;margin:3px 2px}
.fv-lv{display:flex;align-items:baseline;gap:6px;font-size:11.5px;line-height:1.3;padding:2px 2px}
.fv-lv.gift .fv-lu{color:var(--rf-good)}
.fv-ln{width:16px;flex:none;text-align:right;font:700 12px/1 Cinzel,serif;color:var(--rf-muted)}
.fv-lt{width:118px;flex:none;font:700 11.5px/1.2 Cinzel,serif;color:var(--rf-ink)}
.fv-lu{flex:1;min-width:0}
.fv-r{display:flex;gap:6px;font-size:11.5px;line-height:1.35;padding:1px 2px}.fv-r span:first-child{flex:1}.fv-r b{width:40px;text-align:right;color:var(--rf-gold)}
.fv-how{font-size:10.5px;line-height:1.45;padding:0 2px}
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

/** The short level-up banner. */
export function favourBanner(level: number): void {
  const u = favourUnlocks(level);
  questBanner({ kind: 'done', head: 'Divine favour', title: `Level ${level} · ${favourTitle(level)}`, text: 'The gods smile on you, demigod.', pay: u.length ? `Your new men: ${u.join(', ')}` : 'A new title among the gods' });
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
  const btn = menuBtn('rfFavourBtn', 'badge-rarity-legendary', 'Divine favour', 'your favour with the gods: it makes the men you raise better', 'panel.favour', 6);
  const render = () => {
    latest = v;
    setBadge(btn, v.level, true);
    btn.dataset.tip = tipHtml(`Divine favour · level ${v.level}`, `${esc(v.title)}: it makes the men you raise better`, keys.label('panel.favour'));
    if (win.style.display === 'none') return;
    const scroll = win.scrollTop;
    win.innerHTML = `<div class="rf-head rf-ph">${glyph('ui:laurel', 30)}<div style="flex:1;min-width:0"><div class="rf-name">Divine favour</div><div class="sub">Level ${v.level} · ${esc(v.title)}${online() ? '' : ' · offline'}</div></div><button class="rf-tbtn x" data-act="close" title="close (Esc)">×</button></div>
      ${favourHtml(v, Date.now())}`;
    win.scrollTop = scroll;
  };
  /** A fresh view: a level gained since the last one seen shows the banner. */
  const take = (x: FavourView) => {
    v = x;
    const seen = readSeen(pid());
    if (seen !== null && v.level > seen) favourBanner(v.level);
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
