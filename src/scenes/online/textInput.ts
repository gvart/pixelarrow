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

export function promptFields(title: string, fields: Field[], okLabel = t('common.ok'), cancelLabel = t('common.cancel')): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.id = 'px-prompt';
    wrap.style.cssText =
      'position:fixed;inset:0;background:rgba(22,18,15,.45);display:flex;align-items:flex-start;justify-content:center;z-index:1000;' +
      'padding-top:calc(var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px) + 12vh);box-sizing:border-box';
    const box = document.createElement('form');
    box.style.cssText =
      'background:#e7d6ad;border:2px solid #5a3d22;border-radius:6px;padding:12px 14px 14px;width:min(320px,calc(100vw - 32px));box-sizing:border-box;color:#3a2414;box-shadow:0 4px 0 #1a1612;font:' +
      BODY;
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = `font:${HEAD};text-transform:uppercase;letter-spacing:.04em;text-align:center;color:#3a2414;padding-bottom:8px;margin-bottom:6px;border-bottom:1px solid rgba(90,61,34,.7)`;
    box.appendChild(h);
    const inputs: HTMLInputElement[] = [];
    for (const f of fields) {
      const l = document.createElement('label');
      l.textContent = f.label;
      l.htmlFor = `px-prompt-${f.name}`;
      l.style.cssText = `display:block;font:${BODY};color:#5e4129;margin:8px 0 3px`;
      const i = document.createElement('input');
      i.id = `px-prompt-${f.name}`;
      i.name = f.name;
      i.maxLength = f.maxLength;
      i.placeholder = f.placeholder ?? '';
      if (f.value) i.value = f.value;
      i.autocomplete = 'off';
      i.style.cssText =
        "width:100%;box-sizing:border-box;min-height:44px;padding:8px 10px;font:500 16px 'Inter',system-ui,sans-serif;border:2px solid #5a3d22;border-radius:4px;background:#f0e3c2;color:#3a2414;box-shadow:inset 0 2px 0 #d6be90";
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
      b.style.cssText = `flex:1;min-height:44px;padding:8px 6px;font:${HEAD};font-size:13px;text-transform:uppercase;letter-spacing:.03em;border:2px solid #1a1612;border-radius:5px;background:${primary ? '#a8432c' : '#7d5b30'};color:#fdf3de;box-shadow:inset 0 1px 0 ${primary ? '#c9573a' : '#c9a066'}`;
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
