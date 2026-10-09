import { beforeEach, describe, expect, it } from 'vitest';
import type { Hero } from '../../src/data/units';
import type { Item } from '../../src/data/items';
import { DUEL_RULES, catalogue, dailyOffers, gearPrice, recruitPrice, utcDay } from '../../src/duel/rules';
import { LADDER, chestReward, ladderFloor, ladderStars } from '../../src/duel/ladder';
import type { BattleSetup } from '../../src/sim/types';
import { devLogin } from './helpers';
import { DB, fresh, getJson, openDuellist, play, post } from './onlineHelpers';

beforeEach(fresh);

let rid = 0;
const reqId = () => `duel-${Date.now().toString(36)}-${rid++}`;

interface DuelProfile {
  glory: number;
  xp: number;
  level: number;
  ladder: { cleared: number; farmLeft: number; farmCap: number };
  team: string[];
  formations: string[];
  heroes: Hero[];
  stash: Item[];
  battles: number;
  wins: number;
  bought: string[];
}

interface LadderTicket {
  ticket: string;
  floor: number;
  setup: BattleSetup;
  team: Hero[];
  enemies: Hero[];
  resumed?: boolean;
}

const open = (tg: number) => openDuellist<DuelProfile>(tg);

describe('duel profile', () => {
  it('opens once with the starter roster, a full team and starting Glory', async () => {
    const { token, profile } = await open(9101);
    expect(profile.glory).toBe(DUEL_RULES.startGlory);
    expect(profile.level).toBe(1);
    expect(profile.heroes.map((h) => h.cls)).toEqual(['hoplite', 'hoplite', 'archer', 'archer', 'peltast', 'slinger']);
    expect(profile.team).toEqual(profile.heroes.map((h) => h.id));
    expect(profile.ladder).toMatchObject({ cleared: 0, farmLeft: DUEL_RULES.farmGloryPerDay });
    const again = await post<DuelProfile>('/api/duel/profile', token);
    expect(again.body.heroes.map((h) => h.id)).toEqual(profile.heroes.map((h) => h.id));
    expect((await getJson<DuelProfile>('/api/duel/profile', token)).body.glory).toBe(DUEL_RULES.startGlory);
  });

  it('is separate from the war map: no online profile needed, and nothing to do before opening', async () => {
    const { token } = await devLogin(9102);
    expect((await getJson('/api/duel/profile', token)).status).toBe(409);
    await open(9102);
    expect((await getJson('/api/online/profile', token)).status).toBe(409);
  });
});

