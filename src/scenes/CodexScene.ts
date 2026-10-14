import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { SectionTitle, SECTION_TITLE_H, SegmentedSwitch, SWITCH_H, addHubShell, mosaicImage, mtext, mw, wrapWords, type HubShell } from '../ui/mosaic';
import { fit, makePressable } from '../ui/mosaic/base';
import { addCover } from '../ui/mosaic/raster';
import { grid, layoutVariant } from '../ui/mosaic/layout/geometry';
import { ScrollArea, addIcon, scaleIcon, type FontKey } from '../ui/kit';
import { uiCollapsed, uiFrame, uiId, uiLayout } from '../ui/layout';
import { MOSAIC, SPACE, TEXT_MIN } from '../ui/tokens';
import { CONTENT_MAX } from '../ui/sizeClass';
import { addScrollHint } from '../ui/widgets';
import { cardCols, codexLayout, type CodexLayout } from '../ui/codexLayout';
import { addBeastDetail, beastLevel, beastPlate, beastThumb, encounterName, ensurePlates, openBeastSheet, type BeastInfoOpts } from '../ui/beastInfo';
import { addDoctrineDetail, doctrineIcon, doctrineName, doctrineTell, metDoctrines, noteLastBattle, openDoctrineSheet } from '../ui/sheets/doctrine';
import { ENCOUNTER_IDS, WORLD_BOSSES, type EncounterId } from '../data/beasts';
import { DOCTRINE_IDS, type DoctrineId } from '../sim/types';
import { trialBattle } from '../game/campaignBattle';
import { state, randomSeed } from '../state';
import { t, type TKey } from '../i18n';

type Seg = 'beasts' | 'doctrines';
/** The entry shown in the detail pane. */
type Sel = { kind: 'beast'; id: EncounterId } | { kind: 'doctrine'; id: DoctrineId };

export interface CodexData {
  /** Open this beast's sheet at once (a door: the War panel, a Trial fight's Results). */
  open?: EncounterId;
  /** Open this doctrine's sheet at once (a door from an encounter's doctrine row). */
  doctrine?: DoctrineId;
  /** The segment to show (default Beasts, or Doctrines when a doctrine is opened). */
  seg?: Seg;
}

/** Row height (UI px): the 2x beast art and a two-line hint (>= 60 pt, M-1). */
const ROW_H = 40;
/** A narrow screen: the level goes on a line of its own under the name, so no name is cut. */
const ROW_H_STACKED = 48;
const ART = ROW_H - 8;
const TITLE = 7;
const HINT = Math.max(TEXT_MIN, 6.5);
/** Room at the right of a row for the chevron. */
const CHEV_W = 12;
/** A card (tablet and laptop grid): the art well's height and the cards' heights (beasts carry a level line). */
const CARD_ART = 48;
const CARD_H = 100;
const CARD_H_DOCTRINE = 90;
const CARD_GAP = 4;

/** Where a row's title starts (after the art well). */
const textX = (): number => SPACE.md + ART + SPACE.md;

/**
 * The Codex hub (design/ux/screens-modes.md M-1, V5-029): the one home of beasts and doctrines. Beasts:
 * a row each (painted plate, name, a two-line hint, its level against your army); a tap opens the beast
 * sheet, whose primary action is the Trial fight (practice: no spoils). Doctrines (shown once one is
 * met): a row each, an unknown one locked; a tap opens the doctrine sheet. The old Beast trial list is
 * gone; its scene only forwards here.
 *
 * Per size class (design/ux/landscape-v6.md §13.2, V6-RSCR-09; `codexLayout`): compact portrait is v5. A phone
 * held sideways shows the rows beside a detail pane; a tablet a three-column card grid whose cards open the
 * sheet; a laptop a card grid beside a 240-wide detail pane. The detail pane shows the first entry on arrival
 * and the chosen one after a tap; the sheets' doors select their entry there instead of opening a sheet.
 */
export class CodexScene extends BaseScene {
  protected override readonly responsive = true;
  private seg: Seg = 'beasts';
  private shell: HubShell | null = null;
  /** The layout of this size class (landscape-v6 §13.2). */
  private lay: CodexLayout | null = null;
  /** The list's scroll area: the shell's, or its own pane beside the detail. */
  private list: ScrollArea | null = null;
  /** The list's width (UI px). */
  private lw = 0;
  /** The detail pane and the entry chosen for it (only beside the list). */
  private detail: Phaser.GameObjects.Container | null = null;
  private sel: Sel | null = null;

  constructor() {
    super('Codex');
  }

