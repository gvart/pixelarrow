/**
 * Profession trees of the six civilian classes (docs/WAR.md "Crafting and professions", W-40). Each tree: a free root at
 * L1, 9 nodes, 2 capstones at L10 (pick one). 1 point per level from L2 to L9 (8 points), so a crafter leaves at least
 * one node out. A node needs its level and the nodes in `needs` (all of them) or `needsAny` (n of them). A civilian's
 * picks are node ids in `Hero.perks`; the root is always his.
 */
import type { CivClassId } from './classes';

export type ProfId = 'smith' | 'cook' | 'physician' | 'engineer' | 'merchant' | 'forager';
export const PROF_IDS: ProfId[] = ['smith', 'cook', 'physician', 'engineer', 'merchant', 'forager'];

export interface ProfNode {
  id: string;
  prof: ProfId;
  name: string;
  level: number;
  /** Every one of these nodes first. */
  needs?: string[];
  /** At least n of these nodes first. */
  needsAny?: [number, string[]];
  root?: true;
  capstone?: true;
  desc: string;
}

/** Points to spend at a level: 1 per level from L2 to L9. Capstones (L10) cost none, but only one may be taken. */
export const pointsAt = (level: number): number => Math.max(0, Math.min(8, level - 1));
export const CAPSTONE_LEVEL = 10;

type Row = [id: string, name: string, level: number, desc: string, extra?: Partial<ProfNode>];
const tree = (prof: ProfId, rows: Row[]): ProfNode[] => rows.map(([id, name, level, desc, extra]) => ({ id, prof, name, level, desc, ...extra }));
const ROOT: Partial<ProfNode> = { root: true };
const CAP: Partial<ProfNode> = { capstone: true };

const SMITH_FAMILIES = ['armourer', 'bladesmith', 'bowyer'];
const DISH_NODES = ['baker', 'stewPot', 'herbCook', 'spartanMess', 'saltPork'];