describe('duel roster', () => {
  it('recruits for Glory, once per request id, and only unlocked classes', async () => {
    const { token } = await open(9111);
    const id = reqId();
    const a = await post<{ hero: Hero; replayed: boolean; profile: DuelProfile }>('/api/duel/recruit', token, { cls: 'hoplite', requestId: id });
    expect(a.status).toBe(200);
    expect(a.body.hero.cls).toBe('hoplite');
    expect(a.body.profile.glory).toBe(DUEL_RULES.startGlory - recruitPrice('hoplite'));
    const again = await post<{ hero: Hero; replayed: boolean; profile: DuelProfile }>('/api/duel/recruit', token, { cls: 'hoplite', requestId: id });
    expect(again.body.replayed).toBe(true);
    expect(again.body.hero.id).toBe(a.body.hero.id);
    expect(again.body.profile.glory).toBe(a.body.profile.glory);
    expect(again.body.profile.heroes).toHaveLength(7);
    expect((await post('/api/duel/recruit', token, { cls: 'archer', requestId: id })).status).toBe(409);
    expect((await post<{ error: { code: string } }>('/api/duel/recruit', token, { cls: 'companion', requestId: reqId() })).body.error.code).toBe('locked');
    expect((await post<{ error: { code: string } }>('/api/duel/recruit', token, { cls: 'wolf', requestId: reqId() })).body.error.code).toBe('not_recruitable');
    expect((await post('/api/duel/recruit', token, { cls: 'nope', requestId: reqId() })).status).toBe(400);
    // 100 Glory left: a hoplite empties the purse, an archer is then too dear.
    expect((await post('/api/duel/recruit', token, { cls: 'hoplite', requestId: reqId() })).status).toBe(200);
    const poor = await post<{ error: { code: string } }>('/api/duel/recruit', token, { cls: 'archer', requestId: reqId() });
    expect(poor.body.error.code).toBe('cannot_afford');
  });

  it('equips and unequips through the stash, and dismisses a hero with his gear going to the stash', async () => {
    const { token, profile } = await open(9112);
    const h = profile.heroes[0];
    const off = await post<{ profile: DuelProfile }>('/api/duel/equip', token, { heroId: h.id, slot: 'helmet', itemUid: null });
    expect(off.status).toBe(200);
    const helm = off.body.profile.stash.find((i) => i.uid === h.equip.helmet!.uid)!;
    expect(helm).toBeTruthy();
    const back = await post<{ profile: DuelProfile }>('/api/duel/equip', token, { heroId: profile.heroes[1].id, slot: 'helmet', itemUid: helm.uid });
    expect(back.body.profile.heroes[1].equip.helmet?.uid).toBe(helm.uid);
    expect(back.body.profile.stash.some((i) => i.uid === profile.heroes[1].equip.helmet!.uid)).toBe(true);
    expect((await post('/api/duel/equip', token, { heroId: h.id, slot: 'armor', itemUid: helm.uid })).status).toBe(404);
    const gone = await post<{ profile: DuelProfile }>('/api/duel/dismiss', token, { heroId: h.id });
    expect(gone.body.profile.heroes.some((x) => x.id === h.id)).toBe(false);
    expect(gone.body.profile.team).not.toContain(h.id);
    expect(gone.body.profile.stash.some((i) => i.uid === h.equip.weapon!.uid)).toBe(true);
  });

  it('develops heroes only within their points and class tree; respec costs Glory and restores the recruit', async () => {
    const { token, pid, profile } = await open(9113);
    const h = profile.heroes[0];
    expect((await post<{ error: { code: string } }>('/api/duel/develop', token, { heroId: h.id, attrs: { str: 1 } })).body.error.code).toBe('no_points');
    expect((await post<{ error: { code: string } }>('/api/duel/develop', token, { heroId: h.id, perks: ['shield_drill'] })).body.error.code).toBe('bad_perk');
    await DB().prepare('UPDATE duel_heroes SET data = ?2 WHERE id = ?1').bind(h.id, JSON.stringify({ ...h, level: 3, points: 4 })).run();
    const dev = await post<{ hero: Hero }>('/api/duel/develop', token, { heroId: h.id, attrs: { str: 2, end: 1 }, perks: ['shield_drill'] });
    expect(dev.status).toBe(200);
    expect(dev.body.hero).toMatchObject({ points: 1, perks: ['shield_drill'] });
    expect(dev.body.hero.attrs.str).toBe(h.attrs.str + 2);
    const re = await post<{ hero: Hero; profile: DuelProfile }>('/api/duel/respec', token, { heroId: h.id, requestId: reqId() });
    expect(re.body.hero).toMatchObject({ points: 4, perks: [], attrs: h.attrs });
    expect(re.body.profile.glory).toBe(DUEL_RULES.startGlory - 3 * DUEL_RULES.respecPerLevel);
    expect(pid).toBeGreaterThan(0);
  });

  it('sets the team, groups and formations', async () => {
    const { token, profile } = await open(9114);
    const ids = profile.heroes.slice(0, 3).map((h) => h.id);
    const r = await post<{ profile: DuelProfile }>('/api/duel/team', token, { heroIds: ids, formations: ['wedge', 'skirmish', 'line', 'column'], groups: { [ids[0]]: 3 } });
    expect(r.status).toBe(200);
    expect(r.body.profile.team).toEqual(ids);
    expect(r.body.profile.formations[0]).toBe('wedge');
    expect(r.body.profile.heroes[0].group).toBe(3);
    expect((await post('/api/duel/team', token, { heroIds: ['nobody'] })).status).toBe(404);
    expect((await post('/api/duel/team', token, { heroIds: Array.from({ length: 11 }, (_, i) => `h${i}`) })).status).toBe(400);
  });
});

