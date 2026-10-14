/**
 * AU-04 Check your email (design/ux/accounts-v6.md §5.3): a canvas sheet, not a form, so the player can
 * close it and keep playing. It names the address, says how long the link works, and offers Resend
 * (off for 60 s with a countdown, off for the hour after the cap), Wrong address? Change it (sign-up
 * only) and Keep playing. The reset variant's Resend reopens Forgot password, prefilled.
 */
import Phaser from 'phaser';
import { t } from '../../i18n';
import { AuthHost, type AuthForm } from '../form/authForm';
import { MButton, mtext, openParchmentSheet, runCountdown, SHEET_TITLE_H, GAP, type ParchmentSheetHandle } from '../mosaic';
import type { UiScene } from '../mosaic/subShell';
import { MOSAIC } from '../tokens';
import { toast } from '../widgets';
import { flowDeps, humanCheckOf, showError } from './common';
import type { AccountDeps } from './deps';
import { runResend } from './flows';
import { openForgot } from './forgot';
import type { SignInOpts } from './login';
import { openSignup } from './signup';

export interface CheckEmailOpts {
  email: string;
  variant: 'signup' | 'reset';
  /** Carried to the forms it reopens (Change it, the reset Resend). */
  signIn?: SignInOpts;
}

const BTN_H = 24;
const TEXT = 7;

/** A small envelope drawn in the kit's parchment and bronze (no image request). */
function envelope(scene: Phaser.Scene, cx: number, y: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const w = 26;
  const h = 17;
  const x = Math.round(cx - w / 2);
  g.fillStyle(MOSAIC.parchHi, 1).fillRect(x, y, w, h);
  g.lineStyle(1.5, MOSAIC.bronzeLo, 1).strokeRect(x, y, w, h);
  g.beginPath().moveTo(x, y).lineTo(x + w / 2, y + h * 0.6).lineTo(x + w, y).strokePath();
  return g;
}

export function openCheckEmail(scene: UiScene, d: AccountDeps, o: CheckEmailOpts): ParchmentSheetHandle {
  const w = Math.min(220, scene.m.VW - 16);
  const bw = w - 16;
  const lead = mtext(scene, 0, 0, o.variant === 'reset' ? t('auth.check.reset', { email: o.email }) : t('auth.check.sent', { email: o.email }), 'pInk', { size: TEXT, maxW: bw, wrap: true });
  const capped = () => d.resend.state(d.now()).kind === 'capped';
  const spam = mtext(scene, 0, 0, t(capped() ? 'auth.check.capped' : 'auth.check.spam'), 'pSec', { size: TEXT, maxW: bw, wrap: true });
  const change = o.variant === 'signup';
  const bodyH = 20 + 4 + lead.height + 4 + spam.height + 6 + BTN_H + GAP + (change ? BTN_H + GAP : 0) + BTN_H;
  const m = openParchmentSheet(scene, { title: t('auth.check.title'), w, h: SHEET_TITLE_H + bodyH + 18, closeButton: false, id: 'account.checkEmail' });
  const { x, y } = m.body;
  let cy = y;
  m.c.add(envelope(scene, x + bw / 2, cy));
  cy += 20 + 4;
  m.c.add(lead.setPosition(x, cy));
  cy += lead.height + 4;
  m.c.add(spam.setPosition(x, cy));
  cy += spam.height + 6;

  let stop: (() => void) | null = null;
  const resend = new MButton(scene, x, cy, bw, BTN_H, { label: t('auth.check.resend'), variant: 'secondary', id: 'account.check.resend', onClick: () => onResend() });
  m.c.add(resend);
  cy += BTN_H + GAP;
  /** The button follows the gate: off with the countdown while it waits, off for the hour once capped. */
  const refresh = (): void => {
    stop?.();
    stop = null;
    if (!resend.scene) return;
    const s = d.resend.state(d.now());
    if (s.kind === 'capped') {
      resend.setLabel(t('auth.check.resend')).setEnabled(false, t('auth.check.capped'));
      spam.setText(t('auth.check.capped'));
    } else if (s.kind === 'wait') {
      resend.setEnabled(false, t('auth.check.wait'));
      stop = runCountdown(scene, s.ms, (time) => resend.scene && resend.setLabel(t('auth.check.resendIn', { time })), refresh, d.now);
    } else resend.setLabel(t('auth.check.resend')).setEnabled(true);
  };

  const onResend = (): void => {
    if (o.variant === 'reset') {
      m.close();
      openForgot(scene, d, { ...o.signIn, email: o.email });
      return;
    }
    openResend(scene, d, o.email, refresh);
  };

  if (change) {
    m.c.add(
      new MButton(scene, x, cy, bw, BTN_H, {
        label: t('auth.check.change'),
        variant: 'neutral',
        id: 'account.check.change',
        onClick: () => {
          m.close();
          openSignup(scene, d, { ...o.signIn, email: o.email });
        },
      }).useBody(),
    );
    cy += BTN_H + GAP;
  }
  m.c.add(new MButton(scene, x, cy, bw, BTN_H, { label: t('auth.check.keep'), variant: 'primary', id: 'account.check.keep', onClick: () => m.close() }));
  refresh();
  m.c.once('destroy', () => stop?.());
  return m;
}

/**
 * Resend link (§5.3): the human check needs a form, so a minimal one with no field (the address is
 * known), only the check and Send again. Always the same answer: a toast, then `onSent`.
 */
export function openResend(scene: UiScene, d: AccountDeps, email: string, onSent?: () => void): AuthForm {
  const host = AuthHost.open();
  return host.push({
    id: 'resend',
    title: t('auth.check.resend'),
    intro: email,
    fields: [],
    humanCheck: humanCheckOf(d, 'resend'),
    submitLabel: t('auth.check.sendAgain'),
    async onSubmit(_v, f) {
      const r = await runResend(flowDeps(d, f), email);
      if (!r.ok) return showError(f, r.error);
      d.resend.sent(d.now());
      host.close();
      if (scene.sys.isActive()) toast(scene, t('auth.check.resent'), 'info');
      onSent?.();
    },
  });
}
