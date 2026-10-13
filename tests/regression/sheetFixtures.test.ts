import { describe, expect, it } from 'vitest';
import layoutCheck from '../../scripts/layout-check.mjs?raw';
import sheetLayout from '../../scripts/regression/sheet-layout.mjs?raw';
import { sourceFiles } from '../support/nodeIo.js';

// QA-02 acceptance 2: every new (v5) sheet has a layout fixture at 320x568, 320x640, 360x780 and 390x844,
// in en and ru. The sheets are derived: every `open…` function exported from src/ui/sheets/**. Each must
// be staged by a screen of scripts/layout-check.mjs or a fixture of scripts/regression/sheet-layout.mjs
// (the map below says which). Derivation stops at the map: which fixture shows which sheet is not
// mechanically readable from the scripts, so a new sheet fails here until a fixture is added and mapped.

type Cover = { layout?: string[]; regression?: string[]; none?: string };
const COVER: Record<string, Cover> = {
  openArcSheet: { layout: ['world-journal'], regression: ['sheet-arc-lairs'] },
  openAssaultSheet: { regression: ['sheet-assault'] },
  openAbilitySheet: { regression: ['sheet-abilities'] },
  openBattleMenu: { layout: ['battle-menu-deploy', 'battle-menu', 'battle-menu-locked'] },
  openDoctrineSheet: { layout: ['codex-doctrine'] },
  openEncounterSheet: { layout: ['world-encounter'] },
  openEventCard: { layout: ['world-event', 'world-event-costs'] },
  openForgeSheet: { layout: ['town-forge'] },
  openForgeItemSheet: { layout: ['town-forge-item', 'town-forge-poor'] },
  openRecruitSheet: { layout: ['town-recruit-card'] },
};

const SIZES = ['320x568', '320x640', '360x780', '390x844'];
const defaults = (src: string, name: string) => (new RegExp(`opt\\('${name}', '([^']+)'\\)`).exec(src)?.[1] ?? '').split(',');

describe('sheet layout fixtures (QA-02)', () => {
  const openers = sourceFiles('src/ui/sheets').flatMap((f) => [...f.text.matchAll(/^export function (open\w+)/gm)].map((m) => m[1]));

  it('finds the sheet openers (the derivation ran)', () => {
    expect(openers.length).toBeGreaterThanOrEqual(10);
  });

  it('maps every sheet opener in src/ui/sheets to a fixture', () => {
    for (const o of openers) expect(COVER[o], `${o}: add a layout fixture and map it here`).toBeDefined();
    for (const o of Object.keys(COVER)) expect(openers, `COVER.${o} is not an opener any more`).toContain(o);
  });

  it('names fixtures that exist', () => {
    for (const [o, c] of Object.entries(COVER)) {
      expect(!!c.none || (c.layout?.length ?? 0) + (c.regression?.length ?? 0) > 0, o).toBe(true);
      for (const id of c.layout ?? []) expect(layoutCheck.includes(`'${id}'`), `${o}: no screen '${id}' in scripts/layout-check.mjs`).toBe(true);
      for (const id of c.regression ?? []) expect(sheetLayout.includes(`id: '${id}'`), `${o}: no fixture '${id}' in scripts/regression/sheet-layout.mjs`).toBe(true);
    }
  });

  it('runs every fixture at the four sizes in en and ru by default', () => {
    for (const [name, src] of [['layout-check', layoutCheck], ['sheet-layout', sheetLayout]] as const) {
      expect(defaults(src, 'sizes'), name).toEqual(expect.arrayContaining(SIZES));
      expect(defaults(src, 'langs'), name).toEqual(expect.arrayContaining(['en', 'ru']));
    }
  });
});
