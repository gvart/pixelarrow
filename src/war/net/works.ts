/**
 * W-61 alliance works (docs/WAR.md "Alliance works"): big shared projects each alliance raises once a season at fixed
 * sites of its home region. Its players feed one from their home strongrooms (goods) and with their men standing at
 * the site (labour, man-hours: any man of the alliance there works it). With every good in and the labour done the work
 * stands, and the whole alliance has its lasting bonus for the rest of the season. Shared by the server
 * (server/src/war/works.ts) and the HUD's works panel; the sites come from the region data (`workSite`).
 */
import type { RegionData } from '../types';
import { PEACE } from '../world/season';

export type WorkId = 'temple' | 'road' | 'beacons' | 'wonder';
export interface WorkBonus {
  /** repair cost share */ repairCost?: number; /** tiles of sight (towers twice) */ sight?: number; /** transfer time share */ travel?: number;
  /** E7: daily and weekly task rewards (src/war/net/tasks.ts) times this */ tasks?: number;
}
export interface WorkDef {
  id: WorkId; name: string; site: string; goods: Record<string, number>;
  /** Man-hours of labour at the site. */
  labour: number;
  bonus: WorkBonus; text: string;
}

export const WORKS: readonly WorkDef[] = [
  { id: 'temple', name: 'Temple at the shrine', site: 'the home temple or shrine', goods: { stone: 600, marble: 120, coin: 300 }, labour: 24, bonus: { repairCost: 0.6 }, text: 'Repairs cost 40% less' },
  { id: 'road', name: 'Road and bridge', site: 'the road out of the home region', goods: { stone: 400, wood: 500 }, labour: 20, bonus: { travel: 0.85 }, text: 'Transfers 15% faster' },
  { id: 'beacons', name: 'Beacon line', site: 'the home heights', goods: { wood: 300, stone: 200, pitch: 60 }, labour: 12, bonus: { sight: 2 }, text: 'Men see 2 tiles further, towers 4' },
];
export const workDef = (id: string): WorkDef | undefined => WORKS.find((w) => w.id === id);

/**
 * W-62 E7 alliance projects: the works' top tier, one great wonder per alliance and season, raised in big stages (each
 * stage its goods and labour like a work, the next opening when one is done). Every stage done gives the whole alliance
 * its perk for the rest of the season and scores its `score` (peace, works kind). Stands at the home town's heart.
 */
export interface WorkStage { name: string; goods: Record<string, number>; labour: number; bonus: WorkBonus; score: number; text: string }
export const WONDER = {
  id: 'wonder' as const, name: 'Hall of the Twelve', site: 'the heart of the home town',
  text: 'The alliance\'s great wonder, raised in three stages by many hands',
  stages: [
    { name: 'Foundations', goods: { stone: 2000, wood: 1500, coin: 600 }, labour: 60, bonus: { travel: 0.95 }, score: 40, text: 'Transfers 5% faster' },
    { name: 'Colonnade', goods: { marble: 600, stone: 1200, bronze: 200 }, labour: 90, bonus: { sight: 1 }, score: 60, text: 'Men see 1 tile further, towers 2' },
    { name: 'Gilded roof', goods: { marble: 300, silver: 120, pitch: 200, coin: 1500 }, labour: 120, bonus: { repairCost: 0.85, tasks: 1.5 }, score: 100, text: 'Repairs 15% cheaper, task rewards +50%' },
  ] as readonly WorkStage[],
};
/** Every work as stages (a plain work is one stage; its score the peace score's `work`); undefined: no such work. */
export function stagesOf(id: string): readonly WorkStage[] | undefined {
  if (id === WONDER.id) return WONDER.stages;
  const w = workDef(id);
  return w ? [{ name: w.name, goods: w.goods, labour: w.labour, bonus: w.bonus, score: PEACE.work, text: w.text }] : undefined;
}
/** The perks of `done` stages of each work, folded: shares multiply, sight adds. */
export function foldBonus(done: Iterable<[id: string, stages: number]>): WorkBonus {
  const out: WorkBonus = {};
  for (const [id, n] of done)
    for (const s of (stagesOf(id) ?? []).slice(0, n)) {
      const b = s.bonus;
      if (b.repairCost !== undefined) out.repairCost = (out.repairCost ?? 1) * b.repairCost;
      if (b.travel !== undefined) out.travel = (out.travel ?? 1) * b.travel;
      if (b.tasks !== undefined) out.tasks = (out.tasks ?? 1) * b.tasks;
      if (b.sight !== undefined) out.sight = (out.sight ?? 0) + b.sight;
    }
  return out;
}
/** Men within this many tiles of a work's site labour on it. */
export const WORK_R = 10;
/** Most labour one man gives a second (1: a man-second each second). */
export const LABOUR_EVERY = 100; // ticks between labour counts (10 s)

