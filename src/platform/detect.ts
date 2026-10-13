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

/** The adapter for id. Steam and mobile have no adapter yet, so they get the web one. */
export function createPlatform(id: PlatformId, env: PlatformEnv, opts: { telegramBot?: string } = {}): Platform {
  if (id === 'telegram') return createTelegramPlatform(env, { bot: opts.telegramBot });
  return createWebPlatform(env);
}
