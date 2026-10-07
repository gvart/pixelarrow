/**
 * Timed deployment of online battles (docs/DESIGN_V2.md "Online battle
 * rules"): every online battle opens with a 15-second deployment and a
 * visible countdown. "Ready" starts an attack at once; a duel starts when both
 * players are ready (the server sends go) or when the time is up. Pure (no
 * Phaser), so the state machine is unit-tested; the battle scene drives it
 * with real time and turns its actions into sim / relay calls.
 */

/** Length of the deployment phase of every online battle. */
export const DEPLOY_MS = 15_000;

export type DeployMode = 'attack' | 'duel';

/** What the scene must do after an event. */
export type DeployAction =
  /** Start the battle now (attacks: the player's own clock is the authority). */
  | 'start'
  /** Tell the relay this player is ready (duels: the server answers with go). */
  | 'sendReady';

export interface DeployClock {
  mode: DeployMode;
  total: number;
  /** Milliseconds left (0 when the time is up). */
  left: number;
  ready: boolean;
  foeReady: boolean;
  /** The battle started (attack: started locally; duel: go arrived). */
  started: boolean;
}

export function createDeployClock(mode: DeployMode, total = DEPLOY_MS): DeployClock {
  return { mode, total, left: total, ready: false, foeReady: false, started: false };
}

/** The local player is ready (the Ready button). */
export function pressReady(c: DeployClock): DeployAction[] {
  if (c.started || c.ready) return [];
  c.ready = true;
  if (c.mode === 'attack') {
    c.started = true;
    return ['start'];
  }
  return ['sendReady'];
}

/** Advance the clock; at zero the player is ready whether they pressed it or not. */
export function tickDeploy(c: DeployClock, dtMs: number): DeployAction[] {
  if (c.started) return [];
  c.left = Math.max(0, c.left - Math.max(0, dtMs));
  if (c.left > 0) return [];
  if (c.mode === 'attack') {
    c.ready = true;
    c.started = true;
    return ['start'];
  }
  if (!c.ready) {
    c.ready = true;
    return ['sendReady'];
  }
  return [];
}

/** The opponent pressed Ready (duels). */
export function foeIsReady(c: DeployClock): void {
  c.foeReady = true;
}

/** The battle started from outside (duels: the server's go). */
export function markStarted(c: DeployClock): void {
  c.started = true;
  c.ready = true;
}

/** Whole seconds shown on the countdown (rounded up: 15 .. 1, then 0). */
export function secondsLeft(c: DeployClock): number {
  return Math.ceil(c.left / 1000);
}

/** The last seconds are urgent (the countdown turns red and ticks). */
export function urgent(c: DeployClock): boolean {
  return !c.started && c.left > 0 && c.left <= 5000;
}
