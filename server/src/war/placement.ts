/**
 * Where the war's Durable Objects live (docs/OPS.md "War DO placement"). An object stays in the data centre that first
 * created it, so every stub asks for WAR_DO_HINT (default weur) and every name carries a placement generation: bump
 * PLACEMENT_GEN to create the objects afresh (their DO storage is left behind; D1 is the truth they rebuild from).
 */
import type { Env } from '../env';
import { WORLD_NAME } from './world/world';

export const PLACEMENT_GEN = 'p2';
const HINTS: readonly string[] = ['wnam', 'enam', 'sam', 'weur', 'eeur', 'apac', 'oc', 'afr', 'me'];

/** The object name of a war region or the world in the current placement generation. */
export const doName = (name: string): string => `${name}@${PLACEMENT_GEN}`;

export function doHint(env: Pick<Env, 'WAR_DO_HINT'>): DurableObjectLocationHint {
  const h = env.WAR_DO_HINT?.trim();
  return h && HINTS.includes(h) ? (h as DurableObjectLocationHint) : 'weur';
}

export const regionStub = (env: Env, region: string) => env.WAR_REGION.get(env.WAR_REGION.idFromName(doName(region)), { locationHint: doHint(env) });
export const worldStub = (env: Env, name = WORLD_NAME) => env.WAR_WORLD.get(env.WAR_WORLD.idFromName(doName(name)), { locationHint: doHint(env) });

/** The `colo=` line of a cdn-cgi/trace body. */
export const parseColo = (trace: string): string => /^colo=(\w+)$/m.exec(trace)?.[1] ?? 'unknown';

/** The data centre this code runs in (asked of cdn-cgi/trace; 'local' in dev and tests, which have none). */
export async function runningColo(env: Pick<Env, 'DEV_AUTH'>): Promise<string> {
  if (env.DEV_AUTH === '1') return 'local';
  const r = await fetch('https://cloudflare.com/cdn-cgi/trace');
  return parseColo(await r.text());
}
