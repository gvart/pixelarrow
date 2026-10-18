/**
 * AuthForm (design/ux/accounts-v6.md §1.2, §12; pattern P26): the kit's HTML form over the canvas.
 * Typing happens in real DOM inputs, so password managers, autofill, the phone keyboard, paste,
 * screen readers and the Turnstile iframe all work; Phaser has no text input.
 *
 * `AuthHost` is the overlay: the 45% basalt scrim and one parchment card, at most one at a time. A form
 * that leads to another (log in → forgot password) replaces the card's content in place, and Back,
 * Escape or Cancel returns to the previous form with its fields kept; from the first form they close
 * the overlay. A tap on the scrim does not close it (a form). It is a nav layer, so the canvas keeps
 * its keyboard focus trapped under it and gets it back on close (V6-065); keys typed in the form never
 * reach the game's key router.
 *
 * `AuthForm` is one form: labels above fields, the eye on password fields, live hints, field errors
 * with aria-describedby, a polite live banner, an optional human-check slot (65 px reserved, collapsed
 * once a token arrives without a challenge), links, Cancel and one terracotta submit with a busy state.
 * Values never leave the form except through `onSubmit`, and nothing here logs them.
 */
import { lang, t } from '../../i18n';
import type { HumanCheck, HumanCheckAction, HumanCheckState, HumanCheckWidget } from '../../platform/core/auth';
import { navLayer } from '../../platform/nav';
import { motion } from '../motion';
import { FOCUS, MOSAIC } from '../tokens';
import { passwordLength, PASSWORD_MAX, PASSWORD_MIN, validEmail } from '../account/flows';

type FieldKind = 'email' | 'newPassword' | 'currentPassword' | 'nickname' | 'confirmWord' | 'text';

export interface FieldSpec {
  name: string;
  kind: FieldKind;
  label: string;
  value?: string;
  placeholder?: string;
  maxLength?: number;
}

export interface FormLink {
  id: string;
  label: string;
  onClick: () => void;
}

export interface AuthFormSpec {
  /** `data-form` on the <form> (scripts and tests find it by this). */
  id: string;
  title: string;
  /** A paragraph under the title. */
  intro?: string;
  fields: FieldSpec[];
  /** Links right after the fields (Forgot password?). */
  inlineLinks?: FormLink[];
  /** The human check (web: Turnstile) with this form's action; omitted where the platform has none. */
  humanCheck?: { check: HumanCheck; action: HumanCheckAction; privacyUrl: string };
  /** A line with links that open in a new tab: `text` holds `{key}` for each link. */
  legal?: { text: string; links: Record<string, { label: string; href: string }> };
  submitLabel: string;
  cancelLabel?: string;
  /** Links under the buttons (New here? Create account). */
  footLinks?: FormLink[];
  /** The submit: the form is busy until it settles, and a second submit is impossible meanwhile. */
  onSubmit: (values: Record<string, string>, form: AuthForm) => Promise<void>;
  /** The form left the overlay (Back, Cancel, Escape, close, or the caller's own back()): a form another one waits on resolves here. */
  onDispose?: () => void;
}

/** A kit colour (src/ui/tokens.ts MOSAIC) as CSS. */
const c = (k: keyof typeof MOSAIC): string => `#${MOSAIC[k].toString(16).padStart(6, '0')}`;
const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

const STYLE_ID = 'px-auth-style';

