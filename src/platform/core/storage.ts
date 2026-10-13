/** Key/value storage for the save and for device-only data. */
// KV moves here from src/game/save.ts at M4 (ADR-0006); until then it is re-exported from there.
import type { KV } from '../../game/save';

export type { KV };

export interface Storage {
  /** The save: Telegram CloudStorage with a localStorage mirror, or localStorage. */
  save(): KV;
  /** This device only (bindings, map view, monitoring). */
  device(): KV;
  /** The save follows the account to other devices. */
  readonly roams: boolean;
}
