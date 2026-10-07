/**
 * Online mode rules shared by the client and the Worker (pure TS: no Phaser,
 * DOM, clocks or Math.random). The server is the authority; the client uses
 * the same numbers only to display predictions.
 *
 * The world itself (hand-authored region maps) lives in ./world.ts.
 */
import { Rng, hashString } from '../sim/rng';
import type { FormationType } from '../sim/formation';
import { makeHero, starterParty, type Archetype, type IdSource } from '../game/heroes';
import type { Hero } from '../data/units';
import type { Culture } from '../data/names';
import type { RegionInfo, WorldGraph } from './world';

// ------------------------------------------------------------------ economy

export interface Resources {
  gold: number;
  food: number;
  wood: number;
  bronze: number;
  recruits: number;
}
export const RESOURCE_KEYS: (keyof Resources)[] = ['gold', 'food', 'wood', 'bronze', 'recruits'];

const R = (gold = 0, food = 0, wood = 0, bronze = 0, recruits = 0): Resources => ({ gold, food, wood, bronze, recruits });

/** Hourly yield of a held plot by its ground: fields feed, forests give wood, hills bronze, scrub and coast a little of everything. */
export const PLOT_INCOME: Record<RegionInfo['site']['base'], Resources> = {
  plain: R(2, 6),
  forest: R(1, 1, 6),
  hills: R(2, 0, 1, 4),
  scrub: R(3, 2, 1, 1),
  beach: R(4, 3),
};
/** What the other kinds of region pay (forts and capitals on top of their ground). */
export const KIND_INCOME: Record<Exclude<RegionInfo['kind'], 'plot'>, Resources> = {
  town: R(12, 2, 0, 0, 0.3),
  fort: R(8, 2, 2, 2, 0.1),
  capital: R(35, 10, 5, 5, 0.6),
  post: R(8, 1, 0, 1),
  lair: R(4, 0, 0, 3),
  sea: R(),
};

/** Season ranking points per held region. */
export const SCORE = { region: 1, town: 3, fort: 10, capital: 100 } as const;

export function regionScore(r: Pick<RegionInfo, 'kind'>): number {
  return r.kind === 'capital' ? SCORE.capital : r.kind === 'fort' ? SCORE.fort : r.kind === 'town' ? SCORE.town : SCORE.region;
}

export const ONLINE_RULES = {
  /** Income piles up for at most this many hours before it must be collected. */
  incomeCapHours: 24,
  /** +10% per adjacent region held by the same clan (or the same player), at most +50%. */
  adjacencyBonus: 0.1,
  adjacencyBonusMax: 0.5,
  start: R(120, 40, 20, 10, 2),
  recruitCost: R(40, 10, 0, 0, 1),
  maxArmy: 20,
  maxGarrison: 12,
  /** Energy: marches and attacks spend it, it refills over time. */
  energyMax: 100,
  energyPerHour: 12,
  /** Energy per route a march crosses. */
  energyPerStep: 2,
  energyPerAttack: 10,
  /** Routes (hops) visible around your territory, your clan's and your army. */
  sight: 2,
  /** New homes keep this many routes from anyone else's land (when a spawn plot allows it). */
  homeSpacing: 2,
  /** Most routes one march may cross. */
  maxMarch: 12,
  /** Players per shard (fewer when the map has fewer spawn plots). */
  shardCapacity: 150,
  seasonDays: 90,
  /** An attack ticket must be submitted within this time. */
  ticketTtlMs: 10 * 60_000,
  /** After an abandoned, expired, rejected or lost attack the same region cannot be attacked again by that player for a while. */
  reattackCooldownMs: 3 * 60_000,
  /** Knocked-out heroes rest for this long (real time) before they can fight again. */
  woundMs: 2 * 60 * 60_000,
  /** NPC garrisons that took losses are re-raised after this long. */
  npcRefreshMs: 6 * 60 * 60_000,
  battleTimeLimit: 300,
  clanMaxMembers: 30,
  inviteTtlMs: 7 * 24 * 60 * 60_000,
  inviteMaxUses: 20,
};

/** Energy now, refilled lazily from the last stored value. */
export function energyAt(stored: number, storedAt: number, now: number): number {
  return Math.min(ONLINE_RULES.energyMax, stored + (Math.max(0, now - storedAt) / 3_600_000) * ONLINE_RULES.energyPerHour);
}

export function regionIncome(r: Pick<RegionInfo, 'kind' | 'site'>): Resources {
  if (r.kind === 'plot') return { ...PLOT_INCOME[r.site.base] };
  const base = r.kind === 'fort' || r.kind === 'capital' ? { ...PLOT_INCOME[r.site.base] } : R();
  const extra = KIND_INCOME[r.kind];
  for (const k of RESOURCE_KEYS) base[k] += extra[k];
  return base;
}

/** Regions next to `loc` that share its holder (clan, or the player when clanless). */
export function friendlyNeighbours(
  world: WorldGraph,
  loc: number,
  holderOf: (loc: number) => { ownerId: number | null; clanId: number | null } | undefined,
  owner: { ownerId: number | null; clanId: number | null },
): number {
  if (owner.ownerId === null) return 0;
  let n = 0;
  for (const d of world.neighbours(loc)) {
    const x = holderOf(d);
    if (!x || x.ownerId === null) continue;
    if (owner.clanId !== null ? x.clanId === owner.clanId : x.ownerId === owner.ownerId) n++;
  }
  return n;
}