/** The kit's look in CSS, once (the parchment card of textInput.ts, plus the form parts). */
function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  const ring = `outline:2px solid ${hex(FOCUS.outer)};outline-offset:1px;box-shadow:0 0 0 4px ${hex(FOCUS.inner)}`;
  st.textContent = `
.px-auth{position:fixed;left:0;right:0;top:0;height:100%;z-index:1000;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;
  display:flex;align-items:flex-start;justify-content:center;box-sizing:border-box;background:rgba(22,18,15,.6);
  padding:calc(env(safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px) + 12vh) 16px calc(16px + env(safe-area-inset-bottom,0px));
  font:500 13px 'Inter',system-ui,sans-serif;color:${c('ink')};transition:opacity 180ms ease-out}
.px-auth .px-card{width:min(360px,100%);box-sizing:border-box;padding:14px 16px 16px;transition:transform 180ms ease-out;
  background:radial-gradient(ellipse at 50% 35%,${c('parchHi')} 0%,${c('parch')} 55%,${c('parchLo')} 100%);border:2px solid ${c('stone0')};border-radius:6px;
  box-shadow:inset 0 0 0 2px ${c('bronzeHi')},inset 0 0 0 3px ${c('parchEdge')},0 4px 0 ${c('stone0')},0 12px 28px rgba(0,0,0,.5);outline:none}
.px-auth.px-enter{opacity:0}.px-auth.px-enter .px-card{transform:translateY(12px)}
.px-auth.px-leave{opacity:0;transition-duration:120ms}
.px-auth.px-still,.px-auth.px-still *{transition:none!important;animation:none!important}
@media (prefers-reduced-motion:reduce){.px-auth,.px-auth *{transition:none!important;animation:none!important}}
@media (min-width:600px){.px-auth{padding-top:20vh}.px-auth .px-card{width:400px}}
@media (orientation:landscape) and (max-height:500px){.px-auth{padding-top:calc(8px + env(safe-area-inset-top,0px))}.px-auth .px-card{width:min(400px,100%)}}
@media (min-width:1024px) and (min-height:501px){.px-auth{align-items:center;padding-top:16px}.px-auth .px-card{width:420px}}
.px-auth .px-title{font:700 17px 'Cinzel','Cormorant SC',serif;text-transform:uppercase;letter-spacing:.06em;text-align:center;color:${c('ink')};padding:2px 0 9px;margin:0 0 6px;border-bottom:1px solid ${c('parchEdge')};box-shadow:0 1px 0 ${c('parchHi')}}
.px-auth p{margin:6px 0;line-height:1.4}
.px-auth .px-intro{color:${c('inkSec')}}
.px-auth label{display:block;color:${c('inkSec')};margin:10px 0 3px;font-weight:600}
.px-auth .px-field{position:relative}
.px-auth input{width:100%;box-sizing:border-box;min-height:44px;padding:8px 10px;font:500 16px 'Inter',system-ui,sans-serif;
  background:linear-gradient(180deg,${c('wellLo')} 0,${c('well')} 4px,${c('parchHi')} 100%);border:2px solid ${c('parchEdge')};border-radius:4px;color:${c('ink')};outline:none}
.px-auth input.px-pw{padding-right:48px}
.px-auth input:focus{border-color:${c('bronze')};box-shadow:0 0 0 2px ${c('bronzeHi')}}
.px-auth input[aria-invalid=true]{border-color:${c('inkBad')}}
.px-auth input::placeholder{color:${c('inkMuted')};opacity:.75}
.px-auth .px-eye{position:absolute;right:0;top:0;width:44px;height:44px;border:0;background:transparent;color:${c('inkSec')};cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
.px-auth .px-eye svg{width:22px;height:22px}
.px-auth .px-eye[aria-pressed=true]{color:${c('bronze')}}
.px-auth .px-hint{font-size:13px;color:${c('inkSec')};margin:4px 0 0}
.px-auth .px-hint.px-ok{color:${c('inkGood')}}
.px-auth .px-err{font-size:13px;color:${c('inkBad')};margin:4px 0 0;font-weight:600}
.px-auth .px-err:empty,.px-auth .px-banner:empty{display:none}
.px-auth .px-banner{margin:10px 0 0;padding:8px 10px;border:2px solid ${c('inkBad')};border-radius:4px;background:${c('well')};color:${c('inkBad')};font-weight:600}
.px-auth .px-banner button{margin-left:6px}
.px-auth .px-links{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:0 12px;margin-top:2px}
.px-auth .px-foot{justify-content:center;margin-top:8px}
.px-auth .px-link{min-height:44px;padding:0 4px;border:0;background:transparent;color:${c('ink')};font:600 13px 'Inter',system-ui,sans-serif;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.px-auth a{color:${c('ink')};font-weight:600;text-underline-offset:3px}
.px-auth a:hover,.px-auth .px-link:hover{color:${c('bronzeLo')}}
.px-auth .px-ts{height:65px;margin-top:10px;overflow:hidden;transition:height 180ms ease-out}
.px-auth .px-ts.px-fold{height:0;margin-top:0}
.px-auth .px-note{display:inline-block;font-size:13px;color:${c('inkMuted')};margin-top:4px;font-weight:500}
.px-auth .px-legal{font-size:13px;color:${c('inkSec')}}
.px-auth .px-row{display:flex;gap:8px;margin-top:12px}
.px-auth .px-row button{flex:1;min-height:44px;padding:8px 6px;font:700 14px 'Cinzel','Cormorant SC',serif;text-transform:uppercase;letter-spacing:.04em;
  color:${c('cream')};text-shadow:0 1px 0 rgba(0,0,0,.55);border:2px solid ${c('stone0')};border-radius:5px;cursor:pointer;transition:transform 60ms}
.px-auth .px-row button:active{transform:translateY(2px)}
.px-auth .px-primary{background:linear-gradient(180deg,${c('terraHi')},${c('terra')} 60%);box-shadow:inset 0 1px 0 rgba(255,255,255,.28),inset 0 -2px 0 ${c('terraLo')},0 3px 0 ${c('stone0')}}
.px-auth .px-bronze{background:linear-gradient(180deg,${c('bronzeHi')},${c('bronze')} 55%);box-shadow:inset 0 1px 0 rgba(255,255,255,.28),inset 0 -2px 0 ${c('bronzeLo')},0 3px 0 ${c('stone0')}}
.px-auth .px-link.px-asButton{min-height:44px;padding:8px 12px;border:2px solid ${c('stone0')};border-radius:5px;text-decoration:none;color:${c('cream')};background:linear-gradient(180deg,${c('bronzeHi')},${c('bronze')} 55%)}
.px-auth button[aria-busy=true]{cursor:progress}
.px-auth .px-spin{display:inline-block;width:12px;height:12px;margin-right:6px;vertical-align:-1px;border:2px solid ${c('cream')};border-right-color:transparent;border-radius:50%;animation:px-spin .8s linear infinite}
@keyframes px-spin{to{transform:rotate(360deg)}}
.px-auth button:focus-visible,.px-auth a:focus-visible{${ring}}
`;
  document.head.appendChild(st);
}

