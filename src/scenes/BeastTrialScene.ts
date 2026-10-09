/**
 * Beast trial (offline): fight any mythical beast or world boss with the
 * campaign army, to learn how it fights without the online server. A list of
 * the beasts; a tap opens its info panel (how it fights, what beats it) with
 * the Fight button.
 */
import { BaseScene } from './BaseScene';
import { addPanel, addText } from '../ui/kit';
import { ScreenHeader, addTipLine } from '../ui/v3';
import { addModeBanner } from '../ui/modeArt';
import { ROLE, SURFACE } from '../ui/tokens';
import { addChip } from '../ui/sheet';
import { ScrollList } from '../ui/widgets';
import { ellipsize, wrapText } from '../ui/textfit';
import { beastThumb, encounterName, openBeastInfo } from '../ui/beastInfo';
import { ENCOUNTER_IDS, WORLD_BOSSES, type EncounterId } from '../data/beasts';
import { beastEnemy } from '../game/beasts';
import { state, randomSeed } from '../state';
import { t, type TKey } from '../i18n';
import type { BattleSite } from '../world/battlefield';

export class BeastTrialScene extends BaseScene {
  private list: ScrollList | null = null;

  constructor() {
    super('BeastTrial');
  }

  create(): void {
    this.initUi();
    this.screen({ back: () => this.scene.start('Menu') });
    const { VW, VH } = this.m;
    this.ui.add(this.add.rectangle(0, 0, VW, VH, SURFACE.bg).setOrigin(0, 0));
    const hdr = new ScreenHeader(this, VW, { title: t('trial.title'), back: () => this.scene.start('Menu'), id: 'trial.header' });
    this.ui.add(hdr);
    const x = 6;
    const w = VW - 12;
    let y = hdr.bottom + 4;
    // the beasts' cave: where you are, before any word
    if (VH >= 330) {
      addModeBanner(this, this.ui, x, y - 2, w, 26, 'beasts');
      y += 26 + 2;
    }
    const tip = addTipLine(this, this.ui, x, y, w, { text: t('trial.sub'), icon: 'beast', dismissId: 'trial.what' });
    if (tip) y += tip + 4;
    const ids = ENCOUNTER_IDS;
    this.list = new ScrollList(this, this.ui, x, y, w, VH - y - 4, {
      count: ids.length,
      rowH: 46,
      fade: SURFACE.bg,
      id: (i) => `trial.${ids[i]}`,
      onTap: (i) => this.open(ids[i]),
      tip: () => t('trial.tip'),
      render: (i, row, rw, rh) => {
        const enc = ids[i];
        const boss = WORLD_BOSSES.includes(enc);
        row.add(addPanel(this, 0, 0, rw, rh, boss ? 'cardRaised' : 'card'));
        row.add(addPanel(this, 4, 5, 36, 36, 'well'));
        row.add(this.add.image(5, 6, beastThumb(this, enc, 34)).setOrigin(0, 0));
        const lv = boss ? t('myth.info.worldBoss') : t('myth.info.level', { n: this.level(enc) });
        const lw = addChip(this, row, rw - 6, 5, lv, boss ? ROLE.beast : 0x3a2f25, 70, true);
        row.add(addText(this, 46, 6, ellipsize(encounterName(enc), rw - 46 - lw - 10, false, 7, 'head'), 'head'));
        // how it fights, on two lines (never cut mid-thought where it fits)
        const hint = wrapText(t(`myth.${enc}.hint1` as TKey), rw - 52, 3, false, 6);
        row.add(addText(this, 46, 18, hint.lines.join('\n'), 'sec').setFontSize(6).setLineSpacing(-1.5));
      },
    });
    this.events.once('shutdown', () => this.list?.destroy());
  }

  /** The beast's level against this army: a little above its average. */
  private level(enc: EncounterId): number {
    const fit = state.campaign.fitHeroes();
    const avg = fit.reduce((a, h) => a + h.level, 0) / Math.max(1, fit.length);
    return Math.max(2, Math.round(avg) + (WORLD_BOSSES.includes(enc) ? 3 : 1));
  }

  open(enc: EncounterId): void {
    const fit = state.campaign.fitHeroes().filter((h) => (h.wound ?? 0) <= 0);
    openBeastInfo(this, enc, {
      level: this.level(enc),
      action: { label: t('trial.fight'), run: () => this.fight(enc), disabled: fit.length ? undefined : t('trial.empty') },
    });
  }

  fight(enc: EncounterId): void {
    const seed = randomSeed();
    const enemy = beastEnemy(enc, this.level(enc), seed, state.campaign.data);
    const site: BattleSite = { base: enc === 'kraken' ? 'beach' : enc === 'cyclops' || enc === 'titan' ? 'hills' : 'plain', river: false, coast: enc === 'kraken', rocky: false, woods: 0 };
    state.pending = { enemy, seed, label: encounterName(enc), site };
    this.scene.start('Battle');
  }
}