export function adjacencyBonus(friendly: number): number {
  return Math.min(ONLINE_RULES.adjacencyBonusMax, friendly * ONLINE_RULES.adjacencyBonus);
}

/**
 * Income accrued since `accruedAt` (ms, server time) by a region, with the
 * adjacency bonus, capped at incomeCapHours. Whole numbers except recruits.
 */
export function accruedIncome(rate: Resources, accruedAt: number, now: number, bonus: number): Resources {
  const hours = Math.max(0, Math.min(ONLINE_RULES.incomeCapHours, (now - accruedAt) / 3_600_000));
  const k = hours * (1 + bonus);
  const out = R();
  for (const key of RESOURCE_KEYS) out[key] = key === 'recruits' ? Math.floor(rate[key] * k * 100) / 100 : Math.floor(rate[key] * k);
  return out;
}

export function addResources(a: Resources, b: Resources): Resources {
  const out = R();
  for (const k of RESOURCE_KEYS) out[k] = Math.round((a[k] + b[k]) * 100) / 100;
  return out;
}

// ------------------------------------------------------------------ clans

export type ClanRole = 'leader' | 'officer' | 'member';
export const CLAN_ROLES: ClanRole[] = ['leader', 'officer', 'member'];
const RANK: Record<ClanRole, number> = { leader: 3, officer: 2, member: 1 };

export function canInvite(role: ClanRole): boolean {
  return role === 'leader' || role === 'officer';
}

/** Leader and officers kick; only someone of strictly lower rank (officers kick members only). */
export function canKick(actor: ClanRole, target: ClanRole): boolean {
  return canInvite(actor) && RANK[actor] > RANK[target];
}

/** Only the leader promotes/demotes (and may hand over leadership). */
export function canPromote(actor: ClanRole, target: ClanRole, to: ClanRole): boolean {
  return actor === 'leader' && target !== 'leader' && to !== target;
}

export const CLAN_INVITE_PREFIX = 'clan_';

/** Telegram deep link that opens the Mini App with start_param clan_<code>. */
export function clanInviteLink(botUsername: string | null, code: string, appName = 'play', fallbackUrl = 'https://pixelarrow.app/'): string {
  if (botUsername) return `https://t.me/${botUsername}/${appName}?startapp=${CLAN_INVITE_PREFIX}${code}`;
  return `${fallbackUrl}?startapp=${CLAN_INVITE_PREFIX}${code}`;
}

/** The invite code inside a start_param / bot /start payload, or null. */
export function inviteCodeFrom(param: string | null | undefined): string | null {
  if (!param) return null;
  const m = /^clan_([A-Za-z0-9]{4,32})$/.exec(param.trim());
  return m ? m[1] : null;
}

// ------------------------------------------------------------------ armies

export const DEFAULT_FORMATIONS: FormationType[] = ['line', 'skirmish', 'line', 'column'];

export function scopeHero(h: Hero, prefix: string): Hero {
  h.id = `${prefix}${h.id}`;
  for (const it of Object.values(h.equip)) if (it) it.uid = `${prefix}${it.uid}`;
  return h;
}

/** A new online army: the campaign's starting three plus a slinger and a swordsman. */
export function starterOnlineArmy(seed: number, ids: IdSource, prefix: string): Hero[] {
  const rng = new Rng(seed >>> 0 || 1);
  const heroes = starterParty(rng, ids);
  heroes.push(makeHero(rng, ids, 'greek', 'swordsman', 1, 1, 0, heroes));
  heroes.push(makeHero(rng, ids, 'phoenician', 'slinger', 1, 1, 1, heroes));
  return heroes.map((h) => scopeHero(h, prefix));
}

export const RECRUIT_ARCHETYPES: Archetype[] = ['hoplite', 'swordsman', 'peltast', 'slinger', 'archer', 'axeman'];

export function recruitHero(seed: number, ids: IdSource, prefix: string, arch: Archetype, roster: readonly Hero[]): Hero {
  const rng = new Rng(seed >>> 0 || 1);
  const culture: Culture = arch === 'axeman' ? 'celtic' : arch === 'slinger' ? rng.pick(['phoenician', 'greek'] as const) : 'greek';
  const group = arch === 'peltast' || arch === 'slinger' || arch === 'archer' ? 1 : 0;
  return scopeHero(makeHero(rng, ids, culture, arch, 1, 1, group, roster), prefix);
}

/** A held region whose owner left no garrison is defended by a little militia. */
export function militia(shardSeed: number, region: Pick<RegionInfo, 'id' | 'tier'>, salt: number): Hero[] {
  const rng = new Rng((shardSeed ^ hashString(`${region.id}:militia`) ^ salt) >>> 0 || 1);
  const culture: Culture = (['greek', 'phoenician', 'celtic'] as const)[hashString(`${shardSeed}:${region.id}`) % 3];
  const ids: IdSource = { nextId: 1 };
  const heroes: Hero[] = [];
  for (let i = 0; i < Math.min(4, region.tier); i++) heroes.push(makeHero(rng, ids, culture, 'raw', 1, 1, i === 0 ? 0 : 1, heroes));
  return heroes.map((h) => scopeHero(h, `mil${region.id}_`));
}
