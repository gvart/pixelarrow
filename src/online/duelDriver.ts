/**
 * Glue between a duel_start, the shard socket and the battle scene: builds
 * the BattleSource whose lockstep driver feeds the Lockstep adapter with the
 * relay's messages.
 */
import type { Battle } from '../sim/battle';
import type { Order } from '../sim/types';
import type { BattleSource, LockstepDriver } from './battleSource';
import { Lockstep } from './lockstep';
import type { DuelStart, ServerMsg } from './protocol';
import { shardSocket } from './client';
import { t } from '../i18n';

export interface DuelOutcome {
  result: Extract<ServerMsg, { type: 'duel_result' }> | null;
  aborted: string | null;
  desync: boolean;
  side: 0 | 1;
  names: [string, string];
}

export function duelSource(start: DuelStart, done: (o: DuelOutcome) => void, leave: () => void): BattleSource {
  let ls: Lockstep | null = null;
  const early: ServerMsg[] = [];
  let finished = false;
  const off = shardSocket.on((m) => {
    if (!('duel' in m) || m.duel !== start.duel) return;
    if (ls) ls.receive(m);
    else early.push(m);
    if (m.type === 'duel_result' && finished) complete();
  });
  const opponent = start.names[start.side === 0 ? 1 : 0];
  let completed = false;
  const complete = () => {
    if (completed) return;
    completed = true;
    off();
    done({ result: ls?.result ?? null, aborted: ls?.aborted ?? null, desync: !!ls?.desync, side: start.side, names: start.names });
  };
  const driver: LockstepDriver = {
    attach(sim: Battle) {
      ls = new Lockstep(sim, start.side, start.duel, (m) => shardSocket.send(m), { turnTicks: start.turnTicks, delayTurns: start.delayTurns, hashEvery: start.hashEvery });
      for (const m of early.splice(0)) ls.receive(m);
    },
    issue(o: Order) {
      ls?.issue(o);
    },
    ready() {
      ls?.markReady();
    },
    canStep() {
      return !!ls && ls.canStep();
    },
    beforeStep() {
      ls?.beforeStep();
    },
    status() {
      return t('battle.banner.waitingFoe', { name: opponent });
    },
    opponentReady() {
      return !!ls?.opponentReady;
    },
    backlog() {
      return ls?.backlog() ?? 0;
    },
    aborted() {
      if (!ls) return null;
      if (ls.desync) return t('battle.duel.desync');
      if (ls.aborted) return ls.aborted === 'opponent_left' || ls.aborted === 'left' ? t('battle.duel.left', { name: opponent }) : t('battle.duel.cancelled');
      return null;
    },
  };
  return {
    setup: start.setup,
    heroes: [...start.heroes[0], ...start.heroes[1]],
    side: start.side,
    label: t('battle.vs', { name: opponent }),
    opponent,
    lockstep: driver,
    onFinish() {
      finished = true;
      if (!ls || ls.desync || ls.aborted) return complete();
      ls.finish();
      if (ls.result) return complete();
      // Wait briefly for the server's verdict.
      setTimeout(complete, 6000);
    },
    onLeave() {
      shardSocket.send({ type: 'leave_duel', duel: start.duel });
      off();
      leave();
    },
  };
}
