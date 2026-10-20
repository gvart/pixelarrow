/**
 * Online season rules shared by the client and the Worker (pure TS: no Phaser,
 * DOM, clocks or Math.random): the season profile's purse, energy and army,
 * clans, and the duels' formations. The server is the authority.
 */
import { Rng } from '../sim/rng';
import type { FormationType } from '../sim/formation';
import { makeHero, starterParty, type Archetype, type IdSource } from '../game/heroes';
import type { Hero } from '../data/units';
import type { Culture } from '../data/names';

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

export const ONLINE_RULES = {
  start: R(120, 40, 20, 10, 2),
  recruitCost: R(40, 10, 0, 0, 1),
  maxArmy: 20,
  /** Energy refills over time. */
  energyMax: 100,
  energyPerHour: 12,
  seasonDays: 90,
  battleTimeLimit: 300,
  clanMaxMembers: 30,
  inviteTtlMs: 7 * 24 * 60 * 60_000,
  inviteMaxUses: 20,
};

/** Energy now, refilled lazily from the last stored value. */
export function energyAt(stored: number, storedAt: number, now: number): number {
  return Math.min(ONLINE_RULES.energyMax, stored + (Math.max(0, now - storedAt) / 3_600_000) * ONLINE_RULES.energyPerHour);
}

// ------------------------------------------------------------------ clans

export type ClanRole = 'leader' | 'officer' | 'member';
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
export function clanInviteLink(botUsername: string | null, code: string, appName = 'play', fallbackUrl = 'https://play.pixelarrow.app/'): string {
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

