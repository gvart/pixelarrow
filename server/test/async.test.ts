/**
 * Duels slice 4 (docs/DUELS.md "Ranked async", seasons, leaderboards): saved
 * team loadouts, async attacks on a defence team verified by replay (the
 * defender's rating at half rate, the daily cap, the 24-hour repeat rule, the
 * defence log and replays), the lazy monthly season rollover (soft reset,
 * rewards paid once) and the leaderboards.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Hero } from '../../src/data/units';
import type { BattleSetup } from '../../src/sim/types';
import { DUEL_RULES, heroPoints } from '../../src/duel/rules';
import { RANKED, glicko2, scoreOf } from '../../src/duel/rating';
import { ASYNC, SEASON, seasonId, softReset } from '../../src/duel/season';
import type { AsyncReport } from '../../src/duel/protocol';
import { rollRatings } from '../src/duel/season';
import { DB, fresh, getJson, openDuellist, play, post } from './onlineHelpers';

beforeEach(fresh);

interface Loadout {
  slot: number;
  name: string | null;
  team: string[];
}
interface Profile {
  glory: number;
  xp: number;
  team: string[];
  heroes: Hero[];
  loadouts: Loadout[];
  loadout: number;
  use: { ladder: number; arena: number; defence: number };
  defence: { points: number; heroes: number } | null;
}
interface Candidate {
  pid: number;
  name: string;
  points: number;
}
interface AsyncView {
  unlocked: boolean;
  attacks: { used: number; cap: number; left: number };
  defence: { points: number } | null;
  candidates: Candidate[];
  games: number;
  defences: number;
}
interface Ticket {
  ticket: string;
  defender: { pid: number; name: string };
  setup: BattleSetup;
  team: Hero[];
  enemies: Hero[];
  resumed?: boolean;
}

const duellist = (tg: number, level5 = true) => openDuellist<Profile>(tg, { name: `D${tg}`, level5 });

/** A defender: the duel profile, the starter team saved as the defence. */
async function defender(tg: number) {
  const d = await duellist(tg);
  const r = await post<{ profile: Profile }>('/api/duel/loadout', d.token, { slot: 1, use: ['defence'] });
  expect(r.status).toBe(200);
  expect(r.body.profile.defence?.heroes).toBe(6);
  return d;
}

