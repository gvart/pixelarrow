/**
 * Clan screen (screens-modes M-10): create a clan, share an invite link
 * through Telegram, join from an invite (start_param clan_<code>), members
 * with roles, and the leader's / officers' actions (promote, demote, hand
 * over, kick). Every string is in i18n (clan.en.ts, G12 / CLN-1); every
 * popup is a kit overlay (parchment sheet or confirm); Leave sits in the clan
 * banner, away from Invite, and confirms (A11Y-08).
 */
import Phaser from 'phaser';
import { BaseScene } from '../BaseScene';
import { ScrollArea, addIcon, scaleIcon, type FontKey } from '../../ui/kit';
import { MButton, SECTION_TITLE_H, SHEET_TITLE_H, SectionTitle, TAP, addCover, addPortraitWell, addSubShell, hasRaster, mosaicImage, mtext, mw, openParchmentSheet, sheetActionsH, type ParchmentSheetHandle } from '../../ui/mosaic';
import { makePressable } from '../../ui/mosaic/base';
import { openOverlays } from '../../ui/mosaic/ParchmentSheet';
import { uiId } from '../../ui/layout';
import { MOSAIC, TEXT_MIN, lineHeight } from '../../ui/tokens';
import { wrapText } from '../../ui/textfit';
import { confirmDialog, toast } from '../../ui/widgets';
import { addEconState } from '../../ui/econ/widgets';
import { econState, type EconState } from '../../game/economy';
import { inTelegram, openTelegramLink } from '../../platform/telegram';
import { hapticNotify } from '../../platform/haptics';
import { isApiError } from '../../platform/api';
import { canInvite, canKick, canPromote, ONLINE_RULES, type ClanRole } from '../../online/rules';
import { checkOnline, errorText, onlineApi, takePendingInvite, peekPendingInvite, type ClanMember, type ClanView } from '../../online/client';
import { SIM_VERSION_REJECTED } from '../../online/protocol';
import { online } from '../../platform/cloud';
import { t, tOr, type TKey } from '../../i18n';
import { promptFields } from './textInput';
import { isBlocked, validateClanName } from '../../../server/src/names/validate';

/** The war fresco (FirstRunScene loads the same key) over the no-clan card. */
const ART = { key: 'ui_fresco_war', file: 'ui/fresco_war.jpg' };
/** Line pitch of 6.5 UI px text (TEXT_MIN, A11Y-09). */
const LH = Math.ceil(lineHeight(TEXT_MIN));
const ROW_H = 30;
/** Server rules for a new clan tag (server/src/online/clans.ts CreateBody); names use the shared validator. */
const TAG_RE = /^[A-Za-z0-9]{2,5}$/;

/** The chip colour of each rank (never grey: grey means disabled). */
const ROLE_FILL: Record<ClanRole, number> = { leader: MOSAIC.bronze, officer: MOSAIC.teal, member: MOSAIC.bronzeLo };

export function roleName(r: ClanRole): string {
  return t(`clan.role.${r}` as TKey);
}

/** A clan call's failure as a line in the player's language (the server's own messages are English). */
export function clanError(e: unknown): string {
  if (!isApiError(e)) return t('clan.err.generic');
  if (e.code === SIM_VERSION_REJECTED) return errorText(e);
  if (e.offline || e.status === 0 || e.status >= 500) return t('econ.offline');
  return tOr(`clan.err.${e.code}`, t('clan.err.generic'));
}

/** Why a new clan's name or tag would be refused, or null. */
export function clanFormError(name: string, tag: string): string | null {
  const v = validateClanName(name);
  if (!v.ok) return v.reason === 'reserved' || v.reason === 'blocked' ? t('clan.form.notAllowed') : t('clan.form.badName');
  if (!TAG_RE.test(tag)) return t('clan.form.badTag');
  if (isBlocked(tag)) return t('clan.form.notAllowed');
  return null;
}

export class ClanScene extends BaseScene {
  private clan: ClanView | null = null;
  private role: ClanRole | null = null;
  private loaded = false;
  private st: EconState | 'loading' = 'loading';
  private me = 0;
  private area: ScrollArea | null = null;
  private busy = false;
  lastInvite: { code: string; link: string } | null = null;

