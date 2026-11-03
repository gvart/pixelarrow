/**
 * W-147 a builder's and a trader's own chain at every home: short goals for the compact quest card, places a man can walk
 * to, only for their path; `built` and `trade` steps played on the real sim's run.
 */
import { describe, expect, it } from 'vitest';
import { PATH_STORIES, STORIES, storyOf } from '../../src/data/warStories';
import { ALLIANCES } from '../../src/war/world/alliances';
import { parseRegion } from '../../src/war/region/schema';
import { buildGrid, findPath, tileAt } from '../../src/war/sim/grid';
import { storyPath, StoryRun, type Story, type StoryReward } from '../../src/war/sim/stories';
import { npcSpot } from '../../src/war/net/npcMarket';
import type { RegionData, Snapshot } from '../../src/war/types';

const jsons = import.meta.glob<unknown>('../../src/war/regions/*.json', { eager: true, import: 'default' });
const region = (id: string) => parseRegion(jsons[`../../src/war/regions/${id}.json`]) as RegionData;
const HOMES = Object.values(ALLIANCES).map((a) => a.home);
const chains = Object.values(PATH_STORIES).flatMap((by) => Object.values(by) as Story[]);

describe('W-147 the chains', () => {
  it('a builder and a trader chain at every home, none for a warrior, none elsewhere', () => {
    expect(Object.keys(PATH_STORIES).sort()).toEqual([...HOMES].sort());
    for (const h of HOMES) {
      expect(storyOf(h, 'builder')?.path).toBe('builder');
      expect(storyOf(h, 'trader')?.path).toBe('trader');
      expect(storyOf(h, 'warrior')).toBeNull();
      expect(storyOf(h)).toBeNull();
    }
    for (const [id, s] of Object.entries(STORIES)) expect(storyOf(id, 'builder')).toBe(s); // a land's own chain is everyone's
  });

  it('ids are unique, nobody is named twice, the text fits the card', () => {
    const all = [...chains, ...Object.values(STORIES)];
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    const names = chains.map((s) => s.giver.name);
    expect(new Set(names).size).toBe(names.length);
    for (const s of chains) {
      expect(s.region in PATH_STORIES, s.id).toBe(true);
      expect(storyPath(s, null).length, s.id).toBeLessThanOrEqual(5);
      expect(s.hook.split(' ').length, `${s.id} hook`).toBeLessThanOrEqual(12);
      for (const st of s.steps) {
        expect(st.goal.split(' ').length, `${s.id}/${st.id}: ${st.goal}`).toBeLessThanOrEqual(7);
        expect(st.goal, `${s.id}/${st.id}`).not.toMatch(/\d/);
        expect(st.label.split(' ').length, `${s.id}/${st.id} label`).toBeLessThanOrEqual(2);
      }
    }
  });

  for (const s of chains)
    it(`${s.region}/${s.path}: "${s.title}": every place walkable from the giver, the town too`, () => {
      const r = region(s.region), g = buildGrid(r), run = new StoryRun(r, s, null, { team: 0 }, { addLair() {}, spawnSoul() {}, give() {} });
      const from = tileAt(g, run.spots.giver.x, run.spots.giver.y);
      expect(g.cost[from]).toBeGreaterThan(0);
      for (const st of s.steps) for (const p of run.spots.steps[st.id]) {
        const t = tileAt(g, p.x, p.y);
        expect(g.cost[t], `${st.id} on open ground`).toBeGreaterThan(0);
        expect(findPath(g, from, t).at(-1), `${st.id} reachable`).toBe(t);
      }
      const town = npcSpot(r);
      expect(Math.hypot(town.x - run.spots.giver.x, town.y - run.spots.giver.y), 'the giver stands near the town').toBeLessThan(60);
    });
});

/** A bare snapshot: his men where told, these buildings. */
const snap = (x: number, y: number, buildings: unknown[] = []) =>
  ({ tick: 1, units: [{ id: 1, team: 0, x, y, state: 'idle', squad: 1, cls: 'militia' }], squads: [{ id: 1, team: 0, units: [1], owner: 'p:1' }], buildings, lairs: [], sieges: [] }) as unknown as Snapshot;

function play(story: Story) {
  const r = region(story.region), paid: StoryReward[] = [];
  const run = new StoryRun(r, story, null, { team: 0, owner: 'p:1' }, { addLair() {}, spawnSoul() {}, give: (x) => void paid.push(x) });
  return { run, paid, at: (s: Snapshot) => run.tick(s, []) };
}

describe('W-147 played', () => {
  it('a builder: reach, a storehouse of his, a hire, a house, a choice, the end', () => {
    const story = PATH_STORIES.dodona.builder!, { run, at, paid } = play(story), g = run.spots.giver;
    at(snap(g.x, g.y));
    expect(run.save.at).toBe('ground');
    const p = run.spots.steps.ground[0];
    at(snap(p.x, p.y));
    expect(run.save.at).toBe('store');
    const store = (o: Record<string, unknown>) => ({ id: 1, type: 'storehouse', team: 0, state: 'done', owner: 'p:1', ...o });
    at(snap(p.x, p.y, [store({ pre: true })])); // the town's own storehouse
    at(snap(p.x, p.y, [store({ owner: 'p:2' })])); // another man's
    at(snap(p.x, p.y, [store({ state: 'scaffold' })])); // not finished
    expect(run.save.at).toBe('store');
    at(snap(p.x, p.y, [store({})]));
    expect(run.save.at).toBe('hand');
    expect(run.trade(snap(p.x, p.y), 'buy', 100, 0)).toEqual([]); // the wrong deal
    run.trade(snap(p.x, p.y), 'hire', 200, 0);
    expect(run.save.at).toBe('house');
    at(snap(p.x, p.y, [{ id: 2, type: 'privateHouse', team: 0, state: 'done', owner: 'p:1' }]));
    expect(run.save.at).toBe('beam');
    run.choose(snap(p.x, p.y), 'own');
    expect(run.save.done).toBe(true);
    expect(paid.reduce((t, x) => t + (x.goods?.coin ?? 0), 0)).toBeGreaterThan(0);
  });

  it('a trader: partial deals add up to the step\'s coin; only goods from abroad count for a far sale', () => {
    const story = PATH_STORIES.kyrene.trader!, { run, at } = play(story), g = run.spots.giver;
    at(snap(g.x, g.y));
    const p = run.spots.steps.loads[0];
    at(snap(p.x, p.y));
    expect(run.save.at).toBe('sell');
    expect(run.trade(snap(p.x, p.y), 'sell', 10, 0).map((n) => n.kind)).toEqual(['count']);
    expect(run.save.at).toBe('sell');
    run.trade(snap(p.x, p.y), 'sell', 25, 0);
    expect(run.save.at).toBe('buy');
    run.trade(snap(p.x, p.y), 'buy', 60, 0);
    expect(run.save.at).toBe('far');
    run.trade(snap(p.x, p.y), 'sell', 500, 0); // his own land's goods
    expect(run.save.at).toBe('far');
    run.trade(snap(p.x, p.y), 'sell', 80, 70);
    expect(run.save.at).toBe('far');
    run.trade(snap(p.x, p.y), 'sell', 50, 40);
    expect(run.save.at).toBe('seal');
  });
});
