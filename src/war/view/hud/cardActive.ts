/**
 * The squad active (M5c) on the command card's squad slot (./hud.ts) and in the radial (../interact.ts): its icon,
 * name and effect, the cooldown ring, and firing it (F). The sim keeps one active per squad (SquadSnap.active).
 * Icons reuse the first kit until the actives get their own art.
 */
import { ACTIVE, ACTIVES } from '../../sim/skills';
import type { ActiveSnap, SquadId, WarSkillId } from '../../types';
import type { SandboxScene } from '../SandboxScene';

export const ACTIVE_KEY = 'F';
export const ACTIVE_UI: Partial<Record<WarSkillId, { name: string; icon: string }>> = {
  shieldWall: { name: 'Shield Wall', icon: 'act-hold' },
  berserk: { name: 'Berserk', icon: 'unit-swordsman' },
  volley: { name: 'Volley', icon: 'unit-archer' },
  wheel: { name: 'Wheel and Re-charge', icon: 'act-wedge' },
};

const pct = (k: number) => `${k > 1 ? '+' : '−'}${Math.round(Math.abs(k - 1) * 100)}%`;
const secs = (ticks: number) => `${Math.ceil(ticks / 10)} s`;

/** What the active does, from the sim's numbers. */
export function activeEffect(skill: WarSkillId): string {
  const fx = ACTIVES[skill];
  if (!fx) return 'waits for mounts';
  const parts = [fx.out !== 1 ? `${pct(fx.out)} damage dealt` : '', fx.in !== 1 ? `${pct(fx.in)} damage taken` : ''].filter(Boolean);
  return `${parts.join(', ')} for ${secs(ACTIVE.buff)}`;
}

/** The selected own squads that hold an active, with it. */
export function activesOf(s: SandboxScene, own: SquadId[]): { q: SquadId; a: ActiveSnap }[] {
  const out: { q: SquadId; a: ActiveSnap }[] = [];
  for (const q of own) {
    const a = s.sim.squads.get(q)?.active;
    if (a && ACTIVES[a.skill]) out.push({ q, a });
  }
  return out;
}

/** Fire every selected squad's active that is ready; false when none is. */
export function fireActives(s: SandboxScene, own: SquadId[]): boolean {
  const ready = activesOf(s, own).filter(({ a }) => a.ready === 0 && a.on === 0);
  for (const { q } of ready) s.sim.order({ kind: 'active', squad: q });
  return ready.length > 0;
}

/** Why the active cannot fire now (undefined: it can). */
export function activeWhy(a: ActiveSnap): string | undefined {
  return a.on > 0 ? `on for ${secs(a.on)}` : a.ready > 0 ? `ready in ${secs(a.ready)}` : undefined;
}

/** Tooltip: name, effect, cooldown state and key. */
export function activeTip(a: ActiveSnap): string {
  const ui = ACTIVE_UI[a.skill];
  const state = a.on > 0 ? `<span style="color:#f2b27a">on · ${secs(a.on)} left</span>` : a.ready > 0 ? `<span class="rf-dim">ready in ${secs(a.ready)}</span>` : '<span style="color:#9fd88a">ready</span>';
  return `<div class="rf-name" style="margin-bottom:3px">${ui?.name ?? a.skill}</div>${activeEffect(a.skill)}<div style="margin-top:3px">${state} · cooldown ${secs(ACTIVE.cooldown)} <b class="k">${ACTIVE_KEY}</b></div>`;
}

export const ACTIVE_CSS = `
.rf-btn .cd{position:absolute;inset:3px;border-radius:50%;pointer-events:none;
  background:conic-gradient(rgba(14,9,7,.72) var(--cd,0%),transparent 0);
  -webkit-mask:radial-gradient(circle,transparent 7px,#000 7.5px);mask:radial-gradient(circle,transparent 7px,#000 7.5px)}
.rf-btn .cdn{position:absolute;left:0;right:0;top:9px;text-align:center;font:700 10px/1 Inter,sans-serif;color:#f0d9b5;text-shadow:0 1px 0 #0e0907,0 0 2px #0e0907;pointer-events:none}
.rf-btn.cool .ic{opacity:.6;filter:grayscale(.5)}
.rf-btn.buff{box-shadow:0 0 0 1px #f2b27a,0 0 6px #de8a4e}
.rf-btn .badge{position:absolute;left:1px;top:1px;pointer-events:none}
.rf-btn .badge .ic{width:12px;height:12px}
`;
