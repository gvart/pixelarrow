// W-55 descriptions (src/war/view/hud/codex.ts): every skill, attribute, buildable building and engine has its words,
// the numbers come from the sim's data, and every highlighted term has a card behind it.
import { describe, expect, it } from 'vitest';
import { ATTR_IDS } from '../../src/data/perks';
import { BUILDINGS } from '../../src/war/sim/economy';
import { ACTIVE, ACTIVES, SKILLS } from '../../src/war/sim/skills';
import { SIEGE } from '../../src/war/sim/siege';
import { attrCard, BUILD_TEXT, buildCard, SIEGE_TEXT, SKILL_FLAVOUR, SKILL_ICON, SKILL_NAME, skillCard, skillEffects, TERMS, termCard } from '../../src/war/view/hud/codex';
import type { BuildingType, SiegeType, WarSkillId } from '../../src/war/types';

const terms = (html: string) => [...html.matchAll(/data-term="([^"]+)"/g)].map((m) => m[1]);

describe('codex', () => {
  it('names, flavours and icons every skill', () => {
    for (const id of Object.keys(SKILLS) as WarSkillId[]) {
      expect(SKILL_NAME[id]).toBeTruthy();
      expect(SKILL_FLAVOUR[id]).toBeTruthy();
      expect(SKILL_ICON[id]).toMatch(/^(ui|power|item):/);
      expect(skillEffects(id).length).toBeGreaterThan(0);
    }
  });

  it('takes skill numbers from the sim data', () => {
    expect(skillEffects('shieldDrill').join('')).toContain(`+${SKILLS.shieldDrill.block! * 100}%`);
    expect(skillEffects('brawler').join('')).toContain(`+${SKILLS.brawler.dmg}`);
    expect(skillEffects('berserk').join('')).toContain(`+${Math.round((ACTIVES.berserk!.out - 1) * 100)}%`);
    expect(skillEffects('shieldWall').join('')).toContain(`${ACTIVE.buff / 10} s`);
  });

  it('describes every buildable building and engine', () => {
    const wp = ['forge', 'cookhouse', 'infirmary', 'workshop', 'stall', 'sortingFloor'];
    const walls = ['palisade', 'rampart', 'stoneWall', 'woodStairs', 'stoneStairs', 'ladder', 'woodBridge', 'stoneBridge', 'stakes', 'ditch', 'chest'];
    const camp = ['camp', 'storehouse', 'outpost', 'fort', 'barracks', 'farm', 'olivePress', 'woodTower', 'stoneTower']; // the build bar's Camp tab (TOOLBAR)
    for (const t of [...camp, ...wp, ...walls] as BuildingType[]) {
      expect(BUILDINGS[t], t).toBeTruthy();
      expect(BUILD_TEXT[t]?.for, t).toBeTruthy();
      expect(BUILD_TEXT[t]?.flavour, t).toBeTruthy();
    }
    for (const t of Object.keys(SIEGE) as SiegeType[]) expect(SIEGE_TEXT[t]?.for, t).toBeTruthy();
  });

  it('has a card behind every highlighted term', () => {
    const html = [
      ...(Object.keys(SKILLS) as WarSkillId[]).map((id) => skillCard(id, '')),
      ...ATTR_IDS.map((a) => attrCard(a, 8)),
      ...(Object.keys(BUILD_TEXT) as BuildingType[]).map((t) => buildCard('building', t, t, '', '')),
      ...(Object.keys(SIEGE_TEXT) as SiegeType[]).map((t) => buildCard('siege', t, t, '', '')),
      ...Object.keys(TERMS).map(termCard),
    ].join('');
    for (const id of new Set(terms(html))) expect(TERMS[id], id).toBeTruthy();
  });
});
