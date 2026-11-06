/**
 * The W-65 encounter runner (src/war/sim/encounters.ts) on real regions and the real ENCOUNTERS: each region's towns,
 * hunters, biomes and the kinds that fit it; the save checks; awayLine, goodsWords and pidOfUnit; and scripted plays.
 * A play's driver walks a few men (travel ticks in runs, fights near, men idle or gone), fires kinds by hand (the road's
 * robbers too), walks the men to the open step's target (or near it, or far off), lets asked-for lairs and souls appear
 * (or not), clears and thins them, claims souls, knocks the men down, chooses and lets the clock run out. Every input goes
 * in the vector with what the runner said (notes), asked its host for, saved and whether a quiet save is due. Positions
 * are on an eighth of a tile so the snapshots stay short.
 */
import { Rng } from '../../sim/rng';
import { ENCOUNTERS } from '../../data/warEncounters';
import { STORIES } from '../../data/warStories';
import { parseRegion } from '../../war/region/schema';
import { depthOf } from '../../war/sim/depth';
import {
  awayLine, ENC, encBiomes, encFauna, encFits, encHunters, EncounterRun, encSaveOk, encStepOf, encTowns, goodsWords, pidOfUnit,
  type EncHost, type EncMe, type EncNote, type EncSave,
} from '../../war/sim/encounters';
import type { LairSnap, RegionData, Snapshot, SoulSnap, SquadSnap, UnitSnap, WarEvent } from '../../war/types';

const regionFiles = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });
const regions = new Map<string, RegionData>();
const load = (id: string): RegionData => {
  let r = regions.get(id);
  if (!r) regions.set(id, (r = parseRegion(regionFiles[`../../war/regions/${id}.json`])));
  return r;
};
const regionIds = Object.keys(regionFiles).map((p) => p.replace(/^.*\/|\.json$/g, '')).sort();
const q = (v: number) => Math.round(v * 8) / 8;
const DEFS = Object.values(ENCOUNTERS);

interface Man { dx: number; dy: number; state: UnitSnap['state']; down?: true; wounded?: boolean }
interface World {
  tick: number; at: { x: number; y: number }; men: Man[]; lairs: LairSnap[]; souls: SoulSnap[]; pending: SoulSnap[];
  foe: { x: number; y: number } | null; neutral: { x: number; y: number } | null;
}

