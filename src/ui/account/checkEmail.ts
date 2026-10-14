/**
 * AU-04 Check your email (design/ux/accounts-v6.md §5.3): a canvas sheet, not a form, so the player can
 * close it and keep playing. It names the address, says how long the link works, and offers Resend
 * (off for 60 s with a countdown, off for the hour after the cap), Wrong address? Change it (sign-up
 * only) and Keep playing. The reset variant's Resend reopens Forgot password, prefilled.
 */
import Phaser from 'phaser';
import { t } from '../../i18n';
import { AuthHost, type AuthForm } from '../form/authForm';
import { MButton, mtext, mw, openParchmentSheet, runCountdown, sheetWidth, SHEET_TITLE_H, GAP, wrapWords, type ParchmentSheetHandle } from '../mosaic';
import type { UiScene } from '../mosaic/subShell';
import { MOSAIC } from '../tokens';
import { ScrollArea } from '../kit';
import { addScrollHint, toast } from '../widgets';
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
  const capped = () => d.resend.state(d.now()).kind === 'capped';
  const change = o.variant === 'signup';
  const leadText = o.variant === 'reset' ? t('auth.check.reset', { email: o.email }) : t('auth.check.sent', { email: o.email });
  const texts = (bw: number) => ({
    lead: mtext(scene, 0, 0, leadText, 'pInk', { size: TEXT, maxW: bw, wrap: true }),
    spam: mtext(scene, 0, 0, t(capped() ? 'auth.check.capped' : 'auth.check.spam'), 'pSec', { size: TEXT, maxW: bw, wrap: true }),
  });
  const sheetH = (p: { lead: { height: number }; spam: { height: number } }, buttonRows: number) =>
    SHEET_TITLE_H + 20 + 4 + p.lead.height + 4 + p.spam.height + 6 + buttonRows * BTN_H + (buttonRows - 1) * GAP + 18;
  // laid out for the box the sheet gets (a side panel in landscape is wider than the phone's 220); on a
  // short screen with room across, Resend and Change it share a row so the card fits without scrolling
  const sheetO = { title: t('auth.check.title'), w: Math.min(220, scene.m.VW - 16), closeButton: false, id: 'account.checkEmail' };
  const w = sheetWidth(scene, sheetO);
  const bw = w - 16;
  const halfW = Math.floor((bw - GAP) / 2);
  const tx = texts(bw);
  const paired = change && halfW >= 100 && sheetH(tx, 3) > scene.m.VH - 16;
  const { lead, spam } = tx;
  const rows = change && !paired ? 3 : 2;
  // the buttons always show; on a screen too short even so (the Kit's letterboxed column) the words scroll above them
  const want = sheetH(tx, rows);
  const h = Math.min(want, scene.m.VH - 16);
  const textH = 20 + 4 + lead.height + 4 + spam.height;
  const textRoom = textH - (want - h);
  const m = openParchmentSheet(scene, { ...sheetO, h });
  const { x, y } = m.body;
  const area = textRoom < textH ? new ScrollArea(scene, m.c, x, y, bw, Math.max(20, textRoom), scene.m.S) : null;
  const into = area?.content ?? m.c;
  const ox = area ? 0 : x;
  let ty = area ? 0 : y;
  into.add(envelope(scene, ox + bw / 2, ty));
  ty += 20 + 4;
  into.add(lead.setPosition(ox, ty));
  ty += lead.height + 4;
  into.add(spam.setPosition(ox, ty));
  if (area) {
    area.setContentHeight(textH);
    addScrollHint(scene, m.c, area, MOSAIC.parch);
    m.c.once('destroy', () => area.destroy());
  }
  let cy = y + Math.min(textH, textRoom) + 6;

  let stop: (() => void) | null = null;
  const resend = new MButton(scene, x, cy, paired ? halfW : bw, BTN_H, { label: t('auth.check.resend'), variant: 'secondary', id: 'account.check.resend', onClick: () => onResend() });
  m.c.add(resend);
  if (!paired) cy += BTN_H + GAP;
  /** The button follows the gate: off with the countdown while it waits, off for the hour once capped. */
  const refresh = (): void => {
    stop?.();
    stop = null;
    if (!resend.scene) return;
    const s = d.resend.state(d.now());
    if (s.kind === 'capped') {
      resend.setLabel(t('auth.check.resend')).setEnabled(false, t('auth.check.capped'));
      // wrapped like mtext did, so the longer line stays inside the card
      spam.setText(wrapWords(t('auth.check.capped'), bw, (s) => mw(s, 'pSec', TEXT)).join('\n'));
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
      new MButton(scene, paired ? x + bw - halfW : x, cy, paired ? halfW : bw, BTN_H, {
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
