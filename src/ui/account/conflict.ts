/**
 * AU-16 Choose which account to keep (design/ux/accounts-v6.md §8.7; ADR-0009 §5 as amended by V6-053):
 * a link found the identity on another player and both have progress. There is never a merge: one
 * account is kept with both sign-ins, the other is deleted. BOTH sides must make the same choice:
 *
 * - the web (`openWebConflict`, from AU-13's Confirm or `#account/conflict/<id>`): the two cards, a pick,
 *   the loser's name typed, re-auth; then it waits (202 waiting_telegram) and polls until the Mini App
 *   chose. The same choice → it posts again and the link completes; a different one → nothing changes.
 * - the Mini App (`openTelegramConflict`, found by `checkTelegramConflicts` when the Account page or the
 *   bot's button opens the game): "This Telegram account" and "Web account asking" (its name and masked
 *   email), what each has, and which one would be deleted; the same pick and typed name; Not me at any
 *   time. Its choice needs initData from a launch newer than the "Link" tap (else Reopen), so the tap
 *   that linked can never also choose.
 *
 * A forced survivor (purchases) is preselected and the other card is off with the reason. The danger
 * button names the account it deletes and is never the terracotta primary.
 */
import { lang, t, type TKey } from '../../i18n';
import { platform } from '../../platform';
import { online } from '../../platform/cloud';
import type { ApiClient, ConflictSide, ConflictView, TelegramConflict } from '../../platform/api';
import { AuthHost, type AuthForm } from '../form/authForm';
import { ChoiceCard, choiceColumns, type ChoiceCardOpts } from '../mosaic/ChoiceCard';
import { runCountdown, mtext, GAP } from '../mosaic';
import type { UiScene } from '../mosaic/subShell';
import { legalUrl } from '../legal';
import { toast } from '../widgets';
import { accountDeps, type AccountDeps } from './deps';
import { ReauthCancelled } from './methods';
import { sensitive } from './reauth';
import { cardState, conflictCards, factLines, linkFail, POLL_MS, typedMatches, waitingStep, type LinkFail } from './linking';
import { openLinkSheet, type Body, type LinkSheet } from './linkSheet';

type ConflictApi = Pick<ApiClient, 'conflict' | 'resolveConflict'>;
type TelegramApi = Pick<ApiClient, 'telegramConflicts' | 'chooseFromTelegram' | 'linkNotMe'>;

const facts = (s: ConflictSide) => factLines(s).map((f) => t(f.key, f.params));

/** The typed confirmation (an AuthForm over the sheet): Submit turns on only when the name matches. */
function typedConfirm(loser: string, onConfirm: (typed: string, f: AuthForm) => Promise<void>): AuthForm {
  const host = AuthHost.open();
  const form = host.push({
    id: 'conflictConfirm',
    title: t('conflict.sheetTitle'),
    intro: t('conflict.type', { name: loser }),
    fields: [{ name: 'confirm', kind: 'confirmWord', label: t('conflict.typeField'), maxLength: 64 }],
    submitLabel: t('conflict.go', { name: loser }),
    async onSubmit(v, f) {
      if (!typedMatches(v.confirm, loser)) {
        f.setFieldError('confirm', t('conflict.typeMismatch', { name: loser }));
        return f.focus('confirm');
      }
      await onConfirm(v.confirm, f);
    },
  });
  const submit = form.el.querySelector<HTMLButtonElement>('[data-act=submit]');
  const input = form.el.querySelector<HTMLInputElement>('input[name=confirm]');
  const sync = () => submit && (submit.disabled = !typedMatches(input?.value ?? '', loser));
  input?.addEventListener('input', sync);
  sync();
  return form;
}

