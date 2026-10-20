/**
 * V6-LINK-04: the account deletion engine (ADR-0009 §7, control manifest M-DL).
 * The seeder walks the migrated schema: every table with a player column gets
 * a row for the player (and one for a bystander), so a new player table is
 * seeded, and checked, without touching this file.
 */
import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/index';
import { beforeEach, describe, expect, it } from 'vitest';
import { DELETED_NAME, DELETION_STEPS, deleteAccount, finishDeletions } from '../src/account/delete';
import { DELETION_MAP, playerColumnsOf, type SchemaColumn } from '../src/account/deletionMap';
import { banIdentityHash } from '../src/account/banTombstone';
import { peppersFromEnv } from '../src/auth/password';
import { emailKeyHash } from '../src/auth/throttle';
import { nameKeyHeld } from '../src/players';
import { playerNames } from '../src/online/store';
import { leaderboard } from '../src/duel/season';
import { seasonId } from '../../src/duel/season';
import { resetRateLimits } from '../src/rateLimit';
import { api, devLogin } from './helpers';
import { openDuellist, wsPath } from './onlineHelpers';

const DB = () => env.DB!;
const DAY = 86_400_000;

let tg = 7_400_000;
let uniq = 1_000_000;
beforeEach(() => resetRateLimits());

interface Col extends SchemaColumn {
  type: string;
  notnull: number;
  dflt: string | null;
  pk: number;
  to: string | null;
}

async function schemaCols(): Promise<Col[]> {
  const r = await DB()
    .prepare(
      `SELECT m.name AS "table", p.name AS "column", p.type, p."notnull", p.dflt_value AS dflt, p.pk, f."table" AS "references", f."to" AS "to"
       FROM sqlite_master m JOIN pragma_table_info(m.name) p LEFT JOIN pragma_foreign_key_list(m.name) f ON f."from" = p.name
       WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%' AND m.name != 'd1_migrations'
       ORDER BY m.name, p.cid`,
    )
    .all<Col>();
  return r.results;
}

/** Values the seeder can't guess: CHECK constraints, and states that are history rather than in-flight. */
const OVERRIDE: Record<string, (s: Seeded) => Record<string, unknown>> = {
  auth_identities: (s) => ({ kind: 'password', subject: s.email, email: s.email.toUpperCase() }),
  sessions: () => ({ transport: 'cookie', method: 'password' }),
  email_tokens: (s) => ({ purpose: 'reset', email_norm: s.email, player_id: null }),
  duel_tickets: () => ({ status: 'used' }),
  duel_attacks: () => ({ status: 'used' }),
  duel_matches: () => ({ status: 'done' }),
  clan_members: () => ({ role: 'member' }),
  war_treasury_log: () => ({ kind: 'deposit' }),
  war_alliance_members: () => ({ alliance: 1 }),
};
/** Created by the deletion itself, or seeded by hand below. */
const NOT_SEEDED = new Set(['players', 'deletion_jobs', 'ban_tombstones']);

interface Seeded {
  pid: number;
  tg: number;
  email: string;
  token: string;
  /** table -> the rowids seeded for this player. */
  rows: Map<string, number[]>;
}

