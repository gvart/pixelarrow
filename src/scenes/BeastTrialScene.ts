/**
 * Beast trial (offline): fight any mythical beast or world boss with the
 * campaign army, to learn how it fights without the online server. A v4
 * sub-screen (back arrow, no tab bar): a row for each beast; a tap opens its
 * panel (how it fights, what beats it) with the Fight button.
 */
import { BaseScene } from './BaseScene';
import { ScrollArea } from '../ui/kit';
import { Label } from '../ui/widgets';
import { ParchmentRow, ScreenFrame, TopBar } from '../ui/mosaic';
import { beastThumb, encounterName, openBeastSheet } from '../ui/beastInfo';
import { ENCOUNTER_IDS, WORLD_BOSSES, type EncounterId } from '../data/beasts';
import { beastEnemy } from '../game/beasts';
import { state, randomSeed } from '../state';
import { t, type TKey } from '../i18n';
import type { BattleSite } from '../world/battlefield';

/** The beast's level against this army: a little above its average. */
export function beastLevel(enc: EncounterId): number {
  const fit = state.campaign.fitHeroes();
  const avg = fit.reduce((a, h) => a + h.level, 0) / Math.max(1, fit.length);
  return Math.max(2, Math.round(avg) + (WORLD_BOSSES.includes(enc) ? 3 : 1));
}

interface TrialData {
  /** The scene Back returns to (default: the Menu). */
  from?: string;
  /** Open this beast's panel at once (a tap on its row in the Codex). */
  open?: EncounterId;
}

const ROW_H = 34;

export class BeastTrialScene extends BaseScene {
  private from = 'Menu';
  private area: ScrollArea | null = null;

  constructor() {
    super('BeastTrial');
  }

  create(data?: TrialData): void {
    this.initUi();
    this.from = data?.from ?? 'Menu';
    const back = () => this.scene.start(this.from);
    this.screen({ back });
    const { VW, VH, S } = this.m;
    const frame = new ScreenFrame(this, VW, VH);
    this.ui.add(frame);
    this.ui.add(new TopBar(this, frame.topBar, { title: t('trial.title'), back: this.inGameBack ? back : undefined, id: 'trial.header' }));
    const c = frame.content;
    const x = c.x + 4;
    const w = c.w - 8;
    // what the trial is, in a line or two
    const sub = new Label(this, x + 1, c.y + 5, t('trial.sub'), { maxW: w - 4, maxLines: 3, font: 'pSec' });
    this.ui.add(sub);
    const top = c.y + 5 + sub.h + 5;
    const area = new ScrollArea(this, this.ui, x, top, w, c.y + c.h - top - 2, S);
    this.area = area;
    const ids = ENCOUNTER_IDS;
    let y = 1;
    for (const enc of ids) {
      const boss = WORLD_BOSSES.includes(enc);
      area.content.add(
        new ParchmentRow(
          this,
          1,
          y,
          w - 3,
          {
            image: beastThumb(this, enc, 30),
            title: encounterName(enc),
            subtitle: t(`myth.${enc}.hint1` as TKey),
            value: boss ? t('myth.info.worldBoss') : t('myth.info.level', { n: beastLevel(enc) }),
            tip: t('trial.tip'),
            id: `trial.${enc}`,
            onClick: () => !area.moved && this.open(enc),
          },
          ROW_H,
        ),
      );
      y += ROW_H + 4;
    }
    area.setContentHeight(y);
    this.events.once('shutdown', () => this.area?.destroy());
    if (data?.open) this.open(data.open);
  }

  open(enc: EncounterId): void {
    const fit = state.campaign.fitHeroes().filter((h) => (h.wound ?? 0) <= 0);
    openBeastSheet(this, enc, {
      level: beastLevel(enc),
      action: { label: t('trial.fight'), run: () => this.fight(enc), disabled: fit.length ? undefined : t('trial.empty') },
    });
  }

  fight(enc: EncounterId): void {
    const seed = randomSeed();
    const enemy = beastEnemy(enc, beastLevel(enc), seed, state.campaign.data);
    const site: BattleSite = { base: enc === 'kraken' ? 'beach' : enc === 'cyclops' || enc === 'titan' ? 'hills' : 'plain', river: false, coast: enc === 'kraken', rocky: false, woods: 0 };
    state.pending = { enemy, seed, label: encounterName(enc), site };
    this.scene.start('Battle');
  }
}