function play(regionId: string, me: EncMe, rng: Rng, save: EncSave | null, story: boolean, host: { rob: boolean; toll: boolean }, budget: number) {
  const region = load(regionId);
  const w: World = { tick: 500 + rng.int(0, 400), at: { x: q(rng.range(10, region.w - 10)), y: q(rng.range(10, region.h - 10)) }, men: [], lairs: [], souls: [], pending: [], foe: null, neutral: null };
  for (let k = 0; k < 4; k++) w.men.push({ dx: ((k % 2) - 0.5) * 1.5, dy: (((k / 2) | 0) - 0.5) * 1.5, state: 'move' });
  w.men.push({ dx: 0, dy: 0, state: 'dead' });
  const calls: unknown[] = [];
  let nextId = 1, robAnswer: Record<string, number> | null = null;
  const h: EncHost = {
    addLair(d) {
      calls.push(['addLair', { ...d }]);
      if (rng.chance(0.8)) w.lairs.push({ id: nextId, kind: d.kind, x: d.x, y: d.y, squad: 40 + nextId++, alive: d.count, state: 'home' } as LairSnap);
    },
    spawnSoul(x, y, cls, level) {
      calls.push(['spawnSoul', x, y, cls, level]);
      if (rng.chance(0.75)) w.pending.push({ id: 500 + nextId++, x, y, cls, level } as SoulSnap);
    },
    give(reward, at, item) { calls.push(['give', reward, at, item]); },
  };
  if (host.toll) h.toll = (share) => void calls.push(['toll', share]);
  if (host.rob) h.rob = (band) => {
    const goods: Record<string, number> = {};
    for (const g of ['coin', 'iron', 'food', 'wood']) if (rng.chance(0.5)) goods[g] = rng.int(0, 40) + (rng.chance(0.3) ? 0.5 : 0);
    calls.push(['rob', { ...band }]);
    robAnswer = goods;
    return goods;
  };
  const st0 = story ? STORIES[regionId] ?? null : null;
  const run = new EncounterRun(region, ENCOUNTERS, save, me, h, st0);
  const owner = me.owner ?? 'p:bot';
  const snap = (): Snapshot => {
    const squads: SquadSnap[] = [
      { id: 1, owner, team: me.team } as SquadSnap, { id: 2, owner: 'p:foe', team: me.team + 1 } as SquadSnap,
      { id: 3, owner: 'p:ally', team: me.team } as SquadSnap, { id: 4, owner: 'wild', team: -1 } as SquadSnap,
    ];
    const units: UnitSnap[] = w.men.map((m, k) => ({
      id: 10 + k, squad: k === 3 ? 3 : 1, x: q(w.at.x + m.dx), y: q(w.at.y + m.dy), cls: 'hoplite', state: m.state,
      ...(m.down ? { down: true as const } : {}), ...(m.wounded !== undefined ? { wounded: m.wounded } : {}),
    }) as UnitSnap);
    units.push({ id: 30, squad: 1, x: w.at.x, y: w.at.y, cls: 'civ_smith', state: 'move' } as UnitSnap);
    if (w.foe) units.push({ id: 31, squad: 2, x: w.foe.x, y: w.foe.y, cls: rng.chance(0.2) ? 'civ_cook' : 'archer', state: rng.chance(0.2) ? 'dead' : 'idle' } as UnitSnap);
    if (w.neutral) units.push({ id: 32, squad: 4, x: w.neutral.x, y: w.neutral.y, cls: 'mob_wolf', state: 'idle' } as UnitSnap);
    units.push({ id: 33, squad: 9, x: w.at.x, y: w.at.y, cls: 'archer', state: 'idle' } as UnitSnap); // a squad not in the list
    return { tick: w.tick, units, squads, lairs: w.lairs.map((l) => ({ ...l })), souls: w.souls.map((x) => ({ ...x })) } as unknown as Snapshot;
  };
  const steps: unknown[] = [];
  const record = (input: Record<string, unknown>, notes: unknown) => {
    if (robAnswer) input.rob = robAnswer;
    robAnswer = null;
    steps.push({ input, notes, calls: calls.splice(0), save: JSON.parse(JSON.stringify(run.save)), due: run.due, step: run.step?.id ?? null });
    run.due = false;
  };
  let mid: EncSave | null = null;
  for (let k = 0; k < budget; k++) {
    const o = run.save.open;
    w.foe = rng.chance(0.15) ? { x: q(w.at.x + rng.range(-20, 20)), y: q(w.at.y + rng.range(-20, 20)) } : null;
    w.neutral = rng.chance(0.1) ? { x: w.at.x, y: w.at.y } : null;
    for (const m of w.men) if (m.state !== 'dead') m.state = rng.chance(0.85) ? 'move' : rng.chance(0.3) ? 'attack' : 'idle';
    if (rng.chance(0.04)) w.men.forEach((m) => { if (m.state !== 'dead') m.state = 'idle'; });
    if (!o) {
      if (rng.chance(0.12)) { // a kind fired by hand, now and then from a given spot (the road's robbers, dev)
        const def = rng.chance(0.3) ? ENCOUNTERS.robbers : DEFS[rng.int(0, DEFS.length - 1)];
        const from = rng.chance(0.4) ? { x: q(rng.range(0, region.w)), y: q(rng.range(0, region.h)) } : undefined;
        const gone = rng.chance(0.1);
        const keep = w.men;
        if (gone) w.men = [];
        const s = snap();
        record({ op: 'fire', snap: s, def: def.id, ...(from ? { from } : {}) }, run.fire(s, def, from));
        w.men = keep;
        continue;
      }
      if (rng.chance(0.05)) { // a stray choice with nothing open
        const s = snap();
        record({ op: 'choose', snap: s, option: 'pay' }, run.choose(s, 'pay'));
        continue;
      }
      // a run of travel ticks on one snapshot (its tick counting up); stops at the first notes
      const n = rng.chance(0.3) ? rng.int(1, 40) : rng.int(200, 3200), s = snap(), base = w.tick;
      const notes: EncNote[] = [];
      let i = 0, due = false;
      for (; i < n && !notes.length; i++) {
        s.tick = base + i;
        notes.push(...run.tick(s));
        due = due || run.due;
      }
      run.due = due;
      s.tick = base;
      w.tick = base + i;
      if (rng.chance(0.3)) w.at = { x: q(Math.max(4, Math.min(region.w - 4, w.at.x + rng.range(-30, 30)))), y: q(Math.max(4, Math.min(region.h - 4, w.at.y + rng.range(-30, 30)))) };
      record({ op: 'travel', snap: s, n, ran: i }, notes);
      if (!mid && run.save.n > 0 && rng.chance(0.5)) mid = JSON.parse(JSON.stringify(run.save));
      continue;
    }
    // an open step: walk, the world answers, choose or tick
    w.tick += rng.chance(0.08) ? ENC.lapse + rng.int(-5, 400) : rng.int(5, 150);
    if (rng.chance(0.03)) w.tick = Math.max(0, o.since - rng.int(1, 50)); // a sim started afresh
    const st = run.step, go = rng.next();
    const t = st?.trigger.kind === 'guide' && !o.with ? { x: o.x, y: o.y } : { x: o.tx, y: o.ty };
    if (go < 0.55) w.at = { x: q(t.x + rng.range(-1, 1)), y: q(t.y + rng.range(-1, 1)) };
    else if (go < 0.7) w.at = { x: q((w.at.x + t.x) / 2), y: q((w.at.y + t.y) / 2) };
    else if (go < 0.85) w.at = { x: q(t.x + ENC.reach + rng.range(-1.5, 1.5)), y: t.y };
    else if (go < 0.92) w.at = { x: q(t.x + ENC.leave + rng.range(-3, 3)), y: q(t.y + rng.range(-5, 5)) };
    for (const l of w.lairs) if (l.state !== 'cleared') {
      if (rng.chance(0.25)) l.state = 'cleared';
      else if (rng.chance(0.3)) l.alive = Math.max(0, l.alive - 1);
    }
    if (rng.chance(0.04) && w.lairs.length) w.lairs.shift();
    if (w.pending.length && rng.chance(0.7)) w.souls.push(...w.pending.splice(0));
    if (rng.chance(0.05) && w.souls.length) w.souls.shift();
    // his fighters down or wounded (robbers who win carry the load off)
    for (const m of w.men) if (m.state !== 'dead') {
      if (rng.chance(0.15)) m.down = true; else delete m.down;
      m.wounded = rng.chance(0.2) ? true : rng.chance(0.5) ? false : undefined;
    }
    if (st?.takes && rng.chance(0.3)) for (const m of w.men) (m.down = true), (m.wounded = true);
    const evs: WarEvent[] = [];
    if (st?.trigger.kind === 'rescue' && w.souls.length && rng.chance(0.6)) {
      const soul = w.souls[rng.int(0, w.souls.length - 1)].id, by = rng.next();
      if (by < 0.15) evs.push({ t: w.tick, kind: 'soulClaimed', soul, squad: 2, owner: 'p:foe' } as WarEvent);
      else if (by < 0.3) evs.push({ t: w.tick, kind: 'soulClaimed', soul: soul + 1000, squad: 1, owner } as WarEvent);
      else if (by < 0.4) evs.push({ t: w.tick, kind: 'soulClaimed', soul, squad: 3, owner: 'p:ally' } as WarEvent);
      else evs.push({ t: w.tick, kind: rng.chance(0.5) ? 'soulClaimed' : 'soulRefused', soul, squad: 1, owner } as WarEvent);
    }
    if (st?.trigger.kind === 'choice' && rng.chance(0.6)) {
      const opts = st.trigger.options, option = rng.chance(0.15) ? 'nope' : opts[rng.int(0, opts.length - 1)].id;
      const s = snap();
      record({ op: 'choose', snap: s, option }, run.choose(s, option));
      continue;
    }
    if (rng.chance(0.03)) {
      const s = snap();
      record({ op: 'choose', snap: s, option: 'fight' }, run.choose(s, 'fight'));
      continue;
    }
    const s = snap();
    record({ op: 'tick', snap: s, evs }, run.tick(s, evs));
    for (const m of w.men) if (m.state !== 'dead') (delete m.down), (m.wounded = undefined);
    if (!mid && rng.chance(0.15)) mid = JSON.parse(JSON.stringify(run.save));
  }
  return { region: regionId, me, save, story: !!st0, host, steps, mid, depth: run.depth };
}