/** Lays out two cards (two-up from 600 CSS px, else stacked, "this" side first) and keeps their states. */
function cards<S extends string>(
  scene: UiScene,
  b: Body,
  sides: { side: S; opts: Omit<ChoiceCardOpts, 'onPick'> }[],
  forced: S | undefined,
  picked: S | null,
  onPick: (s: S) => void,
): void {
  const two = choiceColumns(b.w + 16, scene.m.S);
  const cw = two ? Math.floor((b.w - GAP) / 2) : b.w;
  const hs = sides.map((s) => ChoiceCard.measure(scene, cw, { ...s.opts, onPick: () => undefined }));
  // side by side, both as tall as the taller; stacked, each its own height
  const ch = Math.max(...hs);
  let y = b.y;
  sides.forEach((s, i) => {
    const h = two ? ch : hs[i];
    const card = new ChoiceCard(scene, two ? b.x + i * (cw + GAP) : b.x, y, cw, h, { ...s.opts, onPick: () => onPick(s.side) });
    card.setState(cardState(s.side, picked, forced));
    b.into.add(card);
    if (!two) y += h + GAP;
  });
  b.y = (two ? b.y + ch + GAP : y) + GAP;
}

/** A closing message (or a support link) in the sheet. */
function finish(sheet: LinkSheet, f: LinkFail | { key: Parameters<typeof t>[0] }, params: Record<string, string>, extra?: (b: Body) => void): void {
  sheet.show((b) => {
    b.text(t(f.key, params), 'pBad');
    if ('next' in f && f.next === 'support')
      b.button({ label: t('conflict.contactSupport'), id: 'conflict.support', variant: 'secondary', onClick: () => platform.share.openExternal(legalUrl('privacy', lang())) });
    extra?.(b);
    b.button({ label: t('common.close'), id: 'conflict.close', variant: 'secondary', onClick: () => sheet.close() });
  });
}

// ------------------------------------------------------------------ the web side

export interface WebConflictOpts {
  hasPassword: boolean;
  onDone: () => void;
  api?: ConflictApi;
  d?: AccountDeps;
  /** A stand-in view (Kit, layout check): nothing is sent. */
  demo?: ConflictView;
}