describe('team loadouts', () => {
  it('keeps the team in loadout 1, copies it into a new slot, edits one loadout at a time and assigns uses', async () => {
    const { token, profile } = await duellist(9401);
    expect(profile.loadouts.map((l) => l.slot)).toEqual([1]);
    expect(profile.loadouts[0].team).toEqual(profile.team);
    expect(profile.use).toEqual({ ladder: 1, arena: 1, defence: 1 });
    expect(profile.defence).toBeNull();
    const two = await post<{ profile: Profile }>('/api/duel/loadout', token, { slot: 2, edit: true, name: 'Raiders' });
    expect(two.body.profile.loadout).toBe(2);
    expect(two.body.profile.loadouts[1]).toMatchObject({ slot: 2, name: 'Raiders', team: profile.team });
    const ids = profile.team.slice(0, 3);
    const t = await post<{ profile: Profile }>('/api/duel/team', token, { heroIds: ids });
    expect(t.body.profile.team).toEqual(ids);
    expect(t.body.profile.loadouts[1].team).toEqual(ids);
    expect(t.body.profile.loadouts[0].team).toEqual(profile.team);
    const use = await post<{ profile: Profile }>('/api/duel/loadout', token, { slot: 2, use: ['arena'] });
    expect(use.body.profile.use).toEqual({ ladder: 1, arena: 2, defence: 1 });
    // the ladder fights with loadout 1 (all six)
    const lad = await post<{ team: Hero[] }>('/api/duel/ladder/start', token, { floor: 1 });
    expect(lad.body.team).toHaveLength(6);
    // dismissing a hero takes him out of every loadout
    await post('/api/duel/loadout', token, { slot: 1, edit: true });
    await post('/api/duel/team', token, { heroIds: profile.team.slice(3) });
    const gone = await post<{ profile: Profile }>('/api/duel/dismiss', token, { heroId: ids[0] });
    expect(gone.status).toBe(200);
    expect(gone.body.profile.loadouts[1].team).toEqual(ids.slice(1));
  });

  it('presets: up to 5, created as copies or empty, renamed, duplicated and deleted with their uses reassigned', async () => {
    const { token, pid, profile } = await duellist(9403);
    const c = await post<{ slot: number; profile: Profile }>('/api/duel/loadout/create', token, {});
    expect(c.status).toBe(200);
    expect(c.body.slot).toBe(2);
    expect(c.body.profile.loadout).toBe(2);
    expect(c.body.profile.loadouts[1]).toMatchObject({ slot: 2, name: null, team: profile.team });
    await post('/api/duel/team', token, { heroIds: profile.team.slice(0, 2) });
    // duplicate preset 2 (not edited afterwards), then an empty one
    const dup = await post<{ slot: number; profile: Profile }>('/api/duel/loadout/create', token, { from: 2, name: '  Twins  ', edit: false });
    expect(dup.body.slot).toBe(3);
    expect(dup.body.profile.loadout).toBe(2);
    expect(dup.body.profile.loadouts[2]).toMatchObject({ slot: 3, name: 'Twins', team: profile.team.slice(0, 2) });
    const empty = await post<{ slot: number; profile: Profile }>('/api/duel/loadout/create', token, { from: null });
    expect(empty.body.profile.loadouts.find((l) => l.slot === 4)!.team).toEqual([]);
    expect((await post<{ error: { code: string } }>('/api/duel/loadout/create', token, { from: 9 })).status).toBe(400);
    expect((await post<{ slot: number }>('/api/duel/loadout/create', token, {})).body.slot).toBe(5);
    const full = await post<{ error: { code: string } }>('/api/duel/loadout/create', token, {});
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('presets_full');
    // rename: trimmed, at most 16; empty back to the default
    expect((await post('/api/duel/loadout', token, { slot: 3, name: 'x'.repeat(17) })).status).toBe(400);
    const ren = await post<{ profile: Profile }>('/api/duel/loadout', token, { slot: 3, name: '  Archers ' });
    expect(ren.body.profile.loadouts.find((l) => l.slot === 3)!.name).toBe('Archers');
    expect((await post<{ profile: Profile }>('/api/duel/loadout', token, { slot: 3, name: '' })).body.profile.loadouts.find((l) => l.slot === 3)!.name).toBeNull();
    // the defence on preset 3, the arena and the edited one on 2: deleting them moves those to preset 1
    expect((await post('/api/duel/loadout', token, { slot: 3, use: ['defence', 'ladder'] })).status).toBe(200);
    await post('/api/duel/loadout', token, { slot: 2, use: ['arena'], edit: true });
    const d3 = await post<{ profile: Profile }>('/api/duel/loadout/delete', token, { slot: 3 });
    expect(d3.status).toBe(200);
    expect(d3.body.profile.loadouts.map((l) => l.slot)).toEqual([1, 2, 4, 5]);
    expect(d3.body.profile.use).toEqual({ ladder: 1, arena: 2, defence: 1 });
    const d2 = await post<{ profile: Profile }>('/api/duel/loadout/delete', token, { slot: 2 });
    expect(d2.body.profile.use).toEqual({ ladder: 1, arena: 1, defence: 1 });
    expect(d2.body.profile.loadout).toBe(1);
    expect(d2.body.profile.team).toEqual(profile.team);
    expect((await post('/api/duel/loadout/delete', token, { slot: 2 })).status).toBe(404);
    // a team write to a preset that is gone is refused; a new preset takes the lowest free slot
    expect((await post('/api/duel/team', token, { loadout: 2, heroIds: [] })).status).toBe(404);
    expect((await post<{ slot: number }>('/api/duel/loadout/create', token, {})).body.slot).toBe(2);
    for (const slot of [2, 4, 5]) expect((await post('/api/duel/loadout/delete', token, { slot })).status).toBe(200);
    const last = await post<{ error: { code: string } }>('/api/duel/loadout/delete', token, { slot: 1 });
    expect(last.status).toBe(409);
    expect(last.body.error.code).toBe('last_preset');
    // out of the raid pool again (the tests below expect only their own defenders)
    await DB().prepare('DELETE FROM duel_defences WHERE player_id = ?1').bind(pid).run();
  });

  it('a defence must fit the ranked budget', async () => {
    const { token, pid, profile } = await duellist(9402);
    const h = profile.heroes[0];
    await DB().prepare('UPDATE duel_heroes SET data = ?2 WHERE id = ?1').bind(h.id, JSON.stringify({ ...h, level: 10 })).run();
    // 6 heroes with a level-10 hoplite still fit; pump the rest to go over
    for (const x of profile.heroes.slice(1)) await DB().prepare('UPDATE duel_heroes SET data = ?2 WHERE id = ?1').bind(x.id, JSON.stringify({ ...x, level: 10 })).run();
    expect(profile.heroes.reduce((a, x) => a + heroPoints({ ...x, level: 10 }), 0)).toBeLessThanOrEqual(DUEL_RULES.budget);
    // bring in recruits until the team is over budget
    await DB().prepare('UPDATE duel_profiles SET glory = 5000 WHERE player_id = ?1').bind(pid).run();
    const ids = [...profile.team];
    for (let i = 0; i < 4; i++) {
      const r = await post<{ hero: Hero }>('/api/duel/recruit', token, { cls: 'hoplite', requestId: `rq-${pid}-${i}-xxxx` });
      await DB().prepare('UPDATE duel_heroes SET data = ?2 WHERE id = ?1').bind(r.body.hero.id, JSON.stringify({ ...r.body.hero, level: 10 })).run();
      ids.push(r.body.hero.id);
    }
    await post('/api/duel/team', token, { heroIds: ids });
    const bad = await post<{ error: { code: string } }>('/api/duel/loadout', token, { slot: 1, use: ['defence'] });
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe('over_budget');
  });
});

