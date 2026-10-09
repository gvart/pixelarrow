import { describe, expect, it } from 'vitest';
import uiJson from '../public/icons/ui.json?raw';
import itemsJson from '../public/icons/items.json?raw';
import { VECTOR_ICONS, VECTOR_CAMP_ICONS } from '../src/art/vectorIcons';
import { UI_ICONS } from '../src/art/uiIcons';
import { ITEM_LIST } from '../src/data/items';
import { POWER_IDS } from '../src/data/affixes';
import { CONSUMABLE_ICON_IDS, RESOURCE_ICON_IDS } from '../src/art/goodsIcons';

interface Atlas {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
  meta: { size: { w: number; h: number } };
}
const ATLAS: Record<'ui' | 'items', Atlas> = { ui: JSON.parse(uiJson), items: JSON.parse(itemsJson) };

/** Icons with no drawing yet: they show their vector form. An icon added to the game goes here until its art is in the atlases. */
const WAITING_FOR_ART: string[] = [];

describe('drawn icon atlases (public/icons)', () => {
  const ui = ATLAS.ui.frames;
  const items = ATLAS.items.frames;

  it('hold every icon the game draws', () => {
    const want = [
      ...Object.keys(VECTOR_ICONS).map((k) => `ui:${k}`),
      ...Object.keys(UI_ICONS).map((k) => `ui:${k}`),
      ...Object.keys(VECTOR_CAMP_ICONS).map((k) => `camp:${k}`),
      ...POWER_IDS.map((k) => `power:${k}`),
      'chrome:sync_synced', 'chrome:sync_syncing', 'chrome:sync_offline', 'chrome:supporter_banner',
    ];
    expect(want.filter((id) => !ui[id]).sort()).toEqual([...WAITING_FOR_ART].sort());
    // base trinkets are trinket:<id>, set and named trinkets item:<id> (src/art/iconBitmaps.ts itemIconId)
    for (const d of ITEM_LIST) expect(items[`trinket:${d.id}`] ?? items[`item:${d.id}`], d.id).toBeDefined();
    for (const id of [...CONSUMABLE_ICON_IDS, ...RESOURCE_ICON_IDS]) expect(items[`goods:${id}`], id).toBeDefined();
  });

  it('keep every frame inside its sheet', () => {
    for (const a of Object.values(ATLAS)) {
      for (const [id, { frame }] of Object.entries(a.frames)) {
        expect(frame.x >= 0 && frame.y >= 0 && frame.x + frame.w <= a.meta.size.w && frame.y + frame.h <= a.meta.size.h, id).toBe(true);
      }
    }
  });
});
