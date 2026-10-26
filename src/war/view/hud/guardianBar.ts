/**
 * M7d HUD: the guardian bar and the landmark panel (docs/WAR.md "Landmarks"; src/war/sim/bosses.ts, src/data/warLandmarks.ts).
 *
 *   top centre, under the resource band   each living guardian of the region: its name, an hp bar with a pip at every
 *                                          phase threshold (lit once passed), the phase it is in and what it does (on
 *                                          the roof, in flight, running for the postern), its linked targets alive
 *                                          (Scylla's heads, the Chimera's heads) and the raid it faces; slain or away:
 *                                          when it comes back. A Rim Warden strike being marked shows under it.
 *   right                                  the landmark panel (L toggles): who holds it, its state (intact at 60%, damaged,
 *                                          ruined pieces, restored), what patching its walls costs (Fortifier, half the
 *                                          build cost per hp up to 60%), the restore bill (bulk and rare goods, the
 *                                          engineer level) and its function once held (dormant until restored).
 *                                          M7g: holder and state from snap.landmark when the sim sends it (else derived
 *                                          from the pieces), and a Restore button: restoreLandmark with the selected squad.
 */
import type { BossSnap, BuildingSnap, LandmarkSnap, ResourceKind } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { BUILDINGS, NEUTRAL_TEAM } from '../../sim/economy';
import { MOB_TEAM } from '../../sim/mobs';
import { landmarkOfRegion, type Landmark } from '../../../data/warLandmarks';
import { heldNodes } from '../../../data/professions';
import { ALLIANCES } from '../../world/alliances';
import { sandboxCraft } from './craft/state';
import { sandboxRoster } from './roster/state';
import { leadText } from './buildingCard';
import { LANDMARK_FUNCTION } from '../../../data/warLore';
import { keys } from '../../input/keys';
import { myTeam } from '../side';
export { LANDMARK_FUNCTION };

type Mk = (id: string, css: string, html?: string) => HTMLElement;

const PHASE_NOTE: Record<string, string[]> = {
  drakon: ['in the yard: claw and tail', 'on the roofs: fire breath, out of melee reach', 'crashed down, enraged: drakes from the bone pit'],
  scylla: ['six heads strike from the cave', 'dragged onto the flats'],
  brontes: ['hurling rocks from the gate top', 'down and smashing'],
  gyges: ['chained: three blows at once', 'unchained on the rock bridge'],
  chimera: ['lion, goat and serpent'],
  bandit_king: ['street by street', 'the palace gate', 'running for the postern'],
  grove_queen: ['the thiasos dances', 'frenzied: maenads called'],
  maenad_queen: ['the thiasos dances'],
  titan: ['boulders from the arena', 'stomping, tearing the ramp gates'],
  river_god: ['a bull-horned giant', 'a serpent in the channels (from the fords)', 'a bull charging through the ranks'],
};
const STATE_NOTE: Partial<Record<BossSnap['state'], string>> = { flight: 'in flight' };
const TEAM_NAME = ['blue', 'red', 'gold', 'violet'];
const mins = (ticks: number) => (ticks >= 36000 ? `${(ticks / 36000).toFixed(1)} h` : `${Math.ceil(ticks / 600)} min`);
const cost = (c: Partial<Record<string, number>>) => Object.entries(c).filter(([, v]) => (v ?? 0) > 0).map(([r, v]) => `${Math.ceil(v!)} ${r.replace(/[A-Z]/g, (x) => ' ' + x.toLowerCase())}`).join(', ') || 'nothing';

const CSS = `
#rfGuard{display:flex;flex-direction:column;gap:4px;pointer-events:none}
#rfGuard .g{padding:6px 10px 8px;width:420px}
#rfGuard .gt{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
#rfGuard .gb{position:relative;height:12px;margin-top:5px;background:var(--rf-sunk);border:1px solid var(--rf-line)}
#rfGuard .gb i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#d0503c,#8a2418)}
#rfGuard .gb s{position:absolute;top:-4px;bottom:-4px;width:3px;margin-left:-1px;background:var(--rf-gold);text-decoration:none;box-shadow:0 0 0 1px #000}
#rfGuard .gb s.off{background:var(--rf-disabled)}
#rfGuard .gn{margin-top:3px;font-size:11px}
#rfGuard .w{padding:4px 10px;color:var(--rf-bad);font-weight:700}
#rfLand{padding:8px 10px 10px;width:270px;font-size:11px;line-height:1.35}
#rfLand h4{margin:6px 0 1px;font:var(--rf-title-font);font-size:11px;color:var(--rf-accent)}
#rfLand p{margin:0}
#rfLand .lr{display:flex;align-items:center;gap:8px;margin-top:7px}
#rfLand .lr .why{color:var(--rf-bad);font-size:11px}
`;

