/**
 * W-68 captives and dismissal on the server (docs/WAR.md "Lifecycle"; the pure rules: src/war/sim/captives.ts).
 *
 *  - A captured man (./persons.ts applyFight) leaves his owner's army at once; his captor holds him (`captor_pid`).
 *  - askToJoin: after CAPTIVE.askMs the captor asks; he refuses for good (refuses: by chance, fixed per man) or moves to
 *    the captor's army (./persons.ts movePerson, the transfer W-69's men trade will reuse) with his level, class and
 *    record, in his class's starter kit (his own fell where he was taken). A full army refuses before the roll.
 *  - releaseCaptive (the captor, any time), releaseDue (CAPTIVE.holdMs unclaimed, lazily on either player's read),
 *    raids and an unpaid captor (./persons.ts): released, as souls.
 *  - dismiss: his owner lets a man of his go: his gear drops where he stands (a pile in his live region, SOULS.dismiss),
 *    else into the home strongroom; his soul rises, and the owner may not claim it for CAPTIVE.barMs.
 *  - toSouls: the man becomes `soul` (held_at: the region he waits in, until_at: when he fades) and wakes as a named soul
 *    at a shrine of the region he was in, else of the nearest region with one (soulRegions, asking each region's room in
 *    turn: SOULS.spawn, wired by ./regionDO.ts). A room not running keeps him in D1 and wakes him when it starts
 *    (regionDO wakeSouls). His soul's fade or loss marks him `faded`.
 */
import { CAPTIVE, askAt, refuses, soulRegions } from '../../../src/war/sim/captives';
import type { Equipment } from '../../../src/data/units';
import type { Item } from '../../../src/data/items';
import type { WarPerson } from '../../../src/war/types';
import { ApiError } from '../errors';
import { placeItemStmt, strongroom } from './holders';
import { armyCount, COLS, json, kitOf, movePerson, person, personOf, type PersonRow, type PersonState } from './persons';
import { ARMY_MAX } from '../../../src/war/sim/soldiers';
import { isCivClass } from '../../../src/data/classes';

/** What a region's room is handed to wake a named soul: the man, how long he waits, the owner barred and how long. */
export interface NamedSoul { person: WarPerson; lifeMs: number; bar?: { pid: number; ms: number } }
/** ok: he woke there; none: no shrine in that region; absent: no room here (he waits in D1 until it starts). */
export type SoulSpawn = (region: string, soul: NamedSoul) => Promise<'ok' | 'none' | 'absent'>;

/** The live rooms (wired by ./regionDO.ts wirePresence; tests: absent). */
export const SOULS: { spawn: SoulSpawn; dismiss: (region: string, id: string) => Promise<{ x: number; y: number } | null> } = {
  spawn: async () => 'absent',
  dismiss: async () => null,
};

/** The named soul a soul row wakes as, at `now`: in his class's starter kit, the time he has left, the bar if any. */
export function namedSoul(r: PersonRow, now: number): NamedSoul {
  const p = personOf(r);
  return {
    person: p,
    lifeMs: Math.max(0, (r.until_at ?? now) - now),
    ...(r.bar_pid !== null && r.bar_until !== null && r.bar_until > now ? { bar: { pid: r.bar_pid, ms: r.bar_until - now } } : {}),
  };
}

/**
 * These men (in their current state) become named souls: written first (state `soul`, the class kit, CAPTIVE.soulMs to
 * wait), then woken in the first region of soulRegions(where he was) that has a shrine. `bar`: the owner who dismissed
 * him may not claim him for CAPTIVE.barMs. Returns how many became souls.
 */
export async function toSouls(db: D1Database, rows: readonly PersonRow[], now: number, o: { bar?: number; spawn?: SoulSpawn; from?: (r: PersonRow) => string } = {}): Promise<number> {
  const spawn = o.spawn ?? SOULS.spawn;
  let n = 0;
  for (const r of rows) {
    const origin = o.from?.(r) ?? r.held_at ?? r.region ?? 'unknown';
    const kit = kitOf(r.cls, r.id, now);
    const barUntil = o.bar !== undefined ? now + CAPTIVE.barMs : null;
    const done = await db
      .prepare(
        `UPDATE war_persons SET state = 'soul', gear = ?3, until_at = ?4, held_at = ?5, captor = NULL, captor_pid = NULL, held_fort = NULL, region = NULL,
           slot = NULL, refused = 0, bar_pid = ?6, bar_until = ?7, updated_at = ?8 WHERE id = ?1 AND state = ?2`,
      )
      .bind(r.id, r.state, JSON.stringify(kit), now + CAPTIVE.soulMs, origin, o.bar ?? null, barUntil, now)
      .run();
    if (!done.meta.changes) continue;
    n++;
    const soul = namedSoul({ ...r, state: 'soul', gear: JSON.stringify(kit), until_at: now + CAPTIVE.soulMs, held_at: origin, bar_pid: o.bar ?? null, bar_until: barUntil }, now);
    let at: string | null = null;
    for (const region of soulRegions(origin)) {
      const got = await spawn(region, soul).catch(() => 'absent' as const);
      if (got === 'none') continue;
      at = region;
      break;
    }
    // no region has a shrine: he is gone
    if (at === null) await db.prepare("UPDATE war_persons SET state = 'faded' WHERE id = ?1 AND state = 'soul'").bind(r.id).run();
    else if (at !== origin) await db.prepare("UPDATE war_persons SET held_at = ?2 WHERE id = ?1 AND state = 'soul'").bind(r.id, at).run();
  }
  return n;
}

