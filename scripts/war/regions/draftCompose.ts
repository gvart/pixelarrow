/**
 * W-52 composition over a raid-tuned draft (siren, delta): the draft template (./drafts.ts) builds the region as before
 * (its landmark, roads, chokes, hub, nodes and must-haves, which the landmark raids were tuned on, src/dev/landmarkBalance.ts),
 * then `compose` lays the region's set pieces over the land round them. Every cell the raids or the purpose depend on
 * is put back as the draft left it: the landmark site and a band round it, the raid's staging point and its way to the
 * site, the roads, the entries, the spots, the lairs and the claim points.
 */
import { byId } from './world.ts';
import { template } from './drafts.ts';
import type { Kit, Pt, RegionDef, Style } from './kit.ts';

export interface Keep {
  /** Raid staging (sim tiles, STAGING in src/dev/landmarkBalance.ts). */
  staging: Pt;
  /** Units kept round the landmark site (default 12). */
  siteBand?: number;
  /** Units kept each side of every road's centre line (default 3.5). */
  roadBand?: number;
}

export function composeOnDraft(id: string, keep: Keep, compose: (k: Kit) => void, style?: Partial<Style>): RegionDef {
  const w = byId.get(id);
  if (!w) throw new Error(`unknown region ${id}`);
  const d = template(w);
  return {
    id,
    style: { ...d.style, ...style },
    build(k: Kit) {
      d.build(k);
      const height = k.height.slice(), terrain = k.terrain.slice(), water = k.water.slice();
      compose(k);
      const st: Pt = [(keep.staging[0] + 0.5) / 2 - 0.5, (keep.staging[1] + 0.5) / 2 - 0.5];
      const sb = keep.siteBand ?? 12, rb = keep.roadBand ?? 3.5;
      const boxes = k.sites.map((s) => { const a = s.u(0, 0), b = s.u(s.w, s.h); return [a[0] - sb, a[1] - sb, b[0] + sb, b[1] + sb, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const; });
      const points: [Pt, number][] = [
        [st, 18],
        ...Object.values(k.spots).map((p): [Pt, number] => [p, 12]),
        ...k.lairReqs.map((l): [Pt, number] => [l.at, 10]),
        ...k.claimReqs.map((c): [Pt, number] => [c.at, 10]),
        ...k.sides.map((s): [Pt, number] => [k.entry(s.id, 10), 20]),
      ];
      // the staging point's way in: the segment to the nearest site's centre
      const seg = boxes.length ? (() => { const b = boxes.slice().sort((p, q) => Math.hypot(p[4] - st[0], p[5] - st[1]) - Math.hypot(q[4] - st[0], q[5] - st[1]))[0]; return [st, [b[4], b[5]] as Pt] as const; })() : null;
      const nearSeg = (x: number, y: number) => {
        if (!seg) return false;
        const [a, b] = seg, ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / l2));
        return Math.hypot(x - a[0] - t * ex, y - a[1] - t * ey) < 12;
      };
      k.each((i, x, y) => {
        const kept = k.roadDist[i] < rb || boxes.some((b) => x >= b[0] && y >= b[1] && x <= b[2] && y <= b[3]) || points.some(([p, r]) => Math.hypot(x - p[0], y - p[1]) < r) || nearSeg(x, y);
        if (kept) { k.height[i] = height[i]; k.terrain[i] = terrain[i]; k.water[i] = water[i]; }
      });
    },
  };
}