  create(data?: CodexData): void {
    this.initUi();
    this.screen({ back: null }); // a hub: root, Telegram shows Close
    noteLastBattle();
    const met = metDoctrines();
    this.seg = met.length && (data?.seg === 'doctrines' || (!data?.seg && data?.doctrine)) ? 'doctrines' : 'beasts';
    this.shell = addHubShell(this, { title: t('tab.codex'), active: 'codex' });
    uiLayout(this, this.m.cls, this.m.land);
    this.place(this.shell);
    // beside the list a door selects its entry in the detail pane (no sheet: the pane is not a layer)
    this.sel = null;
    if (data?.open && ENCOUNTER_IDS.includes(data.open)) this.sel = { kind: 'beast', id: data.open };
    else if (data?.doctrine && met.includes(data.doctrine)) this.sel = { kind: 'doctrine', id: data.doctrine };
    this.build();
    // the painted plates arrive after the first frame: rebuild the list with them
    const door = () => {
      if (this.lay?.detail) return;
      if (data?.open && ENCOUNTER_IDS.includes(data.open)) this.openBeast(data.open);
      else if (data?.doctrine && met.includes(data.doctrine)) this.openDoctrine(data.doctrine);
    };
    // a door straight to a beast's sheet waits for the plates, so its header has the painting
    const loading = ensurePlates(this, ENCOUNTER_IDS, () => {
      this.build();
      door();
    });
    if (!loading) door();
  }

  /**
   * Where the list and the detail go (`codexLayout`). Compact portrait, the tablet and a narrow phone landscape
   * keep the shell's one scroll area; beside a detail pane the list gets a scroll area of its own.
   */
  private place(sh: HubShell): void {
    this.detail = null;
    this.list = sh.area;
    this.lw = sh.w;
    if (layoutVariant(this.m) === 'compactPortrait') {
      this.lay = codexLayout(this.m, { x: 0, y: 0, w: sh.w, h: 0 });
      return;
    }
    // the panes region is at most CONTENT_MAX wide (§2.3), centred in the frame
    const c = sh.content;
    const iw = Math.min(c.w - 8, CONTENT_MAX);
    const lay = codexLayout(this.m, { x: c.x + 4 + Math.floor((c.w - 8 - iw) / 2), y: c.y + 3, w: iw, h: c.h - 7 });
    this.lay = lay;
    if (!lay.detail) return;
    sh.area.destroy();
    const M = lay.master;
    this.list = new ScrollArea(this, this.ui, M.x, M.y, M.w, M.h, this.m.S);
    addScrollHint(this, this.ui, this.list, MOSAIC.parch);
    this.lw = M.w - 2;
  }

  /** The entry the detail pane shows: the chosen one if it is in this segment, else the segment's first (§3.3). */
  private current(): Sel {
    const met = metDoctrines();
    if (this.seg === 'doctrines') return this.sel?.kind === 'doctrine' && met.includes(this.sel.id) ? this.sel : { kind: 'doctrine', id: met[0] };
    return this.sel?.kind === 'beast' ? this.sel : { kind: 'beast', id: ENCOUNTER_IDS[0] };
  }

  /** A tap on an entry: beside the list it shows in the detail pane, else its sheet opens. */
  private choose(sel: Sel): void {
    if (!this.lay?.detail) {
      if (sel.kind === 'beast') this.openBeast(sel.id);
      else this.openDoctrine(sel.id);
      return;
    }
    const keep = this.list?.scrollY ?? 0;
    this.sel = sel;
    this.build();
    this.list?.setScroll(keep);
  }

  /** The detail pane beside the list: the selected beast (with the Trial fight) or doctrine. */
  private buildDetail(): void {
    this.detail?.destroy();
    this.detail = null;
    const box = this.lay?.detail;
    if (!box) return;
    const sel = this.current();
    if (sel.kind === 'beast') {
      this.detail = addBeastDetail(this, this.ui, box, sel.id, this.beastOpts(sel.id));
      // the sheet's X has nothing to close here: the pane stays, and choosing another entry replaces it (§3.3)
      uiCollapsed(this, 'beast.sheet.close', `codex.${sel.id}`);
    } else {
      this.detail = addDoctrineDetail(this, this.ui, box, sel.id);
      uiCollapsed(this, 'doctrine.sheet.close', `codex.doctrine.${sel.id}`);
    }
  }

