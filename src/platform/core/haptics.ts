/** Haptic cues (the neutral set in src/audio/haptics.ts). */
export type ImpactStyle = 'light' | 'medium' | 'heavy';
export type NotifyType = 'error' | 'success' | 'warning';

export interface Haptics {
  impact(s: ImpactStyle): void;
  notify(t: NotifyType): void;
  select(): void;
  /** The Settings toggle; when off, every cue is a no-op. */
  setEnabled(on: boolean): void;
}
