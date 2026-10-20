/**
 * The public stats snapshot, schema v1 (ADR-0010 §2). Strict: an unknown key
 * anywhere fails validation, so a leaked field (an id, a Telegram name) fails
 * the cron build instead of reaching the landing page.
 */
import { z } from 'zod';

/** At most this many rows per board. */
export const BOARD_MAX = 10;
/** At most this many past champions per kind. */
export const CHAMPIONS_MAX = 5;
/** A board with fewer eligible rows than this is served as `[]`. */
export const BOARD_MIN = 3;
/** The serialized body may not exceed this many bytes. */
export const BODY_MAX_BYTES = 32 * 1024;

const count = z.number().int().nonnegative();
const name = z.string().min(1).max(32);
const rank = z.number().int().min(1).max(BOARD_MAX);
const season = z.strictObject({ id: count, endsAt: count }).nullable();

const duelRow = z.strictObject({ rank, name, league: z.string().max(16), rating: count.nullable(), games: count });
/** An alliance or region name (game data, not a player's). */
const place = z.string().min(1).max(40);
const allianceRow = z.strictObject({ rank, name: place, score: count, regions: count, members: count });
const warPlayerRow = z.strictObject({ rank, name, alliance: place.nullable(), kills: count, fights: count, wins: count, honours: count });
const regionRow = z.strictObject({ rank, name: place, alliance: place, rate: count });
const slayerRow = z.strictObject({ rank, name, kills: count });
/** A region boss (src/data/warBosses.ts): its kills this season, per alliance, and the alliance of the first. */
const bossRow = z.strictObject({ name: place, region: place, kills: count, first: place.nullable(), alliances: z.array(count).length(4) });

export const PublicSummaryV1 = z.strictObject({
  v: z.literal(1),
  generatedAt: count,
  totals: z.strictObject({
    players: count,
    activePlayers7d: count,
    onlineBattles: count,
    duelsFought: count,
    warBattles: count,
    bossesSlain: count,
    clans: count,
  }),
  duels: z.strictObject({
    season,
    live: z.array(duelRow).max(BOARD_MAX),
    async: z.array(duelRow).max(BOARD_MAX),
  }),
  war: z.strictObject({
    season,
    /** The four alliances by season score (docs/WAR.md "Season score and victory"). */
    alliances: z.array(allianceRow).max(4),
    players: z.array(warPlayerRow).max(BOARD_MAX),
    /** The held regions that score most an hour, and who holds them. */
    regions: z.array(regionRow).max(BOARD_MAX),
  }),
  champions: z.strictObject({
    war: z.array(z.strictObject({ season: count, name, title: z.string().min(1).max(32) })).max(CHAMPIONS_MAX),
    duel: z.array(z.strictObject({ season: count, ladder: z.enum(['live', 'async']), name })).max(CHAMPIONS_MAX),
  }),
  /** Players by region bosses slain this war season (W-45). */
  bossSlayers: z.array(slayerRow).max(BOARD_MAX),
  bosses: z.array(bossRow).max(BOARD_MAX),
});

export type PublicSummaryV1 = z.infer<typeof PublicSummaryV1>;
export type DuelRow = z.infer<typeof duelRow>;
