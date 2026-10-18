/**
 * AU-13 Link Telegram (design/ux/accounts-v6.md §8.5; ADR-0009 §3, V6-054), on the web from the Account
 * page's Telegram row. One sheet, three steps:
 *
 *   1. Open Pixelarrow in Telegram: Open Telegram (the deep link in a new tab), the QR code of the same
 *      link (shown with a mouse; behind "Show QR code" on touch), Copy link, and the code's countdown.
 *      Without a bot username on the server there is no link: the start code and Copy code instead.
 *   2. Tap "Link" there.
 *   3. Come back and confirm here: "Telegram account @x wants to link to <name>. Is this you?" with
 *      Not me and Confirm link.
 *
 * Getting the code and confirming are sensitive (Confirm it's you, then one retry). The status is polled
 * every 3 s while the sheet is open and the game is in front (paused in the background). The sheet's X
 * and Not me drop the code; Confirm opens AU-16 when both accounts have progress. Only the creating
 * session sees the request, and the link code is never logged or stored on the device.
 */
import { t } from '../../i18n';
import { platform } from '../../platform';
import { online } from '../../platform/cloud';
import type { ApiClient, LinkCode } from '../../platform/api';
import { runCountdown, mtext } from '../mosaic';
import { QrCode } from '../mosaic/qr';
import { StepList, type StepState } from '../mosaic/StepList';
import type { UiScene } from '../mosaic/subShell';
import { toast } from '../widgets';
import { accountDeps, type AccountDeps } from './deps';
import { ReauthCancelled } from './methods';
import { sensitive } from './reauth';
import { openChangePassword } from './changePassword';
import { linkFail, POLL_MS, webView, type WebView } from './linking';
import { Body, openLinkSheet } from './linkSheet';
import { openWebConflict } from './conflict';

type LinkApi = Pick<ApiClient, 'linkStart' | 'linkAbandon' | 'linkStatus' | 'linkConfirm' | 'conflict' | 'resolveConflict'>;

interface LinkTelegramOpts {
  /** The account's name ("…wants to link to SwiftArcher4821"). */
  displayName: string;
  /** Confirm it's you asks for the password (a web account always has one). */
  hasPassword: boolean;
  /** Linked (or the conflict sheet took over and finished): the Account page re-reads. */
  onDone: () => void;
  /** Stand-ins (Kit, layout check); the Worker API by default. */
  api?: LinkApi;
  d?: AccountDeps;
  /** The layout check: show the QR code on any pointer. */
  showQr?: boolean;
}

