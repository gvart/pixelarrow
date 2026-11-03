/**
 * W-64 crown and council: the rules' numbers and the views the Crown panel (src/war/view/hud/crown.ts) reads from
 * /api/war/crown (server/src/war/crown.ts).
 */
import type { Rank } from '../../data/warFeudal';

const HOUR = 3_600_000;
export const CROWN = {
  /** Candidates per election (the top by realm power). */
  candidates: 3,
  /** Voting window of an election and of a no-confidence vote. */
  voteMs: 24 * HOUR,
  /** A no-confidence petition: signed by this share of the active lords (seen within activeMs) opens the vote. */
  petitionShare: 0.25, activeMs: 7 * 24 * HOUR, petitionMs: 48 * HOUR,
  /** After a failed petition or vote, none again for this long. */
  cooldownMs: 24 * HOUR,
  /** The alliance tax (% of members' market sales). */
  taxMax: 10,
  /** Orders: most open at once per alliance, the largest bounty, the longest they run. */
  ordersMax: 8, bountyMax: 5000, orderHoursMax: 72,
  /** Score of an order fulfilled (peace for a quest, war for a war goal; the tasks' daily caps). */
  /** Pacts and truces: how long one runs once accepted, how long an offer stands. */
  pactMs: 7 * 24 * HOUR, truceMs: 48 * HOUR, offerMs: 48 * HOUR,
} as const;

export type Office = 'marshal' | 'treasurer' | 'envoy' | 'quartermaster';
export const OFFICES: readonly { id: Office; name: string; text: string }[] = [
  { id: 'marshal', name: 'Marshal', text: 'War goals: attack and defend marks with bounties, and rallies' },
  { id: 'treasurer', name: 'Treasurer', text: 'The alliance tax and the treasury: funds works and contracts' },
  { id: 'envoy', name: 'Envoy', text: 'Pacts and truces with the other alliances' },
  { id: 'quartermaster', name: 'Quartermaster', text: 'Supply quests: bring goods to a town, paid on delivery' },
];
export const isOffice = (s: string): s is Office => OFFICES.some((o) => o.id === s);

export type OrderKind = 'attack' | 'defend' | 'rally' | 'supply';
export type PactKind = 'pact' | 'truce';

/** One settlement as realm power counts it. */
export interface RealmSettlement { id: number; region: string; lord_pid: number; level: number; overlord_id: number | null }

/**
 * Realm power: the levels of the settlements he rules, plus the levels of their vassals (not his own), plus one per
 * region his settlements stand in.
 */
export function realmPower(pid: number, all: readonly RealmSettlement[]): number {
  const mine = all.filter((s) => s.lord_pid === pid), ids = new Set(mine.map((s) => s.id));
  const own = mine.reduce((a, s) => a + s.level, 0);
  const vassals = all.filter((s) => s.overlord_id !== null && ids.has(s.overlord_id) && s.lord_pid !== pid).reduce((a, s) => a + s.level, 0);
  return own + vassals + new Set(mine.map((s) => s.region)).size;
}

/** W-151: a lord's vote weighs his vassals plus one; who rules no settlement has no vote. */
export const voteWeight = (lord: boolean, vassals: number) => (lord ? 1 + Math.max(0, vassals) : 0);

export interface Candidate { pid: number; name: string; power: number }

/** The top CROWN.candidates by power (some power at least; ties: the lower id). */
export function candidatesOf(members: readonly Candidate[]): Candidate[] {
  return members.filter((m) => m.power > 0).sort((a, b) => b.power - a.power || a.pid - b.pid).slice(0, CROWN.candidates);
}

/** The election's winner: the most vote weight; ties go to the higher power, then the lower id. No votes: the strongest. */
export function electionWinner(cands: readonly Candidate[], ballots: readonly { choice: number; weight: number }[]): Candidate | null {
  if (!cands.length) return null;
  const votes = new Map(cands.map((c) => [c.pid, 0]));
  for (const b of ballots) if (votes.has(b.choice)) votes.set(b.choice, votes.get(b.choice)! + b.weight);
  return [...cands].sort((a, b) => votes.get(b.pid)! - votes.get(a.pid)! || b.power - a.power || a.pid - b.pid)[0];
}

