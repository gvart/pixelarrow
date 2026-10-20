/**
 * A civilian's profession tree (M5h5, docs/WAR.md "Trees") as a graph (../tree/graph.ts): the free root at the left,
 * nodes by level, lines from what each needs (a node that needs nothing hangs off the root), the two L10 capstones as
 * a fork (one of two). Hover: what a node unlocks (its recipes, its effect), its cost, why it is locked. Click takes
 * it (asking first for the last point and for a capstone); Respec at the foot (cost, cooldown).
 */
import { CIV_CLASSES, type CivClassId } from '../../../../data/classes';
import { heldNodes, pointsAt, profOf, PROF_NODES, PROF_ROOT, PROF_TREES, type ProfNode } from '../../../../data/professions';
import { RECIPES, type Recipe } from '../../../../data/recipes';
import { esc } from '../roster/ui';
import type { GNode, TreeView } from '../tree/graph';
import { nameOf, REFUSAL, RESPEC, type Civ, type SandboxCraft } from './state';

const kebab = (id: string) => (id === 'proxenosSick' ? 'proxenos-of-the-sick' : id.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()));
export const nodeIcon = (n: ProfNode, px = 24) => `<img src="war/ui/icons/${px}/node-${n.prof}-${kebab(n.id)}.png" srcset="war/ui/icons/${px}/node-${n.prof}-${kebab(n.id)}@2x.png 2x" width="${px}" height="${px}" alt="">`;

/** Recipes a node opens: its own (node) and those it is a needed step of (Journeyman, Master). */
export function recipesOf(node: string): Recipe[] {
  return Object.values(RECIPES).filter((r) => r.node === node || r.needs?.includes(node));
}

/** The hover card of a node: name and level, effect, recipes it opens, what it needs, its cost or why it is locked. */
function card(c: Civ, n: ProfNode, why: ReturnType<SandboxCraft['refusal']>): string {
  const rs = recipesOf(n.id);
  const needs = [...(n.needs ?? []).map((x) => PROF_NODES[x].name), ...(n.needsAny ? [`${n.needsAny[0]} of ${n.needsAny[1].map((x) => PROF_NODES[x].name).join(', ')}`] : [])];
  const list = rs.slice(0, 8).map((r) => esc(nameOf(r.out.item ?? r.out.tool ?? r.out.good ?? r.out.product ?? r.out.engine ?? r.out.fort ?? r.id)) + (r.tier > 1 ? ` <span class="rf-dim">T${r.tier}</span>` : '')).join(', ');
  const cost = n.root ? 'his from the start' : n.capstone ? 'free at level 10, one capstone of two' : 'costs 1 point';
  const state = why === 'taken' ? '<span style="color:var(--rf-gold)">taken</span>'
    : why ? `<span style="color:var(--rf-bad)">locked: ${REFUSAL[why]}${why === 'level' ? ` (L${n.level}, he is L${c.level})` : ''}</span>`
    : '<span style="color:var(--rf-good)">open: click to take</span>';
  return `<div style="width:210px;white-space:normal"><div class="rf-name" style="font-size:13px">${n.name} <span class="rf-dim" style="font:600 11px Inter">L${n.level}${n.capstone ? ' capstone' : ''}</span></div>
    <div style="margin-top:3px">${esc(n.desc)}</div>
    ${rs.length ? `<div style="margin-top:4px"><span style="color:var(--rf-accent)">Unlocks ${rs.length} recipe${rs.length > 1 ? 's' : ''}:</span> ${list}${rs.length > 8 ? ` <span class="rf-dim">and ${rs.length - 8} more</span>` : ''}</div>` : ''}
    ${needs.length ? `<div class="rf-dim" style="margin-top:3px">needs ${needs.join(', ')}</div>` : ''}
    <div class="rf-dim" style="margin-top:3px">${cost}</div><div style="margin-top:2px">${state}</div></div>`;
}

export function profTree(C: SandboxCraft, c: Civ): TreeView {
  const prof = profOf(c.cls)!, held = heldNodes(prof, c.perks), root = PROF_ROOT[prof];
  const spent = [...held].filter((x) => !PROF_NODES[x].root && !PROF_NODES[x].capstone).length, pts = pointsAt(c.level), left = pts - spent;
  const nodes: GNode[] = PROF_TREES[prof].map((n) => {
    const why = C.refusal(c, n.id);
    return {
      id: n.id, level: n.level, parents: n.root ? [] : n.needs ?? n.needsAny?.[1] ?? [root], lane: n.root ? 1 : undefined,
      state: held.has(n.id) ? 'taken' : why ? 'locked' : 'open', face: nodeIcon(n, 24), name: n.name, tip: card(c, n, why),
      shape: n.root ? 'root' : n.capstone ? 'cap' : undefined, sub: n.capstone ? 'one of two' : undefined,
    };
  });
  const rs = C.respecState(c);
  const respecTip = rs.wait ? `again in ${Math.ceil(rs.wait / 3_600_000)} h` : `every node back, for ${RESPEC.silver} silver, once a day`;
  return {
    graph: { key: `prof:${c.id}:${prof}`, nodes, lanes: 3, level: c.level },
    name: c.name,
    sub: `${CIV_CLASSES[c.cls as CivClassId].name}, level ${c.level}`,
    points: `<span class="tg-pts${left > 0 ? ' on' : ''}" data-tip="1 point a level from L2 to L9; the L10 capstones are free, one of two"><b>${left}</b> point${left === 1 ? '' : 's'} left</span>`,
    foot: `<span class="rf-dim">${c.perks.length} node${c.perks.length === 1 ? '' : 's'} taken</span><span style="flex:1"></span>
      <button class="rf-tbtn" data-act="respec" data-tip="${esc(respecTip)}" ${rs.wait || !rs.silver || !c.perks.length ? 'disabled' : ''}>Respec, ${RESPEC.silver} silver${rs.wait ? ` (${Math.ceil(rs.wait / 3_600_000)} h)` : ''}</button>`,
    ask: (id) => {
      const n = PROF_NODES[id];
      if (n.capstone) return `Take ${n.name}? The other capstone closes for good (a respec reopens it).`;
      if (left === 1) return `Take ${n.name}? It spends his last point.`;
      return null;
    },
  };
}