describe('async defence ladder', () => {
  it('offers defenders near the rating, verifies the attack by replay and settles both sides once', async () => {
    const def = await defender(9411);
    const att = await duellist(9412);
    const view = await getJson<AsyncView>('/api/duel/async', att.token);
    expect(view.status).toBe(200);
    expect(view.body.unlocked).toBe(true);
    expect(view.body.attacks).toEqual({ used: 0, cap: ASYNC.attacksPerDay, left: ASYNC.attacksPerDay });
    expect(view.body.defence).toBeNull();
    expect(view.body.candidates.map((c) => c.pid)).toEqual([def.pid]);
    // a weak defence: one level-1 slinger (the attacker should win)
    const slinger = def.profile.heroes.find((h) => h.cls === 'slinger')!;
    await DB().prepare('UPDATE duel_defences SET heroes = ?2, points = ?3 WHERE player_id = ?1').bind(def.pid, JSON.stringify([slinger]), heroPoints(slinger)).run();

    const tk = await post<Ticket>('/api/duel/async/start', att.token, { defender: def.pid });
    expect(tk.status).toBe(200);
    expect(tk.body.team).toHaveLength(6);
    expect(tk.body.enemies.map((h) => h.id)).toEqual([slinger.id]);
    expect(tk.body.setup.armies[1].bot).toBe(true);
    // the same defender again: the open ticket is resumed (same seed)
    const again = await post<Ticket>('/api/duel/async/start', att.token, { defender: def.pid });
    expect(again.body.ticket).toBe(tk.body.ticket);
    expect(again.body.resumed).toBe(true);
    // the attacker now defends with the arena team
    expect((await getJson<AsyncView>('/api/duel/async', att.token)).body.defence?.points).toBeGreaterThan(0);

    const sub = play(tk.body.setup);
    const bad = await post<{ error: { code: string } }>('/api/duel/async/submit', att.token, { ticket: tk.body.ticket, ...sub, claim: { ...sub.claim, hash: 'deadbeef' } });
    expect(bad.body.error.code).toBe('replay_mismatch');
    // a rejected ticket is closed: start a fresh attack (another day's slot, same defender is blocked for 24 h)
    await DB().prepare('DELETE FROM duel_attacks WHERE attacker = ?1').bind(att.pid).run();
    const tk2 = await post<Ticket>('/api/duel/async/start', att.token, { defender: def.pid });
    const s2 = play(tk2.body.setup);
    const glory0 = (await getJson<Profile>('/api/duel/profile', att.token)).body.glory;
    const defGlory0 = (await getJson<Profile>('/api/duel/profile', def.token)).body.glory;
    const r = await post<{ report: AsyncReport; profile: Profile }>('/api/duel/async/submit', att.token, { ticket: tk2.body.ticket, ...s2 });
    expect(r.status).toBe(200);
    const rep = r.body.report;
    expect(rep.verified).toBe(true);
    expect(rep.winner).toBe(s2.claim.winner);
    const score = scoreOf(rep.winner, 0);
    expect(rep.glory).toBe(score === 1 ? ASYNC.glory.win : score === 0.5 ? ASYNC.glory.draw : ASYNC.glory.loss);
    expect(r.body.profile.glory).toBe(glory0 + rep.glory);
    // ratings: the attacker's by Glicko-2, the defender's at half rate
    const start = { ...RANKED.start };
    const fullA = glicko2(start, start, score);
    expect(rep.rating).toEqual({ before: 1500, after: Math.round(fullA.rating) });
    const rows = await DB().prepare("SELECT player_id, rating, games, defences, defence_wins FROM duel_ratings WHERE ladder = 'async' ORDER BY player_id").all<{ player_id: number; rating: number; games: number; defences: number }>();
    const rd = rows.results.find((x) => x.player_id === def.pid)!;
    const fullD = glicko2(start, start, (1 - score) as 0 | 0.5 | 1);
    expect(rd.rating - 1500).toBeCloseTo((fullD.rating - 1500) * 0.5, 6);
    expect(rd).toMatchObject({ games: 0, defences: 1 });
    expect(rows.results.find((x) => x.player_id === att.pid)).toMatchObject({ games: 1, defences: 0 });
    const defGlory = (await getJson<Profile>('/api/duel/profile', def.token)).body.glory;
    expect(defGlory - defGlory0).toBe(score === 0 ? ASYNC.defence.glory.win : score === 0.5 ? ASYNC.defence.glory.draw : 0);
    // a repeat returns the stored report
    const rep2 = await post<{ report: AsyncReport; replayed: boolean }>('/api/duel/async/submit', att.token, { ticket: tk2.body.ticket, ...s2 });
    expect(rep2.body.replayed).toBe(true);
    expect((await getJson<Profile>('/api/duel/profile', att.token)).body.glory).toBe(glory0 + rep.glory);

    // the defence log on both sides, and the replay anyone can fetch
    const logD = await getJson<{ entries: { id: string; role: string; name: string; delta: number; score: number }[] }>('/api/duel/async/log', def.token);
    expect(logD.body.entries).toHaveLength(1);
    expect(logD.body.entries[0]).toMatchObject({ id: tk2.body.ticket, role: 'defence', name: 'D9412', score: 1 - score });
    const logA = await getJson<{ entries: { role: string }[] }>('/api/duel/async/log', att.token);
    expect(logA.body.entries[0].role).toBe('attack');
    const other = await duellist(9413);
    const rp = await getJson<{ setup: BattleSetup; orders: unknown[]; winner: number; names: string[] }>(`/api/duel/async/replay/${tk2.body.ticket}`, other.token);
    expect(rp.status).toBe(200);
    expect(rp.body.orders).toHaveLength(s2.orders.length);
    expect(rp.body.names).toEqual(['D9412', 'D9411']);
    expect(rp.body.winner).toBe(rep.winner);

    // 24 hours: the same defender is neither offered nor attackable
    expect((await getJson<AsyncView>('/api/duel/async', att.token)).body.candidates).toEqual([]);
    const repeat = await post<{ error: { code: string } }>('/api/duel/async/start', att.token, { defender: def.pid });
    expect(repeat.body.error.code).toBe('attacked_recently');
    // a day later they are back
    await DB().prepare('UPDATE duel_attacks SET created_at = created_at - ?2 WHERE attacker = ?1').bind(att.pid, ASYNC.repeatMs + 1000).run();
    expect((await getJson<AsyncView>('/api/duel/async', att.token)).body.candidates.map((c) => c.pid)).toEqual([def.pid]);
  });

  it('caps rated attacks per UTC day, refuses defenders not offered and opens at duel level 5', async () => {
    const def = await defender(9421);
    const att = await duellist(9422);
    const day = Math.floor(Date.now() / 86_400_000);
    for (let i = 0; i < ASYNC.attacksPerDay; i++) {
      await DB()
        .prepare("INSERT INTO duel_attacks (id, attacker, defender, day, seed, setup, team, defence, status, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, 1, '{}', '[]', '[]', 'abandoned', 0, 0)")
        .bind(`${'a'.repeat(30)}${String(i).padStart(2, '0')}`, att.pid, def.pid, day)
        .run();
    }
    const v = await getJson<AsyncView>('/api/duel/async', att.token);
    expect(v.body.attacks.left).toBe(0);
    expect(v.body.candidates).toEqual([]);
    const capped = await post<{ error: { code: string } }>('/api/duel/async/start', att.token, { defender: def.pid });
    expect(capped.body.error.code).toBe('attack_cap');
    await DB().prepare('UPDATE duel_attacks SET day = day - 1 WHERE attacker = ?1').bind(att.pid).run();
    const self = await post<{ error: { code: string } }>('/api/duel/async/start', att.token, { defender: att.pid });
    expect(self.body.error.code).toBe('not_offered');
    const low = await duellist(9423, false);
    const locked = await post<{ error: { code: string } }>('/api/duel/async/start', low.token, { defender: def.pid });
    expect(locked.body.error.code).toBe('locked');
    expect((await getJson<AsyncView>('/api/duel/async', low.token)).body.unlocked).toBe(false);
  });
});

