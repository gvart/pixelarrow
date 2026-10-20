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
 */
import type { BossSnap, BuildingSnap, ResourceKind } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { BUILDINGS, NEUTRAL_TEAM } from '../../sim/economy';
import { MOB_TEAM } from '../../sim/mobs';
import { landmarkOfRegion, type Landmark } from '../../../data/warLandmarks';

type Mk = (id: string, css: string, html?: string) => HTMLElement;

/** What each landmark does once held and restored (docs/WAR.md "Landmarks", once held). */
export const LANDMARK_FUNCTION: Record<string, string> = {
  drakons_citadel: 'The strongest fort on the map: walls and towers built, influence 32, holds the col and Krios iron; the keep is a fort (store, recruits 3 an hour).',
  rim_watchtower: 'Rim Sight: every transit on the Lake frontier shows on the world map and the region lies open (no fog); the beacon is a stone tower for 12.',
  dead_city: 'A second home-sized town: recruit pool 6 an hour, cap 30; the oracle names once a day where an enemy sends most men; the palace hoard (once).',
  sunken_temple: 'Horn of Plenty: a food node (200, regrows 2/s) and a cookhouse L3 that cooks feasts without oil; the spring heals as a physician\'s house.',
  temple_city: 'The season\'s prize (10 an hour, hegemony); restored: +2 an hour, the four ramp gates are stone gates the holder controls.',
  cyclopean_gatehouse: 'Bars the north ramp: the holder\'s gate on the only road up; a fort (store).',
  oracle_grove: 'Memory: a squad that drinks gets +25% XP for an hour; every town\'s price board on the world map. Lethe frees a captive at once.',
  titans_forge: 'The only titan-bronze smelt (bronze 4 + charcoal 4 -> 1 in 120 s), a forge with +2 craft grade; holds the rock bridge.',
  obsidian_hold: 'The vent kiln: pitch without wood (1/s, the south-east\'s only pitch); a fortress over three canyon floors.',
};
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
const STATE_NOTE: Partial<Record<BossSnap['state'], string>> = { perch: 'on the roof', flight: 'in flight', flee: 'running for the postern' };
const TEAM_NAME = ['blue', 'red', 'gold', 'violet'];
const mins = (ticks: number) => (ticks >= 36000 ? `${(ticks / 36000).toFixed(1)} h` : `${Math.ceil(ticks / 600)} min`);
const cost = (c: Partial<Record<string, number>>) => Object.entries(c).filter(([, v]) => (v ?? 0) > 0).map(([r, v]) => `${Math.ceil(v!)} ${r.replace(/[A-Z]/g, (x) => ' ' + x.toLowerCase())}`).join(', ') || 'nothing';

const CSS = `
#rfGuard{display:flex;flex-direction:column;gap:4px;pointer-events:none}
#rfGuard .g{padding:6px 10px 8px;min-width:300px}
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
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.key === 'l' || e.key === 'L') open = !open;
  });
  const render = () => {
    const cur = s.sim.cur;
    if (!cur) return;
    bar.innerHTML = (cur.bosses ?? []).map(guardianHtml).join('') + (cur.warden ? `<div class="rf-card w">Rim Warden strike marked: ${Math.ceil(cur.warden.in / 10)} s</div>` : '');
    if (panel && lm) {
      panel.style.display = open ? 'block' : 'none';
      if (open) panel.innerHTML = landmarkHtml(lm, (cur.buildings ?? []).filter((b) => b.landmark), cur.bosses ?? []);
    }
  };
  setInterval(render, 200);
}

/** One guardian's bar: hp with a pip per phase threshold, what it does now, its parts and the raid. */
export function guardianHtml(b: BossSnap): string {
  const share = b.maxHp > 0 ? b.hp / b.maxHp : 0, gone = b.state === 'slain' || b.state === 'away';
  const pips = b.phases.slice(1).map((p) => `<s class="${share < p ? '' : 'off'}" style="left:${(p * 100).toFixed(1)}%" title="phase at ${Math.round(p * 100)}%"></s>`).join('');
  const note = gone
    ? b.state === 'slain' ? `slain: back in ${mins(b.respawnIn ?? 0)} unless the region is held` : `escaped by the postern: back in ${mins(b.respawnIn ?? 0)}`
    : `phase ${b.phase + 1}/${b.phases.length}: ${PHASE_NOTE[b.id]?.[b.phase] ?? ''}${STATE_NOTE[b.state] && b.state !== 'flee' ? ` (${STATE_NOTE[b.state]})` : ''}`;
  const parts = b.parts ? ` · heads ${b.parts.alive}/${b.parts.total}` : '';
  const raid = b.raid ? ` · raid ${b.raid} squads${b.scale > 1.001 ? `, hp x${b.scale.toFixed(1)}` : ''}` : '';
  return `<div class="rf-card g"><div class="gt"><span class="rf-name">${b.name}</span><span class="rf-dim">${gone ? '' : `${Math.ceil(b.hp)} / ${Math.ceil(b.maxHp)}`}</span></div>
<div class="gb"><i style="width:${(share * 100).toFixed(1)}%"></i>${pips}</div><div class="gn rf-dim">${note}${parts}${raid}</div></div>`;
}

/** The landmark panel: holder, state, patch and restore costs, function. */
export function landmarkHtml(lm: Landmark, pieces: BuildingSnap[], bosses: BossSnap[]): string {
  const team = pieces[0]?.team ?? NEUTRAL_TEAM;
  const alive = bosses.filter((b) => b.state !== 'slain');
  const holder = team === MOB_TEAM || alive.length ? `held by ${alive.map((b) => b.name).join(' and ') || 'its guardian'}` : team === NEUTRAL_TEAM ? 'unclaimed' : `held by ${TEAM_NAME[team] ?? 'team ' + team}`;
  const standing = pieces.filter((b) => !b.ruin && b.state !== 'destroyed');
  const ruined = pieces.length - standing.length;
  const avg = standing.reduce((a, b) => a + b.hp / Math.max(1, b.maxHp), 0) / Math.max(1, standing.length);
  const restored = team >= 0 && team < 4 && ruined === 0 && standing.every((b) => b.hp >= b.maxHp * 0.99);
  const state = restored ? 'restored: its function wakes' : ruined ? `${ruined} pieces in ruins, the rest at ${Math.round(avg * 100)}%` : avg < 0.45 ? `damaged (${Math.round(avg * 100)}%), gates open, function dormant` : `as the season finds it (${Math.round(avg * 100)}%), gates shut`;
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
  const lead = lm.engineer === 10 ? 'an engineer of level 10 with Fortifier, Master Builder and Poliorcetes or Archimedes' : 'an engineer of level 8 with Fortifier and Master Builder';
  return `<div class="rf-head"><span class="rf-name">${lm.name}</span><span class="rf-dim" style="margin-left:auto">L</span></div>
<h4>Holder</h4><p>${holder}</p>
<h4>State</h4><p>${state}</p>
<h4>Patch (Fortifier L5)</h4><p>${Object.keys(patch).length ? cost(patch) : 'walls, towers and gates at 60% or more'}</p>
<h4>Restore</h4><p>${cost(lm.restore.bulk)} + ${cost(lm.restore.rare)}<br><span class="rf-dim">led by ${lead}</span></p>
<h4>Once held${restored ? '' : ' (dormant)'}</h4><p${restored ? '' : ' class="rf-dim"'}>${LANDMARK_FUNCTION[lm.id] ?? ''}</p>`;
}