describe('duel shop', () => {
  it('sells catalogue gear for Glory and buys stash items back', async () => {
    const { token } = await open(9121);
    const offer = catalogue().find((o) => o.id === 'xiphos:uncommon')!;
    const id = reqId();
    const b = await post<{ item: Item; profile: DuelProfile }>('/api/duel/shop/buy', token, { offer: offer.id, requestId: id });
    expect(b.status).toBe(200);
    expect(b.body.item).toMatchObject({ def: 'xiphos', rarity: 'uncommon', cond: 100 });
    expect(b.body.profile.glory).toBe(DUEL_RULES.startGlory - offer.price);
    const twice = await post<{ replayed: boolean; profile: DuelProfile }>('/api/duel/shop/buy', token, { offer: offer.id, requestId: id });
    expect(twice.body.replayed).toBe(true);
    expect(twice.body.profile.stash.filter((i) => i.def === 'xiphos')).toHaveLength(1);
    expect((await post('/api/duel/shop/buy', token, { offer: 'xiphos:legendary', requestId: reqId() })).status).toBe(404);
    const s = await post<{ glory: number; profile: DuelProfile }>('/api/duel/shop/sell', token, { uid: b.body.item.uid, requestId: reqId() });
    expect(s.body.glory).toBe(Math.floor(gearPrice('xiphos', 'uncommon') / 4));
    expect(s.body.profile.stash.some((i) => i.uid === b.body.item.uid)).toBe(false);
    expect((await post('/api/duel/shop/sell', token, { uid: b.body.item.uid, requestId: reqId() })).status).toBe(404);
  });

  it('daily offers sell once per player and day', async () => {
    const { token } = await open(9122);
    await DB().prepare('UPDATE duel_profiles SET glory = 10000 WHERE player_id = (SELECT id FROM players WHERE telegram_id = 9122)').run();
    const offer = dailyOffers(utcDay(Date.now()))[0];
    const a = await post<{ profile: DuelProfile }>('/api/duel/shop/buy', token, { offer: offer.id, requestId: reqId() });
    expect(a.status).toBe(200);
    expect(a.body.profile.bought).toContain(offer.id);
    expect((await post<{ error: { code: string } }>('/api/duel/shop/buy', token, { offer: offer.id, requestId: reqId() })).body.error.code).toBe('sold_out');
    expect((await post('/api/duel/shop/buy', token, { offer: 'day1:dory:epic', requestId: reqId() })).status).toBe(404);
  });
});

