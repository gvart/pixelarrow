/**
 * Region claiming on the HUD (./explain.ts holds the words; rules: src/war/sim/mobs.ts, src/war/sim/depth.ts):
 *
 *   at the cursor   the claim point card while the pointer is on a claim banner (its pole and cloth, or its foot):
 *                   its state (unclaimed, guarded by whom, claiming x of y s, held by whom) and what to do next
 *   build bar       `claimFirst`: while the player has no ground anywhere in the region, why B builds nothing yet and
 *                   how to get ground (../hud.ts shows it in the bar's status line, with a "Show banner" button)
 *   in the world    while he has no ground here and men in the region, a gold marker over the nearest banner he can
 *                   take (or on the screen's edge pointing at it, ./quest.ts), so a newcomer finds where to claim
 */
import type { SandboxScene } from '../SandboxScene';
import { depthOf } from '../../sim/depth';
import { myTeam } from '../side';
import { claimFirstHint, claimView } from './explain';
import { ownCentre } from '../entry';
import { metres, placeMarker, questMarker } from './quest';
import type { ClaimSnap } from '../../types';

type Mk = (id: string, css: string, html?: string) => HTMLElement;
const TONE = { good: 'var(--rf-good)', bad: 'var(--rf-bad)', warn: 'var(--rf-gold)', '': 'var(--rf-title)' } as const;

/** The claim banner under canvas point p: its pole and cloth (world px above its foot, ../neutral.ts) or its foot tile. */
export function claimAt(s: SandboxScene, p: { x: number; y: number }): ClaimSnap | null {
  const claims = s.sim.cur?.claims ?? [];
  if (!claims.length) return null;
  const z = s.cameras.main.zoom, t = s.tileAt(p);
  return claims.find((c) => {
    const f = s.toScreen(c.x, c.y);
    return (p.x >= f.x - 14 * z && p.x <= f.x + 44 * z && p.y >= f.y - 108 * z && p.y <= f.y + 8 * z) || Math.hypot(c.x - t.x, c.y - t.y) < 2.5;
  }) ?? null;
}

/** The card's HTML for claim point c. */
export function claimCardHtml(s: SandboxScene, c: ClaimSnap): string {
  const cur = s.sim.cur, v = claimView(c, myTeam(), depthOf(s.region), cur?.lairs ?? [], cur?.bosses ?? []);
  return `<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2px"><b style="color:var(--rf-title)">Claim point</b><span style="color:${TONE[v.tone]};font-weight:700">${v.label}</span></div>
    <div>${v.state}</div><div style="margin-top:3px;color:var(--rf-gold)">${v.next}</div>
    <div class="rf-dim" style="margin-top:4px;font-size:11px">A held point is ground you build on. The alliance with the most points holds the region.</div>`;
}

let had: { mask: unknown; v: number; bit: number; none: boolean } | null = null;
/** The player holds no ground anywhere in this region (false while the influence is not known yet); cached per version. */
export function groundless(s: SandboxScene): boolean {
  const inf = s.sim.influence, bit = 1 << myTeam();
  if (!inf) return false;
  if (had?.mask !== inf.mask || had.v !== inf.version || had.bit !== bit) had = { mask: inf.mask, v: inf.version, bit, none: !inf.mask.some((m) => (m & bit) !== 0) };
  return had.none;
}

/** The build bar's hint while the player holds no ground in this region (null: he has some). */
export function claimFirst(s: SandboxScene): string | null {
  if (!groundless(s)) return null;
  const cur = s.sim.cur;
  return claimFirstHint(cur?.claims ?? [], myTeam(), depthOf(s.region), cur?.lairs ?? [], cur?.bosses ?? []);
}

/** The banner to point a groundless player at: the nearest open one, else the nearest guarded, else one held by others. */
export function nearestClaim(s: SandboxScene, from: { x: number; y: number }): ClaimSnap | null {
  const me = myTeam(), cs = (s.sim.cur?.claims ?? []).filter((c) => !(c.state === 'claimed' && c.team === me));
  const rank = (c: ClaimSnap) => (c.state === 'locked' ? 1 : c.state === 'claimed' ? 2 : 0);
  return cs.reduce<ClaimSnap | null>((a, c) => (!a || rank(c) < rank(a) || (rank(c) === rank(a) && Math.hypot(c.x - from.x, c.y - from.y) < Math.hypot(a.x - from.x, a.y - from.y)) ? c : a), null);
}

/** The camera on the banner `claimFirst` speaks of (the build bar's "Show banner"). */
export function showNearestClaim(s: SandboxScene): void {
  const c = nearestClaim(s, ownCentre(s.sim.cur, myTeam()) ?? { x: s.map.w / 2, y: s.map.h / 2 });
  if (c) s.focus(c.x, c.y);
}

export function mountClaimCard(s: SandboxScene, mk: Mk): void {
  // the nearest banner to take while he has no ground here (the guide's markers stand in his home, where he has)
  const mark = questMarker('on');
  s.events.on('postupdate', () => {
    const me = groundless(s) ? ownCentre(s.sim.cur, myTeam()) : null, c = me ? nearestClaim(s, me) : null;
    // over the banner's own label (pole and label stand ~140 px over its foot; their label keeps its size on screen: 4 tiles up-screen clears both)
    placeMarker(s, mark, c && { x: c.x - 4, y: c.y - 4 }, c && me ? `Claim banner · ${metres(Math.hypot(c.x - me.x, c.y - me.y))}` : '');
  });
  const card = mk('rfClaimTip', 'display:none;z-index:6;width:280px;white-space:normal;line-height:1.35');
  card.className = 'rf rf-tip';
  let shown = '';
  s.events.on('postupdate', () => {
    const p = s.input.activePointer;
    const c = s.input.isOver && !s.interact.open && !s.build.tool ? claimAt(s, p) : null;
    if (!c) { if (card.style.display !== 'none') card.style.display = 'none'; shown = ''; return; }
    const body = claimCardHtml(s, c);
    if (body !== shown) { shown = body; card.innerHTML = body; }
    card.style.display = '';
    // beside the cursor, kept on screen (above it near the bottom)
    const r = s.game.canvas.getBoundingClientRect(), z = Number(card.style.zoom) || 1, t = card.getBoundingClientRect();
    const x = Math.min(r.left + p.x + 18, innerWidth - t.width - 4);
    let y = r.top + p.y + 42; // under the context action's label (../interact.ts)
    if (y + t.height > innerHeight - 4) y = r.top + p.y - t.height - 12;
    card.style.left = `${Math.round(Math.max(4, x) / z)}px`;
    card.style.top = `${Math.round(Math.max(4, y) / z)}px`;
  });
}
