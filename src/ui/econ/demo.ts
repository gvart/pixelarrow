/**
 * An in-memory economy for the layout check, screenshots and the gallery:
 * the same shapes as the API, plausible numbers, purchases and claims that
 * work locally. Never used in a real session unless a script asks for it
 * (scene data `{ demo: true }`).
 */
import { ApiError, type BuyResult, type ConsumableKey, type EconomyCatalog, type SeasonPassInfo, type WalletInfo } from '../../platform/api';
import { CONSUMABLES, CONSUMABLE_IDS } from '../../data/consumables';
import type { Item } from '../../data/items';
import type { ProfileView } from '../../online/client';
import type { Hero } from '../../data/units';
import type { ConsumableInfo, EconSource, PackResult } from './source';

const COSMETICS: EconomyCatalog['cosmetics'] = [
  { id: 'emblem_owl', slot: 'emblem', name: 'Owl of Athena', drachmae: 60 },
  { id: 'emblem_lambda', slot: 'emblem', name: 'Lakedaimon lambda', drachmae: 60 },
  { id: 'emblem_pegasus', slot: 'emblem', name: 'Pegasus', drachmae: 120 },
  { id: 'emblem_gorgon', slot: 'emblem', name: 'Gorgoneion', drachmae: 200 },
  { id: 'banner_crimson', slot: 'banner', name: 'Crimson war banner', drachmae: 80 },
  { id: 'banner_laurel', slot: 'banner', name: 'Laurel banner', drachmae: 150 },
  { id: 'supporter_banner', slot: 'banner', name: 'Supporter banner', drachmae: null, source: 'legacy_stars' },
  { id: 'cloak_crimson', slot: 'cloak', name: 'Spartan crimson cloak', drachmae: 100 },
  { id: 'cloak_purple', slot: 'cloak', name: 'Royal purple cloak', drachmae: 200 },
  { id: 'flag_trireme', slot: 'clan_flag', name: 'Trireme clan flag', drachmae: 150 },
  { id: 'flag_lion', slot: 'clan_flag', name: 'Lion of Amphipolis clan flag', drachmae: 250 },
  { id: 'skin_bronze', slot: 'army_skin', name: 'Polished bronze army', drachmae: 300 },
  { id: 'skin_macedon', slot: 'army_skin', name: 'Macedonian army', drachmae: 300 },
  { id: 'table_marble', slot: 'table_theme', name: 'Marble war table', drachmae: 250 },
  { id: 'table_tent', slot: 'table_theme', name: 'Campaign tent table', drachmae: 200 },
  { id: 'crest_white', slot: 'crest', name: 'Swan-white crests', drachmae: 80 },
  { id: 'crest_black', slot: 'crest', name: 'Raven-black crests', drachmae: 80 },
  { id: 'crest_purple', slot: 'crest', name: 'Royal purple crests', drachmae: 150 },
  { id: 'crest_gold', slot: 'crest', name: 'Gilded crests', drachmae: 250 },
  { id: 'aura_laurel', slot: 'aura', name: 'Laurel motes', drachmae: 200 },
  { id: 'aura_embers', slot: 'aura', name: 'Ember aura', drachmae: 300 },
  { id: 'aura_storm', slot: 'aura', name: 'Zeus-touched sparks', drachmae: 400 },
  { id: 'pose_salute', slot: 'pose', name: 'Victory: spear salute', drachmae: 120 },
  { id: 'pose_shield', slot: 'pose', name: 'Victory: shield aloft', drachmae: 120 },
  { id: 'emblem_pass_s', slot: 'emblem', name: 'Season victor emblem', drachmae: null, source: 'season_pass' },
  { id: 'cloak_pass_s', slot: 'cloak', name: 'Season victor cloak', drachmae: null, source: 'season_pass' },
  { id: 'banner_pass_s', slot: 'banner', name: 'Season victor banner', drachmae: null, source: 'season_pass' },
];

const ROTATION: ConsumableKey[] = ['morale_wine', 'sharpening_stone', 'war_horn'];

