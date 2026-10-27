/**
 * E4 game feel in the sandbox view: each new snapshot's impacts (./impacts.ts) shake the camera by their tier, less the
 * farther they are from the view's centre and not at all off screen (./shake.ts, the player's setting), and the big
 * ones on screen ask for a hit-stop: the scene holds its drawn units, clips, missiles and engines for a few frames
 * (SandboxScene.update). The sim never stops: it runs on in its worker and the view catches up when the stop ends.
 */
import type { Snapshot } from '../../types';
import type { IsoMap } from '../iso';
import { HitStop, ImpactWatch, TIER } from './impacts';
import { camShake, shakeFalloff } from './shake';

type View = { x: number; y: number; right: number; bottom: number };

export class Feel {
  readonly stop = new HitStop();
  private watch = new ImpactWatch();
  /** Impacts felt (for scripts): kind -> count. */
  readonly felt: Record<string, number> = {};

  constructor(private iso: IsoMap) {}

  /** Once a frame, before the units are drawn. */
  update(cur: Snapshot | null, view: View, now: number): void {
    if (!cur) return;
    const hits = this.watch.diff(cur);
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i], t = TIER[h.kind], iso = this.iso;
      const k = shakeFalloff(iso.sx(h.x, h.y), iso.sy(h.x, h.y, iso.zAt(h.x, h.y)), view);
      if (k <= 0) continue;
      this.felt[h.kind] = (this.felt[h.kind] ?? 0) + 1;
      camShake.add(t.shake * k);
      if (k > 0.45) this.stop.ask(now, t.stop); // a stop only for what is well on screen
    }
  }

  frozen(now: number): boolean {
    return this.stop.frozen(now);
  }
}
