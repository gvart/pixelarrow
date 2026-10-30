/**
 * Who gives each quest and why (Greek-myth flavour, docs/WAR.md "Lore": the dead wake on Metaxy, the in-between). Pure
 * text, no rules: the guide (./guide.ts, ../view/hud/guide.ts), the daily and weekly tasks (./tasks.ts,
 * ../view/hud/tasks.ts), the crown's orders (../view/hud/crown.ts) and the market's contracts (../view/hud/market.ts)
 * show each quest as giver, story, objective (a verb and a target), where to go and how the reward is paid.
 */
import type { GuideStepId } from './guide';
import type { TaskMetric } from './tasks';

export interface Giver { name: string; title: string }

/** The first hour's guide: one elder of each home (alliance id). */
export const GUIDE_GIVER: readonly Giver[] = [
  { name: 'Peleia', title: 'dove-priestess of the Oak' },
  { name: 'Targitaos', title: 'keeper of the mounds' },
  { name: 'Battos', title: 'old master of the caravan' },
  { name: 'Nausikaa', title: 'warden of the headland' },
];
export const guideGiver = (team: number): Giver => GUIDE_GIVER[team] ?? GUIDE_GIVER[0];

/** The guide's welcome (the start banner): `{town}` is the home town. */
export const GUIDE_INTRO = 'You died, and woke on Metaxy, the in-between. Here only the strong are kept. Walk the road to {town} with me and I will show you how a warband lives.';

export interface StepLore {
  /** The objective: a verb and a target, about six words (the card's main line). */
  goal: string;
  /** The input that does it, as a key chip: a key ('B'), 'rmb' (right-click) or 'auto' (it happens by itself). */
  key: string;
  /** 1-3 sentences, `{town}` the home town. */
  story: string;
  /** Where to go. */
  where: string;
}
export const GUIDE_LORE: Record<GuideStepId, StepLore> = {
  soul: {
    goal: 'Claim the fallen hoplite',
    key: 'rmb',
    story: 'A man died in the world above this morning and woke by the road, alone. A soul belongs to the first squad that stands beside him, so reach him before the wild does.',
    where: 'By the road ahead, marked in gold. Select your men and right-click him.',
  },
  gather: {
    goal: 'Cut wood or quarry stone',
    key: 'rmb',
    story: '{town} was raised from the timber and rock of this land, and even the dead need roofs. Put your men to work.',
    where: 'The nearest tree or boulder, marked in gold. Right-click it with your men.',
  },
  lair: {
    goal: 'Drive off the bandits',
    key: 'rmb',
    story: 'Two oath-breakers who fled the first muster prey on the newly dead along the road home. Show them the road is kept.',
    where: 'On the road to {town}, marked in gold. Right-click them to attack.',
  },
  build: {
    goal: 'Build a camp in {town}',
    key: 'B',
    story: 'A warband without a hearth scatters like mist at dawn. Plant your camp on {town}\'s ground and your men will have a store of their own.',
    where: '{town}, marked in gold. Press B, pick Camp and place it inside the town\'s ground.',
  },
  haul: {
    goal: 'Bring goods into a store',
    key: 'auto',
    story: 'The stores keep a hall fed through the season, and a hall with empty stores fades first. Fill yours.',
    where: 'Your nearest camp or store, marked in gold. Your gatherers carry their loads there by themselves.',
  },
};

