import { describe, expect, it } from 'vitest';
import uiJson from '../public/icons/ui.json?raw';
import itemsJson from '../public/icons/items.json?raw';
import readme from '../docs/icons/README.md?raw';
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

/** Icons with no drawn art yet: their vector icon is used. Keep in step with docs/icons/README.md "Waiting for art". */
const WAITING_FOR_ART = ['ui:wargold', 'ui:xmark'];

describe('drawn icon atlases (public/icons, docs/icons/README.md)', () => {
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
    // icons added after the sheets were drawn keep their vector form until their art comes
    // (docs/icons/README.md "Waiting for art"); any other icon without art is a mistake
    expect(want.filter((id) => !ui[id]).sort()).toEqual([...WAITING_FOR_ART].sort());
    // base trinkets are trinket:<id>, set and named trinkets item:<id> (src/art/iconBitmaps.ts itemIconId)
    for (const d of ITEM_LIST) expect(items[`trinket:${d.id}`] ?? items[`item:${d.id}`], d.id).toBeDefined();
    for (const id of [...CONSUMABLE_ICON_IDS, ...RESOURCE_ICON_IDS]) expect(items[`goods:${id}`], id).toBeDefined();
  });

  it('match the atlas list in docs/icons/README.md, frames inside the sheet', () => {
    const ids = [...readme.matchAll(/^\| \d+ \| R\d C\d \| [^|]+\| `([^`]+)` \|/gm)].map((m) => m[1]);
    expect(ids.length).toBe(296);
    for (const id of ids) expect(ui[id] ?? items[id], id).toBeDefined();
    for (const [name, f] of [['ui', ui], ['items', items]] as const) {
      const meta = ATLAS[name].meta.size;
      for (const [id, { frame }] of Object.entries(f)) {
        expect(frame.x + frame.w <= meta.w && frame.y + frame.h <= meta.h, id).toBe(true);
      }
    }
  });
});
