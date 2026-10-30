/**
 * Plain-word explanations of two systems players met without a word of help: the W-62 world events (what, what to
 * do, when) and region claiming (how a region becomes yours, why its claim point is shut, why B builds nothing yet).
 * Pure text from the sim's own numbers (src/war/world/events.ts, src/war/sim/depth.ts, src/war/sim/mobs.ts): the
 * region view's events card (./worldEvents.ts), the claim point card and label (./claimCard.ts, ../neutral.ts), the
 * build bar's "claim first" hint and the world map's region card (../../world-view/regionCard.ts) all read it.
 */
import { EVENT_INFO, RUSH, SIEGE, STORM, WAKE, type WorldEvent, type WorldEventKind } from '../../world/events';
import { DEPTH, REGION_DEPTH } from '../../sim/depth';
import { CLAIM } from '../../sim/mobs';
import { SOUL } from '../../sim/souls';
import { ARMY_MAX } from '../../sim/soldiers';
import { WAR_BOSSES } from '../../../data/warBosses';
import { LANDMARKS } from '../../../data/warLandmarks';
import { ALLIANCES } from '../../world/alliances';
import { worldRegion } from '../../world/graph';
import type { BossSnap, ClaimSnap, LairSnap } from '../../types';

const TICK_S = 0.1; // the sim runs at 10 Hz
const regionName = (id: string) => worldRegion(id)?.name ?? id;

// ------------------------------------------------------------------ world events

export interface EventHelp {
  /** The card's main line: a short imperative, about six words. */
  goal: string;
  /** What it pays, as a chip's text ("+20 score"). */
  gain: string;
  what: string;
  todo: string;
  rule: string;
}

/** One event in plain words: the goal and its gain (the card), what it is, what to do, and the full rule (the details). */
export function eventHelp(e: Pick<WorldEvent, 'kind' | 'region'>): EventHelp {
  const where = regionName(e.region);
  const boss = WAR_BOSSES.find((b) => b.region === e.region)?.name ?? 'its guardian';
  const lm = LANDMARKS.find((l) => l.region === e.region)?.name ?? 'the landmark';
  const H: Record<WorldEventKind, EventHelp> = {
    soulStorm: {
      goal: `Claim souls in ${where}`,
      gain: 'new men',
      what: `fallen warriors rise ${STORM.chance}x as often in ${where}, a chance for new men`,
      todo: 'Go there with a squad and claim the souls (E on a soul)',
      rule: `Souls wake at shrines, ruins, old battlefields and lairs ${STORM.chance}x as often, up to ${STORM.max} at once instead of ${SOUL.max}. Stand a man within ${SOUL.reach} tiles of one for ${SOUL.channel * TICK_S} s and he joins your squad, his class and level with him, while you have fewer than ${ARMY_MAX} men. Unclaimed, a soul fades after ${Math.round(SOUL.life * TICK_S / 60)} min.`,
    },
    bossWake: {
      goal: `Slay ${boss.replace(/^The /, 'the ')}`,
      gain: `loot x${WAKE.loot}`,
      what: `${cap(boss)} wakes in ${where}, stronger (hp x${WAKE.hp}) but with double loot`,
      todo: 'Bring a strong force, best with allies, and slay it',
      rule: `The guardian comes back now even if it was slain (unless the region is held), with ${WAKE.hp}x its hp. Killed while the event runs, it drops its rare goods ${WAKE.loot} times over.`,
    },
    caravanRush: {
      goal: `Haul goods to ${where}`,
      gain: `+${RUSH.perLoad} a load`,
      what: `every convoy reaching ${where} with cargo scores your alliance points`,
      todo: 'Haul goods there by cart or wagon (world map: H, the haul planner)',
      rule: `Each convoy that arrives at the ${where} market with cargo scores its alliance ${RUSH.perLoad} point a load, at most ${RUSH.cap} an arrival.`,
    },
    landmarkSiege: {
      goal: `Take ${lm}`,
      gain: `+${SIEGE.capture}`,
      what: `${lm} in ${where} is open to take, for alliance score`,
      todo: 'Defeat its guardian, claim its point, then keep men in it',
      rule: `Capturing the landmark while the event runs scores the captor ${SIEGE.capture}; the alliance holding it at the end with a garrison inside scores ${SIEGE.held} more.`,
    },
  };
  return H[e.kind];
}

/** "starts in 1:00:57" for one to come, "ends in 12:04" for a running one. */
export function eventWhen(e: Pick<WorldEvent, 'startAt' | 'endAt'>, now: number): string {
  return e.startAt > now ? `starts in ${clock(e.startAt - now)}` : `ends in ${clock(e.endAt - now)}`;
}

/** The card's one line: "Soul storm: fallen warriors rise 4x as often ...". */
export const eventLine = (e: Pick<WorldEvent, 'kind' | 'region'>) => `${EVENT_INFO[e.kind].name}: ${eventHelp(e).what}`;

