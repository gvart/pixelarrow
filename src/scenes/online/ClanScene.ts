/**
 * Clan screen: create a clan, share an invite link through Telegram, join
 * from an invite (start_param clan_<code>), members with roles, and the
 * leader's / officers' actions (promote, demote, hand over, kick).
 */
import { BaseScene } from '../BaseScene';
import { Button, ScrollArea, addPanel, addText } from '../../ui/kit';
import { hapticNotify } from '../../platform/telegram';
import { inTelegram, openTelegramLink } from '../../platform/telegram';
import { canInvite, canKick, canPromote, ONLINE_RULES, type ClanRole } from '../../online/rules';
import { checkOnline, errorText, onlineApi, takePendingInvite, peekPendingInvite, type ClanMember, type ClanView } from '../../online/client';
import { button, lines, openModal, type Modal } from './common';
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

  /** A parchment modal that Back (Telegram's or ours) closes. */
  private openM(h: number, title: string): Modal {
    const md = openModal(this, this.ui, this.m.VW, this.m.VH, h, title);
    this.modalLayer(md.c, () => this.closeModal());
    return md;
  }

  private closeModal(): void {
    this.modal?.c.destroy();
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
    const t = addText(this, VW / 2, 34, text, 'red', 0.5, VW - 30);
    c.add(addPanel(this, 8, 29, VW - 16, t.height + 10, 'parch'));
    c.add(t);
    this.ui.add(c);
    this.time.delayedCall(2400, () => c.destroy());
  }

  private render(): void {
    this.area?.destroy();
    this.area = null;
    this.ui.removeAll(true);
    this.modal = null;
    const { VW, VH, S } = this.m;
    this.addGrassBackdrop(9).setAlpha(0.6);
    this.ui.add(addPanel(this, 0, 0, VW, 24, 'parch'));
    if (this.inGameBack) this.ui.add(new Button(this, 3, 2, 24, 20, { icon: 'back', onClick: () => this.back() }));
    if (!this.loaded) {
      this.ui.add(addText(this, 32, 8, 'Clan', 'red'));
      this.ui.add(addText(this, VW / 2, 60, this.msg, 'ink', 0.5, VW - 20));
      return;
    }
    if (!this.clan) {
      this.ui.add(addText(this, 32, 8, 'No clan', 'red'));
      const c = this.add.container(0, 0);
      this.ui.add(c);
      c.add(addPanel(this, 8, 34, VW - 16, 112, 'parch'));
      const y = lines(this, c, VW / 2, 42, ['Clans share their land:', 'members garrison each other', 'and earn more next to clan land.', 'Found one, or ask a leader for', 'an invite link.'], 'ink', VW - 30);
      button(this, c, VW / 2 - 55, y + 6, 110, 24, 'Found a clan', () => void this.create_(), { icon: 'flag', sel: true });
      return;
    }
    const cl = this.clan;
    this.ui.add(addText(this, 32, 4, `[${cl.tag}] ${cl.name}`, 'red'));
    this.ui.add(addText(this, 32, 13, `${cl.members.length}/${ONLINE_RULES.clanMaxMembers} men - ${cl.regions} regions - ${this.role}`, 'dim'));
    const area = new ScrollArea(this, this.ui, 3, 28, VW - 6, VH - 28 - 34, S);
    this.area = area;
    let y = 0;
    for (const m of cl.members) {
      const row = this.add.container(0, y);
      row.add(addPanel(this, 0, 0, VW - 6, 24, m.id === this.me ? 'buttonSel' : 'inset'));
      row.add(addText(this, 6, 4, m.name, m.id === this.me ? 'light' : 'ink'));
      row.add(addText(this, 6, 14, `${m.role} - ${m.regions} regions`, m.id === this.me ? 'light' : 'dim'));
      if (this.role && m.id !== this.me && (canKick(this.role, m.role) || canPromote(this.role, m.role, 'officer'))) {
        row.add(new Button(this, VW - 6 - 50, 3, 46, 18, { label: 'Manage', onClick: () => !area.moved && this.manage(m) }));
      }
      area.content.add(row);
      y += 26;
    }
    area.setContentHeight(y);
    const by = VH - 30;
    this.ui.add(addPanel(this, 0, by - 2, VW, 32, 'parch'));
    const bw = Math.floor((VW - 11) / 2);
    const inv = new Button(this, 4, by + 2, bw, 26, { label: 'Invite', icon: 'people', style: 'buttonSel', onClick: () => void this.invite() });
    if (!this.role || !canInvite(this.role)) inv.setEnabled(false);
    this.ui.add(inv);
    this.ui.add(new Button(this, 7 + bw, by + 2, bw, 26, { label: 'Leave', icon: 'close', onClick: () => this.confirmLeave() }));
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
    const y = lines(this, md.c, VW / 2, md.y + 28, [inTelegram() ? 'Sent to the Telegram share sheet.' : 'Link copied:', link.replace(/^https:\/\//, ''), `Code ${code} - valid 7 days`], 'ink', md.w - 12);
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
    this.modal = this.openM(96, 'Leave the clan?');
    const md = this.modal;
    lines(this, md.c, VW / 2, md.y + 28, ['Your land stays yours,', 'but no longer clan land.'], 'ink');
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
    this.modal = this.openM(112, 'Clan invite');
    const md = this.modal;
    lines(this, md.c, VW / 2, md.y + 28, [`[${c.tag}] ${c.name}`, `${c.members} members - ${c.regions} regions`, preview.current ? 'You must leave your clan first.' : 'Join them?'], 'ink');
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
