/**
 * Incoming duel challenges on every online screen (map, army, clan), not
 * only on the map: one listener on the shard socket for the whole game shows
 * the "A challenge!" dialog in whichever screen is open, and starts the duel
 * battle when the server sends `duel_start`. In a battle the challenge is
 * declined at once (the challenger is told), so nobody waits in vain.
 */
import Phaser from 'phaser';
import { shardSocket } from '../online/client';
import { duelSource } from '../online/duelDriver';
import type { DuelStart, PresencePlayer } from '../online/protocol';
import { Button } from './kit';
import { openModal, toast, type Modal, type UiScene } from './widgets';
import { SIZE } from './theme';
import { LINE_H, wrapText } from './textfit';
import { addText } from './kit';
import { hapticNotify } from '../platform/telegram';
import { t } from '../i18n';
import type { DuelOutcome } from '../online/duelDriver';

/** Where a finished duel lands (set by the map scene module to avoid an import cycle). */
export const duelReturn: { to: ((game: Phaser.Game, outcome: DuelOutcome | null) => void) | null } = { to: null };

const BUSY_SCENES = new Set(['Battle', 'Results', 'Boot']);

let popup: { id: string; modal: Modal } | null = null;
let installed = false;

/** The screen on top that can show a dialog (has a UI root), or null when a battle is running. */
function hostScene(game: Phaser.Game): UiScene | null | 'busy' {
  const scenes = game.scene.getScenes(true);
  if (scenes.some((s) => BUSY_SCENES.has(s.scene.key))) return 'busy';
  for (let i = scenes.length - 1; i >= 0; i--) {
    const s = scenes[i] as UiScene;
    if (s.ui && s.m && s.sys.settings.visible) return s;
  }
  return null;
}

function closePopup(): void {
  popup?.modal.close();
  popup = null;
}

/** Shows the challenge dialog in the open screen. */
export function showChallenge(game: Phaser.Game, id: string, from: PresencePlayer): void {
  const host = hostScene(game);
  if (host === 'busy' || !host) {
    shardSocket.send({ type: 'challenge_reply', id, accept: false });
    return;
  }
  closePopup();
  const { VW } = host.m;
  const w = Math.min(VW - 16, 200);
  const wr = wrapText(t('duel.challengesYou', { name: from.name }), w - 20, 4);
  const h = 30 + wr.lines.length * LINE_H + 10 + SIZE.btnH + 12;
  const modal = openModal(host, { title: t('duel.challenged'), w, h, onClose: () => {
    if (popup?.id === id) {
      popup = null;
      shardSocket.send({ type: 'challenge_reply', id, accept: false });
    }
  } });
  const body = addText(host, VW / 2, modal.y + 28, wr.lines.join('\n'), 'ink', 0.5);
  body.setCenterAlign();
  modal.c.add(body);
  const bw = Math.floor((w - 12 - SIZE.gap) / 2);
  const by = modal.y + h - SIZE.btnH - 9;
  modal.c.add(
    new Button(host, modal.x + 6, by, bw, SIZE.btnH, {
      label: t('duel.decline'),
      icon: 'close',
      variant: 'secondary',
      onClick: () => {
        popup = null;
        shardSocket.send({ type: 'challenge_reply', id, accept: false });
        modal.close();
      },
    }),
  );
  modal.c.add(
    new Button(host, modal.x + w - 6 - bw, by, bw, SIZE.btnH, {
      label: t('duel.fight'),
      icon: 'swords',
      variant: 'primary',
      onClick: () => {
        popup = null;
        shardSocket.send({ type: 'challenge_reply', id, accept: true });
        modal.close();
        toast(host, t('duel.preparing'));
      },
    }),
  );
  popup = { id, modal };
  hapticNotify('warning');
}

function startDuel(game: Phaser.Game, m: DuelStart): void {
  closePopup();
  const back = (o: DuelOutcome | null) => duelReturn.to?.(game, o);
  const source = duelSource(m, (outcome) => back(outcome), () => back(null));
  for (const s of game.scene.getScenes(true)) if (s.scene.key !== 'Battle') game.scene.stop(s.scene.key);
  game.scene.start('Battle', { source });
}

/** Installs the game-wide listener once (main.ts). */
export function installDuelInvites(game: Phaser.Game): void {
  if (installed) return;
  installed = true;
  shardSocket.on((m) => {
    switch (m.type) {
      case 'challenged':
        showChallenge(game, m.id, m.from);
        return;
      case 'challenge_closed':
        if (popup?.id === m.id) {
          const p = popup;
          popup = null;
          const host = p.modal.c.scene;
          p.modal.close();
          if (host) toast(host, t(`duel.closed.${m.reason}`), 'bad');
        }
        return;
      case 'duel_start':
        startDuel(game, m);
        return;
      default:
        return;
    }
  });
}

/** For tests and the layout check: is a challenge dialog open? */
export function challengeOpen(): boolean {
  return popup !== null;
}
