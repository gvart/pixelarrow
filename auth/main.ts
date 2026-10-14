/**
 * The standalone email-link pages /auth/{signup,add_email,change_email,reset} (V6-ACCT-06; UXA-06;
 * design/ux/accounts-v6.md §5.4, §7.2, §8.3, §8.4, §12 "Auth page shell"). No Phaser and no game
 * bundle: a mail app's in-app browser shows the result in well under a second, and the same-origin
 * cookie the server sets signs the game in at `/`.
 *
 * Token handling (ADR-0008 §4, M-AF-6): the token is read from `#t=` and the fragment is removed from
 * the address bar before any request, so a screenshot, a shared URL or a reload can't leak or replay
 * it. It lives in this module's memory only, travels only in a POST body, and is never logged. The
 * page sends no Referer (meta referrer + the Referrer-Policy header in public/_headers).
 *
 * Text goes through textContent only; every label carries its key, so EN | RU switches in place
 * without a reload and without losing what was typed.
 */
import { ACCOUNT_EN } from '../src/i18n/account.en';
import { ACCOUNT_RU } from '../src/i18n/account.ru';
import { legalUrl } from '../src/ui/legal';
import type { HumanCheck, HumanCheckAction, HumanCheckWidget } from '../src/platform/core/auth';
import type { PlatformEnv } from '../src/platform/core/env';
import { conflictView, fmt, guestSave, pageLang, PW_MAX, PW_MIN, readToken, resetView, savedLangSetting, variantOf, verifyView, type Lang, type Reply, type Variant, type View } from './logic';

type Key = keyof typeof ACCOUNT_EN;
type Params = Record<string, string | number>;

const TABLES: Record<Lang, Record<Key, string>> = { en: ACCOUNT_EN, ru: ACCOUNT_RU };
const AUTO_MS = 3000;

const doc = document;
const $ = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
const variant: Variant = variantOf(location.pathname) ?? (doc.body.dataset.variant as Variant) ?? 'signup';

// Read the token, then strip the fragment from the address bar at once, before anything else runs.
const token = readToken(location.hash);
if (location.hash) history.replaceState(null, '', location.pathname);

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
let lang: Lang = pageLang(savedLangSetting(storage), navigator.languages ?? [navigator.language]);

// ---- text, by key ----

const labels = new WeakMap<Element, { key: Key; params?: Params; attr?: string }>();
const text = (key: Key, params?: Params) => fmt(TABLES[lang][key], params);

/** Sets an element's text (or one attribute) from a key, and remembers it for the language switch. */
function tx<E extends Element>(el: E, key: Key, params?: Params, attr?: string): E {
  labels.set(el, { key, params, attr });
  if (attr) el.setAttribute(attr, text(key, params));
  else el.textContent = text(key, params);
  el.classList.add('i18n');
  return el;
}

function relabel(): void {
  doc.documentElement.lang = lang;
  for (const el of doc.querySelectorAll('.i18n')) {
    const l = labels.get(el);
    if (l) tx(el, l.key, l.params, l.attr);
  }
  for (const b of doc.querySelectorAll<HTMLButtonElement>('.lang button')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  const privacy = $<HTMLAnchorElement>('privacy');
  const terms = $<HTMLAnchorElement>('terms');
  privacy.href = legalUrl('privacy', lang);
  terms.href = legalUrl('terms', lang);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, key?: Key, params?: Params): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (key) tx(e, key, params);
  return e;
}

/** A link styled as a button: a real navigation, so it works with the keyboard, middle-click and no JS errors. */
function linkButton(key: Key, href: string, primary: boolean): HTMLAnchorElement {
  const a = el('a', `btn ${primary ? 'primary' : 'bronze'}`, key);
  a.href = href;
  a.rel = 'noreferrer';
  return a;
}

