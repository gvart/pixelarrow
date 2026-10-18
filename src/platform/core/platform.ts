/** The platform the game runs on, picked once at startup (ADR-0006). Types only. */
import type { Auth } from './auth';
import type { BackButton } from './back';
import type { Haptics } from './haptics';
import type { InputHints } from './input';
import type { Notifications } from './notifications';
import type { Payments } from './payments';
import type { SafeArea } from './safeArea';
import type { Share } from './share';
import type { Storage } from './storage';

export type PlatformId = 'telegram' | 'web' | 'steam' | 'mobile';

/** For crash reports and the language hint. `platform` names the client ("ios", "tdesktop", "web", ...). */
export interface ClientInfo {
  platform: string;
  version?: string;
  language?: string;
}

export interface Platform {
  /** Telemetry and the boundary allowlist only: game code never reads it. */
  readonly id: PlatformId;
  /** Called once, from BootScene.route(). Telegram loads its SDK; the web resolves at once. */
  init(): Promise<void>;
  readonly auth: Auth;
  readonly payments: Payments;
  readonly storage: Storage;
  readonly haptics: Haptics;
  readonly back: BackButton;
  readonly share: Share;
  readonly safeArea: SafeArea;
  readonly input: InputHints;
  readonly notifications: Notifications;
  /** The app went to the background (false) or came back (true). Returns an unsubscribe. */
  onActive(cb: (active: boolean) => void): () => void;
  /** The launch parameter (startapp), parsed by src/online/deeplink.ts; null when there is none. */
  launchParam(): string | null;
  client(): ClientInfo;
  /** Closes the app (Telegram's Mini App); false when the platform can't, and the caller carries on. */
  closeApp(): boolean;
}
