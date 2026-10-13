/**
 * The event -> sound mapping, all in one place. Scenes call these one-liners;
 * change what plays (and how loud, where, how often) here.
 */
import type Phaser from 'phaser';
import type { Battle } from '../sim/battle';
import type { SimEvent, WorkType } from '../sim/types';
import type { AbilityId } from '../data/perks';
import { isoToScreen } from '../art/iso';
import type { JuiceKind } from '../ui/battleFx';
import { haptic, hapticNotify } from '../platform/telegram';
import { audio, music, sfx } from './index';
import { HAPTIC_GAP_MS, hapticCue, type Cue } from './haptics';
import type { TrackId } from './music';
import type { PlayOpts } from './engine';
import type { SfxId } from './sfx';

/** Music per scene; undefined = leave the current track alone. */
export function sceneTrack(key: string): TrackId | null | undefined {
  if (key === 'Boot') return undefined;
  if (key === 'Battle') return 'deploy';
  return 'menu';
}

// ------------------------------------------------------------------ UI

/**
 * Buttons in src/ui/kit: an Undo (layout id `*.undo`: the battle and deployment chip, the hire toast,
 * the hero's points) gets the reverse swish, back arrows the back sound, everything else a click.
 */
export function uiButton(icon?: string, id?: string): void {
  sfx.play(id?.endsWith('.undo') ? 'undo' : icon === 'back' ? 'back' : 'click');
}

export function uiError(): void {
  sfx.play('error');
}

/** A disabled control tapped (it shows its reason): a soft "no" and a light buzz. */
export function uiDisabled(): void {
  sfx.play('nope');
  haptic('light');
}

/** A destructive action confirmed (scrap, dismiss, retreat, delete): the low drum. */
export function uiDestroy(): void {
  sfx.play('destroy');
}

export function uiCoin(): void {
  sfx.play('coin');
}

export function uiLevelUp(): void {
  sfx.play('levelUp');
}

// ------------------------------------------------------------------ tutorial

/** The narrator's typewriter: a quill tick per letter, a murmured syllable every few letters. */
export function narratorType(i: number, ch: string): void {
  if (ch === ' ') return;
  if (i % 3 === 0) sfx.play('narrate');
  else sfx.play('quill');
}

/** A tutorial step done. */
export function tutorialStep(): void {
  sfx.play('chime');
}

// ------------------------------------------------------------------ battle

interface BattleState {
  phase: string;
  orders: Map<number, string>;
  contact: Set<number>;
  heat: number;
  last: number;
  ended: boolean;
  /** When each juice tier last sounded (real ms). */
  tierAt: Map<JuiceKind, number>;
}
const battles = new WeakMap<Battle, BattleState>();

export const ABILITY_SFX: Record<AbilityId, SfxId> = {
  bash: 'bash', volley: 'volley', berserk: 'berserk', rally: 'rallyCry',
  // the signature actives (AB-02); a war cry is the battle cry, a re-charge the hooves
  push: 'shove', bond: 'bond', warcry: 'battlecry', sunder: 'sunder', aimed: 'aimed', recharge: 'hooves', scythe: 'scythe',
};

/**
 * The juice tiers (FL-01 JUICE_TIERS) -> the one tier sound each lands with,
 * on top of the per-man sounds (a kill is its death cry, an ability its own
 * sound). Played at most once per HAPTIC_GAP_MS of real time, like the shake.
 */
export const JUICE_SFX: Record<JuiceKind, SfxId | null> = {
  kill: null,
  ability: null,
  impact: 'thud',
  stakes: 'splinter',
  standard: 'standardFall',
  rout: 'groan',
  armyBreak: 'hornChord',
};

/** Field works laid in deployment (BattleScene.placeWork) -> their sound. */
export const WORKS_SFX: Record<WorkType, SfxId> = { stakes: 'worksStakes', ditch: 'worksDig', laager: 'worksLaager' };

/** A work segment laid in deployment. */
export function worksPlaced(type: WorkType): void {
  sfx.play(WORKS_SFX[type] ?? 'worksStakes');
}

/** A work segment taken up. */
export function worksRemoved(): void {
  sfx.play('worksLift');
}

/** The battle paused (true) or runs again: music and field sounds go quiet, UI sounds stay (FL-03). */
export function battlePaused(p: boolean): void {
  audio.setPaused(p);
}
const MISSILE_SFX: Record<string, SfxId> = { arrow: 'arrow', javelin: 'javelin', stone: 'sling' };

