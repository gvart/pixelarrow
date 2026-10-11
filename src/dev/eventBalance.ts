/**
 * Event deck balance (headless, EV-02): design/gdd/campaign-events.md F2 (the
 * EV table and the dominance check) and "Balance targets" (gold per battle,
 * events per battle), measured on the starter deck WITH THE FLAG ON. The
 * shipped deck is off (EVENT_DECK_ENABLED, V5-070), and `npm run balance`
 * doesn't import this module, so its report is unchanged. Run it with:
 *
 *   node -e "import('vite').then(async v => { const { module: m } = await v.runnerImport('/src/dev/eventBalance.ts', { root: process.cwd(), configFile: false, logLevel: 'error', server: { hmr: false } }); console.log(m.eventBalanceReport(200)); })"
 *
 * F2 weights: 1 gold = 1, 1 food = 2, 1 man = 60, 1 wound-hour = -1. The
 * GDD gives no weight for XP, gear, intel, retrains, prices or follow-ups;
 * EV_ASSUME names the ones used here (docs/v5/balance/EV-02.md).
 */
import type { BalanceRow } from './balance';
import { Campaign, captainBounty } from '../game/campaign';
import { BASE_ITEMS, VALUE_MULT, type Rarity } from '../data/items';
import { retrainCost } from '../data/perks';
import { xpToNext } from '../data/units';
import type { BandMods, Effect, EventChoice, EventDef, EventTrigger } from '../data/events';
import { NARRATIVE_CARDS, STARTER_DECK, liveDeck } from '../data/eventDeck';
import { EV_KEY } from '../data/events';
import { Rng } from '../sim/rng';

/** F2's fixed weights. */
export const EV_WEIGHTS = { gold: 1, food: 2, man: 60, woundHour: -1 };

/** Values F2 doesn't fix, in gold. Each is sourced in the comment; EV-02.md lists them. */
export const EV_ASSUME = {
  /** Men an `all` effect lands on: the 8-man opening (V5-054). */
  army: 8,
  /** 1 XP on one man: a level-1 man needs 40 XP (xpToNext), worth about 20 g of a town hire's premium. */
  xp: 0.5,
  /** Wound-hours `heal` clears: BASELINE's 1.4 wounds x 36 h of an even battle. */
  healHours: 50,
  /** BASELINE: battle gold of a win, about 105 g (resolveBattle). */
  winGold: 105,
  /** BASELINE: XP a man earns in a won battle, about 30. */
  winXpPerMan: 30,
  /** BASELINE: about 2 permanent deaths in an even (1.0x) battle. */
  deathsEven: 2,
  /** A spawned captain's level for his bounty (ai-doctrines F3), a mid-campaign band. */
  captainLevel: 4,
  /** Lifting the fog over one lair: a fight found without a search. */
  reveal: 15,
  /** Lifting the fog in a radius around the party. */
  revealRadius: 10,
  /** One garrison man fewer at a lair (campaign-arc R2): a sixth of a death saved. */
  garrisonMan: 10,
  /** One free retrain: the drillmaster's tier-1 price (abilities F3). */
  retrain: retrainCost(1),
  /** One % on a settlement's prices: one ~100 g hire in a 5-day window. */
  pricePct: 1,
};

/** The value of a choice, per component (gold equivalents, higher is better); `risk` is minus the chance it goes badly. */
export interface EvParts {
  gold: number;
  food: number;
  men: number;
  wounds: number;
  xp: number;
  gear: number;
  intel: number;
  price: number;
  /** The best follow-up of a chain this choice starts (setFlag). */
  chain: number;
  risk: number;
}

const PARTS: readonly (keyof EvParts)[] = ['gold', 'food', 'men', 'wounds', 'xp', 'gear', 'intel', 'price', 'chain', 'risk'];
const zero = (): EvParts => ({ gold: 0, food: 0, men: 0, wounds: 0, xp: 0, gear: 0, intel: 0, price: 0, chain: 0, risk: 0 });
const add = (a: EvParts, b: EvParts, k = 1): EvParts => {
  const o = { ...a };
  for (const p of PARTS) o[p] += b[p] * k;
  return o;
};

