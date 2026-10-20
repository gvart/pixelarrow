/**
 * AU-01 Sign in to play online (design/ux/accounts-v6.md §4.4, V6-ACCT-07): the state card an online
 * screen shows in place of its content when the web has no session. It replaces the old "outside
 * Telegram" copy wherever the platform can sign in with a form (capability, never platform: UXA-04);
 * Telegram never shows it. Create account is the one terracotta button, Log in is bronze, and a line
 * says the campaign is untouched. Variants: a sign-up waiting for its email link on this device
 * (Resend link, Use another email, Log in) and a banned account (§14 Q4).
 */
import Phaser from 'phaser';
import { lang, t, type TKey } from '../../i18n';
import { addIcon, scaleIcon } from '../kit';
import { MButton, mosaicImage, mtext, GAP } from '../mosaic';
import type { UiScene } from '../mosaic/subShell';
import { uiId } from '../layout';
import { legalUrl } from '../legal';
import { platform } from '../../platform';
import { online } from '../../platform/cloud';
import { canUsePasswordForms, openAccountForm } from './index';
import { accountDeps, type AccountDeps } from './deps';
import { readPending } from './flows';
import { openResend } from './checkEmail';

/** Whose body line the card shows (§4.4). */
type GateFor = 'duels' | 'war' | 'shop' | 'market' | 'notify';

/** The online screen's scene key → its body line (the clan reads as the war). */
export function gateForScene(key: string): GateFor {
  return key === 'Duel' ? 'duels' : key === 'Shop' ? 'shop' : 'war';
}

/** The card replaces the "outside" state here: the platform signs in with forms (the web). */
export const showsSignInGate = (): boolean => canUsePasswordForms();

const BTN_H = 24;
const TEXT = 7;
const PAD = 8;

type Variant = { kind: 'signedOut' } | { kind: 'pending'; email: string } | { kind: 'banned' };

/**
 * Adds the card, centred in the box (x, y, w, h) of `parent`. `onSignedIn` re-renders the screen once a
 * log-in (or the first sync after it) is done. `bottom()` is where the card ends (for a scrolling page;
 * the pending variant, found a moment later, is a button taller).
 */
export function addSignInGate(scene: UiScene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, gate: GateFor, onSignedIn: () => void, d: AccountDeps = accountDeps()): { c: Phaser.GameObjects.Container; bottom: () => number } {
  const holder = scene.add.container(0, 0);
  parent.add(holder);
  let bottom = y;
  const cw = Math.min(w - 8, 220);
  const fill = (v: Variant): void => {
    holder.removeAll(true);
    const bw = cw - PAD * 2;
    const title = t(v.kind === 'banned' ? 'auth.banned.title' : v.kind === 'pending' ? 'auth.gate.pendingTitle' : 'auth.gate.title');
    const bodyText = v.kind === 'banned' ? t('auth.banned.body') : v.kind === 'pending' ? t('auth.gate.pendingBody', { email: v.email }) : t(`auth.gate.${gate}` as TKey);
    const head = mtext(scene, 0, 0, title, 'rInk', { size: 8.5, maxW: bw, wrap: true });
    const body = mtext(scene, 0, 0, bodyText, 'pInk', { size: TEXT, maxW: bw, wrap: true });
    const keep = v.kind === 'signedOut' ? mtext(scene, 0, 0, t('auth.gate.keep'), 'pSec', { size: TEXT, maxW: bw, wrap: true }) : null;
    const buttons: { label: string; variant: 'primary' | 'secondary' | 'neutral'; id: string; onClick: () => void }[] = [];
    const login = { label: t('auth.gate.login'), id: 'auth.gate.login', onClick: () => openAccountForm(scene, 'login', { onSignedIn }, d) };
    if (v.kind === 'signedOut') {
      buttons.push({ label: t('auth.gate.create'), variant: 'primary', id: 'auth.gate.create', onClick: () => openAccountForm(scene, 'signup', { onSignedIn }, d) });
      buttons.push({ ...login, variant: 'secondary' });
    } else if (v.kind === 'pending') {
      const email = v.email;
      buttons.push({ label: t('auth.check.resend'), variant: 'secondary', id: 'auth.gate.resend', onClick: () => openResend(scene, d, email) });
      buttons.push({ label: t('auth.gate.otherEmail'), variant: 'neutral', id: 'auth.gate.otherEmail', onClick: () => openAccountForm(scene, 'signup', { onSignedIn }, d) });
      buttons.push({ ...login, variant: 'neutral' });
    } else {
      // support is reached through the privacy notice's contact section (no account needed to read it)
      buttons.push({ label: t('auth.banned.support'), variant: 'secondary', id: 'auth.gate.support', onClick: () => platform.share.openExternal(legalUrl('privacy', lang())) });
    }
    const btnsH = buttons.length * BTN_H + (buttons.length - 1) * GAP;
    const textH = head.height + 4 + body.height + (keep ? 4 + keep.height : 0);
    // the people icon goes first when the box is short (the words and buttons never do)
    const iconH = h - 8 >= PAD + 24 + textH + 8 + btnsH + PAD ? 24 : 0;
    const ch = PAD + iconH + textH + 8 + btnsH + PAD;
    const cx = Math.round(x + (w - cw) / 2);
    const cy = Math.round(y + Math.max(0, (h - ch) / 2));
    const card = scene.add.container(cx, cy);
    holder.add(card);
    bottom = cy + ch;
    card.add(mosaicImage(scene, 0, 0, cw, ch, 'parchment'));
    let yy = PAD;
    if (iconH) {
      const ic = scaleIcon(addIcon(scene, 0, 0, v.kind === 'banned' ? 'flag' : 'people', 'D'), 1.6);
      ic.setPosition(Math.round((cw - ic.displayWidth) / 2), yy);
      card.add(ic);
      yy += iconH;
    }
    card.add(head.setPosition(PAD, yy));
    yy += head.height + 4;
    card.add(body.setPosition(PAD, yy));
    yy += body.height;
    if (keep) {
      card.add(keep.setPosition(PAD, yy + 4));
      yy += 4 + keep.height;
    }
    yy += 8;
    for (const b of buttons) {
      card.add(new MButton(scene, PAD, yy, bw, BTN_H, b));
      yy += BTN_H + GAP;
    }
    uiId(card, `auth.gate.${v.kind}`);
  };
  fill(online.banned ? { kind: 'banned' } : { kind: 'signedOut' });
  // a sign-up waiting for its link on this device (§5.5): a hint only, read from device storage
  if (!online.banned)
    void readPending(d.kv, d.now()).then((p) => {
      if (p && holder.scene) fill({ kind: 'pending', email: p.email });
    });
  return { c: holder, bottom: () => bottom };
}
