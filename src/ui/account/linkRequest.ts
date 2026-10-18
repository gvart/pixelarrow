/**
 * AU-14 the link request in the Mini App (design/ux/accounts-v6.md §8.6; V6-053/054), opened by the
 * deep link startapp=link_<code> (Boot routes it before first run). It names the web account that asks
 * (its display name and masked email, from the server), warns to continue only when the player started
 * it on the web, and says so plainly when this Telegram account has progress of its own (then a link
 * means choosing which account to keep, and the other is deleted).
 *
 * Link sends this launch's initData (POST …/complete): it records the Telegram account on the code and
 * links nothing; the web owner must confirm, and a conflict needs a choice from both sides, the Mini App
 * one from a newer launch. Not me cancels the code (and any conflict) at any step and tells the web owner.
 */
import { t } from '../../i18n';
import { online } from '../../platform/cloud';
import type { ApiClient, LinkPeek } from '../../platform/api';
import type { UiScene } from '../mosaic/subShell';
import { accountDeps, type AccountDeps } from './deps';
import { linkFail } from './linking';
import { openLinkSheet, type Body } from './linkSheet';

type RequestApi = Pick<ApiClient, 'linkPeek' | 'linkComplete' | 'linkNotMe'>;

export interface LinkRequestOpts {
  api?: RequestApi;
  d?: AccountDeps;
  onClose?: () => void;
}

export function openLinkRequest(scene: UiScene, code: string, o: LinkRequestOpts = {}): void {
  const api = o.api ?? online.api;
  const d = o.d ?? accountDeps();
  const sheet = openLinkSheet(scene, { title: t('link.tg.title'), id: 'link.tg.sheet', closeButton: false, onClose: o.onClose });
  const initData = () => d.proof();

  const close = (b: Body, label = t('common.close')) => b.button({ label, id: 'link.tg.close', variant: 'secondary', onClick: () => sheet.close() });
  const notMe = async () => {
    const proof = initData();
    sheet.show((b) => b.text(t('auth.busy'), 'pMuted'));
    try {
      if (!proof) throw new Error('no initData');
      await api.linkNotMe(proof);
    } catch (e) {
      return fail(e);
    }
    sheet.show((b) => {
      b.text(t('link.tg.notMeDone'), 'pGood');
      close(b);
    });
  };
  const fail = (e: unknown) => {
    const f = linkFail(e, 'tg');
    sheet.show((b) => {
      b.text(t(f.key), 'pBad');
      if (f.next === 'retry') b.button({ label: t('auth.retry'), id: 'link.tg.retry', variant: 'primary', onClick: () => void load() });
      close(b);
    });
  };

  const ask = (p: LinkPeek) =>
    sheet.show((b) => {
      b.text(t('link.tg.body'));
      b.gap(2);
      b.text(p.displayName, 'pInk', 9);
      if (p.emailMasked) b.text(p.emailMasked, 'pSec');
      b.gap(2);
      b.text(t('link.tg.warn'), 'pBad');
      if (p.conflict) b.text(t('link.tg.progress'), 'pBad');
      b.gap(4);
      b.pair(
        { label: t('link.notMe'), id: 'link.tg.notMe', variant: 'secondary', onClick: () => void notMe() },
        { label: t('link.tg.link'), id: 'link.tg.link', variant: 'primary', onClick: () => void complete(p) },
      );
    });

  const complete = async (p: LinkPeek) => {
    const proof = initData();
    sheet.show((b) => b.text(t('auth.busy'), 'pMuted'));
    try {
      if (!proof) throw new Error('no initData');
      await api.linkComplete(proof);
    } catch (e) {
      return fail(e);
    }
    sheet.show((b) => {
      b.text(t(p.conflict ? 'link.tg.almostConflict' : 'link.tg.almost'), 'pGood');
      close(b, t('link.tg.keep'));
      // still possible after Link (V6-053)
      b.button({ label: t('link.notMe'), id: 'link.tg.notMe', variant: 'neutral', onClick: () => void notMe() });
    });
  };

  const load = async () => {
    sheet.show((b) => b.text(t('common.loading'), 'pMuted'));
    try {
      ask(await api.linkPeek(code));
    } catch (e) {
      fail(e);
    }
  };
  void load();
}
