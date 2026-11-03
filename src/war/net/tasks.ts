/**
 * W-62 E7 daily and weekly tasks (server-posted; player contracts are server/src/war/contracts.ts). Each player has
 * TASKS.daily tasks a UTC day (reset 00:00 UTC) and TASKS.weekly a week (reset Monday 00:00 UTC), drawn from the pools
 * below deterministically by (season, period, player id): the same player sees the same tasks on every device and
 * after every restart. Progress is a tally of what the server already sees (server/src/war/tasks.ts `tallyStmt`): men
 * carrying wood or stone home, goods stowed in, fights won, foes struck down, souls claimed, caravans in, guard hours,
 * labour, goods given to works, coin sold to another alliance, contracts filled, and the wild a player can face alone
 * (W-73 solo loop: chiefs slain, hidden quests finished, encounters seen through, lairs cleared). A task done is claimed for its reward
 * (coin and goods into the home strongroom); one free reroll a day.
 * Shared by the server and the HUD's Tasks panel (src/war/view/hud/tasks.ts).
 */
import { hashString, Rng } from '../../sim/rng';
import type { PathId } from '../world/start';

/** What the server counts per player and UTC day (war_task_tally.metric). Seconds for guard and labour. */
export type TaskMetric = 'gatherWood' | 'gatherStone' | 'deliver' | 'wins' | 'kills' | 'soul' | 'caravan' | 'guard' | 'labour' | 'workGoods' | 'sellAlliance' | 'contract' | 'chief' | 'secret' | 'encounter' | 'lair' | 'built' | 'townSale';
export const TASK_METRICS: readonly TaskMetric[] = ['gatherWood', 'gatherStone', 'deliver', 'wins', 'kills', 'soul', 'caravan', 'guard', 'labour', 'workGoods', 'sellAlliance', 'contract', 'chief', 'secret', 'encounter', 'lair', 'built', 'townSale'];
/**
 * W-172 what each path draws: only work his path does. Fighting (wins, kills, chiefs, lairs, guard, souls, the wild's fights)
 * is for a warrior; a builder raises and works; a trader carries and sells. Everyone may gather and fill a store.
 */
export const PATH_TASKS: Record<PathId, readonly TaskMetric[]> = {
  warrior: ['wins', 'kills', 'soul', 'chief', 'lair', 'secret', 'encounter', 'guard', 'contract', 'gatherWood', 'gatherStone', 'deliver'],
  builder: ['built', 'labour', 'workGoods', 'contract', 'gatherWood', 'gatherStone', 'deliver'],
  trader: ['townSale', 'caravan', 'sellAlliance', 'contract', 'gatherWood', 'gatherStone', 'deliver'],
};
export type TaskKind = 'daily' | 'weekly';

export interface TaskDef {
  id: string; metric: TaskMetric; title: string; hint: string;
  /** The tally needed (seconds for guard and labour). */
  n: number;
  /** Shown as n / per with this unit (hours: 3600, 'h'). */
  per?: number; unit?: string;
  reward: Record<string, number>;
  /** W-73: needs another player (a buyer abroad, a contract's poster): drawn only while the player has partners. */
  partner?: true;
}

