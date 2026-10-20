/**
 * The profession tree panel (M5h5, docs/WAR.md "Trees"): a civilian's tree by level, one medallion per node (ART-C
 * node icons) marked taken (gold), open (terracotta, may be taken now) or locked (dim, with why); points left; a node
 * picked shows what it unlocks (its recipes, its effect, what it needs) with Take; Respec at the foot (cost, cooldown).
 * Pure HTML; ./index.ts mounts it and routes data-node / data-act clicks.
 */
import { CIV_CLASSES, type CivClassId } from '../../../../data/classes';
import { heldNodes, pointsAt, profOf, PROF_NODES, PROF_TREES, type ProfNode } from '../../../../data/professions';
import { RECIPES, type Recipe } from '../../../../data/recipes';
import { snapW } from '../kit';
import { esc } from '../roster/ui';
import { nameOf, REFUSAL, RESPEC, type Civ, type SandboxCraft } from './state';

export const TREE_W = snapW(246);
const kebab = (id: string) => (id === 'proxenosSick' ? 'proxenos-of-the-sick' : id.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()));
export const nodeIcon = (n: ProfNode, px = 24) => `<img src="war/ui/icons/24/node-${n.prof}-${kebab(n.id)}.png" srcset="war/ui/icons/24/node-${n.prof}-${kebab(n.id)}@2x.png 2x" width="${px}" height="${px}" alt="">`;

/** Recipes a node opens: its own (node) and those it is a needed step of (Journeyman, Master). */
export function recipesOf(node: string): Recipe[] {
  return Object.values(RECIPES).filter((r) => r.node === node || r.needs?.includes(node));
}

/** The preview of a node: effect, recipes it opens, what it needs, why it is locked. */
function preview(C: SandboxCraft, c: Civ, n: ProfNode): string {
  const rs = recipesOf(n.id), why = C.refusal(c, n.id);
  const needs = [...(n.needs ?? []).map((x) => PROF_NODES[x].name), ...(n.needsAny ? [`${n.needsAny[0]} of ${n.needsAny[1].map((x) => PROF_NODES[x].name).join(', ')}`] : [])];
  const list = rs.slice(0, 8).map((r) => `<span class="rr-chip">${esc(nameOf(r.out.item ?? r.out.tool ?? r.out.good ?? r.out.product ?? r.out.engine ?? r.out.fort ?? r.id))}${r.tier > 1 ? ` <span class="rf-dim">T${r.tier}</span>` : ''}</span>`).join(' ');
  return `<div style="display:flex;gap:5px;align-items:flex-start">${nodeIcon(n, 24)}<div style="flex:1;min-width:0">
      <div class="rf-name" style="font-size:13px">${n.name} <span class="rf-dim" style="font:600 9px Inter">L${n.level}${n.root ? ' · root' : n.capstone ? ' · capstone' : ''}</span></div>
      <div style="margin-top:2px;white-space:normal;line-height:12px">${esc(n.desc)}</div></div></div>
    ${rs.length ? `<div class="rf-cap" style="margin-top:4px">Unlocks ${rs.length} recipe${rs.length > 1 ? 's' : ''}</div><div style="display:flex;flex-wrap:wrap;gap:2px">${list}${rs.length > 8 ? ` <span class="rf-dim">+${rs.length - 8} more</span>` : ''}</div>` : ''}
    ${needs.length ? `<div class="rf-dim" style="margin-top:3px">needs ${needs.join(' · ')}</div>` : ''}
    <div style="display:flex;align-items:center;gap:4px;margin-top:5px">
      <span style="color:${why === 'taken' ? '#e0b867' : why ? '#e08a70' : '#9fd47a'}">${why === 'taken' ? 'taken' : why ? REFUSAL[why] : n.capstone ? 'open: free, one capstone only' : 'open: costs 1 point'}</span><span style="flex:1"></span>
      ${why ? '' : `<button class="rf-tbtn on" data-take="${n.id}">Take ${n.name}</button>`}
    </div>`;
}

