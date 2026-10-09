/**
 * A small HTML text prompt over the canvas (Phaser has no text input). Works
 * in Telegram's webview and in browsers; resolves null when cancelled.
 */
export interface Field {
  name: string;
  label: string;
  placeholder?: string;
  maxLength: number;
  /** Initial text (e.g. the current name when renaming). */
  value?: string;
}

export function promptFields(title: string, fields: Field[], okLabel = 'OK', cancelLabel = 'Cancel'): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.id = 'px-prompt';
    wrap.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:1000;font-family:monospace';
    const box = document.createElement('form');
    box.style.cssText = 'background:#e7d6ad;border:3px solid #5a3d22;border-radius:6px;padding:14px;width:min(320px,86vw);color:#3a2414;box-shadow:0 4px 0 #1a1612';
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'font-weight:bold;margin-bottom:10px;color:#3a2414;text-transform:uppercase;letter-spacing:.06em';
    box.appendChild(h);
    const inputs: HTMLInputElement[] = [];
    for (const f of fields) {
      const l = document.createElement('label');
      l.textContent = f.label;
      l.style.cssText = 'display:block;font-size:12px;margin:6px 0 2px;text-transform:uppercase';
      const i = document.createElement('input');
      i.name = f.name;
      i.maxLength = f.maxLength;
      i.placeholder = f.placeholder ?? '';
      if (f.value) i.value = f.value;
      i.autocomplete = 'off';
      i.style.cssText = 'width:100%;box-sizing:border-box;padding:8px;font:inherit;font-size:16px;border:2px solid #5a3d22;border-radius:4px;background:#f0e3c2;color:#3a2414';
      box.appendChild(l);
      box.appendChild(i);
      inputs.push(i);
    }
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;margin-top:12px';
    const mk = (text: string, primary: boolean) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.type = primary ? 'submit' : 'button';
      b.style.cssText = `flex:1;padding:9px;font:inherit;text-transform:uppercase;border:2px solid #5a3d22;border-radius:4px;background:${primary ? '#a8432c' : '#7d5b30'};color:#fdf3de`;
      row.appendChild(b);
      return b;
    };
    const cancel = mk(cancelLabel, false);
    mk(okLabel, true);
    box.appendChild(row);
    wrap.appendChild(box);
    const done = (v: Record<string, string> | null) => {
      wrap.remove();
      resolve(v);
    };
    cancel.onclick = () => done(null);
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
