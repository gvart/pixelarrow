/**
 * Versioned save schema, migrations and chunking for key/value backends with
 * small value limits (Telegram CloudStorage allows 4096 chars per key).
 */
import { ITEMS, normalizeRarity, RARITIES, type Item } from '../data/items';
import { classGearBlocker } from '../data/gearRules';
import { classOfHero } from '../data/classes';
import type { LangSetting } from '../i18n';
import type { Hero } from '../data/units';
import { defaultAttrs, PERKS, POINTS_PER_LEVEL } from '../data/perks';
import { World, type WorldSave } from '../world/world';
import type { TutorialProgress } from './tutorial';

export const SAVE_VERSION = 5;

export interface Settings {
  pauseContact: boolean;
  pauseFlank: boolean;
  pauseRout: boolean;
  pauseDeath: boolean;
  haptics: boolean;
  /** Floating damage numbers in battle. */
  dmgNumbers: boolean;
  /** Sound on/off, music and effects volume 0..10 (src/audio). */
  sound: boolean;
  musicVol: number;
  sfxVol: number;
  /** The one-time touch-controls hint was shown (battle deployment). */
  seenGestureHint: boolean;
  /** UI language: 'auto' follows Telegram / the browser (src/i18n). */
  lang: LangSetting;
  /** First-time hints already shown, by screen id (src/ui/widgets.ts firstTimeHint). */
  seenHints?: string[];
  /** The guided tutorial (src/game/tutorial.ts): offered, active, done or skipped. Missing on saves from before it. */
  tutorial?: TutorialProgress;
  /** Online coach marks already shown (count, src/game/tutorial.ts ONLINE_COACH). */
  onlineCoach?: number;
  /** Anonymous product analytics (src/platform/analytics.ts); off = nothing is sent. */
  analytics: boolean;
  /** Reduce motion (src/ui/motion.ts); missing = follow the system's prefers-reduced-motion. */
  reduceMotion?: boolean;
}

/**
 * The settings a new campaign starts with: every player preference carries
 * over (language, sound and volumes, haptics, reduce motion, pause rules, the
 * analytics choice, hints and tutorial progress); none of them belongs to the
 * campaign. Before iteration 2 only the tutorial and the coach marks did, so
 * "New campaign" silently reset the rest (analytics back on included).
 */
export function carrySettings(prev: Partial<Settings> | undefined, fresh: Settings): Settings {
  return { ...fresh, ...(prev ?? {}) };
}

export const DEFAULT_SETTINGS: Settings = {
  pauseContact: true,
  pauseFlank: true,
  pauseRout: true,
  pauseDeath: false,
  haptics: true,
  dmgNumbers: true,
  sound: true,
  musicVol: 6,
  sfxVol: 7,
  seenGestureHint: false,
  lang: 'auto',
  analytics: true,
};

export interface SaveData {
  v: number;
  gold: number;
  heroes: Hero[];
  stash: Item[];
  nextId: number;
  rng: number;
  won: number;
  fought: number;
  settings: Settings;
  /** Overland campaign: map seed, party position, roaming bands, settlement stock, time. */
  world: WorldSave;
  /**
   * Cloud sync bookkeeping (optional, no version bump): `seq` grows by one on
   * every save and is carried over when a save is adopted from the server, so
   * the higher `seq` is the more-played copy; `savedAt` (ms) breaks ties.
   */
  seq?: number;
  savedAt?: number;
  /** Heroes whose gear their class may no longer use was moved to the stash (v5 class limits): shown once, then cleared. */
  gearMoved?: string[];
  /** Beast chests in a row without a legendary (bad-luck protection, src/game/sources.ts pityChest); missing = 0. */
  pity?: number;
}

type Migration = (d: Record<string, unknown>) => Record<string, unknown>;

