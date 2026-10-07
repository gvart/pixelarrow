/**
 * Hook that lets the battle scene fight a battle that is not the offline
 * campaign's: an online attack (setup fixed by the server, result submitted
 * for verification) or a live duel (orders go through the lockstep relay).
 * The scene only needs this interface; it never talks to the server itself.
 * Start it with scene.start('Battle', { source }).
 */
import type { Battle } from '../sim/battle';
import type { BattleSetup, Order, Side } from '../sim/types';
import type { Hero } from '../data/units';

export interface LockstepDriver {
  /** Called once the scene built its Battle from `setup`. */
  attach(sim: Battle): void;
  /** Route a local order (applied later, when the server echoes or seals it). */
  issue(order: Order): void;
  /** Local player finished deploying. The battle starts when the server says go. */
  ready(): void;
  /** The next sim step may run (its turn is sealed). */
  canStep(): boolean;
  /** Right before each sim.step(): applies the turn's orders at turn boundaries. */
  beforeStep(): void;
  /** One-line status for the HUD ("Waiting for Hektor...") or null. */
  status(): string | null;
  /** Ended from outside (desync, opponent left): message to show, else null. */
  aborted(): string | null;
}

export interface BattleSource {
  setup: BattleSetup;
  /** Heroes of both sides (looked up by id for the sprites). */
  heroes: Hero[];
  /** Side the local player commands. */
  side: Side;
  /** "vs Brigands", "vs Hektor". */
  label: string;
  /** Live duel: no pause, no speed-up, orders through the relay. */
  lockstep?: LockstepDriver;
  /** The battle ended (or was aborted): the source takes over (submit, show the result...). */
  onFinish(sim: Battle, deployOrders: number): void;
  /** Back button during deployment. */
  onLeave(): void;
}
