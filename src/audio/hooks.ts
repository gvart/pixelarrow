/**
 * The event -> sound mapping, all in one place. Scenes call these one-liners;
 * change what plays (and how loud, where, how often) here.
 */
import type Phaser from 'phaser';
import type { Battle } from '../sim/battle';
import type { SimEvent } from '../sim/types';
import type { AbilityId } from '../data/perks';
import { isoToScreen } from '../art/iso';
import { music, sfx } from './index';
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

/** Buttons in src/ui/kit: back arrows get the back sound, everything else a click. */
export function uiButton(icon?: string): void {
  sfx.play(icon === 'back' ? 'back' : 'click');
}

export function uiError(): void {
  sfx.play('error');
}

export function uiCoin(): void {
  sfx.play('coin');
}

export function uiLevelUp(): void {
  sfx.play('levelUp');
}

// ------------------------------------------------------------------ battle

interface BattleState {
  phase: string;
  orders: Map<number, string>;
  contact: Set<number>;
  heat: number;
  last: number;
  ended: boolean;
}
const battles = new WeakMap<Battle, BattleState>();

const ABILITY_SFX: Record<AbilityId, SfxId> = { bash: 'bash', volley: 'volley', berserk: 'berserk', rally: 'rallyCry' };
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
  if (!st) battles.set(sim, (st = { phase: 'deploy', orders: new Map(), contact: new Set(), heat: 0, last: scene.time?.now ?? 0, ended: false }));
  const at = (x: number, y: number, extra?: PlayOpts): PlayOpts => ({ ...spot(scene, x, y), ...extra });
  const unitAt = (id: number, extra?: PlayOpts): PlayOpts => {
    const u = sim.units[id];
    return u ? at(u.x, u.y, extra) : (extra ?? {});
  };

  if (st.phase === 'deploy' && sim.phase === 'battle') {
    music.set('battle', 1);
    sfx.play('horn');
  }
  st.phase = sim.phase;

  // Charges: a group switching to the charge order sounds the horn and the rush of feet.
  for (const g of sim.groups) {
    if (g.disbanded) continue;
    const prev = st.orders.get(g.id);
    st.orders.set(g.id, g.order);
    if (g.order !== 'charge' || prev === undefined || prev === 'charge' || sim.phase !== 'battle') continue;
    const c = groupCenter(sim, g.id);
    if (!c) continue;
    const mine = g.side === me;
    if (mine) sfx.play('horn', { vol: 0.9 });
    sfx.play('march', at(c.x, c.y, mine ? undefined : { vol: 0.7 }));
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
        sfx.play(w === 'spear' ? 'clashSpear' : w === 'axe' || w === 'club' ? 'clashHeavy' : 'clash', unitAt(e.unit));
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
  const now = scene.time?.now ?? 0;
  const dt = Math.max(0, now - st.last) / 1000;
  st.last = now;
  st.heat = Math.min(1.2, st.heat * Math.exp(-dt / 5) + heat);
  if (sim.phase === 'battle') music.heat(Math.min(1, st.heat));
}