/** The EV total: every part but risk (risk is a dimension of the dominance test, not gold). */
export function evTotal(v: EvParts): number {
  return PARTS.reduce((a, p) => (p === 'risk' ? a : a + v[p]), 0);
}

/** Mean value of a tier 1-2 base piece at `rarity`, full condition (the event item pool, campaign.ts applyEffect). */
export function itemWorth(rarity: Rarity): number {
  const pool = BASE_ITEMS.filter((d) => d.tier <= 2);
  return (pool.reduce((a, d) => a + d.value, 0) / pool.length) * VALUE_MULT[rarity];
}

/** A spawned band as F2 values it: p_win x (win gold + bountyMult x bounty) - deaths x 60, from its power ratio. */
export function bandFight(mods: BandMods): { pWin: number; gold: number; deaths: number } {
  const r = (mods.size ?? 1) * (1 + (mods.captain ? 0.15 : 0) + 0.1 * (mods.level ?? 0));
  const pWin = Math.max(0.05, Math.min(0.95, 0.5 - 1.25 * (r - 1)));
  const bounty = mods.captain ? captainBounty(EV_ASSUME.captainLevel, mods.bountyMult ?? 1) : 0;
  return { pWin, gold: pWin * (EV_ASSUME.winGold + bounty), deaths: EV_ASSUME.deathsEven * r };
}

function effectValue(e: Effect, deck: readonly EventDef[], seen: Set<string>): EvParts {
  const v = zero();
  const A = EV_ASSUME;
  switch (e.k) {
    case 'gold': v.gold = e.n; break;
    case 'food': v.food = e.n * EV_WEIGHTS.food; break;
    case 'supplies': v.gear = e.n; break;
    case 'recruit': {
      let xp = 0;
      for (let l = 1; l < e.level; l++) xp += xpToNext(l);
      v.men = e.n * EV_WEIGHTS.man;
      v.xp = e.n * xp * A.xp;
      break;
    }
    case 'xp': v.xp = e.n * (e.target === 'all' ? A.army : 1) * A.xp; break;
    case 'wound': v.wounds = e.hours * (e.target === 'all' ? A.army : 1) * EV_WEIGHTS.woundHour; break;
    case 'heal': v.wounds = A.healHours; break;
    case 'item': v.gear = itemWorth(e.rarity); break;
    case 'spawnBand': {
      const f = bandFight(e.mods);
      v.gold = f.gold;
      v.men = -f.deaths * EV_WEIGHTS.man;
      v.risk = -(1 - f.pWin);
      break;
    }
    case 'weakenGarrison': v.intel = e.n * A.garrisonMan; break;
    case 'reveal': v.intel = typeof e.at === 'object' ? A.revealRadius : A.reveal; break;
    case 'retrain': v.intel = A.retrain; break;
    case 'priceMod': v.price = -e.pct * A.pricePct * Math.min(1, e.days / 5); break;
    case 'nextBattle':
      if (e.bonus === 'gold') v.gold = A.winGold * 0.5;
      else if (e.bonus === 'xp') v.xp = A.army * A.winXpPerMan * 0.5 * A.xp;
      else v.gear = itemWorth('common');
      break;
    case 'setFlag': v.chain = chainValue(e.name, deck, seen); break;
    case 'closeSettlement':
    case 'clearFlag':
      break;
  }
  return v;
}

/** The follow-up a flag starts: the best choice of the flag event it makes due (0 if none, e.g. a flag the arc reads). */
function chainValue(flag: string, deck: readonly EventDef[], seen: Set<string>): number {
  const next = deck.find((d) => d.after?.flag === flag);
  if (!next || seen.has(next.id)) return 0;
  const s = new Set(seen).add(next.id);
  return Math.max(...next.choices.map((c) => evTotal(choiceValue(c, deck, s))));
}

const sum = (es: readonly Effect[], deck: readonly EventDef[], seen: Set<string>) =>
  es.reduce((a, e) => add(a, effectValue(e, deck, seen)), zero());

