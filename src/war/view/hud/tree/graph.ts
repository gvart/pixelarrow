/**
 * The tree graph (owner play-test): one component for the profession trees (../craft/tree.ts) and the soldier skill
 * trees (../roster/skillTree.ts). Root at the left, one column per level, nodes on lanes, connector lines from each
 * node's prerequisites routed through the gaps between columns and the channels between lanes (never through a node),
 * so branches read as a tree. The state reads from the art alone, no legend (W-55, after the KCD2 and Path of Exile
 * trees): taken is a lit gold medallion with a glow; open (may be taken now) a bronze ring with a breathing halo, a gold
 * cost badge and a lift on hover; locked a dark iron ring, a grey icon and a lock tag with the level it opens at (the
 * reason in the hover card). Levels past the man's own are shaded.
 *
 * `paintGraph` builds the DOM once per tree (`key`) and afterwards patches node and edge states in place, so a node
 * taken lights up and its lines fill with a transition instead of a re-render jump.
 */
import { esc } from '../roster/ui';

export type NodeState = 'taken' | 'open' | 'locked';

export interface GNode {
  id: string;
  /** The level it opens at: its column. */
  level: number;
  /** A fixed lane (0 = top); else placed near its parents. */
  lane?: number;
  parents: string[];
  state: NodeState;
  /** Medallion content: an <img> or a short text. */
  face: string;
  name: string;
  /** Hover card (HTML). */
  tip: string;
  shape?: 'root' | 'cap';
  /** Small text under the name (a value, "one of two"). */
  sub?: string;
  /** Open: the cost badge (default "+"). */
  badge?: string;
  /** Locked: the level it opens at, on the lock tag (none: a bare lock). */
  opens?: number;
}

export interface Graph { key: string; nodes: GNode[]; lanes: number; level: number }

/** What the tree panel (../craft/index.ts) shows for one man: the graph, his header and foot, and which takes ask first. */
export interface TreeView {
  graph: Graph;
  name: string;
  /** Class and level under the name. */
  sub: string;
  /** The points counter (HTML). */
  points: string;
  /** Under the graph: respec, or what is pending (HTML). */
  foot: string;
  /** A confirm question before taking node id (scarce points, a permanent pick), or null to take it at once. */
  ask: (id: string) => string | null;
}

export const CW = 74, RH = 72, R = 18, TOP = 28, PAD = 6;

/** Lanes per column: fixed lanes kept, the rest near their parents' mean, spread apart, as few crossings as a small search finds. */
function layout(g: Graph): Map<string, { x: number; y: number; col: number; lane: number }> {
  const cols = [...new Set(g.nodes.map((n) => n.level))].sort((a, b) => a - b);
  const out = new Map<string, { x: number; y: number; col: number; lane: number }>();
  const mid = (g.lanes - 1) / 2;
  cols.forEach((lv, ci) => {
    const here = g.nodes.filter((n) => n.level === lv);
    const used = new Set(here.filter((n) => n.lane !== undefined).map((n) => n.lane!));
    const free = [...Array(g.lanes).keys()].filter((l) => !used.has(l));
    const auto = here.filter((n) => n.lane === undefined).map((n, i) => {
      const ps = n.parents.map((p) => out.get(p)?.lane).filter((l): l is number => l !== undefined);
      return { n, i, want: ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : mid };
    }).sort((a, b) => a.want - b.want || a.i - b.i);
    const k = auto.length, step = k > 1 ? Math.min(2, (g.lanes - 1) / (k - 1)) : 0;
    const wants = auto.map((a, i) => a.want + (i - (k - 1) / 2) * step);
    // best increasing pick of k free lanes (k, lanes <= 5: a few dozen combinations)
    let best: number[] = [], cost = Infinity;
    const pick = (from: number, acc: number[]) => {
      if (acc.length === k) {
        const c = acc.reduce((s, l, i) => s + (l - wants[i]) ** 2, 0);
        if (c < cost) (cost = c), (best = acc);
        return;
      }
      for (let j = from; j <= free.length - (k - acc.length); j++) pick(j + 1, [...acc, free[j]]);
    };
    pick(0, []);
    for (const n of here) {
      const lane = n.lane ?? best[auto.findIndex((a) => a.n === n)] ?? 0;
      out.set(n.id, { x: PAD + ci * CW + CW / 2, y: TOP + lane * RH + R + 4, col: ci, lane });
    }
  });
  return out;
}