/** Mount the guardian bar and the landmark panel; they update at 5 Hz from the drawn snapshot. */
export function mountGuardians(s: SandboxScene, mk: Mk): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const lm = landmarkOfRegion(s.region.id);
  const has = !!s.region.guardians?.length;
  if (!has && !lm && !s.region.rim) return;
  const bar = mk('rfGuard', 'top:52px;left:50%;transform:translateX(-50%);pointer-events:none');
  const panel = lm ? mk('rfLand', 'top:96px;right:8px;display:none', '') : null;
  if (panel) panel.className = 'rf rf-card';
  let open = true;
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (keys.is(e, 'panel.guardian')) open = !open;
  });
  // M7g: the Restore button sends restoreLandmark with the selected squad (the sim checks the engineer and the goods)
  panel?.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('[data-act="restore"]')) return;
    const q = s.build.squad();
    if (q !== null) s.sim.order({ kind: 'restoreLandmark', squad: q });
  });
  let shown = '';
  const render = () => {
    const cur = s.sim.cur;
    if (!cur) return;
    const held = (cur.claims ?? []).some((c) => c.state === 'claimed');
    bar.innerHTML = (cur.bosses ?? []).map((b) => guardianHtml(b, held)).join('') + (cur.warden ? `<div class="rf-card w">Rim Warden strike marked: ${Math.ceil(cur.warden.in / 10)} s</div>` : '');
    if (panel && lm) {
      panel.style.display = open ? 'block' : 'none';
      if (!open) return;
      const html = landmarkHtml(lm, (cur.buildings ?? []).filter((b) => b.landmark), cur.bosses ?? [], cur.landmark, restoreWhy(s, lm, cur.landmark));
      if (html !== shown) panel.innerHTML = shown = html; // only when it changes, so a click lands on the same button
    }
  };
  setInterval(render, 200);
}

/** One guardian's bar: hp with a pip per phase threshold, what it does now, its parts and the raid. */
export function guardianHtml(b: BossSnap, held = false): string {
  const share = b.maxHp > 0 ? b.hp / b.maxHp : 0, gone = b.state === 'slain' || b.state === 'away';
  const pips = b.phases.slice(1).map((p) => `<s class="${share < p ? '' : 'off'}" style="left:${(p * 100).toFixed(1)}%" title="phase at ${Math.round(p * 100)}%"></s>`).join('');
  const note = gone
    ? b.state === 'slain' ? (held ? 'slain: stays down while the region is held' : `slain: back in ${mins(b.respawnIn ?? 0)} unless the region is held`) : `escaped by the postern: back in ${mins(b.respawnIn ?? 0)}`
    : `phase ${b.phase + 1}/${b.phases.length}: ${PHASE_NOTE[b.id]?.[b.phase] ?? ''}${STATE_NOTE[b.state] && b.state !== 'flee' ? ` (${STATE_NOTE[b.state]})` : ''}`;
  const parts = b.parts ? ` · heads ${b.parts.alive}/${b.parts.total}` : '';
  const raid = b.raid ? ` · raid ${b.raid} squads${b.scale > 1.001 ? `, hp x${b.scale.toFixed(1)}` : ''}` : '';
  return `<div class="rf-card g"><div class="gt"><span class="rf-name">${b.name}</span><span class="rf-dim">${gone ? '' : `${Math.ceil(b.hp)} / ${Math.ceil(b.maxHp)}`}</span></div>
<div class="gb"><i style="width:${(share * 100).toFixed(1)}%"></i>${pips}</div><div class="gn rf-dim">${note}${parts}${raid}</div></div>`;
}

/**
 * M7g: why the own team cannot restore the landmark now with the selected squad (undefined: it can try; the sim checks
 * again and answers with a landmarkRefused event): not held by you, already restored, no squad, no engineer of the level
 * and nodes in it, goods short in the stockpile.
 */
export function restoreWhy(s: SandboxScene, lm: Landmark, snap?: LandmarkSnap): string | undefined {
  const cur = s.sim.cur;
  const holder = snap ? snap.holder : (cur?.buildings ?? []).find((b) => b.landmark)?.team ?? -1;
  if (holder !== 0) return 'hold it first';
  if (snap?.state === 'restored') return 'already restored';
  const q = s.build.squad();
  if (q === null) return 'select the squad with the engineer';
  const craft = sandboxCraft(s, sandboxRoster(s));
  const lead = (cur?.units ?? []).some((u) => {
    if (u.state === 'dead' || u.squad !== q || u.cls !== 'civ_engineer') return false;
    const c = craft.civ(u.pid);
    if (!c || c.level < lm.engineer) return false;
    const n = heldNodes('engineer', c.perks);
    return n.has('fortifier') && n.has('masterBuilder') && (lm.engineer < 10 || n.has('poliorcetes') || n.has('archimedes'));
  });
  if (!lead) return `needs ${leadText(lm)} in the squad`;
  const stock = (cur?.stock?.[myTeam()] ?? {}) as Record<string, number>;
  const short = Object.entries({ ...lm.restore.bulk, ...lm.restore.rare }).filter(([r, v]) => (stock[r] ?? 0) < (v ?? 0)).map(([r]) => r.replace(/[A-Z]/g, (x) => ' ' + x.toLowerCase()));
  return short.length ? `goods short: ${short.join(', ')}` : undefined;
}