/** A choice's expected value: its cost, then its effects (or, for a chance, p x effects + (1-p) x fail, with the failure's odds as risk). */
export function choiceValue(c: EventChoice, deck: readonly EventDef[] = STARTER_DECK, seen = new Set<string>()): EvParts {
  let v = sum(c.cost ?? [], deck, seen);
  if (!c.chance) return add(v, sum(c.effects, deck, seen));
  const ok = sum(c.effects, deck, seen);
  const fail = sum(c.chance.fail, deck, seen);
  v = add(add(v, ok, c.chance.p), fail, 1 - c.chance.p);
  if (evTotal(fail) < evTotal(ok)) v.risk -= 1 - c.chance.p;
  return v;
}

/** `a` dominates `b`: at least as good in every part, better in one (F2). */
export function dominates(a: EvParts, b: EvParts): boolean {
  const eps = 1e-9;
  return PARTS.every((p) => a[p] >= b[p] - eps) && PARTS.some((p) => a[p] > b[p] + eps);
}

export interface EvRow {
  id: string;
  key: string;
  parts: EvParts;
  ev: number;
  /** The choice of the same event that dominates this one, if any. */
  dominatedBy: string | null;
}

/** The EV table: every choice of every event, with its dominator (F2). */
export function evTable(deck: readonly EventDef[] = STARTER_DECK): EvRow[] {
  const rows: EvRow[] = [];
  for (const d of deck) {
    const vals = d.choices.map((c) => ({ key: c.key, parts: choiceValue(c, deck, new Set([d.id])) }));
    for (const v of vals) {
      const by = vals.find((o) => o !== v && dominates(o.parts, v.parts));
      rows.push({ id: d.id, key: v.key, parts: v.parts, ev: evTotal(v.parts), dominatedBy: by ? by.key : null });
    }
  }
  return rows;
}

// ------------------------------------------------------------------ the scripted campaign (flag ON)

export type Policy = 'random' | 'greedy';

/** F1's typical day (campaign-events.md F1): march hours, arrivals, camp nights, battles, wins per battle. */
export const SCRIPT_DAY = { marchHours: 10, arrivals: 0.7, camps: 0.3, battles: 1.2, winRate: 1.0 / 1.2 };

export interface EconomyResult {
  worlds: number;
  battles: number;
  days: number;
  events: number;
  byTrigger: Record<EventTrigger, number>;
  /** Gold the events themselves paid or took (the purse delta of each resolution). */
  gold: number;
  /** Extra bounty the deck's `bountyMult` adds over a normal captain, in F2 terms (expected). */
  bountyExtra: number;
  xp: number;
  woundHours: number;
  recruits: number;
  /** Bands the deck sent after the player. */
  fights: number;
  /** F2 expected deaths in those fights. */
  deaths: number;
  gear: number;
  picks: Record<string, number>;
}

/**
 * `worlds` campaigns of `battles` battles each, on F1's typical day, through
 * the real engine (World.tryEvent: rates, pacing cap, gap, cooldowns, flags)
 * and the real resolution (Campaign.chooseEvent). The player picks per
 * `policy`: a uniform pick among the choices he can take, or the best EV.
 * Battles aren't simulated: each win pays BASELINE's 105 g into the purse
 * (not counted as event gold) and fires the after-battle check; spawned
 * bands are valued with F2 and removed. The roster is trimmed to 12 men
 * after each battle (deaths and churn) so recruits stay possible.
 */
