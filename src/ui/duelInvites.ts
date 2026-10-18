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
import { toast, type UiScene } from './widgets';
import { LINE_H } from './textfit';
import { mtext, mw, openParchmentSheet, sheetActionsH, SHEET_TITLE_H, wrapWords, type MButtonOpts, type ParchmentSheetHandle } from './mosaic';
import { hapticNotify } from '../platform/haptics';
import { t } from '../i18n';
import type { DuelOutcome } from '../online/duelDriver';

/** Where a finished duel lands (set by the map scene module to avoid an import cycle). */
export const duelReturn: { to: ((game: Phaser.Game, outcome: DuelOutcome | null) => void) | null } = { to: null };

const BUSY_SCENES = new Set(['Battle', 'Results', 'Boot']);

let popup: { id: string; modal: ParchmentSheetHandle } | null = null;
let installed = false;

/** The online screen on top that can show a dialog, 'busy' in a battle, or null outside the online mode. */
function hostScene(game: Phaser.Game): UiScene | null | 'busy' {
  const scenes = game.scene.getScenes(true);
  if (scenes.some((s) => BUSY_SCENES.has(s.scene.key))) return 'busy';
  for (let i = scenes.length - 1; i >= 0; i--) {
    const s = scenes[i] as UiScene;
    // the online screens (map, army, clan, and any later Online* screen)
    if (s.ui && s.m && s.sys.settings.visible && s.scene.key.startsWith('Online')) return s;
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
  // a kit decision sheet (DLG-02): the challenger's words, then Decline | Fight. No X and no
  // shade tap (it pops up unasked: a stray tap must not answer it); Decline and Back are the way out.
  const w = Math.min(VW - 16, 240);
  const pad = 8;
  const lines = wrapWords(t('duel.challengesYou', { name: from.name }), w - pad * 2 - 4, (x) => mw(x, 'pInk', 7));
  const reply = (accept: boolean) => {
    popup = null;
    shardSocket.send({ type: 'challenge_reply', id, accept });
  };
  const actions: MButtonOpts[] = [
    { label: t('duel.decline'), icon: 'close', variant: 'secondary', id: 'duel.challenge.decline', onClick: () => (reply(false), modal.close()) },
    { label: t('duel.fight'), icon: 'swords', variant: 'primary', id: 'duel.challenge.fight', onClick: () => (reply(true), modal.close(), toast(host, t('duel.preparing'))) },
  ];
  const h = SHEET_TITLE_H + lines.length * LINE_H + pad * 2 + sheetActionsH(actions, w);
  const modal = openParchmentSheet(host, {
    title: t('duel.challenged'),
    w,
    h,
    actions,
    shadeCloses: false,
    closeButton: false,
    id: 'duel.challenge',
    // Back (Telegram or browser) declines; a close after an answer does nothing more
    onClose: () => popup?.id === id && reply(false),
  });
  const body = mtext(host, VW / 2, modal.body.y + pad - 2, lines.join('\n'), 'pInk', { size: 7, align: 0.5 });
  body.setCenterAlign();
  modal.c.add(body);
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
