import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { SectionTitle, SECTION_TITLE_H, SegmentedSwitch, SWITCH_H, addHubShell, mosaicImage, mtext, mw, wrapWords, type HubShell } from '../ui/mosaic';
import { fit, makePressable } from '../ui/mosaic/base';
import { addCover } from '../ui/mosaic/raster';
import { addIcon, scaleIcon, type FontKey } from '../ui/kit';
import { uiFrame, uiId } from '../ui/layout';
import { SPACE, TEXT_MIN } from '../ui/tokens';
import { beastLevel, beastPlate, beastThumb, encounterName, ensurePlates, openBeastSheet } from '../ui/beastInfo';
import { doctrineIcon, doctrineName, doctrineTell, metDoctrines, noteLastBattle, openDoctrineSheet } from '../ui/sheets/doctrine';
import { ENCOUNTER_IDS, WORLD_BOSSES, type EncounterId } from '../data/beasts';
import { DOCTRINE_IDS, type DoctrineId } from '../sim/types';
import { trialBattle } from '../game/campaignBattle';
import { state, randomSeed } from '../state';
import { t, type TKey } from '../i18n';

type Seg = 'beasts' | 'doctrines';

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

/** Where a row's title starts (after the art well). */
const textX = (): number => SPACE.md + ART + SPACE.md;

/**
 * The Codex hub (design/ux/screens-modes.md M-1, V5-029): the one home of beasts and doctrines. Beasts:
 * a row each (painted plate, name, a two-line hint, its level against your army); a tap opens the beast
 * sheet, whose primary action is the Trial fight (practice: no spoils). Doctrines (shown once one is
 * met): a row each, an unknown one locked; a tap opens the doctrine sheet. The old Beast trial list is
 * gone; its scene only forwards here.
 */
export class CodexScene extends BaseScene {
  private seg: Seg = 'beasts';
  private shell: HubShell | null = null;

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
    this.build();
    // the painted plates arrive after the first frame: rebuild the list with them
    ensurePlates(this, ENCOUNTER_IDS, () => this.build());
    if (data?.open && ENCOUNTER_IDS.includes(data.open)) this.openBeast(data.open);
    else if (data?.doctrine && met.includes(data.doctrine)) this.openDoctrine(data.doctrine);
  }

  /** The list of the current segment, under the switch (or the Beasts title before any doctrine is met). */
  private build(): void {
    const sh = this.shell;
    if (!sh) return;
    const { area, w } = sh;
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
    if (this.seg === 'doctrines') {
      for (const id of DOCTRINE_IDS) {
        const known = met.includes(id);
        c.add(
          this.row(1, y, w - 2, {
            id: `codex.doctrine.${id}`,
            title: known ? doctrineName(id) : t('codex.unknown'),
            hint: known ? doctrineTell(id) : t('codex.unknownHint'),
            art: (box, s) => this.iconArt(box, s, known ? doctrineIcon(id) : 'lock'),
            locked: !known,
            onTap: () => this.openDoctrine(id),
          }),
        );
        y += ROW_H + 4;
      }
    } else {
      // one title size for every row (CDX-3): the largest at which every name fits beside its level;
      // where none does, every row puts the level on a line of its own and the names get the full width
      const value = (enc: EncounterId) => (WORLD_BOSSES.includes(enc) ? t('myth.info.worldBoss') : t('myth.info.level', { n: beastLevel(enc) }));
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
            onTap: () => this.openBeast(enc),
          }),
        );
        y += rh + 4;
      }
    }
    area.setContentHeight(y);
  }

  /** An icon centred in the row's art well. */
  private iconArt(box: Phaser.GameObjects.Container, s: number, icon: string): void {
    const ic = scaleIcon(addIcon(this, 0, 0, icon), (s - 8) / 12);
    ic.setPosition(Math.round((s - ic.displayWidth) / 2), Math.round((ROW_H - ic.displayHeight) / 2));
    box.add(ic);
  }

  /** A Codex row: the art in a well, the title, a two-line hint, an optional value and the chevron. */
  private row(
    x: number,
    y: number,
    w: number,
    o: { id: string; title: string; size?: number; hint: string; value?: string; stacked?: boolean; locked?: boolean; art: (box: Phaser.GameObjects.Container, s: number, h: number) => void; onTap: () => void },
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
    const two = ls.length > 2 ? [ls[0], fit(ls.slice(1).join(' '), font, HINT, tw)] : ls;
    const hint = mtext(this, tx, hy, two.join('\n'), font, { size: HINT });
    uiFrame(hint, r, w, RH);
    face.add(hint);
    // a locked row opens nothing: no chevron, and a tap says how to learn it
    if (!o.locked) {
      const chev = scaleIcon(addIcon(this, 0, 0, 'chevR'), 0.8);
      chev.setPosition(w - right, Math.round((RH - chev.displayHeight) / 2));
      face.add(chev);
    }
    makePressable(r, { face, w, h: RH, onTap: o.onTap, disabled: () => (o.locked ? o.hint : undefined) });
    Object.assign(r, { opts: { label: o.title } });
    uiId(r, o.id);
    return r;
  }

  /** The beast's sheet with the Trial fight (disabled, with the reason, when the army has no fit men). */
  openBeast(enc: EncounterId): void {
    const men = state.campaign.fitHeroes().filter((h) => (h.wound ?? 0) <= 0);
    openBeastSheet(this, enc, {
      level: beastLevel(enc),
      caption: t('codex.trialCaption'),
      action: { label: t('codex.trialFight'), run: () => this.fight(enc), disabled: men.length ? undefined : t('trial.empty') },
    });
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