export function eventEconomy(worlds: number, battles = 40, policy: Policy = 'random'): EconomyResult {
  const r: EconomyResult = {
    worlds, battles: 0, days: 0, events: 0,
    byTrigger: { march: 0, arrive_village: 0, arrive_town: 0, camp: 0, after_battle: 0, flag: 0 },
    gold: 0, bountyExtra: 0, xp: 0, woundHours: 0, recruits: 0, fights: 0, deaths: 0, gear: 0, picks: {},
  };
  const cumXp = (h: { level: number; xp: number }) => {
    let x = h.xp;
    for (let l = 1; l < h.level; l++) x += xpToNext(l);
    return x;
  };
  for (let seed = 1; seed <= worlds; seed++) {
    const c = Campaign.fresh(seed);
    const w = c.world;
    w.deck = liveDeck(true);
    w.s.parties = [];
    w.s.lastSpawn = 1e12;
    const rng = new Rng((seed * 2654435761) ^ 0xe7e7);
    const towns = w.map.settlements.filter((s) => s.kind === 'town');
    const villages = w.map.settlements.filter((s) => s.kind === 'village');
    let fought = 0;
    let marchH = 0;
    let day = 0;
    const tryAt = (hour: number, trigger: EventTrigger, key: string, sid = -1) => {
      w.s.time = day * 24 + hour;
      if (sid >= 0 && (w.s.eventCd[EV_KEY.arrive(sid)] ?? -Infinity) > w.today) return;
      const id = w.tryEvent(trigger, key, c.playerInfo());
      if (!id) return;
      if (sid >= 0) w.s.eventCd[EV_KEY.arrive(sid)] = w.today + 3;
      resolve(trigger);
    };
    const resolve = (trigger: EventTrigger) => {
      const pe = c.pendingEvent()!;
      const open = pe.def.choices.filter((ch) => !pe.choices.find((x) => x.key === ch.key)!.blocked);
      const choice = policy === 'random' || open.length < 2
        ? open[rng.int(0, open.length - 1)]
        : open.reduce((b, ch) => (evTotal(choiceValue(ch)) > evTotal(choiceValue(b)) ? ch : b), open[0]);
      const before = new Map(c.data.heroes.map((h) => [h.id, { xp: cumXp(h), wound: h.wound ?? 0 }]));
      const gold0 = c.data.gold;
      const men0 = c.data.heroes.length;
      const stash0 = c.data.stash.length;
      const parties0 = w.s.parties.length;
      const res = c.chooseEvent(choice.key)!;
      r.events++;
      r.byTrigger[trigger]++;
      r.picks[`${res.id}:${res.key}`] = (r.picks[`${res.id}:${res.key}`] ?? 0) + 1;
      r.gold += c.data.gold - gold0;
      r.recruits += Math.max(0, c.data.heroes.length - men0);
      for (const h of c.data.heroes) {
        const b = before.get(h.id);
        if (!b) continue;
        r.xp += cumXp(h) - b.xp;
        r.woundHours += (h.wound ?? 0) - b.wound;
      }
      for (let i = stash0; i < c.data.stash.length; i++) r.gear += itemWorth(c.data.stash[i].rarity);
      const sent = (res.ok ? choice.effects : choice.chance!.fail).filter((e): e is Extract<Effect, { k: 'spawnBand' }> => e.k === 'spawnBand');
      for (const e of sent.slice(0, w.s.parties.length - parties0)) {
        const f = bandFight(e.mods);
        const mult = e.mods.bountyMult ?? 1;
        r.fights++;
        r.deaths += f.deaths;
        if (e.mods.captain && mult > 1) r.bountyExtra += f.pWin * (captainBounty(EV_ASSUME.captainLevel, mult) - captainBounty(EV_ASSUME.captainLevel));
      }
      w.s.parties.length = parties0;
    };
    while (fought < battles) {
      w.addFood(20);
      for (const h of c.data.heroes) h.wound = Math.max(0, (h.wound ?? 0) - 24);
      tryAt(1, 'flag', `d${day}`);
      marchH += SCRIPT_DAY.marchHours;
      for (let k = 0; marchH >= 12; k++, marchH -= 12) tryAt(6 + 6 * k, 'march', `m${day}:${k}`);
      const n = Math.floor(SCRIPT_DAY.battles) + (rng.chance(SCRIPT_DAY.battles % 1) ? 1 : 0);
      for (let i = 0; i < n && fought < battles; i++) {
        fought++;
        if (c.data.heroes.length > 12) c.data.heroes.length = 12;
        if (!rng.chance(SCRIPT_DAY.winRate)) continue;
        c.data.gold += EV_ASSUME.winGold;
        tryAt(9 + i, 'after_battle', `b${fought}`);
      }
      if (rng.chance(SCRIPT_DAY.arrivals)) {
        const pool = rng.chance(0.5) ? towns : villages;
        const st = pool[rng.int(0, pool.length - 1)];
        w.s.inside = st.id;
        tryAt(14, st.kind === 'town' ? 'arrive_town' : 'arrive_village', `${st.id}:${day}`, st.id);
        w.s.inside = -1;
      }
      if (rng.chance(SCRIPT_DAY.camps)) tryAt(23.5, 'camp', `c${day}`);
      day++;
    }
    r.battles += fought;
    r.days += day;
  }
  return r;
}