function tiers(): SeasonPassInfo['tiers'] {
  return Array.from({ length: 30 }, (_, i) => {
    const tier = i + 1;
    const free = tier % 5 === 0 ? { kind: 'consumable' as const, id: ROTATION[(tier / 5) % 3], qty: 1 } : { kind: 'gold' as const, amount: 40 + tier * 5 };
    const premium =
      tier === 10
        ? { kind: 'cosmetic' as const, id: 'emblem_pass_s' }
        : tier === 20
          ? { kind: 'cosmetic' as const, id: 'banner_pass_s' }
          : tier === 30
            ? { kind: 'cosmetic' as const, id: 'cloak_pass_s' }
            : tier % 3 === 0
              ? { kind: 'drachmae' as const, amount: 15 }
              : { kind: 'consumable' as const, id: (tier % 2 ? 'healing_salve' : 'march_rations') as ConsumableKey, qty: 1 };
    return { tier, xp: tier * 100, free, premium };
  });
}

export function demoCatalog(): EconomyCatalog {
  return {
    packs: [
      { id: 'drachmae_100', stars: 100, drachmae: 100 },
      { id: 'drachmae_275', stars: 250, drachmae: 275 },
      { id: 'drachmae_600', stars: 500, drachmae: 600 },
      { id: 'drachmae_1300', stars: 1000, drachmae: 1300 },
    ],
    cosmetics: COSMETICS,
    slots: ['emblem', 'banner', 'cloak', 'crest', 'aura', 'pose', 'clan_flag', 'army_skin', 'table_theme'],
    consumables: CONSUMABLE_IDS.map((id) => ({ ...CONSUMABLES[id] })),
    pass: { premiumDrachmae: 500, xpPerTier: 100, xp: { attack: 10, attackWin: 15, capture: 25, duel: 10, duelWin: 10 }, tiers: tiers() },
    market: {
      feeRate: 0.1,
      listingHours: 48,
      maxOpenListings: 20,
      priceBounds: {
        gold: { common: [2, 5000], uncommon: [5, 10000], rare: [20, 20000], epic: [50, 50000], legendary: [200, 100000], default: [2, 100000] },
        drachmae: { common: [2, 500], uncommon: [2, 1000], rare: [5, 2000], epic: [10, 5000], legendary: [40, 10000], default: [2, 10000] },
      },
      resources: ['food', 'wood', 'bronze'],
    },
  };
}

interface DemoOpts {
  heroes?: Hero[];
  stash?: Item[];
  /** Start with a working API (default) or one that answers 503. */
  closed?: boolean;
}

export class DemoEconSource implements EconSource {
  readonly demo = true;
  private now = Date.UTC(2026, 9, 7, 12);
  private w: WalletInfo;
  private p: SeasonPassInfo;
  private cons: ConsumableInfo;
  private prof: ProfileView;
  private seq = 0;

  constructor(private o: DemoOpts = {}) {
    this.w = {
      drachmae: 340,
      canSpend: true,
      ledger: [
        { delta: 275, kind: 'pack', ref: 'drachmae_275', at: this.now - 86_400_000 * 3 },
        { delta: -60, kind: 'spend', ref: 'emblem_owl', at: this.now - 86_400_000 * 2 },
        { delta: 15, kind: 'pass', ref: '3:premium', at: this.now - 86_400_000 },
      ],
      cosmetics: ['emblem_owl', 'banner_crimson'],
      loadout: { emblem: 'emblem_owl' },
    };
    const t = tiers();
    this.p = { season: { id: 3, endsAt: this.now + 86_400_000 * 41 }, xp: 760, tier: 7, premium: false, premiumDrachmae: 500, xpPerTier: 100, claimed: [1, 2, 3, 4].map((tier) => ({ tier, track: 'free' as const })), tiers: t };
    this.cons = {
      inventory: { morale_wine: 2, sharpening_stone: 1, healing_salve: 3 },
      day: '2026-10-07',
      caps: Object.fromEntries(CONSUMABLE_IDS.map((id) => [id, { cap: CONSUMABLES[id].dailyCap, bought: id === 'morale_wine' ? 1 : id === 'war_horn' ? 2 : 0 }])),
    };
    const heroes = (o.heroes ?? []).map((h) => ({ hero: h, woundedUntil: 0, busy: false }));
    this.prof = {
      season: { id: 3, startedAt: this.now - 86_400_000 * 49, endsAt: this.now + 86_400_000 * 41 },
      now: this.now,
      resources: { gold: 1240, food: 380, wood: 210, bronze: 95, recruits: 3 },
      energy: 72,
      energyMax: 100,
      formations: [],
      heroes,
      stash: (o.stash ?? []).map((it) => ({ ...it })),
      clan: null,
      battles: 14,
      wins: 9,
    };
  }