  /** The list of the current segment, under the switch (or the Beasts title before any doctrine is met). */
  private build(): void {
    const area = this.list;
    const lay = this.lay;
    if (!this.shell || !area || !lay) return;
    const w = this.lw;
    const pick = lay.detail ? this.current() : null;
    const on = (kind: Sel['kind'], id: string) => pick?.kind === kind && pick.id === id;
    const c = area.content;
    c.removeAll(true);
    const met = metDoctrines();
    let y = 2;
    if (met.length) {
      c.add(
        new SegmentedSwitch(this, 1, y, w - 2, {
          options: [
            { id: 'beasts', label: t('codex.seg.beasts', { n: ENCOUNTER_IDS.length }) },
            { id: 'doctrines', label: t('codex.seg.doctrines', { n: met.length, total: DOCTRINE_IDS.length }) },
          ],
          selected: this.seg,
          id: 'codex.seg',
          onChange: (id) => {
            if (id === this.seg) return;
            this.seg = id as Seg;
            this.build();
          },
        }),
      );
      y += SWITCH_H + 6;
    } else {
      c.add(new SectionTitle(this, 1, y, w, t('codex.title')));
      y += SECTION_TITLE_H + 4;
    }
    if (lay.list === 'grid') y = this.buildCards(c, w, y, lay, met, on);
    else if (this.seg === 'doctrines') {
      for (const id of DOCTRINE_IDS) {
        const known = met.includes(id);
        c.add(
          this.row(1, y, w - 2, {
            id: `codex.doctrine.${id}`,
            title: known ? doctrineName(id) : t('codex.unknown'),
            hint: known ? doctrineTell(id) : t('codex.unknownHint'),
            art: (box, s) => this.iconArt(box, s, known ? doctrineIcon(id) : 'lock'),
            locked: !known,
            selected: on('doctrine', id),
            onTap: () => this.choose({ kind: 'doctrine', id }),
          }),
        );
        y += ROW_H + 4;
      }
    } else {
      // one title size for every row (CDX-3): the largest at which every name fits beside its level;
      // where none does, every row puts the level on a line of its own and the names get the full width
      const value = (enc: EncounterId) => this.levelOf(enc);
      const line = w - 2 - textX() - CHEV_W - 2;
      const fits = (z: number, beside: boolean) => ENCOUNTER_IDS.every((enc) => mw(encounterName(enc), 'rInk', z) <= line - (beside ? mw(value(enc), 'pInk', z) + SPACE.md : 0));
      const beside = [TITLE, 6.5].find((z) => fits(z, true));
      const stacked = beside === undefined;
      const titleSize = beside ?? [TITLE, 6.5].find((z) => fits(z, false)) ?? 6.5;
      const rh = stacked ? ROW_H_STACKED : ROW_H;
      for (const enc of ENCOUNTER_IDS) {
        c.add(
          this.row(1, y, w - 2, {
            id: `codex.${enc}`,
            title: encounterName(enc),
            size: titleSize,
            hint: t(`myth.${enc}.hint1` as TKey),
            value: value(enc),
            stacked,
            art: (box, s, h) => box.add(addCover(this, 1, Math.round((h - s) / 2) + 1, s - 2, s - 2, beastPlate(this, enc) ?? beastThumb(this, enc, 30))),
            selected: on('beast', enc),
            onTap: () => this.choose({ kind: 'beast', id: enc }),
          }),
        );
        y += rh + 4;
      }
    }
    area.setContentHeight(y);
    this.buildDetail();
  }

  /** The current segment as a card grid (the §3.7 Grid: columns by width, the cells sharing it); returns the bottom. */
  private buildCards(c: Phaser.GameObjects.Container, w: number, y: number, lay: CodexLayout, met: DoctrineId[], on: (kind: Sel['kind'], id: string) => boolean): number {
    const doctrines = this.seg === 'doctrines';
    const ids: readonly string[] = doctrines ? DOCTRINE_IDS : ENCOUNTER_IDS;
    const g = grid({ x: 1, y, w: w - 2, h: 0 }, ids.length, { minCell: lay.minCell, maxCols: cardCols(lay, ids.length), gap: CARD_GAP, cellH: doctrines ? CARD_H_DOCTRINE : CARD_H });
    ids.forEach((id, i) => {
      const b = g.cells[i];
      if (doctrines) {
        const d = id as DoctrineId;
        const known = met.includes(d);
        c.add(
          this.card(b.x, b.y, b.w, b.h, {
            id: `codex.doctrine.${d}`,
            title: known ? doctrineName(d) : t('codex.unknown'),
            hint: known ? doctrineTell(d) : t('codex.unknownHint'),
            art: (box, aw, ah) => this.cardIcon(box, aw, ah, known ? doctrineIcon(d) : 'lock'),
            locked: !known,
            selected: on('doctrine', d),
            onTap: () => this.choose({ kind: 'doctrine', id: d }),
          }),
        );
        return;
      }
      const enc = id as EncounterId;
      c.add(
        this.card(b.x, b.y, b.w, b.h, {
          id: `codex.${enc}`,
          title: encounterName(enc),
          hint: t(`myth.${enc}.hint1` as TKey),
          value: this.levelOf(enc),
          art: (box, aw, ah) => this.cardBeast(box, aw, ah, enc),
          selected: on('beast', enc),
          onTap: () => this.choose({ kind: 'beast', id: enc }),
        }),
      );
    });
    return y + g.h + 4;
  }