const ALL: ProfNode[] = [
  ...tree('smith', [
    ['smelter', 'Smelter', 1, 'bronze, repair at a forge; spears, short spears, lances, javelins, clubs, shields', ROOT],
    ['armourer', 'Armourer', 2, 'light and medium armour, open helmets'],
    ['bladesmith', 'Bladesmith', 2, 'swords, curved swords, axes, falx, rhomphaia'],
    ['bowyer', 'Bowyer', 3, 'bows, short bows, slings'],
    ['fieldForge', 'Field Forge', 3, 'repairs within 15 tiles of an own squad, 50% speed'],
    ['alloy', 'Alloy', 4, 'bronze +20% a smelt'],
    ['journeyman', 'Journeyman', 4, 'tier 2 of his families', { needsAny: [2, SMITH_FAMILIES] }],
    ['heavyArmour', 'Heavy Armour', 6, 'heavy armour, closed helmets', { needs: ['armourer', 'journeyman'] }],
    ['master', 'Master', 7, 'tier 3 of his families', { needs: ['journeyman'] }],
    ['masterwork', 'Masterwork', 8, '+2 craft grade, masterwork chance', { needs: ['master'] }],
    ['reforger', 'Reforger', 10, 're-rolls one random stat', CAP],
    ['goldsmith', 'Goldsmith', 10, 'trinkets, salvage returns 60%', CAP],
  ]),
  ...tree('cook', [
    ['campCook', 'Camp Cook', 1, 'rations at a camp or store', ROOT],
    ['baker', 'Baker', 2, 'barley bread, cookhouse L2'],
    ['fieldKitchen', 'Field Kitchen', 2, 'rations away from a building at 60% speed'],
    ['saltPork', 'Salt Pork', 3, 'salt pork; rations keep 24 h, not 12'],
    ['stewPot', 'Stew Pot', 3, 'lentil soup, fish stew', { needs: ['baker'] }],
    ['herbCook', 'Herb Cook', 4, 'kykeon', { needs: ['stewPot'] }],
    ['spartanMess', 'Spartan Mess', 4, 'black broth', { needs: ['stewPot'] }],
    ['quartermaster', 'Quartermaster', 6, "march stores; fed squads' upkeep -25%", { needs: ['saltPork'] }],
    ['bigPot', 'Big Pot', 7, 'batch x1.5', { needsAny: [2, DISH_NODES] }],
    ['feast', 'Feast', 8, 'feast', { needs: ['bigPot'] }],
    ['headCook', 'Head Cook', 10, 'dishes last +50%', CAP],
    ['symposiarch', 'Symposiarch', 10, "after a won fight a fed squad's wounded heal 1 h sooner", CAP],
  ]),
  ...tree('physician', [
    ['healer', 'Healer', 1, 'heal at camp or fort, bandage', ROOT],
    ['bonesetter', 'Bonesetter', 2, 'wound timers -15% at his camp or fort'],
    ['fieldSurgeon', 'Field Surgeon', 2, 'field radius 6 -> 10'],
    ['herbalist', 'Herbalist', 3, 'salve'],
    ['triage', 'Triage', 3, 'frees one patient at once per hour'],
    ['rhizotomist', 'Rhizotomist', 4, 'theriac', { needs: ['herbalist'] }],
    ['battleDresser', 'Battle Dresser', 4, 'a bandage counts double'],
    ['fieldTent', 'Field Tent', 6, 'tent kit', { needs: ['bonesetter'] }],
    ['iatreion', 'Iatreion', 7, 'his infirmary L3 heals in 1 h', { needs: ['bonesetter'] }],
    ['anatomist', 'Anatomist', 8, 'remedies batch x1.5', { needs: ['triage'] }],
    ['asclepiad', 'Asclepiad', 10, 'once a fight, the first man to die within 10 tiles is wounded instead', CAP],
    ['proxenosSick', 'Proxenos of the sick', 10, 'captives he holds heal, ransom +30%', CAP],
  ]),
  ...tree('engineer', [
    ['builder', 'Builder', 1, 'build x1.5, tools T1', ROOT],
    ['carpenter', 'Carpenter', 2, 'mantlet'],
    ['masterBuilder', 'Master Builder', 2, 'build +25%'],
    ['toolmaker', 'Toolmaker', 3, 'tools T2 for every class', { needs: ['carpenter'] }],
    ['bridgewright', 'Bridgewright', 3, 'spans +4 tiles'],
    ['rams', 'Rams', 4, 'covered ram', { needs: ['carpenter'] }],
    ['fortifier', 'Fortifier', 5, 'iron-bound gate, wet hides, stakes, ditch', { needs: ['masterBuilder'] }],
    ['instrumentMaker', 'Instrument Maker', 6, 'tools T3', { needs: ['toolmaker'] }],
    ['artillerist', 'Artillerist', 7, 'oxybeles; stone thrower crew -1', { needs: ['rams'] }],
    ['sapper', 'Sapper', 8, 'engine damage +30%', { needs: ['rams'] }],
    ['poliorcetes', 'Poliorcetes', 10, 'siege tower', CAP],
    ['archimedes', 'Archimedes', 10, 'throwers and oxybeles on stone towers, range +20%', CAP],
  ]),
  ...tree('merchant', [
    ['trader', 'Trader', 1, 'sells surplus at a stall', ROOT],
    ['haggler', 'Haggler', 2, '+-8% price'],
    ['packer', 'Packer', 2, 'caravan goods'],
    ['packMules', 'Pack Mules', 3, 'load +50%'],
    ['appraiser', 'Appraiser', 3, 'sees rolls before buying; sells gear x1.2'],
    ['contracts', 'Contracts', 4, '2 open contracts', { needs: ['packer'] }],
    ['safeRoads', 'Safe Roads', 5, 'caravan hidden on the world map until close'],
    ['broker', 'Broker', 6, '4 contracts, escrowed hand-offs', { needs: ['contracts'] }],
    ['banker', 'Banker', 7, 'letters of credit between own market towns', { needs: ['broker'] }],
    ['importer', 'Importer', 8, '<= 5 copper or 3 hides a day at x2 price (never tin)', { needs: ['appraiser'] }],
    ['emporos', 'Emporos', 10, 'caravan +1 wagon, a market for allies it passes', CAP],
    ['proxenos', 'Proxenos', 10, 'ransom -30%, buys back fallen gear from the enemy salvage pool', CAP],
  ]),
  ...tree('forager', [
    ['gatherer', 'Gatherer', 1, 'gathers x2', ROOT],
    ['woodsman', 'Woodsman', 2, 'wood x1.25'],
    ['prospector', 'Prospector', 2, 'ore x1.25'],
    ['pitchman', 'Pitchman', 3, 'pitch x2'],
    ['charcoalBurner', 'Charcoal Burner', 3, 'charcoal'],
    ['hunter', 'Hunter', 4, 'hides from kills within 15 tiles'],
    ['tanner', 'Tanner', 5, 'leather', { needs: ['hunter'] }],
    ['weaver', 'Weaver', 6, 'flax on farms, linen'],
    ['presser', 'Presser', 7, 'oil at an olive press'],
    ['herbFinder', 'Herb Finder', 8, 'herbs from forest and marsh gathering'],
    ['steward', 'Steward', 10, 'refining -20% input, batch x1.5', CAP],
    ['pathfinder', 'Pathfinder', 10, 'works in neutral regions with no squad near, flees x1.3 faster', CAP],
  ]),
];