/** An orthogonal path through points with rounded corners. */
function ortho(pts: [number, number][]): string {
  const p = pts.filter((q, i) => i === 0 || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]);
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [ax, ay] = p[i - 1], [bx, by] = p[i], [cx, cy] = p[i + 1];
    const r = Math.min(5, Math.hypot(bx - ax, by - ay) / 2, Math.hypot(cx - bx, cy - by) / 2);
    const ux = Math.sign(bx - ax), uy = Math.sign(by - ay), vx = Math.sign(cx - bx), vy = Math.sign(cy - by);
    d += ` L${bx - ux * r},${by - uy * r} Q${bx},${by} ${bx + vx * r},${by + vy * r}`;
  }
  const e = p[p.length - 1];
  return d + ` L${e[0]},${e[1]}`;
}

function route(a: { x: number; y: number; col: number; lane: number }, b: { x: number; y: number; col: number; lane: number }, busy: (col: number, lane: number) => boolean): string {
  const s: [number, number] = [a.x + R + 1, a.y], e: [number, number] = [b.x - R - 1, b.y];
  const g1 = a.x + CW / 2, g2 = b.x - CW / 2;
  const clear = (lane: number) => { for (let c = a.col + 1; c < b.col; c++) if (busy(c, lane)) return false; return true; };
  if (b.col === a.col + 1 || clear(b.lane)) return ortho([s, [g1, a.y], [g1, b.y], e]);
  if (clear(a.lane)) return ortho([s, [g2, a.y], [g2, b.y], e]);
  const ch = b.y - R - 10; // the channel above the child's lane, between the lane above's labels and his medallion
  return ortho([s, [g1, a.y], [g1, ch], [g2, ch], [g2, b.y], e]);
}

const edgeState = (p: GNode, c: GNode) => (p.state === 'taken' && c.state === 'taken' ? 'lit' : p.state === 'taken' && c.state === 'open' ? 'ready' : 'dim');
const LOCK = '<svg viewBox="0 0 7 8" width="7" height="8"><path d="M1.5 3.5V2.2a2 2 0 0 1 4 0v1.3" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="0.5" y="3.5" width="6" height="4.2" fill="currentColor"/></svg>';
/** The corner marks of a medallion: the cost badge (shown while open), the lock tag (shown while locked). */
const marks = (n: GNode) => `<span class="tg-badge">${n.badge ?? '+'}</span><span class="tg-lock">${LOCK}${n.opens ? `<b>${n.opens}</b>` : ''}</span>`;

/** The graph's width in art px. */
export const graphWidth = (g: Graph) => PAD * 2 + new Set(g.nodes.map((n) => n.level)).size * CW;
/** The tree panel's width: the graph's, at least room for the header. */
export const panelWidth = (g: Graph) => Math.max(360, graphWidth(g) + 26);

function build(g: Graph): string {
  const pos = layout(g), cols = [...new Set(g.nodes.map((n) => n.level))].sort((a, b) => a - b);
  const W = graphWidth(g), H = TOP + g.lanes * RH + 2;
  const at = new Set([...pos.values()].map((p) => `${p.col}:${p.lane}`));
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const edges = g.nodes.flatMap((c) => c.parents.filter((p) => byId.has(p)).map((p) => {
    const d = route(pos.get(p)!, pos.get(c.id)!, (col, lane) => at.has(`${col}:${lane}`));
    return `<path data-e="${p}>${c.id}" class="${edgeState(byId.get(p)!, c)}" d="${d}" pathLength="100"/>`;
  }));
  const ruler = cols.map((lv, i) => `<span class="tg-lv${lv > g.level ? ' ahead' : lv === g.level ? ' now' : ''}" style="left:${PAD + i * CW}px;width:${CW}px">Level ${lv}</span>`).join('');
  const ahead = cols.findIndex((lv) => lv > g.level);
  const shade = ahead >= 0 ? `<div class="tg-ahead" style="left:${PAD + ahead * CW}px;width:${(cols.length - ahead) * CW}px;height:${H}px"></div>` : '';
  const nodes = g.nodes.map((n) => {
    const p = pos.get(n.id)!;
    return `<button class="tg-n ${n.state}${n.shape ? ' ' + n.shape : ''}" data-node="${n.id}" data-tip="${esc(n.tip)}" style="left:${p.x - CW / 2}px;top:${p.y - R - 2}px;width:${CW}px;--d:${p.col * 45}ms">
      <span class="tg-m">${n.face}${marks(n)}</span><span class="tg-t">${n.name}</span>${n.sub ? `<span class="tg-s">${n.sub}</span>` : ''}</button>`;
  }).join('');
  return `<div class="tg" data-key="${g.key}" style="width:${W}px;height:${H}px">${shade}${ruler}
    <svg class="tg-e" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${edges.join('')}</svg>${nodes}</div>`;
}