  /** A beast's level against the army, or "World boss". */
  private levelOf(enc: EncounterId): string {
    return WORLD_BOSSES.includes(enc) ? t('myth.info.worldBoss') : t('myth.info.level', { n: beastLevel(enc) });
  }

  /** An icon centred in the row's art well. */
  private iconArt(box: Phaser.GameObjects.Container, s: number, icon: string): void {
    const ic = scaleIcon(addIcon(this, 0, 0, icon), (s - 8) / 12);
    ic.setPosition(Math.round((s - ic.displayWidth) / 2), Math.round((ROW_H - ic.displayHeight) / 2));
    box.add(ic);
  }

  /** A card's beast: the painted plate filling the well, else its figure centred in it. */
  private cardBeast(box: Phaser.GameObjects.Container, w: number, h: number, enc: EncounterId): void {
    const plate = beastPlate(this, enc);
    if (plate) {
      box.add(addCover(this, 1, 1, w - 2, h - 2, plate));
      return;
    }
    const s = h - 6;
    box.add(this.add.image(Math.round((w - s) / 2), 3, beastThumb(this, enc, s)).setOrigin(0, 0));
  }

  /** A card's icon (a doctrine's, or the lock) centred in the well. */
  private cardIcon(box: Phaser.GameObjects.Container, w: number, h: number, icon: string): void {
    const ic = scaleIcon(addIcon(this, 0, 0, icon), 2);
    ic.setPosition(Math.round((w - ic.displayWidth) / 2), Math.round((h - ic.displayHeight) / 2));
    box.add(ic);
  }

  /** The selected entry's bronze rim (selection is bronze; with the chevron it is not colour alone, §3.3). */
  private rim(w: number, h: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    g.lineStyle(1.2, MOSAIC.bronze, 1);
    g.strokeRoundedRect(0.6, 0.6, w - 1.2, h - 1.2, 3);
    return g;
  }

  /** A Codex row: the art in a well, the title, a two-line hint, an optional value and the chevron. */
  private row(
    x: number,
    y: number,
    w: number,
    o: { id: string; title: string; size?: number; hint: string; value?: string; stacked?: boolean; locked?: boolean; selected?: boolean; art: (box: Phaser.GameObjects.Container, s: number, h: number) => void; onTap: () => void },
  ): Phaser.GameObjects.Container {
    const RH = o.stacked ? ROW_H_STACKED : ROW_H;
    const r = this.add.container(Math.round(x), Math.round(y));
    const face = this.add.container(0, 0);
    r.add(face);
    face.add(mosaicImage(this, 0, 0, w, RH, 'parchment'));
    const x0 = SPACE.md;
    face.add(mosaicImage(this, x0, Math.round((RH - ART) / 2), ART, ART, 'parchmentWell'));
    const art = this.add.container(x0, 0);
    o.art(art, ART, RH);
    face.add(art);
    const tx = textX();
    const size = o.size ?? TITLE;
    const vw = o.value && !o.stacked ? mw(o.value, 'pInk', size) + SPACE.md : 0;
    const right = CHEV_W;
    const tw = w - tx - right - 2;
    const box = { owner: r, w, h: RH };
    // a locked doctrine: Inter in the secondary ink, never faded below legibility (its reason is the content)
    const titleFont: FontKey = o.locked ? 'pSec' : 'rInk';
    face.add(mtext(this, tx, 5, fit(o.title, titleFont, size, tw - vw), titleFont, { size, box }));
    let hy = 16;
    if (o.value && o.stacked) {
      face.add(mtext(this, tx, 15, o.value, 'pInk', { size: HINT, maxW: tw, box }));
      hy = 25;
    } else if (o.value) face.add(mtext(this, w - right - 2, 5, o.value, 'pInk', { size, align: 1, box }));
    // the hint in two lines; the full text is in the sheet
    const font: FontKey = 'pSec';
    const ls = wrapWords(o.hint, tw, (s) => mw(s, font, HINT));
    // a single word wider than the line (ru at 320) is cut too, never drawn past the row
    const two = (ls.length > 2 ? [ls[0], ls.slice(1).join(' ')] : ls).map((l) => fit(l, font, HINT, tw));
    const hint = mtext(this, tx, hy, two.join('\n'), font, { size: HINT });
    uiFrame(hint, r, w, RH);
    face.add(hint);
    // a locked row opens nothing: no chevron, and a tap says how to learn it
    if (!o.locked) {
      const chev = scaleIcon(addIcon(this, 0, 0, 'chevR'), 0.8);
      chev.setPosition(w - right, Math.round((RH - chev.displayHeight) / 2));
      face.add(chev);
    }
    // beside the detail pane the chosen row has a bronze rim (its chevron points at the pane)
    if (o.selected) face.add(this.rim(w, RH));
    makePressable(r, { face, w, h: RH, onTap: o.onTap, disabled: () => (o.locked ? o.hint : undefined) });
    Object.assign(r, { opts: { label: o.title } });
    uiId(r, o.id);
    return r;
  }

