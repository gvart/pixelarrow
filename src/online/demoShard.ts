/**
 * A local, deterministic stand-in for the online shard: what /api/online
 * would answer for a player some days into a season (own land and army, a
 * clan mate, a rival with a garrison, a rival army on the march, neutral
 * hexes all around). The map scene uses it when started with
 * `{ preview: ... }` (layout check, screenshots, offline art review); it
 * never talks to the server and changes nothing.
 */
import { capitals, hexDistance, hexId, hexInfo, hexesWithin, MARCH_MINUTES, neighbours, siteLabel, SHARD_RADIUS, type Axial, type HexInfo } from './hex';
import { defenderFor, neutralDefenders, WINS_TO_CLAIM } from './defenders';
import { hexIncome, ONLINE_RULES, starterOnlineArmy, type Resources } from './rules';
import { heroPower } from '../sim/stats';
import type { BossView, HexDetail, HexView, MapView, MerchantView, ProfileView } from './client';
import { capKey, merchantAt, merchantDay, merchantStock, MERCHANT, nextReset, offerPrice, regionOf, tradingPosts, type MerchantKind } from './merchants';
import { ENCOUNTERS, MYTHS, lairLevel, mythHeroes, type EncounterId } from '../data/beasts';
import { bossMaxHp } from './lairs';

export const DEMO = { seed: 42, radius: SHARD_RADIUS, me: 101, mate: 102, rival: 201, raider: 202, clan: 7, rivalClan: 9 };

const R = (gold: number, food: number, wood: number, bronze: number, recruits: number): Resources => ({ gold, food, wood, bronze, recruits });

function info(h: Axial): HexInfo {
  return hexInfo(DEMO.seed, h.q, h.r, DEMO.radius);
}

/** Nearest plain land to `near` (a home spot). */
function homeNear(near: Axial): Axial {
  for (let d = 0; d < 8; d++)
    for (const h of hexesWithin(near, d, DEMO.radius)) {
      const i = info(h);
      if ((i.type === 'plains' || i.type === 'farmland') && !i.fort && !i.capital && !capitals(DEMO.radius).some((c) => hexDistance(c, h) <= 3)) return h;
    }
  return near;
}

/** The first `n` passable hexes around a home (breadth first). */
function landAround(home: Axial, n: number, taken: Set<string>): Axial[] {
  const out: Axial[] = [];
  const seen = new Set<string>([hexId(home.q, home.r)]);
  const queue: Axial[] = [home];
  while (queue.length && out.length < n) {
    const h = queue.shift()!;
    const k = hexId(h.q, h.r);
    if (!taken.has(k) && info(h).passable) {
      out.push(h);
      taken.add(k);
    }
    for (const nb of neighbours(h, DEMO.radius)) {
      const nk = hexId(nb.q, nb.r);
      if (!seen.has(nk) && hexDistance(nb, home) <= 2) {
        seen.add(nk);
        queue.push(nb);
      }
    }
  }
  return out;
}

export interface DemoShard {
  now: number;
  profile: ProfileView;
  map: MapView;
  owners: Map<string, { owner: number; clan: number | null; home: boolean; garrison?: number }>;
  hex(h: Axial): HexDetail;
  /** Interesting hexes to stage the panel on. */
  spots: { own: Axial; neutralNext: Axial; neutralFar: Axial; rival: Axial; town: Axial | null; lair: Axial | null; boss: Axial | null; post: Axial | null; market: Axial | null };
  /**
   * A merchant's stock (GET /merchant). `stage` fakes the situation for the
   * layout check: 'held' = in reach with the clan's discount, 'far' = out of
   * reach; otherwise the honest answer for the demo army.
   */
  merchant(h: Axial, stage?: 'held' | 'far'): MerchantView | null;
  /** The world boss in sight (GET /boss). */
  bosses: BossView[];
}