/** Paint graph g into host: built fresh for a new tree, patched in place for the same one. */
export function paintGraph(host: HTMLElement, g: Graph): void {
  const el = host.querySelector<HTMLElement>('.tg');
  const shape = g.nodes.map((n) => `${n.id}:${n.level}:${n.lane ?? ''}:${n.parents.join(',')}`).join('|') + `|${g.level}`;
  if (!el || el.dataset.key !== g.key || el.dataset.shape !== shape) {
    host.innerHTML = build(g);
    const t = host.querySelector<HTMLElement>('.tg')!;
    t.dataset.shape = shape;
    if (el?.dataset.key === g.key) t.classList.add('still'); // same tree, new shape: no entrance again
    return;
  }
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  for (const b of el.querySelectorAll<HTMLElement>('[data-node]')) {
    const n = byId.get(b.dataset.node!)!;
    const cls = `tg-n ${n.state}${n.shape ? ' ' + n.shape : ''}${b.classList.contains('sel') ? ' sel' : ''}`;
    if (b.className !== cls) b.className = cls;
    if (b.dataset.tip !== n.tip) b.dataset.tip = n.tip;
    const s = b.querySelector('.tg-s');
    if (s && n.sub !== undefined && s.innerHTML !== n.sub) s.innerHTML = n.sub;
    const m = b.querySelector('.tg-m');
    if (m) { const k = marks(n), old = [...m.querySelectorAll('.tg-badge,.tg-lock')].map((x) => x.outerHTML).join(''); if (old !== k) { m.querySelectorAll('.tg-badge,.tg-lock').forEach((x) => x.remove()); m.insertAdjacentHTML('beforeend', k); } }
  }
  for (const p of el.querySelectorAll<SVGPathElement>('[data-e]')) {
    const [a, c] = p.dataset.e!.split('>');
    const st = edgeState(byId.get(a)!, byId.get(c)!);
    if (p.getAttribute('class') !== st) p.setAttribute('class', st);
  }
}

/** Mark one node as picked (the confirm strip is about it). */
export function markGraph(host: HTMLElement, id: string | null): void {
  for (const b of host.querySelectorAll<HTMLElement>('[data-node]')) b.classList.toggle('sel', b.dataset.node === id);
}

