/**
 * Boot's first-run decision (design/ux/screens-campaign.md C-1), kept free of
 * Phaser so it can be tested against real saves. Only a brand-new player
 * (state.load wrote `status: 'offer'`) or one whose tutorial was interrupted
 * is sent to the first-run screens; a save without a tutorial record (every
 * save from before the tutorial) counts as done, so existing players are
 * never sent back through first run.
 */
import { canResume, progressOf, type TutorialProgress } from '../game/tutorial';

export type FirstRunEntry = 'offer' | 'resume';

/** The first-run screen to open, or null for the normal routing. `blocked`: a deep link, `?scene=Kit` or a test script wins. */
export function firstRunEntry(settings: { tutorial?: TutorialProgress }, blocked = false): FirstRunEntry | null {
  if (blocked) return null;
  const tut = progressOf(settings);
  if (tut.status === 'offer') return 'offer';
  return canResume(tut) ? 'resume' : null;
}
