/** Deed vectors (src/war/sim/deeds.ts): every plain deed, the slayer deed of every boss (and unknown ones), banners, addDeeds. */
import { addDeeds, DEED_NAME, masteryDeed, plainDeed, slayerDeed, type PlainDeed } from '../../war/sim/deeds';
import { WAR_BOSSES } from '../../data/warBosses';
import { Rng } from '../../sim/rng';
import type { Deed } from '../../war/types';

export const vectors = () => {
  const r = new Rng(29), d = (x: Deed) => [x.id, x.name];
  const plain = (Object.keys(DEED_NAME) as PlainDeed[]).map((id) => [id, ...d(plainDeed(id))]);
  const slayer = [...WAR_BOSSES.map((b) => b.id), 'the nameless', 'wolf'].map((b) => [b, ...d(slayerDeed(b))]);
  const mastery = [['dodona-n', 'Boreas Fjords'], ['x', '']].map(([a, b]) => [a, b, ...d(masteryDeed(a, b))]);
  const pool: Deed[] = [...plain, ...slayer.slice(0, 6)].map(([, id, name]) => ({ id, name }));
  const adds: unknown[] = [];
  for (let i = 0; i < 80; i++) {
    const have = i % 7 === 0 ? undefined : Array.from({ length: r.int(0, 9) }, () => r.pick(pool));
    const had = Array.from({ length: r.int(0, 6) }, () => r.pick(pool));
    const out = addDeeds(have, had);
    adds.push([have ? have.map(d) : null, had.map(d), out.all.map(d), out.fresh.map(d)]);
  }
  return { plain, slayer, mastery, adds };
};