export function treeHtml(C: SandboxCraft, c: Civ, picked: string | null): string {
  const prof = profOf(c.cls)!, nodes = PROF_TREES[prof], held = heldNodes(prof, c.perks);
  const spent = [...held].filter((x) => !PROF_NODES[x].root && !PROF_NODES[x].capstone).length, pts = pointsAt(c.level);
  const levels = [...new Set(nodes.map((n) => n.level))].sort((a, b) => a - b);
  const tile = (n: ProfNode) => {
    const why = C.refusal(c, n.id), st = held.has(n.id) ? 'taken' : why ? 'locked' : 'open';
    const tip = `<b style="color:#f2b27a">${n.name}</b> ${esc(n.desc)}<br><span class="rf-dim">${st === 'locked' ? REFUSAL[why!] : st}</span>`;
    return `<button class="pt-node ${st}${picked === n.id ? ' sel' : ''}" data-node="${n.id}" data-tip="${esc(tip)}">${nodeIcon(n, 24)}<span>${n.name}</span></button>`;
  };
  const rows = levels.map((lv) => `<div class="pt-row${c.level < lv ? ' ahead' : ''}"><span class="pt-lv">L${lv}</span><div class="pt-nodes">${nodes.filter((n) => n.level === lv).map(tile).join('')}</div></div>`).join('');
  const rs = C.respecState(c), pick = picked ? PROF_NODES[picked] : null;
  const respecTip = rs.wait ? `again in ${Math.ceil(rs.wait / 3_600_000)} h` : `all nodes back for ${RESPEC.silver} silver, once a day`;
  return `<div class="rf-card" style="padding:4px 6px 6px">
    <div style="display:flex;align-items:center;gap:4px"><span class="rf-name" style="font-size:15px">${esc(c.name)}</span><span class="rf-dim">${CIV_CLASSES[c.cls as CivClassId].name} · L${c.level}</span><span style="flex:1"></span>
      <span class="rf-num" style="color:${spent < pts ? '#e0b867' : '#a8907a'}" data-tip="points: 1 a level from L2 to L9; capstones (L10) are free, one of two">${pts - spent} / ${pts} pts</span>
      <button class="rf-tbtn" data-act="closeTree" data-tip="close">✕</button></div>
    <div class="pt-legend"><i class="taken"></i>taken <i class="open"></i>open <i class="locked"></i>locked</div>
    <div class="pt-tree">${rows}</div>
    <div class="pt-prev">${pick ? preview(C, c, pick) : '<span class="rf-dim">pick a node to see what it unlocks</span>'}</div>
    <div style="display:flex;align-items:center;gap:4px;margin-top:5px">
      <span class="rf-dim">${c.perks.length} node${c.perks.length === 1 ? '' : 's'} taken</span><span style="flex:1"></span>
      <button class="rf-tbtn" data-act="respec" data-tip="${esc(respecTip)}" ${rs.wait || !rs.silver || !c.perks.length ? 'disabled' : ''}>Respec · ${RESPEC.silver} silver${rs.wait ? ` · ${Math.ceil(rs.wait / 3_600_000)} h` : ''}</button>
    </div>
  </div>`;
}

export const TREE_CSS = `
.pt-legend{display:flex;align-items:center;gap:3px;margin:3px 0 2px;font:600 8px/1 Inter,sans-serif;color:#a8907a}
.pt-legend i{display:inline-block;width:7px;height:7px;margin-left:4px;border:1px solid}
.pt-legend i.taken{border-color:#e0b867;background:#4a3410}.pt-legend i.open{border-color:#de8a4e;background:#3a1c10}.pt-legend i.locked{border-color:#4a3428;background:#140c08}
.pt-tree{border-top:1px solid #7a3418;padding-top:2px}
.pt-row{display:flex;align-items:center;gap:4px;min-height:30px;border-bottom:1px solid #2a1a12}
.pt-row.ahead .pt-lv{color:#5e4c40}
.pt-lv{width:18px;font:700 10px/1 'Cormorant SC',serif;color:#a8907a;text-align:right;flex:none}
.pt-nodes{display:flex;flex-wrap:wrap;gap:2px;flex:1}
.pt-node{display:flex;align-items:center;gap:3px;height:28px;padding:1px 5px 1px 1px;cursor:pointer;font:600 9px/1 Inter,sans-serif;color:#f0d9b5;background:#1a100b;border:1px solid #4a3428;white-space:nowrap}
.pt-node img{display:block}
.pt-node.taken{border-color:#e0b867;background:#3a2a10;color:#f2d28a}
.pt-node.open{border-color:#de8a4e;background:#2e160c}
.pt-node.open:hover{background:#4a2414}
.pt-node.locked{opacity:.55}.pt-node.locked img{filter:grayscale(.8)}
.pt-node.sel{box-shadow:0 0 0 1px #f2b27a,inset 0 0 0 1px #f2b27a}
.pt-prev{margin-top:5px;padding:4px;border:1px solid #7a3418;background:#140c08;min-height:40px}
`;
