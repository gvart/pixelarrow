/**
 * W-62 E7 daily and weekly tasks (server-posted; player contracts are server/src/war/contracts.ts). Each player has
 * TASKS.daily tasks a UTC day (reset 00:00 UTC) and TASKS.weekly a week (reset Monday 00:00 UTC), drawn from the pools
 * below deterministically by (season, period, player id): the same player sees the same tasks on every device and
 * after every restart. Progress is a tally of what the server already sees (server/src/war/tasks.ts `tallyStmt`): men
 * carrying wood or stone home, goods stowed in, fights won, foes struck down, souls claimed, caravans in, guard hours,
 * labour, goods given to works, coin sold to another alliance, contracts filled. A task done is claimed for its reward
 * (coin and goods into the home strongroom) and score (peace or war, capped a day per alliance); one free reroll a day.
 * Shared by the server and the HUD's Tasks panel (src/war/view/hud/tasks.ts).
 */
import { hashString, Rng } from '../../sim/rng';

/** What the server counts per player and UTC day (war_task_tally.metric). Seconds for guard and labour. */
export type TaskMetric = 'gatherWood' | 'gatherStone' | 'deliver' | 'wins' | 'kills' | 'soul' | 'caravan' | 'guard' | 'labour' | 'workGoods' | 'sellAlliance' | 'contract';
export const TASK_METRICS: readonly TaskMetric[] = ['gatherWood', 'gatherStone', 'deliver', 'wins', 'kills', 'soul', 'caravan', 'guard', 'labour', 'workGoods', 'sellAlliance', 'contract'];
export type TaskKind = 'daily' | 'weekly';
export type TaskScore = 'peace' | 'war';

export interface TaskDef {
  id: string; metric: TaskMetric; title: string; hint: string;
  /** The tally needed (seconds for guard and labour). */
  n: number;
  /** Shown as n / per with this unit (hours: 3600, 'h'). */
  per?: number; unit?: string;
  reward: Record<string, number>; score: TaskScore; pts: number;
}

const H = 3600;
export const DAILY: readonly TaskDef[] = [
  { id: 'd-wood', metric: 'gatherWood', title: 'Fell timber', hint: 'Your men carry 60 wood home to a store', n: 60, reward: { coin: 25 }, score: 'peace', pts: 2 },
  { id: 'd-stone', metric: 'gatherStone', title: 'Work the quarry', hint: 'Your men carry 40 stone home to a store', n: 40, reward: { coin: 25 }, score: 'peace', pts: 2 },
  { id: 'd-deliver', metric: 'deliver', title: 'Fill the stores', hint: 'Stow 50 goods into a warehouse, stall or strongroom', n: 50, reward: { coin: 20 }, score: 'peace', pts: 2 },
  { id: 'd-wins', metric: 'wins', title: 'Carry the field', hint: 'Win 2 fights: your men walk off, the foe does not', n: 2, reward: { coin: 30 }, score: 'war', pts: 3 },
  { id: 'd-kills', metric: 'kills', title: 'Thin their ranks', hint: 'Your men strike down 8 foes', n: 8, reward: { coin: 30 }, score: 'war', pts: 3 },
  { id: 'd-soul', metric: 'soul', title: 'Call a soul', hint: 'Claim a soul at a shrine, ruin, battlefield or lair', n: 1, reward: { coin: 20, food: 10 }, score: 'war', pts: 2 },
  { id: 'd-caravan', metric: 'caravan', title: 'Bring a caravan in', hint: 'Arrive in a region with goods on your men or carts', n: 1, reward: { coin: 35 }, score: 'peace', pts: 3 },
  { id: 'd-guard', metric: 'guard', title: 'Stand guard', hint: 'Hold a town for an hour under a guard contract', n: H, per: H, unit: 'h', reward: { coin: 35 }, score: 'war', pts: 3 },
  { id: 'd-labour', metric: 'labour', title: 'Lend your hands', hint: 'An hour of labour at a work or a build contract', n: H, per: H, unit: 'h', reward: { coin: 25 }, score: 'peace', pts: 2 },
  { id: 'd-work', metric: 'workGoods', title: 'Feed the works', hint: 'Give 40 goods to an alliance work', n: 40, reward: { coin: 20 }, score: 'peace', pts: 3 },
  { id: 'd-sell', metric: 'sellAlliance', title: 'Trade abroad', hint: 'Sell 150 coin of goods to another alliance', n: 150, reward: { coin: 20 }, score: 'peace', pts: 3 },
  { id: 'd-contract', metric: 'contract', title: 'Keep your word', hint: 'Fill a contract (carry, supply, escort, build, guard)', n: 1, reward: { coin: 30 }, score: 'peace', pts: 3 },
];
export const WEEKLY: readonly TaskDef[] = [
  { id: 'w-wood', metric: 'gatherWood', title: 'The great felling', hint: 'Your men carry 600 wood home to a store', n: 600, reward: { coin: 150, marble: 10 }, score: 'peace', pts: 8 },
  { id: 'w-wins', metric: 'wins', title: 'A season of victories', hint: 'Win 10 fights', n: 10, reward: { coin: 200 }, score: 'war', pts: 10 },
  { id: 'w-caravan', metric: 'caravan', title: 'Merchant roads', hint: 'Bring 4 caravans in', n: 4, reward: { coin: 200 }, score: 'peace', pts: 10 },
  { id: 'w-sell', metric: 'sellAlliance', title: 'Silver from abroad', hint: 'Sell 1500 coin of goods to other alliances', n: 1500, reward: { coin: 150, silver: 5 }, score: 'peace', pts: 10 },
  { id: 'w-guard', metric: 'guard', title: 'The long watch', hint: 'Hold towns for 6 hours under guard contracts', n: 6 * H, per: H, unit: 'h', reward: { coin: 220 }, score: 'war', pts: 10 },
  { id: 'w-work', metric: 'workGoods', title: 'Pillar of the alliance', hint: 'Give 400 goods to alliance works', n: 400, reward: { coin: 150 }, score: 'peace', pts: 10 },
  { id: 'w-souls', metric: 'soul', title: 'Gather the shades', hint: 'Claim 5 souls', n: 5, reward: { coin: 120, food: 40 }, score: 'war', pts: 8 },
  { id: 'w-contract', metric: 'contract', title: 'A trusted name', hint: 'Fill 5 contracts', n: 5, reward: { coin: 200 }, score: 'peace', pts: 10 },
];
export const taskDef = (id: string): TaskDef | undefined => DAILY.find((t) => t.id === id) ?? WEEKLY.find((t) => t.id === id);
const pool = (k: TaskKind) => (k === 'daily' ? DAILY : WEEKLY);

