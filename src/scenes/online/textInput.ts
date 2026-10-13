/**
 * A small HTML text form over the canvas (Phaser has no text input). Works
 * in Telegram's webview and in browsers; resolves null when cancelled.
 *
 * Dressed as the kit's parchment sheet (WAR-02, CLN-3): 45% basalt scrim,
 * parchment card with a Cinzel title over a rule, Inter labels at 13 px or
 * more, a sunken input, and 44 px buttons (Cancel bronze, OK terracotta) with
 * localized default labels. It sits in the upper part of the screen so the
 * phone keyboard does not cover it. Back (Telegram's or the in-game one) and
 * Escape cancel it, like any other sheet; a tap outside does not (a form).
 */
import { t } from '../../i18n';
import { navLayer } from '../../platform/nav';
import { MOSAIC } from '../../ui/tokens';

export interface Field {
  name: string;
  label: string;
  placeholder?: string;
  maxLength: number;
  /** Initial text (e.g. the current name when renaming). */
  value?: string;
}

const HEAD = "700 15px 'Cinzel','Cormorant SC',serif";
const BODY = "500 13px 'Inter',system-ui,sans-serif";

/** A kit colour (src/ui/tokens.ts MOSAIC) as CSS. */
const c = (k: keyof typeof MOSAIC): string => `#${MOSAIC[k].toString(16).padStart(6, '0')}`;

/** The kit's look in CSS, once: the parchment sheet in its stone and bronze frame, a sunken well, bevelled bronze and terracotta keys. */
function ensureStyle(): void {
  if (document.getElementById('px-prompt-style')) return;
  const st = document.createElement('style');
  st.id = 'px-prompt-style';
  st.textContent = `
#px-prompt form{background:radial-gradient(ellipse at 50% 35%,${c('parchHi')} 0%,${c('parch')} 55%,${c('parchLo')} 100%);border:2px solid ${c('stone0')};border-radius:6px;box-shadow:inset 0 0 0 2px ${c('bronzeHi')},inset 0 0 0 3px ${c('parchEdge')},0 4px 0 ${c('stone0')},0 12px 28px rgba(0,0,0,.5)}
#px-prompt .px-title{font:700 17px 'Cinzel','Cormorant SC',serif;text-transform:uppercase;letter-spacing:.06em;text-align:center;color:${c('ink')};padding:2px 0 9px;margin-bottom:6px;border-bottom:1px solid ${c('parchEdge')};box-shadow:0 1px 0 ${c('parchHi')}}
#px-prompt input{background:linear-gradient(180deg,${c('wellLo')} 0,${c('well')} 4px,${c('parchHi')} 100%);border:2px solid ${c('parchEdge')};border-radius:4px;color:${c('ink')};outline:none}
#px-prompt input:focus{border-color:${c('bronze')};box-shadow:0 0 0 2px ${c('bronzeHi')}}
#px-prompt input::placeholder{color:${c('inkMuted')};opacity:.75}
#px-prompt button{color:${c('cream')};text-shadow:0 1px 0 rgba(0,0,0,.55);border:2px solid ${c('stone0')};border-radius:5px;cursor:pointer;transition:transform 60ms}
#px-prompt button.px-primary{background:linear-gradient(180deg,${c('terraHi')},${c('terra')} 60%);box-shadow:inset 0 1px 0 rgba(255,255,255,.28),inset 0 -2px 0 ${c('terraLo')},0 3px 0 ${c('stone0')}}
#px-prompt button.px-bronze{background:linear-gradient(180deg,${c('bronzeHi')},${c('bronze')} 55%);box-shadow:inset 0 1px 0 rgba(255,255,255,.28),inset 0 -2px 0 ${c('bronzeLo')},0 3px 0 ${c('stone0')}}
#px-prompt button:active{transform:translateY(2px);box-shadow:inset 0 1px 0 rgba(255,255,255,.2),0 1px 0 ${c('stone0')}}
`;
  document.head.appendChild(st);
}

export function promptFields(title: string, fields: Field[], okLabel = t('common.ok'), cancelLabel = t('common.cancel')): Promise<Record<string, string> | null> {
  ensureStyle();
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.id = 'px-prompt';
    wrap.style.cssText =
      'position:fixed;inset:0;background:rgba(22,18,15,.6);display:flex;align-items:flex-start;justify-content:center;z-index:1000;' +
      'padding-top:calc(var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px) + 12vh);box-sizing:border-box';
    const box = document.createElement('form');
    box.style.cssText =
      `padding:14px 16px 16px;width:min(320px,calc(100vw - 32px));box-sizing:border-box;color:${c('ink')};font:` + BODY;
    const h = document.createElement('div');
    h.textContent = title;
    h.className = 'px-title';
    box.appendChild(h);
    const inputs: HTMLInputElement[] = [];
    for (const f of fields) {
      const l = document.createElement('label');
      l.textContent = f.label;
      l.htmlFor = `px-prompt-${f.name}`;
      l.style.cssText = `display:block;font:${BODY};color:${c('inkSec')};margin:8px 0 3px`;
      const i = document.createElement('input');
      i.id = `px-prompt-${f.name}`;
      i.name = f.name;
      i.maxLength = f.maxLength;
      i.placeholder = f.placeholder ?? '';
      if (f.value) i.value = f.value;
      i.autocomplete = 'off';
      i.style.cssText = "width:100%;box-sizing:border-box;min-height:44px;padding:8px 10px;font:500 16px 'Inter',system-ui,sans-serif";
      box.appendChild(l);
      box.appendChild(i);
      inputs.push(i);
    }
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;margin-top:14px';
    const mk = (text: string, primary: boolean) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.type = primary ? 'submit' : 'button';
      b.className = primary ? 'px-primary' : 'px-bronze';
      b.style.cssText = `flex:1;min-height:44px;padding:8px 6px;font:${HEAD};font-size:14px;text-transform:uppercase;letter-spacing:.04em`;
      row.appendChild(b);
      return b;
    };
    const cancel = mk(cancelLabel, false);
    mk(okLabel, true);
    box.appendChild(row);
    wrap.appendChild(box);
    // Back closes it like a sheet: a nav layer that goes away with the form
    const gone: (() => void)[] = [];
    let finished = false;
    const done = (v: Record<string, string> | null) => {
      if (finished) return;
      finished = true;
      wrap.remove();
      gone.forEach((f) => f());
      resolve(v);
    };
    navLayer({ once: (_ev: 'destroy', fn: () => void) => gone.push(fn) }, () => done(null));
    cancel.onclick = () => done(null);
    wrap.addEventListener('keydown', (e) => e.key === 'Escape' && done(null));
    box.onsubmit = (e) => {
      e.preventDefault();
      const out: Record<string, string> = {};
      for (const i of inputs) out[i.name] = i.value.trim();
      done(out);
    };
    document.body.appendChild(wrap);
    inputs[0]?.focus();
    inputs[0]?.select();
  });
}
