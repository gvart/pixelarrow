/**
 * The world map's state from a WorldView (./source.ts), and the side data it fetches (settlements, mastered regions),
 * shared by the world screen (./main.ts) and the overlay over a region (./overlay.ts).
 */
import type { RegionState } from '../net/world';
import { TITLES } from '../view/hud/titles';
import { warAuth } from '../net/session';
import { convoySeen } from './geo';
import { lordMarks } from './lords';
import type { MapState } from './map';
import { MOCK_MASTERED, MOCK_SETTLEMENTS, type WorldSource, type WorldTitle, type WorldView } from './source';

export const emptyState = (routes = true): MapState => ({ regions: new Map(), transit: [], squads: new Map(), you: null, hover: null, selected: null, squadAt: null, targets: new Set(), routes, now: Date.now(), convoys: [], haul: null });

/** W-61: the map's emblems: each holder's home region gets his titles' icons after its name. */
export function emblems(t: WorldTitle[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const x of t) if (x.home && TITLES[x.id]) m.set(x.home, [...(m.get(x.home) ?? []), TITLES[x.id].icon]);
  return m;
}

/** W-72, W-76: each warlord's pennants as the region rooms last reported. */
export const refreshLords = (st: MapState) => void (st.warlords = lordMarks([...st.regions.values()], Date.now()));

/** Copy a fresh view into the map's state. */
export function applyView(st: MapState, v: WorldView): void {
  st.regions = new Map(v.snap.regions.map((r: RegionState) => [r.id, r]));
  st.transit = v.snap.transit;
  st.squads = new Map(v.squads.map((s) => [s.region, s.men]));
  st.you = v.snap.you.alliance;
  st.convoys = (v.convoys ?? []).filter((c) => convoySeen(c, st.you as 0 | null, st.regions, new Set(st.squads.keys())));
  st.emblems = emblems(v.titles ?? []);
  st.events = v.snap.events?.active ?? [];
  st.crown = v.snap.crown; // W-64: monarchs and pacts
  refreshLords(st);
}

/** W-63: the world's settlements (markers and fealty lines) and the player's id. */
export async function loadSettlements(source: WorldSource, st: MapState): Promise<void> {
  if (source.mode === 'offline') return void ((st.settlements = MOCK_SETTLEMENTS), (st.me = 1));
  const auth = await warAuth(source.devId).catch(() => null);
  const r = await fetch('/api/war/settlements', { headers: auth?.headers ?? {} }).catch(() => null);
  const j = r?.ok ? ((await r.json()) as { settlements?: MapState['settlements'] }) : null;
  if (j?.settlements) st.settlements = j.settlements;
  if (auth) st.me = auth.pid;
}

/** W-73: the regions the player mastered this season (a star each). */
export async function loadMastered(source: WorldSource, st: MapState): Promise<void> {
  if (source.mode === 'offline') return void (st.mastered = new Set(MOCK_MASTERED));
  const auth = await warAuth(source.devId).catch(() => null);
  const r = await fetch('/api/war/mastery', { headers: auth?.headers ?? {} }).catch(() => null);
  const j = r?.ok ? ((await r.json()) as { mastered?: string[] }) : null;
  if (j?.mastered) st.mastered = new Set(j.mastered);
}
