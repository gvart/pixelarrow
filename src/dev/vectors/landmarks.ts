/**
 * Landmark state (src/war/sim/landmarks.ts) on the real landmark regions (and one without): pieces from the region's
 * pre-built entries change hands, the guardian dies and comes back, men of the holder and foes walk in and out of the
 * bounds, and squads try restores with engineers fit or not and goods enough or not. A small stand-in for works.ts
 * applies the capture damage and the restore; the vector records the world before each input, what each works call
 * left the pieces as (`answers`), every call and note, and the snap, flags and root after.
 */
import { Rng } from '../../sim/rng';
import { parseRegion } from '../../war/region/schema';
import { BUILDINGS, NEUTRAL_TEAM } from '../../war/sim/economy';
import { MOB_TEAM } from '../../war/sim/mobs';
import { LANDMARK, canLead, createLandmarks, type LmHost, type LmUnit } from '../../war/sim/landmarks';
import type { Works } from '../../war/sim/works';
import { LANDMARKS, landmarkOfRegion, restoreCost } from '../../data/warLandmarks';
import type { RegionData } from '../../war/types';

const regionFiles = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });
const load = (id: string): RegionData => parseRegion(regionFiles[`../../war/regions/${id}.json`]);

interface FakePiece { team: number; x: number; y: number; tiles: number[]; hp: number; maxHp: number; state: string; pre: { landmark: boolean; gone: boolean; ruin: boolean }; def: { wall?: string } }
/** A piece as the Godot side gets it: what never changes once (`base`), then [team, hp, state, ruin, gone] per step. */
const base = (b: FakePiece) => ({ x: b.x, y: b.y, tiles: [...b.tiles], maxHp: b.maxHp, landmark: b.pre.landmark });
const out = (b: FakePiece) => [b.team, b.hp, b.state, b.pre.ruin ? 1 : 0, b.pre.gone ? 1 : 0];
const PERKS = ['fortifier', 'masterBuilder', 'poliorcetes', 'archimedes', 'carpenter', 'sapper', 'armourer', 'healer'];
const real = (t: number) => t >= 0 && t !== NEUTRAL_TEAM && t !== MOB_TEAM;

