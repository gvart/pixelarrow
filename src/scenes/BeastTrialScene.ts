/**
 * The Beast trial list is retired (V5-029, CDX-01): it was the Codex list again. The scene stays only so
 * that old routes keep working: a start of `BeastTrial` (a Trial fight's Results "Onward", an old deep
 * link) forwards to the Codex, with the beast's sheet open when one was named. The Trial fight itself is
 * the primary action of the Codex beast sheet (CodexScene.fight).
 */
import Phaser from 'phaser';
import type { EncounterId } from '../data/beasts';
import type { CodexData } from './CodexScene';

interface TrialData {
  /** The scene that started the trial (always the Codex now). */
  from?: string;
  /** The beast whose sheet to open. */
  open?: EncounterId;
}

/** Where the old route lands: the Codex, with the named beast's sheet open. */
export function trialRedirect(data?: TrialData): CodexData {
  return data?.open ? { open: data.open } : {};
}

export class BeastTrialScene extends Phaser.Scene {
  constructor() {
    super('BeastTrial');
  }

  create(data?: TrialData): void {
    this.scene.start('Codex', trialRedirect(data));
  }
}