export const PROF_NODES: Record<string, ProfNode> = Object.fromEntries(ALL.map((n) => [n.id, n]));
export const PROF_TREES: Record<ProfId, ProfNode[]> = Object.fromEntries(PROF_IDS.map((p) => [p, ALL.filter((n) => n.prof === p)])) as Record<ProfId, ProfNode[]>;
export const PROF_ROOT: Record<ProfId, string> = Object.fromEntries(PROF_IDS.map((p) => [p, PROF_TREES[p].find((n) => n.root)!.id])) as Record<ProfId, string>;

export const profOf = (cls: CivClassId | string): ProfId | null => {
  const p = cls.startsWith('civ_') ? cls.slice(4) : '';
  return (PROF_IDS as string[]).includes(p) ? (p as ProfId) : null;
};

/** The nodes a civilian of `prof` holds: his root and his picks of that tree (other ids in `perks` are ignored). */
export function heldNodes(prof: ProfId, perks: readonly string[] = []): Set<string> {
  const out = new Set([PROF_ROOT[prof]]);
  for (const id of perks) if (PROF_NODES[id]?.prof === prof) out.add(id);
  return out;
}

export type NodeRefusal = 'unknown' | 'tree' | 'taken' | 'level' | 'needs' | 'points' | 'capstone';

/** Why `node` cannot be taken by a civilian of `prof` at `level` holding `perks` (null: it can). */
export function nodeRefusal(prof: ProfId, level: number, perks: readonly string[], node: string): NodeRefusal | null {
  const n = PROF_NODES[node];
  if (!n) return 'unknown';
  if (n.prof !== prof) return 'tree';
  const held = heldNodes(prof, perks);
  if (held.has(node)) return 'taken';
  if (level < n.level) return 'level';
  if (n.needs && !n.needs.every((x) => held.has(x))) return 'needs';
  if (n.needsAny && n.needsAny[1].filter((x) => held.has(x)).length < n.needsAny[0]) return 'needs';
  if (n.capstone) return [...held].some((x) => PROF_NODES[x].capstone) ? 'capstone' : null;
  const spent = [...held].filter((x) => !PROF_NODES[x].root && !PROF_NODES[x].capstone).length;
  return spent >= pointsAt(level) ? 'points' : null;
}

/** A pick list is valid when taken in order every node passes nodeRefusal. */
export function validPicks(prof: ProfId, level: number, picks: readonly string[]): boolean {
  const done: string[] = [];
  for (const id of picks) {
    if (nodeRefusal(prof, level, done, id)) return false;
    done.push(id);
  }
  return true;
}
