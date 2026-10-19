/**
 * Siege on the iso map (M2c, W-29) with the art of ./siegeArt.ts, sorted with the units and buildings (10 + depth / 4096
 * + 0.25, as ./units.ts):
 *  - engines by type, state and facing (e s w n, nearest the sim heading), centred on the engine's point. Under
 *    construction the stage its labour reached; below half hp damaged; destroyed a wreck. A ram is layered: back, its crew
 *    (lifted onto the art's crew offsets, between the layers), front; attacking it plays its swing strip with the hit
 *    frame on the tick the blow lands. A stone thrower plays its throw strip with the release frame on the tick the
 *    boulder leaves (launch(): where it leaves). A siege ladder is carried flat carryPx up by its bearers (lifted onto the
 *    art's bearer offsets, carry clip), lies flat while built or uncrewed, rises (the push-off strip backwards) and, raised,
 *    is drawn as its ladder building (piece <stone-wall|rampart>-<side>, shaking while defenders push it); pushed off it
 *    falls (the push-off strip) and lies broken (-down) until carried again.
 *  - fire: flame loops on each burning piece sized by intensity (s / m / l), a smoke plume and embers over it; a scorch
 *    decal on the ground where it burned (smouldering a while once it fell).
 *  - rubble: breached wall tiles (breach-<wall>-<axis>-<a|b>, alternating along a run) and fallen towers.
 */
import Phaser from 'phaser';
import type { BuildingSnap, BuildingType, SiegeSnap, SiegeType, UnitSnap } from '../../types';
import { BUILDINGS } from '../../sim/economy';
import { RAM, THROWER } from '../../sim/siege';
import type { IsoMap } from '../iso';
import type { DrawUnit } from '../simClient';
import type { AnimTime } from '../anim';
import type { Lift } from '../build/buildingLayer';
import { facingOf, type SiegeArt, type SiegeSprite, type Strip } from './siegeArt';

const IN = 1e-6;
const TILE = 1 / 4096;
/** Px tall per type (the burning point sits at about half of it). */
const TALL: Partial<Record<BuildingType, number>> = { palisade: 56, rampart: 100, stoneWall: 160, woodTower: 120, stoneTower: 200, woodGate: 70, stoneGate: 100, ladder: 120, woodStairs: 40 };
const SCORCH_HOT_MS = 20000;
const RUBBLE_WALL: Partial<Record<BuildingType, string>> = { palisade: 'palisade', rampart: 'rampart', stoneWall: 'stone-wall', woodGate: 'palisade', stoneGate: 'stone-wall' };
const LADDER_TARGET: Partial<Record<BuildingType, string>> = { stoneWall: 'stone-wall', rampart: 'rampart', stoneTower: 'stone-wall', woodTower: 'rampart', stoneGate: 'stone-wall', woodGate: 'rampart' };
const SIDES: [number, number, string][] = [[1, 0, 'e'], [0, 1, 's'], [-1, 0, 'w'], [0, -1, 'n']];
const key = (x: number, y: number) => y * 65536 + x;
const pairs = (t: readonly number[]) => { const o: [number, number][] = []; for (let i = 0; i + 1 < t.length; i += 2) o.push([t[i], t[i + 1]]); return o; };
type V = { x: number; y: number; right: number; bottom: number };

/** A ladder knocked down: where it lies and since when (its push-off fall plays first). */
interface Down { piece: string; tx: number; ty: number; at: number }

export class SiegeLayer {
  art: SiegeArt | null = null;
  /** Build mode's siege tool: the engine to place, at a tile point, tinted green / red. */
  ghost: { type: SiegeType; x: number; y: number; ok: boolean } | null = null;
  /** Units carrying a ladder this frame (the carry clip). */
  readonly bearing = new Set<number>();
  private imgs: Phaser.GameObjects.Image[] = [];
  private ni = 0;
  private lifts = new Map<number, Lift>();
  /** Per siege ladder engine: the piece it stood as, while raised (to fall from). */
  private raisedAs = new Map<number, { piece: string; tx: number; ty: number }>();
  private down = new Map<number, Down>();
  /** Pieces seen burning: their tiles get a scorch decal (hot a while after they fell). */
  private burnt = new Map<number, { tiles: number[]; at: number; fell: number }>();
  private release = new Map<number, { x: number; y: number; px: number }>();