  /**
   * A Codex card (tablet and laptop grid, §13.2): a row's parts stacked: the art in a wide well, the title with the
   * chevron, the level (beasts), the two-line hint. Chosen beside the detail pane: a bronze rim (§3.3).
   */
  private card(
    x: number,
    y: number,
    w: number,
    h: number,
    o: { id: string; title: string; hint: string; value?: string; locked?: boolean; selected?: boolean; art: (box: Phaser.GameObjects.Container, w: number, h: number) => void; onTap: () => void },
  ): Phaser.GameObjects.Container {
    const r = this.add.container(Math.round(x), Math.round(y));
    const face = this.add.container(0, 0);
    r.add(face);
    face.add(mosaicImage(this, 0, 0, w, h, 'parchment'));
    const pad = SPACE.sm;
    const aw = w - pad * 2;
    face.add(mosaicImage(this, pad, pad, aw, CARD_ART, 'parchmentWell'));
    const art = this.add.container(pad, pad);
    o.art(art, aw, CARD_ART);
    face.add(art);
    const tw = aw - (o.locked ? 0 : CHEV_W);
    const box = { owner: r, w, h };
    const titleFont: FontKey = o.locked ? 'pSec' : 'rInk';
    let ty = pad + CARD_ART + 4;
    face.add(mtext(this, pad, ty, fit(o.title, titleFont, TITLE, tw), titleFont, { size: TITLE, box }));
    if (!o.locked) {
      const chev = scaleIcon(addIcon(this, 0, 0, 'chevR'), 0.8);
      chev.setPosition(w - pad - chev.displayWidth, ty);
      face.add(chev);
    }
    ty += 10;
    if (o.value) {
      face.add(mtext(this, pad, ty, fit(o.value, 'pInk', HINT, aw), 'pInk', { size: HINT, box }));
      ty += 9;
    }
    const ls = wrapWords(o.hint, aw, (s) => mw(s, 'pSec', HINT));
    const two = (ls.length > 2 ? [ls[0], ls.slice(1).join(' ')] : ls).map((l) => fit(l, 'pSec', HINT, aw));
    const hint = mtext(this, pad, ty, two.join('\n'), 'pSec', { size: HINT });
    uiFrame(hint, r, w, h);
    face.add(hint);
    if (o.selected) face.add(this.rim(w, h));
    makePressable(r, { face, w, h, onTap: o.onTap, disabled: () => (o.locked ? o.hint : undefined) });
    Object.assign(r, { opts: { label: o.title } });
    uiId(r, o.id);
    return r;
  }

  /** The beast's sheet with the Trial fight (disabled, with the reason, when the army has no fit men). */
  openBeast(enc: EncounterId): void {
    openBeastSheet(this, enc, this.beastOpts(enc));
  }

  /** What the beast's sheet or pane shows beyond the beast: its level, the caption and the Trial fight. */
  private beastOpts(enc: EncounterId): BeastInfoOpts {
    const men = state.campaign.fitHeroes().filter((h) => (h.wound ?? 0) <= 0);
    return {
      level: beastLevel(enc),
      caption: t('codex.trialCaption'),
      action: { label: t('codex.trialFight'), run: () => this.fight(enc), disabled: men.length ? undefined : t('trial.empty') },
    };
  }

  openDoctrine(id: DoctrineId): void {
    if (!metDoctrines().includes(id)) return;
    openDoctrineSheet(this, id);
  }

  /** A Trial fight is Practice: no spoils, no losses (design/gdd/practice-fight.md); Results returns to this sheet. */
  fight(enc: EncounterId): void {
    state.pending = trialBattle(state.campaign, enc, 'Codex', randomSeed(), encounterName(enc));
    // explicit data: a bare start would replay the last battle's data (PLAY B1)
    this.scene.start('Battle', {});
  }
}