// ------------------------------------------------------------------ claiming

export interface ClaimNeed { men: number; players: number; secs: number }
/** What a claim needs in a region of depth d (src/war/sim/depth.ts DEPTH[d].claim). */
export function claimNeed(depth: number): ClaimNeed {
  const c = DEPTH[Math.max(0, Math.min(4, depth))].claim;
  return { men: c.men, players: c.players, secs: c.ticks * TICK_S };
}
/** "hold it with 3 men for 30 s", with "of 2+ players" where the depth asks it. */
export const holdText = (n: ClaimNeed) => `hold it with ${n.men} men${n.players > 1 ? ` of ${n.players}+ players` : ''} for ${n.secs} s`;

const KIND: Record<LairSnap['kind'], [string, string]> = { wolf: ['wolf pack', 'wolf packs'], boar: ['boar herd', 'boar herds'], bear: ['bear den', 'bear dens'], bandit: ['bandit camp', 'bandit camps'], jackal: ['jackal pack', 'jackal packs'], ibex: ['ibex herd', 'ibex herds'], lion: ['lion pride', 'lion prides'], serpent: ['serpent nest', 'serpent nests'] };

/** Why a locked claim point is shut, as "defeat X first": the region's boss, its bandit captain, else the guard lairs of its zone. */
export function claimBlocker(c: Pick<ClaimSnap, 'lairs'>, lairs: readonly LairSnap[], bosses: readonly BossSnap[]): string {
  const boss = bosses.find((b) => b.state !== 'slain' && b.state !== 'away');
  if (boss) return `defeat ${boss.name} first`;
  const zone = c.lairs.map((i) => lairs[i]).filter((l): l is LairSnap => !!l);
  if (zone.some((l) => l.captain)) return 'defeat the bandit captain first';
  const left = zone.filter((l) => l.state !== 'cleared' && l.guard > 0);
  if (!left.length) return 'clear the lairs round it first';
  const by = new Map<LairSnap['kind'], number>();
  for (const l of left) by.set(l.kind, (by.get(l.kind) ?? 0) + 1);
  return `clear ${[...by].map(([k, n]) => `${n} ${KIND[k][n === 1 ? 0 : 1]}`).join(', ')} round it first`;
}

export interface ClaimView {
  /** The short state on the world label: "Guarded", "Unclaimed", "Claiming 12/30 s", "Held: Dodona". */
  label: string;
  /** good: yours; bad: someone else's or contested; warn: guarded; '' open. */
  tone: 'good' | 'bad' | 'warn' | '';
  /** The state in a sentence. */
  state: string;
  /** What to do next. */
  next: string;
}

/** A claim point's state and the next step, for the player of team `you`. */
export function claimView(c: ClaimSnap, you: number, depth: number, lairs: readonly LairSnap[], bosses: readonly BossSnap[]): ClaimView {
  const need = claimNeed(depth), hold = holdText({ men: c.men ?? need.men, players: c.players ?? need.players, secs: need.secs });
  if (c.state === 'claimed') {
    const who = ALLIANCES[c.team]?.name ?? 'another side', at = Math.floor(c.progress * need.secs);
    const by = c.by !== undefined && c.by >= 0 ? ALLIANCES[c.by]?.name ?? 'another side' : '';
    if (c.team === you) {
      if (c.taking) return { label: 'Being taken!', tone: 'bad', state: c.taking === 'channel' ? `${by} is taking it: ${at} of ${need.secs} s.` : `${by} is at the banner; ${c.taking === 'defended' ? 'your men hold it off' : 'the claim is reset'}.`, next: `Send men: any of yours within ${CLAIM.contest} tiles resets it, and while one stands within ${CLAIM.r} tiles it cannot run.` };
      return { label: 'Held: yours', tone: 'good', state: 'Held by your alliance: the ground round it is yours.', next: `Press B to build here; forts and outposts spread your ground further. Keep men near: a foe who clears ${CLAIM.r} tiles round it can take it.` };
    }
    const take = `clear its defenders, then hold it ${need.secs} s to take it`;
    if (c.taking && c.by === you) {
      if (c.taking === 'channel') return { label: `Taking ${at}/${need.secs} s`, tone: '', state: `Taking it from ${who}: ${at} of ${need.secs} s.`, next: `Keep ${c.men ?? need.men} men within ${CLAIM.at} tiles of the banner; any foe within ${CLAIM.contest} tiles resets it. Done, the town round it is yours at the hp it has.` };
      if (c.taking === 'defended') return { label: 'Defended', tone: 'bad', state: `Held by ${who}: its men within ${CLAIM.r} tiles keep the claim from running.`, next: `Drive them off, then ${hold}.` };
      return { label: 'Contested', tone: 'bad', state: `Contested: foes within ${CLAIM.contest} tiles reset the claim.`, next: `Drive them off, then ${hold}.` };
    }
    return { label: `Held: ${who}`, tone: 'bad', state: `Held by ${who}: ${take}.${by ? ` ${by} is taking it now.` : ''}`, next: `No man of ${who} may stand within ${CLAIM.r} tiles; then select men, E on the banner and ${hold}. A truce or pact with ${who} forbids it.` };
  }
  if (c.state === 'locked') {
    const why = claimBlocker(c, lairs, bosses);
    return { label: 'Guarded', tone: 'warn', state: `Guarded: ${why}.`, next: `Then select men, E on the banner and ${hold}.` };
  }
  if (c.state === 'contested') return { label: 'Contested', tone: 'bad', state: `Contested: foes within ${CLAIM.contest} tiles reset the claim.`, next: `Drive them off, then ${hold}.` };
  if (c.state === 'channel') {
    const at = Math.floor(c.progress * need.secs);
    return { label: `Claiming ${at}/${need.secs} s`, tone: '', state: `Claiming: ${at} of ${need.secs} s.`, next: `Keep ${c.men ?? need.men} men within ${CLAIM.at} tiles of the banner${(c.players ?? 1) > 1 ? ` (men of ${c.players}+ players)` : ''}; any foe within ${CLAIM.contest} tiles resets it.` };
  }
  return { label: 'Unclaimed', tone: '', state: 'Unclaimed: nobody holds this point.', next: `Select men, E (or right click) on the banner and ${hold}. Then B builds on the ground round it.` };
}