/** A player with a telegram and a password identity and a row in every table that references players. */
async function seedEverywhere(): Promise<Seeded> {
  const me = await devLogin(++tg);
  const s: Seeded = { pid: me.playerId, tg, email: `gone${tg}@example.com`, token: me.token, rows: new Map() };
  const cols = await schemaCols();
  const byTable = new Map<string, Col[]>();
  for (const c of cols) byTable.set(c.table, [...(byTable.get(c.table) ?? []), c]);
  const playerTables = [...new Set(playerColumnsOf(cols).map((c) => c.table))].filter((t) => !NOT_SEEDED.has(t));
  // Parents first: a table whose foreign key points at another seeded table waits for it.
  const order: string[] = [];
  const visit = (t: string) => {
    if (order.includes(t)) return;
    for (const c of byTable.get(t)!) if (c.references && c.references !== 'players' && playerTables.includes(c.references)) visit(c.references);
    order.push(t);
  };
  playerTables.forEach(visit);
  for (const table of order) {
    const rule = DELETION_MAP[table];
    const pidCols = new Set([...(rule.pid ?? []), ...(rule.kept ?? [])]);
    const tgCols = new Set(rule.tg ?? []);
    const over = OVERRIDE[table]?.(s) ?? {};
    const values: Record<string, unknown> = {};
    for (const c of byTable.get(table)!) {
      if (c.column in over) values[c.column] = over[c.column];
      else if (pidCols.has(c.column) || c.references === 'players') values[c.column] = s.pid;
      else if (tgCols.has(c.column)) values[c.column] = s.tg;
      else if (c.references) {
        const parent = await DB().prepare(`SELECT ${c.to ?? 'rowid'} AS v FROM ${c.references} WHERE rowid = ?1`).bind(s.rows.get(c.references)![0]).first<{ v: unknown }>();
        values[c.column] = parent!.v;
      } else if ((c.notnull && c.dflt === null) || c.pk) {
        if (c.pk === 1 && /^INTEGER$/i.test(c.type) && !byTable.get(table)!.some((o) => o.pk > 1)) continue; // rowid alias
        values[c.column] = /INT/i.test(c.type) ? ++uniq : /REAL/i.test(c.type) ? 1.5 : `v${++uniq}`;
      }
    }
    const names = Object.keys(values);
    const r = await DB()
      .prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map((_, i) => `?${i + 1}`).join(', ')}) RETURNING rowid AS id`)
      .bind(...names.map((n) => values[n]))
      .first<{ id: number }>();
    s.rows.set(table, [r!.id]);
  }
  // Rows keyed other than by a player column.
  const ident = await DB().prepare("SELECT id FROM auth_identities WHERE player_id = ?1 AND kind = 'password'").bind(s.pid).first<{ id: number }>();
  const h = await emailKeyHash(s.email);
  await DB().batch([
    DB().prepare("INSERT INTO password_hashes (identity_id, hash, updated_at) VALUES (?1, 'x', 1)").bind(ident!.id),
    DB().prepare('INSERT INTO auth_throttle (key, window_start, count) VALUES (?1, 1, 1), (?2, 1, 1)').bind(`login:${h}`, `mail:h:${h}`),
    DB().prepare("INSERT INTO email_tokens (token_hash, purpose, email_norm, email, created_at, expires_at) VALUES (?1, 'signup', ?2, ?2, 1, ?3)").bind(`t${++uniq}`, s.email, Date.now() + DAY),
  ]);
  return s;
}

const count = async (sql: string, ...binds: unknown[]) => (await DB().prepare(`SELECT COUNT(*) AS n FROM ${sql}`).bind(...binds).first<{ n: number }>())!.n;

/** Rows of `s` per table, by the columns DELETION_MAP names. */
async function rowsOf(s: Seeded): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [table, rule] of Object.entries(DELETION_MAP)) {
    const conds = [...(rule.pid ?? []), ...(rule.kept ?? [])].map((c) => `${c} = ?1`).concat((rule.tg ?? []).map((c) => `${c} = ?2`));
    if (conds.length) out[table] = await count(`${table} WHERE ${conds.join(' OR ')}`, ...(rule.tg?.length ? [s.pid, s.tg] : [s.pid]));
  }
  return out;
}

describe('deleteAccount (ADR-0009 §7)', () => {
  it('leaves no personal row, keeps the records against the tombstone and touches no one else', async () => {
    const victim = await seedEverywhere();
    const bystander = await seedEverywhere();
    const before = await rowsOf(bystander);
    const now = Date.now();

    expect(await deleteAccount(env, victim.pid, 'self', now)).toBe('done');

    const after = await rowsOf(victim);
    for (const [table, rule] of Object.entries(DELETION_MAP)) {
      // The name history keeps one row (below); the seeded clan had only the victim, so it is disbanded (see the clan test).
      if (!(table in after) || table === 'display_name_history' || table === 'clans') continue;
      if (rule.rule === 'delete' || rule.rule === 'release') expect(after[table], `${table} still has the player`).toBe(0);
      else expect(after[table], `${table} lost its kept rows`).toBeGreaterThan(0);
    }
    // Only the row that holds the freed name is left of the name history.
    expect((await DB().prepare('SELECT new FROM display_name_history WHERE player_id = ?1').bind(victim.pid).all()).results).toEqual([{ new: DELETED_NAME }]);
    expect(await count('password_hashes WHERE identity_id = (SELECT id FROM auth_identities WHERE player_id = ?1)', victim.pid)).toBe(0);
    const h = await emailKeyHash(victim.email);
    expect(await count('auth_throttle WHERE key IN (?1, ?2)', `login:${h}`, `mail:h:${h}`)).toBe(0);
    expect(await count('email_tokens WHERE email_norm = ?1', victim.email)).toBe(0);

    // The tombstone: no personal field, hidden from public boards.
    const p = await DB().prepare('SELECT * FROM players WHERE id = ?1').bind(victim.pid).first<Record<string, unknown>>();
    expect(p).toMatchObject({
      display_name: DELETED_NAME,
      display_name_key: `deleted:${victim.pid}`,
      telegram_id: null,
      username: null,
      first_name: null,
      language_code: null,
      is_premium: 0,
      public_boards: 0,
      deleted_at: now,
    });
    expect(await DB().prepare('SELECT step, finished_at FROM deletion_jobs WHERE player_id = ?1').bind(victim.pid).first()).toEqual({ step: DELETION_STEPS.length, finished_at: now });

    // The bystander lost nothing.
    expect(await rowsOf(bystander)).toEqual(before);
  });

  it('shows the player as "Deleted player" to others and holds the freed name for 30 days', async () => {
    const victim = await devLogin(++tg);
    const other = await devLogin(++tg);
    const key = (await DB().prepare('SELECT display_name_key AS k FROM players WHERE id = ?1').bind(victim.playerId).first<{ k: string }>())!.k;
    const now = Date.now();
    expect(await deleteAccount(env, victim.playerId, 'self', now)).toBe('done');
    expect((await playerNames(DB(), [victim.playerId])).get(victim.playerId)).toBe(DELETED_NAME);
    expect(await nameKeyHeld(DB(), key, other.playerId, now + 29 * DAY)).toBe(true);
    expect(await nameKeyHeld(DB(), key, other.playerId, now + 31 * DAY)).toBe(false);
  });

  it('ends every session at once, and the Telegram user who comes back gets a new, empty player', async () => {
    const me = await devLogin(++tg);
    expect((await api('/api/me', { token: me.token })).status).toBe(200);
    expect(await deleteAccount(env, me.playerId, 'self')).toBe('done');
    expect((await api('/api/me', { token: me.token })).status).toBe(401);
    const again = await devLogin(tg);
    expect(again.playerId).not.toBe(me.playerId);
  });

  it('is idempotent: a second call does nothing and still answers done', async () => {
    const s = await seedEverywhere();
    expect(await deleteAccount(env, s.pid, 'self')).toBe('done');
    expect(await deleteAccount(env, s.pid, 'self')).toBe('done');
  });

  it('refuses a busy player and changes nothing', async () => {
    const me = await devLogin(++tg);
    const other = await devLogin(++tg);
    const now = Date.now();
    await DB()
      .prepare(`INSERT INTO duel_matches (id, mode, seed, player_a, player_b, setup, teams, status, created_at) VALUES (?1, 'ranked', 1, ?2, ?3, '{}', '[]', 'live', ?4)`)
      .bind(`m${++uniq}`, me.playerId, other.playerId, now)
      .run();
    expect(await deleteAccount(env, me.playerId, 'self', now)).toBe('busy');
    expect(await DB().prepare('SELECT deleted_at FROM players WHERE id = ?1').bind(me.playerId).first()).toEqual({ deleted_at: null });
    expect(await count('deletion_jobs WHERE player_id = ?1', me.playerId)).toBe(0);
    expect((await api('/api/me', { token: me.token })).status).toBe(200);
  });

  it('refuses a player with an open duel ticket', async () => {
    const me = await devLogin(++tg);
    const now = Date.now();
    await DB()
      .prepare(
        `INSERT INTO duel_tickets (id, player_id, floor, seed, setup, team, created_at, expires_at)
         VALUES (?1, ?2, 1, 1, '{}', '[]', ?3, ?4)`,
      )
      .bind(`b${++uniq}`, me.playerId, now, now + 60_000)
      .run();
    expect(await deleteAccount(env, me.playerId, 'self', now)).toBe('busy');
  });
});

describe('leaving shared structures', () => {
  const SEASON = 990_001;
  async function clanOf(members: { pid: number; role: string; joined: number }[]): Promise<number> {
    const clan = await DB()
      .prepare(`INSERT INTO clans (season_id, shard_id, name, tag, created_by, created_at) VALUES (?1, 1, ?2, ?4, ?3, 1) RETURNING id`)
      .bind(SEASON, `Clan${++uniq}`, members[0].pid, `T${uniq % 10000}`)
      .first<{ id: number }>();
    for (const m of members)
      await DB().prepare('INSERT INTO clan_members (season_id, player_id, clan_id, role, joined_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(SEASON, m.pid, clan!.id, m.role, m.joined).run();
    return clan!.id;
  }

  it('a leader hands the clan to the longest-serving officer; an empty clan is disbanded with its invites', async () => {
    const [leader, member, officer, loner] = await Promise.all([devLogin(++tg), devLogin(++tg), devLogin(++tg), devLogin(++tg)]);
    const clan = await clanOf([
      { pid: leader.playerId, role: 'leader', joined: 1 },
      { pid: member.playerId, role: 'member', joined: 2 },
      { pid: officer.playerId, role: 'officer', joined: 3 },
    ]);
    const solo = await clanOf([{ pid: loner.playerId, role: 'leader', joined: 1 }]);
    await DB().prepare("INSERT INTO clan_invites (code, clan_id, created_by, created_at, expires_at, max_uses) VALUES (?1, ?2, ?3, 1, 9e15, 5)").bind(`c${++uniq}`, solo, loner.playerId).run();

    expect(await deleteAccount(env, leader.playerId, 'self')).toBe('done');
    expect(await deleteAccount(env, loner.playerId, 'self')).toBe('done');

    const roles = (await DB().prepare('SELECT player_id, role FROM clan_members WHERE clan_id = ?1 ORDER BY player_id').bind(clan).all()).results;
    expect(roles).toEqual(
      [
        { player_id: member.playerId, role: 'member' },
        { player_id: officer.playerId, role: 'leader' },
      ].sort((a, b) => a.player_id - b.player_id),
    );
    expect(await count('clans WHERE id = ?1', clan)).toBe(1);
    expect(await count('clans WHERE id = ?1', solo)).toBe(0);
    expect(await count('clan_invites WHERE clan_id = ?1', solo)).toBe(0);
  });
});

describe('live connections', () => {
  it('a player waiting in the duel queue is busy', async () => {
    const d = await openDuellist(++tg, { level5: true });
    const mm = await wsPath(d.token, '/ws/duel');
    await mm.next('mm_welcome');
    mm.send({ type: 'queue', mode: 'unranked' });
    await mm.next('queued');
    expect(await deleteAccount(env, d.pid, 'self')).toBe('busy');
    mm.send({ type: 'cancel' });
    await mm.next('unqueued');
    expect(await deleteAccount(env, d.pid, 'self')).toBe('done');
  });
});

describe('resumable deletion jobs', () => {
  for (let k = 1; k < DELETION_STEPS.length; k++) {
    it(`a run interrupted after ${k} step(s) is finished by the cron`, async () => {
      const s = await seedEverywhere();
      const now = Date.now();
      expect(await deleteAccount(env, s.pid, 'self', now, { maxSteps: k })).toBe('resumable');
      // Gone for the player at once: no session, no way to log in with the old identities.
      expect((await api('/api/me', { token: s.token })).status).toBe(401);
      expect(await DB().prepare('SELECT step, finished_at FROM deletion_jobs WHERE player_id = ?1').bind(s.pid).first()).toEqual({ step: k, finished_at: null });

      const r = await finishDeletions(env, now + DAY);
      expect(r.finished).toBeGreaterThanOrEqual(1);
      const after = await rowsOf(s);
      for (const [table, rule] of Object.entries(DELETION_MAP))
        if (table in after && table !== 'display_name_history' && (rule.rule === 'delete' || rule.rule === 'release')) expect(after[table], table).toBe(0);
      expect((await DB().prepare('SELECT new FROM display_name_history WHERE player_id = ?1').bind(s.pid).all()).results).toEqual([{ new: DELETED_NAME }]);
      expect(await DB().prepare('SELECT display_name FROM players WHERE id = ?1').bind(s.pid).first()).toEqual({ display_name: DELETED_NAME });
    });
  }

  it('the daily housekeeping cron finishes interrupted runs', async () => {
    const me = await devLogin(++tg);
    expect(await deleteAccount(env, me.playerId, 'self', Date.now(), { maxSteps: 1 })).toBe('resumable');
    const ctx = createExecutionContext();
    worker.scheduled(createScheduledController({ cron: '17 3 * * *', scheduledTime: Date.now() }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await DB().prepare('SELECT finished_at IS NOT NULL AS done FROM deletion_jobs WHERE player_id = ?1').bind(me.playerId).first()).toEqual({ done: 1 });
  });

  it('a request on a started job resumes it instead of starting over', async () => {
    const me = await devLogin(++tg);
    expect(await deleteAccount(env, me.playerId, 'conflict', Date.now(), { maxSteps: 2 })).toBe('resumable');
    expect(await deleteAccount(env, me.playerId, 'self')).toBe('done');
    expect(await DB().prepare('SELECT reason FROM deletion_jobs WHERE player_id = ?1').bind(me.playerId).first()).toEqual({ reason: 'conflict' });
  });

  it('the cron sweeps rows written for a player after the deletion finished (a match settling late)', async () => {
    const me = await devLogin(++tg);
    const now = Date.now();
    expect(await deleteAccount(env, me.playerId, 'self', now)).toBe('done');
    await DB().prepare("INSERT INTO duel_ratings (player_id, ladder, updated_at) VALUES (?1, 'live', ?2)").bind(me.playerId, now).run();
    await finishDeletions(env, now + 60_000);
    expect(await count('duel_ratings WHERE player_id = ?1', me.playerId)).toBe(0);
  });
});

describe('ban tombstones (ADR-0009 §7.7)', () => {
  const ORIGIN = { origin: new URL(env.GAME_URL ?? 'https://play.pixelarrow.app').origin };
  const signup = async (email: string) => {
    expect((await api('/api/auth/signup', { method: 'POST', json: { email, password: 'a-long-enough-pass-1', turnstile: 'XXXX.DUMMY.TOKEN.XXXX' }, headers: ORIGIN })).status).toBe(202);
    for (let i = 0; i < 100; i++) {
      const m = await DB().prepare('SELECT text FROM dev_outbox WHERE to_addr = ?1 ORDER BY id DESC').bind(email).first<{ text: string }>();
      const t = m && /#t=([A-Za-z0-9_-]{43})/.exec(m.text)?.[1];
      if (t) return api('/api/auth/verify', { method: 'POST', json: { token: t }, headers: ORIGIN });
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('no verify mail');
  };

  async function bannedWithEmail() {
    const me = await devLogin(++tg);
    const email = `banned${tg}@example.com`;
    const now = Date.now();
    await DB().batch([
      DB().prepare(`INSERT INTO auth_identities (player_id, kind, subject, email, verified_at, created_at) VALUES (?1, 'password', ?2, ?2, ?3, ?3)`).bind(me.playerId, email, now),
      DB().prepare("UPDATE players SET banned_at = ?2, ban_reason = 'cheating' WHERE id = ?1").bind(me.playerId, now - DAY),
    ]);
    return { ...me, tg, email, now };
  }

  it('keeps only peppered hashes of a deleted banned player’s identities, for 180 days', async () => {
    const b = await bannedWithEmail();
    expect(await deleteAccount(env, b.playerId, 'admin', b.now)).toBe('done');
    const pepper = peppersFromEnv(env).current;
    const rows = (await DB().prepare('SELECT identity_hash, banned_at, expires_at FROM ban_tombstones WHERE identity_hash IN (?1, ?2)').bind(
      await banIdentityHash(pepper, 'telegram', String(b.tg)),
      await banIdentityHash(pepper, 'password', b.email),
    ).all<{ banned_at: number; expires_at: number }>()).results;
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r).toMatchObject({ banned_at: b.now - DAY, expires_at: b.now + 180 * DAY });
    // Nothing else of the identities survives anywhere.
    expect(await count('auth_identities WHERE subject IN (?1, ?2)', String(b.tg), b.email)).toBe(0);
    expect(await DB().prepare('SELECT ban_reason, banned_at FROM players WHERE id = ?1').bind(b.playerId).first()).toEqual({ ban_reason: null, banned_at: b.now - DAY });
  });

  it('blocks Telegram log-in and sign-up with the same identities', async () => {
    const b = await bannedWithEmail();
    expect(await deleteAccount(env, b.playerId, 'admin', b.now)).toBe('done');
    const tgLogin = await api('/api/auth/telegram', { method: 'POST', json: { dev: { id: b.tg, first_name: 'Again' } }, headers: { 'cf-connecting-ip': '10.9.9.9' } });
    expect(tgLogin.status).toBe(403);
    expect((await tgLogin.json<{ error: { code: string } }>()).error.code).toBe('banned');
    const verify = await signup(b.email);
    expect(verify.status).toBe(403);
    expect(await count('auth_identities WHERE subject IN (?1, ?2)', String(b.tg), b.email)).toBe(0);
  });

  it('lets the identities of a deleted player who was not banned sign up again', async () => {
    const me = await devLogin(++tg);
    const email = `fine${tg}@example.com`;
    await DB().prepare(`INSERT INTO auth_identities (player_id, kind, subject, email, verified_at, created_at) VALUES (?1, 'password', ?2, ?2, 1, 1)`).bind(me.playerId, email).run();
    expect(await deleteAccount(env, me.playerId, 'self')).toBe('done');
    expect((await signup(email)).status).toBe(200);
    expect((await devLogin(tg)).playerId).not.toBe(me.playerId);
  });

  it('expire after 180 days (the cron prunes them)', async () => {
    const b = await bannedWithEmail();
    expect(await deleteAccount(env, b.playerId, 'admin', b.now)).toBe('done');
    await finishDeletions(env, b.now + 181 * DAY);
    const h = await banIdentityHash(peppersFromEnv(env).current, 'telegram', String(b.tg));
    expect(await count('ban_tombstones WHERE identity_hash = ?1', h)).toBe(0);
  });
});

describe('admin deletion', () => {
  const ADMIN = 'test-admin-token-0123456789abcdef0123456789';
  const del = (pid: number, requestId = `req_${crypto.randomUUID().replace(/-/g, '')}`) =>
    api(`/api/admin/players/${pid}/delete`, { method: 'POST', token: ADMIN, json: { requestId, reason: 'deletion requested by email' } });

  it('deletes a player (e.g. a banned email-only player who asked support) and audits it', async () => {
    const me = await devLogin(++tg);
    await DB().prepare('UPDATE players SET banned_at = ?2 WHERE id = ?1').bind(me.playerId, Date.now()).run();
    const r = await del(me.playerId);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ result: 'done', replayed: false });
    expect(await DB().prepare('SELECT reason FROM deletion_jobs WHERE player_id = ?1').bind(me.playerId).first()).toEqual({ reason: 'admin' });
    expect(await count("admin_audit WHERE player_id = ?1 AND action = 'delete'", me.playerId)).toBe(1);
  });

  it('needs the admin token', async () => {
    const me = await devLogin(++tg);
    expect((await api(`/api/admin/players/${me.playerId}/delete`, { method: 'POST', token: me.token, json: { requestId: 'req_abcdefgh', reason: 'nope' } })).status).toBe(401);
    expect(await count('deletion_jobs WHERE player_id = ?1', me.playerId)).toBe(0);
  });
});

describe('in-game duel boards (V6-041)', () => {
  it('leave out banned and deleted players, in the rows and in the player’s own rank', async () => {
    const [banned, deleting, me] = await Promise.all([devLogin(++tg), devLogin(++tg), devLogin(++tg)]);
    const now = Date.now();
    const cur = seasonId(now);
    // Far above anyone else in this file, so they would rank first and second.
    for (const [pid, rating] of [[banned.playerId, 9100], [deleting.playerId, 9000], [me.playerId, 8900]])
      await DB()
        .prepare("INSERT INTO duel_ratings (player_id, ladder, rating, rd, vol, games, updated_at, season, played_at) VALUES (?1, 'live', ?2, 60, 0.06, 20, 0, ?3, 0)")
        .bind(pid, rating, cur)
        .run();
    await DB().batch([
      DB().prepare('UPDATE players SET banned_at = ?2 WHERE id = ?1').bind(banned.playerId, now),
      DB().prepare('UPDATE players SET deleted_at = ?2 WHERE id = ?1').bind(deleting.playerId, now),
    ]);
    const board = await leaderboard(DB(), 'live', me.playerId, now);
    expect(board.rows[0].pid).toBe(me.playerId);
    expect(board.rows.some((r) => r.pid === banned.playerId || r.pid === deleting.playerId)).toBe(false);
    expect(board.me?.rank).toBe(1);
  });
});