/** migrations[n] upgrades a version-n save to version n+1. */
const migrations: Record<number, Migration> = {
  // v1 had no settings block and stored battle groups only implicitly.
  1: (d) => ({ ...d, v: 2, settings: { ...DEFAULT_SETTINGS }, heroes: ((d.heroes as Hero[]) ?? []).map((h) => ({ ...h, group: h.group ?? 0 })) }),
  // v2 had no attributes, perks, wounds or world map: heroes get neutral attributes and
  // the points they would have earned; the army sets out on a freshly generated map.
  2: (d) => ({
    ...d,
    v: 3,
    heroes: ((d.heroes as Hero[]) ?? []).map((h) => ({
      ...h,
      attrs: defaultAttrs(),
      points: Math.max(0, ((h.level ?? 1) - 1) * POINTS_PER_LEVEL),
      perks: [],
      wound: 0,
    })),
    world: World.fresh(((d.rng as number) ^ 0x7f4a7c15) >>> 0 || 1),
  }),
  // v3 had four rarity tiers: fine -> uncommon, heroic -> epic (same stat multipliers).
  3: (d) => {
    const fix = (it: unknown) => {
      if (it && typeof it === 'object' && 'rarity' in it) (it as { rarity: unknown }).rarity = normalizeRarity((it as { rarity: unknown }).rarity);
    };
    for (const h of (d.heroes as Hero[]) ?? []) for (const it of Object.values(h?.equip ?? {})) fix(it);
    for (const it of (d.stash as unknown[]) ?? []) fix(it);
    return { ...d, v: 4 };
  },
  // v4 let any hero wear anything; v5 limits weapons, shields and armour by class
  // (docs/ITEMS.md "Class limits"): what a hero's class may not use goes to the stash.
  4: (d) => {
    const stash = [...((d.stash as Item[]) ?? [])];
    const moved: string[] = [];
    for (const h of (d.heroes as Hero[]) ?? []) {
      if (!h?.equip) continue;
      const cls = classOfHero({ cls: h.cls, arch: h.arch, culture: h.culture, weaponDef: h.equip.weapon?.def });
      for (const slot of Object.keys(h.equip) as (keyof Hero['equip'])[]) {
        const it = h.equip[slot];
        if (!it || !ITEMS[it.def] || !classGearBlocker(cls, ITEMS[it.def])) continue;
        stash.push(it);
        delete h.equip[slot];
        if (!moved.includes(h.name)) moved.push(h.name);
      }
    }
    return { ...d, v: 5, stash, ...(moved.length ? { gearMoved: moved } : {}) };
  },
};

/**
 * Why a save could not be loaded: `corrupt` (unreadable or invalid) or `newer`
 * (written by a newer build: a higher version, or items this build does not
 * know). A `newer` save must never be overwritten by this build.
 */
export type LoadFailure = 'corrupt' | 'newer';

export function migrate(raw: unknown): SaveData | null {
  const r = migrateResult(raw);
  return r.ok ? r.data : null;
}

export function migrateResult(raw: unknown): { ok: true; data: SaveData } | { ok: false; reason: LoadFailure } {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'corrupt' };
  let d = raw as Record<string, unknown>;
  let v = typeof d.v === 'number' ? d.v : 0;
  if (v > SAVE_VERSION) return { ok: false, reason: 'newer' };
  if (v < 1) return { ok: false, reason: 'corrupt' };
  while (v < SAVE_VERSION) {
    const m = migrations[v];
    if (!m) return { ok: false, reason: 'corrupt' };
    d = m(d);
    v = d.v as number;
  }
  const bad = validate(d);
  return bad ? { ok: false, reason: bad } : { ok: true, data: d as unknown as SaveData };
}

/** Why an item is unusable: null if fine, `newer` for a def this build does not know. */
function itemProblem(i: unknown): LoadFailure | null {
  if (!i || typeof i !== 'object') return 'corrupt';
  const it = i as Item;
  // Legacy tier names (synced from an older client or server) are mapped, not rejected.
  if (typeof it.rarity === 'string' && !RARITIES.includes(it.rarity)) it.rarity = normalizeRarity(it.rarity);
  if (typeof it.uid !== 'string' || typeof it.def !== 'string' || !RARITIES.includes(it.rarity) || typeof it.cond !== 'number') return 'corrupt';
  return ITEMS[it.def] ? null : 'newer';
}

