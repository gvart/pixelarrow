/**
 * The player's crafting side of the sandbox (M5h5, docs/WAR.md "Crafting and professions"): the stash, profession node
 * picks and respecs, gear from the stash onto a soldier, repair and salvage, queue orders at the workplaces.
 *
 * Local play keeps it in memory beside the sandbox roster (../roster/state.ts): crafted items come in on the sim's
 * `crafted` events (owner `you`), node picks and gear go to the roster and the live man (setPerson). Net mode (?net=)
 * asks the server instead: GET /api/war/stash and /roster, POST /persons/:id/node, /respec, /equip, `mend` over the
 * region socket; crafting orders go up as orders either way.
 */
import { CIV_TOOLS, isCivClass } from '../../../../data/classes';
import { classGearBlocker } from '../../../../data/gearRules';
import { ITEMS, itemDef, type Item, type Slot } from '../../../../data/items';
import { heldNodes, nodeRefusal, profOf, type NodeRefusal } from '../../../../data/professions';
import { craftGrade, crudeChance, masterworkChance, oddsRow, TIER_CAP, type Recipe } from '../../../../data/recipes';
import { crafterRefusal } from '../../../sim/crafting';
import type { BuildingSnap, WarEvent, WarPerson } from '../../../types';
import type { SandboxScene } from '../../SandboxScene';
import type { SandboxRoster } from '../roster/state';
import { myTeam } from '../../side';

const OWNER = 'you';
/** Respec (server/src/war/crafting.ts RESPEC): 50 silver, once a day. */
export const RESPEC = { silver: 50, ms: 24 * 3_600_000 };

/** A civilian as the craft views need him. */
export interface Civ { id: string; name: string; cls: string; level: number; perks: string[]; tool?: Item; respecAt: number | null }
/** A stash item; `away`: at a workplace for mending (or, net mode, in a region). */
export interface StashItem { item: Item; away: boolean }
/** Odds of a crafted item for one crafter: grade, rarity chances (percent, capped by tier), crude and masterwork chances. */
export interface Odds { g: number; rarity: number[]; crude: number; masterwork: number }

interface NetPerson { id: string; cls: string; name: string; level: number; perks?: string[]; gear?: Partial<Record<Slot, Item>>; respecAt?: number | null }

export class SandboxCraft {
  private local: Item[] = [];
  private away = new Set<string>();
  private respecs = new Map<string, number>();
  private netStash: { item: Item; region: string | null }[] = [];
  private netPersons = new Map<string, NetPerson>();
  private netAt = 0;
  /** A message for the player (refusal, made item); the HUD shows it as a toast. */
  onNote: ((text: string, kind?: 'info' | 'bad' | 'made') => void) | null = null;
  onChange: (() => void) | null = null;

  constructor(private s: SandboxScene, readonly R: SandboxRoster) {
    const prev = s.sim.onEvents;
    s.sim.onEvents = (ev) => { prev?.(ev); this.events(ev); };
    this.seed();
    if (s.sim.net) void this.pull();
  }

  get net(): boolean {
    return this.s.sim.net;
  }

  /** Local: a worn sword and spear in the stash to mend or salvage before the first craft. */
  private seed(): void {
    if (this.net) return;
    this.local.push({ uid: 'stash-worn-xiphos', def: 'xiphos', rarity: 'uncommon', cond: 62, q: 1, mc: 100, aff: undefined }, { uid: 'stash-old-dory', def: 'dory', rarity: 'common', cond: 41, q: 0, mc: 80 });
  }

  /** Net: stash and persons again (at most every 2 s unless forced). */
  async pull(force = false): Promise<void> {
    if (!this.net || (!force && performance.now() - this.netAt < 2000)) return;
    this.netAt = performance.now();
    const [st, ro] = await Promise.all([
      this.s.sim.api<{ items?: { item: Item; region: string | null }[] }>('GET', 'stash'),
      this.s.sim.api<{ persons?: NetPerson[] }>('GET', 'roster'),
    ]);
    if (st?.items) this.netStash = st.items;
    if (ro?.persons) this.netPersons = new Map(ro.persons.map((p) => [p.id, p]));
    this.onChange?.();
  }

  // ---------------------------------------------------------------- stash

  stash(): StashItem[] {
    if (this.net) return this.netStash.map((x) => ({ item: x.item, away: x.region !== null }));
    return this.local.map((item) => ({ item, away: this.away.has(item.uid) }));
  }