const SIDE = (team: number) => (team === myTeam() ? 'you' : ALLIANCES[team]?.name ?? TEAM_NAME[team] ?? `team ${team}`);

/** The landmark panel: holder, state, patch and restore costs, function; `snap` (M7f) when the sim sends it, else derived from the pieces. */
export function landmarkHtml(lm: Landmark, pieces: BuildingSnap[], bosses: BossSnap[], snap?: LandmarkSnap, why?: string): string {
  const team = pieces[0]?.team ?? NEUTRAL_TEAM;
  const alive = bosses.filter((b) => b.state !== 'slain' && b.state !== 'away');
  const standing = pieces.filter((b) => !b.ruin && b.state !== 'destroyed');
  const ruined = pieces.length - standing.length;
  const avg = standing.reduce((a, b) => a + b.hp / Math.max(1, b.maxHp), 0) / Math.max(1, standing.length);
  let holder: string, state: string, restored: boolean;
  if (snap) {
    const pct = Math.round(snap.hp * 100), ruins = snap.ruined ? ` · ${snap.ruined} of ${snap.pieces} pieces in ruins` : '';
    restored = snap.state === 'restored';
    holder = snap.holder >= 0 && snap.holder < 4 ? `held by ${SIDE(snap.holder)}` : snap.state === 'guarded' ? `held by ${alive.map((b) => b.name).join(' and ') || 'its guardian'}` : 'nobody: its guardian is slain, claim it';
    state = snap.state === 'guarded' ? `guarded: as the season finds it (${pct}%), gates shut${ruins}`
      : snap.state === 'unclaimed' ? `unclaimed (${pct}%)${ruins}`
      : snap.state === 'damaged' ? `damaged (${pct}%), function dormant until restored${ruins}`
      : `restored: its function wakes · ${snap.men} own men inside${snap.foes ? `, ${snap.foes} foes` : ''} · ${snap.garrisoned ? '<span style="color:var(--rf-good)">garrisoned: +2 score an hour</span>' : '6 own men inside and no foe: +2 an hour'}`;
  } else {
    holder = team === MOB_TEAM || alive.length ? `held by ${alive.map((b) => b.name).join(' and ') || 'its guardian'}` : team === NEUTRAL_TEAM ? 'unclaimed' : `held by ${SIDE(team)}`;
    restored = team >= 0 && team < 4 && ruined === 0 && standing.every((b) => b.hp >= b.maxHp * 0.99);
    state = restored ? 'restored: its function wakes' : ruined ? `${ruined} pieces in ruins, the rest at ${Math.round(avg * 100)}%` : avg < 0.45 ? `damaged (${Math.round(avg * 100)}%), gates open, function dormant` : `as the season finds it (${Math.round(avg * 100)}%), gates shut`;
  }
  // patch: walls, towers and gates back to 60% at half their build cost per hp
  const patch: Partial<Record<ResourceKind, number>> = {};
  for (const b of standing) {
    const d = BUILDINGS[b.type];
    if (!d.wall) continue;
    const gap = 0.6 - b.hp / Math.max(1, b.maxHp);
    if (gap <= 0) continue;
    const k = d.perTile ? b.tiles.length / 2 : 1;
    for (const [r, v] of Object.entries(d.cost) as [ResourceKind, number][]) patch[r] = (patch[r] ?? 0) + v * k * gap * 0.5;
  }
  const restore = restored ? '' : `<div class="lr"><button class="rf-tbtn pri" data-act="restore"${why ? ' disabled' : ''}>Restore</button>${why ? `<span class="why">${why}</span>` : '<span class="rf-dim">the selected squad\'s engineer leads it</span>'}</div>`;
  return `<div class="rf-head"><span class="rf-name">${lm.name}</span><span class="rf-dim" style="margin-left:auto">L</span></div>
<h4>Holder</h4><p>${holder}</p>
<h4>State</h4><p>${state}</p>
<h4>Patch (Fortifier L5)</h4><p>${Object.keys(patch).length ? cost(patch) : 'walls, towers and gates at 60% or more'}</p>
<h4>Restore</h4><p>${cost(lm.restore.bulk)} + ${cost(lm.restore.rare)}<br><span class="rf-dim">led by ${leadText(lm)}</span></p>${restore}
<h4>Once held${restored ? '' : ' (dormant)'}</h4><p${restored ? '' : ' class="rf-dim"'}>${LANDMARK_FUNCTION[lm.id] ?? ''}</p>`;
}