export const vectors = () => {
  const r = new Rng(2065);
  const per = regionIds.map((id) => {
    const reg = load(id), bs = encBiomes(reg);
    return {
      region: id, depth: depthOf(reg), towns: encTowns(reg), hunters: encHunters(reg), biomes: [...bs],
      fits: DEFS.filter((d) => encFits(d, reg)).map((d) => d.id),
      // encFits at every depth (0..4): the minDepth filter
      fitsAt: [0, 1, 2, 3, 4].map((dp) => DEFS.filter((d) => encFits(d, reg, dp, bs)).map((d) => d.id)),
      fauna: [0, 1, 2, 5, 17, 998].map((k) => [k, encFauna(reg, k)]),
    };
  });

  const defs = ENCOUNTERS;
  const saves: unknown[] = [null, 3, 'x', [], {}, { v: 2, n: 0, travel: 0, next: 9, open: null }, { v: 1, n: '1', travel: 0, next: 9, open: null },
    { v: 1, n: 1, travel: 0, next: 9, open: null }, { v: 1, n: 1, travel: 0, next: 9, open: { id: 'nope', step: 'go' } },
    { v: 1, n: 1, travel: 0, next: 9, open: { id: 'deserter', step: 'nope' } }, { v: 1, n: 1, travel: 'a', next: 9, open: null },
    { v: 1, n: 1, travel: 3, next: null, open: null }, { v: 1, n: 2, travel: 3, next: 9, open: { id: 'deserter', step: 'judge', x: 1, y: 2, tx: 3, ty: 4, since: 5 } }];
  const saveChecks = saves.map((s) => [s, encSaveOk(s, defs), encStepOf(defs, encSaveOk(s, defs) ? s as EncSave : null)?.id ?? null]);

  const notes: EncNote[] = [{ kind: 'start', enc: 'ambush' }, { kind: 'start', enc: 'nope' }, { kind: 'unanswered', enc: 'robbers' },
    { kind: 'robbed', enc: 'robbers', goods: { coin: 52.5, iron: 20, food: -0.4 } }, { kind: 'robbed', enc: 'toll', goods: {} },
    { kind: 'lapse', enc: 'shrine' }, { kind: 'step', enc: 'ambush', step: 'fight' }, { kind: 'step', enc: 'herd', step: 'trail#2' },
    { kind: 'step', enc: 'deserter', step: 'judge', option: 'help' }, { kind: 'end', enc: 'deserter' }];
  const away = notes.map((n) => [n, awayLine(n, defs)]);
  const words = ([{}, { coin: 1 }, { coin: 2.5, iron: 3.5, food: -2.5, wood: 1e21, salt: 0.49999999999999994 }] as Record<string, number>[]).map((g) => [g, goodsWords(g)]);
  const pidSnap = {
    units: [{ id: 1, squad: 1 }, { id: 2, squad: 2 }, { id: 3, squad: 3 }, { id: 4, squad: 4 }, { id: 5, squad: 5 }, { id: 6, squad: 9 }, { id: 7, squad: 6 }, { id: 8, squad: 7 }],
    squads: [{ id: 1, owner: 'p:12' }, { id: 2, owner: 't:0' }, { id: 3, owner: 'p:' }, { id: 4, owner: 'p:abc' }, { id: 5, owner: 'p:3.5' }, { id: 6, owner: 'p:1e3' }, { id: 7, owner: 'p: 7 ' }],
  } as unknown as Snapshot;
  const pids = [1, 2, 3, 4, 5, 6, 7, 8, 99].map((u) => [u, pidOfUnit(pidSnap, u)]);

  const plays: unknown[] = [];
  const ids = regionIds.filter((id) => depthOf(load(id)) >= 1);
  for (let i = 0; i < 44; i++) {
    const id = i < 4 ? regionIds[i * 9] : ids[i % ids.length];
    const me: EncMe = { team: i % 3, ...(i % 2 ? { owner: `p:${i}` } : {}), ...(i % 5 === 2 ? {} : { seed: 1 + i * 977 }) };
    const host = { rob: i % 4 !== 3, toll: i % 6 !== 5 };
    let start: EncSave | null = null;
    if (i % 3 === 1) start = { v: 1, n: 0, travel: 0, next: r.int(30, 300), open: null }; // a short first wait
    const p = play(id, me, r, start, i % 7 !== 6, host, 70);
    plays.push(p);
    if (p.mid && i % 2 === 0) plays.push(play(id, me, r, p.mid, i % 7 !== 6, host, 40));
  }
  return { enc: ENC, per, saves: saveChecks, away, words, pids, plays: plays.map((p) => { const { mid: _m, ...x } = p as { mid: unknown }; return x; }) };
};