/** Tasks a period; free rerolls a UTC day; score a task may add per alliance and UTC day (peace kind 'tasks', war 'feats'). */
export const TASKS = { daily: 3, weekly: 2, rerolls: 1, peaceCap: 24, warCap: 24 } as const;

export const DAY_MS = 86_400_000;
/** The UTC day number of `now`. */
export const dayOf = (now: number) => Math.floor(now / DAY_MS);
/** The ISO week (Monday start) of UTC day `day`: day 0 (1970-01-01) was a Thursday. */
export const weekOf = (day: number) => Math.floor((day + 3) / 7);
/** The first UTC day of week `w`. */
export const weekStart = (w: number) => w * 7 - 3;

/** A period: its key in war_tasks, its days [from, to) and when it ends (ms). */
export interface TaskPeriod { kind: TaskKind; key: string; from: number; to: number; ends: number }
export function periodOf(kind: TaskKind, now: number): TaskPeriod {
  const d = dayOf(now);
  if (kind === 'daily') return { kind, key: `d${d}`, from: d, to: d + 1, ends: (d + 1) * DAY_MS };
  const w = weekOf(d), from = weekStart(w);
  return { kind, key: `w${w}`, from, to: from + 7, ends: (from + 7) * DAY_MS };
}

/** The period's pool in this player's order (deterministic by season, period and player). */
export function taskOrder(season: number, p: Pick<TaskPeriod, 'kind' | 'key'>, pid: number): TaskDef[] {
  return new Rng(hashString(`tasks:${season}:${p.key}:${pid}`)).shuffle([...pool(p.kind)]);
}

/** The period's tasks: the first of the order with no metric twice. */
export function drawTasks(season: number, p: Pick<TaskPeriod, 'kind' | 'key'>, pid: number): TaskDef[] {
  const n = p.kind === 'daily' ? TASKS.daily : TASKS.weekly, out: TaskDef[] = [];
  for (const t of taskOrder(season, p, pid)) if (out.length < n && !out.some((x) => x.metric === t.metric)) out.push(t);
  return out;
}

/** A reroll of the task `old` among `held`: the next of the order neither held nor sharing a metric with the others. */
export function rerollTask(season: number, p: Pick<TaskPeriod, 'kind' | 'key'>, pid: number, held: readonly string[], old: string): TaskDef | null {
  const others = held.filter((id) => id !== old).map((id) => taskDef(id)?.metric);
  return taskOrder(season, p, pid).find((t) => t.id !== old && !held.includes(t.id) && !others.includes(t.metric)) ?? null;
}

/** One task as the panel shows it. */
export interface TaskView {
  kind: TaskKind; slot: number; id: string; title: string; hint: string; metric: TaskMetric;
  have: number; need: number; per: number; unit: string;
  reward: Record<string, number>; score: TaskScore; pts: number;
  claimed: boolean; ends: number;
}
/** The panel's whole answer. */
export interface TasksView { tasks: TaskView[]; rerolls: number; boost: number; now: number }