export function demoShard(now = Date.UTC(2026, 9, 20, 18, 0, 0)): DemoShard {
  const me = homeNear({ q: 23, r: -28 });
  const taken = new Set<string>();
  const mine = landAround(me, 6, taken);
  // the clan mate settled by the sea (so the preview shows water too)
  const sea = hexesWithin(me, 8, DEMO.radius).filter((h) => info(h).type === 'water' && hexDistance(h, me) >= 4).sort((a, b) => hexDistance(a, me) - hexDistance(b, me))[0];
  const mateHome = homeNear(sea ?? { q: me.q + 3, r: me.r + 3 });
  const mates = landAround(mateHome, 4, taken);
  const rivalHome = homeNear({ q: me.q - 5, r: me.r + 1 });
  const rivals = landAround(rivalHome, 5, taken);
  const owners = new Map<string, { owner: number; clan: number | null; home: boolean; garrison?: number }>();
  mine.forEach((h, i) => owners.set(hexId(h.q, h.r), { owner: DEMO.me, clan: DEMO.clan, home: i === 0, garrison: i === 0 ? 2 : undefined }));
  mates.forEach((h, i) => owners.set(hexId(h.q, h.r), { owner: DEMO.mate, clan: DEMO.clan, home: i === 0, garrison: i === 0 ? 3 : undefined }));
  rivals.forEach((h, i) => owners.set(hexId(h.q, h.r), { owner: DEMO.rival, clan: DEMO.rivalClan, home: i === 0 }));

  // Armies: yours at home, the clan mate's beside its land, a raider marching through your sight.
  const mateArmy = mates[mates.length - 1] ?? mateHome;
  const sources = [...mine, ...mates, me, mateArmy];
  const visible = new Map<string, Axial>();
  for (const s of sources) for (const h of hexesWithin(s, ONLINE_RULES.sight, DEMO.radius)) visible.set(hexId(h.q, h.r), h);

  const hexes: HexView[] = [...visible.values()].map((h) => {
    const s = info(h);
    const o = owners.get(hexId(h.q, h.r));
    const v: HexView = {
      q: h.q,
      r: h.r,
      type: s.type,
      tier: s.tier,
      fort: s.fort,
      capital: s.capital,
      coast: s.coast,
      site: siteLabel(s.site),
      occupant: o ? 'player' : s.passable ? 'npc' : 'none',
      owner: o?.owner ?? null,
      clan: o?.clan ?? null,
      home: o?.home ?? false,
    };
    if (o?.garrison && o.clan === DEMO.clan) v.garrison = o.garrison;
    if (!o && s.passable) v.def = defenderFor(DEMO.seed, s).id;
    return v;
  });
  // Trading posts in sight (the seeded ones; the demo invents a harbour when none is near).
  const posts = new Map<string, MerchantKind>();
  for (const tp of tradingPosts(DEMO.seed, DEMO.radius)) if (visible.has(hexId(tp.q, tp.r))) posts.set(hexId(tp.q, tp.r), tp.kind);
  if (!posts.size) {
    const spot = hexes.find((h) => h.coast && h.owner === null && h.occupant === 'npc' && h.type !== 'town' && !h.fort && hexDistance(h, me) >= 2);
    if (spot) posts.set(hexId(spot.q, spot.r), 'harbour');
  }
  for (const h of hexes) {
    const kind = posts.get(hexId(h.q, h.r));
    if (kind === 'harbour' || kind === 'crossroads') h.post = kind;
  }

  // Beast lairs in sight (a few of every kind, for the art) and a world boss on the coast.
  const free = hexes.filter((h) => h.owner === null && h.occupant === 'npc' && !h.fort && !h.capital && h.type !== 'town' && !h.post && hexDistance(h, me) >= 2).sort((a, b) => hexDistance(a, me) - hexDistance(b, me) || a.q - b.q || a.r - b.r);
  const bossHex = free.find((h) => h.coast) ?? free[free.length - 1];
  const lairs: Axial[] = [];
  const kinds: EncounterId[] = ['hydra', 'cyclops', 'minotaur', 'chimera', 'harpies', 'nemean_lion'];
  for (const h of free) {
    if (lairs.length >= kinds.length) break;
    if (h === bossHex || lairs.some((l) => hexDistance(l, h) < 2) || hexDistance(h, bossHex) < 2) continue;
    const enc = kinds[lairs.length];
    h.occupant = 'beast';
    h.lair = enc;
    h.lairLevel = lairLevel(enc, Math.min(5, h.tier + 1));
    delete h.def;
    lairs.push(h);
  }
  if (bossHex) {
    bossHex.occupant = 'beast';
    bossHex.boss = bossHex.coast ? 'kraken' : 'titan';
    delete bossHex.def;
  }

  const known = (h: Axial) => visible.has(hexId(h.q, h.r));
  const raidPath: [number, number][] = [];
  {
    // a straight-ish walk across the visible land, west to east, two rows south of home
    let cur = { q: me.q - 4, r: me.r + 2 };
    for (let i = 0; i < 9; i++) {
      if (known(cur) && info(cur).passable && !owners.has(hexId(cur.q, cur.r))) raidPath.push([cur.q, cur.r]);
      cur = { q: cur.q + 1, r: cur.r };
    }
  }
  const at: number[] = [];
  raidPath.forEach((p, i) => at.push(i === 0 ? now - 4 * 60_000 : at[i - 1] + MARCH_MINUTES[info({ q: p[0], r: p[1] }).type] * 60_000));

  const armies: MapView['armies'] = [
    { player: DEMO.me, q: me.q, r: me.r, dest: null, arriveAt: null, path: null },
    { player: DEMO.mate, q: mateArmy.q, r: mateArmy.r, dest: null, arriveAt: null, path: null },
  ];
  if (raidPath.length >= 2) {
    const last = raidPath[raidPath.length - 1];
    armies.push({ player: DEMO.raider, q: raidPath[0][0], r: raidPath[0][1], dest: { q: last[0], r: last[1] }, arriveAt: at[at.length - 1], path: raidPath, at });
  }

  const heroes = starterOnlineArmy(DEMO.seed, { nextId: 1 }, 'demo_');
  const profile: ProfileView = {
    season: { id: 3, startedAt: now - 27 * 86_400_000, endsAt: now + 63 * 86_400_000 },
    shard: { id: 1, radius: DEMO.radius },
    now,
    resources: R(1240, 386, 212, 64, 3.4),
    energy: 74,
    energyMax: ONLINE_RULES.energyMax,
    home: me,
    army: { q: me.q, r: me.r, marching: false, dest: null, arriveAt: null, path: null, at: null },
    formations: ['line', 'skirmish', 'line', 'column'],
    heroes: heroes.map((hero, i) => ({ hero, garrison: i >= heroes.length - 1 ? me : null, woundedUntil: 0, busy: false })),
    stash: [],
    clan: { id: DEMO.clan, name: 'Kites of Pella', tag: 'KIT', role: 'officer' },
    battles: 14,
    wins: 11,
    income: { pending: R(46, 18, 12, 3, 0.4), hexes: mine.length },
  };
  const map: MapView = {
    season: { id: 3, endsAt: profile.season.endsAt },
    shard: profile.shard,
    now,
    you: { id: DEMO.me, clan: DEMO.clan, home: me, army: profile.army },
    hexes,
    armies,
    players: { [DEMO.me]: 'Ana', [DEMO.mate]: 'Brasidas', [DEMO.rival]: 'Kleon', [DEMO.raider]: 'Phormion' },
    clans: { [DEMO.clan]: { name: 'Kites of Pella', tag: 'KIT' }, [DEMO.rivalClan]: { name: 'Sons of Argos', tag: 'ARG' } },
  };

  // the world boss some raids into the season: wounded, an arm cut, a leaderboard
  const bosses: BossView[] = bossHex
    ? [
        (() => {
          const boss = bossHex.boss as EncounterId;
          const level = ENCOUNTERS[boss].levels[0];
          const max = bossMaxHp(boss, level);
          return {
            boss,
            q: bossHex.q,
            r: bossHex.r,
            level,
            hp: Math.round(max.body * 0.62),
            maxHp: max.body,
            parts: Array.from({ length: max.parts }, (_, i) => (i === 2 ? 0 : max.part)),
            partMax: max.part,
            status: 'active' as const,
            killedAt: null,
            segment: ENCOUNTERS[boss].segment ?? 120,
            top: [
              { player: DEMO.mate, name: 'Brasidas', clan: 'KIT', damage: 2140, raids: 6 },
              { player: DEMO.rival, name: 'Kleon', clan: 'ARG', damage: 1630, raids: 5 },
              { player: DEMO.me, name: 'Ana', clan: 'KIT', damage: 980, raids: 3 },
              { player: DEMO.raider, name: 'Phormion', clan: null, damage: 410, raids: 2 },
            ],
            clans: [
              { clan: DEMO.clan, tag: 'KIT', name: 'Kites of Pella', damage: 3120 },
              { clan: DEMO.rivalClan, tag: 'ARG', name: 'Sons of Argos', damage: 1630 },
            ],
            you: { damage: 980, raids: 3, loot: null },
          };
        })(),
      ]
    : [];

  const hex = (h: Axial): HexDetail => {
    const s = info(h);
    const view = hexes.find((x) => x.q === h.q && x.r === h.r) ?? { q: h.q, r: h.r, type: s.type, tier: s.tier, fort: s.fort, capital: s.capital, coast: s.coast, site: siteLabel(s.site), occupant: 'npc', owner: null, clan: null, home: false };
    const o = owners.get(hexId(h.q, h.r));
    const ours = !!o && o.clan === DEMO.clan;
    const adjacent = hexDistance(me, h) === 1;
    let defenders: HexDetail['defenders'] = null;
    let siege: HexDetail['siege'] = null;
    if (view.lair) {
      const enc = view.lair as EncounterId;
      const beasts = mythHeroes(enc, view.lairLevel ?? 3);
      defenders = { count: beasts.length, power: Math.round(beasts.reduce((x, b) => x + heroPower(b), 0)), kind: 'beast' };
      siege = { wins: 0, needed: 1, label: MYTHS[ENCOUNTERS[enc].body].name };
    } else if (view.boss) {
      defenders = null;
    } else if (!o && s.passable) {
      const npc = neutralDefenders(DEMO.seed, s, 0, DEMO.radius);
      defenders = { count: npc.length, power: Math.round(npc.reduce((a, x) => a + heroPower(x), 0)), kind: 'npc' };
      const needed = WINS_TO_CLAIM[s.tier] ?? 1;
      siege = { wins: needed > 1 ? 1 : 0, needed, label: view.occupant === 'beast' ? 'A hydra and its brood' : defenderFor(DEMO.seed, s).label };
    } else if (o && !ours && adjacent) defenders = { count: 4, power: 212, kind: 'garrison' };
    return {
      hex: view,
      ownerName: o ? map.players[String(o.owner)] ?? null : null,
      clan: o?.clan ? { id: o.clan, ...map.clans[String(o.clan)] } : null,
      yields: hexIncome(s),
      marchMinutes: MARCH_MINUTES[s.type],
      mine: o?.owner === DEMO.me,
      ours,
      locked: false,
      garrison: ours ? [] : null,
      formations: null,
      defenders,
      siege,
      income: o?.owner === DEMO.me ? R(12, 6, 4, 0, 0.1) : null,
      canAttack: s.passable && !ours && !o?.home && adjacent && !view.boss,
      canGarrison: ours && me.q === h.q && me.r === h.r,
      lair: view.lair ? { enc: view.lair, level: view.lairLevel ?? 3, tier: Math.min(5, s.tier + 1), home: true, returnsAt: null } : null,
      boss: view.boss ?? null,
      merchant: view.post ?? merchantAt(DEMO.seed, s, DEMO.radius),
    };
  };

  const merchant = (h: Axial, stage?: 'held' | 'far'): MerchantView | null => {
    const s = info(h);
    const view = hexes.find((x) => x.q === h.q && x.r === h.r);
    const kind: MerchantKind | null = view?.post ?? merchantAt(DEMO.seed, s, DEMO.radius);
    if (!kind) return null;
    const o = owners.get(hexId(h.q, h.r));
    const held = stage === 'held';
    const discount = held || (!!o && o.clan === DEMO.clan);
    const reach = stage === 'far' ? false : held || discount || hexDistance(profile.army, h) <= 1;
    const holder = held ? DEMO.mate : o?.owner ?? null;
    const day = merchantDay(now);
    // some of today's caps already used: a war horn bought out, a salve bought
    const bought: Record<string, number> = { war_horn: 2, healing_salve: 1 };
    return {
      hex: { q: h.q, r: h.r },
      kind,
      region: regionOf(h, DEMO.radius),
      day,
      now,
      resetsAt: nextReset(now),
      reach,
      discount,
      discountRate: MERCHANT.ownerDiscount,
      holderCutRate: MERCHANT.ownerCut,
      holder: holder ? { id: holder, name: map.players[String(holder)] ?? null, you: holder === DEMO.me } : null,
      earned: 0,
      gold: profile.resources.gold,
      drachmae: 340,
      offers: merchantStock(DEMO.seed, h, kind, day, DEMO.radius).map((x) => ({
        ...x,
        price: { gold: offerPrice(x, 'gold', discount), drachmae: offerPrice(x, 'drachmae', discount) },
        bought: bought[capKey(x)] ?? 0,
      })),
    };
  };

  const neutralNext = neighbours(me, DEMO.radius).find((n) => !owners.has(hexId(n.q, n.r)) && info(n).passable) ?? mine[1];
  const neutralFar = hexes.find((x) => x.owner === null && x.occupant === 'npc' && hexDistance(x, me) === 3) ?? neutralNext;
  const town = hexes.find((x) => (x.type === 'town' || x.fort) && x.owner === null) ?? null;
  const rivalSeen = hexes.filter((x) => x.owner === DEMO.rival).sort((a, b) => hexDistance(a, me) - hexDistance(b, me))[0];
  const postSpot = hexes.find((x) => x.post) ?? null;
  const market = hexes.find((x) => x.type === 'town') ?? null;
  return { now, profile, map, owners, hex, merchant, bosses, spots: { own: mine[1] ?? me, neutralNext, neutralFar, rival: rivalSeen ?? rivals[0], town, lair: lairs[0] ?? null, boss: bossHex ?? null, post: postSpot, market } };
}