  constructor(private scene: Phaser.Scene, private iso: IsoMap, private depthOf: (x: number, y: number) => number) {}

  private D(x: number, y: number): number {
    return 10 + this.depthOf(x, y) / 4096 + 0.25;
  }

  private pt(x: number, y: number, z = this.iso.zAt(x, y)): { x: number; y: number } {
    return { x: this.iso.sx(x, y), y: this.iso.sy(x, y, z) };
  }

  private img(texture: string, frame?: number): Phaser.GameObjects.Image {
    let im = this.imgs[this.ni];
    if (!im) this.imgs.push((im = this.scene.add.image(0, 0, texture).setOrigin(0)));
    this.ni++;
    return im.setTexture(texture, frame).setOrigin(0).setScale(1).setAngle(0).setAlpha(1).clearTint().setFlipX(false).setVisible(true);
  }

  /** A sprite with its footprint's north tile top vertex at tile (tx, ty) on level z, raised px. */
  private put(s: { key: string; tileOrigin: { x: number; y: number } }, tx: number, ty: number, depth: number, px = 0, frame?: number, z = this.iso.zAt(tx + 0.5, ty + 0.5)): Phaser.GameObjects.Image {
    const p = this.pt(tx, ty, z);
    return this.img(s.key, frame).setPosition(Math.round(p.x - s.tileOrigin.x), Math.round(p.y - s.tileOrigin.y - px)).setDepth(depth);
  }

  /** A loop fx frame with its anchor at world px (x, y). */
  private fx(id: string, x: number, y: number, depth: number, now: number, seed: number, scale = 1, alpha = 1): void {
    const f = this.art!.fx.get(id);
    if (!f) return;
    const frame = f.fps ? Math.floor(((now + seed * 137) * f.fps) / 1000) % f.frames : 0;
    this.img(f.key, frame).setScale(scale).setPosition(Math.round(x - f.anchor.x * scale), Math.round(y - f.anchor.y * scale)).setDepth(depth).setAlpha(alpha);
  }

  /** Where a stone thrower's boulder leaves (tile point and px above its ground), or null. */
  launch(siege: number): { x: number; y: number; px: number } | null {
    return this.release.get(siege) ?? null;
  }

  /** Crew and bearers: drawn on the art's offsets (null: as the sim has them). */
  lift(d: { x: number; y: number; u?: UnitSnap }): Lift | null {
    return d.u ? this.lifts.get(d.u.id) ?? null : null;
  }

  draw(sieges: readonly SiegeSnap[], buildings: readonly BuildingSnap[], units: readonly DrawUnit[], at: AnimTime, snapTick: number, v: V): void {
    this.ni = 0;
    this.lifts.clear();
    this.bearing.clear();
    this.release.clear();
    if (this.art) {
      const crews = new Map<number, DrawUnit[]>();
      for (const d of units) if (d.u.task === 'crew' && d.u.state !== 'dead') {
        const l = crews.get(d.u.squad);
        if (l) l.push(d); else crews.set(d.u.squad, [d]);
      }
      const byId = new Map(buildings.map((b) => [b.id, b]));
      for (const e of sieges) this.engine(e, crews.get(e.crew) ?? [], byId, at, snapTick, v);
      this.ground(buildings, at.now, v);
      if (this.ghost) this.drawGhost(this.ghost);
    }
    for (let i = this.ni; i < this.imgs.length; i++) this.imgs[i].setVisible(false);
  }

  private visible(v: V, x: number, y: number, m = 300): boolean {
    const p = this.pt(x, y);
    return p.x > v.x - m && p.x < v.right + m && p.y > v.y - m && p.y < v.bottom + m * 2;
  }

