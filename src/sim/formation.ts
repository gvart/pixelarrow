/**
 * Formation geometry. A formation is anchored at the centre of its FRONT rank
 * (cx, cy), faces (fx, fy) (unit vector) and has a frontage (files per rank).
 * Ranks extend backwards, opposite to the facing.
 */
export type FormationType = 'line' | 'column' | 'wedge' | 'skirmish' | 'shieldwall' | 'orb';
/** Every shape the sim has slots for; server zod derives its enum from this list. */
export const FORMATION_TYPES: FormationType[] = ['line', 'column', 'wedge', 'skirmish', 'shieldwall', 'orb'];

export interface Formation {
  type: FormationType;
  cx: number;
  cy: number;
  fx: number;
  fy: number;
  frontage: number;
  /** Spacing multipliers between files and ranks (riders need room). Missing = 1. */
  fs?: number;
  rs?: number;
}

export interface Vec {
  x: number;
  y: number;
}

export const SPACING: Record<FormationType, { file: number; rank: number }> = {
  line: { file: 1.0, rank: 1.35 },
  column: { file: 1.0, rank: 1.2 },
  wedge: { file: 1.0, rank: 1.2 },
  skirmish: { file: 1.9, rank: 1.8 },
  shieldwall: { file: 0.8, rank: 1.15 },
  // The orb (formations-orders.md R2): `rank` is the gap between its two rings; `file` stays above 1.05 so the renderer gives each man his own plate (no straight rank strips).
  orb: { file: 2.0, rank: 1.1 },
};

/**
 * The orb (formations-orders.md R2, F1): a ring of men facing outward, centred
 * on the formation anchor (cx, cy). Above ORB_TWO_DEEP men it stands two deep
 * and the radius is computed for the outer ring, ceil(n / 2) men.
 */
export const ORB = {
  rMin: 1.2,
  rPerMan: 0.12,
  twoDeep: 24,
};

/** The orb's rings for n men: men in the outer ring, its radius, the inner ring's radius. */
export function orbRings(n: number): { outer: number; r: number; rIn: number } {
  const outer = n > ORB.twoDeep ? Math.ceil(n / 2) : Math.max(0, n);
  const r = Math.max(ORB.rMin, outer * ORB.rPerMan);
  return { outer, r, rIn: Math.max(ORB.rMin / 2, r - SPACING.orb.rank) };
}

/**
 * cos and sin of `t` turns (t in [0, 1)) from Taylor series on a quarter turn:
 * plain arithmetic, so every JS engine gets the same bits (ADR-0001: no Math.cos).
 */
export function turnCosSin(t: number): { c: number; s: number } {
  const q = Math.floor(t * 4) & 3;
  const x = (t - Math.floor(t * 4) / 4) * 2 * Math.PI;
  const x2 = x * x;
  const c = 1 - (x2 / 2) * (1 - (x2 / 12) * (1 - (x2 / 30) * (1 - (x2 / 56) * (1 - (x2 / 90) * (1 - (x2 / 132) * (1 - (x2 / 182) * (1 - x2 / 240)))))));
  const s = x * (1 - (x2 / 6) * (1 - (x2 / 20) * (1 - (x2 / 42) * (1 - (x2 / 72) * (1 - (x2 / 110) * (1 - (x2 / 156) * (1 - (x2 / 210) * (1 - x2 / 272))))))));
  if (q === 0) return { c, s };
  if (q === 1) return { c: -s, s: c };
  if (q === 2) return { c: -c, s: -s };
  return { c: s, s: -c };
}

/** A monotonic stand-in for the angle of (x, y), in [0, 4): no atan2 (ADR-0001). */
function pseudoAngle(x: number, y: number): number {
  const a = Math.abs(x) + Math.abs(y);
  if (a < 1e-9) return 0;
  if (y >= 0) return x >= 0 ? y / a : 1 - x / a;
  return x < 0 ? 2 - y / a : 3 + x / a;
}

/** Default frontage for a preset applied to n soldiers. */
export function presetFrontage(type: FormationType, n: number): number {
  switch (type) {
    case 'line':
      // Small bands stand in a single rank: a clear diagonal line on the iso field.
      return n <= 8 ? Math.max(1, n) : Math.ceil(n / 2);
    case 'column':
      return Math.max(1, Math.min(n, Math.max(2, Math.round(n / 4))));
    case 'wedge':
      return n;
    case 'skirmish':
      return Math.max(1, Math.ceil(n / 2));
    case 'shieldwall':
      return Math.max(1, Math.ceil(n / 2));
    case 'orb':
      return Math.max(1, n);
  }
}

/** Frontage (in files) that fits a drawn line of given length. */
export function frontageForWidth(type: FormationType, width: number, n: number): number {
  const f = Math.round(width / SPACING[type].file) + 1;
  return Math.max(1, Math.min(n, f));
}

/** Right-hand lateral vector for a facing: facing up (0,-1) gives right = (1,0). */
export function rightOf(fx: number, fy: number): Vec {
  return { x: -fy, y: fx };
}

