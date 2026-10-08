/**
 * Beast trial (offline): fight any mythical beast or world boss with the
 * campaign army, to learn how it fights without the online server. A list of
 * the beasts; a tap opens its info panel (how it fights, what beats it) with
 * the Fight button.
 */
import { BaseScene } from './BaseScene';
import { Button, addPanel, addText } from '../ui/kit';
import { ScrollList } from '../ui/widgets';
import { SIZE } from '../ui/theme';
import { ellipsize } from '../ui/textfit';
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
    this.addGrassBackdrop(5);
    const top = 34;
    this.ui.add(addPanel(this, 0, 0, VW, top, 'parch'));
    let tx = 6;
    if (this.inGameBack) {
      this.ui.add(new Button(this, 3, 5, SIZE.btnMinW, SIZE.btnH, { icon: 'back', tip: t('common.back'), onClick: () => this.scene.start('Menu') }));
      tx = 3 + SIZE.btnMinW + 5;
    }
    this.ui.add(addText(this, tx, 7, ellipsize(t('trial.title'), VW - tx - 6), 'red'));
    this.ui.add(addText(this, tx, 18, ellipsize(t('trial.sub'), VW - tx - 6), 'dim'));
    const x = 6;
    const w = VW - 12;
    const y = top + 6;
    this.ui.add(addPanel(this, x - 3, y - 3, w + 6, VH - y - 3, 'inset'));
    const ids = ENCOUNTER_IDS;
    this.list = new ScrollList(this, this.ui, x, y, w, VH - y - 9, {
      count: ids.length,
      rowH: 40,
      id: (i) => `trial.${ids[i]}`,
      onTap: (i) => this.open(ids[i]),
      tip: () => t('trial.tip'),
      render: (i, row, rw, rh) => {
        const enc = ids[i];
        row.add(addPanel(this, 0, 0, rw, rh, 'parch'));
        row.add(this.add.image(3, 3, beastThumb(this, enc, 34)).setOrigin(0, 0));
        const lv = t('myth.info.level', { n: this.level(enc) });
        const lw = 52;
        row.add(addText(this, 42, 8, ellipsize(encounterName(enc), rw - 42 - lw - 4), 'red'));
        row.add(addText(this, 42, 22, ellipsize(t(`myth.${enc}.hint1` as TKey), rw - 46), 'dim'));
        row.add(addText(this, rw - 4, 8, ellipsize((WORLD_BOSSES.includes(enc) ? t('myth.info.worldBoss') : lv), lw), 'ink', 1));
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
