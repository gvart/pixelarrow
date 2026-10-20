/**
 * CMP-01: the Field camp / War camp on the v5 chrome (design/ux/screens-campaign.md C-5).
 * Every camp string is in both tables with the same placeholders; the scene asks only
 * for keys that exist and has no English literal of its own (G12); the Build drawer's
 * reasons and times are localized; the supplies page is fed by the works allowance
 * (field-works.md R4); no red text, no v3 chrome, and every element of the old camp
 * (ELEMENT_MAP E104-E122) still has its action.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import campSrc from '../src/scenes/CampScene.ts?raw';
import { CAMP_V5_EN } from '../src/i18n/camp.v5.en';
import { CAMP_V5_RU } from '../src/i18n/camp.v5.ru';
import { EN } from '../src/i18n/en';
import { setLang } from '../src/i18n';
import { World } from '../src/world/world';
import { STRUCTURES } from '../src/world/camp';
import { worksAllowance } from '../src/game/campaign';
import { WORKS } from '../src/data/terrain';

// the scene draws with Phaser; the rules tested here are pure. Phaser itself needs a browser.
vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C, Zone: C, BitmapText: C, Sprite: C }, Scene: C, Loader: { Events: {} }, Geom: { Rectangle: C }, Math: { Clamp: (v: number) => v } } };
});
const { fieldBuildWhy, hoursText, structName } = await import('../src/scenes/CampScene');

const placeholders = (e: unknown): string[] => [...JSON.stringify(e).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const code = campSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

afterEach(() => setLang('en'));

/** A world camped on the first ground that takes a camp, near the start. */
function campedWorld(): World {
  const w = new World(World.fresh(20261006));
  const m = w.map;
  for (let y = 2; y < m.h - 2; y++)
    for (let x = 2; x < m.w - 2; x++) {
      w.s.x = x + 0.5;
      w.s.y = y + 0.5;
      if (!w.campBlocker()) {
        w.makeCamp();
        return w;
      }
    }
  throw new Error('no ground to camp on');
}

describe('camp strings', () => {
  it('ru has every key with the same placeholders', () => {
    for (const k of Object.keys(CAMP_V5_EN) as (keyof typeof CAMP_V5_EN)[]) {
      expect(CAMP_V5_RU[k], k).toBeTruthy();
      expect([...new Set(placeholders(CAMP_V5_RU[k]))], k).toEqual([...new Set(placeholders(CAMP_V5_EN[k]))]);
    }
  });

  it('every key the scene asks for exists', () => {
    const keys = [...campSrc.matchAll(/\bt\('([\w.]+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(40);
    for (const k of keys) expect(EN, k).toHaveProperty([k]);
  });

  it('the scene has no English text of its own (G12)', () => {
    const literals = [...code.matchAll(/'([A-Z][a-z]+ [a-z][^']*)'/g)].map((m) => m[1]);
    expect(literals).toEqual([]);
    // structure names come from i18n, not from the data's English names
    expect(code).not.toMatch(/STRUCTURES\[[^\]]+\]\.(name|desc)/);
    expect(code).not.toMatch(/\.name\} \(\$\{e\.item\.rarity\}\)/);
  });

  it('structures and times are named in the player language', () => {
    expect(structName('training')).toBe('Drill yard');
    expect(hoursText(0.5)).toBe('30 min');
    expect(hoursText(3)).toBe('3 h');
    setLang('ru');
    expect(structName('forge')).toBe('Кузня');
    expect(hoursText(2)).toBe('2 ч');
  });
});

describe('the Build drawer (CMP-1)', () => {
  it('says why a structure cannot be built: none left, supplies, room', () => {
    const w = campedWorld();
    w.s.supplies = 1;
    expect(fieldBuildWhy(w, 'tent')).toBe(`needs ${STRUCTURES.tent.cost} supplies`);
    w.s.supplies = 100;
    expect(fieldBuildWhy(w, 'tent')).toBeNull();
    const c = w.camp!;
    for (const i of c.zone) if (w.build('fire', i % w.map.w, Math.floor(i / w.map.w)) === null) break;
    expect(fieldBuildWhy(w, 'fire')).toBe('all built');
    setLang('ru');
    w.s.supplies = 0;
    expect(fieldBuildWhy(w, 'palisade')).toBe(`нужно ${STRUCTURES.palisade.cost} прип.`);
  });

  it('lists all five structures with name, cost, time and count', () => {
    const drawer = code.slice(code.indexOf('openBuild(): void'), code.indexOf('private openBuildings'));
    for (const part of ['STRUCTURE_LIST.map', 'structName(d.id)', "t('cmp.drawer.meta'", 'hoursText(d.hours)', "t('cmp.drawer.count'", 'fieldBuildWhy(w, d.id)']) expect(drawer).toContain(part);
  });
});

describe('supplies for works (field-works.md R4)', () => {
  it('the page shows each work with its cost and how many the supplies buy', () => {
    const page = code.slice(code.indexOf('openSupplies(): void'));
    for (const part of ['worksAllowance(w.supplies)', 'WORKS.cost[k]', "t('cmp.sup.can'", "t('cmp.sup.none')", 'WORK_TYPES']) expect(page).toContain(part);
    // the allowance the page reads: as many of each as the supplies buy, at most WORKS.max
    expect(worksAllowance(104)).toEqual({ stakes: WORKS.max, ditch: WORKS.max, laager: WORKS.max });
    expect(worksAllowance(20)).toEqual({ stakes: 3, ditch: 2, laager: 1 });
  });
});

describe('v5 chrome', () => {
  it('no red text and no dark v3 bands (G7, CMP-3)', () => {
    expect(code).not.toMatch(/'red'/);
    expect(code).not.toContain("'chipStone'");
    expect(code).not.toContain("'topBar'");
    expect(code).not.toContain('openModal(');
  });

  it('keeps every action of the field camp (E104-E122)', () => {
    for (const id of ['camp.topbar', 'camp.zoom', 'camp.muster', 'camp.loot', 'camp.endDay', 'camp.strike', 'camp.cancel', 'camp.place', 'camp.build']) expect(code, id).toContain(`'${id}`);
    expect(code).toContain('`camp.temper.do.');
    for (const fn of ['openTemper(): void', 'openMuster(): void', 'private strike(): void', 'openEvent(): void', 'private tapTile(', 'private onMove(']) expect(code, fn).toContain(fn);
    // the strike still confirms as a destructive action
    const strike = code.slice(code.indexOf('private strike(): void'));
    expect(strike.slice(0, 500)).toMatch(/confirmDialog\([\s\S]*destructive: true/);
  });

  it('Strike keeps its label and sits apart from End day (C-5)', () => {
    const rows = code.slice(code.indexOf('private actionRows()'), code.indexOf('private refreshBar()'));
    const strikeRow = rows.indexOf("id: 'camp.strike'");
    const endRow = rows.indexOf("id: 'camp.endDay'");
    // Strike opens the first row, End day closes the second: never neighbours
    expect(strikeRow).toBeGreaterThan(0);
    expect(rows.slice(strikeRow, endRow)).toMatch(/\],\s*\[/);
    expect(rows).not.toContain('iconOnly');
  });
});