function button(key: Key, primary: boolean, onClick: () => void): HTMLButtonElement {
  const b = el('button', `btn ${primary ? 'primary' : 'bronze'}`, key);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

const coarse = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;

// ---- the card ----

const body = $('body');
let stopAuto: (() => void) | null = null;

/** Replaces the card's content; focus goes to `focus` (or the title), so keyboard and screen-reader users land on the new state. */
function show(icon: 'ok' | 'warn' | 'wait' | null, lines: HTMLElement[], actions: HTMLElement[] = [], focus?: HTMLElement | null): void {
  stopAuto?.();
  stopAuto = null;
  body.replaceChildren();
  if (icon) {
    const i = el('span', `icon ${icon}`);
    i.setAttribute('aria-hidden', 'true');
    i.textContent = icon === 'ok' ? '✓' : icon === 'warn' ? '⚠' : '';
    body.append(i);
  }
  body.append(...lines);
  if (actions.length) {
    const row = el('div', 'actions');
    row.append(...actions);
    body.append(row);
  }
  (focus ?? $('title')).focus({ preventScroll: true });
}

const p = (key: Key, params?: Params, cls?: string) => el('p', cls, key, params);

// ---- the network ----

/** A same-origin JSON call. The token goes only in the body; no Referer, no cache. Null on a network failure. */
async function call(method: 'GET' | 'POST', path: string, payload?: object): Promise<Reply> {
  try {
    const r = await fetch(path, {
      method,
      headers: payload ? { 'content-type': 'application/json' } : {},
      body: payload ? JSON.stringify(payload) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    let json: unknown = null;
    try {
      json = await r.json();
    } catch {
      /* not JSON: a proxy or an outage page */
    }
    return { status: r.status, body: json };
  } catch {
    return null;
  }
}

// ---- states ----

function verifying(): void {
  const wait = el('p', 'wait');
  const s = el('span', 'spin');
  s.setAttribute('aria-hidden', 'true');
  wait.append(s, tx(el('span'), 'auth.page.verifying'));
  show(null, [wait]);
}

async function verify(): Promise<void> {
  verifying();
  const r = await call('POST', '/api/auth/verify', { token });
  render(verifyView(variant, r, guestSave(storage)));
}

/** Play, plus the 3 s auto-continue that any key or tap stops (WCAG 2.2.1). */
function playRow(lines: HTMLElement[], to = '/'): void {
  const play = linkButton('auth.page.play', to, true);
  const count = p('auth.page.autoIn', { s: AUTO_MS / 1000 }, 'muted');
  show('ok', [...lines, count], [play], play);
  let left = AUTO_MS / 1000;
  const tick = window.setInterval(() => {
    left -= 1;
    if (left <= 0) {
      stop();
      location.assign(to);
    } else tx(count, 'auth.page.autoIn', { s: left });
  }, 1000);
  const stop = () => {
    window.clearInterval(tick);
    doc.removeEventListener('keydown', cancel, true);
    doc.removeEventListener('pointerdown', cancel, true);
  };
  const cancel = (e: Event) => {
    stop();
    // Enter or Space on Play still opens the game; any other key or a tap just stops the timer.
    if (e.target !== play) tx(count, 'auth.page.stopped');
  };
  doc.addEventListener('keydown', cancel, true);
  doc.addEventListener('pointerdown', cancel, true);
  stopAuto = stop;
}

async function success(v: Extract<View, { kind: 'success' }>): Promise<void> {
  if (v.purpose === 'signup') {
    playRow([p('auth.page.welcome', undefined, 'lead'), p('auth.page.signedInAs', { name: v.name }), p(v.campaign === 'comes' ? 'auth.page.campaignComes' : 'auth.page.otherDevice')]);
  } else if (v.purpose === 'add_email') {
    playRow([p('auth.page.emailAdded', { name: v.name }, 'lead'), ...(v.removedEmpty ? [p('auth.page.removedEmpty')] : [])]);
  } else {
    // The masked new address comes from the account summary, which the fresh cookie session can read.
    verifying();
    const r = await call('GET', '/api/account');
    const ids = (r?.status === 200 ? (r.body as { identities?: { kind: string; emailMasked?: string }[] }).identities : null) ?? [];
    const masked = ids.find((i) => i.kind === 'password')?.emailMasked;
    playRow([masked ? p('auth.page.emailChanged', { email: masked }, 'lead') : p('auth.page.emailChangedPlain', undefined, 'lead')]);
  }
}

function render(v: View): void {
  const retry = () => (variant === 'reset' ? resetForm() : void verify());
  switch (v.kind) {
    case 'success':
      void success(v);
      return;
    case 'resetDone':
      playRow([p('auth.reset.done', undefined, 'lead')]);
      return;
    case 'expired': {
      const login = linkButton('auth.login.submit', '/#login', true);
      if (v.variant === 'signup') show('warn', [p('auth.page.expired', undefined, 'lead'), p('auth.page.expiredHint')], [login, button('auth.page.newLink', false, () => newLinkForm('resend'))], login);
      else if (v.variant === 'reset') show('warn', [p('auth.reset.expired', undefined, 'lead')], [login, button('auth.page.newLink', false, () => newLinkForm('reset'))], login);
      // add_email and change_email: a new link is asked for from Settings in the game.
      else show('warn', [p('auth.page.expired', undefined, 'lead'), p('auth.page.expiredHint')], [login, linkButton('auth.page.toGame', '/', false)], login);
      return;
    }
    case 'taken': {
      const login = linkButton('auth.login.submit', '/#login', true);
      show('warn', [p('auth.page.taken', undefined, 'lead')], [login, linkButton('auth.login.forgot', '/#forgot', false)], login);
      return;
    }
    case 'conflict':
      conflictForm();
      return;
    case 'banned': {
      const go = linkButton('auth.page.toGame', '/', false);
      show('warn', [p('auth.banned.title', undefined, 'lead'), p('auth.banned.body')], [go], go);
      return;
    }
    case 'rate':
    case 'offline':
    case 'unavailable': {
      // "Try again" re-sends the token kept in memory: the address bar no longer has it, so a reload can't.
      const again = button('auth.page.retry', true, retry);
      show('warn', [p(v.kind === 'rate' ? 'auth.page.rate' : v.kind === 'offline' ? 'auth.page.offline' : 'auth.err.unavailable', undefined, 'lead')], [again], again);
      return;
    }
    case 'handover':
      show('wait', [p('auth.page.handover', undefined, 'lead')]);
      location.replace(v.to);
      return;
    case 'field':
    case 'banner':
      return; // handled by the form that asked
  }
}

function noToken(): void {
  const go = linkButton('auth.page.toGame', '/', false);
  show('warn', [p('auth.page.noToken', undefined, 'lead')], [go], go);
}

// ---- forms ----

let fieldSeq = 0;
const EYE = 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z';

interface Field {
  wrap: HTMLElement;
  input: HTMLInputElement;
  error(key: Key | null): void;
}

/** A labelled field (label above, always visible), its live hint and its error, wired with aria-describedby. */
function field(kind: 'email' | 'newPassword' | 'currentPassword', labelKey: Key): Field {
  const id = `f${++fieldSeq}`;
  const wrap = el('div', 'field');
  const label = el('label', undefined, labelKey);
  label.htmlFor = id;
  const box = el('div', 'box');
  const input = el('input');
  input.id = id;
  input.name = kind === 'email' ? 'email' : 'password';
  input.required = true;
  if (kind === 'email') {
    Object.assign(input, { type: 'email', autocomplete: 'email', inputMode: 'email', spellcheck: false, maxLength: 320 });
    input.setAttribute('autocapitalize', 'off');
    tx(input, 'auth.field.emailPh', undefined, 'placeholder');
  } else {
    Object.assign(input, { type: 'password', autocomplete: kind === 'newPassword' ? 'new-password' : 'current-password', className: 'pw' });
    input.setAttribute('autocapitalize', 'off');
  }
  box.append(input);
  const err = el('p', 'err');
  err.id = `${id}-err`;
  const described = [err.id];
  if (kind !== 'email') {
    const eye = el('button', 'eye');
    eye.type = 'button';
    eye.setAttribute('aria-pressed', 'false');
    tx(eye, 'auth.field.show', undefined, 'aria-label');
    eye.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="${EYE}"/><circle cx="12" cy="12" r="3"/><path class="slash" d="M3 3l18 18"/></svg>`;
    eye.addEventListener('click', () => {
      const showing = input.type === 'password';
      input.type = showing ? 'text' : 'password';
      eye.setAttribute('aria-pressed', String(showing));
      tx(eye, showing ? 'auth.field.hide' : 'auth.field.show', undefined, 'aria-label');
    });
    box.append(eye);
  }
  wrap.append(label, box);
  if (kind === 'newPassword') {
    const hint = el('p', 'hint');
    hint.id = `${id}-hint`;
    described.unshift(hint.id);
    const live = () => {
      const n = [...input.value].length;
      if (n >= PW_MIN) tx(hint, 'auth.pw.ok').classList.add('good');
      else tx(hint, 'auth.pw.hint', { n }).classList.remove('good');
    };
    input.addEventListener('input', live);
    live();
    wrap.append(hint);
  }
  wrap.append(err);
  input.setAttribute('aria-describedby', described.join(' '));
  return {
    wrap,
    input,
    error(key) {
      if (key) {
        tx(err, key);
        input.setAttribute('aria-invalid', 'true');
      } else {
        err.textContent = '';
        labels.delete(err);
        err.classList.remove('i18n');
        input.removeAttribute('aria-invalid');
      }
    },
  };
}

interface Form {
  form: HTMLFormElement;
  banner(key: Key | null, params?: Params): void;
}

/** One form: fields, a polite banner above the submit, one terracotta submit with a busy state (a second submit is impossible). */
function makeForm(parts: HTMLElement[], submitKey: Key, onSubmit: () => Promise<void>, after: HTMLElement[] = []): Form {
  const form = el('form');
  form.noValidate = true;
  const banner = el('p', 'banner');
  banner.setAttribute('role', 'alert');
  const submit = el('button', 'btn primary wide', submitKey);
  submit.type = 'submit';
  let busy = false;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    submit.setAttribute('aria-busy', 'true');
    submit.style.minWidth = `${submit.offsetWidth}px`;
    const spin = el('span', 'spin');
    spin.setAttribute('aria-hidden', 'true');
    submit.replaceChildren(spin, tx(el('span'), 'auth.busy'));
    labels.delete(submit);
    submit.classList.remove('i18n');
    void onSubmit().finally(() => {
      busy = false;
      submit.removeAttribute('aria-busy');
      submit.style.minWidth = '';
      submit.replaceChildren();
      tx(submit, submitKey);
    });
  });
  form.append(...parts, banner, submit, ...after);
  return {
    form,
    banner(key, params) {
      if (key) tx(banner, key, params);
      else {
        banner.textContent = '';
        labels.delete(banner);
        banner.classList.remove('i18n');
      }
    },
  };
}

/** §7.2: the reset form shows at once; the token is checked by the confirm call. */
function resetForm(): void {
  tx($('title'), 'auth.reset.title');
  const pw = field('newPassword', 'auth.field.newPassword');
  const f = makeForm([pw.wrap], 'auth.reset.submit', async () => {
    pw.error(null);
    f.banner(null);
    const n = [...pw.input.value].length;
    if (n < PW_MIN || n > PW_MAX) {
      pw.error(n < PW_MIN ? 'auth.err.pwShort' : 'auth.err.pwLong');
      pw.input.focus();
      return;
    }
    const v = resetView(await call('POST', '/api/auth/reset/confirm', { token, password: pw.input.value }));
    if (v.kind === 'field') {
      pw.error(v.key);
      pw.input.focus();
    } else if (v.kind === 'banner') f.banner(v.key);
    else {
      pw.input.value = '';
      render(v);
    }
  }, [p('auth.reset.note', undefined, 'muted center')]);
  show(null, [f.form], [], coarse() ? null : pw.input);
}

/** §8.3: the add_email address has its own account; its password proves the address is the player's. */
function conflictForm(): void {
  const pw = field('currentPassword', 'auth.field.password');
  const forgot = el('a', 'link', 'auth.login.forgot');
  forgot.href = '/#forgot';
  forgot.rel = 'noreferrer';
  const f = makeForm([pw.wrap], 'auth.page.continue', async () => {
    pw.error(null);
    f.banner(null);
    if (!pw.input.value) {
      pw.error('auth.err.creds');
      pw.input.focus();
      return;
    }
    const v = conflictView(await call('POST', '/api/auth/verify/conflict', { token, password: pw.input.value }));
    if (v.kind === 'field') {
      pw.input.value = '';
      pw.error(v.key);
      pw.input.focus();
    } else if (v.kind === 'banner') f.banner(v.key);
    else {
      pw.input.value = '';
      render(v);
    }
  }, [forgot]);
  show('warn', [p('auth.page.conflict', undefined, 'lead'), p('auth.page.conflictHint'), f.form], [], coarse() ? null : pw.input);
}

/**
 * The web adapter's Turnstile check (src/platform/web/turnstile.ts), imported and created on first use:
 * neither its module nor Cloudflare's script loads unless an expired link asks for a new one.
 */
let check: Promise<HumanCheck> | null = null;
function humanCheck(): Promise<HumanCheck> {
  check ??= import('../src/platform/web/turnstile').then(({ createTurnstile, turnstileOptions }) => {
    const env = {
      window,
      document,
      setTimeout: (cb: () => void, ms: number) => window.setTimeout(cb, ms),
      clearTimeout: (id: unknown) => window.clearTimeout(id as number),
    } as unknown as PlatformEnv;
    return createTurnstile(env, turnstileOptions(import.meta.env).turnstileSiteKey);
  });
  check.catch(() => (check = null)); // a failed chunk load is retried by the next form
  return check;
}

/** §5.4 / §7.2 "Send a new link": email, Turnstile and Send, with the same reply whatever the address. */
function newLinkForm(action: Extract<HumanCheckAction, 'resend' | 'reset'>): void {
  const email = field('email', 'auth.field.email');
  const slot = el('div', 'ts');
  const note = p('auth.turnstileNote', undefined, 'muted');
  let widget: Promise<HumanCheckWidget>;
  const f = makeForm([email.wrap, slot, note], 'auth.check.sendAgain', async () => {
    email.error(null);
    f.banner(null);
    const addr = email.input.value.trim();
    if (!/^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(addr) || addr.length > 254) {
      email.error('auth.err.email');
      email.input.focus();
      return;
    }
    let human: string;
    try {
      human = await (await widget).token();
    } catch (e) {
      f.banner((e as Error).message === 'load_failed' ? 'auth.err.turnstileLoad' : 'auth.err.turnstile');
      (await widget).reset();
      return;
    }
    const r = await call('POST', action === 'resend' ? '/api/auth/verify/resend' : '/api/auth/reset/request', { email: addr, turnstile: human });
    const code = (r?.body as { error?: { code?: string } } | null)?.error?.code;
    if (r?.status === 202) {
      (await widget).remove();
      const go = linkButton('auth.page.toGame', '/', false);
      show('ok', [action === 'resend' ? p('auth.check.resent', undefined, 'lead') : p('auth.check.reset', { email: addr }, 'lead')], [go], go);
    } else if (!r) f.banner('auth.err.offline');
    else if (r.status === 429) f.banner('auth.page.rate');
    else if (code === 'turnstile_failed') {
      f.banner('auth.err.turnstile');
      (await widget).reset();
    } else if (code === 'invalid_email') {
      email.error('auth.err.email');
      email.input.focus();
    } else f.banner('auth.err.unavailable');
  });
  show(null, [f.form], [], coarse() ? null : email.input);
  widget = humanCheck().then((c) => c.mount(slot, { action, lang, onState: (s) => slot.classList.toggle('fold', s === 'ready') }));
}

// ---- start ----

for (const b of doc.querySelectorAll<HTMLButtonElement>('.lang button'))
  b.addEventListener('click', () => {
    lang = b.dataset.lang === 'ru' ? 'ru' : 'en';
    relabel();
  });
tx($('privacy'), 'auth.link.privacy');
tx($('terms'), 'auth.link.terms');
tx($('title'), variant === 'reset' ? 'auth.reset.title' : 'auth.page.titleEmail');
relabel();

if (!token) noToken();
else if (variant === 'reset') resetForm();
else void verify();