  private events(ev: WarEvent[]): void {
    for (const e of ev) {
      if (e.kind !== 'crafted' || e.team !== myTeam()) continue;
      if (this.net) { void this.pull(true); continue; }
      if (e.owner !== OWNER) continue;
      this.away.delete(e.item.uid);
      const i = this.local.findIndex((x) => x.uid === e.item.uid);
      if (e.what === 'craft') {
        this.local.push(e.item);
        this.onNote?.(`made: ${nameOf(e.item.def)}${e.item.q === 2 ? ' (masterwork)' : e.item.q === 0 ? ' (crude)' : ''}`, 'made');
      } else if (e.what === 'repair' && i >= 0) {
        this.local[i] = e.item;
        this.onNote?.(`mended: ${nameOf(e.item.def)}`, 'made');
      } else if (e.what === 'salvage' && i >= 0) {
        this.local.splice(i, 1);
        this.onNote?.(`salvaged: ${nameOf(e.item.def)}`, 'made');
      }
    }
    this.onChange?.();
  }

  // ---------------------------------------------------------------- civilians and nodes

  /** A civilian by person id (local roster, or the server's roster in net mode). */
  civ(pid: string | undefined): Civ | null {
    if (!pid) return null;
    if (this.net) {
      const p = this.netPersons.get(pid);
      return p && isCivClass(p.cls) ? { id: p.id, name: p.name, cls: p.cls, level: p.level, perks: p.perks ?? [], tool: p.gear?.weapon, respecAt: p.respecAt ?? null } : null;
    }
    const p = this.R.roster.get(pid);
    if (!p || !isCivClass(p.hero.cls)) return null;
    return { id: p.id, name: p.hero.name, cls: p.hero.cls!, level: p.hero.level, perks: p.hero.perks as unknown as string[], tool: p.hero.equip.weapon, respecAt: this.respecs.get(p.id) ?? null };
  }

  /** Why civilian c may not take node now (null: he may). */
  refusal(c: Civ, node: string): NodeRefusal | null {
    const prof = profOf(c.cls);
    return prof ? nodeRefusal(prof, c.level, c.perks, node) : 'tree';
  }

  async pick(pid: string, node: string): Promise<void> {
    const c = this.civ(pid);
    if (!c) return;
    const why = this.refusal(c, node);
    if (why) return this.onNote?.(`can't take it: ${REFUSAL[why]}`, 'bad');
    if (this.net) {
      const r = await this.s.sim.api<{ perks?: string[]; error?: string }>('POST', `persons/${pid}/node`, { node });
      if (r?.error) this.onNote?.(r.error, 'bad');
      return this.pull(true);
    }
    this.editHero(pid, (h) => ({ ...h, perks: [...(h.perks as unknown as string[]), node] as unknown as typeof h.perks }));
  }

  /** When civilian c may respec again (0: now), and whether the stock holds the silver. */
  respecState(c: Civ): { wait: number; silver: boolean } {
    const wait = c.respecAt === null ? 0 : Math.max(0, c.respecAt + (this.net ? 0 : RESPEC.ms) - Date.now());
    return { wait, silver: (this.s.sim.cur?.stock?.[myTeam()]?.silver ?? 0) >= RESPEC.silver || this.net };
  }

  async respec(pid: string): Promise<void> {
    const c = this.civ(pid);
    if (!c || !c.perks.length) return;
    if (this.net) {
      const r = await this.s.sim.api<{ next?: number; error?: string }>('POST', `persons/${pid}/respec`);
      if (r?.error) this.onNote?.(r.error, 'bad');
      return this.pull(true);
    }
    const st = this.respecState(c);
    if (st.wait) return this.onNote?.('a respec once a day', 'bad');
    if (!st.silver) return this.onNote?.(`a respec costs ${RESPEC.silver} silver`, 'bad');
    this.s.sim.addStock(myTeam(), 'silver', -RESPEC.silver);
    this.respecs.set(pid, Date.now());
    this.editHero(pid, (h) => ({ ...h, perks: [] as unknown as typeof h.perks }));
  }

  private editHero(pid: string, f: (h: WarPerson['hero']) => WarPerson['hero']): void {
    const p = this.R.roster.get(pid);
    if (!p) return;
    this.R.edit({ ...p, hero: f(p.hero) });
    this.onChange?.();
  }

  // ---------------------------------------------------------------- gear

  /** Why person p may not put item on (null: he may). */
  equipBlock(p: WarPerson, item: Item): string | null {
    const tool = CIV_TOOLS[item.def];
    if (tool) return tool.cls === p.hero.cls ? null : `a ${tool.cls.slice(4)}'s tool`;
    if (!ITEMS[item.def]) return 'unknown item';
    if (isCivClass(p.hero.cls)) return 'civilians carry only their tool';
    const b = classGearBlocker(p.hero.cls ?? 'militia', itemDef(item.def));
    return b ? (b === 'none' ? 'not for this class' : `not a ${b} this class uses`) : null;
  }

