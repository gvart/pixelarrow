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
      <div class="rf-name" style="font-size:13px">${n.name} <span class="rf-dim" style="font:600 11px Inter">L${n.level}${n.root ? ' · root' : n.capstone ? ' · capstone' : ''}</span></div>
      <div style="margin-top:3px;white-space:normal;line-height:16px">${esc(n.desc)}</div></div></div>
    ${rs.length ? `<div class="rf-cap" style="margin-top:4px">Unlocks ${rs.length} recipe${rs.length > 1 ? 's' : ''}</div><div style="display:flex;flex-wrap:wrap;gap:2px">${list}${rs.length > 8 ? ` <span class="rf-dim">+${rs.length - 8} more</span>` : ''}</div>` : ''}
    ${needs.length ? `<div class="rf-dim" style="margin-top:3px">needs ${needs.join(' · ')}</div>` : ''}
    <div style="display:flex;align-items:center;gap:4px;margin-top:5px">
      <span style="color:${why === 'taken' ? 'var(--rf-gold)' : why ? 'var(--rf-bad)' : 'var(--rf-good)'}">${why === 'taken' ? 'taken' : why ? REFUSAL[why] : n.capstone ? 'open: free, one capstone only' : 'open: costs 1 point'}</span><span style="flex:1"></span>
      ${why ? '' : `<button class="rf-tbtn pri" data-take="${n.id}">Take ${n.name}</button>`}
    </div>`;
}

export function treeHtml(C: SandboxCraft, c: Civ, picked: string | null): string {
  const prof = profOf(c.cls)!, nodes = PROF_TREES[prof], held = heldNodes(prof, c.perks);
  const spent = [...held].filter((x) => !PROF_NODES[x].root && !PROF_NODES[x].capstone).length, pts = pointsAt(c.level);
  const levels = [...new Set(nodes.map((n) => n.level))].sort((a, b) => a - b);
  const tile = (n: ProfNode) => {
    const why = C.refusal(c, n.id), st = held.has(n.id) ? 'taken' : why ? 'locked' : 'open';
    const tip = `<b style="color:var(--rf-title)">${n.name}</b> ${esc(n.desc)}<br><span class="rf-dim">${st === 'locked' ? REFUSAL[why!] : st}</span>`;
    return `<button class="pt-node ${st}${picked === n.id ? ' sel' : ''}" data-node="${n.id}" data-tip="${esc(tip)}">${nodeIcon(n, 24)}<span>${n.name}</span></button>`;
  };
  const rows = levels.map((lv) => `<div class="pt-row${c.level < lv ? ' ahead' : ''}"><span class="pt-lv">L${lv}</span><div class="pt-nodes">${nodes.filter((n) => n.level === lv).map(tile).join('')}</div></div>`).join('');
  const rs = C.respecState(c), pick = picked ? PROF_NODES[picked] : null;
  const respecTip = rs.wait ? `again in ${Math.ceil(rs.wait / 3_600_000)} h` : `all nodes back for ${RESPEC.silver} silver, once a day`;
  return `<div class="rf-card" style="padding:4px 6px 6px">
    <div class="rf-head"><span class="rf-name" style="font-size:16px">${esc(c.name)}</span><span class="rf-dim">${CIV_CLASSES[c.cls as CivClassId].name} · L${c.level}</span><span style="flex:1"></span>
      <span class="rf-num" style="color:${spent < pts ? 'var(--rf-gold)' : 'var(--rf-muted)'}" data-tip="points: 1 a level from L2 to L9; capstones (L10) are free, one of two">${pts - spent} / ${pts} pts</span>
      <button class="rf-tbtn x" data-act="closeTree" data-tip="close">✕</button></div>
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
.pt-legend{display:flex;align-items:center;gap:4px;margin:5px 0 4px;font:600 11px/1 Inter,sans-serif;color:var(--rf-muted)}
.pt-legend i{display:inline-block;width:9px;height:9px;margin-left:6px;border:1px solid}
.pt-legend i.taken{border-color:#e0b867;background:#4a3410}.pt-legend i.open{border-color:#de8a4e;background:#3a1c10}.pt-legend i.locked{border-color:#4a3428;background:#140c08}
.pt-tree{border-top:1px solid var(--rf-line);padding-top:2px}
.pt-row{display:flex;align-items:center;gap:4px;min-height:32px;padding:1px 0;border-bottom:1px solid var(--rf-rule)}
.pt-row.ahead .pt-lv{color:var(--rf-disabled)}
.pt-lv{width:22px;font:600 11px/1 Inter,sans-serif;color:var(--rf-muted);text-align:right;flex:none}
.pt-nodes{display:flex;flex-wrap:wrap;gap:2px;flex:1}
.pt-node{display:flex;align-items:center;gap:4px;height:28px;padding:1px 6px 1px 1px;cursor:pointer;font:600 11.5px/1 Inter,sans-serif;color:var(--rf-ink);background:var(--rf-raised);border:1px solid var(--rf-rule);white-space:nowrap}
.pt-node img{display:block}
.pt-node.taken{border-color:var(--rf-gold);background:#33250e;color:#f6dc9c}
.pt-node.open{border-color:#de8a4e;background:#2e160c}
.pt-node:hover{background:var(--rf-hover)}.pt-node.open:hover{background:var(--rf-sel)}
.pt-node.locked{color:var(--rf-disabled);background:none}.pt-node.locked img{opacity:.55;filter:grayscale(.8)}
.pt-node.sel{box-shadow:0 0 0 1px var(--rf-title),inset 0 0 0 1px var(--rf-title)}
.pt-prev{margin-top:6px;padding:6px;border:1px solid var(--rf-line);background:var(--rf-sunk);min-height:40px}
`;