export const GRAPH_CSS = `
.tg{position:relative;margin:6px auto 0;background:radial-gradient(ellipse at 20% 50%,#21150f 0,#120b08 75%);border:1px solid var(--rf-rule);box-shadow:inset 0 0 0 1px #0e0907}
.tg-ahead{position:absolute;top:0;background:repeating-linear-gradient(135deg,rgba(14,9,7,.55) 0 3px,rgba(14,9,7,.25) 3px 6px);border-left:1px dashed #5a3a28;pointer-events:none}
.tg-lv{position:absolute;top:6px;text-align:center;font:700 10px/1 Cinzel,serif;color:var(--rf-accent);letter-spacing:.05em}
.tg-lv.now{color:var(--rf-gold);text-shadow:0 0 6px rgba(224,184,103,.5)}
.tg-lv.ahead{color:var(--rf-disabled)}
.tg-e{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
.tg-e path{fill:none;stroke-width:1.5;stroke-linejoin:round;transition:stroke .35s,opacity .35s}
.tg-e path.dim{stroke:#4f3324;stroke-dasharray:2 2}
.tg-e path.ready{stroke:#de8a4e;stroke-dasharray:5 3;animation:tg-flow 1.2s linear infinite}
@keyframes tg-flow{to{stroke-dashoffset:-16}}
.tg-e path.lit{stroke:#e0b867;filter:drop-shadow(0 0 1.5px rgba(224,184,103,.8))}
.tg:not(.still) .tg-e path:not(.ready){animation:tg-draw .5s ease-out both}
@keyframes tg-draw{from{opacity:0}to{opacity:1}}
.tg-n{position:absolute;display:flex;flex-direction:column;align-items:center;gap:3px;padding:0;background:none;border:0;color:var(--rf-ink)}
.tg:not(.still) .tg-n{animation:tg-in .32s cubic-bezier(.2,.9,.3,1.2) both;animation-delay:var(--d)}
@keyframes tg-in{from{opacity:0;transform:translateX(-6px) scale(.85)}to{opacity:1;transform:none}}
.tg-m{position:relative;width:${R * 2}px;height:${R * 2}px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#1c120d;border:2px solid #4a3428;box-shadow:inset 0 0 0 1px #0e0907;transition:border-color .3s,background .3s,box-shadow .4s,transform .15s;font:700 10px/1 Cinzel,serif;color:var(--rf-muted)}
.tg-m img,.tg-m .gl{display:block;transition:opacity .3s,filter .3s}
.tg-n.root .tg-m{outline:1px solid #7a5a28;outline-offset:2px}
.tg-n.cap .tg-m{border-radius:4px;transform:rotate(45deg) scale(.88)}
.tg-n.cap .tg-m>img,.tg-n.cap .tg-m>.gl,.tg-n.cap .tg-badge,.tg-n.cap .tg-lock{transform:rotate(-45deg) scale(1.12)}
.tg-t{font:600 10px/11px Inter,sans-serif;text-align:center;max-width:${CW - 2}px;white-space:normal;transition:color .3s}
.tg-s{font:600 9.5px/1 Inter,sans-serif;color:var(--rf-muted)}
.tg-badge,.tg-lock{position:absolute;display:none;align-items:center;justify-content:center;pointer-events:none}
.tg-badge{right:-7px;top:-6px;min-width:16px;height:16px;padding:0 3px;border-radius:8px;background:linear-gradient(#f6dc9c,#c9a24a);color:#1e1208;font:700 10px/1 Inter,sans-serif;box-shadow:0 0 0 1px #0e0907,0 0 6px rgba(224,184,103,.75)}
.tg-lock{right:-8px;bottom:-5px;gap:2px;height:13px;padding:0 3px;background:#0e0907;border:1px solid #4a3428;color:#a8907a;font:700 9px/1 Inter,sans-serif}
.tg-lock b{font-weight:700}
.tg-n.taken .tg-m{border-color:#e0b867;background:radial-gradient(circle at 50% 40%,#6a4c18,#3a2808);box-shadow:inset 0 0 0 1px #0e0907,0 0 9px 2px rgba(224,184,103,.5)}
.tg-n.taken .tg-t{color:#f6dc9c}
.tg-n.open{cursor:pointer}
.tg-n.open .tg-m{border-color:#de8a4e;background:radial-gradient(circle at 50% 40%,#3e2010,#24120a);animation:tg-pulse 1.8s ease-in-out infinite}
.tg-n.open .tg-badge{display:flex}
.tg-n.open:hover .tg-m{transform:scale(1.1);border-color:#f2b27a}
.tg-n.cap.open:hover .tg-m{transform:rotate(45deg) scale(.97)}
@keyframes tg-pulse{0%,100%{box-shadow:inset 0 0 0 1px #0e0907,0 0 0 1px rgba(222,138,78,.35),0 0 6px rgba(222,138,78,.35)}50%{box-shadow:inset 0 0 0 1px #0e0907,0 0 0 4px rgba(222,138,78,.12),0 0 12px rgba(222,138,78,.7)}}
.tg-n.locked .tg-m{border-color:#33251c;background:#110a07}
.tg-n.locked .tg-t{color:var(--rf-disabled)}
.tg-n.locked .tg-m img,.tg-n.locked .tg-m .gl{opacity:.35;filter:grayscale(1) brightness(.85)}
.tg-n.locked .tg-lock{display:flex}
.tg-n:hover .tg-m{border-color:var(--rf-title)}
.tg-n.locked:hover .tg-m{border-color:#5a4030}
.tg-n.sel .tg-m{outline:2px solid var(--rf-title);outline-offset:2px}
.tg-n:focus-visible{outline:none}.tg-n:focus-visible .tg-m{outline:1px solid var(--rf-title);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.tg-n,.tg-e path,.tg-n.open .tg-m{animation:none!important}}
`;
