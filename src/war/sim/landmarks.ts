/**
 * M7f landmark state (docs/WAR.md "Landmarks"; W-47): who holds the region's landmark, the capture damage, the restore and
 * the garrison the season score reads.
 *
 *  - Holder: the alliance team that owns most of its standing pieces (they follow the claim points, ./works.ts).
 *  - State: guarded while a guardian of the region lives (./bosses.ts); else unclaimed (no alliance holds it), damaged
 *    (held, function dormant) or restored (held and restored: its function wakes).
 *  - Damaged on capture: the first time an alliance takes it from its guardian (or from nobody) every piece drops to at
 *    most LANDMARK.capture of its hp and its gates break open; taken later from another alliance it keeps what the siege
 *    left (and stays restored: the new holder inherits the place and its breaches).
 *  - Restore (`restoreLandmark`): a squad of the holder with an engineer of the landmark's level and nodes (Fortifier and
 *    Master Builder; level 10 also Poliorcetes or Archimedes) pays the bill (src/data/warLandmarks.ts, bulk and rare
 *    goods) from the network at the keep; every piece is whole again. Refusals are `landmarkRefused` events.
 *  - Garrisoned: restored, at least LANDMARK.garrison of the holder's fighting men inside its bounds and no man of another
 *    alliance there (the server's +2 score an hour).
 *  - A guardian back from the dead (24 h unheld, season start) resets it: not captured, not restored.
 */
import type { LandmarkSnap, SquadId, WarEvent } from '../types';
import { landmarkOfRegion, restoreCost, type Landmark } from '../../data/warLandmarks';
import { heldNodes } from '../../data/professions';
import type { Piece, Works } from './works';

export const LANDMARK = { capture: 0.4, garrison: 6, every: 10 };

export interface LmUnit { x: number; y: number; alive: boolean; civ: unknown; squad: { team: number }; person?: { hero: { level: number; perks?: readonly string[] } } | null }
export interface LmHost {
  units: readonly LmUnit[];
  squads: readonly ({ team: number; units: readonly LmUnit[] } | undefined)[];
  /** A guardian of the region lives. */
  guarded(): boolean;
  /** An alliance team (not neutral, not the mobs). */
  real(team: number): boolean;
  note(e: WarEvent): void;
}

/** An engineer fit to lead lm's restore: its level and nodes. */
export function canLead(lm: Landmark, level: number, perks: readonly string[] | undefined): boolean {
  if (level < lm.engineer) return false;
  const held = heldNodes('engineer', perks ?? []);
  if (!held.has('fortifier') || !held.has('masterBuilder')) return false;
  return lm.engineer < 10 || held.has('poliorcetes') || held.has('archimedes');
}

export function createLandmarks(regionId: string, works: Works, host: LmHost) {
  const lm = landmarkOfRegion(regionId);
  let captured = false, restored = false, holder = -1, men = 0, foes = 0, state: LandmarkSnap['state'] = 'guarded';
  let box: [number, number, number, number] | null = null;

  const pieces = (): Piece[] => works.prebuilt().filter((b) => b.pre!.landmark && !b.pre!.gone);
  const bounds = () => {
    if (box) return box;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of pieces()) for (let k = 0; k < b.tiles.length; k += 2) (x0 = Math.min(x0, b.tiles[k])), (y0 = Math.min(y0, b.tiles[k + 1])), (x1 = Math.max(x1, b.tiles[k] + 1)), (y1 = Math.max(y1, b.tiles[k + 1] + 1));
    return (box = [x0, y0, x1, y1]);
  };
  const holderNow = (): number => {
    const n = new Map<number, number>();
    for (const b of pieces()) if (!b.pre!.ruin && host.real(b.team)) n.set(b.team, (n.get(b.team) ?? 0) + 1);
    let best = -1, bn = 0;
    for (const [t, k] of n) if (k > bn || (k === bn && t < best)) (best = t), (bn = k);
    return best;
  };
  const stateNow = (): LandmarkSnap['state'] => (host.guarded() ? 'guarded' : holder < 0 ? 'unclaimed' : restored ? 'restored' : 'damaged');
  /** The keep: the landmark piece with the most hp (the restore is paid there). */
  const keep = (): Piece | undefined => pieces().reduce<Piece | undefined>((a, b) => (!a || b.maxHp > a.maxHp ? b : a), undefined);

  const update = (t: number) => {
    const h = holderNow();
    if (h !== holder) {
      if (h >= 0 && !captured) {
        captured = true;
        works.landmarkCapture(LANDMARK.capture);
      }
      holder = h;
    }
    const [x0, y0, x1, y1] = bounds();
    men = foes = 0;
    for (const u of host.units) {
      if (!u.alive || u.civ || u.x < x0 || u.y < y0 || u.x >= x1 || u.y >= y1 || !host.real(u.squad.team)) continue;
      if (u.squad.team === holder) men++;
      else foes++;
    }
    const s = stateNow();
    if (s !== state) {
      state = s;
      host.note({ t, kind: 'landmark', id: lm!.id, state, holder });
    }
  };

  return {
    any: () => !!lm && pieces().length > 0,
    saveRoot: () => ({ captured, restored, holder, men, foes, state }),
    loadRoot: (o: { captured: boolean; restored: boolean; holder: number; men: number; foes: number; state: LandmarkSnap['state'] }) =>
      void ((captured = o.captured), (restored = o.restored), (holder = o.holder), (men = o.men), (foes = o.foes), (state = o.state)),
    tick(t: number) {
      if (!lm || t % LANDMARK.every !== 0 || !pieces().length) return;
      update(t);
    },
    /** Its guardian is back: the landmark is as the season found it. */
    reset() {
      captured = restored = false;
    },
    /** M7f memory: captured and restored as they were left (a fresh room of a region that remembers). */
    remember(o: { captured: boolean; restored: boolean }) {
      captured = o.captured;
      restored = o.restored;
    },
    flags: () => ({ captured, restored }),
    /** restoreLandmark by `squad` (see the header); true when restored. */
    restore(squad: SquadId, t: number): boolean {
      const s = host.squads[squad];
      if (!lm || !s) return false;
      const refuse = (why: 'held' | 'engineer' | 'goods') => (host.note({ t, kind: 'landmarkRefused', id: lm.id, squad, why }), false);
      update(t);
      if (restored || holder < 0 || s.team !== holder || host.guarded()) return refuse('held');
      if (!s.units.some((u) => u.alive && u.civ === 'engineer' && !!u.person && canLead(lm, u.person.hero.level, u.person.hero.perks))) return refuse('engineer');
      const k = keep()!;
      if (!works.landmarkRestore(holder, restoreCost(lm.id), k.x, k.y)) return refuse('goods');
      restored = true;
      update(t);
      return true;
    },
    snap(): LandmarkSnap | undefined {
      if (!lm) return undefined;
      const ps = pieces();
      if (!ps.length) return undefined;
      const up = ps.filter((b) => !b.pre!.ruin && b.state !== 'destroyed');
      const hp = up.reduce((a, b) => a + b.hp / Math.max(1, b.maxHp), 0) / Math.max(1, ps.length);
      return { id: lm.id, holder, state, hp, ruined: ps.length - up.length, pieces: ps.length, men, foes, garrisoned: state === 'restored' && men >= LANDMARK.garrison && foes === 0 };
    },
  };
}
export type Landmarks = ReturnType<typeof createLandmarks>;