/**
 * Where a field point is on screen -> stereo pan, loudness and priority.
 * Closer zoom = louder; off-screen sounds fade with distance and lose priority.
 */
export function spot(scene: Phaser.Scene, x: number, y: number): PlayOpts {
  const cam = scene.cameras?.main;
  const W = scene.scale?.width || 1;
  const H = scene.scale?.height || 1;
  if (!cam) return {};
  const p = isoToScreen(x, y);
  const sx = (p.x - cam.worldView.x) * cam.zoom;
  const sy = (p.y - cam.worldView.y) * cam.zoom;
  const dx = sx < 0 ? -sx : sx > W ? sx - W : 0;
  const dy = sy < 0 ? -sy : sy > H ? sy - H : 0;
  const off = Math.hypot(dx, dy) / Math.max(W, H);
  const zoom = Math.max(0.5, Math.min(1.15, 0.45 + 0.25 * cam.zoom));
  return {
    pan: Math.max(-1, Math.min(1, (sx / W) * 2 - 1)) * 0.8,
    vol: zoom / (1 + off * 4),
    pri: off > 0 ? -2 : 0,
  };
}

function groupCenter(sim: Battle, gid: number): { x: number; y: number } | null {
  const m = sim.activeMembers(gid);
  if (!m.length) return null;
  let x = 0;
  let y = 0;
  for (const u of m) {
    x += u.x;
    y += u.y;
  }
  return { x: x / m.length, y: y / m.length };
}

