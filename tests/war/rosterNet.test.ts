import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The soldier card's skill tree and attribute points (src/war/view/hud/roster): online (net mode) the roster is the
// server's and a choice goes up as POST /persons/:id/level; a pending skill does not hold back his points.
import { SandboxRoster, type NetPerson } from '../../src/war/view/hud/roster/state';
import { soldierTree, takeSoldier } from '../../src/war/view/hud/roster/skillTree';
import type { SandboxScene } from '../../src/war/view/SandboxScene';

// the tree's rank (../roster/markers.ts) sits beside the map pips, which pull in Phaser and the unit layer; no canvas here
vi.mock('../../src/war/view/hud/roster/markers', () => ({ rankOf: (_cls: string, level: number) => (level >= 6 ? 'elite' : level >= 3 ? 'veteran' : 'recruit') }));

const nikias = (o: Partial<NetPerson> = {}): NetPerson => ({
  id: 'w7-abcde', cls: 'militia', name: 'Nikias', level: 3, xp: 0, kills: 0, battles: 0, attrs: { str: 6, agi: 6, end: 5, wil: 5 },
  skills: [], gear: {}, honours: [], state: 'active', region: null, pending: { points: 2 }, perks: [], deeds: [], scars: 0, ...o,
});

/** A scene stub: the sim's API answers from `server` (GET roster, POST persons/:id/level as the server applies it). */
function scene(net: boolean, server: { man: NetPerson; posts: { path: string; body: unknown }[] }) {
  const api = vi.fn(async (method: string, path: string, body?: unknown) => {
    if (method === 'GET' && path === 'roster') return { persons: [server.man] };
    if (method === 'POST' && path === `persons/${server.man.id}/level`) {
      server.posts.push({ path, body });
      const b = body as { attrs?: Record<string, number>; skill?: string }, m = server.man;
      const spent = Object.values(b.attrs ?? {}).reduce((a, n) => a + n, 0);
      const attrs = { ...m.attrs };
      for (const [k, n] of Object.entries(b.attrs ?? {})) attrs[k as keyof typeof attrs] = (attrs[k as keyof typeof attrs] ?? 0) + n;
      server.man = { ...m, attrs, pending: { points: m.pending.points - spent }, skills: b.skill ? [...(m.skills ?? []), b.skill as never] : m.skills };
      return { ok: true };
    }
    return null;
  });
  const sim = { net, api, cur: null, squads: new Map(), personsFor: null, onEvents: null, setPerson: vi.fn(), endFight: async () => null };
  return { s: { sim, region: null } as unknown as SandboxScene, api };
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('soldier card: skill tree and attribute points', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('online the roster is the server one, so his tree opens with the skill and the points open', async () => {
    const server = { man: nikias(), posts: [] as { path: string; body: unknown }[] };
    const { s } = scene(true, server);
    const R = new SandboxRoster(s);
    await flush();
    expect(R.rows().map((r) => r.p.hero.name)).toEqual(['Nikias']); // not the local seed
    const p = R.roster.get('w7-abcde')!;
    expect(p.hero.points).toBe(2);
    const g = soldierTree(R, p).graph;
    const open = g.nodes.filter((n) => n.state === 'open').map((n) => n.id);
    expect(open.filter((id) => id.startsWith('s0:'))).toHaveLength(2); // the skill pair of slot I
    expect(open.filter((id) => id.startsWith('a:'))).toEqual(['a:str', 'a:agi', 'a:end', 'a:wil']); // points beside the skill
  });

  it('online a choice goes up to the server and its roster comes back', async () => {
    const server = { man: nikias(), posts: [] as { path: string; body: unknown }[] };
    const { s } = scene(true, server);
    const R = new SandboxRoster(s);
    await flush();
    takeSoldier(R, 'w7-abcde', 'a:end');
    expect(R.roster.get('w7-abcde')!.hero.attrs.end).toBe(7); // shown at once
    await flush();
    const skill = soldierTree(R, R.roster.get('w7-abcde')!).graph.nodes.find((n) => n.state === 'open' && n.id.startsWith('s0:'))!.id;
    takeSoldier(R, 'w7-abcde', skill);
    await flush();
    expect(server.posts.map((x) => x.body)).toEqual([{ attrs: { end: 2 } }, { skill: skill.slice(3) }]);
    const p = R.roster.get('w7-abcde')!;
    expect(p.hero.points).toBe(0);
    expect(p.hero.attrs.end).toBe(7);
    expect(p.skills).toEqual([skill.slice(3)]);
    expect(R.offers('w7-abcde')).toEqual([]);
  });

  it('offline the seeded level-3 man spends his points before or after his skill, locally', () => {
    const { s, api } = scene(false, { man: nikias(), posts: [] });
    const R = new SandboxRoster(s);
    const row = R.rows().find((r) => R.offers(r.p.id).some((o) => o.kind === 'skill'))!;
    expect(row.p.hero.points).toBe(2);
    takeSoldier(R, row.p.id, 'a:str');
    const p = R.roster.get(row.p.id)!;
    expect([p.hero.points, p.hero.attrs.str]).toEqual([0, row.p.hero.attrs.str + 2]);
    expect(R.offers(row.p.id).every((o) => o.kind === 'skill')).toBe(true); // the skill still waits
    expect(api).not.toHaveBeenCalled();
  });
});