  private engine(e: SiegeSnap, crew: DrawUnit[], byId: Map<number, BuildingSnap>, at: AnimTime, snapTick: number, v: V): void {
    const art = this.art!, f = facingOf(e.facing), now = at.now;
    if (e.type === 'siegeLadder') return this.ladderEngine(e, crew, byId, at, v);
    if (!this.visible(v, e.x, e.y)) return;
    const j = art.engine(e.type === 'ram' ? 'ram' : 'thrower');
    if (!j) return;
    const [w, h] = j.footprint[f], x0 = e.x - w / 2, y0 = e.y - h / 2, z = this.iso.zAt(e.x, e.y);
    const stage = this.stage(e);
    const back = art.sprites.get(j.states[f][stage]);
    const base = this.D(e.x, e.y);
    if (!back) return;
    // the strips: ram swing (hit frame on the blow), thrower throw (release frame as the boulder leaves)
    let strip: Strip | undefined, frame = 0;
    if (e.swing !== undefined && (stage === 'done' || stage === 'damaged')) {
      const last = snapTick - 1 - e.swing; // the tick of the last blow / shot (shown one tick later)
      if (e.type === 'ram' && e.state === 'attack') {
        const s = art.strip('ram', f, 'swing');
        const fr = s ? this.frameNear(s, s.hitFrame ?? 6, at.tick, last, RAM.ticks) : null;
        if (s && fr !== null) { strip = s; frame = fr; }
      } else if (e.type === 'stoneThrower' && e.state === 'deployed') {
        const s = art.strip('thrower', f, 'throw');
        const fr = s ? this.frameNear(s, s.releaseFrame ?? 3, at.tick, last, THROWER.reload) : null;
        if (s && fr !== null && fr > 0) { strip = s; frame = fr; }
      }
    }
    const im = strip ? this.put(strip, x0, y0, base - 20 * IN, 0, frame, z) : this.put(back, x0, y0, base - 20 * IN, 0, undefined, z);
    if (e.state === 'destroyed') im.setTint(0x9a9088);
    if (e.type === 'stoneThrower' && j.release) {
      const r = j.release[f];
      this.release.set(e.id, { x: x0 + r.x, y: y0 + r.y, px: r.zM * art.ppm });
    }
    if (j.layered) {
      const fk = j.front?.[f]?.[stage], front = fk && art.sprites.get(fk);
      if (front) this.put(front, x0, y0, base + 40 * IN, 0, undefined, z).setTint(e.state === 'destroyed' ? 0x9a9088 : 0xffffff);
      // the crew on the art's offsets, between the layers, facing the way it points
      const offs = j.crew?.[f] ?? [];
      const men = crew.filter((d) => Math.hypot(d.x - e.x, d.y - e.y) < 3).sort((a, b) => a.u.id - b.u.id);
      men.slice(0, offs.length).forEach((d, i) => {
        const [ox, oy] = offs[i];
        this.lifts.set(d.u.id, { x: x0 + ox, y: y0 + oy, z, px: 0, depth: base + (1 + i) * IN, facing: e.facing });
      });
    }
    if (e.burning) this.blaze(e.x, e.y, z, 40, e.burning, base + 60 * IN, now, e.id + 9000, 2);
  }

  private drawGhost(g: { type: SiegeType; x: number; y: number; ok: boolean }): void {
    const art = this.art!, tint = g.ok ? 0x90ff90 : 0xff7070;
    if (g.type === 'siegeLadder') {
      const c = art.ladders.carry['stone-wall-x'], s = c && art.sprites.get(c.sprite);
      if (s) this.put(s, g.x - c.footprint[0] / 2, g.y - c.footprint[1] / 2, 11.3).setTint(tint).setAlpha(0.7);
      return;
    }
    const j = art.engine(g.type === 'ram' ? 'ram' : 'thrower');
    if (!j) return;
    const [w, h] = j.footprint.s, back = art.sprites.get(j.states.s.done), fk = j.front?.s?.done, front = fk && art.sprites.get(fk);
    if (back) this.put(back, g.x - w / 2, g.y - h / 2, 11.3).setTint(tint).setAlpha(0.7);
    if (front) this.put(front, g.x - w / 2, g.y - h / 2, 11.3 + IN).setTint(tint).setAlpha(0.7);
  }

