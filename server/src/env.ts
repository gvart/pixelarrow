import type { RegionDO } from './region';
import type { Session } from './session';

/** Worker bindings, vars and secrets (see wrangler.jsonc and server/.dev.vars.example). */
export interface Env {
  /** D1 database. Absent when D1_DATABASE_ID was not configured at deploy time. */
  DB?: D1Database;
  REGION: DurableObjectNamespace<RegionDO>;
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
  /** "1" only in local .dev.vars: accept a fake Telegram user in /api/auth/telegram. */
  DEV_AUTH?: string;
}

/** Hono generics for this app. */
export interface AppEnv {
  Bindings: Env;
  Variables: { session: Session };
}
