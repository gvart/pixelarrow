/**
 * RD-02: the flank arc (design/gdd/battle-readability.md R4). Pure geometry, no
 * Phaser: which side of a group a blow (or an approaching enemy) comes from, and
 * where around the group's field badge the arc and its chevrons are drawn.
 */
import { describe, expect, it } from 'vitest';
import { isoDir } from '../src/art/iso';
import { ARC_HALF, FlankWatch, FLANK_ARC_S, THREAT_PACES, arcChevrons, arcPath, flankArc, flankSide, flankThreats, type ThreatSim } from '../src/ui/flankArc';
import type { SimGroup, SimUnit } from '../src/sim/types';

const C = { x: 10, y: 10 };
/** Side 0 deploys facing -y (src/art/iso.ts). */
const UP = { x: 0, y: -1 };

describe('flankSide: the sim\'s own front / side / rear split, with left and right', () => {
  it('front, left, right and rear of a group facing -y', () => {
    expect(flankSide(UP, C, { x: 10, y: 4 })).toBe('front');
    expect(flankSide(UP, C, { x: 4, y: 10 })).toBe('left');
    expect(flankSide(UP, C, { x: 16, y: 10 })).toBe('right');
    expect(flankSide(UP, C, { x: 10, y: 16 })).toBe('rear');
  });

  it('uses the sim thresholds: dot > 0.45 front, < -0.35 rear', () => {
    // 60 degrees off the facing: dot 0.5, still front
    expect(flankSide(UP, C, { x: 10 + Math.sin(Math.PI / 3), y: 10 - Math.cos(Math.PI / 3) })).toBe('front');
    // 70 degrees: dot 0.34, a side blow
    expect(flankSide(UP, C, { x: 10 + Math.sin((70 * Math.PI) / 180), y: 10 - Math.cos((70 * Math.PI) / 180) })).toBe('right');
    // 115 degrees: dot -0.42, the rear
    expect(flankSide(UP, C, { x: 10 - Math.sin((115 * Math.PI) / 180), y: 10 - Math.cos((115 * Math.PI) / 180) })).toBe('rear');
  });

  it('turns with the facing (a group facing +x has its left at -y)', () => {
    expect(flankSide({ x: 1, y: 0 }, C, { x: 10, y: 4 })).toBe('left');
    expect(flankSide({ x: 1, y: 0 }, C, { x: 10, y: 16 })).toBe('right');
  });
});

/** Screen-space unit vector of the field direction from C toward p. */
function screenDir(p: { x: number; y: number }): { x: number; y: number } {
  const d = isoDir(p.x - C.x, p.y - C.y);
  const l = Math.hypot(d.x, d.y);
  return { x: d.x / l, y: d.y / l };
}

describe('flankArc: drawn on the side the blow comes from, around the badge', () => {
  const cases: [string, { x: number; y: number }][] = [
    ['front', { x: 10, y: 4 }],
    ['left', { x: 4, y: 10 }],
    ['right', { x: 16, y: 10 }],
    ['rear', { x: 10, y: 16 }],
  ];
  for (const [side, from] of cases) {
    it(`a ${side} attack: every arc point lies toward the attacker on screen, within +-60 degrees`, () => {
      const a = flankArc(UP, C, from, false);
      expect(a.side).toBe(side);
      expect(a.dashed).toBe(false);
      const want = screenDir(from);
      const pts = arcPath(a, 0, 0, 20, 12, 9);
      expect(pts.length).toBe(9);
      for (const p of pts) {
        const l = Math.hypot(p.x / 20, p.y / 12);
        // the point's (ellipse-normalised) direction is on the attacker's side
        expect((p.x / 20) * want.x + (p.y / 12) * want.y).toBeGreaterThan(Math.cos(ARC_HALF) * l - 1e-9);
      }
      // the arc's middle points straight at the attacker
      const mid = pts[4];
      const ml = Math.hypot(mid.x / 20, mid.y / 12);
      expect((mid.x / 20) * want.x + (mid.y / 12) * want.y).toBeCloseTo(ml, 6);
    });
  }

  it('the arc for the opposite side is on the opposite side', () => {
    const l = arcPath(flankArc(UP, C, { x: 4, y: 10 }, false), 0, 0, 20, 12, 5)[2];
    const r = arcPath(flankArc(UP, C, { x: 16, y: 10 }, false), 0, 0, 20, 12, 5)[2];
    expect(Math.sign(l.x)).toBe(-Math.sign(r.x));
    expect(Math.sign(l.y)).toBe(-Math.sign(r.y));
  });

  it('chevrons point in at the badge (shape, not only colour)', () => {
    const a = flankArc(UP, C, { x: 4, y: 10 }, false);
    const ch = arcChevrons(a, 0, 0, 20, 12, 2);
    expect(ch.length).toBe(2);
    for (const { tip, l, r } of ch) {
      const d = (p: { x: number; y: number }) => Math.hypot(p.x / 20, p.y / 12);
      expect(d(tip)).toBeLessThan(d(l));
      expect(d(tip)).toBeLessThan(d(r));
    }
  });

  it('a threat arc is dashed and has no chevrons', () => {
    const a = flankArc(UP, C, { x: 4, y: 10 }, true);
    expect(a.dashed).toBe(true);
    expect(arcChevrons(a, 0, 0, 20, 12, 2)).toEqual([]);
  });
});

