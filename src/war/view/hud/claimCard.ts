/**
 * Region claiming on the HUD (./explain.ts holds the words; rules: src/war/sim/mobs.ts, src/war/sim/depth.ts):
 *
 *   at the cursor   the claim point card while the pointer is on a claim banner (its pole and cloth, or its foot):
 *                   its state (unclaimed, guarded by whom, claiming x of y s, held by whom) and what to do next
 *   build bar       `claimFirst`: while the player has no ground anywhere in the region, why B builds nothing yet and
 *                   how to get ground (../hud.ts shows it in the bar's status line)
 */
import type { SandboxScene } from '../SandboxScene';
import { depthOf } from '../../sim/depth';
import { myTeam } from '../side';
import { claimFirstHint, claimView } from './explain';
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

/** The build bar's hint while the player holds no ground in this region (null: he has some). */
export function claimFirst(s: SandboxScene): string | null {
  const inf = s.sim.influence, bit = 1 << myTeam();
  if (!inf || inf.mask.some((m) => (m & bit) !== 0)) return null;
  const cur = s.sim.cur;
  return claimFirstHint(cur?.claims ?? [], myTeam(), depthOf(s.region), cur?.lairs ?? [], cur?.bosses ?? []);
}

export function mountClaimCard(s: SandboxScene, mk: Mk): void {
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