export function openLinkTelegram(scene: UiScene, o: LinkTelegramOpts): void {
  const api = o.api ?? online.api;
  const d = o.d ?? accountDeps();
  let code: LinkCode | null = null;
  let finished = false;
  let qr = o.showQr ?? platform.input.finePointer();
  let offline = false;
  let view: WebView | null = null;
  let stopTimer: (() => void) | null = null;
  // wall-clock polling: the game's own clock slows down when the page isn't in front
  let poll: ReturnType<typeof setInterval> | null = null;
  let inflight = false;
  // polling pauses while the game is in the background (the player is usually in Telegram) and catches up on return
  let active = true;

  const stopPoll = () => {
    if (poll) clearInterval(poll);
    poll = null;
    stopTimer?.();
    stopTimer = null;
  };
  const sheet = openLinkSheet(scene, {
    title: t('link.title'),
    id: 'link.sheet',
    onClose: () => {
      stopPoll();
      offActive();
      // the X: an unspent code goes (it would expire anyway)
      if (code && !finished) void api.linkAbandon().catch(() => undefined);
    },
  });
  // the scene went away under the sheet: nothing keeps polling
  sheet.m.c.once('destroy', () => (stopPoll(), offActive()));
  const offActive = platform.onActive((on) => {
    active = on;
    if (on && poll) void check();
  });

  const end = (build: (b: Body) => void) => {
    stopPoll();
    sheet.show(build);
  };
  const close = (b: Body) => b.button({ label: t('common.close'), id: 'link.close', variant: 'secondary', onClick: () => sheet.close() });
  const fail = (e: unknown) => {
    if (e instanceof ReauthCancelled) return sheet.close();
    const f = linkFail(e, 'browser');
    end((b) => {
      b.text(t(f.key, { name: o.displayName }), 'pBad');
      if (f.next === 'newCode') b.button({ label: t('link.newCode'), id: 'link.newCode', variant: 'primary', onClick: () => void start() });
      else if (f.next === 'retry') b.button({ label: t('auth.retry'), id: 'link.retry', variant: 'primary', onClick: () => void (code ? check(true) : start()) });
      close(b);
    });
  };

  /** Steps 1–3 for the current view. */
  const steps = () => {
    if (!code || !view) return;
    const c = code;
    const ask = view.step === 'ask' ? view : null;
    sheet.show((b) => {
      const indent = StepList.indent;
      const sw = b.w - indent;
      const state = (i: number): StepState => (ask ? (i < 2 ? 'done' : 'current') : i === 0 ? 'current' : 'pending');
      // measure step 1's and step 3's slots by building them in a scratch container first
      const slot = (build: (s: Body) => void) => {
        const tmp = scene.add.container(0, 0);
        const s = new Body(scene, tmp, sw);
        build(s);
        return { tmp, h: s.y };
      };
      const one = !ask ? slot((s) => stepOne(s, c)) : null;
      const three = ask ? slot((s) => stepThree(s, ask.tg)) : null;
      const list = new StepList(scene, 0, b.y, b.w, [
        { title: t('link.step1'), state: state(0), slot: one?.h },
        { title: t('link.step2'), state: state(1) },
        { title: t('link.step3'), state: state(2), slot: three?.h },
      ]);
      b.into.add(list);
      for (const [s, i] of [[one, 0], [three, 2]] as const) {
        if (!s) continue;
        s.tmp.setPosition(indent, b.y + list.slotY(i));
        b.into.add(s.tmp);
      }
      b.y += list.h + 4;
      // the countdown: the code's own life, and a lost connection says so under it
      const tl = mtext(scene, 0, b.y, '', 'pSec', { size: 7, maxW: b.w, wrap: true });
      b.into.add(tl);
      stopTimer?.();
      stopTimer = runCountdown(
        scene,
        Math.max(0, (view && 'expiresAt' in view ? view.expiresAt : c.expiresAt) - d.now()),
        (time) => tl.scene && tl.setText(t('link.waiting', { time }) + (offline ? `\n${t('link.reconnecting')}` : '')),
        () => void check(true),
      );
      b.y += 22;
    });
  };

  /** Step 1's controls: Open Telegram, the QR code with Copy link (or the start code), the timer. */
  const stepOne = (s: Body, c: LinkCode) => {
    const link = c.deepLink;
    if (!link) {
      // no bot username configured: no link to open or draw; the start code is the fallback
      s.text(t('link.noBot'), 'pSec');
      s.token(`link_${c.code}`, 'pInk', 7.5);
      s.button({ label: t('link.copyCode'), id: 'link.copyCode', variant: 'secondary', onClick: () => void copy(`link_${c.code}`) });
      return;
    }
    s.button({ label: t('link.open'), id: 'link.open', variant: 'primary', onClick: () => platform.share.openExternal(link) });
    if (!qr) {
      s.button({ label: t('link.showQr'), id: 'link.showQr', variant: 'neutral', onClick: () => ((qr = true), steps()) });
      s.button({ label: t('link.copy'), id: 'link.copy', variant: 'secondary', onClick: () => void copy(link) });
      return;
    }
    s.text(t('link.qr'), 'pSec');
    const side = Math.min(112, s.w);
    const code = new QrCode(scene, s.x, s.y, link, side, 'link.qr');
    s.put(code, code.side);
    // the link itself next to the code: what a screen reader and a careful eye can check (§13.5)
    s.token(link);
    s.button({ label: t('link.copy'), id: 'link.copy', variant: 'secondary', onClick: () => void copy(link) });
  };

  /** Step 3: who asked, and the decision. */
  const stepThree = (s: Body, tg: string) => {
    s.text(t('link.ask', { tg, name: o.displayName }));
    s.pair(
      { label: t('link.notMe'), id: 'link.notMe', variant: 'secondary', onClick: () => void notMe() },
      { label: t('link.confirm'), id: 'link.confirm', variant: 'primary', onClick: () => void confirm() },
    );
  };

  const copy = async (text: string) => {
    const r = await platform.share.invite(text, t('link.title'));
    if (scene.sys.isActive()) toast(scene, t(r === 'failed' ? 'link.copyFailed' : 'link.copied'), r === 'failed' ? 'bad' : 'good');
  };

  const apply = (v: WebView) => {
    const was = view?.step;
    view = v;
    switch (v.step) {
      case 'waiting':
      case 'ask':
        if (was !== v.step) steps();
        return;
      case 'conflict':
        finished = true;
        stopPoll();
        sheet.close();
        return openWebConflict(scene, v.id, { hasPassword: o.hasPassword, onDone: o.onDone, api, d });
      case 'linked':
        finished = true;
        end((b) => {
          b.text(t('link.done'), 'pGood');
          b.button({ label: t('link.doneBtn'), id: 'link.done', variant: 'primary', onClick: () => sheet.close() });
        });
        return o.onDone();
      case 'cancelled':
        return end((b) => {
          b.text(t('link.cancelledTg'), 'pBad');
          b.text(t('link.notMeBody'), 'pSec');
          close(b);
        });
      case 'expired':
        return end((b) => {
          b.text(t('link.expired'), 'pBad');
          b.button({ label: t('link.newCode'), id: 'link.newCode', variant: 'primary', onClick: () => void start() });
          close(b);
        });
    }
  };

  /** One status read (`force`: also in the background, when the countdown ran out). */
  const check = async (force = false) => {
    if (inflight || !sheet.live || finished || (!active && !force)) return;
    inflight = true;
    try {
      const s = await api.linkStatus();
      if (offline) {
        offline = false;
        if (view) steps();
      }
      if (sheet.live) apply(webView(s));
    } catch (e) {
      const f = linkFail(e, 'browser');
      // a lost connection keeps polling with "Reconnecting…"; anything else ends the sheet
      if (f.next === 'retry') {
        if (!offline) {
          offline = true;
          steps();
        }
      } else fail(e);
    } finally {
      inflight = false;
    }
  };

  const start = async () => {
    stopPoll();
    finished = false;
    view = null;
    sheet.show((b) => b.text(t('link.creating'), 'pMuted'));
    try {
      code = await sensitive(scene, d, o.hasPassword, () => api.linkStart());
    } catch (e) {
      return fail(e);
    }
    if (!sheet.live) return void api.linkAbandon().catch(() => undefined);
    apply({ step: 'waiting', expiresAt: code.expiresAt });
    poll = setInterval(() => void check(), POLL_MS);
    void check();
  };

  const confirm = async () => {
    stopPoll();
    sheet.show((b) => b.text(t('auth.busy'), 'pMuted'));
    try {
      const r = await sensitive(scene, d, o.hasPassword, () => api.linkConfirm());
      if ('conflict' in r) return apply({ step: 'conflict', id: r.conflict });
      finished = true;
      end((b) => {
        b.text(t('link.done'), 'pGood');
        if (r.removedEmpty) b.text(t('conflict.autoNote'), 'pSec');
        b.button({ label: t('link.doneBtn'), id: 'link.done', variant: 'primary', onClick: () => sheet.close() });
      });
      o.onDone();
    } catch (e) {
      fail(e);
    }
  };

  const notMe = async () => {
    finished = true;
    end((b) => {
      b.text(t('link.notMeTitle'), 'pInk', 8);
      b.text(t('link.notMeBody'));
      if (o.hasPassword)
        b.button({
          label: t('account.changePassword'),
          id: 'link.changePassword',
          variant: 'primary',
          onClick: () => {
            sheet.close();
            openChangePassword(scene, d, { onReload: o.onDone, onDone: o.onDone });
          },
        });
      close(b);
    });
    await api.linkAbandon().catch(() => undefined);
  };

  void start();
}