export function openWebConflict(scene: UiScene, id: string, o: WebConflictOpts): void {
  const api = o.api ?? online.api;
  const d = o.d ?? accountDeps();
  let poll: ReturnType<typeof setInterval> | null = null;
  let stopTimer: (() => void) | null = null;
  const stop = () => {
    if (poll) clearInterval(poll);
    poll = null;
    stopTimer?.();
    stopTimer = null;
  };
  const sheet = openLinkSheet(scene, { title: t('conflict.sheetTitle'), id: 'conflict.sheet', onClose: stop });
  sheet.m.c.once('destroy', stop);
  let v: ConflictView | null = null;
  let picked: 'this' | 'other' | null = null;
  let chosen: { keep: 'this' | 'other'; typed: string } | null = null;
  const loserOf = (keep: 'this' | 'other') => (keep === 'this' ? v!.other : v!.this).displayName;

  const fail = (e: unknown) => {
    if (e instanceof ReauthCancelled) return;
    stop();
    const f = linkFail(e, 'browser');
    // the Mini App chose the other account: the server ended the conflict before its time
    const differ = chosen && v && f.key === 'conflict.expired' && d.now() < v.expiresAt;
    finish(sheet, differ ? { key: 'conflict.differ' } : f, { name: chosen ? loserOf(chosen.keep) : '' });
  };

  const choose = () => {
    if (!v) return;
    const view = v;
    sheet.show((b) => {
      b.text(t('conflict.body'));
      cards(
        scene,
        b,
        (['this', 'other'] as const).map((side) => ({
          side,
          opts: {
            title: t(side === 'this' ? 'conflict.this' : 'conflict.other'),
            name: view[side].displayName,
            facts: facts(view[side]),
            keepLabel: t('conflict.keep'),
            keptLabel: t('conflict.kept'),
            reason: view.forced ? t(view.forced === side ? 'conflict.forcedPurchases' : 'conflict.forcedOff') : undefined,
            id: `conflict.card.${side}`,
          },
        })),
        view.forced,
        picked,
        (s) => ((picked = s), choose()),
      );
      const keep = picked;
      b.button({
        label: keep ? t('conflict.go', { name: loserOf(keep) }) : t('conflict.pick'),
        id: 'conflict.go',
        variant: 'destructive',
        off: keep ? undefined : t('conflict.pick'),
        onClick: () => keep && typedConfirm(loserOf(keep), (typed, f) => resolve(keep, typed, f)),
      });
      b.button({ label: t('common.cancel'), id: 'conflict.cancel', variant: 'secondary', onClick: () => sheet.close() });
    });
  };

  const resolve = async (keep: 'this' | 'other', typed: string, f?: AuthForm) => {
    try {
      const r = await sensitive(scene, d, o.hasPassword, () => api.resolveConflict(id, keep, typed));
      AuthHost.top()?.close();
      chosen = { keep, typed };
      if (r.status === 'waiting_telegram') return waiting();
      stop();
      sheet.close();
      if (scene.sys.isActive()) toast(scene, t('conflict.done', { name: loserOf(keep) }), 'good', 4000);
      // the kept account isn't the one this browser was signed in to: the game starts again in it
      if (r.switched) setTimeout(() => location.reload(), 1200);
      else o.onDone();
    } catch (e) {
      const m = linkFail(e, 'browser');
      if (f && m.next === 'field') {
        f.setFieldError('confirm', t(m.key, { name: loserOf(keep) }));
        return f.focus('confirm');
      }
      if (e instanceof ReauthCancelled) return;
      AuthHost.top()?.close();
      fail(e);
    }
  };

  const waiting = () => {
    if (!v || !chosen) return;
    const view = v;
    sheet.show((b) => {
      b.text(t('conflict.waitTg'));
      b.text(t('conflict.go', { name: loserOf(chosen!.keep) }), 'pSec');
      const tl = mtext(scene, 0, b.y, '', 'pSec', { size: 7 });
      b.into.add(tl);
      b.y += 14;
      stopTimer?.();
      stopTimer = runCountdown(scene, Math.max(0, view.expiresAt - d.now()), (time) => tl.scene && tl.setText(time), () => void check());
      b.button({ label: t('conflict.checkAgain'), id: 'conflict.check', variant: 'secondary', onClick: () => void check(true) });
      b.button({ label: t('common.close'), id: 'conflict.close', variant: 'neutral', onClick: () => sheet.close() });
    });
    poll ??= setInterval(() => void check(), POLL_MS);
  };

  let inflight = false;
  /** One look at the Mini App's choice; `manual` (Check again) may ask Confirm it's you, a poll never does. */
  const check = async (manual = false) => {
    if (inflight || !chosen || !sheet.live) return;
    inflight = true;
    try {
      v = manual ? await sensitive(scene, d, o.hasPassword, () => api.conflict(id)) : await api.conflict(id);
      const step = waitingStep(v, chosen.keep);
      if (step === 'resolve') {
        stop();
        await resolve(chosen.keep, chosen.typed);
      } else if (step === 'differ') {
        stop();
        finish(sheet, { key: 'conflict.differ' }, {});
      }
    } catch (e) {
      const m = linkFail(e, 'browser');
      if (m.next !== 'retry' && !(e instanceof ReauthCancelled)) {
        if ((e as { code?: string }).code === 'reauth_required') stop();
        else fail(e);
      }
    } finally {
      inflight = false;
    }
  };

  const load = async () => {
    sheet.show((b) => b.text(t('common.loading'), 'pMuted'));
    try {
      v = o.demo ?? (await sensitive(scene, d, o.hasPassword, () => api.conflict(id)));
    } catch (e) {
      if (e instanceof ReauthCancelled) return sheet.close();
      return fail(e);
    }
    // this side already chose (the sheet was reopened): the same card, and the name is typed again
    picked = v.choices.web ?? conflictCards(v.forced).picked;
    choose();
  };
  void load();
}

// ------------------------------------------------------------------ the Mini App side

export interface TelegramConflictOpts {
  api?: TelegramApi;
  d?: AccountDeps;
}

/** One check per launch (each launch has its own initData): a conflict this Telegram user must decide opens its sheet. */
let checkedFor: string | null = null;

export async function checkTelegramConflicts(scene: UiScene, o: TelegramConflictOpts = {}): Promise<boolean> {
  const api = o.api ?? online.api;
  const d = o.d ?? accountDeps();
  const initData = d.proof();
  if (!initData || checkedFor === initData) return false;
  checkedFor = initData;
  let list: TelegramConflict[];
  try {
    ({ conflicts: list } = await api.telegramConflicts(initData));
  } catch {
    // stale initData or offline: the bot's message can bring the player back
    checkedFor = null;
    return false;
  }
  const open = list.find((c) => c.choices.telegram === null);
  if (!open || !scene.sys.isActive()) return false;
  openTelegramConflict(scene, open, o);
  return true;
}