  constructor() {
    super('OnlineClan');
  }

  create(): void {
    this.loaded = false;
    this.st = 'loading';
    this.area = null;
    this.initUi();
    this.screen({ back: () => this.back() });
    this.render();
    void this.fetchData();
  }

  private back(): void {
    this.scene.start('Online', {});
  }

  private async fetchData(): Promise<void> {
    const ok = await checkOnline();
    if (!this.sys.isActive()) return;
    if (!ok.ok) {
      this.st = ok.reason === 'outside' ? 'outside' : ok.reason === 'offline' ? 'offline' : ok.reason === 'unconfigured' ? 'closed' : 'error';
      return this.render();
    }
    try {
      const invite = peekPendingInvite();
      if (invite) {
        takePendingInvite();
        return this.offerJoin(invite);
      }
      const mine = await onlineApi.clanMine();
      if (!this.sys.isActive()) return;
      this.clan = mine.clan;
      this.role = mine.role;
      this.me = online.playerId ?? 0;
      this.loaded = true;
      this.render();
    } catch (e) {
      if (!this.sys.isActive()) return;
      this.st = econState(e);
      this.render();
    }
  }

  private retry(): void {
    this.st = 'loading';
    this.render();
    void this.fetchData();
  }

  private async act(fn: () => Promise<unknown>, ok?: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
      if (ok) {
        hapticNotify('success');
        toast(this, ok, 'good');
      }
      this.busy = false;
      await this.fetchData();
    } catch (e) {
      if (this.sys.isActive()) {
        hapticNotify('error');
        toast(this, clanError(e), 'bad');
      }
    } finally {
      this.busy = false;
    }
  }

  // ------------------------------------------------------------------ layout

  private render(): void {
    this.area?.destroy();
    this.area = null;
    this.ui.removeAll(true);
    const { content: c } = addSubShell(this, { title: t('clan.title'), back: () => this.back(), scroll: false });
    const box = { x: c.x + 3, y: c.y + 3, w: c.w - 6, h: c.h - 6 };
    if (!this.loaded) {
      if (this.st === 'loading') {
        const tx = mtext(this, box.x + box.w / 2, box.y + 40, t('clan.loading'), 'pSec', { align: 0.5, maxW: box.w - 12 });
        this.ui.add(tx);
        this.tweens.add({ targets: tx, alpha: { from: 1, to: 0.35 }, duration: 500, yoyo: true, repeat: -1 });
      } else addEconState(this, this.ui, box.x, box.y, box.w, box.h, this.st, () => this.retry());
      return;
    }
    if (!this.clan) this.renderNone(box);
    else this.renderClan(this.clan, box);
  }

  /** No clan: the war fresco, what a clan gives (three icon bullets), and Found a clan (CLN-4). */
  private renderNone(b: { x: number; y: number; w: number; h: number }): void {
    const tw = b.w - 34;
    const bullets: [string, string][] = [
      ['shield', t('clan.how.garrison')],
      ['map', t('clan.how.income')],
      ['people', t('clan.how.size', { max: ONLINE_RULES.clanMaxMembers })],
    ].map(([icon, text]) => [icon, wrapText(text, tw, 3, false, TEXT_MIN).lines.join('\n')] as [string, string]);
    const bulletH = (s: string) => Math.max(14, s.split('\n').length * LH + 4);
    // on the smallest screens the hint, then the lead line, give way so Found a clan stays on the card
    let hint = wrapText(t('clan.none.hint'), b.w - 16, 3, false, TEXT_MIN).lines;
    let lead = true;
    const need = () => 14 + (lead ? LH + 6 : 0) + bullets.reduce((a, [, s]) => a + bulletH(s), 0) + 4 + hint.length * LH + 8 + TAP + 8;
    if (need() > b.h - 6) hint = [];
    if (need() > b.h - 6) lead = false;
    const textH = need();
    const artH = Math.max(0, Math.min(96, b.h - textH - 4));
    const cardH = Math.min(b.h, artH + textH);
    const c = this.add.container(0, 0);
    this.ui.add(c);
    c.add(mosaicImage(this, b.x, b.y, b.w, cardH, 'parchment'));
    let y = b.y + 3;
    if (artH >= 40 && !this.textures.exists(ART.key)) this.loadArt();
    // the art's slot is kept while it loads, so Found a clan does not jump down under a finger when it lands
    if (artH >= 40) {
      if (hasRaster(this, ART.key)) c.add(addCover(this, b.x + 3, y, b.w - 6, artH - 3, ART.key));
      y += artH;
    } else y += 3;
    c.add(mtext(this, b.x + b.w / 2, y, t('clan.none.title'), 'rInk', { size: 8, align: 0.5, maxW: b.w - 12 }));
    y += 14;
    if (lead) {
      c.add(mtext(this, b.x + b.w / 2, y, t('clan.none.lead'), 'pInk', { size: TEXT_MIN, align: 0.5, maxW: b.w - 12 }));
      y += LH + 6;
    }
    for (const [icon, s] of bullets) {
      const h = bulletH(s);
      const ic = scaleIcon(addIcon(this, 0, 0, icon, ''), 1.1);
      ic.setPosition(b.x + 10, y + Math.round((h - 4 - ic.displayHeight) / 2));
      c.add(ic);
      c.add(mtext(this, b.x + 28, y + Math.round((h - 4 - s.split('\n').length * LH) / 2), s, 'pInk', { size: TEXT_MIN }));
      y += h;
    }
    y += 4;
    hint.forEach((l, i) => c.add(mtext(this, b.x + b.w / 2, y + i * LH, l, 'pSec', { size: TEXT_MIN, align: 0.5 })));
    y += hint.length * LH + 8;
    const bw = Math.min(b.w - 16, 130);
    c.add(new MButton(this, Math.round(b.x + (b.w - bw) / 2), y, bw, TAP, { label: t('clan.found'), icon: 'flag', variant: 'primary', id: 'clan.found', onClick: () => void this.create_() }));
  }

  /** Load the fresco once, after the screen is up (a preload would hold the scene back), then redraw (not under an open sheet: the art waits for the next draw). */
  private loadArt(): void {
    if (this.load.isLoading()) return;
    this.load.image(ART.key, ART.file);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => this.sys.isActive() && this.loaded && !this.clan && !openOverlays(this).length && this.render());
    this.load.start();
  }

  /** In a clan: the banner (crest, name, men, land, rank; Leave), the members, Invite at the foot. */
  private renderClan(cl: ClanView, b: { x: number; y: number; w: number; h: number }): void {
    const { S } = this.m;
    const { x, w } = b;
    // ---- the banner card (CLN-2)
    const crest = 30;
    const lw = Math.max(64, Math.min(90, Math.round(w * 0.42)));
    const stats = t('clan.stats', {
      men: t('clan.men', { n: cl.members.length, max: ONLINE_RULES.clanMaxMembers }),
      regions: t('clan.regions', { n: cl.regions }),
      role: this.role ? roleName(this.role) : '',
    });
    const statsLines = wrapText(stats, w - crest - 18, 2, false, TEXT_MIN).lines;
    const headH = Math.max(crest, 12 + statsLines.length * LH) + 6;
    const cardH = 6 + headH + 4 + TAP + 6;
    const y0 = b.y;
    this.ui.add(mosaicImage(this, x, y0, w, cardH, 'parchment'));
    addPortraitWell(this, this.ui, x + 7, y0 + 7, crest, MOSAIC.teal);
    const flag = scaleIcon(addIcon(this, 0, 0, 'flag', 'L'), 1.6);
    flag.setPosition(x + 7 + Math.round((crest - flag.displayWidth) / 2), y0 + 7 + Math.round((crest - flag.displayHeight) / 2));
    this.ui.add(flag);
    const tx = x + 7 + crest + 7;
    this.ui.add(mtext(this, tx, y0 + 8, `[${cl.tag}] ${cl.name}`, 'rInk', { size: 7.5, maxW: x + w - 6 - tx }));
    this.ui.add(mtext(this, tx, y0 + 20, statsLines.join('\n'), 'pSec', { size: TEXT_MIN }));
    const ry = y0 + 6 + headH + 4;
    const rule = this.add.graphics();
    rule.lineStyle(0.7, MOSAIC.parchEdge, 0.5);
    rule.lineBetween(x + 7, ry - 2, x + w - 7, ry - 2);
    this.ui.add(rule);
    this.ui.add(new MButton(this, x + w - 6 - lw, ry, lw, TAP, { label: t('clan.leave'), icon: 'close', variant: 'secondary', id: 'clan.leave', onClick: () => this.confirmLeave() }));
    // ---- Invite at the foot, with its reason when the rank cannot invite (CLN-3)
    const may = !!this.role && canInvite(this.role);
    const why = may ? [] : wrapText(t('clan.invite.why'), w - 8, 2, false, TEXT_MIN).lines;
    const whyH = why.length ? why.length * LH + 4 : 0;
    const by = b.y + b.h - TAP - whyH;
    const inv = new MButton(this, x, by, w, TAP, { label: t('clan.invite'), icon: 'people', variant: 'primary', id: 'clan.invite', onClick: () => void this.invite() });
    if (!may) inv.setEnabled(false, t('clan.invite.why'));
    this.ui.add(inv);
    why.forEach((l, i) => this.ui.add(mtext(this, x + w / 2, by + TAP + 3 + i * LH, l, 'pSec', { size: TEXT_MIN, align: 0.5 })));
    // ---- the members
    const top = y0 + cardH + 4;
    const area = new ScrollArea(this, this.ui, x, top, w, by - 6 - top, S);
    this.area = area;
    area.content.add(new SectionTitle(this, 0, 0, w, t('clan.members'), { size: 8 }));
    let y = SECTION_TITLE_H;
    for (const m of cl.members) {
      const manage = !!this.role && m.id !== this.me && (canKick(this.role, m.role) || canPromote(this.role, m.role, 'officer'));
      area.content.add(this.memberRow(area, m, y, w, manage));
      y += ROW_H + 2;
    }
    area.setContentHeight(y);
  }

  /** A member: name, land, a rank chip at the right; a chevron and the manage sheet when your rank may act on them. */
  private memberRow(area: ScrollArea, m: ClanMember, y: number, w: number, manage: boolean): Phaser.GameObjects.Container {
    const row = this.add.container(0, y);
    // the face scales from its centre when pressed
    const face = this.add.container(w / 2, ROW_H / 2);
    row.add(face);
    const at = <T extends Phaser.GameObjects.Components.Transform>(o: T): T => (o.setPosition(o.x - w / 2, o.y - ROW_H / 2), o);
    face.add(at(mosaicImage(this, 0, 0, w, ROW_H, m.id === this.me ? 'parchmentSel' : 'parchment')));
    const role = roleName(m.role);
    const chipW = Math.ceil(mw(role, 'onAccent', TEXT_MIN)) + 10;
    const right = w - 6 - (manage ? 12 : 0);
    const nameW = right - chipW - 6 - 8;
    face.add(at(mtext(this, 8, 5, m.name, 'rInk', { size: 7, maxW: nameW })));
    face.add(at(mtext(this, 8, 16, t('clan.regions', { n: m.regions }), 'pSec', { size: TEXT_MIN, maxW: nameW })));
    const chip = this.add.graphics();
    const cx = right - chipW;
    const cy = Math.round((ROW_H - 13) / 2);
    chip.fillStyle(0x1a0d06, 1);
    chip.fillRoundedRect(cx, cy, chipW, 13, 3);
    chip.fillStyle(ROLE_FILL[m.role], 1);
    chip.fillRoundedRect(cx + 0.7, cy + 0.7, chipW - 1.4, 11.6, 2.6);
    face.add(at(chip));
    face.add(at(mtext(this, cx + chipW / 2, cy + 2.5, role, 'onAccent', { size: TEXT_MIN, align: 0.5 })));
    if (manage) {
      const chev = scaleIcon(addIcon(this, 0, 0, 'chevR'), 0.8);
      chev.setPosition(w - 6 - 8, Math.round((ROW_H - chev.displayHeight) / 2));
      face.add(at(chev));
      makePressable(row, { face, w, h: ROW_H, onTap: () => !area.moved && this.manage(m) });
    }
    uiId(row, `clan.member.${m.id}`);
    return row;
  }

  // ------------------------------------------------------------------ actions

  private async create_(prev?: { name: string; tag: string }): Promise<void> {
    const v = await promptFields(
      t('clan.form.title'),
      [
        { name: 'name', label: t('clan.form.name'), placeholder: t('clan.form.namePh'), maxLength: 20, value: prev?.name },
        { name: 'tag', label: t('clan.form.tag'), placeholder: t('clan.form.tagPh'), maxLength: 5, value: prev?.tag },
      ],
      t('clan.form.ok'),
      t('common.cancel'),
    );
    if (!v || !this.sys.isActive()) return;
    const bad = clanFormError(v.name, v.tag);
    if (bad) {
      toast(this, bad, 'bad');
      return this.create_({ name: v.name, tag: v.tag });
    }
    await this.act(() => onlineApi.clanCreate(v.name, v.tag), t('clan.done.founded'));
  }

  private async invite(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const r = await onlineApi.clanInvite();
      if (!this.sys.isActive()) return;
      this.lastInvite = r;
      const text = t('clan.link.text', { tag: this.clan?.tag ?? '' });
      const share = `https://t.me/share/url?url=${encodeURIComponent(r.link)}&text=${encodeURIComponent(text)}`;
      if (inTelegram()) openTelegramLink(share);
      else {
        try {
          await navigator.clipboard?.writeText(r.link);
        } catch {
          /* no clipboard */
        }
      }
      this.showInvite(r.link, r.code, share);
    } catch (e) {
      if (this.sys.isActive()) toast(this, clanError(e), 'bad');
    } finally {
      this.busy = false;
    }
  }

  /** Centred lines of 6.5 UI px text in a sheet's body; returns the y under them. */
  private bodyLines(md: ParchmentSheetHandle, y: number, lines: { text: string; font?: FontKey }[]): number {
    for (const l of lines) {
      for (const s of wrapText(l.text, md.body.w, 3, false, TEXT_MIN).lines) {
        md.c.add(mtext(this, md.x + md.w / 2, y, s, l.font ?? 'pInk', { size: TEXT_MIN, align: 0.5 }));
        y += LH;
      }
      y += 2;
    }
    return y;
  }

  /** Height of `lines` as bodyLines draws them in a sheet `w` wide. */
  private linesH(w: number, lines: { text: string }[]): number {
    return lines.reduce((a, l) => a + wrapText(l.text, w - 16, 3, false, TEXT_MIN).lines.length * LH + 2, 0);
  }

  private sheetW(): number {
    return Math.min(this.m.VW - 16, 200);
  }

  private showInvite(link: string, code: string, share: string): void {
    const days = Math.round(ONLINE_RULES.inviteTtlMs / 864e5);
    const lines = [{ text: inTelegram() ? t('clan.link.sent') : t('clan.link.copied') }, { text: link.replace(/^https:\/\//, ''), font: 'pSec' as FontKey }, { text: t('clan.link.code', { code, days }) }];
    const w = this.sheetW();
    const actions = [{ label: t('clan.link.share'), icon: 'people', variant: 'primary' as const, id: 'clan.share', onClick: () => openTelegramLink(share) }];
    const md = openParchmentSheet(this, { title: t('clan.link.title'), w, h: SHEET_TITLE_H + this.linesH(w, lines) + 6 + sheetActionsH(actions, w) + 4, actions, id: 'clan.link' });
    this.bodyLines(md, md.body.y, lines);
  }

  manage(m: ClanMember): void {
    const role = this.role!;
    const acts: { label: string; run: () => void }[] = [];
    const done = (fn: () => Promise<unknown>, ok: string) => () => {
      md.close();
      void this.act(fn, ok);
    };
    if (canPromote(role, m.role, 'officer') && m.role === 'member') acts.push({ label: t('clan.manage.officer'), run: done(() => onlineApi.clanPromote(m.id, 'officer'), t('clan.done.officer', { name: m.name })) });
    if (canPromote(role, m.role, 'member') && m.role === 'officer') acts.push({ label: t('clan.manage.demote'), run: done(() => onlineApi.clanPromote(m.id, 'member'), t('clan.done.member', { name: m.name })) });
    if (canPromote(role, m.role, 'leader'))
      acts.push({
        label: t('clan.manage.lead'),
        run: () =>
          confirmDialog(this, { title: t('clan.lead.title'), body: t('clan.lead.body', { name: m.name }), ok: t('clan.manage.lead'), cancel: t('common.cancel'), onOk: done(() => onlineApi.clanPromote(m.id, 'leader'), t('clan.done.lead', { name: m.name })) }),
      });
    // the one destructive action: last, set apart, and it confirms (A11Y-08)
    const kick = canKick(role, m.role);
    const w = this.sheetW();
    const sub = `${roleName(m.role)} · ${t('clan.regions', { n: m.regions })}`;
    const h = SHEET_TITLE_H + LH + 6 + acts.length * (TAP + 4) + (kick ? 10 + TAP : 0) + 8;
    const md = openParchmentSheet(this, { title: m.name, w, h, id: 'clan.manage' });
    let y = this.bodyLines(md, md.body.y, [{ text: sub, font: 'pSec' }]) + 4;
    for (const a of acts) {
      md.c.add(new MButton(this, md.body.x, y, md.body.w, TAP, { label: a.label, variant: 'secondary', onClick: a.run }));
      y += TAP + 4;
    }
    if (kick) {
      y += 6;
      md.c.add(
        new MButton(this, md.body.x, y, md.body.w, TAP, {
          label: t('clan.manage.kick'),
          icon: 'close',
          variant: 'secondary',
          id: 'clan.kick',
          onClick: () =>
            confirmDialog(this, { title: t('clan.kick.title', { name: m.name }), body: t('clan.kick.body'), ok: t('clan.manage.kick'), cancel: t('common.cancel'), destructive: true, onOk: done(() => onlineApi.clanKick(m.id), t('clan.done.kick', { name: m.name })) }),
        }),
      );
    }
  }

  confirmLeave(): void {
    confirmDialog(this, {
      title: t('clan.leave.title'),
      body: t('clan.leave.body'),
      ok: t('clan.leave'),
      cancel: t('common.stay'),
      destructive: true,
      onOk: () => void this.act(() => onlineApi.clanLeave(), t('clan.done.left')),
    });
  }

  /** Arrived through an invite link: show the clan and offer to join. */
  private async offerJoin(code: string): Promise<void> {
    let preview: Awaited<ReturnType<typeof onlineApi.clanPreview>>;
    try {
      preview = await onlineApi.clanPreview(code);
    } catch (e) {
      if (!this.sys.isActive()) return;
      toast(this, clanError(e), 'bad');
      // show the player's own clan page under the message
      return this.fetchData();
    }
    if (!this.sys.isActive()) return;
    this.loaded = true;
    this.render();
    if (preview.clan) this.showJoin(code, preview.clan, !!preview.current);
  }

  /** The join offer: the clan, its size and land, Not now / Join (Join explains itself when you are in a clan). */
  showJoin(code: string, c: { name: string; tag: string; members: number; regions: number }, blocked: boolean): void {
    const lines = [{ text: `[${c.tag}] ${c.name}`, font: 'rInk' as FontKey }, { text: `${t('clan.join.size', { n: c.members })} · ${t('clan.regions', { n: c.regions })}`, font: 'pSec' as FontKey }, { text: blocked ? t('clan.join.leaveFirst') : t('clan.join.ask'), font: (blocked ? 'pBad' : 'pInk') as FontKey }];
    const w = this.sheetW();
    const actions = [
      {
        label: t('clan.join.later'),
        variant: 'secondary' as const,
        id: 'clan.join.later',
        onClick: () => {
          md.close();
          void this.fetchData();
        },
      },
      {
        label: t('clan.join.ok'),
        icon: 'flag',
        variant: 'primary' as const,
        id: 'clan.join.ok',
        onClick: () => {
          md.close();
          void this.act(() => onlineApi.clanJoin(code), t('clan.done.joined', { tag: c.tag }));
        },
      },
    ];
    const md = openParchmentSheet(this, { title: t('clan.join.title'), w, h: SHEET_TITLE_H + this.linesH(w, lines) + 6 + sheetActionsH(actions, w) + 4, actions, shadeCloses: false, id: 'clan.join' });
    this.bodyLines(md, md.body.y, lines);
    if (blocked) md.buttons[1]?.setEnabled(false, t('clan.join.leaveFirst'));
  }
}

