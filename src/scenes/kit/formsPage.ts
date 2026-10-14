/**
 * The Kit's "Forms" page (V6-ACCT-05, accounts-v6.md §12): AuthForm (HTML over the canvas) in each of
 * its states, the sign-in forms with stand-in answers (no server, no Turnstile request: a stand-in check
 * is ready at once, shows a challenge box, or fails to load), Check your email in its variants, and the
 * CountdownLabel. Switch the language with `?lang=ru`. `openFormSample` is what scripts call.
 */
import { t } from '../../i18n';
import { ApiError } from '../../platform/api';
import type { HumanCheck, HumanCheckState } from '../../platform/core/auth';
import { AuthHost } from '../../ui/form/authForm';
import { openCheckEmail, openResend } from '../../ui/account/checkEmail';
import type { AccountDeps } from '../../ui/account/deps';
import { LoginGuard, ResendGate } from '../../ui/account/flows';
import { openForgot } from '../../ui/account/forgot';
import { openLogin } from '../../ui/account/login';
import { openSignup } from '../../ui/account/signup';
import { CountdownLabel, ParchmentRow, ROW_H } from '../../ui/mosaic';
import { G, type Cursor, type KitScene } from './common';

/** A stand-in human check: ready at once, a visible challenge, or a script that did not load. */
function kitCheck(mode: HumanCheckState): HumanCheck {
  return {
    mount(slot, o) {
      const set = (s: HumanCheckState) => queueMicrotask(() => o.onState?.(s));
      if (mode === 'interactive') {
        const box = document.createElement('div');
        box.textContent = 'Turnstile challenge (Kit stand-in)';
        box.style.cssText = 'height:61px;border:2px dashed #8a6a3a;border-radius:4px;display:flex;align-items:center;justify-content:center;font:500 13px Inter,system-ui,sans-serif;color:#4a3a28';
        slot.append(box);
      }
      set(mode);
      return {
        token: () => (mode === 'load_failed' ? Promise.reject(new Error('load_failed')) : Promise.resolve('kit-token')),
        reset() {},
        remove: () => slot.replaceChildren(),
      };
    },
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Stand-in deps: each endpoint answers after a short delay with `reply` (a value or an ApiError). */
function kitDeps(o: { check?: HumanCheckState; login?: unknown; signup?: unknown; resend?: ResendGate } = {}): AccountDeps {
  const answer = (reply: unknown) => async () => {
    await wait(400);
    if (reply instanceof Error) throw reply;
    return reply as never;
  };
  return {
    api: {
      signup: answer(o.signup ?? { status: 'check_email' }),
      login: answer(o.login ?? new ApiError(401, 'invalid_credentials', 'x')),
      resetRequest: answer({ status: 'check_email' }),
      resendVerify: answer({ status: 'check_email' }),
      logout: answer({ ok: true }),
    },
    session: { recheckSession: async () => true, playerName: 'Swift Fox 12' },
    humanCheck: kitCheck(o.check ?? 'ready'),
    kv: { get: async () => null, set: async () => {}, remove: async () => {} },
    now: () => Date.now(),
    guard: new LoginGuard(),
    resend: o.resend ?? new ResendGate(),
  };
}

export interface FormSample {
  id: string;
  label: string;
  what: string;
  icon: string;
  open: (s: KitScene) => void;
}

const SAMPLE_EMAIL = 'ana@example.com';

/** Submits the open form (the stand-in server answers in 0.4 s). */
const submitTop = () => (AuthHost.top()?.form?.el.querySelector('[data-act=submit]') as HTMLButtonElement | null)?.click();

export const FORM_SAMPLES: readonly FormSample[] = [
  { id: 'login', label: 'Log in', what: 'Email, password with the eye, links', icon: 'people', open: (s) => void openLogin(s, kitDeps()) },
  {
    id: 'login-creds',
    label: 'Log in: wrong password',
    what: 'The banner; the password is cleared',
    icon: 'cross',
    open: (s) => {
      const f = openLogin(s, kitDeps(), { email: SAMPLE_EMAIL });
      f.setValue('password', 'not-my-password');
      submitTop();
    },
  },
  {
    id: 'login-many',
    label: 'Log in: too many attempts',
    what: 'After 5 failures; reset is a button',
    icon: 'hourglass',
    open: (s) => {
      const d = kitDeps();
      for (let i = 0; i < 4; i++) d.guard.fail(Date.now());
      const f = openLogin(s, d, { email: SAMPLE_EMAIL });
      f.setValue('password', 'not-my-password');
      submitTop();
    },
  },
  {
    id: 'login-busy',
    label: 'Log in: busy',
    what: 'A spinner; a second press does nothing',
    icon: 'clock',
    open: (s) => {
      const f = openLogin(s, { ...kitDeps(), api: { ...kitDeps().api, login: () => new Promise(() => {}) } }, { email: SAMPLE_EMAIL });
      f.setValue('password', 'a long passphrase');
      submitTop();
    },
  },
  { id: 'signup', label: 'Create account', what: 'Live length hint, legal line', icon: 'plus', open: (s) => void openSignup(s, kitDeps()) },
  {
    id: 'signup-errors',
    label: 'Create account: field errors',
    what: 'Under the field, ⚠ and text, red rim',
    icon: 'cross',
    open: (s) => {
      const f = openSignup(s, kitDeps({ signup: new ApiError(400, 'common', 'x') }), { email: SAMPLE_EMAIL });
      f.setValue('password', 'password1234');
      submitTop();
    },
  },
  {
    id: 'signup-email',
    label: 'Create account: bad email',
    what: 'The client check, before the server',
    icon: 'cross',
    open: (s) => {
      const f = openSignup(s, kitDeps(), { email: 'ana@example' });
      f.setValue('password', 'short');
      submitTop();
    },
  },
  { id: 'signup-challenge', label: 'Create account: challenge', what: 'The 65 px slot holds the challenge', icon: 'shield', open: (s) => void openSignup(s, kitDeps({ check: 'interactive' })) },
  { id: 'signup-noload', label: 'Create account: check not loaded', what: 'The banner offers Retry', icon: 'repair', open: (s) => void openSignup(s, kitDeps({ check: 'load_failed' })) },
  {
    id: 'signup-offline',
    label: 'Create account: offline',
    what: 'Fields kept, the banner says so',
    icon: 'tent',
    open: (s) => {
      const f = openSignup(s, kitDeps({ signup: new ApiError(0, 'network', 'x') }), { email: SAMPLE_EMAIL });
      f.setValue('password', 'a long passphrase');
      submitTop();
    },
  },
  {
    id: 'signup-rate',
    label: 'Create account: rate limited',
    what: '429: about the network, in minutes',
    icon: 'hourglass',
    open: (s) => {
      const f = openSignup(s, kitDeps({ signup: new ApiError(429, 'rate_limited', 'x') }), { email: SAMPLE_EMAIL });
      f.setValue('password', 'a long passphrase');
      submitTop();
    },
  },
  { id: 'forgot', label: 'Forgot password', what: 'One field; always the same answer', icon: 'repair', open: (s) => void openForgot(s, kitDeps(), { email: SAMPLE_EMAIL }) },
  { id: 'check', label: 'Check your email', what: 'Resend waits 60 s, with a countdown', icon: 'check', open: (s) => openKitCheck(s, 'signup', 1) },
  { id: 'check-reset', label: 'Check your email: reset', what: 'No Change link; Resend reopens the form', icon: 'check', open: (s) => openKitCheck(s, 'reset', 1) },
  { id: 'check-capped', label: 'Check your email: capped', what: 'The 4th email in an hour: off', icon: 'check', open: (s) => openKitCheck(s, 'signup', 4) },
  { id: 'resend', label: 'Resend link', what: 'No field: the check and Send again', icon: 'check', open: (s) => void openResend(s, kitDeps(), SAMPLE_EMAIL) },
];

function openKitCheck(s: KitScene, variant: 'signup' | 'reset', sends: number): void {
  const resend = new ResendGate();
  const t0 = Date.now();
  // the sends were a while ago (the wait is nearly over) except the last
  for (let i = 0; i < sends; i++) resend.sent(t0 - (sends - 1 - i) * 61_000 - 18_000);
  openCheckEmail(s, kitDeps({ resend }), { email: SAMPLE_EMAIL, variant });
}

/** Opens sample `id` (scripts and the layout check). */
export function openFormSample(scene: KitScene, id: string): void {
  AuthHost.top()?.close();
  FORM_SAMPLES.find((o) => o.id === id)?.open(scene);
}

export function buildForms(cur: Cursor): void {
  const { scene, w } = cur;
  const rows = (list: readonly FormSample[]) => {
    for (const o of list) {
      cur.add(new ParchmentRow(scene, 0, cur.y, w, { icon: o.icon, title: o.label, tip: o.what, onClick: () => openFormSample(scene, o.id), id: `kit.form.${o.id}` }));
      cur.y += ROW_H + G;
    }
  };
  cur.title('AuthForm');
  cur.note('HTML forms over the canvas: real inputs, so password managers, paste and the phone keyboard work. Stand-in answers; no server.');
  rows(FORM_SAMPLES.filter((o) => !o.id.startsWith('check') && o.id !== 'resend'));
  cur.title('Check your email');
  rows(FORM_SAMPLES.filter((o) => o.id.startsWith('check') || o.id === 'resend'));
  cur.title('CountdownLabel');
  cur.note('m:ss on the wall clock; calls back at zero.');
  cur.add(new CountdownLabel(scene, 0, cur.y, { ms: 42_000, template: (time) => t('auth.check.resendIn', { time }) }));
  cur.y += 14;
}