/** Captives the player lost or holds whose CAPTIVE.holdMs are up: released, as souls. */
export async function releaseDue(db: D1Database, pid: number, now: number): Promise<number> {
  const due = (await db
    .prepare(`SELECT ${COLS} FROM war_persons WHERE (player_id = ?1 OR captor_pid = ?1) AND state = 'captive' AND until_at <= ?2`)
    .bind(pid, now)
    .all<PersonRow>()).results;
  return due.length ? toSouls(db, due, now) : 0;
}

/** A captive `captor` holds, or 404. */
async function held(db: D1Database, captor: number, id: string): Promise<PersonRow> {
  const r = await db.prepare(`SELECT ${COLS} FROM war_persons WHERE id = ?1 AND captor_pid = ?2 AND state = 'captive'`).bind(id, captor).first<PersonRow>();
  if (!r) throw new ApiError(404, 'not_found', 'You hold no such captive');
  return r;
}

/** The captor lets a captive he holds go (any time): his soul wakes at a shrine. */
export async function releaseCaptive(db: D1Database, captor: number, id: string, now: number): Promise<void> {
  await toSouls(db, [await held(db, captor, id)], now);
}

/**
 * The captor asks a captive to join (after CAPTIVE.askMs): refused for good (he can only be released now), or he joins
 * the captor's army at home with his level, class and record, in his class's starter kit. A full army: refused before
 * he is asked.
 */
export async function askToJoin(db: D1Database, captor: number, id: string, now: number): Promise<{ joined: boolean }> {
  const r = await held(db, captor, id);
  if (r.refused) throw new ApiError(409, 'refused', `${r.name} refused to join you: you can only release him`);
  if (r.until_at !== null && now < askAt(r.until_at)) throw new ApiError(409, 'too_soon', `${r.name} may be asked ${Math.ceil((askAt(r.until_at) - now) / 60_000)} min from now`);
  if ((await armyCount(db, captor)) >= ARMY_MAX) throw new ApiError(409, 'army_full', `Your army is full (${ARMY_MAX})`);
  if (refuses(r.id, r.level)) {
    await db.prepare("UPDATE war_persons SET refused = 1, updated_at = ?2 WHERE id = ?1 AND state = 'captive'").bind(id, now).run();
    return { joined: false };
  }
  if (!(await movePerson(db, id, captor, { from: 'captive', region: null, gear: kitOf(r.cls, r.id, now) }, now))) throw new ApiError(409, 'army_full', `Your army is full (${ARMY_MAX})`);
  return { joined: true };
}

const DISMISSABLE: readonly PersonState[] = ['active', 'wounded'];

/**
 * His owner dismisses a soldier (fit or wounded): his gear drops where he stands (a pile in his live region), else into
 * the home strongroom; his soul rises (the region he was in, else his home) and the owner may not claim it for
 * CAPTIVE.barMs. Returns where he stood in his region (the view plays the soul rising there), or null.
 */
export async function dismiss(db: D1Database, pid: number, id: string, home: string, now: number): Promise<{ at: { x: number; y: number } | null; region: string | null }> {
  const r = await person(db, pid, id);
  if (!DISMISSABLE.includes(r.state)) throw new ApiError(409, 'not_dismissable', `He is ${r.state}`);
  if (isCivClass(r.cls)) throw new ApiError(409, 'civilian', 'Civilians are not dismissed');
  const at = r.region ? await SOULS.dismiss(r.region, id).catch(() => null) : null;
  if (!at) {
    const gear = Object.values(json<Equipment>(r.gear, {})).filter((x): x is Item => !!x);
    if (gear.length) await db.batch(gear.map((it) => placeItemStmt(db, pid, strongroom(pid), it, now)));
  }
  await toSouls(db, [r], now, { bar: pid, from: (x) => x.region ?? home });
  return { at, region: r.region };
}