describe('ranked seasons', () => {
  const cur = () => seasonId(Date.now());

  it('rolls a past season over once: soft reset, Glory, the league cosmetic and the title', async () => {
    const p = await duellist(9431);
    await DB()
      .prepare("INSERT INTO duel_ratings (player_id, ladder, rating, rd, vol, games, peak, updated_at, season, played_at) VALUES (?1, 'live', 1850, 60, 0.06, 30, 1910, 0, ?2, 0)")
      .bind(p.pid, cur() - 1)
      .run();
    await DB()
      .prepare("INSERT INTO duel_ratings (player_id, ladder, rating, rd, vol, games, peak, updated_at, season, played_at) VALUES (?1, 'async', 1420, 60, 0.06, 12, 1450, 0, ?2, 0)")
      .bind(p.pid, cur() - 1)
      .run();
    const glory0 = (await getJson<Profile>('/api/duel/profile', p.token)).body.glory;
    // concurrent first accesses pay once
    await Promise.all([rollRatings(DB(), p.pid, Date.now()), rollRatings(DB(), p.pid, Date.now()), getJson('/api/duel/season', p.token)]);
    const s = await getJson<{ rewards: { ladder: string; league: string; glory: number; cosmetic: string }[]; title: { league: string } | null; live: { league: { id: string } | null; peak: unknown } }>('/api/duel/season', p.token);
    expect(s.body.rewards.sort((a, b) => a.ladder.localeCompare(b.ladder))).toEqual([
      { season: cur() - 1, ladder: 'async', league: 'gold', glory: SEASON.rewards.gold.glory * SEASON.asyncShare, cosmetic: 'duel_emblem_gold' },
      { season: cur() - 1, ladder: 'live', league: 'strategos', glory: SEASON.rewards.strategos.glory, cosmetic: 'duel_banner_strategos' },
    ]);
    expect(s.body.title).toEqual({ league: 'strategos', season: cur() - 1 });
    expect(s.body.live.peak).toBeNull();
    const glory = (await getJson<Profile>('/api/duel/profile', p.token)).body.glory;
    expect(glory - glory0).toBe(SEASON.rewards.strategos.glory + SEASON.rewards.gold.glory * SEASON.asyncShare);
    const live = await DB().prepare("SELECT rating, rd, peak, season FROM duel_ratings WHERE player_id = ?1 AND ladder = 'live'").bind(p.pid).first<{ rating: number; rd: number; peak: number | null; season: number }>();
    expect(live).toEqual({ rating: softReset({ rating: 1850, rd: 60, vol: 0.06 }).rating, rd: SEASON.resetRd, peak: null, season: cur() });
    expect(live!.rating).toBe(1675);
    const ent = await DB().prepare('SELECT product_id FROM entitlements WHERE player_id = ?1 ORDER BY product_id').bind(p.pid).all<{ product_id: string }>();
    expect(ent.results.map((r) => r.product_id)).toEqual(['duel_banner_strategos', 'duel_emblem_gold']);
    // the cosmetics are in the wallet (account-wide) and can be shown
    const eq = await post('/api/economy/cosmetics/equip', p.token, { slot: 'banner', id: 'duel_banner_strategos' });
    expect(eq.status).toBe(200);
    // seen: the popup does not come back; the title stays
    await post('/api/duel/season/seen', p.token);
    const after = await getJson<{ rewards: unknown[]; title: { league: string } }>('/api/duel/season', p.token);
    expect(after.body.rewards).toEqual([]);
    expect(after.body.title.league).toBe('strategos');
    await rollRatings(DB(), p.pid, Date.now());
    expect((await getJson<Profile>('/api/duel/profile', p.token)).body.glory).toBe(glory);
  });

  it('pays nothing for a season without a placed peak, and resets several missed seasons at once', async () => {
    const p = await duellist(9432);
    await DB()
      .prepare("INSERT INTO duel_ratings (player_id, ladder, rating, rd, vol, games, peak, updated_at, season, played_at) VALUES (?1, 'live', 2100, 50, 0.06, 40, NULL, 0, ?2, 0)")
      .bind(p.pid, cur() - 3)
      .run();
    const s = await getJson<{ rewards: unknown[] }>('/api/duel/season', p.token);
    expect(s.body.rewards).toEqual([]);
    const r = await DB().prepare("SELECT rating FROM duel_ratings WHERE player_id = ?1 AND ladder = 'live'").bind(p.pid).first<{ rating: number }>();
    expect(r!.rating).toBeCloseTo(1500 + 600 * SEASON.keep ** 3, 6);
  });
});