const H = 3600;
export const DAILY: readonly TaskDef[] = [
  { id: 'd-wood', metric: 'gatherWood', title: 'Fell timber', hint: 'Your men carry 60 wood home to a store', n: 60, reward: { coin: 25 } },
  { id: 'd-stone', metric: 'gatherStone', title: 'Work the quarry', hint: 'Your men carry 40 stone home to a store', n: 40, reward: { coin: 25 } },
  { id: 'd-deliver', metric: 'deliver', title: 'Fill the stores', hint: 'Stow 50 goods into a warehouse, stall or strongroom', n: 50, reward: { coin: 20 } },
  { id: 'd-wins', metric: 'wins', title: 'Carry the field', hint: 'Win 2 fights: your men walk off, the foe does not', n: 2, reward: { coin: 30 } },
  { id: 'd-kills', metric: 'kills', title: 'Thin their ranks', hint: 'Your men strike down 8 foes', n: 8, reward: { coin: 30 } },
  { id: 'd-soul', metric: 'soul', title: 'Call a soul', hint: 'Claim a soul at a shrine, ruin, battlefield or lair', n: 1, reward: { coin: 20, food: 10 } },
  { id: 'd-caravan', metric: 'caravan', title: 'Bring a caravan in', hint: 'Arrive in a region with goods on your men or carts', n: 1, reward: { coin: 35 } },
  { id: 'd-guard', metric: 'guard', title: 'Stand guard', hint: 'Hold a town for an hour under a guard contract', n: H, per: H, unit: 'h', reward: { coin: 35 }, partner: true },
  { id: 'd-labour', metric: 'labour', title: 'Lend your hands', hint: 'An hour of labour at a work or a build contract', n: H, per: H, unit: 'h', reward: { coin: 25 } },
  { id: 'd-work', metric: 'workGoods', title: 'Feed the works', hint: 'Give 40 goods to an alliance work', n: 40, reward: { coin: 20 } },
  { id: 'd-sell', metric: 'sellAlliance', title: 'Trade abroad', hint: 'Sell 150 coin of goods to another alliance', n: 150, reward: { coin: 20 }, partner: true },
  { id: 'd-chief', metric: 'chief', title: 'Bring down a chief', hint: 'Your men slay a named chief of the wild', n: 1, reward: { coin: 35 } },
  { id: 'd-secret', metric: 'secret', title: 'Follow a hidden trail', hint: 'Finish a hidden quest in a region', n: 1, reward: { coin: 30 } },
  { id: 'd-encounter', metric: 'encounter', title: 'Answer the road', hint: 'See a random encounter through to its end', n: 1, reward: { coin: 25 } },
  { id: 'd-lair', metric: 'lair', title: 'Clear the roads', hint: 'Your men clear 2 lairs', n: 2, reward: { coin: 30 } },
  { id: 'd-built', metric: 'built', title: 'Raise a roof', hint: 'Finish a building of your own', n: 1, reward: { coin: 30 } },
  { id: 'd-town', metric: 'townSale', title: 'Sell it far from home', hint: 'Sell 100 coin of carried goods to a town beyond their land', n: 100, reward: { coin: 30 } },
  { id: 'd-contract', metric: 'contract', title: 'Keep your word', hint: 'Fill a contract (carry, supply, escort, build, guard)', n: 1, reward: { coin: 30 }, partner: true },
];
export const WEEKLY: readonly TaskDef[] = [
  { id: 'w-wood', metric: 'gatherWood', title: 'The great felling', hint: 'Your men carry 600 wood home to a store', n: 600, reward: { coin: 150, marble: 10 } },
  { id: 'w-wins', metric: 'wins', title: 'A season of victories', hint: 'Win 10 fights', n: 10, reward: { coin: 200 } },
  { id: 'w-caravan', metric: 'caravan', title: 'Merchant roads', hint: 'Bring 4 caravans in', n: 4, reward: { coin: 200 } },
  { id: 'w-sell', metric: 'sellAlliance', title: 'Silver from abroad', hint: 'Sell 1500 coin of goods to other alliances', n: 1500, reward: { coin: 150, silver: 5 }, partner: true },
  { id: 'w-guard', metric: 'guard', title: 'The long watch', hint: 'Hold towns for 6 hours under guard contracts', n: 6 * H, per: H, unit: 'h', reward: { coin: 220 }, partner: true },
  { id: 'w-work', metric: 'workGoods', title: 'Pillar of the alliance', hint: 'Give 400 goods to alliance works', n: 400, reward: { coin: 150 } },
  { id: 'w-souls', metric: 'soul', title: 'Gather the shades', hint: 'Claim 5 souls', n: 5, reward: { coin: 120, food: 40 } },
  { id: 'w-chiefs', metric: 'chief', title: 'Chief-breaker', hint: 'Your men slay 4 named chiefs', n: 4, reward: { coin: 200 } },
  { id: 'w-secrets', metric: 'secret', title: 'Keeper of secrets', hint: 'Finish 3 hidden quests', n: 3, reward: { coin: 160 } },
  { id: 'w-lairs', metric: 'lair', title: 'Warden of the roads', hint: 'Your men clear 12 lairs', n: 12, reward: { coin: 180 } },
  { id: 'w-built', metric: 'built', title: 'A town of your making', hint: 'Finish 5 buildings of your own', n: 5, reward: { coin: 180 } },
  { id: 'w-town', metric: 'townSale', title: 'A name on every road', hint: 'Sell 1000 coin of carried goods to towns beyond their land', n: 1000, reward: { coin: 180 } },
  { id: 'w-contract', metric: 'contract', title: 'A trusted name', hint: 'Fill 5 contracts', n: 5, reward: { coin: 200 }, partner: true },
];
export const taskDef = (id: string): TaskDef | undefined => DAILY.find((t) => t.id === id) ?? WEEKLY.find((t) => t.id === id);
const pool = (k: TaskKind) => (k === 'daily' ? DAILY : WEEKLY);

/** Tasks a period; free rerolls a UTC day. */
export const TASKS = { daily: 3, weekly: 2, rerolls: 1 } as const;
/**
 * W-73 partners: a player has a realistic partner for the partner tasks (`partner`) while at least `min` other members
 * of his alliance did anything the tally counts in the last `days` UTC days (today included); else he draws solo.
 */
export const PARTNERS = { min: 2, days: 3 } as const;

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

/** The period's pool in this player's order (deterministic by season, period and player); solo: no partner tasks; `path`: W-172 his path's work (none: all, a dev player). */
export function taskOrder(season: number, p: Pick<TaskPeriod, 'kind' | 'key'>, pid: number, solo = false, path: PathId | null = null): TaskDef[] {
  return new Rng(hashString(`tasks:${season}:${p.key}:${pid}`)).shuffle([...pool(p.kind)]).filter((t) => !(solo && t.partner) && (!path || PATH_TASKS[path].includes(t.metric)));
}

/** The period's tasks: the first of the order with no metric twice (solo: W-73, no partner tasks). */
export function drawTasks(season: number, p: Pick<TaskPeriod, 'kind' | 'key'>, pid: number, solo = false, path: PathId | null = null): TaskDef[] {
  const n = p.kind === 'daily' ? TASKS.daily : TASKS.weekly, out: TaskDef[] = [];
  for (const t of taskOrder(season, p, pid, solo, path)) if (out.length < n && !out.some((x) => x.metric === t.metric)) out.push(t);
  return out;
}

/** A reroll of the task `old` among `held`: the next of the order neither held nor sharing a metric with the others. */
export function rerollTask(season: number, p: Pick<TaskPeriod, 'kind' | 'key'>, pid: number, held: readonly string[], old: string, solo = false, path: PathId | null = null): TaskDef | null {
  const others = held.filter((id) => id !== old).map((id) => taskDef(id)?.metric);
  return taskOrder(season, p, pid, solo, path).find((t) => t.id !== old && !held.includes(t.id) && !others.includes(t.metric)) ?? null;
}

/** One task as the panel shows it. */
export interface TaskView {
  kind: TaskKind; slot: number; id: string; title: string; hint: string; metric: TaskMetric;
  have: number; need: number; per: number; unit: string;
  reward: Record<string, number>;
  claimed: boolean; ends: number;
}
/** The panel's whole answer. */
export interface TasksView { tasks: TaskView[]; rerolls: number; boost: number; now: number }
