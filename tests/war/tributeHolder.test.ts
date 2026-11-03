/**
 * W-153 the holder options behind the Oaths tab: over a real sim's buildings, the payer is offered "send" and his lord
 * "collect" only on the building where tribute waits, a stranger neither, and running an option carries it through.
 */
import { describe, expect, it } from 'vitest';
import { heldNodes } from '../../src/data/professions';
import { RECIPES } from '../../src/data/recipes';
import { createSim } from '../../src/war/sim';
import { makePerson } from '../../src/war/sim/roster';
import type { BuildingType, ResourceKind, WarBuildSim } from '../../src/war/types';
import type { SandboxScene } from '../../src/war/view/SandboxScene';
import { TradeControls, type Holder } from '../../src/war/view/trade/tradeControls';
import { flat } from './flatRegion';

const PAYER = 'p:2', LORD = 'p:1', STRANGER = 'p:3';
const recipe = Object.values(RECIPES).find((r) => r.at === 'forge' && r.kind === 'smelt' && r.lv === 1 && !!r.out.good && heldNodes('smith', []).has(r.node))!;
const made = recipe.out.good as ResourceKind;
const SEND = 'send the tribute to your lord', COLLECT = 'collect the tribute';
const run = (sim: WarBuildSim, n: number, until?: () => boolean) => {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return;
  }
};

function field() {
  const sim = createSim(flat(96), 1);
  sim.claim(0, 40, 40, 40);
  const place = (owner: string, type: BuildingType, x: number) => {
    const hand = sim.spawnSquad(owner, 0, 'militia', 1, 90, 90);
    sim.order({ kind: 'placeBuilding', squad: hand, type, x, y: 40 });
    sim.step();
    const id = sim.snapshot().buildings!.at(-1)!.id;
    sim.finishSite(id);
    return id;
  };
  const forge = place(PAYER, 'forge', 30), camp = place(LORD, 'camp', 50), other = place(PAYER, 'forge', 20);
  sim.order({ kind: 'setAccess', building: forge, owner: PAYER, share: 0.5 });
  sim.order({ kind: 'setLiege', owner: PAYER, to: LORD, pct: 20 });
  run(sim, 1);
  const at = sim.snapshot().buildings!.find((b) => b.id === forge)!;
  const smith = sim.spawnSquad(STRANGER, 0, 'civ_smith', 1, at.x, at.y + 4, [makePerson('smith', 'civ_smith', { level: 3 })]);
  sim.order({ kind: 'civWork', squad: smith, building: forge });
  run(sim, 60);
  for (const [k, v] of Object.entries(recipe.inputs)) sim.addStock(0, k as never, v as number);
  sim.order({ kind: 'craft', team: 0, building: forge, recipe: recipe.id, by: STRANGER });
  run(sim, 5000, () => !sim.snapshot().buildings!.find((b) => b.id === forge)!.queue);
  return { sim, forge, camp, other, at };
}
/** The controls as this player sees them, with their orders going to the real sim. */
const asPlayer = (sim: WarBuildSim, owner: string) => new TradeControls({
  sim: { get cur() { return sim.snapshot(); }, playerId: Number(owner.slice(2)), order: (o: never) => sim.order(o) },
  drawn: [], siege: { engineOf: () => null, status: '' }, mark: () => {},
} as unknown as SandboxScene);
const move = { label: 'move', icon: '', run: () => {} };
/** Tribute options on every standing building, by building. */
const offers = (t: TradeControls, squad: number) => t.holders().flatMap((h: Holder) => t.options(h, [squad], move).filter((o) => o.label === SEND || o.label === COLLECT).map((o) => ({ id: h.id, label: o.label })));

describe('W-153 holder options', () => {
  it('only on the real building where it waits: send for its payer, collect for his lord, nothing for a stranger', () => {
    const { sim, forge, at } = field();
    const squad = (o: string) => sim.spawnSquad(o, 0, 'militia', 2, at.x, at.y + 3);
    expect(offers(asPlayer(sim, PAYER), squad(PAYER))).toEqual([{ id: forge, label: SEND }]);
    expect(offers(asPlayer(sim, LORD), squad(LORD))).toEqual([{ id: forge, label: COLLECT }]);
    expect(offers(asPlayer(sim, STRANGER), squad(STRANGER))).toEqual([]);
  });

  it('collect carries it off and the option goes; the goods add up', () => {
    const { sim, forge, at } = field();
    const q = sim.spawnSquad(LORD, 0, 'militia', 2, at.x, at.y + 3), t = asPlayer(sim, LORD), b = () => sim.snapshot().buildings!.find((x) => x.id === forge)!;
    const part = b().tithe![made]!, plain = b().goods?.[made] ?? 0;
    t.options(t.get({ building: forge })!, [q], move).find((o) => o.label === COLLECT)!.run();
    run(sim, 1500, () => !b().tithe);
    run(sim, 200, () => sim.snapshot().squads[q].order === 'hold');
    expect(b().goods?.[made] ?? 0).toBeCloseTo(plain);
    expect(sim.cargo({ squad: q })!.slots.flatMap((s) => s.hold.lots).filter((l) => l.r === made).reduce((a, l) => a + l.n, 0)).toBeCloseTo(part);
    expect(offers(t, q)).toEqual([]);
  });

  it('send goes sealed for the lord', () => {
    const { sim, forge, at } = field();
    const q = sim.spawnSquad(PAYER, 0, 'militia', 2, at.x, at.y + 3), t = asPlayer(sim, PAYER);
    t.options(t.get({ building: forge })!, [q], move).find((o) => o.label === SEND)!.run();
    run(sim, 1500, () => !sim.snapshot().buildings!.find((x) => x.id === forge)!.tithe);
    run(sim, 200, () => sim.snapshot().squads[q].order === 'hold');
    const lots = sim.cargo({ squad: q })!.slots.flatMap((s) => s.hold.lots).filter((l) => l.r === made && l.n > 1e-9);
    expect(lots.length).toBeGreaterThan(0);
    expect(lots.every((l) => l.s === -1)).toBe(true);
  });
});
