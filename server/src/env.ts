import type { MatchmakerDO } from './duel/matchmaker';
import type { DuelDO } from './duel/duelDO';
import type { WarRegionDO } from './war/regionDO';
import type { WarWorldDO } from './war/world/worldDO';
import type { Session } from './auth/sessions';

/** Worker bindings, vars and secrets (see wrangler.jsonc and server/.dev.vars.example). */
export interface Env {
  /** D1 database. Absent when D1_DATABASE_ID was not configured at deploy time. */
  DB?: D1Database;
  /** The global duel queue (one object, 'global'). */
  MATCHMAKER: DurableObjectNamespace<MatchmakerDO>;
  /** One object per live ranked or unranked match (named by the match id). */
  DUEL: DurableObjectNamespace<DuelDO>;
  /** One object per live war region (server/src/war/regionDO.ts). */
  WAR_REGION: DurableObjectNamespace<WarRegionDO>;
  /** The one strategic war world (server/src/war/world/worldDO.ts, named 'world'). */
  WAR_WORLD: DurableObjectNamespace<WarWorldDO>;
  /** Live soldier cap per war region (W-06, default 600), split evenly between the 4 alliances. */
  WAR_CAP?: string;
  /** Dev only (with DEV_AUTH=1): world travel times x this (e.g. 0.05), for scripted playtests (scripts/war/play.mjs --fast). */
  WAR_TRAVEL_SCALE?: string;
  ASSETS?: Fetcher;
  /** The game's URL, play.pixelarrow.app (wrangler.jsonc vars; server/src/urls.ts). */
  GAME_URL?: string;
  /** The landing site, pixelarrow.app: legal links in bot texts (wrangler.jsonc vars). */
  LANDING_URL?: string;
  /** Local only (.dev.vars): comma-separated dev origins for CORS and the Origin check. */
  DEV_ORIGINS?: string;
  /** Bot username for clan invite links (t.me/<bot>/<app>); looked up with getMe when unset. */
  TELEGRAM_BOT_USERNAME?: string;
  /** Mini App short name in BotFather (default "play"). */
  TELEGRAM_APP_NAME?: string;
  // Secrets (wrangler secret put ...). Missing ones make the routes that need them answer 503.
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
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
  /**
   * Password pepper (secret, ADR-0008 §2): 32 random bytes, base64. The PBKDF2
   * input is HMAC-SHA256(pepper, password). Never in D1, the repo or a log.
   * Without it the password flows answer 503.
   */
  PASSWORD_PEPPER?: string;
  /** The current pepper's id (secret, e.g. "1"); stored in each hash string. */
  PASSWORD_PEPPER_ID?: string;
  /** Optional, during a pepper rotation only: the old pepper as `<id>:<base64>`, so its hashes still verify and get rehashed. */
  PASSWORD_PEPPER_PREVIOUS?: string;
  /** "1" only in local .dev.vars and tests: emails go to the dev_outbox table instead of being sent. */
  DEV_EMAIL?: string;
  /** Email Service `send_email` binding (wrangler.jsonc, ADR-0008 §4); only MAIL_FROM may send. */
  EMAIL?: SendEmail;
  /** The sender of account emails, noreply@pixelarrow.app (wrangler.jsonc vars). */
  MAIL_FROM?: string;
  /** Turnstile secret (secret, ADR-0008 §6). Without it the anonymous auth forms answer 503 (fail closed). */
  TURNSTILE_SECRET?: string;
  /** Rate Limiting binding, 10 / 60 s: `<route>:<ip>` on the email auth forms, `rename:<pid>` (ADR-0008 §5). */
  RL_AUTH_IP?: RateLimit;
  /** Rate Limiting binding, 30 / 60 s: `tg:<ip>` on /api/auth/telegram (ADR-0008 §5). */
  RL_TG_AUTH_IP?: RateLimit;
  /** Rate Limiting binding, 60 / 60 s: `public:<ip>` on GET/HEAD /api/public/v1/summary (ADR-0010 §4). */
  RL_PUBLIC_IP?: RateLimit;
}

/** Hono generics for this app. */
export interface AppEnv {
  Bindings: Env;
  Variables: { session: Session; /** Admin routes: the operator's name (server/src/admin/auth.ts). */ admin: string };
}
