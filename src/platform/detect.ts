/**
 * Which platform the game runs on, decided once at startup from launch hints
 * (ADR-0006). Only src/platform/index.ts uses this; game code never does.
 */
import type { PlatformEnv } from './core/env';
import type { Platform, PlatformId } from './core/platform';
import { createTelegramPlatform } from './telegram/index';
import { isTelegramLaunch, telegramLaunchHints } from './telegram/sdk';
import { createWebPlatform } from './web/index';

export interface LaunchHints {
  hash: string;
  search: string;
  /** A Telegram native client's webview proxy exists. */
  webviewProxy: boolean;
  /** The Telegram SDK is already loaded with signed launch data. */
  sdkInitData: boolean;
  /** import.meta.env.VITE_PLATFORM: a build for one platform (Steam, mobile shells). */
  build?: string;
  /** A dev build: `?platform=` may override the hints (test scripts). */
  dev: boolean;
}

const IDS: readonly PlatformId[] = ['telegram', 'web', 'steam', 'mobile'];
const isId = (s: string | null | undefined): s is PlatformId => !!s && (IDS as readonly string[]).includes(s);

export function detectPlatformId(h: LaunchHints): PlatformId {
  if (h.build) return isId(h.build) ? h.build : 'web';
  if (h.dev) {
    const forced = new URLSearchParams(h.search).get('platform');
    if (forced === 'web' || forced === 'telegram') return forced;
    if (forced) return 'web';
  }
  return isTelegramLaunch(h) ? 'telegram' : 'web';
}

export function readLaunchHints(env: PlatformEnv, build: { build: string | undefined; dev: boolean }): LaunchHints {
  return { ...telegramLaunchHints(env), ...build };
}

interface PlatformOptions {
  /** The bot's username: Telegram invite links become t.me/<bot>/<app>?startapp=... */
  telegramBot?: string;
  /** The Mini App's short name in BotFather (the adapter defaults to "play"). */
  telegramApp?: string;
  /** The web forms' Turnstile site key (web/turnstile.ts turnstileOptions). */
  turnstileSiteKey?: string;
}

/**
 * The Telegram link names from the build env (VITE_TELEGRAM_BOT, VITE_TELEGRAM_APP;
 * the deploy workflow fills them from repo variables). The bot username is not in
 * the repo (V6-025), so without it invites fall back to the play URL; a malformed
 * value is ignored the same way.
 */
export function telegramLinkOptions(env: { VITE_TELEGRAM_BOT?: string; VITE_TELEGRAM_APP?: string }): PlatformOptions {
  const bot = env.VITE_TELEGRAM_BOT?.trim().replace(/^@/, '');
  if (!bot || !/^[A-Za-z0-9_]{5,32}$/.test(bot)) return {};
  const app = env.VITE_TELEGRAM_APP?.trim();
  return app && /^[A-Za-z0-9_]{3,30}$/.test(app) ? { telegramBot: bot, telegramApp: app } : { telegramBot: bot };
}

/** The adapter for id. Steam and mobile have no adapter yet, so they get the web one. */
export function createPlatform(id: PlatformId, env: PlatformEnv, opts: PlatformOptions = {}): Platform {
  if (id === 'telegram') return createTelegramPlatform(env, { bot: opts.telegramBot, app: opts.telegramApp });
  return createWebPlatform(env, { turnstileSiteKey: opts.turnstileSiteKey });
}
