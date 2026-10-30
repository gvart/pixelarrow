/** The human check of the email forms (Turnstile on the web: ../web/turnstile.ts). */

/** The server checks the human-check token against the form it was made for (ADR-0008 §6). */
export type HumanCheckAction = 'signup' | 'login' | 'reset' | 'resend';

/**
 * loading: the check's script or widget is on its way · ready: a token is waiting (nothing to show) ·
 * interactive: the player has to answer a challenge in the slot · failed: the challenge failed or timed out ·
 * load_failed: the script did not load (blocked, offline) or the build has no site key.
 */
export type HumanCheckState = 'loading' | 'ready' | 'interactive' | 'failed' | 'load_failed';

/** Why `token()` gave up: the widget never loaded, the challenge failed, or no token came in time. */
export type HumanCheckFailure = 'load_failed' | 'failed' | 'timeout';

export interface HumanCheckWidget {
  /**
   * A one-time token for this form's action: at once when one is waiting, else as soon as the widget
   * makes one (at most `timeoutMs`). Rejects with an Error whose message is a HumanCheckFailure.
   * Each token is handed out once; the widget then makes a fresh one for a retry.
   */
  token(timeoutMs?: number): Promise<string>;
  /** Drops the current token and asks for a new one (after the server refused it). */
  reset(): void;
  /** Takes the widget out of its slot. */
  remove(): void;
}

/** A bot check that runs in the page (Turnstile on the web). */
export interface HumanCheck {
  /** Renders the check into `slot`, loading its script on first use only. `onState` follows the widget. */
  mount(slot: HTMLElement, o: { action: HumanCheckAction; lang: string; onState?: (s: HumanCheckState) => void }): HumanCheckWidget;
}
