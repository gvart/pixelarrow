/**
 * World-fill hidden quests (src/war/sim/secrets.ts) on real regions: players' squads (and a bot's, the wild's, roaming
 * folk and civilians, which never count) wander, walk to unfound spots and to the open step of their runs; asked-for
 * lairs and souls appear or not and lairs get cleared; the root moves to a fresh secrets now and then. Each look writes
 * the world it saw and every host call it made; open lines and saves are read back as it goes.
 */
import { Rng } from '../../sim/rng';
import { parseRegion } from '../../war/region/schema';
import { MOB_TEAM } from '../../war/sim/mobs';
import { NEUTRAL_TEAM } from '../../war/sim/economy';
import { createSecrets, type SecretHost } from '../../war/sim/secrets';
import type { LairSnap, RegionData, SoulSnap } from '../../war/types';

const regionFiles = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });
const load = (id: string): RegionData => parseRegion(regionFiles[`../../war/regions/${id}.json`]);

type Squad = SecretHost['squads'][number];

function secretsOn(id: string, seed: number, looks: number) {
  const region = load(id), rng = new Rng(seed);
  let calls: unknown[] = [], nextId = 1;
  const lairs: LairSnap[] = [], souls: SoulSnap[] = [], pending: SoulSnap[] = [];
  const squads: Squad[] = [
    { id: 1, owner: 'p:a', team: 0, alive: 4, cx: 0, cy: 0, units: [] }, { id: 2, owner: 'p:a', team: 0, alive: 3, cx: 0, cy: 0, units: [] },
    { id: 3, owner: 'p:b', team: 1, alive: 4, cx: 0, cy: 0, units: [] }, { id: 4, owner: 'bot2', team: 2, alive: 4, cx: 0, cy: 0, units: [] },
    { id: 5, owner: 'p:a', team: 0, alive: 2, civ: true, cx: 0, cy: 0, units: [] }, { id: 6, owner: '', team: MOB_TEAM, alive: 4, cx: 0, cy: 0, units: [] },
    { id: 7, owner: 'p:c', team: NEUTRAL_TEAM, alive: 4, cx: 0, cy: 0, units: [] }, { id: 8, owner: 'p:d', team: 3, alive: 0, cx: 0, cy: 0, units: [] },
  ];
  const host: SecretHost = {
    squads,
    lairs: () => lairs.map((l) => ({ ...l })),
    souls: () => souls.map((s) => ({ ...s })),
    addLair(d) {
      calls.push(['addLair', { ...d }]);
      if (rng.chance(0.75)) lairs.push({ id: nextId++, kind: d.kind, x: d.x, y: d.y, state: 'home' } as LairSnap);
    },
    spawnSoul(x, y, cls, level) {
      calls.push(['spawnSoul', x, y, cls, level]);
      if (rng.chance(0.75)) pending.push({ id: 500 + nextId++, x, y, cls, level } as SoulSnap);
    },
    give: (owner, name, x, y, goods, items) => void calls.push(['give', owner, name, x, y, { ...goods }, items.map((i) => ({ ...i }))]),
    note: (e) => void calls.push(['note', { ...e }]),
  };
  let sec = createSecrets(region, host);
  const stories = sec.stories();
  const owners = ['p:a', 'p:b', 'bot2', 'p:c', 'p:d'];
  const at = new Map(squads.map((q) => [q.id, { x: rng.range(0, region.w), y: rng.range(0, region.h) }]));
  /** Where a squad heads: its owner's open step, an unfound spot, or anywhere. */
  const target = (q: Squad): { x: number; y: number } => {
    const open = sec.open(q.owner).filter((e) => e.to);
    const r = rng.next();
    if (open.length && r < 0.6) return open[rng.int(0, open.length - 1)].to!;
    if (stories.length && r < 0.85) { const s = stories[rng.int(0, stories.length - 1)]; return { x: s.giver.at[0], y: s.giver.at[1] }; }
    return { x: rng.range(0, region.w), y: rng.range(0, region.h) };
  };
  const steps: unknown[] = [];
  let t = 0;
  for (let k = 0; k < looks; k++) {
    t += rng.chance(0.1) ? rng.int(1, 9) : 10;
    // the world moves
    for (const q of squads) {
      const p = at.get(q.id)!, g = target(q), go = rng.next();
      if (go < 0.5) (p.x = g.x + rng.range(-2, 2)), (p.y = g.y + rng.range(-2, 2));
      else if (go < 0.75) (p.x = (p.x + g.x) / 2), (p.y = (p.y + g.y) / 2);
      else if (go < 0.9) (p.x = g.x + 20 + rng.range(-3, 3)), (p.y = g.y);
      q.cx = p.x;
      q.cy = p.y;
      q.units = Array.from({ length: 4 }, (_, i) => ({
        ...(rng.chance(0.9) ? { id: q.id * 10 + i } : {}), x: p.x + rng.range(-1.5, 1.5), y: p.y + rng.range(-1.5, 1.5), alive: rng.chance(0.85),
        ...(rng.chance(0.8) ? { cls: rng.pick(['hoplite', 'archer', 'civ_smith', 'militia']) } : {}),
      }));
      q.alive = q.id === 8 ? 0 : q.units.filter((u) => u.alive).length;
    }
    for (const l of lairs) if (l.state !== 'cleared' && rng.chance(0.3)) l.state = 'cleared';
    if (pending.length && rng.chance(0.7)) souls.push(...pending.splice(0));
    if (souls.length && rng.chance(0.1)) souls.shift();
    const step: Record<string, unknown> = { t, squads: squads.map((q) => ({ ...q, units: q.units.map((u) => ({ ...u })) })), lairs: lairs.map((l) => ({ x: l.x, y: l.y, state: l.state })), souls: souls.map((s) => ({ id: s.id, x: s.x, y: s.y })) };
    if (rng.chance(0.03)) {
      const root = sec.saveRoot(), saves = structuredClone(root.saves);
      sec = createSecrets(region, host);
      Object.assign(sec.saveRoot().saves, saves); // as the state's graph decode puts them back in place
      sec.loadRoot({ tick: root.tick });
      step.reload = true;
    }
    calls = [];
    sec.tick(t);
    step.calls = calls;
    if (k % 5 === 0) {
      step.open = owners.map((o) => sec.open(o));
      step.saves = stories.map((_, n) => owners.map((o) => sec.save(n, o)));
    }
    steps.push(step);
  }
  return { region: id, seed, stories: stories.length, steps, root: sec.saveRoot() };
}

export const vectors = () => ({
  runs: [['dodona', 1], ['kyrene-e', 2], ['krios', 3], ['elaia-n', 4], ['kyrene-n', 5], ['siren', 6], ['dodona-w', 7], ['gorge', 8]]
    .map(([id, s]) => secretsOn(id as string, s as number, 260)),
});
