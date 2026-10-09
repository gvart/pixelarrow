import { BaseScene } from './BaseScene';
import { SectionTitle, SECTION_TITLE_H, ParchmentRow, addHubShell } from '../ui/mosaic';
import { beastLevel, beastThumb, encounterName } from '../ui/beastInfo';
import { ENCOUNTER_IDS, WORLD_BOSSES } from '../data/beasts';
import { t, type TKey } from '../i18n';

const ROW_H = 30;

/**
 * The Codex hub (docs/redesign/V4_SPEC.md): what the game knows. Today that is
 * the beasts: a row each (portrait, name, how it fights, its level against your
 * army); a tap opens its panel and the trial fight, as the Beasts tile did.
 */
export class CodexScene extends BaseScene {
  constructor() {
    super('Codex');
  }

  create(): void {
    this.initUi();
    this.screen({ back: null }); // a hub: root, Telegram shows Close
    const { area, w } = addHubShell(this, { title: t('tab.codex'), active: 'codex' });
    const c = area.content;
    let y = 2;
    c.add(new SectionTitle(this, 1, y, w, t('codex.title')));
    y += SECTION_TITLE_H + 4;
    for (const enc of ENCOUNTER_IDS) {
      const boss = WORLD_BOSSES.includes(enc);
      const row = new ParchmentRow(
        this,
        1,
        y,
        w,
        {
          image: beastThumb(this, enc, 30),
          title: encounterName(enc),
          subtitle: t(`myth.${enc}.hint1` as TKey),
          value: boss ? t('myth.info.worldBoss') : t('myth.info.level', { n: beastLevel(enc) }),
          id: `codex.${enc}`,
          onClick: () => this.scene.start('BeastTrial', { from: 'Codex', open: enc }),
        },
        ROW_H,
      );
      c.add(row);
      y += ROW_H + 4;
    }
    area.setContentHeight(y);
  }
}