type TgSide = 'telegram' | 'web';
const OTHER: Record<TgSide, TgSide> = { telegram: 'web', web: 'telegram' };
const TG_TITLE: Record<TgSide, TKey> = { telegram: 'conflict.tg.mine', web: 'conflict.tg.asking' };

export function openTelegramConflict(scene: UiScene, c: TelegramConflict, o: TelegramConflictOpts = {}): void {
  const api = o.api ?? online.api;
  const d = o.d ?? accountDeps();
  // closed undecided: the Account page asks again on its next open
  const sheet = openLinkSheet(scene, { title: t('conflict.sheetTitle'), id: 'conflict.tg.sheet', onClose: () => (checkedFor = null) });
  let picked = conflictCards(c.forced).picked;
  const loserOf = (keep: TgSide) => c[OTHER[keep]].displayName;
  const proof = () => d.proof() ?? '';

  const notMe = async () => {
    sheet.show((b) => b.text(t('auth.busy'), 'pMuted'));
    try {
      await api.linkNotMe(proof());
      finish(sheet, { key: 'link.tg.notMeDone' }, {});
    } catch (e) {
      tgFail(e);
    }
  };
  const notMeButton = (b: Body) => b.button({ label: t('link.notMe'), id: 'conflict.tg.notMe', variant: 'secondary', onClick: () => void notMe() });
  const tgFail = (e: unknown) => {
    const f = linkFail(e, 'choose');
    if (f.next === 'reopen')
      return sheet.show((b) => {
        b.text(t(f.key), 'pBad');
        b.button({ label: t('reauth.reopenBtn'), id: 'conflict.tg.reopen', variant: 'primary', onClick: () => void (d.reopen?.() || toast(scene, t('reauth.reopenFailed'), 'info')) });
        notMeButton(b);
      });
    finish(sheet, f, { name: picked ? loserOf(picked) : '' }, f.next === 'retry' ? notMeButton : undefined);
  };

  const choose = () =>
    sheet.show((b) => {
      b.text(t('conflict.tg.body'));
      // "Not me" at any step (V6-053), before anything else: cancels the link and tells the web account's owner
      notMeButton(b);
      cards(
        scene,
        b,
        (['telegram', 'web'] as const).map((side) => ({
          side,
          opts: {
            title: t(TG_TITLE[side]),
            name: c[side].displayName,
            // the web account that asks shows its masked email: whose account this really is
            sub: (c[side] as { emailMasked?: string | null }).emailMasked ?? null,
            facts: facts(c[side]),
            keepLabel: t('conflict.keep'),
            keptLabel: t('conflict.kept'),
            reason: c.forced ? t(c.forced === side ? 'conflict.forcedPurchases' : 'conflict.forcedOff') : undefined,
            id: `conflict.tg.card.${side}`,
          },
        })),
        c.forced,
        picked,
        (s) => ((picked = s), choose()),
      );
      const keep = picked;
      b.button({
        label: keep ? t('conflict.go', { name: loserOf(keep) }) : t('conflict.pick'),
        id: 'conflict.tg.go',
        variant: 'destructive',
        off: keep ? undefined : t('conflict.pick'),
        onClick: () =>
          keep &&
          typedConfirm(loserOf(keep), async () => {
            try {
              await api.chooseFromTelegram(c.id, proof(), keep);
            } catch (e) {
              AuthHost.top()?.close();
              return tgFail(e);
            }
            AuthHost.top()?.close();
            sheet.show((bb) => {
              bb.text(t('conflict.waitWeb'), 'pGood');
              bb.text(t('conflict.go', { name: loserOf(keep) }), 'pSec');
              bb.button({ label: t('common.close'), id: 'conflict.tg.close', variant: 'secondary', onClick: () => sheet.close() });
              notMeButton(bb);
            });
          }),
      });
    });

  choose();
}