describe('duel ladder', () => {
  it('only the next floor opens; an open ticket resumes; the team must fit the budget', async () => {
    const { token, profile } = await open(9131);
    expect((await post<{ error: { code: string } }>('/api/duel/ladder/start', token, { floor: 2 })).body.error.code).toBe('floor_locked');
    const t = await post<LadderTicket>('/api/duel/ladder/start', token, { floor: 1 });
    expect(t.status).toBe(200);
    expect(t.body.team.map((h) => h.id)).toEqual(profile.team);
    expect(t.body.enemies.map((h) => h.id)).toEqual(ladderFloor(1).heroes.map((h) => h.id));
    const again = await post<LadderTicket>('/api/duel/ladder/start', token, { floor: 1 });
    expect(again.body).toMatchObject({ ticket: t.body.ticket, resumed: true });
    expect((await post('/api/duel/ladder/abandon', token, { ticket: t.body.ticket })).status).toBe(200);
    // A team over the floor's budget (floor 1: 60 points) is refused.
    const rich = profile.heroes.map((h) => ({ ...h, level: 10 }));
    for (const h of rich) await DB().prepare('UPDATE duel_heroes SET data = ?2 WHERE id = ?1').bind(h.id, JSON.stringify(h)).run();
    expect((await post<{ error: { code: string } }>('/api/duel/ladder/start', token, { floor: 1 })).body.error.code).toBe('over_budget');
    await post('/api/duel/team', token, { heroIds: [] });
    expect((await post<{ error: { code: string } }>('/api/duel/ladder/start', token, { floor: 1 })).body.error.code).toBe('no_team');
  });

  it('a false claim is void; a replayed battle pays XP, and a win Glory, account XP and an item', async () => {
    const { token, profile } = await open(9132);
    const t = await post<LadderTicket>('/api/duel/ladder/start', token, { floor: 1 });
    const sub = play(t.body.setup);
    const bad = await post<{ error: { code: string } }>('/api/duel/ladder/submit', token, { ticket: t.body.ticket, ...sub, claim: { ...sub.claim, hash: 'deadbeef' } });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('replay_mismatch');
    expect((await post('/api/duel/ladder/submit', token, { ticket: t.body.ticket, ...sub })).status).toBe(409);

    // Fight until a win (the starter team beats floor 1 most of the time); every battle pays its XP.
    type Report = { won: boolean; firstClear: boolean; glory: number; drop: Item | null; xp: { heroId: string; xp: number }[]; profile: DuelProfile };
    let won: Report | null = null;
    let battles = 0;
    for (let i = 0; i < 8 && !won; i++) {
      const tk = await post<LadderTicket>('/api/duel/ladder/start', token, { floor: 1 });
      const s = play(tk.body.setup);
      const r = await post<Report>('/api/duel/ladder/submit', token, { ticket: tk.body.ticket, ...s });
      expect(r.status).toBe(200);
      battles++;
      expect(r.body.xp).toHaveLength(profile.team.length);
      expect(r.body.profile.battles).toBe(battles);
      if (r.body.won) won = r.body;
      else expect(r.body.glory).toBe(0);
      // the same report again is answered from the ticket
      const again = await post<{ replayed: boolean }>('/api/duel/ladder/submit', token, { ticket: tk.body.ticket, ...s });
      expect(again.body.replayed).toBe(true);
    }
    expect(won).not.toBeNull();
    expect(won!.firstClear).toBe(true);
    expect(won!.glory).toBe(ladderFloor(1).reward.firstGlory);
    expect(won!.profile.glory).toBe(DUEL_RULES.startGlory + won!.glory);
    expect(won!.profile.ladder.cleared).toBe(1);
    expect(won!.drop).not.toBeNull();
    expect(won!.profile.stash.some((i) => i.uid === won!.drop!.uid)).toBe(true);
    expect(won!.profile.xp).toBeGreaterThan(0);
    const before = profile.heroes[0];
    const after = won!.profile.heroes.find((h) => h.id === before.id)!;
    expect(after.battles).toBe(battles);
    expect(after.level * 1000 + after.xp).toBeGreaterThan(before.level * 1000 + before.xp);
    for (const it of Object.values(after.equip)) expect(it?.cond).toBe(100);

    // Floor 2 is open now; replays of floor 1 pay farm Glory under the daily cap.
    const f2 = await post<LadderTicket>('/api/duel/ladder/start', token, { floor: 2 });
    expect(f2.status).toBe(200);
    await DB().prepare('UPDATE duel_profiles SET farm_glory = ?2, farm_day = ?3 WHERE player_id = (SELECT id FROM players WHERE telegram_id = ?1)').bind(9132, DUEL_RULES.farmGloryPerDay - 4, utcDay(Date.now())).run();
    for (let i = 0; i < 8; i++) {
      const tk = await post<LadderTicket>('/api/duel/ladder/start', token, { floor: 1 });
      const r = await post<Report & { capped: number }>('/api/duel/ladder/submit', token, { ticket: tk.body.ticket, ...play(tk.body.setup) });
      if (!r.body.won) continue;
      expect(r.body.firstClear).toBe(false);
      expect(r.body.glory).toBe(4);
      expect(r.body.capped).toBe(ladderFloor(1).reward.farmGlory - 4);
      expect(r.body.profile.ladder.farmLeft).toBe(0);
      break;
    }
  });
});

