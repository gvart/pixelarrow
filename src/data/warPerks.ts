/**
 * W-84, W-110: the demigod's perks (docs/WAR.md "Levels and perks"). One short table per path; a perk is one plain
 * sentence with one real effect, through his men, buildings or carts (W-82), and none acts unattended (W-87, W-88).
 * The sim reads the sum at his level (`perkFx`): his men (../war/sim/classes.ts withPerks, setRates), the sites he places
 * (works.perkSite) and his carts (siege.ts). A warrior's new classes are in FAMILIES (src/war/world/start.ts), W-86.
 */
export type PerkPath = 'warrior' | 'builder' | 'trader';

/** What a perk adds. hp, dmg, work, siteHp, siteCost, cartSpeed, cartHp: shares; armor, cartLoads: flat; wounded: wounded share. */
export interface PerkFx {
  hp?: number; dmg?: number; armor?: number; wounded?: number;
  work?: number; siteCost?: number; siteHp?: number;
  cartLoads?: number; cartSpeed?: number; cartHp?: number;
}
export interface Perk { level: number; name: string; text: string; fx: PerkFx }

export const PERKS: Record<PerkPath, readonly Perk[]> = {
  warrior: [
    { level: 2, name: 'Hardened', text: 'Your men have 15% more health.', fx: { hp: 0.15 } },
    { level: 3, name: 'Drilled', text: 'Your men hit 15% harder.', fx: { dmg: 0.15 } },
    { level: 5, name: 'Stubborn', text: 'More of your fallen live, wounded.', fx: { wounded: 0.1 } },
    { level: 7, name: 'Thick hide', text: 'Your men have 1 more armour.', fx: { armor: 1 } },
    { level: 8, name: 'Battle-worn', text: '10% more health on top.', fx: { hp: 0.1 } },
    { level: 10, name: 'Veterans', text: '10% harder blows on top.', fx: { dmg: 0.1 } },
    { level: 11, name: 'Ichor-fed', text: 'Still more of your fallen live.', fx: { wounded: 0.1 } },
  ],
  builder: [
    { level: 2, name: 'Quick hands', text: 'Your men work 10% faster.', fx: { work: 0.1 } },
    { level: 4, name: 'Thrift', text: 'What you build costs 10% less.', fx: { siteCost: 0.1 } },
    { level: 5, name: 'Hardy crew', text: 'Your men have 15% more health.', fx: { hp: 0.15 } },
    { level: 7, name: 'Stout work', text: 'What you build is 20% stronger.', fx: { siteHp: 0.2 } },
    { level: 9, name: 'Master hands', text: 'Your men work 15% faster on top.', fx: { work: 0.15 } },
    { level: 10, name: 'Sharp eye', text: 'Building costs 10% less on top.', fx: { siteCost: 0.1 } },
    { level: 12, name: 'Built to last', text: 'Buildings 20% stronger on top.', fx: { siteHp: 0.2 } },
  ],
  trader: [
    { level: 2, name: 'Deep beds', text: 'Your carts hold 2 more loads.', fx: { cartLoads: 2 } },
    { level: 3, name: 'Busy hands', text: 'Your men gather 10% faster.', fx: { work: 0.1 } },
    { level: 5, name: 'Iron tyres', text: 'Your carts are 25% tougher.', fx: { cartHp: 0.25 } },
    { level: 6, name: 'Good teams', text: 'Your carts roll 15% faster.', fx: { cartSpeed: 0.15 } },
    { level: 8, name: 'Hard roads', text: 'Your men have 15% more health.', fx: { hp: 0.15 } },
    { level: 10, name: 'High sides', text: '2 more loads on top.', fx: { cartLoads: 2 } },
    { level: 12, name: 'Fast teams', text: 'Carts 15% faster on top.', fx: { cartSpeed: 0.15 } },
  ],
};

const NONE: PerkFx = {};
const folded = new Map<string, PerkFx>();

/** The sum of the path's perks at `level`; no path: nothing. */
export function perkFx(path: PerkPath | null | undefined, level = 1): PerkFx {
  if (!path || level < 2) return NONE;
  const k = `${path}:${level}`;
  let fx = folded.get(k);
  if (!fx) {
    const sum: Record<string, number> = {};
    for (const p of PERKS[path]) if (p.level <= level) for (const [f, v] of Object.entries(p.fx)) sum[f] = (sum[f] ?? 0) + (v as number);
    folded.set(k, (fx = sum));
  }
  return fx;
}