const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><path d="M3 3l18 18"/></svg>';

/** The input attributes of each field kind (accounts-v6.md §1.2). */
function inputAttrs(kind: FieldKind): Record<string, string> {
  switch (kind) {
    case 'email':
      return { type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false' };
    case 'newPassword':
      return { type: 'password', autocomplete: 'new-password' };
    case 'currentPassword':
      return { type: 'password', autocomplete: 'current-password' };
    case 'nickname':
      return { type: 'text', autocomplete: 'nickname', autocapitalize: 'off', spellcheck: 'false' };
    case 'confirmWord':
      return { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' };
    default:
      return { type: 'text', autocomplete: 'off' };
  }
}

let seq = 0;

interface FieldParts {
  spec: FieldSpec;
  input: HTMLInputElement;
  err: HTMLElement;
  hint: HTMLElement | null;
}

export class AuthForm {
  readonly el: HTMLFormElement;
  private readonly fields: FieldParts[] = [];
  private readonly banner: HTMLElement;
  private readonly submitBtn: HTMLButtonElement;
  private readonly slot: HTMLElement | null = null;
  private widget: HumanCheckWidget | null = null;
  private checkState: HumanCheckState | null = null;
  private busy = false;
  private readonly links = new Map<string, HTMLButtonElement>();

  constructor(
    readonly spec: AuthFormSpec,
    private readonly host: AuthHost,
  ) {
    const id = `px-auth-${++seq}`;
    const f = document.createElement('form');
    f.className = 'px-card';
    f.dataset.form = spec.id;
    f.noValidate = true; // our checks, our messages (the browser's bubbles are not localized with the game)
    f.method = 'post';
    f.tabIndex = -1;
    f.setAttribute('aria-labelledby', `${id}-title`);
    this.el = f;
    const h = el('h2', 'px-title', spec.title);
    h.id = `${id}-title`;
    f.append(h);
    if (spec.intro) f.append(el('p', 'px-intro', spec.intro));

    for (const fs of spec.fields) this.fields.push(this.addField(f, fs, `${id}-${fs.name}`));
    if (spec.inlineLinks?.length) f.append(this.linkRow(spec.inlineLinks, 'px-links'));

    if (spec.humanCheck) {
      const slot = el('div', 'px-ts');
      slot.dataset.slot = 'humanCheck';
      this.slot = slot;
      f.append(slot);
      const note = document.createElement('a');
      note.className = 'px-note';
      note.textContent = t('auth.turnstileNote');
      note.href = spec.humanCheck.privacyUrl;
      note.target = '_blank';
      note.rel = 'noopener noreferrer';
      f.append(note);
    }
    if (spec.legal) f.append(legalLine(spec.legal));

    this.banner = el('div', 'px-banner');
    this.banner.setAttribute('role', 'status');
    this.banner.setAttribute('aria-live', 'polite');
    f.append(this.banner);

    const row = el('div', 'px-row');
    const cancel = el('button', 'px-bronze', spec.cancelLabel ?? t('common.cancel')) as HTMLButtonElement;
    cancel.type = 'button';
    cancel.dataset.act = 'cancel';
    cancel.onclick = () => this.host.back();
    this.submitBtn = el('button', 'px-primary', spec.submitLabel) as HTMLButtonElement;
    this.submitBtn.type = 'submit';
    this.submitBtn.dataset.act = 'submit';
    row.append(cancel, this.submitBtn);
    f.append(row);
    if (spec.footLinks?.length) f.append(this.linkRow(spec.footLinks, 'px-links px-foot'));

    f.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
    // Enter in an earlier field moves to the next one; in the last it submits (§1.2)
    f.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return;
      const i = this.fields.findIndex((p) => p.input === e.target);
      if (i >= 0 && i < this.fields.length - 1) {
        e.preventDefault();
        this.fields[i + 1].input.focus();
      }
    });
  }

  private addField(f: HTMLFormElement, fs: FieldSpec, id: string): FieldParts {
    const l = el('label', '', fs.label) as HTMLLabelElement;
    l.htmlFor = id;
    const wrap = el('div', 'px-field');
    const input = document.createElement('input');
    input.id = id;
    input.name = fs.name;
    for (const [k, v] of Object.entries(inputAttrs(fs.kind))) input.setAttribute(k, v);
    input.maxLength = fs.maxLength ?? (fs.kind === 'email' ? 254 : fs.kind === 'newPassword' || fs.kind === 'currentPassword' ? 4096 : 64);
    if (fs.placeholder) input.placeholder = fs.placeholder;
    if (fs.value) input.value = fs.value;
    wrap.append(input);
    const pw = fs.kind === 'newPassword' || fs.kind === 'currentPassword';
    if (pw) {
      input.classList.add('px-pw');
      const eye = el('button', 'px-eye') as HTMLButtonElement;
      eye.type = 'button';
      eye.dataset.act = 'eye';
      const sync = (shown: boolean) => {
        eye.setAttribute('aria-pressed', String(shown));
        eye.setAttribute('aria-label', t(shown ? 'auth.field.hide' : 'auth.field.show'));
        eye.innerHTML = shown ? EYE_OFF : EYE;
        input.type = shown ? 'text' : 'password';
      };
      sync(false);
      eye.onclick = () => sync(input.type === 'password');
      wrap.append(eye);
    }
    const err = el('p', 'px-err');
    err.id = `${id}-err`;
    err.setAttribute('aria-live', 'polite');
    let hint: HTMLElement | null = null;
    if (fs.kind === 'newPassword') {
      hint = el('p', 'px-hint');
      hint.id = `${id}-hint`;
      hint.setAttribute('aria-live', 'polite');
    }
    input.setAttribute('aria-describedby', [hint?.id, err.id].filter(Boolean).join(' '));
    f.append(l, wrap);
    if (hint) f.append(hint);
    f.append(err);
    const parts: FieldParts = { spec: fs, input, err, hint };
    input.addEventListener('input', () => {
      if (err.textContent) this.setFieldError(fs.name, null);
      this.liveHint(parts);
    });
    // checks run on blur and on submit, never while the field is still being typed (§1.2)
    input.addEventListener('blur', () => {
      if (fs.kind === 'email' && input.value.trim() && !validEmail(input.value)) this.setFieldError(fs.name, t('auth.err.email'));
    });
    this.liveHint(parts);
    return parts;
  }

  /** "At least 10 characters · 7/10" until 10, then "✓ Long enough"; above 128 a field error (§5.2). */
  private liveHint(p: FieldParts): void {
    if (!p.hint) return;
    const n = passwordLength(p.input.value);
    const ok = n >= PASSWORD_MIN && n <= PASSWORD_MAX;
    p.hint.classList.toggle('px-ok', ok);
    p.hint.textContent = ok ? `✓ ${t('auth.pw.ok')}` : t('auth.pw.hint', { n: Math.min(n, PASSWORD_MIN) });
    if (n > PASSWORD_MAX) this.setFieldError(p.spec.name, t('auth.err.pwLong'));
  }

  private linkRow(links: FormLink[], cls: string): HTMLElement {
    const row = el('div', cls);
    for (const l of links) {
      const b = el('button', 'px-link', l.label) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.link = l.id;
      b.onclick = () => l.onClick();
      this.links.set(l.id, b);
      row.append(b);
    }
    return row;
  }

  /** Shown: mounts the human check (its script loads now, on first use only). */
  mounted(): void {
    const hc = this.spec.humanCheck;
    if (!hc || !this.slot || this.widget) return;
    this.widget = hc.check.mount(this.slot, { action: hc.action, lang: lang(), onState: (s) => this.onCheck(s) });
  }

  private onCheck(s: HumanCheckState): void {
    this.checkState = s;
    // the slot keeps its 65 px while a challenge may appear, and folds once a token came with none (§1.3)
    this.slot?.classList.toggle('px-fold', s === 'ready' || s === 'load_failed');
    if (s === 'load_failed') this.setBanner(t('auth.err.turnstileLoad'), { label: t('auth.retry'), onClick: () => this.retryCheck() });
  }

  /** A human-check token for this submit (the submit shows "Checking your browser…" while it waits). '' with no check. */
  async token(): Promise<string> {
    if (!this.widget) return '';
    if (this.checkState !== 'ready') this.setBusyLabel(t('auth.busyHuman'));
    try {
      return await this.widget.token();
    } finally {
      this.setBusyLabel(t('auth.busy'));
    }
  }

  /** The server or the widget refused the token: a fresh one for the next press. */
  resetCheck(): void {
    this.widget?.reset();
  }

  /** The check's script did not load: try again (the banner's Retry). */
  retryCheck(): void {
    this.setBanner(null);
    this.widget?.remove();
    this.widget = null;
    this.slot?.replaceChildren();
    this.mounted();
  }

  values(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const p of this.fields) out[p.spec.name] = p.input.value;
    return out;
  }

  setValue(name: string, v: string): void {
    const p = this.fields.find((x) => x.spec.name === name);
    if (p) {
      p.input.value = v;
      this.liveHint(p);
    }
  }

  focus(name?: string): void {
    const p = name ? this.fields.find((x) => x.spec.name === name) : this.fields[0];
    if (p) p.input.focus();
    else this.el.focus();
  }

  /** A message under a field (⚠ and text, never colour alone), or null to clear it. */
  setFieldError(name: string, msg: string | null): void {
    const p = this.fields.find((x) => x.spec.name === name);
    if (!p) return;
    p.err.textContent = msg ? `⚠ ${msg}` : '';
    if (msg) p.input.setAttribute('aria-invalid', 'true');
    else p.input.removeAttribute('aria-invalid');
  }

  /** The form's one banner above the buttons, with an optional inline action (Retry). */
  setBanner(msg: string | null, action?: { label: string; onClick: () => void }): void {
    this.banner.replaceChildren();
    if (!msg) return;
    this.banner.append(document.createTextNode(`⚠ ${msg}`));
    if (action) {
      const b = el('button', 'px-link', action.label) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.act = 'bannerAction';
      b.onclick = action.onClick;
      this.banner.append(b);
    }
  }

  clearErrors(): void {
    for (const p of this.fields) this.setFieldError(p.spec.name, null);
    this.setBanner(null);
  }

  /** A link that becomes a bronze button (log in: "Forgot password?" after 5 failures). */
  promoteLink(id: string): void {
    this.links.get(id)?.classList.add('px-asButton');
  }

  /** Busy: a spinner and the label in the submit, the same size, further presses ignored. */
  setBusy(on: boolean): void {
    this.busy = on;
    const b = this.submitBtn;
    if (on) {
      b.style.minWidth = `${b.offsetWidth}px`;
      b.setAttribute('aria-busy', 'true');
      this.setBusyLabel(t('auth.busy'));
    } else {
      b.removeAttribute('aria-busy');
      b.textContent = this.spec.submitLabel;
      b.style.minWidth = '';
    }
  }

  private setBusyLabel(label: string): void {
    if (!this.busy) return;
    const spin = el('span', 'px-spin');
    spin.setAttribute('aria-hidden', 'true');
    this.submitBtn.replaceChildren(spin, document.createTextNode(label));
  }

  get isBusy(): boolean {
    return this.busy;
  }

  private async submit(): Promise<void> {
    if (this.busy) return;
    this.clearErrors();
    this.setBusy(true);
    try {
      await this.spec.onSubmit(this.values(), this);
    } finally {
      if (this.el.isConnected) this.setBusy(false);
    }
  }

  /** Field errors move focus to the first invalid field; otherwise focus stays where it is. */
  focusFirstInvalid(): void {
    this.fields.find((p) => p.input.getAttribute('aria-invalid') === 'true')?.input.focus();
  }

  dispose(): void {
    this.widget?.remove();
    this.widget = null;
    this.spec.onDispose?.();
  }
}