  private ok<T>(v: T): Promise<T> {
    if (this.o.closed) return Promise.reject(new ApiError(503, 'not_configured', 'database not configured'));
    return Promise.resolve(JSON.parse(JSON.stringify(v)) as T);
  }

  private fail(status: number, code: string, msg: string): Promise<never> {
    return Promise.reject(new ApiError(status, code, msg));
  }

  available(): boolean {
    return true;
  }
  catalog() {
    return this.ok(demoCatalog());
  }
  wallet() {
    return this.ok(this.w);
  }
  buy(item: string, opts: { currency?: 'gold' | 'drachmae'; qty?: number } = {}): Promise<BuyResult> {
    const cur = opts.currency ?? 'drachmae';
    const cat = demoCatalog();
    let price = 0;
    if (item === 'season_pass') {
      if (this.p.premium) return this.fail(409, 'already_owned', 'Already owned');
      price = cat.pass.premiumDrachmae;
    } else if (cat.cosmetics.some((c) => c.id === item)) {
      if (this.w.cosmetics.includes(item)) return this.fail(409, 'already_owned', 'Already owned');
      price = cat.cosmetics.find((c) => c.id === item)!.drachmae ?? 0;
    } else {
      const c = cat.consumables.find((x) => x.id === item);
      if (!c) return this.fail(404, 'unknown_item', 'Unknown item');
      const cap = this.cons.caps[item];
      if (cap.bought >= cap.cap) return this.fail(409, 'daily_cap', 'Daily limit reached');
      price = (cur === 'gold' ? c.gold : c.drachmae) ?? 0;
    }
    if (cur === 'gold' ? this.prof.resources.gold < price : this.w.drachmae < price) return this.fail(409, 'insufficient_funds', 'Not enough');
    if (cur === 'gold') this.prof.resources.gold -= price;
    else this.w.drachmae -= price;
    if (item === 'season_pass') this.p.premium = true;
    else if (item in CONSUMABLES) {
      const k = item as ConsumableKey;
      this.cons.inventory[k] = (this.cons.inventory[k] ?? 0) + 1;
      this.cons.caps[k].bought++;
    } else this.w.cosmetics.push(item);
    this.w.ledger.unshift({ delta: cur === 'drachmae' ? -price : 0, kind: 'spend', ref: item, at: this.now });
    return this.ok({ order: { requestId: `d${++this.seq}`, item, qty: 1, currency: cur, price, season: 3, at: this.now }, replayed: false, drachmae: this.w.drachmae });
  }
  equipCosmetic(slot: string, id: string | null) {
    if (id) this.w.loadout[slot] = id;
    else delete this.w.loadout[slot];
    return this.ok({ loadout: this.w.loadout });
  }
  pass() {
    return this.ok(this.p);
  }
  claimPass(tier: number, track: 'free' | 'premium') {
    const t = this.p.tiers[tier - 1];
    if (!t || tier > this.p.tier || (track === 'premium' && !this.p.premium)) return this.fail(409, 'locked', 'Locked');
    const replayed = this.p.claimed.some((c) => c.tier === tier && c.track === track);
    if (!replayed) this.p.claimed.push({ tier, track });
    const reward = track === 'free' ? t.free : t.premium;
    if (!replayed && reward.kind === 'drachmae') this.w.drachmae += reward.amount;
    if (!replayed && reward.kind === 'gold') this.prof.resources.gold += reward.amount;
    return this.ok({ reward, replayed });
  }
  consumables() {
    return this.ok(this.cons);
  }
  useConsumable(id: ConsumableKey) {
    const n = this.cons.inventory[id] ?? 0;
    if (n <= 0) return this.fail(409, 'none_left', 'None left');
    this.cons.inventory[id] = n - 1;
    return this.ok({ inventory: this.cons.inventory });
  }
  profile() {
    return this.ok(this.prof);
  }
  async buyPack(id: string): Promise<PackResult> {
    const p = demoCatalog().packs.find((x) => x.id === id);
    if (!p) return 'failed';
    this.w.drachmae += p.drachmae;
    this.w.ledger.unshift({ delta: p.drachmae, kind: 'pack', ref: id, at: this.now });
    return 'credited';
  }
}