describe('leaderboards', () => {
  it('lists the running season by rating, exact ratings in Legend only, and the player’s own rank', async () => {
    const ps = await Promise.all([9441, 9442, 9443, 9444].map((tg) => duellist(tg)));
    const ratings = [2150, 1720, 1980, 1300];
    const cur = seasonId(Date.now());
    for (let i = 0; i < ps.length; i++)
      await DB()
        .prepare("INSERT INTO duel_ratings (player_id, ladder, rating, rd, vol, games, updated_at, season, played_at) VALUES (?1, 'live', ?2, 60, 0.06, 20, 0, ?3, 0)")
        .bind(ps[i].pid, ratings[i], i === 3 ? cur - 1 : cur)
        .run();
    // one in placements: not on the board
    await DB().prepare("INSERT INTO duel_ratings (player_id, ladder, rating, rd, vol, games, updated_at, season, played_at) VALUES (?1, 'async', 1600, 60, 0.06, 3, 0, ?2, 0)").bind(ps[0].pid, cur).run();
    type Board = { rows: { rank: number; name: string; league: { id: string }; rating: number | null }[]; me: { rank: number; rating: number | null } | null };
    // the last player is still in the past season: not on the board (until they come back)
    const live = await getJson<Board>('/api/duel/leaderboard?board=live', ps[1].token);
    // (earlier tests of this file left other players on the board, below these)
    expect(live.body.rows.slice(0, 3).map((r) => [r.rank, r.name, r.league.id, r.rating])).toEqual([
      [1, 'D9441', 'legend', 2150],
      [2, 'D9443', 'strategos', null],
      [3, 'D9442', 'hoplite', null],
    ]);
    expect(live.body.rows.some((r) => r.name === 'D9444')).toBe(false);
    expect(live.body.me).toMatchObject({ rank: 3, rating: null });
    const legend = await getJson<Board>('/api/duel/leaderboard?board=legend', ps[0].token);
    expect(legend.body.rows.map((r) => r.name)).toEqual(['D9441']);
    expect(legend.body.me).toMatchObject({ rank: 1, rating: 2150 });
    const asyncBoard = await getJson<Board>('/api/duel/leaderboard?board=async', ps[0].token);
    expect(asyncBoard.body.me).toBeNull();
    expect(asyncBoard.body.rows.some((r) => r.name === 'D9441')).toBe(false);
    // coming back rolls the row into this season (soft reset): now on the board
    const back = await getJson<Board>('/api/duel/leaderboard?board=live', ps[3].token);
    expect(back.body.me?.rank).toBeGreaterThan(3);
    expect(back.body.rows.some((r) => r.name === 'D9444')).toBe(true);
    expect((await getJson('/api/duel/leaderboard?board=nope', ps[0].token)).status).toBe(400);
  });
});