// ------------------------------------------------------------------ report

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);

/** The GDD's balance rows for the deck (flag on), for docs/v5/balance/EV-02.md. */
export function eventRows(worlds: number): BalanceRow[] {
  const table = evTable();
  const dominated = table.filter((x) => x.dominatedBy);
  const flagSetters = STARTER_DECK.filter((d) =>
    d.choices.some((c) => [...c.effects, ...(c.chance?.fail ?? [])].some((e) => e.k === 'setFlag' && STARTER_DECK.some((o) => o.after?.flag === e.name))));
  const rows: BalanceRow[] = [
    { label: `EV table: dominated choices (${table.length} choices)`, measured: dominated.length === 0 ? '0' : `${dominated.length}: ${dominated.map((x) => `${x.id}:${x.key}`).join(', ')}`, target: '0 (F2)' },
    { label: 'Events that set a flag a later event reads', measured: `${flagSetters.length}/${STARTER_DECK.length}`, target: '>= 1/3 (R5)' },
    { label: 'Events with 2-3 choices, at least one free', measured: `${STARTER_DECK.filter((d) => NARRATIVE_CARDS.includes(d.id) || (d.choices.length >= 2 && d.choices.length <= 3 && d.choices.some((c) => !c.cost?.length))).length}/${STARTER_DECK.length}`, target: 'all (R1, R4.5; host_musters is R6 narrative)' },
  ];
  for (const policy of ['random', 'greedy'] as Policy[]) {
    const e = eventEconomy(worlds, 40, policy);
    const perB = (x: number) => x / e.battles;
    const perD = (x: number) => x / e.days;
    rows.push(
      { label: `[${policy}] events per battle (${worlds} x 40 battles, ${f1(e.days / worlds)} days)`, measured: f2(perB(e.events)), target: '0.30-0.50' },
      { label: `[${policy}] net event gold per battle`, measured: `${f1(perB(e.gold))} g`, target: '-10..+25 g' },
      { label: `[${policy}]   + bountyMult extra (expected)`, measured: `${f1(perB(e.gold + e.bountyExtra))} g`, target: '-10..+25 g' },
      { label: `[${policy}] event gold / XP per day`, measured: `${f1(perD(e.gold))} g / ${f1(perD(e.xp))} XP`, target: 'none stated (battle: ~105 g, ~240 XP a win)' },
      { label: `[${policy}] gear per battle (g-eq) / recruits per battle`, measured: `${f1(perB(e.gear))} g / ${f2(perB(e.recruits))}`, target: 'none stated' },
      { label: `[${policy}] risk: event fights per battle, F2 deaths, wound-h per battle`, measured: `${f2(perB(e.fights))} / ${f2(perB(e.deaths))} / ${f1(perB(e.woundHours))}`, target: 'none stated' },
    );
  }
  return rows;
}

/** The EV table and the rows, as text. */
export function eventBalanceReport(worlds = 200): string {
  const out: string[] = ['## Event deck (EV-02, flag ON)', '', '| Event | Choice | EV | gold | food | men | wounds | xp | gear | intel | price | chain | risk | dominated by |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |'];
  for (const x of evTable()) {
    const p = x.parts;
    out.push(`| ${x.id} | ${x.key} | ${f1(x.ev)} | ${PARTS.map((k) => (k === 'risk' ? f2(p[k]) : f1(p[k]))).join(' | ')} | ${x.dominatedBy ?? '-'} |`);
  }
  out.push('', '| Row | Measured | Target |', '| --- | --- | --- |');
  for (const row of eventRows(worlds)) out.push(`| ${row.label} | ${row.measured} | ${row.target} |`);
  return out.join('\n');
}
