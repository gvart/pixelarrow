/**
 * Wires crash reports (./telemetry.ts) and product analytics (./analytics.ts)
 * into the game: the session token and Telegram platform for both, the
 * x-pa-* headers on every API request, the Settings opt-out (synced to the
 * server so its own events skip this player) and the session_start event.
 */
import { Analytics, flushAnalytics, setAnalytics, track, type EventsPayload } from './analytics';
import { online } from './cloud';
import { APP_VERSION, installErrorCapture, sendJson, watchGame, type GameLike } from './telemetry';
import { telegramClient } from './telegram';

const CONSENT_KEY = 'pa_analytics_consent_synced';

export interface MonitoringDeps {
  /** The Settings "Analytics" toggle. */
  analyticsEnabled: () => boolean;
  lang: () => string;
}

let deps: MonitoringDeps | null = null;

function storedConsent(): string | null {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

/** Tells the server about the toggle once signed in (only when it changed since the last sync). */
async function syncConsent(): Promise<boolean> {
  if (!deps || !online.signedIn) return false;
  const on = deps.analyticsEnabled();
  if (storedConsent() === String(on)) return true;
  try {
    await online.api.request('POST', '/api/telemetry/consent', { body: { analytics: on }, auth: true });
    try {
      localStorage.setItem(CONSENT_KEY, String(on));
    } catch {
      /* private mode */
    }
    return true;
  } catch {
    return false;
  }
}

/** The Settings toggle changed. */
export function analyticsToggled(): void {
  if (!deps?.analyticsEnabled()) analyticsInstance?.clear();
  void syncConsent();
}

let analyticsInstance: Analytics | null = null;

export function installMonitoring(game: GameLike, d: MonitoringDeps): void {
  deps = d;
  const tg = telegramClient();
  installErrorCapture({
    token: () => online.api.token,
    platform: () => ({ platform: tg.platform, tg: tg.version, lang: d.lang() }),
  });
  watchGame(game);

  online.api.extraHeaders = () => {
    const h: Record<string, string> = { 'x-pa-version': APP_VERSION, 'x-pa-platform': tg.platform };
    if (!d.analyticsEnabled()) h['x-pa-analytics'] = '0';
    return h;
  };

  analyticsInstance = new Analytics({
    enabled: d.analyticsEnabled,
    token: () => online.api.token,
    app: () => ({ version: APP_VERSION, platform: tg.platform }),
    send: async (payload: EventsPayload, beacon: boolean) => {
      if (beacon) {
        sendJson('/api/telemetry/events', payload, true);
        return true;
      }
      try {
        await online.api.request('POST', '/api/telemetry/events', { body: { app: payload.app, events: payload.events }, auth: true });
        return true;
      } catch {
        return false;
      }
    },
  });
  setAnalytics(analyticsInstance);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAnalytics(true);
  });

  const l = d.lang();
  track('session_start', { tg: tg.version, lang: l === 'en' || l === 'ru' ? l : 'other' });

  // Sync the opt-out once the game has signed in (sign-in happens lazily elsewhere).
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    void syncConsent().then((done) => {
      if (done || tries > 40) clearInterval(timer);
    });
  }, 15_000);
}
