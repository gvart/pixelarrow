/**
 * AB-01 on the duel server: the /develop route validates perk paths with the
 * shared perkBlocker (src/duel/rules.ts developHero), stored D1 heroes from
 * before the paths keep their perks, a team with B picks replays to the same
 * hash, and a perk choice costs no budget points.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Hero } from '../../src/data/units';
import { heroPoints } from '../../src/duel/rules';
import { perkPath, type PerkId } from '../../src/data/perks';
import type { BattleSetup } from '../../src/sim/types';
import { DB, fresh, getJson, openDuellist, play, post } from './onlineHelpers';

beforeEach(fresh);

interface Profile {
  heroes: Hero[];
  team: string[];
}

const setHero = (h: Hero) => DB().prepare('UPDATE duel_heroes SET data = ?2 WHERE id = ?1').bind(h.id, JSON.stringify(h)).run();
const err = (r: { body: unknown }) => (r.body as { error: { code: string } }).error.code;

describe('duel perk paths (server)', () => {
  it('/develop takes path B, refuses a second pick in a tier, and refuses A and B in one request', async () => {
    const { token, profile } = await openDuellist<Profile>(9401);
    const h = profile.heroes.find((x) => x.cls === 'hoplite')!;
    await setHero({ ...h, level: 4, points: 0, perks: [] });
    expect(err(await post('/api/duel/develop', token, { heroId: h.id, perks: ['drilled', 'shield_drill'] }))).toBe('bad_perk');
    const dev = await post<{ hero: Hero }>('/api/duel/develop', token, { heroId: h.id, perks: ['drilled', 'push'] });
    expect(dev.status).toBe(200);
    expect(dev.body.hero.perks).toEqual(['drilled', 'push']);
    const second = await post('/api/duel/develop', token, { heroId: h.id, perks: ['shield_drill'] });
    expect(second.status).toBe(409);
    expect(err(second)).toBe('bad_perk');
    // the refused pick changed nothing
    const now = (await getJson<Profile>('/api/duel/profile', token)).body.heroes.find((x) => x.id === h.id)!;
    expect(now.perks).toEqual(['drilled', 'push']);
  });

  it('an old D1 hero with the linear chain loads unchanged, all path A, and develops on', async () => {
    const { token, profile } = await openDuellist<Profile>(9402);
    const archer = profile.heroes.find((x) => x.cls === 'archer')!;
    const old: PerkId[] = ['longshot', 'volley', 'deep_quiver'];
    await setHero({ ...archer, level: 8, points: 0, perks: old });
    const loaded = (await getJson<Profile>('/api/duel/profile', token)).body.heroes.find((x) => x.id === archer.id)!;
    expect(loaded.perks).toEqual(old);
    for (let t = 0; t < 3; t++) expect(perkPath(loaded, t)).toBe('A');
    const dev = await post<{ hero: Hero }>('/api/duel/develop', token, { heroId: archer.id, perks: ['steady_presence'] });
    expect(dev.status).toBe(200);
    expect(dev.body.hero.perks).toEqual([...old, 'steady_presence']);
  });

  it('a perk choice costs no budget: A and B heroes are worth the same points', async () => {
    const { profile } = await openDuellist<Profile>(9403);
    const h = { ...profile.heroes.find((x) => x.cls === 'hoplite')!, level: 4 };
    expect(heroPoints({ ...h, perks: ['drilled', 'push'] })).toBe(heroPoints({ ...h, perks: ['shield_drill', 'shield_bash'] }));
    expect(heroPoints({ ...h, perks: ['drilled'] })).toBe(heroPoints({ ...h, perks: [] }));
  });

  it('a ladder battle with B picks in the team replays to the claimed hash', async () => {
    const { token, profile } = await openDuellist<Profile>(9404);
    const slinger = profile.heroes.find((x) => x.cls === 'slinger')!;
    await setHero({ ...slinger, level: 2, points: 0, perks: ['fleet'] });
    const t = await post<{ ticket: string; setup: BattleSetup; team: Hero[] }>('/api/duel/ladder/start', token, { floor: 1 });
    expect(t.status).toBe(200);
    expect(t.body.team.find((x) => x.id === slinger.id)!.perks).toEqual(['fleet']);
    const sub = play(t.body.setup);
    const r = await post('/api/duel/ladder/submit', token, { ticket: t.body.ticket, ...sub });
    expect(r.status).toBe(200);
  });
});
