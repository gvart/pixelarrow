/**
 * Clan screen: create a clan, share an invite link through Telegram, join
 * from an invite (start_param clan_<code>), members with roles, and the
 * leader's / officers' actions (promote, demote, hand over, kick).
 */
import { BaseScene } from '../BaseScene';
import { ScrollArea } from '../../ui/kit';
import { MButton, ParchmentRow, ROW_H, TAP, mosaicImage, mtext, openParchmentSheet, addSubShell } from '../../ui/mosaic';
import { LINE_H, wrapText } from '../../ui/textfit';
import { hapticNotify } from '../../platform/telegram';
import { inTelegram, openTelegramLink } from '../../platform/telegram';
import { canInvite, canKick, canPromote, ONLINE_RULES, type ClanRole } from '../../online/rules';
import { checkOnline, errorText, onlineApi, takePendingInvite, peekPendingInvite, type ClanMember, type ClanView } from '../../online/client';
import { button, lines } from './common';
import type { Modal } from '../../ui/widgets';
import { online } from '../../platform/cloud';
import { promptFields } from './textInput';

export class ClanScene extends BaseScene {
  private clan: ClanView | null = null;
  private role: ClanRole | null = null;
  private loaded = false;
  private msg = 'Loading...';
  private me = 0;
  private modal: Modal | null = null;
  private area: ScrollArea | null = null;
  private busy = false;
  lastInvite: { code: string; link: string } | null = null;

  constructor() {
    super('OnlineClan');
  }

  create(): void {
    this.loaded = false;
    this.modal = null;
    this.area = null;
    this.initUi();
    this.screen({ back: () => this.back() });
    this.render();
    void this.fetchData();
  }

  private back(): void {
    if (this.modal) return this.closeModal();
    this.scene.start('Online', {});
  }

  private async fetchData(): Promise<void> {
    const ok = await checkOnline();
    if (!this.sys.isActive()) return;
    if (!ok.ok) {
      this.msg = ok.message;
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
      this.msg = errorText(e);
      this.render();
    }
  }

  /** A parchment sheet that Back (Telegram's or ours) closes, and a tap outside it unless `shadeCloses` is false. */
  private openM(h: number, title: string, shadeCloses = true): Modal {
    const md: Modal = openParchmentSheet(this, { closeButton: false,
      title,
      w: 184,
      h,
      shadeCloses,
      onClose: () => {
        if (this.modal === md) this.modal = null;
      },
    });
    return md;
  }

  private closeModal(): void {
    this.modal?.close();
    this.modal = null;
  }