describe('FlankWatch: the red arc lasts FLANK_ARC_S of battle time and refreshes', () => {
  it('shows for 2 s after the event, then goes', () => {
    const w = new FlankWatch();
    w.flanked(3, 10, { x: 1, y: 2 });
    expect(w.solid(3, 10)).toEqual({ x: 1, y: 2 });
    expect(w.solid(3, 10 + FLANK_ARC_S - 0.05)).not.toBeNull();
    expect(w.solid(3, 10 + FLANK_ARC_S)).toBeNull();
    expect(w.solid(4, 10)).toBeNull();
  });

  it('a second event refreshes the arc rather than stacking', () => {
    const w = new FlankWatch();
    w.flanked(3, 10, { x: 1, y: 2 });
    w.flanked(3, 11, { x: 5, y: 6 });
    expect(w.solid(3, 12.5)).toEqual({ x: 5, y: 6 });
  });
});

// ---- the dashed threat before contact (N15)

function unit(id: number, side: 0 | 1, group: number, x: number, y: number, vx = 0, vy = 0): SimUnit {
  return { id, side, group, x, y, vx, vy, fx: side === 0 ? 0 : 0, fy: side === 0 ? -1 : 1, state: 'ready', engaged: false } as SimUnit;
}
function group(id: number, side: 0 | 1, fx: number, fy: number, extra: Partial<SimGroup> = {}): SimGroup {
  return { id, side, routed: false, disbanded: false, individual: false, formation: { type: 'line', cx: 0, cy: 0, fx, fy, frontage: 4 }, ...extra } as SimGroup;
}
function sim(groups: SimGroup[], units: SimUnit[]): ThreatSim {
  return {
    groups,
    activeMembers: (gid) => units.filter((u) => u.group === gid && u.state === 'ready'),
  };
}

describe('flankThreats: an enemy group heading into our flank or rear within 8 paces', () => {
  const ours = [unit(0, 0, 0, 9, 10), unit(1, 0, 0, 11, 10)];

  it('an enemy closing on the left flank is a threat; the same enemy walking away is not', () => {
    const closing = sim([group(0, 0, 0, -1), group(1, 1, 1, 0)], [...ours, unit(2, 1, 1, 4, 10, 1, 0), unit(3, 1, 1, 4, 11, 1, 0)]);
    const t = flankThreats(closing, 0);
    expect(t.length).toBe(1);
    expect(flankSide(UP, { x: 10, y: 10 }, t[0])).toBe('left');
    const leaving = sim([group(0, 0, 0, -1), group(1, 1, -1, 0)], [...ours, unit(2, 1, 1, 4, 10, -1, 0), unit(3, 1, 1, 4, 11, -1, 0)]);
    expect(flankThreats(leaving, 0)).toEqual([]);
  });

  it('an enemy in front is no flank threat', () => {
    const s = sim([group(0, 0, 0, -1), group(1, 1, 0, 1)], [...ours, unit(2, 1, 1, 10, 5, 0, 1)]);
    expect(flankThreats(s, 0)).toEqual([]);
  });

  it(`farther than ${THREAT_PACES} paces is no threat yet`, () => {
    const s = sim([group(0, 0, 0, -1), group(1, 1, 1, 0)], [...ours, unit(2, 1, 1, 10 - THREAT_PACES - 1.5, 10, 1, 0)]);
    expect(flankThreats(s, 0)).toEqual([]);
  });

  it('an orb has no flanks; a routed group shows no threat', () => {
    const units = [...ours, unit(2, 1, 1, 15, 10, -1, 0)];
    expect(flankThreats(sim([group(0, 0, 0, -1, { formation: { type: 'orb', cx: 10, cy: 10, fx: 0, fy: -1, frontage: 4 } }), group(1, 1, -1, 0)], units), 0)).toEqual([]);
    expect(flankThreats(sim([group(0, 0, 0, -1, { routed: true }), group(1, 1, -1, 0)], units), 0)).toEqual([]);
    expect(flankThreats(sim([group(0, 0, 0, -1), group(1, 1, -1, 0)], units), 0).length).toBe(1);
  });

  it('a group already in melee with us is past "before contact"', () => {
    const e = unit(2, 1, 1, 12, 10, -1, 0);
    e.engaged = true;
    expect(flankThreats(sim([group(0, 0, 0, -1), group(1, 1, -1, 0)], [...ours, e]), 0)).toEqual([]);
  });
});