/** Slot positions for n soldiers, front rank first, ordered left-to-right within ranks. */
export function formationSlots(f: Formation, n: number): Vec[] {
  const out: Vec[] = [];
  if (n <= 0) return out;
  const sp = SPACING[f.type];
  const r = rightOf(f.fx, f.fy);
  const back = { x: -f.fx, y: -f.fy };
  const push = (lat: number, depth: number) => {
    out.push({ x: f.cx + r.x * lat + back.x * depth, y: f.cy + r.y * lat + back.y * depth });
  };
  if (f.type === 'wedge') {
    let placed = 0;
    let row = 0;
    while (placed < n) {
      const inRow = Math.min(row + 1, n - placed);
      for (let i = 0; i < inRow; i++) {
        const lat = (i - (inRow - 1) / 2) * (f.fs === undefined ? sp.file : sp.file * f.fs);
        push(lat, row * (f.rs === undefined ? sp.rank : sp.rank * f.rs));
      }
      placed += inRow;
      row++;
    }
    // Shift so the apex sits slightly ahead of the anchor and mass centres on it.
    return out;
  }
  if (f.type === 'orb') {
    // Outer ring first from the facing round to the right, then the inner ring offset by half a step.
    const o = orbRings(n);
    const ring = (m: number, rad: number, shift: number) => {
      for (let k = 0; k < m; k++) {
        const a = turnCosSin((k + shift) / m);
        out.push({ x: f.cx + (f.fx * a.c + r.x * a.s) * rad, y: f.cy + (f.fy * a.c + r.y * a.s) * rad });
      }
    };
    ring(o.outer, o.r, 0);
    ring(n - o.outer, o.rIn, 0.5);
    return out;
  }
  const files = Math.max(1, Math.min(n, Math.round(f.frontage)));
  const fileSp = f.fs === undefined ? sp.file : sp.file * f.fs;
  const rankSp = f.rs === undefined ? sp.rank : sp.rank * f.rs;
  const ranks = Math.ceil(n / files);
  let placed = 0;
  for (let k = 0; k < ranks; k++) {
    const inRank = Math.min(files, n - placed);
    const stagger = f.type === 'skirmish' && k % 2 === 1 ? fileSp / 2 : 0;
    for (let i = 0; i < inRank; i++) {
      const lat = (i - (inRank - 1) / 2) * fileSp + stagger;
      push(lat, k * rankSp);
    }
    placed += inRank;
  }
  return out;
}

/** Number of ranks a formation needs. */
export function formationDepth(f: Formation, n: number): number {
  if (f.type === 'orb') return n > ORB.twoDeep ? 2 : 1;
  if (f.type === 'wedge') {
    let rows = 0;
    let placed = 0;
    while (placed < n) {
      placed += rows + 1;
      rows++;
    }
    return rows;
  }
  return Math.ceil(n / Math.max(1, Math.min(n, Math.round(f.frontage))));
}

export interface SlotCandidate {
  id: number;
  x: number;
  y: number;
  /** Lower = wants to be further forward (e.g. shielded melee = 0, ranged = 2). */
  priority: number;
}

/**
 * Assign units to slots: front ranks get the highest-priority (lowest number)
 * soldiers, then within a rank soldiers are ordered by their lateral position to
 * avoid crossing paths. Deterministic: ties broken by id.
 */
export function assignSlots(f: Formation, units: SlotCandidate[], slots: Vec[]): Map<number, Vec> {
  const r = rightOf(f.fx, f.fy);
  const lateral = (p: Vec) => (p.x - f.cx) * r.x + (p.y - f.cy) * r.y;
  const forward = (p: Vec) => (p.x - f.cx) * f.fx + (p.y - f.cy) * f.fy;
  if (f.type === 'orb') return assignRing(units, slots, (p) => pseudoAngle(forward(p), lateral(p)));

  // Group slots into ranks by forward distance (slots are emitted rank by rank).
  const ranks: Vec[][] = [];
  let last = Number.NaN;
  for (const s of slots) {
    const d = Math.round(forward(s) * 100);
    if (d !== last) {
      ranks.push([]);
      last = d;
    }
    ranks[ranks.length - 1].push(s);
  }
  const sorted = units
    .slice()
    .sort((a, b) => a.priority - b.priority || forward(b) - forward(a) || a.id - b.id);
  const result = new Map<number, Vec>();
  let idx = 0;
  for (const rank of ranks) {
    const members = sorted.slice(idx, idx + rank.length);
    idx += rank.length;
    members.sort((a, b) => lateral(a) - lateral(b) || a.id - b.id);
    const rs = rank.slice().sort((a, b) => lateral(a) - lateral(b));
    members.forEach((m, i) => result.set(m.id, rs[i]));
  }
  return result;
}

/**
 * The orb: the front-rank men (by priority) take the outer ring, the rest the
 * inner one; within a ring men and slots are matched in order round the
 * centre, so nobody crosses the ring. Deterministic: ties broken by id.
 */
function assignRing(units: SlotCandidate[], slots: Vec[], angle: (p: Vec) => number): Map<number, Vec> {
  const outer = orbRings(slots.length).outer;
  const sorted = units.slice().sort((a, b) => a.priority - b.priority || a.id - b.id);
  const result = new Map<number, Vec>();
  const match = (men: SlotCandidate[], ring: Vec[]) => {
    const ms = men.slice().sort((a, b) => angle(a) - angle(b) || a.id - b.id);
    const rs = ring.slice().sort((a, b) => angle(a) - angle(b));
    ms.forEach((m, i) => result.set(m.id, rs[i]));
  };
  match(sorted.slice(0, outer), slots.slice(0, outer));
  match(sorted.slice(outer), slots.slice(outer));
  return result;
}