  /** Frame of a strip whose key frame shows on render tick last + 1 and every `period` ticks after (null: rest). */
  private frameNear(s: Strip, keyFrame: number, tick: number, last: number, period: number): number | null {
    const perTick = s.fps / 10;
    for (const k of [last, last + period]) {
      const fr = keyFrame + Math.floor((tick - (k + 1)) * perTick);
      if (fr >= 0 && fr < s.frames) return fr;
    }
    return null;
  }

  private stage(e: SiegeSnap): string {
    if (e.state === 'destroyed') return 'destroyed';
    if (e.state === 'building') return e.progress >= 0.6 ? 'scaffold' : e.progress >= 0.25 ? 'rising' : 'foundation';
    return e.hp < e.maxHp / 2 ? 'damaged' : 'done';
  }

  /** The target kit ('stone-wall' / 'rampart') a ladder engine is sized for: its wall's, else the stone wall's. */
  private targetOf(e: SiegeSnap, byId: Map<number, BuildingSnap>): string {
    const t = e.target !== undefined ? byId.get(e.target) : undefined;
    return (t && LADDER_TARGET[t.type]) || 'stone-wall';
  }

  private ladderEngine(e: SiegeSnap, crew: DrawUnit[], byId: Map<number, BuildingSnap>, at: AnimTime, v: V): void {
    const art = this.art!, now = at.now;
    if (e.state === 'raised') {
      // drawn as its ladder building (ground()); remember the piece to fall from
      const l = e.ladder !== undefined ? byId.get(e.ladder) : undefined, p = l && this.ladderPiece(l, byId);
      if (p && l) this.raisedAs.set(e.id, { piece: p, tx: l.tiles[0], ty: l.tiles[1] });
      return;
    }
    const was = this.raisedAs.get(e.id);
    if (was) { this.raisedAs.delete(e.id); this.down.set(e.id, { ...was, at: now }); }
    if (e.state === 'move' || e.state === 'destroyed') this.down.delete(e.id);
    if (!this.visible(v, e.x, e.y)) return;
    const dn = this.down.get(e.id);
    if (dn) {
      const s = art.strips.get(`sg-pushoff-${dn.piece}`), fr = s ? Math.floor(((now - dn.at) * s.fps) / 1000) : 99;
      const depth = this.D(dn.tx + 0.8, dn.ty + 0.8);
      if (s && fr < s.frames) this.put(s, dn.tx, dn.ty, depth, 0, fr);
      else {
        const d = art.sprites.get(`ladder-${dn.piece}-down`);
        if (d) this.put(d, dn.tx, dn.ty, this.D(dn.tx + 0.5, dn.ty + 0.5) - 0.2 * TILE);
      }
      if (e.burning) this.blaze(dn.tx + 0.5, dn.ty + 0.5, this.iso.zAt(dn.tx + 0.5, dn.ty + 0.5), 4, e.burning, depth + IN, now, e.id + 7000, 1);
      return;
    }
    const target = this.targetOf(e, byId), f = facingOf(e.facing), axis = f === 'e' || f === 'w' ? 'x' : 'y';
    const c = art.ladders.carry[`${target}-${axis}`] ?? art.ladders.carry[`stone-wall-${axis}`];
    const spr = c && art.sprites.get(c.sprite);
    if (!c || !spr) return;
    const [w, h] = c.footprint, x0 = e.x - w / 2, y0 = e.y - h / 2, z = this.iso.zAt(e.x, e.y);
    if (e.state === 'raising') {
      // the fall backwards: up from flat to the wall
      const side = this.sideTo(e), piece = `${target}-${side}`, s = art.strips.get(`sg-pushoff-${piece}`);
      const tx = Math.floor(e.x), ty = Math.floor(e.y);
      if (s) { this.put(s, tx, ty, this.D(tx + 0.8, ty + 0.8), 0, Math.max(0, Math.min(s.frames - 1, Math.round((1 - e.progress) * (s.frames - 1))))); return; }
    }
    const men = crew.filter((d) => Math.hypot(d.x - e.x, d.y - e.y) < 3).sort((a, b) => a.u.id - b.u.id);
    const carried = e.state === 'move' && men.length >= Math.min(c.bearers.length, e.crewNeed);
    const im = this.put(spr as SiegeSprite, x0, y0, this.D(x0 + w, y0 + h) + IN, carried ? c.carryPx : 0, undefined, z);
    if (e.state === 'building') im.setAlpha(0.45 + 0.55 * e.progress);
    if (e.state === 'destroyed') im.setTint(0x6a6058);
    if (carried) men.slice(0, c.bearers.length).forEach((d, i) => {
      const [ox, oy] = c.bearers[i];
      this.lifts.set(d.u.id, { x: x0 + ox, y: y0 + oy, z, px: 0, facing: e.facing });
      this.bearing.add(d.u.id);
    });
    if (e.burning) this.blaze(e.x, e.y, z, carried ? c.carryPx : 4, e.burning, this.D(x0 + w, y0 + h) + 2 * IN, now, e.id + 7000, 1);
  }