/** Signatures a petition needs from `active` members. */
export const petitionNeed = (active: number) => Math.max(1, Math.ceil(active * CROWN.petitionShare - 1e-9));

/** W-152, W-201: a no-confidence vote passes on a majority of the active lords' weight, cast or not. */
export const confidenceLost = (ballots: readonly { choice: number; weight: number }[], lordWeight: number) =>
  ballots.filter((b) => b.choice === 1).reduce((a, b) => a + b.weight, 0) > lordWeight / 2;

/** Bounty split by shares (coin rounded down to a hundredth); what is left over goes back. */
export function splitBounty(bounty: number, shares: readonly { pid: number; share: number }[]): { pay: Map<number, number>; rest: number } {
  const total = shares.reduce((a, s) => a + Math.max(0, s.share), 0), pay = new Map<number, number>();
  if (!(total > 0) || !(bounty > 0)) return { pay, rest: Math.max(0, bounty) };
  let out = 0;
  for (const s of shares) {
    const k = Math.floor((bounty * Math.max(0, s.share)) / total * 100) / 100;
    if (k > 0) pay.set(s.pid, k), (out += k);
  }
  return { pay, rest: Math.round((bounty - out) * 100) / 100 };
}

// ---------------------------------------------------------------- views

export interface CrownMember { pid: number; name: string; power: number; weight: number; lord: boolean; vassals: number }
export interface CrownOrder {
  id: number; kind: OrderKind; by: string; byPid: number; region: string; target: string | null; x: number | null; y: number | null;
  res: string | null; n: number; delivered: number; bounty: number; paid: number; state: string; expires: number;
  /** War goals: everyone's shares and his own; quests: what he delivered. */
  shares: number; mine: number;
}
export interface CrownPact { id: number; kind: PactKind; a: number; b: number; state: string; by: string; expires: number; ends: number | null }
export interface CrownElection { id: number; closes: number; candidates: (Candidate & { votes: number })[]; mine: number | null }
export interface CrownPetition { id: number; state: 'petition' | 'open'; signs: number; need: number; closes: number; signed: boolean; yes: number; no: number; mine: number | null }
export interface CrownLog { kind: string; actor: string | null; detail: Record<string, unknown>; at: number }
/** W-150..W-159: a place tribute waits: a stall in a town, or a building of a region. */
export interface OwedPlace { region: string; what: string; goods: Record<string, number> }
export interface FeudalPerson { pid: number; name: string; rank: Rank }
export interface FeudalView {
  rank: Rank;
  /** Whom he is sworn to, and the rate he pays. */
  lord: (FeudalPerson & { rate: number; since: number }) | null;
  /** A request of his not yet answered. */
  asked: { pid: number; name: string; at: number } | null;
  /** Those sworn to him and what each has set aside for him. */
  vassals: (FeudalPerson & { since: number; owed: OwedPlace[] })[];
  /** Requests to swear to him. */
  asks: { pid: number; name: string; at: number }[];
  /** The rate he sets on those sworn to him (null: he is no lord). */
  rate: number | null;
  /** What he has set aside for his liege. */
  owed: OwedPlace[];
  /** Until when a broken oath bars him (0: no bar). */
  barUntil: number;
  /** The alliance's roll: who broke an oath this season. */
  roll: { name: string; lord: string; at: number }[];
  /** The king's heir (seen by all). */
  heir: { pid: number; name: string } | null;
  /** Calls to guard from his liege: unpaid, his to answer or not. */
  calls: { id: number; region: string; men: number; hours: number; by: string; taken: boolean }[];
}
export interface CrownView {
  alliance: number | null;
  now: number;
  monarch: { pid: number; name: string; power: number; since: number | null } | null;
  /** An election runs while someone holds the crown: he rules as regent until it closes. */
  regent: boolean;
  council: { office: Office; pid: number | null; name: string | null }[];
  treasury: { goods: Record<string, number>; tax: number; taxed: number };
  election: CrownElection | null;
  petition: CrownPetition | null;
  /** Until when no new petition may start (after a failed one). */
  petitionCooldown: number;
  orders: CrownOrder[];
  pacts: CrownPact[];
  log: CrownLog[];
  members: CrownMember[];
  me: { pid: number; power: number; weight: number; offices: Office[]; monarch: boolean };
  feudal: FeudalView;
}
