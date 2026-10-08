import type { RegionDO } from './region';
import type { MatchmakerDO } from './duel/matchmaker';
import type { DuelDO } from './duel/duelDO';
import type { Session } from './session';

/** Worker bindings, vars and secrets (see wrangler.jsonc and server/.dev.vars.example). */
export interface Env {
  /** D1 database. Absent when D1_DATABASE_ID was not configured at deploy time. */
  DB?: D1Database;
  REGION: DurableObjectNamespace<RegionDO>;
  /** The global duel queue (one object, 'global'). */
  MATCHMAKER: DurableObjectNamespace<MatchmakerDO>;
  /** One object per live ranked or unranked match (named by the match id). */
  DUEL: DurableObjectNamespace<DuelDO>;
  ASSETS?: Fetcher;
  GAME_URL?: string;
  /** Bot username for clan invite links (t.me/<bot>/<app>); looked up with getMe when unset. */
  TELEGRAM_BOT_USERNAME?: string;
  /** Mini App short name in BotFather (default "play"). */
  TELEGRAM_APP_NAME?: string;
  // Secrets (wrangler secret put ...). Missing ones make the routes that need them answer 503.
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  SESSION_SECRET?: string;
  /**
   * Workers Analytics Engine datasets (docs/OPS.md). Absent when the deploy
   * dropped them (server/scripts/deploy-config.mjs): events are then skipped.
   */
  ANALYTICS?: AnalyticsEngineDataset;
  CLIENT_ERRORS?: AnalyticsEngineDataset;
  /**
   * Admin panel credentials (secret): one token, or comma-separated
   * `name:token` pairs (the name goes into the audit log). Each token must be
   * at least 32 characters; without it /admin answers 503.
   */
  ADMIN_TOKEN?: string;
  /** "1" only in local .dev.vars: accept a fake Telegram user in /api/auth/telegram. */
  DEV_AUTH?: string;
  /** Pins the map new online shards get (src/online/maps id; tests use 'test30'). Default: the season map. */
  ONLINE_MAP?: string;
}

/** Hono generics for this app. */
export interface AppEnv {
  Bindings: Env;
  Variables: { session: Session; /** Admin routes: the operator's name (server/src/admin/auth.ts). */ admin: string };
}