/** Checks and repairs a migrated save in place; returns why it is unusable, or null. */
function validate(d: Record<string, unknown>): LoadFailure | null {
  if (typeof d.gold !== 'number' || !Array.isArray(d.heroes) || !Array.isArray(d.stash)) return 'corrupt';
  if (typeof d.nextId !== 'number' || typeof d.rng !== 'number') return 'corrupt';
  for (const h of d.heroes as Hero[]) {
    if (!h || typeof h.id !== 'string' || typeof h.level !== 'number' || !h.equip || !h.look) return 'corrupt';
    for (const it of Object.values(h.equip)) {
      const bad = it ? itemProblem(it) : null;
      if (bad) return bad;
    }
    // Tolerate partial progression data rather than losing the save.
    if (!h.attrs || typeof h.attrs.str !== 'number') h.attrs = defaultAttrs();
    if (typeof h.points !== 'number') h.points = 0;
    h.perks = Array.isArray(h.perks) ? h.perks.filter((p) => p in PERKS) : [];
    if (typeof h.wound !== 'number') h.wound = 0;
  }
  const w = d.world as WorldSave | undefined;
  if (!w || typeof w.seed !== 'number' || typeof w.time !== 'number' || !Array.isArray(w.parties) || !Array.isArray(w.places)) {
    d.world = World.fresh(((d.rng as number) ^ 0x7f4a7c15) >>> 0 || 1);
  }
  for (const it of d.stash as unknown[]) {
    const bad = itemProblem(it);
    if (bad) return bad;
  }
  d.settings = { ...DEFAULT_SETTINGS, ...((d.settings as object) ?? {}) };
  d.won = typeof d.won === 'number' ? d.won : 0;
  d.fought = typeof d.fought === 'number' ? d.fought : 0;
  if (typeof d.seq !== 'number' || !Number.isFinite(d.seq)) delete d.seq;
  if (typeof d.savedAt !== 'number' || !Number.isFinite(d.savedAt)) delete d.savedAt;
  return null;
}

export function serialize(s: SaveData): string {
  return JSON.stringify(s);
}

export function deserialize(text: string | null | undefined): SaveData | null {
  if (!text) return null;
  try {
    return migrate(JSON.parse(text));
  } catch {
    return null;
  }
}

export const CHUNK_SIZE = 3800;

export function chunk(text: string, size = CHUNK_SIZE): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  if (out.length === 0) out.push('');
  return out;
}

export function unchunk(parts: (string | null | undefined)[]): string | null {
  if (parts.some((p) => p === null || p === undefined)) return null;
  return parts.join('');
}

/** Async key/value backend (Telegram CloudStorage or localStorage). */
export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/*
 * Storage layout (V5-011). Two slots of parts, `px_part_N` (slot 0, also the
 * layout before V5-011) and `px_part1_N` (slot 1), and a meta record
 * `px_meta` {v, n, s, pn} that points at the current slot `s` (n parts) and
 * remembers the previous slot's part count `pn`. A save writes the *other*
 * slot, then flips the meta: killed at any point, the meta still points at a
 * complete save, and the slot it does not point at is the last good save
 * (the backup a damaged current slot falls back to).
 */
const META = 'px_meta';
const PART = (slot: number, i: number) => (slot ? `px_part1_${i}` : `px_part_${i}`);
/** Where a save that could not be loaded is kept, raw, before anything else is written. */
const CORRUPT_META = 'px_corrupt';
const CORRUPT_PART = (i: number) => `px_corrupt_${i}`;

interface Meta {
  v: number;
  n: number;
  /** Current slot (missing: 0, the single-slot layout). */
  s?: number;
  /** Parts in the other slot (missing: no backup). */
  pn?: number;
}

function parseMeta(text: string | null): Meta | null {
  if (!text) return null;
  try {
    const m = JSON.parse(text) as Meta;
    return m && typeof m.n === 'number' && m.n >= 0 ? m : null;
  } catch {
    return null;
  }
}