  /** Side letter from an engine towards its facing (the wall it goes up). */
  private sideTo(e: SiegeSnap): string {
    return facingOf(e.facing);
  }

  /** The siege ladder piece of ladder building l: <target>-<side of the wall face it leans on>. */
  private ladderPiece(l: BuildingSnap, byId: Map<number, BuildingSnap>): string | null {
    const [x, y] = l.tiles, a = l.attach !== undefined ? byId.get(l.attach) : undefined;
    if (!a) return null;
    const own = new Set(pairs(a.tiles).map(([p, q]) => key(p, q)));
    for (const [dx, dy, side] of SIDES) if (own.has(key(x + dx, y + dy))) return `${LADDER_TARGET[a.type] ?? 'stone-wall'}-${side}`;
    return null;
  }

  /** Raised siege ladders, fire on buildings, scorch decals, rubble. */
  private ground(buildings: readonly BuildingSnap[], now: number, v: V): void {
    const art = this.art!, byId = new Map(buildings.map((b) => [b.id, b]));
    for (const b of buildings) {
      if (b.burning && b.state !== 'destroyed' && !this.burnt.has(b.id)) this.burnt.set(b.id, { tiles: b.tiles, at: now, fell: 0 });
      const scorch = this.burnt.get(b.id);
      if (scorch && b.state === 'destroyed' && !scorch.fell) scorch.fell = now;
      if (!this.visible(v, b.x, b.y, Math.max(b.w, b.h) * 32 + 300)) continue;
      if (scorch) for (const [x, y] of pairs(b.tiles)) {
        const hot = scorch.fell && now - scorch.fell < SCORCH_HOT_MS, p = this.pt(x + 0.5, y + 0.5);
        this.fx(hot ? 'scorch' : 'scorch-cold', p.x, p.y, 2.6, now, x * 7 + y, 1, b.burning || hot ? 1 : 0.85);
      }
      if (b.siege !== undefined && b.state !== 'destroyed') {
        const piece = this.ladderPiece(b, byId), s = piece && art.sprites.get(`ladder-${piece}`);
        if (s) {
          const jig = b.push ? Math.round(Math.sin(now / 45) * 2 * Math.min(1, b.push * 3)) : 0;
          const im = this.put(s, b.tiles[0], b.tiles[1], this.D(b.tiles[0] + 0.8, b.tiles[1] + 0.8));
          im.x += jig;
        }
      }
      if (b.state === 'destroyed' && b.rubble) this.rubble(b);
      if (b.burning && b.state !== 'destroyed') this.burnPiece(b, now);
    }
  }