describe('ladder stars and chapter chests', () => {
  type StarReport = { won: boolean; stars: number; lost: number; prevStars: number; bestStars: number; newBest: boolean; profile: DuelProfile & { ladder: { stars: number[]; chests: { chapter: number; tier: number }[] } } };

  it('a won floor earns stars by the points lost; the best is kept and only goes up', async () => {
    const { token, pid, profile } = await open(9141);
    expect((profile as unknown as StarReport['profile']).ladder.stars).toEqual(new Array(LADDER.floors).fill(0));
    let won: StarReport | null = null;
    for (let i = 0; i < 8 && !won; i++) {
      const tk = await post<LadderTicket>('/api/duel/ladder/start', token, { floor: 1 });
      const r = await post<StarReport>('/api/duel/ladder/submit', token, { ticket: tk.body.ticket, ...play(tk.body.setup) });
      if (!r.body.won) {
        expect(r.body).toMatchObject({ stars: 0, newBest: false });
        continue;
      }
      won = r.body;
    }
    expect(won).not.toBeNull();
    expect(won!.stars).toBe(ladderStars(true, won!.lost));
    expect(won!).toMatchObject({ prevStars: 0, newBest: true, bestStars: won!.stars });
    expect(won!.profile.ladder.stars[0]).toBe(won!.stars);
    // a better best stays: a replay never lowers it
    await DB().prepare('UPDATE duel_ladder_stars SET stars = 3 WHERE player_id = ?1 AND floor = 1').bind(pid).run();
    for (let i = 0; i < 8; i++) {
      const tk = await post<LadderTicket>('/api/duel/ladder/start', token, { floor: 1 });
      const r = await post<StarReport>('/api/duel/ladder/submit', token, { ticket: tk.body.ticket, ...play(tk.body.setup) });
      if (!r.body.won) continue;
      expect(r.body).toMatchObject({ prevStars: 3, bestStars: 3, newBest: false });
      expect(r.body.profile.ladder.stars[0]).toBe(3);
      break;
    }
  });

  it('floors cleared before stars count 1; chests open at 10/20/30 chapter stars and pay once', async () => {
    const { token, pid } = await open(9142);
    await DB().prepare('UPDATE duel_profiles SET ladder_cleared = 10 WHERE player_id = ?1').bind(pid).run();
    type P = StarReport['profile'];
    const p = (await getJson<P>('/api/duel/profile', token)).body;
    expect(p.ladder.stars.slice(0, 11)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
    expect(p.ladder.chests).toEqual([]);
    type Chest = { chapter: number; tier: number; glory: number; item: Item | null; replayed: boolean; profile: P };
    const t1 = await post<Chest>('/api/duel/ladder/chest', token, { chapter: 1, tier: 1 });
    expect(t1.status).toBe(200);
    expect(t1.body).toMatchObject({ glory: chestReward(1, 1).glory, item: null, replayed: false });
    expect(t1.body.profile.glory).toBe(p.glory + chestReward(1, 1).glory);
    const again = await post<Chest>('/api/duel/ladder/chest', token, { chapter: 1, tier: 1 });
    expect(again.body).toMatchObject({ glory: chestReward(1, 1).glory, replayed: true });
    expect(again.body.profile.glory).toBe(t1.body.profile.glory);
    const locked = await post<{ error: { code: string } }>('/api/duel/ladder/chest', token, { chapter: 1, tier: 3 });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('chest_locked');
    expect((await post('/api/duel/ladder/chest', token, { chapter: 6, tier: 1 })).status).toBe(400);
    // three stars on every floor of chapter 1: the top chest holds a rare-or-better item
    for (let f = 1; f <= 10; f++) await DB().prepare('INSERT INTO duel_ladder_stars (player_id, floor, stars, updated_at) VALUES (?1, ?2, 3, 0)').bind(pid, f).run();
    const t3 = await post<Chest>('/api/duel/ladder/chest', token, { chapter: 1, tier: 3 });
    expect(t3.status).toBe(200);
    expect(t3.body.glory).toBe(chestReward(1, 3).glory);
    expect(['rare', 'epic', 'legendary']).toContain(t3.body.item!.rarity);
    expect(t3.body.profile.stash.some((i) => i.uid === t3.body.item!.uid)).toBe(true);
    const t3again = await post<Chest>('/api/duel/ladder/chest', token, { chapter: 1, tier: 3 });
    expect(t3again.body.replayed).toBe(true);
    expect(t3again.body.item!.uid).toBe(t3.body.item!.uid);
    expect(t3again.body.profile.stash.filter((i) => i.uid === t3.body.item!.uid)).toHaveLength(1);
    expect(t3again.body.profile.glory).toBe(t3.body.profile.glory);
    expect(t3again.body.profile.ladder.chests).toEqual([{ chapter: 1, tier: 1 }, { chapter: 1, tier: 3 }]);
  });
});
