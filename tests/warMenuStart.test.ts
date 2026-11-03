// The new player's start screens (src/war/menu/screens.ts): the home picker's lore and detail, the path cards.
import { describe, expect, it } from 'vitest';
import { ALLIANCES } from '../src/war/world/alliances';
import { homeChoices, PATH_IDS, PATHS } from '../src/war/world/start';
import { HOME_LORE } from '../src/war/menu/homeLore';
import { homeDetail, pathCard } from '../src/war/menu/screens';
import type { AllianceId } from '../src/war/world/types';

const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).filter(Boolean).length;

describe('home lore', () => {
  it('covers every home choice of every alliance, 2 to 4 sentences each, and nothing else', () => {
    const ids = ALLIANCES.flatMap((a) => homeChoices(a.id).map((r) => r.id));
    expect(Object.keys(HOME_LORE).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const n = sentences(HOME_LORE[id].lore);
      expect(n, id).toBeGreaterThanOrEqual(2);
      expect(n, id).toBeLessThanOrEqual(4);
      expect(HOME_LORE[id].play.length, id).toBeGreaterThan(40);
    }
  });

  it('rates the home cities easiest and the gates on a contested road hardest', () => {
    for (const a of ALLIANCES) for (const r of homeChoices(a.id)) {
      if (r.role === 'home') expect(HOME_LORE[r.id].difficulty, r.id).toBe(1);
      else expect(HOME_LORE[r.id].difficulty, r.id).toBeGreaterThan(1);
    }
  });

  it('shows the lore, the play line, the resources, the beasts and where it leads', () => {
    const h = { id: 'dodona-e', name: 'Teeth Foothills', role: 'entry' as const, players: 2, men: 24, quota: 120, refusal: null };
    const html = homeDetail(h, 0 as AllianceId);
    expect(html).toContain('Teeth Foothills');
    expect(html).toContain(HOME_LORE['dodona-e'].lore.slice(0, 30));
    expect(html).toContain('Hard');
    expect(html).toContain('Iron <b>1</b>');
    expect(html).toContain('Bear, Bandit');
    // only the roads out of the alliance's land, not its own home and gates
    expect(html).toContain('Kleisoura Pass, Grey Moors');
    expect(html).not.toContain('Boreas Fjords');
  });

  it('lists a home city\'s four gates and no beasts', () => {
    const html = homeDetail({ id: 'elaia', name: 'Elaia', role: 'home', players: 0, men: 0, quota: 120, refusal: null }, 3 as AllianceId);
    expect(html).toContain('Gates');
    expect(html).toContain('Lakeshore Fens');
    expect(html).toContain('None. A home never falls');
  });
});

describe('path cards', () => {
  it('say in plain words what the path does, what it starts with and how far it grows', () => {
    for (const id of PATH_IDS) {
      const html = pathCard(id), p = PATHS[id];
      expect(html, id).toContain(p.name);
      expect(html, id).toContain(p.does);
      expect(html, id).toContain(p.startText);
      expect(html, id).toContain(`${p.cap} soldiers`);
    }
  });
});