  /** Put stash item uid on person pid (what he wore goes to the stash). */
  async equip(pid: string, uid: string): Promise<void> {
    const slot = this.slotOf(uid);
    if (!slot) return;
    if (this.net) {
      const r = await this.s.sim.api<{ error?: string }>('POST', `persons/${pid}/equip`, { slot, uid });
      if (r?.error) this.onNote?.(r.error, 'bad');
      return this.pull(true);
    }
    const p = this.R.roster.get(pid), i = this.local.findIndex((x) => x.uid === uid);
    if (!p || i < 0 || this.away.has(uid)) return;
    const why = this.equipBlock(p, this.local[i]);
    if (why) return this.onNote?.(why, 'bad');
    const [it] = this.local.splice(i, 1), old = p.hero.equip[slot];
    if (old) this.local.push(old);
    this.editHero(pid, (h) => ({ ...h, equip: { ...h.equip, [slot]: it } }));
  }

  async unequip(pid: string, slot: Slot): Promise<void> {
    if (this.net) {
      await this.s.sim.api('POST', `persons/${pid}/equip`, { slot, uid: null });
      return this.pull(true);
    }
    const p = this.R.roster.get(pid), old = p?.hero.equip[slot];
    if (!p || !old) return;
    this.local.push(old);
    this.editHero(pid, (h) => { const equip = { ...h.equip }; delete equip[slot]; return { ...h, equip }; });
  }

  private slotOf(uid: string): Slot | null {
    const it = this.stash().find((x) => x.item.uid === uid)?.item;
    if (!it) return null;
    return CIV_TOOLS[it.def] ? 'weapon' : ITEMS[it.def] ? itemDef(it.def).slot : null;
  }

  // ---------------------------------------------------------------- workplaces

  craft(b: BuildingSnap, recipe: string): void {
    this.s.sim.order({ kind: 'craft', team: myTeam(), building: b.id, recipe });
  }

  cancel(b: BuildingSnap, order: number): void {
    this.s.sim.order({ kind: 'cancelCraft', team: myTeam(), building: b.id, order });
  }

  /** Repair or salvage stash item uid at workplace b. */
  mend(kind: 'repair' | 'salvage', b: BuildingSnap, uid: string): void {
    if (this.net) {
      this.s.sim.mend(kind, b.id, uid);
      setTimeout(() => void this.pull(true), 600);
      return;
    }
    const it = this.local.find((x) => x.uid === uid);
    if (!it || this.away.has(uid)) return;
    this.s.sim.order({ kind, team: myTeam(), building: b.id, owner: OWNER, item: it });
    this.away.add(uid);
    this.onChange?.();
  }

  /** What crafter c rolls for recipe r at workplace level wpLevel. */
  odds(c: Civ, r: Recipe, wpLevel: number): Odds {
    const tool = c.tool, held = profOf(c.cls) ? heldNodes(profOf(c.cls)!, c.perks) : new Set<string>();
    const mw = held.has('masterwork');
    const g = craftGrade({ level: c.level, toolTier: tool ? CIV_TOOLS[tool.def]?.tier ?? 1 : 1, toolRarity: tool?.rarity, wpLevel, masterwork: mw });
    const row = [...oddsRow(g)], cap = TIER_CAP[Math.max(1, Math.min(3, r.tier))];
    for (let i = cap + 1; i < row.length; i++) (row[cap] += row[i]), (row[i] = 0);
    const crude = crudeChance(g);
    return { g, rarity: row, crude, masterwork: mw ? Math.min(1 - crude, masterworkChance(g)) : 0 };
  }

  /** M5h3: the nodes the player's living engineers hold (an engine design or a Fortifier work needs one, ../../../sim/siege.ts). */
  engineerNodes(): Set<string> {
    const out = new Set<string>();
    for (const u of this.s.sim.cur?.units ?? []) {
      if (u.state === 'dead' || u.cls !== 'civ_engineer' || this.s.sim.squads.get(u.squad)?.team !== myTeam()) continue;
      for (const n of heldNodes('engineer', this.civ(u.pid)?.perks ?? [])) out.add(n);
    }
    return out;
  }

  /** Whether civilian c may make recipe r (his class and nodes). */
  canMake(c: Civ, r: Recipe): boolean {
    return !crafterRefusal({ prof: profOf(c.cls), perks: c.perks }, r);
  }
}

export const REFUSAL: Record<NodeRefusal, string> = {
  unknown: 'no such node', tree: 'another trade', taken: 'already his', level: 'his level is too low', needs: 'needs an earlier node',
  points: 'no points left', capstone: 'one capstone only',
};

/** Display name of an item, tool or product id. */
export function nameOf(def: string): string {
  if (ITEMS[def]) return ITEMS[def].name;
  if (CIV_TOOLS[def]) return CIV_TOOLS[def].name.replace(/^./, (c) => c.toUpperCase());
  return def.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

const crafts = new WeakMap<SandboxScene, SandboxCraft>();
export function sandboxCraft(s: SandboxScene, R: SandboxRoster): SandboxCraft {
  let c = crafts.get(s);
  if (!c) crafts.set(s, (c = new SandboxCraft(s, R)));
  return c;
}
