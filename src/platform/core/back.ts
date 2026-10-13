/** The system Back control, the ⋯ Settings item and the "leave?" guard. */
export interface BackButton {
  /** False: the platform has no Back control of its own, so the game draws its back arrow. */
  readonly native: boolean;
  /** Back runs cb; null clears it. Setting the same cb again changes nothing. */
  setBack(cb: (() => void) | null): void;
  /** Telegram's ⋯ menu Settings item; a no-op where there is none. */
  setSettings(cb: (() => void) | null): void;
  /** Ask before the app is closed (Telegram's closing confirmation, the web's beforeunload). */
  setClosingConfirmation(on: boolean): void;
}
