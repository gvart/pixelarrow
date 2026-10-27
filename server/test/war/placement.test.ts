/** War DO placement (server/src/war/placement.ts, docs/OPS.md "War DO placement"): names, hints, the where diagnostic. */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { doHint, doName, parseColo, PLACEMENT_GEN, regionStub, worldStub } from '../../src/war/placement';
import { api } from '../helpers';

const ADMIN = 'test-admin-token-0123456789abcdef0123456789';
const ip = { 'cf-connecting-ip': '203.0.113.77' };

describe('war DO placement', () => {
  it('names every object in the current placement generation', () => {
    expect(doName('dodona')).toBe(`dodona@${PLACEMENT_GEN}`);
    expect(regionStub(env, 'dodona').id.equals(env.WAR_REGION.idFromName(doName('dodona')))).toBe(true);
    expect(worldStub(env).id.equals(env.WAR_WORLD.idFromName(doName('world')))).toBe(true);
    expect(regionStub(env, 'dodona').id.equals(env.WAR_REGION.idFromName('dodona'))).toBe(false); // the old object is left behind
  });

  it('asks for WAR_DO_HINT, else weur', () => {
    expect(doHint({})).toBe('weur');
    expect(doHint({ WAR_DO_HINT: 'enam' })).toBe('enam');
    expect(doHint({ WAR_DO_HINT: 'mars' })).toBe('weur');
  });

  it('reads the colo off cdn-cgi/trace', () => {
    expect(parseColo('fl=1\nh=cloudflare.com\nip=1.2.3.4\nts=1\ncolo=FRA\nhttp=http/2\n')).toBe('FRA');
    expect(parseColo('nothing')).toBe('unknown');
  });

  it('GET /api/admin/war/where answers the colos of the entry, the world and a region (admin only)', async () => {
    expect((await api('/api/admin/war/where', { headers: ip })).status).toBe(401);
    const res = await api('/api/admin/war/where?region=dodona', { token: ADMIN, headers: ip });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ world: 'local', region: 'dodona', regionColo: 'local', hint: 'weur', generation: PLACEMENT_GEN });
    expect((await api('/api/admin/war/where?region=atlantis', { token: ADMIN, headers: ip })).status).toBe(404);
  });
});
