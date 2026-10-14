/**
 * Wires crash reports (./telemetry.ts) and product analytics (./analytics.ts)
 * into the game: the session token and Telegram platform for both, the
 * x-pa-* headers on every API request, the Settings opt-out (synced to the
 * server so its own events skip this player) and the session_start event.
 */
import { Analytics, flushAnalytics, setAnalytics, track, type EventsPayload } from './analytics';
import { online } from './cloud';
import { APP_VERSION, installErrorCapture, sendJson, watchGame, type GameLike } from './telemetry';
import { platform } from './index';

const CONSENT_KEY = 'pa_analytics_consent_synced';

export interface MonitoringDeps {
  /** The Settings "Analytics" toggle. */
  analyticsEnabled: () => boolean;
  lang: () => string;
}

let deps: MonitoringDeps | null = null;


/** Tells the server about the toggle once signed in (only when it changed since the last sync). */
async function syncConsent(): Promise<boolean> {
  if (!deps || !online.signedIn) return false;
  const on = deps.analyticsEnabled();
  // this device remembers the last value the server has (the KV never throws)
  const device = platform.storage.device();
  if ((await device.get(CONSENT_KEY)) === String(on)) return true;
  try {
    await online.api.request('POST', '/api/telemetry/consent', { body: { analytics: on }, auth: true });
    await device.set(CONSENT_KEY, String(on));
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
  // read at each use: the client is known only once platform.init() has run (BootScene)
  const client = () => platform.client();
  installErrorCapture({
    token: () => online.api.token,
    platform: () => ({ platform: client().platform, tg: client().version, lang: d.lang() }),
  });
  watchGame(game);

  online.api.extraHeaders = () => {
    const h: Record<string, string> = { 'x-pa-version': APP_VERSION, 'x-pa-platform': client().platform };
    if (!d.analyticsEnabled()) h['x-pa-analytics'] = '0';
    return h;
  };

  analyticsInstance = new Analytics({
    enabled: d.analyticsEnabled,
    token: () => online.api.token,
    app: () => ({ version: APP_VERSION, platform: client().platform }),
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
  track('session_start', { tg: client().version, lang: l === 'en' || l === 'ru' ? l : 'other' });

  // Sync the opt-out once the game has signed in (sign-in happens lazily elsewhere).
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    void syncConsent().then((done) => {
      if (done || tries > 40) clearInterval(timer);
    });
  }, 15_000);
}