/** The daily and weekly tasks' givers and stories, by what they count. */
export interface TaskLore {
  giver: Giver;
  /** The card's main line: a short imperative, no numbers (the progress chip shows them). */
  goal: string;
  story: string;
  where: string;
}
const BUILDER: Giver = { name: 'Eupalinos', title: 'master builder' };
const POLEMARCH: Giver = { name: 'Lykos', title: 'polemarch of the alliance' };
const HERMES: Giver = { name: 'Hermes', title: 'leader of souls' };
const FACTOR: Giver = { name: 'Mnesarchos', title: 'factor of the agora' };
const STORES: Giver = { name: 'Phaidra', title: 'keeper of the stores' };
const HORKOS: Giver = { name: 'The oath-stone', title: 'of Horkos' };
export const TASK_LORE: Record<TaskMetric, TaskLore> = {
  gatherWood: { giver: BUILDER, goal: 'Cut wood', story: 'The works never stop eating timber, and the builders pay for every log.', where: 'Any forest: right-click a tree, your men carry the wood to your nearest store.' },
  gatherStone: { giver: BUILDER, goal: 'Quarry stone', story: 'Stone outlasts the men who lay it, and on Metaxy even the men last. The builders need more.', where: 'Any quarry: right-click a boulder, your men carry the stone to your nearest store.' },
  deliver: { giver: STORES, goal: 'Stow goods in a store', story: 'When the season turns, the hall with empty stores is the first to fade.', where: 'Your squad chest (I) beside a warehouse, stall or your strongroom: stow goods in.' },
  wins: { giver: POLEMARCH, goal: 'Win fights', story: 'Metaxy weighs an alliance by the fields it walks off. Win, and the war chest pays.', where: 'Any region: a fight your men walk away from and the foe does not.' },
  kills: { giver: POLEMARCH, goal: 'Strike down foes', story: 'A foe struck down here wakes again in his own hall, slower to come back. Thin their ranks.', where: 'Any region: lairs on the roads, raiders, the other alliances.' },
  soul: { giver: HERMES, goal: 'Claim souls', story: 'I lead the newly dead to the shrines, ruins, lairs and old battlefields. Reach them before the wild does.', where: 'A soul (gold ghost) at a shrine, ruin, lair or battlefield: right-click him.' },
  caravan: { giver: FACTOR, goal: 'Carry goods across a border', story: 'Goods are worth most where they are scarce. Carry them across a border.', where: 'Leave this region for another with goods on your men or carts.' },
  guard: { giver: POLEMARCH, goal: 'Guard a town on contract', story: 'A town that hires our spears trusts the alliance. Keep that trust.', where: 'A guard contract from the market (K): stand your men in the poster\'s town.' },
  labour: { giver: BUILDER, goal: 'Work on a building site', story: 'Walls, temples and roads are raised by hands, and yours are idle.', where: 'An alliance work site, or a build contract from the market (K).' },
  workGoods: { giver: BUILDER, goal: 'Give goods to alliance works', story: 'The temple, the roads and the beacons rise from what members give.', where: 'The Works panel: give goods to an alliance work.' },
  sellAlliance: { giver: FACTOR, goal: 'Sell to other alliances', story: 'Silver from another alliance\'s purse weighs the same as ours, and it buys more.', where: 'Your stall at a market town (K): sell to members of other alliances.' },
  contract: { giver: HORKOS, goal: 'Fill a market contract', story: 'Horkos, god of oaths, punishes the forsworn even here. Give your word and keep it.', where: 'The market (K), Contracts tab: take a contract and fill it.' },
};

/** The player contracts' job board: the short goal (the card's line), what to do in full, and how the reward is paid. */
export const CONTRACT_HOW: Record<'carry' | 'supply' | 'escort' | 'build' | 'guard', { short: string; goal: string; pay: string }> = {
  carry: { short: 'Deliver the sealed loads', goal: 'Load the sealed goods here and unload them at the destination', pay: 'Paid on delivery at the destination, with your deposit back' },
  supply: { short: 'Fill the poster\'s warehouse', goal: 'Bring the goods into the poster\'s warehouse at the destination', pay: 'Paid on delivery, as the goods arrive' },
  escort: { short: 'Escort the cart', goal: 'Guard the poster\'s cart to the destination', pay: 'Paid when the cart arrives with 75% of its cargo' },
  build: { short: 'Work on the building site', goal: 'Put your men to work on the poster\'s building site', pay: 'Paid as you work, an hour of labour at a time' },
  guard: { short: 'Hold the poster\'s town', goal: 'Stand your men inside the poster\'s town', pay: 'Paid each hour held; broken if they leave for 2 min' },
};

/** The crown's orders: the story, `{where}` the region or target. */
export const ORDER_LORE: Record<'attack' | 'defend' | 'rally' | 'supply', { story: string; goal: string; pay: string }> = {
  attack: { story: 'The crown wants {where} taken. Its bounty is shared by everyone whose men fight there.', goal: 'Fight at {where}', pay: 'Shared by fighters (1 share + 1 per kill), paid when the order closes' },
  defend: { story: '{where} must not fall. The crown pays everyone who stands and fights for it.', goal: 'Defend {where}', pay: 'Shared by fighters (1 share + 1 per kill), paid when the order closes' },
  rally: { story: 'The crown gathers its spears at {where}. A rally pays no coin, only the realm\'s regard.', goal: 'Gather your men at {where}', pay: 'No bounty' },
  supply: { story: 'The Quartermaster needs goods in {where} before the season turns.', goal: 'Deliver goods to {where}', pay: 'Paid as the goods come in: stow them at {where}, then press Deliver' },
};

export const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