/**
 * Where work `id` stands in region `r` (fixed by the region data): the temple at its first temple or shrine; the road
 * where the way out by its entry nearest the world's centre meets the region (16 tiles in); the beacons on the highest
 * ground near the centre. Falls back to the centre.
 */
export function workSite(id: WorkId, r: Pick<RegionData, 'w' | 'h' | 'height' | 'entries' | 'prebuilt'>, quadrant?: string): { x: number; y: number } {
  const cx = r.w / 2, cy = r.h / 2;
  if (id === 'wonder') {
    // the town's heart: a stoa or statue of the home's prebuilt town, else beside the temple, else the centre
    const p = (r.prebuilt ?? []).find((q) => q.type === 'stoa') ?? (r.prebuilt ?? []).find((q) => q.type === 'statue');
    if (p) return { x: p.x, y: p.y };
    const t = workSite('temple', r, quadrant);
    return { x: Math.min(r.w - 1, t.x + 12), y: t.y };
  }
  if (id === 'temple') {
    const t = (r.prebuilt ?? []).find((p) => p.type === 'temple') ?? (r.prebuilt ?? []).find((p) => p.type === 'shrine');
    return t ? { x: t.x, y: t.y } : { x: cx, y: cy };
  }
  if (id === 'road') {
    // the world's centre lies to the east of a western home and to the south of a northern one
    const want = quadrant === 'NW' ? 'E' : quadrant === 'NE' ? 'W' : quadrant === 'SE' ? 'W' : quadrant === 'SW' ? 'E' : 'E';
    const e = (r.entries ?? []).find((x) => x.side === want) ?? (r.entries ?? [])[0];
    if (!e) return { x: cx, y: cy };
    const dx = cx - e.x, dy = cy - e.y, d = Math.hypot(dx, dy) || 1;
    return { x: Math.round(e.x + (dx / d) * 16), y: Math.round(e.y + (dy / d) * 16) };
  }
  let best = { x: cx, y: cy }, bh = -1;
  const R = Math.min(64, Math.floor(Math.min(r.w, r.h) / 3));
  for (let y = Math.max(0, cy - R); y < Math.min(r.h, cy + R); y += 8)
    for (let x = Math.max(0, cx - R); x < Math.min(r.w, cx + R); x += 8) {
      const v = r.height[Math.floor(y) * r.w + Math.floor(x)] ?? 0;
      if (v > bh) (bh = v), (best = { x, y });
    }
  return best;
}

/** One alliance's work as the panel shows it. */
export interface WorkView {
  id: WorkId; name: string; text: string; region: string; x: number; y: number;
  goods: Record<string, number>; need: Record<string, number>; labour: number; needLabour: number; done: boolean;
  /** Contributors, most first: player name, goods given (sum of units), labour (man-hours). */
  by: { pid: number; name: string; goods: number; labour: number }[];
  /** E7 the wonder: stages done, and each stage (its needs, perk and whether it stands); goods, need and labour above are the current stage's. */
  stage?: number;
  stages?: { name: string; text: string; need: Record<string, number>; needLabour: number; done: boolean }[];
}
