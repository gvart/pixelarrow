/**
 * V6-LINK-01, N-DN-1: no response another player can read carries a
 * player's Telegram first name, username or id. A victim with distinctive
 * Telegram data plays alongside an observer in the online season (same
 * clan) and the duels (rated, in the async pool); every response the
 * observer gets is scanned recursively.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DB, fresh, getJson, join, openDuellist, post } from './onlineHelpers';

beforeEach(fresh);
afterEach(() => vi.restoreAllMocks());

const FORBIDDEN_KEYS = new Set(['first_name', 'firstName', 'username', 'telegram_id', 'telegramId', 'telegramUsername']);

/** Every leak of the victim's Telegram data in `value`, as JSON paths. */
function leaks(value: unknown, victim: { first: string; user: string; tg: number }, path = '$'): string[] {
  if (typeof value === 'string') {
    const s = value.toLowerCase();
    return s.includes(victim.first.toLowerCase()) || s.includes(victim.user.toLowerCase()) || s.includes(String(victim.tg)) ? [path] : [];
  }
  if (typeof value === 'number') return value === victim.tg ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => leaks(v, victim, `${path}[${i}]`));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) => [...(FORBIDDEN_KEYS.has(k) ? [`${path}.${k} (key)`] : []), ...leaks(v, victim, `${path}.${k}`)]);
  return [];
}

describe('display names on every public surface (N-DN-1)', () => {
  it('online and duel responses never carry another player’s first_name, username or telegram_id', async () => {
    const tg = 987_650_001;
    const victim = { first: 'Zebulonia', user: 'zeb_secret_handle', tg };
    const v = await join(tg, victim.first);
    await DB().prepare('UPDATE players SET username = ?2 WHERE id = ?1').bind(v.playerId, victim.user).run();
    const o = await join(tg + 1, 'Observer');

    // A clan with both of them (rosters).
    expect((await post('/api/online/clans', v.token, { name: 'Night Watch', tag: 'NW' })).status).toBe(200);
    const inv = await post<{ code: string }>('/api/online/clans/invite', v.token);
    expect((await post('/api/online/clans/join', o.token, { code: inv.body.code })).status).toBe(200);

    // Rated duellists, both in the async pool.
    await openDuellist(tg, { name: victim.first, level5: true, rating: 1700 });
    await openDuellist(tg + 1, { name: 'Observer', level5: true, rating: 1650 });

    const seen: { what: string; body: unknown }[] = [];
    for (const path of [
      '/api/online/profile',
      '/api/online/season',
      '/api/online/clans/mine',
      `/api/online/clans/invite/${inv.body.code}`,
      '/api/duel/profile',
      '/api/duel/ranked',
      '/api/duel/async',
      '/api/duel/async/log',
      '/api/duel/season',
      '/api/duel/leaderboard?board=live',
      '/api/duel/leaderboard?board=async',
      '/api/duel/leaderboard?board=legend',
    ]) {
      const r = await getJson(path, o.token);
      expect(r.status, path).toBe(200);
      seen.push({ what: path, body: r.body });
    }

    const found = seen.flatMap((s) => leaks(s.body, victim).map((p) => `${s.what} ${p}`));
    expect(found).toEqual([]);
    // The victim does appear, under the display name (the scan looked at real rows).
    const all = JSON.stringify(seen);
    expect(all).toContain(v.name);
  });

  it('clan names go through the shared validator (3-20 characters), and tags through the blocklist', async () => {
    const p = await join(987_650_201);
    for (const [name, reason] of [['Leonidas\' Men', 'chars'], ['Admin Guild', 'reserved'], ['Sons of Sparta Forever', 'length'], ['Spar\u0442ans', 'mixed_script']] as const) {
      const r = await post<{ error: { code: string; reason: string } }>('/api/online/clans', p.token, { name, tag: 'SP' });
      expect(r.status, name).toBe(400);
      expect(r.body.error).toMatchObject({ code: 'invalid_name', reason });
    }
    expect((await post('/api/online/clans', p.token, { name: 'Spartans', tag: 'FUCK' })).status).toBe(400);
    const ok = await post<{ clan: { name: string } }>('/api/online/clans', p.token, { name: '  Sea   Hawks ', tag: 'SH' });
    expect(ok.status).toBe(200);
    expect(ok.body.clan.name).toBe('Sea Hawks');
  });
});
