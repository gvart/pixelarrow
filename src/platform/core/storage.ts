/** Key/value storage for the save and for device-only data. */

/** Async key/value backend (Telegram CloudStorage, localStorage, ...). src/game/save.ts re-exports it. */
export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface Storage {
  /** The save: Telegram CloudStorage with a localStorage mirror, or localStorage. */
  save(): KV;
  /** This device only (bindings, map view, monitoring). */
  device(): KV;
  /** The save follows the account to other devices. */
  readonly roams: boolean;
}