  private async act(fn: () => Promise<unknown>, ok?: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
      if (ok) {
        hapticNotify('success');
        this.flash(ok);
      }
      this.busy = false;
      await this.fetchData();
    } catch (e) {
      if (this.sys.isActive()) {
        hapticNotify('error');
        this.flash(errorText(e));
      }
    } finally {
      this.busy = false;
    }
  }

  private flash(text: string): void {
    const { VW } = this.m;
    const c = this.add.container(0, 0);
    const w = VW - 32;
    const wr = wrapText(text, w - 14, 3).lines;
    const h = wr.length * LINE_H + 10;
    c.add(mosaicImage(this, 16, 36, w, h, 'sheet'));
    wr.forEach((l, i) => c.add(mtext(this, VW / 2, 41 + i * LINE_H, l, 'pInk', { align: 0.5 })));
    this.ui.add(c);
    this.time.delayedCall(2400, () => c.destroy());
  }

  private render(): void {
    this.area?.destroy();
    this.area = null;
    this.ui.removeAll(true);
    this.modal = null;
    const { VW, S } = this.m;
    const { content: c } = addSubShell(this, { title: 'Clan', back: () => this.back(), scroll: false });
    const w = c.w - 6;
    const x = c.x + 3;
    if (!this.loaded) {
      this.ui.add(mtext(this, VW / 2, c.y + 40, this.msg, 'pInk', { align: 0.5, maxW: c.w - 12 }));
      return;
    }
    if (!this.clan) {
      const cardH = 116;
      this.ui.add(mosaicImage(this, x, c.y + 4, w, cardH, 'parchment'));
      const holder = this.add.container(0, 0);
      this.ui.add(holder);
      holder.add(mtext(this, VW / 2, c.y + 12, 'No clan', 'rInk', { size: 8, align: 0.5 }));
      const y = lines(this, holder, VW / 2, c.y + 28, ['Clans share their land:', 'members garrison each other', 'and earn more next to clan land.', 'Found one, or ask a leader for', 'an invite link.'], 'pInk', w - 14);
      button(this, holder, Math.round(VW / 2 - 60), y + 6, 120, 24, 'Found a clan', () => void this.create_(), { icon: 'flag', sel: true });
      return;
    }
    const cl = this.clan;
    // the clan: its tag and name, how many men, how much land, your rank
    const headH = 28;
    this.ui.add(mosaicImage(this, x, c.y + 3, w, headH, 'parchment'));
    this.ui.add(mtext(this, x + 8, c.y + 7, `[${cl.tag}] ${cl.name}`, 'rInk', { size: 7.5, maxW: w - 16 }));
    this.ui.add(mtext(this, x + 8, c.y + 18, `${cl.members.length}/${ONLINE_RULES.clanMaxMembers} men - ${cl.regions} regions - ${this.role}`, 'pSec', { size: 6, maxW: w - 16 }));
    const by = c.y + c.h - TAP - 4;
    const top = c.y + 3 + headH + 3;
    const area = new ScrollArea(this, this.ui, x, top, w, by - 4 - top, S);
    this.area = area;
    let y = 0;
    for (const m of cl.members) {
      const manage = !!this.role && m.id !== this.me && (canKick(this.role, m.role) || canPromote(this.role, m.role, 'officer'));
      area.content.add(new ParchmentRow(this, 0, y, w, { title: m.name, subtitle: `${m.role} - ${m.regions} regions`, selected: m.id === this.me, onClick: manage ? () => !area.moved && this.manage(m) : undefined, id: `clan.member.${m.id}` }));
      y += ROW_H + 2;
    }
    area.setContentHeight(y);
    const bw = Math.floor((w - 4) / 2);
    const inv = new MButton(this, x, by, bw, TAP, { label: 'Invite', icon: 'people', variant: 'primary', onClick: () => void this.invite() });
    if (!this.role || !canInvite(this.role)) inv.setEnabled(false);
    this.ui.add(inv);
    this.ui.add(new MButton(this, x + bw + 4, by, bw, TAP, { label: 'Leave', icon: 'close', variant: 'secondary', onClick: () => this.confirmLeave() }));
  }

  private async create_(): Promise<void> {
    const v = await promptFields('Found a clan', [
      { name: 'name', label: 'Name (3-24)', placeholder: 'Sons of Lambda', maxLength: 24 },
      { name: 'tag', label: 'Tag (2-5 letters)', placeholder: 'LMB', maxLength: 5 },
    ], 'Found');
    if (!v || !this.sys.isActive()) return;
    await this.act(() => onlineApi.clanCreate(v.name, v.tag), 'Clan founded!');
  }

  private async invite(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const r = await onlineApi.clanInvite();
      if (!this.sys.isActive()) return;
      this.lastInvite = r;
      const text = `Join my clan [${this.clan?.tag}] in Pixelarrow!`;
      const share = `https://t.me/share/url?url=${encodeURIComponent(r.link)}&text=${encodeURIComponent(text)}`;
      if (inTelegram()) openTelegramLink(share);
      else {
        try {
          await navigator.clipboard?.writeText(r.link);
        } catch {
          /* no clipboard */
        }
      }
      this.showInvite(r.link, r.code);
    } catch (e) {
      if (this.sys.isActive()) this.flash(errorText(e));
    } finally {
      this.busy = false;
    }
  }

  private showInvite(link: string, code: string): void {
    const { VW } = this.m;
    this.modal = this.openM(124, 'Invite link');
    const md = this.modal;
    const y = lines(this, md.c, VW / 2, md.y + 28, [inTelegram() ? 'Sent to the Telegram share sheet.' : 'Link copied:', link.replace(/^https:\/\//, ''), `Code ${code} - valid 7 days`], 'pInk', md.w - 12);
    button(this, md.c, md.x + 10, y + 6, md.w / 2 - 15, 22, 'Share', () => openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}`), { icon: 'people' });
    button(this, md.c, md.x + md.w / 2 + 5, y + 6, md.w / 2 - 15, 22, 'Close', () => this.closeModal(), { icon: 'check' });
  }

  private manage(m: ClanMember): void {
    const { VW } = this.m;
    const role = this.role!;
    const acts: [string, () => Promise<unknown>, string][] = [];
    if (canPromote(role, m.role, 'officer') && m.role === 'member') acts.push(['Make officer', () => onlineApi.clanPromote(m.id, 'officer'), `${m.name} is an officer`]);
    if (canPromote(role, m.role, 'member') && m.role === 'officer') acts.push(['Demote', () => onlineApi.clanPromote(m.id, 'member'), `${m.name} is a member`]);
    if (canPromote(role, m.role, 'leader')) acts.push(['Hand over lead', () => onlineApi.clanPromote(m.id, 'leader'), `${m.name} leads now`]);
    if (canKick(role, m.role)) acts.push(['Kick', () => onlineApi.clanKick(m.id), `${m.name} was kicked`]);
    this.modal = this.openM(40 + acts.length * 26 + 30, m.name);
    const md = this.modal;
    acts.forEach(([label, fn, ok], i) =>
      button(this, md.c, md.x + 12, md.y + 26 + i * 26, md.w - 24, 22, label, () => {
        this.closeModal();
        void this.act(fn, ok);
      }),
    );
    button(this, md.c, VW / 2 - 35, md.y + md.h - 30, 70, 22, 'Close', () => this.closeModal(), { icon: 'close' });
  }

  private confirmLeave(): void {
    const { VW } = this.m;
    this.modal = this.openM(96, 'Leave the clan?', false);
    const md = this.modal;
    lines(this, md.c, VW / 2, md.y + 28, ['Your land stays yours,', 'but no longer clan land.'], 'pInk');
    button(this, md.c, md.x + 10, md.y + 58, md.w / 2 - 15, 24, 'Stay', () => this.closeModal());
    button(this, md.c, md.x + md.w / 2 + 5, md.y + 58, md.w / 2 - 15, 24, 'Leave', () => {
      this.closeModal();
      void this.act(() => onlineApi.clanLeave(), 'You left the clan');
    }, { sel: true });
  }

  /** Arrived through an invite link: show the clan and offer to join. */
  private async offerJoin(code: string): Promise<void> {
    let preview: Awaited<ReturnType<typeof onlineApi.clanPreview>>;
    try {
      preview = await onlineApi.clanPreview(code);
    } catch (e) {
      this.loaded = true;
      this.render();
      this.flash(errorText(e));
      return;
    }
    if (!this.sys.isActive()) return;
    this.loaded = true;
    this.render();
    const c = preview.clan;
    if (!c) return;
    const { VW } = this.m;
    this.modal = this.openM(112, 'Clan invite', false);
    const md = this.modal;
    lines(this, md.c, VW / 2, md.y + 28, [`[${c.tag}] ${c.name}`, `${c.members} members - ${c.regions} regions`, preview.current ? 'You must leave your clan first.' : 'Join them?'], 'pInk');
    button(this, md.c, md.x + 10, md.y + 74, md.w / 2 - 15, 24, 'Not now', () => {
      this.closeModal();
      void this.fetchData();
    });
    const j = button(this, md.c, md.x + md.w / 2 + 5, md.y + 74, md.w / 2 - 15, 24, 'Join', () => {
      this.closeModal();
      void this.act(() => onlineApi.clanJoin(code), `Welcome to [${c.tag}]!`);
    }, { sel: true });
    if (preview.current) j.setEnabled(false);
  }
}
