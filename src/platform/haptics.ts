/** Haptic cues for game code: one-line delegates to platform.haptics, so the call sites keep their names. */
import type { ImpactStyle, NotifyType } from './core/haptics';
import { platform } from './index';

export function haptic(kind: ImpactStyle = 'light'): void {
  platform.haptics.impact(kind);
}

export function hapticNotify(kind: NotifyType): void {
  platform.haptics.notify(kind);
}

export function hapticSelect(): void {
  platform.haptics.select();
}

/** The Settings toggle. */
export function setHaptics(on: boolean): void {
  platform.haptics.setEnabled(on);
}