/** Battle events -> sounds and music intensity. Called with every drained batch (also empty ones). */
export function battleAudio(scene: Phaser.Scene, sim: Battle, events: readonly SimEvent[], me: number): void {
  let st = battles.get(sim);
  const now = scene.time?.now ?? 0;
  if (!st) battles.set(sim, (st = { phase: 'deploy', orders: new Map(), contact: new Set(), heat: 0, last: now, ended: false, tierAt: new Map() }));
  const state = st;
  const at = (x: number, y: number, extra?: PlayOpts): PlayOpts => ({ ...spot(scene, x, y), ...extra });
  const unitAt = (id: number, extra?: PlayOpts): PlayOpts => {
    const u = sim.units[id];
    return u ? at(u.x, u.y, extra) : (extra ?? {});
  };
  const mineUnit = (id: number): boolean => sim.units[id]?.side === me;
  // a juice tier lands (FL-01 R4): its one tier sound and its haptic, at most once per gap
  const tier = (kind: JuiceKind, o: PlayOpts, mine: boolean): void => {
    const last = state.tierAt.get(kind);
    if (last !== undefined && now - last < HAPTIC_GAP_MS) return;
    state.tierAt.set(kind, now);
    const id = JUICE_SFX[kind];
    if (id) sfx.play(id, o);
    buzz(hapticCue(kind, mine));
  };

  if (st.phase === 'deploy' && sim.phase === 'battle') {
    music.set('battle', 1);
    sfx.play('horn');
  }
  st.phase = sim.phase;

  // Charges: a group switching to the charge order sounds the horn and the rush of feet (or hooves).
  for (const g of sim.groups) {
    if (g.disbanded) continue;
    const prev = st.orders.get(g.id);
    st.orders.set(g.id, g.order);
    if (g.order !== 'charge' || prev === undefined || prev === 'charge' || sim.phase !== 'battle') continue;
    const c = groupCenter(sim, g.id);
    if (!c) continue;
    const mine = g.side === me;
    if (mine) sfx.play('horn', { vol: 0.9 });
    // riders and chariots: hooves instead of running feet
    const mounted = sim.units.some((u) => u.group === g.id && !!u.stats.mount && sim.isAlive(u));
    sfx.play(mounted ? 'hooves' : 'march', at(c.x, c.y, mine ? undefined : { vol: 0.7 }));
  }

  let heat = 0;
  for (const e of events) {
    switch (e.type) {
      case 'hit': {
        heat += 0.035;
        if (e.ranged) {
          if (Math.random() < 0.5) sfx.play('hit', unitAt(e.unit));
          break;
        }
        const w = sim.units[e.by]?.stats.weapon;
        sfx.play(w === 'spear' || w === 'lance' ? 'clashSpear' : w === 'axe' || w === 'club' ? 'clashHeavy' : 'clash', unitAt(e.unit));
        if (e.dmg > 3 || Math.random() < 0.35) sfx.play('hit', unitAt(e.unit, { vol: 0.8 }));
        break;
      }
      case 'block':
        heat += 0.03;
        sfx.play('block', unitAt(e.unit));
        break;
      case 'impact':
        heat += 0.1;
        sfx.play('impact', unitAt(e.unit));
        tier('impact', unitAt(e.unit, { pri: 1 }), mineUnit(e.unit) || mineUnit(e.by));
        break;
      case 'stakesBreak':
        heat += 0.1;
        tier('stakes', at(e.x, e.y, { pri: 1 }), mineUnit(e.unit));
        break;
      case 'standardLost':
        heat += 0.1;
        tier('standard', unitAt(e.unit, { pri: 2 }), e.side === me);
        break;
      case 'armyBreak':
        heat += 0.3;
        tier('armyBreak', { pri: 3 }, e.side === me);
        break;
      case 'death':
        heat += 0.08;
        sfx.play('death', unitAt(e.unit, { pri: sim.units[e.unit]?.side === me ? 1 : 0 }));
        break;
      case 'shot': {
        const kind = sim.projectiles.find((p) => p.id === e.proj)?.kind ?? 'arrow';
        sfx.play(MISSILE_SFX[kind] ?? 'arrow', unitAt(e.unit, { vol: 0.8 }));
        break;
      }
      case 'land': {
        const p = sim.projectiles.find((q) => q.id === e.proj);
        if (!p) break;
        sfx.play(e.hit ? (p.kind === 'stone' ? 'stoneHit' : 'thunk') : 'land', at(p.tx, p.ty));
        break;
      }
      case 'contact':
        heat += 0.25;
        if (!st.contact.has(e.side)) {
          st.contact.add(e.side);
          const c = groupCenter(sim, e.group);
          sfx.play('battlecry', c ? at(c.x, c.y, { pri: 2 }) : {});
        }
        break;
      case 'rout': {
        heat += 0.15;
        const c = groupCenter(sim, e.group);
        sfx.play('rout', c ? at(c.x, c.y, { pri: 2 }) : {});
        tier('rout', c ? at(c.x, c.y, { pri: 1 }) : {}, e.side === me);
        if (e.side === me) sfx.play('hornLow', { vol: 0.6 });
        break;
      }
      case 'ability':
        heat += 0.1;
        sfx.play(ABILITY_SFX[e.ability], unitAt(e.unit, { pri: sim.units[e.unit]?.side === me ? 2 : 0 }));
        break;
      case 'retreat':
        if (e.side === me) sfx.play('hornLow');
        break;
      case 'myth':
        heat += 0.12;
        beastAudio(e, at);
        break;
      case 'horn':
        sfx.play('horn', { pri: 3, vol: e.side === me ? 1 : 0.7 });
        break;
      case 'end':
        if (!st.ended) {
          st.ended = true;
          music.stinger(e.winner === me ? 'victory' : 'defeat');
        }
        break;
      default:
        break;
    }
  }

  // Music intensity: recent fighting, decaying over a few seconds.
  const dt = Math.max(0, now - st.last) / 1000;
  st.last = now;
  st.heat = Math.min(1.2, st.heat * Math.exp(-dt / 5) + heat);
  if (sim.phase === 'battle') music.heat(Math.min(1, st.heat));
}

function buzz(c: Cue): void {
  if (!c) return;
  if (c.kind === 'impact') haptic(c.style);
  else hapticNotify(c.style);
}

// ------------------------------------------------------------------ mythical beasts

const MYTH_SFX: Partial<Record<string, SfxId>> = {
  hurl: 'hurl', boulder: 'boulder', stomp: 'stomp', quake: 'stomp', sever: 'sever', regrow: 'hiss', seal: 'hiss', grab: 'impact',
  dive: 'screech', strike: 'screech', pounce: 'roar', land: 'impact', charge: 'roar', trample: 'impact', balk: 'bash',
  enrage: 'roar', breath: 'fire', goat: 'bleat', tail: 'hiss', roar: 'roar', immune: 'block',
};

/** A beast's signature move -> its sound (one line per act above). */
function beastAudio(e: Extract<SimEvent, { type: 'myth' }>, at: (x: number, y: number, extra?: PlayOpts) => PlayOpts): void {
  const id = MYTH_SFX[e.act];
  if (!id) return;
  const big = e.act === 'boulder' || e.act === 'quake' || e.act === 'enrage' || e.act === 'charge';
  sfx.play(id, at(e.act === 'boulder' ? e.tx : e.x, e.act === 'boulder' ? e.ty : e.y, big ? { pri: 2 } : undefined));
}
