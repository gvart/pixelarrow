/**
 * A small HTML text form over the canvas (Phaser has no text input); resolves null when cancelled.
 * A thin wrapper over the kit's AuthForm (src/ui/form/authForm.ts, accounts-v6.md §12) for the plain
 * text prompts (clan names, preset names): the same parchment card, scrim, Back and Escape, and keys
 * and presses that never reach the game under it.
 */
import { t } from '../../i18n';
import { AuthHost } from '../../ui/form/authForm';

export interface Field {
  name: string;
  label: string;
  placeholder?: string;
  maxLength: number;
  /** Initial text (e.g. the current name when renaming). */
  value?: string;
}

export function promptFields(title: string, fields: Field[], okLabel = t('common.ok'), cancelLabel = t('common.cancel')): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    let done = false;
    const host = AuthHost.open('px-prompt');
    host.onClose = () => {
      if (!done) resolve(null);
      done = true;
    };
    const form = host.push({
      id: 'prompt',
      title,
      fields: fields.map((f) => ({ name: f.name, kind: 'text', label: f.label, placeholder: f.placeholder, maxLength: f.maxLength, value: f.value })),
      submitLabel: okLabel,
      cancelLabel,
      async onSubmit(v) {
        const out: Record<string, string> = {};
        for (const f of fields) out[f.name] = (v[f.name] ?? '').trim();
        done = true;
        host.close();
        resolve(out);
      },
    });
    form.el.querySelector('input')?.select();
  });
}