/** The phone in landscape: the keyboard would cover the form, so it opens unfocused (§1.2). */
const phoneLandscape = (): boolean => !!window.matchMedia?.('(orientation: landscape) and (max-height: 500px)').matches;

/**
 * The overlay that holds the forms. One at a time: opening while one is up replaces the card's content
 * (the earlier form stays under it for Back).
 */
export class AuthHost {
  private static current: AuthHost | null = null;
  private readonly wrap: HTMLElement;
  private readonly stack: AuthForm[] = [];
  private closed = false;
  private readonly gone: (() => void)[] = [];
  /** Runs once when the overlay closes (Back from the first form, Cancel, or close()). */
  onClose: (() => void) | null = null;

  /** The open overlay, or a new one (`id`: the overlay element's id, for scripts; the text prompts use px-prompt). */
  static open(id = 'px-auth'): AuthHost {
    return AuthHost.current && !AuthHost.current.closed ? AuthHost.current : new AuthHost(id);
  }

  /** The overlay on screen, if any (scripts and the Kit). */
  static top(): AuthHost | null {
    return AuthHost.current && !AuthHost.current.closed ? AuthHost.current : null;
  }

  private constructor(id: string) {
    ensureStyle();
    AuthHost.current = this;
    const w = document.createElement('div');
    w.id = id;
    w.className = 'px-auth';
    w.setAttribute('role', 'dialog');
    w.setAttribute('aria-modal', 'true');
    if (motion.reduced) w.classList.add('px-still');
    w.classList.add('px-enter');
    this.wrap = w;
    // the game's key router never sees keys typed here; Escape is Back
    const stop = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.type === 'keydown' && e.key === 'Escape') {
        e.preventDefault();
        this.back();
      }
    };
    w.addEventListener('keydown', stop);
    w.addEventListener('keyup', (e) => e.stopPropagation());
    // nor its pointer: Phaser also listens on window and would take a press on the form for one on the canvas under it
    for (const type of ['mousedown', 'mouseup', 'touchstart', 'touchend', 'touchcancel']) w.addEventListener(type, (e) => e.stopPropagation());
    // follow the visible viewport (the phone keyboard) so Submit stays reachable by scrolling inside it
    const vv = window.visualViewport;
    const fit = () => {
      if (!vv) return;
      w.style.height = `${vv.height}px`;
      w.style.top = `${vv.offsetTop}px`;
    };
    fit();
    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    this.gone.push(() => (vv?.removeEventListener('resize', fit), vv?.removeEventListener('scroll', fit)));
    // Back (the platform's and the in-game one) goes back a form like Escape; the canvas focus waits under it
    navLayer({ once: (_ev: 'destroy', fn: () => void) => this.gone.push(fn) }, () => this.back());
    document.body.appendChild(w);
    requestAnimationFrame(() => w.classList.remove('px-enter'));
  }

  get form(): AuthForm | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  /** Shows `spec` in the card; the form under it is kept (with its fields) for Back. */
  push(spec: AuthFormSpec): AuthForm {
    const f = new AuthForm(spec, this);
    this.form?.el.remove();
    this.stack.push(f);
    this.show(f);
    return f;
  }

  /** Swaps the top form for `spec` (no way back to it): e.g. sign-up → its resend. */
  replace(spec: AuthFormSpec): AuthForm {
    const old = this.stack.pop();
    old?.dispose();
    old?.el.remove();
    return this.push(spec);
  }

  private show(f: AuthForm): void {
    this.wrap.replaceChildren(f.el);
    this.wrap.scrollTop = 0;
    f.mounted();
    if (phoneLandscape()) f.el.focus({ preventScroll: true });
    else f.focus();
  }

  /** Back, Escape and Cancel: the previous form, or close from the first one. A busy form stays. */
  back(): void | false {
    if (this.form?.isBusy) return false;
    const f = this.stack.pop();
    f?.dispose();
    f?.el.remove();
    const prev = this.form;
    if (!prev) return this.close();
    this.show(prev);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (AuthHost.current === this) AuthHost.current = null;
    for (const f of this.stack.splice(0)) f.dispose();
    this.gone.splice(0).forEach((fn) => fn());
    const w = this.wrap;
    if (motion.reduced) w.remove();
    else {
      w.classList.add('px-leave');
      setTimeout(() => w.remove(), 120);
    }
    w.style.pointerEvents = 'none';
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.onClose?.();
  }
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** "By creating an account you accept the {terms} and have read the {privacy}." with real links. */
function legalLine(legal: NonNullable<AuthFormSpec['legal']>): HTMLElement {
  const p = el('p', 'px-legal');
  for (const part of legal.text.split(/(\{\w+\})/)) {
    const m = /^\{(\w+)\}$/.exec(part);
    const link = m && legal.links[m[1]];
    if (!link) {
      if (part) p.append(document.createTextNode(part));
      continue;
    }
    const a = document.createElement('a');
    a.href = link.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = link.label;
    p.append(a);
  }
  return p;
}