  /** Flames on each burning tile of a piece (walls: every tile of the line; buildings: a few over the footprint), smoke over it. */
  private burnPiece(b: BuildingSnap, now: number): void {
    const def = BUILDINGS[b.type], tall = TALL[b.type] ?? 50, ts = pairs(b.tiles);
    const line = def.wall === 'segment' && (b.depth ?? 1) > 1 ? ts.slice(0, ts.length / 2) : ts;
    const pts = def.wall || def.access ? line.map(([x, y]) => [x + 0.5, y + 0.5]) : [[b.x, b.y], [b.x - b.w / 4, b.y + b.h / 4], [b.x + b.w / 4, b.y - b.h / 4]];
    pts.forEach(([x, y], i) => {
      const z = this.iso.zAt(x, y), lead = i === Math.floor(pts.length / 2);
      this.blaze(x, y, z, tall * 0.45, b.burning! * (0.75 + 0.25 * ((i * 37) % 4) / 3), this.D(x + 0.5, y + 0.5) + 30 * IN, now, b.id * 31 + i, lead ? 2 : i % 3 === 0 ? 1 : 0);
    });
  }

  /**
   * Fire at tile point (x, y) on level z, `up` px above the ground: a flame loop sized by intensity; smoke (extra 2) and
   * embers (extra >= 1) over it.
   */
  private blaze(x: number, y: number, z: number, up: number, k: number, depth: number, now: number, seed: number, extra: number): void {
    const p = this.pt(x, y, z), fy = p.y - up;
    const id = k < 0.34 ? 'flame-s' : k < 0.67 ? 'flame-m' : 'flame-l';
    this.fx(id, p.x, fy + 4, depth, now, seed, 1, Math.min(1, 0.55 + k));
    if (extra >= 1 && k > 0.25) this.fx('embers', p.x + 2, fy - 4, depth + IN, now, seed + 3, 1, Math.min(1, k + 0.2));
    if (extra >= 2) this.fx('smoke', p.x + 4, fy - 6, 10.88, now, seed + 5, 0.7 + 0.5 * k, 0.35 + 0.45 * k);
  }

  /** Rubble of a breached wall, gate or fallen tower. */
  private rubble(b: BuildingSnap): void {
    const art = this.art!, def = BUILDINGS[b.type], ts = pairs(b.tiles);
    if (def.wall === 'tower') {
      const s = art.sprites.get(b.type === 'stoneTower' ? 'tower-rubble-stone' : 'tower-rubble-wood');
      const x0 = Math.min(...ts.map((t) => t[0])), y0 = Math.min(...ts.map((t) => t[1]));
      if (s) this.put(s, x0, y0, this.D(x0 + 1, y0 + 1) - 0.4 * TILE);
      return;
    }
    const wall = RUBBLE_WALL[b.type];
    if (!wall) return;
    const alongX = b.w >= b.h, axis = alongX ? 'x' : 'y', deep = wall !== 'palisade';
    const set = new Set(ts.map(([x, y]) => key(x, y)));
    // a 2-deep wall: one sprite per line tile over it and its inner neighbour; gates the same over their tiles
    const done = new Set<number>();
    for (const [x, y] of ts) {
      if (done.has(key(x, y))) continue;
      let tx = x, ty = y;
      if (deep) {
        const [ix, iy] = alongX ? [x, y + 1] : [x + 1, y], [jx, jy] = alongX ? [x, y - 1] : [x - 1, y];
        if (set.has(key(ix, iy))) done.add(key(ix, iy));
        else if (set.has(key(jx, jy))) { done.add(key(jx, jy)); tx = jx; ty = jy; }
      }
      done.add(key(x, y));
      const variant = ((alongX ? x : y) & 1) === 0 ? 'a' : 'b';
      const s = art.sprites.get(`breach-${wall}-${axis}-${variant}`);
      if (s) this.put(s, tx, ty, this.D(tx + 0.5, ty + 0.5) - 0.4 * TILE);
    }
  }
}