export async function writeSave(kv: KV, s: SaveData): Promise<void> {
  const parts = chunk(serialize(s));
  const old = parseMeta(await kv.get(META));
  // The slot the meta does not point at: overwriting it leaves the current save intact.
  const slot = old ? 1 - (old.s ?? 0) : 0;
  for (let i = 0; i < parts.length; i++) await kv.set(PART(slot, i), parts[i]);
  await kv.set(META, JSON.stringify({ v: s.v, n: parts.length, s: slot, ...(old ? { pn: old.n } : {}) }));
  // Parts left over in this slot from a longer save.
  for (let i = parts.length; i < (old?.pn ?? 0); i++) await kv.remove(PART(slot, i));
}

export type ReadResult =
  | { kind: 'ok'; data: SaveData; fromBackup?: boolean }
  | { kind: 'empty' }
  /** `raw` is what was stored (null when not even that could be read), kept for the backup. */
  | { kind: 'bad'; reason: LoadFailure; raw: string | null };

async function readSlot(kv: KV, slot: number, n: number): Promise<{ text: string; r: ReturnType<typeof migrateResult> }> {
  const parts: (string | null)[] = [];
  for (let i = 0; i < n; i++) parts.push(await kv.get(PART(slot, i)));
  const text = parts.map((p) => p ?? '').join('');
  const whole = unchunk(parts);
  if (whole === null) return { text, r: { ok: false, reason: 'corrupt' } };
  try {
    return { text, r: migrateResult(JSON.parse(whole)) };
  } catch {
    return { text, r: { ok: false, reason: 'corrupt' } };
  }
}

/**
 * Reads the save: the current slot, else (if it is damaged) the backup slot.
 * A save from a newer build is reported as such and never falls back: the
 * older backup would then be saved over it.
 */
export async function readSaveResult(kv: KV): Promise<ReadResult> {
  const metaText = await kv.get(META);
  if (!metaText) return { kind: 'empty' };
  const meta = parseMeta(metaText);
  if (!meta) return { kind: 'bad', reason: 'corrupt', raw: metaText };
  const slot = meta.s ?? 0;
  const cur = await readSlot(kv, slot, meta.n);
  if (cur.r.ok) return { kind: 'ok', data: cur.r.data };
  if (cur.r.reason === 'corrupt' && meta.pn) {
    const prev = await readSlot(kv, 1 - slot, meta.pn);
    if (prev.r.ok) return { kind: 'ok', data: prev.r.data, fromBackup: true };
  }
  return { kind: 'bad', reason: cur.r.reason, raw: cur.text };
}

export async function readSave(kv: KV): Promise<SaveData | null> {
  const r = await readSaveResult(kv);
  return r.kind === 'ok' ? r.data : null;
}

/** The raw save kept by backupRaw (null if none). */
export async function readBackup(kv: KV): Promise<{ at: number; reason: LoadFailure; raw: string } | null> {
  const meta = await kv.get(CORRUPT_META);
  if (!meta) return null;
  try {
    const m = JSON.parse(meta) as { n: number; at: number; reason: LoadFailure };
    const parts: (string | null)[] = [];
    for (let i = 0; i < m.n; i++) parts.push(await kv.get(CORRUPT_PART(i)));
    const raw = unchunk(parts);
    return raw === null ? null : { at: m.at, reason: m.reason, raw };
  } catch {
    return null;
  }
}

/**
 * Keeps a save that could not be loaded, raw, under its own keys, before the
 * game writes anything. One backup: the first is kept (the oldest progress);
 * a later failure does not replace it.
 */
export async function backupRaw(kv: KV, raw: string, reason: LoadFailure, at = Date.now()): Promise<boolean> {
  if (await kv.get(CORRUPT_META)) return false;
  const parts = chunk(raw);
  for (let i = 0; i < parts.length; i++) await kv.set(CORRUPT_PART(i), parts[i]);
  await kv.set(CORRUPT_META, JSON.stringify({ n: parts.length, at, reason }));
  return true;
}

export async function clearSave(kv: KV): Promise<void> {
  const meta = parseMeta(await kv.get(META));
  if (meta) {
    const slot = meta.s ?? 0;
    for (let i = 0; i < meta.n; i++) await kv.remove(PART(slot, i));
    for (let i = 0; i < (meta.pn ?? 0); i++) await kv.remove(PART(1 - slot, i));
  }
  await kv.remove(META);
}
