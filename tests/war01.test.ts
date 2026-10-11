/**
 * WAR-01: the War hub and the War army (design/ux/screens-modes.md M-8, M-9).
 * The hex panel's buttons keep their places (C8); the stone rail labels its
 * keys when they fit and never cuts a label; the zoom key cycles; Back from the
 * War army honours hex 0 (OAR-5) and the screen that opened it; a hero holding
 * a hex is not shown as a loss (OAR-4); owned and clan land carry a crest
 * (G13); the boss leaderboard is a table (WAR-7); every war5 string exists in
 * both languages; the hub never leaves for the Campaign hub on Back (D12).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import onlineSrc from '../src/scenes/online/OnlineScene.ts?raw';
import armySrc from '../src/scenes/online/OnlineArmyScene.ts?raw';
import { WAR_V5_EN } from '../src/i18n/war.v5.en';
import { WAR_V5_RU } from '../src/i18n/war.v5.ru';
import { setLang, t } from '../src/i18n';

// the scenes draw with Phaser; the rules tested here are pure. Phaser itself needs a browser.
vi.mock('phaser', () => {
  class C {}
  return {
    default: {
      GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C, Zone: C, BitmapText: C, Sprite: C, Layer: C, TileSprite: C },
      Scene: C,
      Loader: { Events: {} },
      Geom: { Rectangle: C },
      Math: { Clamp: (v: number) => v, Distance: { Between: () => 0 } },
      Cameras: { Scene2D: { Camera: C } },
    },
  };
});
const { panelActs, ACT_ORDER, railLayout } = await import('../src/scenes/online/OnlineScene');
const { warArmyBack, warStatus, footerWidths } = await import('../src/scenes/online/OnlineArmyScene');
const { zoomCycle, zoomLimits, plateCrest } = await import('../src/scenes/online/regionMapView');
const { bossBoard } = await import('../src/scenes/online/beastPanel');

const placeholders = (e: unknown): string[] => [...JSON.stringify(e).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

afterEach(() => setLang('en'));

describe('war5 strings', () => {
  it('ru has every key with the same placeholders', () => {
    for (const k of Object.keys(WAR_V5_EN) as (keyof typeof WAR_V5_EN)[]) {
      expect(WAR_V5_RU[k], k).toBeTruthy();
      expect(placeholders(WAR_V5_RU[k]), k).toEqual(placeholders(WAR_V5_EN[k]));
    }
    expect(Object.keys(WAR_V5_RU).sort()).toEqual(Object.keys(WAR_V5_EN).sort());
  });

  it('the War army is called the War army (M-9, renamed from "Online army")', () => {
    expect(t('war5.armyTitle')).toBe('War army');
    expect(code(armySrc)).toContain("t('war5.armyTitle')");
    expect(code(armySrc)).not.toContain("t('oarmy.title')");
  });
});

describe('hex panel actions (C8)', () => {
  it('March and Attack keep their places before and after the march', () => {
    const before = panelActs(
      [
        { id: 'march', enabled: true },
        { id: 'attack', enabled: true, primary: true },
      ],
      true,
    );
    // the army now stands on the hex: regionActions leaves March out
    const after = panelActs([{ id: 'attack', enabled: true, primary: true }], true);
    expect(before.map((a) => a.id)).toEqual(['march', 'attack']);
    expect(after.map((a) => a.id)).toEqual(['march', 'attack']);
    expect(after[0]).toMatchObject({ enabled: false, reason: 'here' });
  });

  it('owned land keeps one order; impassable land gets no extra March', () => {
    const own = panelActs(
      [
        { id: 'garrison', enabled: true, primary: true },
        { id: 'collect', enabled: false, reason: 'noIncome' },
        { id: 'march', enabled: true },
      ],
      true,
    );
    expect(own.map((a) => a.id)).toEqual(['march', 'collect', 'garrison']);
    expect(panelActs([{ id: 'march', enabled: false, reason: 'impassable' }], false).map((a) => a.id)).toEqual(['march']);
    expect([...ACT_ORDER]).toEqual(['march', 'attack', 'collect', 'garrison']);
  });
});

describe('the stone rail (WAR-2)', () => {
  const labels = ['Army', 'Clan', 'Lobby', 'Centre', 'Zoom'];
  it('labels its keys in one column when they fit, each key at least 44 pt', () => {
    const r = railLayout(labels, 400);
    expect(r.labels).toBe(true);
    expect(r.keyH).toBeGreaterThanOrEqual(22);
    expect(r.keyW).toBeGreaterThanOrEqual(22);
    expect(new Set(r.keys.map((k) => k.x)).size).toBe(1);
    expect(r.h).toBeLessThanOrEqual(400);
  });

  it('a Russian label is never cut: the key is as wide as its label', () => {
    const r = railLayout(['Войско', 'Клан', 'Лобби', 'Центр', 'Масштаб'], 400);
    expect(r.labels).toBe(true);
    expect(r.keyW).toBeGreaterThan(railLayout(['A', 'B', 'C', 'D', 'E'], 400).keyW);
  });

  it('short windows: icon-only keys in a column, then one row', () => {
    const col = railLayout(labels, 130);
    expect(col.labels).toBe(false);
    expect(col.h).toBeLessThanOrEqual(130);
    const row = railLayout(labels, 40);
    expect(row.labels).toBe(false);
    expect(new Set(row.keys.map((k) => k.y)).size).toBe(1);
    expect(row.h).toBeLessThanOrEqual(40);
  });
});

describe('the zoom key (WCAG 2.5.1)', () => {
  it('cycles overview, start and close, all inside the limits', () => {
    const lim = zoomLimits(2);
    const seen: number[] = [];
    let z = lim.start;
    for (let i = 0; i < 3; i++) {
      z = zoomCycle(z, lim);
      seen.push(z);
      expect(z).toBeGreaterThanOrEqual(lim.min);
      expect(z).toBeLessThanOrEqual(lim.max);
    }
    expect(new Set(seen).size).toBe(3);
    expect(seen).toContain(lim.start);
  });
});

describe('the War army', () => {
  it('Back: hex 0 is a hex like any other (OAR-5)', () => {
    expect(warArmyBack({ garrison: 0 })).toEqual({ scene: 'Online', data: { focus: 0, select: true } });
    expect(code(armySrc)).not.toMatch(/if \(this\.garrisonHex\)/);
    expect(code(armySrc)).not.toMatch(/!this\.garrisonHex\b/);
  });

  it('Back: to the screen that opened it, else the War hub', () => {
    expect(warArmyBack({ back: { scene: 'Camp', data: { mode: 'online' } } })).toEqual({ scene: 'Camp', data: { mode: 'online' } });
    expect(warArmyBack({}).scene).toBe('Online');
  });

  it('holding a hex or being in battle is not a loss; a wound is (OAR-4)', () => {
    const base = { hero: {} as never, garrison: null, woundedUntil: 0, busy: false };
    const name = () => 'Arcadia';
    expect(warStatus({ ...base, garrison: 4 }, 0, name)).toMatchObject({ bad: false });
    expect(warStatus({ ...base, garrison: 4 }, 0, name)?.text).toContain('Arcadia');
    expect(warStatus({ ...base, busy: true }, 0, name)).toMatchObject({ bad: false });
    expect(warStatus({ ...base, woundedUntil: 5000 }, 1000, name)).toMatchObject({ bad: true });
    expect(warStatus({ ...base }, 0, name)).toBeNull();
  });

  it('the footer: no map icon, three labelled buttons (OAR-2)', () => {
    const src = code(armySrc);
    expect(src).not.toContain("'oarmy.map'");
    for (const id of ['oarmy.recruit', 'oarmy.market', 'oarmy.shop', 'oarmy.station']) expect(src).toContain(`'${id}'`);
    const wide = footerWidths(['Recruit', 'Market', 'Shop'], 200);
    expect(wide.icons).toBe(true);
    expect(wide.widths.reduce((a, x) => a + x, 0)).toBeLessThanOrEqual(200);
    const narrow = footerWidths(['Recruit', 'Market', 'Shop'], 150);
    expect(narrow.icons).toBe(false);
    // the longest label gets the widest button, so the three keep one size
    expect(narrow.widths[0]).toBeGreaterThan(narrow.widths[2]);
    expect(narrow.widths.reduce((a, x) => a + x, 0)).toBeLessThanOrEqual(150);
  });

  it('food is the wheat, not a heart (OAR-3)', () => {
    expect(code(armySrc)).toContain("icon: 'food'");
    expect(code(armySrc)).not.toContain("'heart'");
  });
});

describe('the War hub', () => {
  it('Back never leaves the hub for the Campaign hub (D12)', () => {
    const src = code(onlineSrc);
    expect(src).not.toMatch(/scene\.start\('Menu'/);
    expect(src).not.toContain("'online.backToMenu'");
  });

  it('every element of ELEMENT_MAP §1.17 keeps its control', () => {
    const src = code(onlineSrc);
    for (const id of ['online.bar.army', 'online.bar.clan', 'online.bar.duels', 'online.centre', 'online.zoom', 'online.bar.collect', 'online.halt', 'online.act.merchant', 'online.act.camp', 'online.act.beast', 'online.act.codex', 'online.retry', 'online.join', 'online.panel', 'online.hexInfo'])
      expect(src, id).toContain(`'${id}'`);
    for (const fn of ['openLobby', 'showAttackResult', 'showDuelResult', 'openBeast', 'openMerchant', 'openCamp', 'openCodex', 'onDown', 'onMove', 'onUp', 'zoomAt']) expect(src, fn).toContain(`${fn}(`);
    expect(src).toContain("this.input.on('wheel'");
  });

  it('own and clan land carry a crest; others only their colour (G13)', () => {
    const map = { you: { id: 1, clan: 7, home: 0, army: {} as never } };
    expect(plateCrest(map, { owner: 1, clan: 7 })).toBe('mine');
    expect(plateCrest(map, { owner: 2, clan: 7 })).toBe('clan');
    expect(plateCrest(map, { owner: 3, clan: 9 })).toBeNull();
    expect(plateCrest(map, { owner: null, clan: null })).toBeNull();
  });

  it('the boss leaderboard is a table: rank, name, clan, damage (WAR-7)', () => {
    const rows = bossBoard({ top: [{ name: 'Brasidas', clan: 'KIT', damage: 2140 }, { name: 'Phormion', clan: null, damage: 410 }] } as never);
    expect(rows).toEqual([
      { rank: 1, name: 'Brasidas', clan: 'KIT', damage: '2,140' },
      { rank: 2, name: 'Phormion', clan: null, damage: '410' },
    ]);
  });
});