/** The build bar's hint while the player has no ground in the region: why B builds nothing yet and how to get ground. */
export function claimFirstHint(claims: readonly ClaimSnap[], you: number, depth: number, lairs: readonly LairSnap[], bosses: readonly BossSnap[]): string {
  const hold = holdText(claimNeed(depth)), none = 'No ground of yours here, so nothing can be built yet.';
  const take = `select your men, right-click the banner and ${hold} with no foes near; its ground is then yours to build on`;
  const open = claims.find((c) => c.state === 'open' || c.state === 'channel' || c.state === 'contested');
  if (open) return `${none} Take a claim banner (it glows gold on the minimap): ${take}.`;
  const locked = claims.find((c) => c.state === 'locked');
  if (locked) return `${none} The claim banner (grey: guarded) opens once you ${claimBlocker(locked, lairs, bosses).replace(/ first$/, '')}; then ${take}.`;
  if (claims.some((c) => c.state === 'claimed' && c.team !== you)) return `${none} Every claim banner here is held by others. Drive their men off one, then ${take}. Enemy men are never won over: new men come only from souls.`;
  return `${none} You build only on your own ground: round a banner you hold, your home town or your forts.`;
}

/** The world map's take-line: how a region is taken from where it stands now. */
export function takeLine(id: string, owner: number, claims: readonly number[] | undefined, you: number | null): string {
  const w = worldRegion(id);
  if (!w) return '';
  if (w.role === 'home') return owner === you ? 'Your home: it can never fall.' : `Home of ${ALLIANCES[w.alliance ?? 0]?.name}: it can never fall.`;
  const hold = holdText(claimNeed(REGION_DEPTH[id] ?? 1));
  const boss = WAR_BOSSES.find((b) => b.region === id);
  const first = boss ? `defeat ${boss.name}, then ` : 'clear the lairs guarding a claim point, then ';
  const n = owner >= 0 ? claims?.[owner] ?? 0 : 0;
  if (owner < 0) return `Unclaimed: ${first}${hold}.`;
  if (owner === you) return `Yours: you hold ${n || 'the most'} of its claim point${n === 1 ? '' : 's'}. Others need more to take it.`;
  return `Held by ${ALLIANCES[owner]?.name} (${n} point${n === 1 ? '' : 's'}): take more of its claim points than it holds; each one: clear its defenders, then ${hold}.`;
}

/** The "How territory works" entry (the codex term `territory`). */
export const TERRITORY = `You build only on your own ground. In a region you do not hold yet, take a claim point: a banner on a pole. A point guarded by beasts, a bandit captain or a region guardian opens once they fall. Then hold it with your men: depth 1 needs ${holdText(claimNeed(1)).replace('hold it with ', '')}, depth 2 ${holdText(claimNeed(2)).replace('hold it with ', '')}, depth 3 ${holdText(claimNeed(3)).replace('hold it with ', '')}, depth 4 ${holdText(claimNeed(4)).replace('hold it with ', '')}. Any foe within ${CLAIM.contest} tiles resets it. A point another alliance holds is taken the same way once no man of theirs stands within ${CLAIM.r} tiles of it, and its town turns at the hp it has; a truce or pact with them forbids it. A held point gives you ground ${CLAIM.r} tiles round it; forts and outposts spread it further, and towns follow their claim point. The alliance holding the most claim points holds the region. Your first camp outside home founds a settlement and makes you its lord. Enemy men are never won over: new men come only from souls (pale ghosts; E on one), up to ${ARMY_MAX}.`;

const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
function clock(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60, p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
