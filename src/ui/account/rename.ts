/**
 * AU-18 Rename form (design/ux/accounts-v6.md §9.4; ADR-0009 §6): one HTML field prefilled with the
 * current name and selected, a live counter with the rules under it, and the cost line above Save
 * ("first change free", or the next possible date). The shared validator checks on blur and on submit;
 * the server decides (renameError maps its codes to the same messages). Save stays off while the field
 * holds the current name, so no request is sent for nothing.
 */
import { t } from '../../i18n';
import type { ApiClient, NameStatus } from '../../platform/api';
import { online } from '../../platform/cloud';
import { AuthHost, type AuthForm } from '../form/authForm';
import type { UiScene } from '../mosaic/subShell';
import { toast } from '../widgets';
import { costLine, localNameError, NAME_MAX, renameError, sameName, type NameMessage } from './nameRules';

export interface RenameOpts {
  current: string;
  status: NameStatus;
  api?: Pick<ApiClient, 'rename'>;
  now?: () => number;
  /** Renamed: the new name and the rules' new state. */
  onDone?: (name: string, status: NameStatus) => void;
}

export function openRename(scene: UiScene, o: RenameOpts): AuthForm {
  const api = o.api ?? online.api;
  const now = o.now ?? Date.now;
  const host = AuthHost.open();
  const say = (f: AuthForm, m: NameMessage) => {
    const msg = t(m.key, m.params);
    if (!m.field) return f.setBanner(msg);
    f.setFieldError('name', msg);
    f.focus('name');
  };
  const form = host.push({
    id: 'rename',
    title: t('name.renameTitle'),
    fields: [{ name: 'name', kind: 'nickname', label: t('name.field'), value: o.current, maxLength: NAME_MAX }],
    submitLabel: t('name.save'),
    async onSubmit(v, f) {
      const bad = localNameError(v.name);
      if (bad) return say(f, bad);
      let r: Awaited<ReturnType<typeof api.rename>>;
      try {
        r = await api.rename(v.name);
      } catch (e) {
        return say(f, renameError(e));
      }
      host.close();
      if (scene.sys.isActive()) toast(scene, t('name.changed', { name: r.displayName }), 'good', 4000);
      o.onDone?.(r.displayName, r.name);
    },
  });
  const el = form.el;
  const input = el.querySelector<HTMLInputElement>('input[name=name]')!;
  const submit = el.querySelector<HTMLButtonElement>('[data-act=submit]')!;
  // the counter and the rules, as the password's hint: announced with the field
  const hint = document.createElement('p');
  hint.className = 'px-hint';
  hint.id = `${input.id}-hint`;
  hint.setAttribute('aria-live', 'polite');
  input.closest('.px-field')!.after(hint);
  input.setAttribute('aria-describedby', `${hint.id} ${input.getAttribute('aria-describedby') ?? ''}`.trim());
  // the cost, just above the buttons (§9.4: known before pressing)
  const cost = document.createElement('p');
  cost.className = 'px-intro';
  cost.dataset.line = 'cost';
  const c = costLine(o.status, now());
  cost.textContent = t(c.key, c.params);
  el.querySelector('.px-banner')!.before(cost);
  const sync = () => {
    hint.textContent = `${t('name.count', { n: [...input.value].length })} · ${t('name.rules')}`;
    submit.disabled = sameName(input.value, o.current);
  };
  input.addEventListener('input', sync);
  input.addEventListener('blur', () => {
    const bad = input.value.trim() && !sameName(input.value, o.current) ? localNameError(input.value) : null;
    if (bad) form.setFieldError('name', t(bad.key, bad.params));
  });
  sync();
  input.select();
  return form;
}