function landmarkOn(id: string, seed: number) {
  const region = load(id), rng = new Rng(seed);
  // the landmark's pieces and a few others (which it leaves out)
  let others = 0;
  const entries = (region.prebuilt ?? []).filter((e) => e.landmark || others++ < 8);
  const pieces: FakePiece[] = entries.map((e) => {
    const d = BUILDINGS[e.type], maxHp = e.maxHp ?? d.hp, ruin = e.state === 'ruined';
    const tiles = e.tiles ?? [Math.floor(e.x), Math.floor(e.y)];
    return { team: -1, x: e.x, y: e.y, tiles, hp: ruin ? 0 : maxHp * (e.hp ?? 1), maxHp, state: ruin ? 'destroyed' : 'done', pre: { landmark: !!e.landmark, gone: false, ruin }, def: { ...(d.wall ? { wall: d.wall } : {}) } };
  });
  const lmPieces = pieces.filter((b) => b.pre.landmark);
  let answers: unknown[] = [], stock = 0.5;
  const works = {
    prebuilt: () => pieces,
    landmarkCapture(share: number) {
      for (const b of pieces) {
        if (!b.pre.landmark || b.pre.ruin || b.state === 'destroyed') continue;
        if (b.def.wall === 'gate') (b.pre.ruin = true), (b.state = 'destroyed'), (b.hp = 0);
        else (b.hp = Math.min(b.hp, b.maxHp * share)), b.state === 'done' && b.hp < b.maxHp / 2 && (b.state = 'damaged');
      }
      answers.push(['capture', delta()]);
    },
    landmarkRestore(_team: number, _cost: unknown, _x: number, _y: number) {
      const ok = rng.next() < stock;
      if (ok) for (const b of pieces) {
        if (!b.pre.landmark || b.pre.gone) continue;
        if (b.pre.ruin) (b.pre.ruin = false), (b.state = 'done'), (b.hp = b.maxHp);
        else if (b.state === 'done' || b.state === 'damaged') (b.hp = b.maxHp), (b.state = 'done');
      }
      answers.push(['restore', ok, delta()]);
      return ok;
    },
  };
  // the units: holder's men, foes, civilians, mobs, inside the landmark's box or round it
  const box = lmPieces.length ? lmPieces.reduce((a, b) => [Math.min(a[0], b.x), Math.min(a[1], b.y), Math.max(a[2], b.x), Math.max(a[3], b.y)], [Infinity, Infinity, -Infinity, -Infinity]) : [100, 100, 120, 120];
  const unit = (team: number, engineer: boolean): LmUnit & { squad: { team: number } } => {
    const perks = PERKS.filter(() => rng.chance(0.5));
    return {
      x: rng.range(box[0] - 8, box[2] + 8), y: rng.range(box[1] - 8, box[3] + 8), alive: rng.chance(0.9),
      civ: engineer ? (rng.chance(0.8) ? 'engineer' : 'smith') : rng.chance(0.1) ? 'cook' : null,
      squad: { team },
      person: engineer && rng.chance(0.9) ? { hero: { level: rng.pick([6, 8, 9, 10, 12]), ...(rng.chance(0.9) ? { perks } : {}) } } : rng.chance(0.5) ? { hero: { level: 1 } } : null,
    };
  };
  let squads: ({ team: number; units: LmUnit[] } | undefined)[] = [];
  let units: LmUnit[] = [];
  let guarded = true;
  const host: LmHost = { get units() { return units; }, get squads() { return squads; }, guarded: () => guarded, real, note: (e) => calls.push(['note', e]) };
  let calls: unknown[] = [];
  const wrapped = {
    prebuilt: works.prebuilt,
    landmarkCapture: (share: number) => (calls.push(['capture', share]), works.landmarkCapture(share)),
    landmarkRestore: (team: number, cost: unknown, x: number, y: number) => (calls.push(['restore', team, { ...(cost as object) }, x, y]), works.landmarkRestore(team, cost, x, y)),
  } as unknown as Works;
  let lm = createLandmarks(id, wrapped, host);
  const steps: unknown[] = [];
  let t = 0, last: string[] = pieces.map(() => '');
  const delta = () => {
    const d: unknown[] = [];
    pieces.forEach((b, i) => {
      const o = out(b), k = JSON.stringify(o);
      if (k !== last[i]) (d.push([i, ...o]), (last[i] = k));
    });
    return d;
  };
  const man = (u: LmUnit, team: number) => ({ x: u.x, y: u.y, alive: u.alive, civ: u.civ, team, person: u.person ? { level: u.person.hero.level, ...(u.person.hero.perks ? { perks: [...u.person.hero.perks] } : {}) } : null });
  for (let k = 0; k < 120; k++) {
    // the world moves: pieces change hands, the guardian falls (or wakes), men come and go
    if (rng.chance(0.15)) guarded = !guarded && rng.chance(0.2) ? true : rng.chance(0.85) ? false : guarded;
    const winner = rng.pick([0, 0, 1, 2, NEUTRAL_TEAM, MOB_TEAM, -1]);
    if (rng.chance(0.35)) for (const b of lmPieces) if (rng.chance(0.2)) b.team = rng.chance(0.7) ? winner : rng.pick([0, 1, 2, -1]);
    if (rng.chance(0.05) && lmPieces.length) lmPieces[rng.int(0, lmPieces.length - 1)].pre.ruin = rng.chance(0.5);
    if (rng.chance(0.02) && lmPieces.length) lmPieces[rng.int(0, lmPieces.length - 1)].pre.gone = true;
    stock = rng.pick([0, 1, 1]);
    squads = [0, 1, 2, 0, NEUTRAL_TEAM].map((team) => (rng.chance(0.1) ? undefined : { team, units: Array.from({ length: rng.int(1, 4) }, () => unit(team, rng.chance(0.4))) }));
    units = squads.flatMap((s) => s?.units ?? []);
    for (let i = 0; i < 4; i++) units.push(unit(rng.pick([MOB_TEAM, NEUTRAL_TEAM, 1]), false));
    for (let i = 0; i < rng.int(0, 8); i++) units.push({ ...unit(0, false), x: rng.range(box[0], box[2]), y: rng.range(box[1], box[3]) });
    // pieces as the changes since the last step ([index, ...out]), the men beyond the squads' (units: theirs, then these)
    const world = { dyn: delta(), squads: squads.map((s) => (s ? { team: s.team, units: s.units.map((u) => man(u, s.team)) } : null)),
      extra: units.slice(squads.reduce((n, s) => n + (s?.units.length ?? 0), 0)).map((u) => man(u, u.squad.team)),
      guarded, real: [-1, 0, 1, 2, 3, NEUTRAL_TEAM, MOB_TEAM].filter(real) };
    answers = [];
    calls = [];
    const r = rng.next();
    let input: unknown, result: unknown = null;
    if (r < 0.6) {
      t += rng.chance(0.5) ? 10 : rng.int(1, 15);
      input = ['tick', t];
      lm.tick(t);
    } else if (r < 0.85) {
      const sq = rng.int(-1, 6);
      input = ['restore', sq, t];
      result = lm.restore(sq, t);
    } else if (r < 0.9) {
      input = ['reset'];
      lm.reset();
    } else if (r < 0.95) {
      const c = rng.chance(0.5), d = rng.chance(0.5);
      input = ['remember', c, d];
      lm.remember({ captured: c, restored: d });
    } else {
      input = ['reload'];
      const root = lm.saveRoot();
      lm = createLandmarks(id, wrapped, host);
      lm.loadRoot(root);
    }
    steps.push({ world, input, answers, result, calls, any: lm.any(), snap: lm.snap() ?? null, flags: lm.flags(), root: lm.saveRoot() });
  }
  return { region: id, seed, base: pieces.map(base), steps };
}

export const vectors = () => {
  const r = new Rng(47), leads: unknown[] = [];
  for (const l of LANDMARKS) for (let i = 0; i < 24; i++) {
    const level = r.pick([7, 8, 9, 10, 11]), perks = r.chance(0.1) ? undefined : PERKS.filter(() => r.chance(0.6));
    leads.push([l.id, level, perks ?? null, canLead(l, level, perks)]);
  }
  const regions = ['krios', 'siren', 'ammon', 'delta', 'omphalos', 'saddle', 'erymanthos', 'gorge', 'canyons', 'dodona'];
  return {
    landmark: LANDMARK,
    ofRegion: [...regions, 'nowhere'].map((id) => [id, landmarkOfRegion(id)?.id ?? null]),
    costs: [...LANDMARKS.map((l) => l.id), 'nope'].map((id) => [id, restoreCost(id)]),
    leads,
    runs: regions.flatMap((id, i) => [landmarkOn(id, 100 + i), ...(i < 3 ? [landmarkOn(id, 200 + i)] : [])]),
  };
};
