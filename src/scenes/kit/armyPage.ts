/**
 * The Kit's "Army" page (story F-05): the shared Army template (src/ui/army, ARM-01) on a sample
 * company that touches no save: the hero card, its collapsed one-line form, roster rows in their
 * states (fit, selected, wounded, points to spend, a long name), the group discs and the footer.
 */
import { Rng } from '../../sim/rng';
import type { Hero } from '../../data/units';
import { toast } from '../../ui/widgets';
import { ARMY_ROW_H, ArmyFooter, addArmyHead, addGroupDisc, addMiniHead, addRosterRow, ensureBusts, pendingPoints, tappableRow, type ArmySource } from '../../ui/army';
import { makeHero } from '../../game/heroes';
import { heroClass } from '../../sim/stats';
import { G, type Cursor } from './common';

/** The sample company: fixed seeds, so the page looks the same on every visit. */
function sampleHeroes(): Hero[] {
  const ids = { nextId: 1 };
  const out: Hero[] = [];
  const add = (seed: number, cls: Parameters<typeof makeHero>[3], level: number, group: number) => {
    const h = makeHero(new Rng(seed), ids, 'greek', cls, level, 2, group, out);
    out.push(h);
    return h;
  };
  add(11, 'hoplite', 6, 0);
  add(12, 'peltast', 4, 1).points = 3;
  add(13, 'slinger', 3, 2).wound = 5;
  const long = add(14, 'militia', 1, 3);
  long.name = 'Epameinondas Theodorakopoulos of Thebes';
  return out;
}

export function buildArmy(cur: Cursor): void {
  const { scene, w } = cur;
  const heroes = sampleHeroes();
  const src: ArmySource = {
    kind: 'campaign',
    heroes: () => heroes,
    stash: () => [],
    maxArmy: () => 12,
    gold: () => 240,
    repairCost: () => 0,
    equip: () => false,
    unequip: () => false,
    repair: () => false,
    setGroup: () => false,
    pending: pendingPoints,
    status: (h) => (h.wound > 0 ? { text: `Wounded, ${Math.ceil(h.wound)} h`, bad: true } : null),
  };

  cur.title('Hero card');
  cur.note('ArmySource feeds the one template: campaign, duel team and war army (ARM-01).');
  const head = addArmyHead(scene, cur.c, 0, cur.y, w, heroes[0], src, { onGroup: (g) => toast(scene, `Group ${g + 1}`), onSlot: (s) => toast(scene, s), selectedSlot: 'weapon' });
  cur.y += head.h + G;
  const card = cur.c;
  ensureBusts(scene, [heroClass(heroes[0]).id], () => card.scene && head.addBust());

  cur.title('Collapsed card');
  addMiniHead(scene, cur.c, 0, cur.y, w, heroes[1], src, () => toast(scene, 'Expand'));
  cur.y += 24 + G;

  cur.title('Roster rows');
  cur.note('Fit (rank stars), selected, points to spend (count badge), wounded (error ink), a long name.');
  heroes.forEach((h, i) => {
    const row = scene.add.container(0, cur.y);
    addRosterRow(scene, row, w, ARMY_ROW_H, h, src, i === 0);
    tappableRow(row, w, ARMY_ROW_H, cur.area, () => toast(scene, h.name));
    cur.add(row);
    cur.y += ARMY_ROW_H + G;
  });

  cur.title('Group discs');
  const step = Math.floor(w / 4);
  for (let g = 0; g < 4; g++) addGroupDisc(scene, cur.c, g * step + Math.round((step - 15) / 2), cur.y, g);
  cur.y += 15 + 2;
  cur.note('Ochre, olive, slate-teal, plum, each with its numeral: never red (G3).');

  cur.title('Footer');
  const foot = new ArmyFooter(scene, 0, cur.y + 32, w, { label: 'Dismiss', icon: 'skull', variant: 'neutral', onClick: () => toast(scene, 'Dismiss') }, { label: 'Sheet', variant: 'primary', onClick: () => toast(scene, 'Sheet') });
  cur.add(foot);
  cur.y += foot.h + 2;
  cur.note('Dismiss (bronze, confirms) 24 pt away from the one primary (P4).');
}
