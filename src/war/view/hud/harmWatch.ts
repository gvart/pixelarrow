/**
 * W-221 his men struck, in words: roaming packs, patrols and lairs hit a player's men with no message, and whatever a
 * fallen man carried went to the ground just as silently. A toast when a fight on his men begins, naming who struck;
 * another when goods fall with a man (the server's `dropped`, offline the sim's own `fall`).
 */
import { hungerStage } from '../../sim/food';
import { goodsWords } from '../../sim/encounters';
import { foesWord } from '../../sim/mobs';
import type { Snapshot } from '../../types';

/** Ticks with no hit before the next hit counts as a new attack (30 s). */
export const HARM_QUIET = 300;
/** A foe this near the struck man is taken for who struck him (tiles). */
const NEAR = 12;

export interface HarmMemo { hp: Map<number, number>; last: number }
export const harmMemo = (): HarmMemo => ({ hp: new Map(), last: -Infinity });

/** The words due now for the men of `owner`; `friend`: a team he does not fight. */
export function harmNotes(cur: Pick<Snapshot, 'tick' | 'units' | 'squads'>, owner: string, memo: HarmMemo, friend: (team: number) => boolean): string[] {
  const squad = new Map(cur.squads.map((q) => [q.id, q]));
  let struck: Snapshot['units'][number] | null = null;
  const hp = new Map<number, number>();
  for (const u of cur.units) {
    if (squad.get(u.squad)?.owner !== owner) continue;
    hp.set(u.id, u.hp);
    const was = memo.hp.get(u.id);
    // a starving man's hit points go too: ./foodWatch.ts says so
    if (was !== undefined && u.hp < was - 0.5 && !(u.sat !== undefined && hungerStage(u.sat) === 2)) struck ??= u;
  }
  memo.hp = hp;
  if (!struck) return [];
  const told = Math.abs(cur.tick - memo.last) <= HARM_QUIET; // abs: a new region's clock starts again
  memo.last = cur.tick;
  if (told) return [];
  const at = struck;
  const foes = cur.units.filter((u) => {
    const q = squad.get(u.squad);
    return u.state !== 'dead' && !!q && q.owner !== owner && !friend(q.team) && Math.hypot(u.x - at.x, u.y - at.y) <= NEAR;
  });
  if (!foes.length) return ['Your men are being struck by something you cannot see.'];
  const near = (u: { x: number; y: number }) => Math.hypot(u.x - at.x, u.y - at.y);
  const first = foes.filter((u) => u.state === 'attack').sort((a, b) => near(a) - near(b))[0] ?? foes.sort((a, b) => near(a) - near(b))[0];
  return [`Your men are under attack by ${foesWord(first.cls, foes.filter((u) => u.squad === first.squad).length)}.`];
}

/** W-221: goods fell with a man. */
export const droppedLine = (goods: Readonly<Record<string, number>>): string => `${goodsWords(goods)} fell with your man. It lies there for anyone: send men to pick it up.`;
