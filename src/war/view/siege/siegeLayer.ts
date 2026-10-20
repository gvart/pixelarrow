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
 *  - fire (objects.json fireNote): emitters fixed per burning piece and intensity (low k < 0.34, medium < 0.67, high).
 *    Each visible face is a wall run (a wall segment: its run's front face; a tower, gate, stairs, ladder or engine: its
 *    south and east faces); per face tile 5 / 11 / 15 flame tongues of 3 sizes x 3 shapes along the face, mostly low (up
 *    to 25 / 60 / 95 % of the wood's height, a few l at the top edge at high), each with a fixed phase, drawn at scale 1
 *    (intensity changes count and size); a foot fire sheet at medium / high; a heat glow on the ground (add); embers
 *    (add) and smoke wisps over it, alpha by intensity; at high a few tongues on the platform / roof edge. Charring
 *    overlays over the kit (scorch low, charred medium, smoulder high; ../build/buildingLayer.ts charOf); once out it
 *    smoulders ~20 s (smoulder fx, a faint wisp, the smoulder overlay), then stays charred. A scorch decal on the
 *    ground where a piece burned down (smouldering a while once it fell).
 *  - rubble: breached wall tiles (breach-<wall>-<axis>-<a|b>, alternating along a run) and fallen towers.
 */
import Phaser from 'phaser';
import type { BuildingSnap, BuildingType, SiegeSnap, SiegeType, UnitSnap } from '../../types';
import { BUILDINGS } from '../../sim/economy';
import { OXY, RAM, THROWER } from '../../sim/siege';
import type { IsoMap } from '../iso';
import type { DrawUnit } from '../simClient';
import type { AnimTime } from '../anim';
import type { Lift } from '../build/buildingLayer';
import { facingOf, type SiegeArt, type SiegeSprite, type Strip } from './siegeArt';

const IN = 1e-6;
const TILE = 1 / 4096;
const SCORCH_HOT_MS = 20000;
const SMOULDER_MS = 20000;
type Level = 'low' | 'medium' | 'high';
const levelOf = (k: number): Level => (k < 0.34 ? 'low' : k < 0.67 ? 'medium' : 'high');
/** Tongues reach up to this share of the wood's height, by level. */
const ZMAX: Record<Level, number> = { low: 0.25, medium: 0.6, high: 0.95 };
const CHAR: Record<Level, string> = { low: 'scorch', medium: 'charred', high: 'smoulder' };
/** Height of the burning wood (m): walls whole, towers up to the platform, engines their frame. */
const WOOD_M: Partial<Record<BuildingType, number>> = { palisade: 3, rampart: 4, woodGate: 3.5, woodTower: 4.4, woodStairs: 1.4, ladder: 3, woodBridge: 2.4 };
const ENGINE_M = 2.2;
/** Where a wall's burning face sits across its tile (palisade: the stakes; the rest: the outer face). */
const FACE: Partial<Record<BuildingType, number>> = { palisade: 0.6 };
/** One fx loop placed at world px (x, y) (anchor), its phase seed, alpha, depth. */
interface Emitter { id: string; x: number; y: number; ph: number; alpha: number; depth: number; flip?: boolean }
/** A face of a burning piece from (ax, ay) to (bx, by) (tile points), `tiles` long, with its ground level and depth. */
interface Face { ax: number; ay: number; bx: number; by: number; tiles: number; z: number; depth: number }
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
  /** Fire emitters per burning piece (key: building id, or -1 - engine id), rebuilt when its level changes. */
  private fires = new Map<number, { level: Level; list: Emitter[] }>();
  /** Pieces whose fire went out (not burnt down): since when (smoulder, then charred). */
  private out = new Map<number, number>();
  private now = 0;

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
    return im.setTexture(texture, frame).setOrigin(0).setScale(1).setAngle(0).setAlpha(1).clearTint().setFlipX(false).setBlendMode(Phaser.BlendModes.NORMAL).setVisible(true);
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

  /** The charring overlay over building b's kit `kit` (../build/buildingLayer.ts), by its fire or how long it has been out. */
  charOf(b: BuildingSnap, kit: string, layer: 'back' | 'front'): string | undefined {
    if (!this.art || b.state === 'destroyed') return undefined;
    const out = this.out.get(b.id);
    const level = b.burning ? CHAR[levelOf(b.burning)] : out === undefined ? null : this.now - out < SMOULDER_MS ? 'smoulder' : 'charred';
    return level ? this.art.char.get(`${kit}-${level}-${layer}`) : undefined;
  }

  /** M5h: the workplaces' working fx this frame (../build/buildingLayer.ts working), world px. */
  working: readonly { id: string; x: number; y: number; alpha: number; depth: number; seed: number }[] = [];

  draw(sieges: readonly SiegeSnap[], buildings: readonly BuildingSnap[], units: readonly DrawUnit[], at: AnimTime, snapTick: number, v: V): void {
    this.ni = 0;
    if (this.art)
      for (const w of this.working) {
        if (w.x < v.x - 80 || w.x > v.right + 80 || w.y < v.y - 40 || w.y > v.bottom + 160) continue;
        this.fx(w.id, w.x, w.y, w.depth, at.now, w.seed, 1, w.alpha);
        if (this.art.fx.get(w.id)?.blend === 'add') this.imgs[this.ni - 1].setBlendMode(Phaser.BlendModes.ADD);
      }
    this.now = at.now;
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
    if (!this.visible(v, e.x, e.y, e.type === 'siegeTower' ? 500 : 300)) return;
    const j = art.engine(e.type);
    if (!j) return;
    const id = j.id, tower = e.type === 'siegeTower';
    // a docking or docked tower backs off half a tile so its face meets the wall face (the sim holds it on the foot tile)
    const dock = tower && (e.state === 'raising' || e.state === 'raised') ? 0.5 * (e.state === 'raised' ? 1 : Math.min(1, e.progress * 5)) : 0;
    const cx = e.x - Math.cos(e.facing) * dock, cy = e.y - Math.sin(e.facing) * dock;
    const [w, h] = j.footprint[f], x0 = cx - w / 2, y0 = cy - h / 2, z = this.iso.zAt(e.x, e.y);
    const stage = this.stage(e);
    const back = art.sprites.get(j.states[f][stage]);
    const base = this.D(cx, cy);
    if (!back) return;
    const done = stage === 'done' || stage === 'damaged';
    // the strips: ram swing (hit frame on the blow), thrower throw / oxybeles shoot (release frame as the shot leaves),
    // tower bridge (lowered by the dock's progress, the last frame docked)
    let strip: Strip | undefined, frame = 0, bridge: Strip | undefined, bframe = 0;
    if (e.swing !== undefined && done) {
      const last = snapTick - 1 - e.swing; // the tick of the last blow / shot (shown one tick later)
      if ((e.type === 'ram' || e.type === 'coveredRam') && e.state === 'attack') {
        const s = art.strip(id, f, 'swing');
        const fr = s ? this.frameNear(s, s.hitFrame ?? 6, at.tick, last, RAM.ticks) : null;
        if (s && fr !== null) { strip = s; frame = fr; }
      } else if (e.type === 'stoneThrower' && e.state === 'deployed') {
        const s = art.strip(id, f, 'throw');
        const fr = s ? this.frameNear(s, s.releaseFrame ?? 3, at.tick, last, THROWER.reload) : null;
        if (s && fr !== null && fr > 0) { strip = s; frame = fr; }
      } else if (e.type === 'oxybeles') {
        const s = art.strip(id, f, 'shoot');
        const fr = s ? this.frameNear(s, s.releaseFrame ?? 2, at.tick, last, OXY.reload) : null;
        if (s && fr !== null && fr > 0) { strip = s; frame = fr; }
      }
    }
    if (tower && done && dock > 0) {
      const s = art.strip(id, f, 'bridge');
      if (s) { bridge = s; bframe = e.state === 'raised' ? s.frames - 1 : Math.max(0, Math.min(s.frames - 1, Math.floor(e.progress * s.frames))); }
    }
    // the bridge strip is the tower's front layer facing e / s (the bridge swings towards the viewer), else its back layer
    const bridgeBack = !!bridge && (f === 'w' || f === 'n');
    const im = strip ? this.put(strip, x0, y0, base - 20 * IN, 0, frame, z) : bridgeBack ? this.put(bridge!, x0, y0, base - 20 * IN, 0, bframe, z) : this.put(back, x0, y0, base - 20 * IN, 0, undefined, z);
    if (e.state === 'destroyed') im.setTint(0x9a9088);
    if (j.release) {
      const r = j.release[f];
      this.release.set(e.id, { x: x0 + r.x, y: y0 + r.y, px: r.zM * art.ppm });
    }
    if (j.layered) {
      const fk = j.front?.[f]?.[stage], front = fk && art.sprites.get(fk);
      if (bridge && !bridgeBack) this.put(bridge, x0, y0, base + 40 * IN, 0, bframe, z);
      else if (front) this.put(front, x0, y0, base + 40 * IN, 0, undefined, z).setTint(e.state === 'destroyed' ? 0x9a9088 : 0xffffff);
    }
    if (j.layered || e.type === 'oxybeles') {
      // the crew on the art's offsets (between the layers), facing the way it points
      const offs = j.crew?.[f] ?? [];
      const men = crew.filter((d) => Math.hypot(d.x - e.x, d.y - e.y) < 3).sort((a, b) => a.u.id - b.u.id);
      men.slice(0, offs.length).forEach((d, i) => {
        const [ox, oy] = offs[i];
        this.lifts.set(d.u.id, { x: x0 + ox, y: y0 + oy, z, px: 0, depth: base + (1 + i) * IN, facing: e.facing });
      });
    }
    if (e.burning) {
      const hM = j.heightM ? Math.min(j.heightM * 0.8, 8) : ENGINE_M;
      this.burn(-1 - e.id, e.burning, [this.face(x0, y0 + h, x0 + w, y0 + h, w, z, base + 60 * IN), this.face(x0 + w, y0 + h, x0 + w, y0, h, z, base + 60 * IN)], hM, null, now, v);
    } else this.fires.delete(-1 - e.id);
  }

  private drawGhost(g: { type: SiegeType; x: number; y: number; ok: boolean }): void {
    const art = this.art!, tint = g.ok ? 0x90ff90 : 0xff7070;
    if (g.type === 'siegeLadder') {
      const c = art.ladders.carry['stone-wall-x'], s = c && art.sprites.get(c.sprite);
      if (s) this.put(s, g.x - c.footprint[0] / 2, g.y - c.footprint[1] / 2, 11.3).setTint(tint).setAlpha(0.7);
      return;
    }
    const j = art.engine(g.type);
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
      if (b.burning) this.out.delete(b.id);
      else if (scorch && !scorch.fell && b.state !== 'destroyed' && !this.out.has(b.id)) this.out.set(b.id, now);
      if (!b.burning || b.state === 'destroyed') this.fires.delete(b.id);
      if (!this.visible(v, b.x, b.y, Math.max(b.w, b.h) * 32 + 300)) continue;
      if (scorch?.fell) for (const [x, y] of pairs(b.tiles)) {
        const hot = scorch.fell && now - scorch.fell < SCORCH_HOT_MS, p = this.pt(x + 0.5, y + 0.5);
        this.fx(hot ? 'scorch' : 'scorch-cold', p.x, p.y, 2.6, now, x * 7 + y, 1, b.burning || hot ? 1 : 0.85);
      }
      if (b.siege !== undefined && b.state !== 'destroyed' && b.type !== 'towerBridge') { // a tower's bridge: drawn with the tower
        const piece = this.ladderPiece(b, byId), s = piece && art.sprites.get(`ladder-${piece}`);
        if (s) {
          const jig = b.push ? Math.round(Math.sin(now / 45) * 2 * Math.min(1, b.push * 3)) : 0;
          const im = this.put(s, b.tiles[0], b.tiles[1], this.D(b.tiles[0] + 0.8, b.tiles[1] + 0.8));
          im.x += jig;
        }
      }
      if (b.state === 'destroyed' && b.rubble) this.rubble(b);
      if (b.burning && b.state !== 'destroyed') this.burnPiece(b, now, v);
      else if (b.state !== 'destroyed' && this.out.has(b.id) && now - this.out.get(b.id)! < SMOULDER_MS) this.smoulder(b, now);
    }
  }

  /** The visible faces of a piece: a wall segment's run front (one per run tile), else its south and east faces. */
  private faces(b: BuildingSnap): Face[] {
    const def = BUILDINGS[b.type], ts = pairs(b.tiles);
    if (def.wall === 'segment') {
      const alongX = b.w >= b.h, f = FACE[b.type] ?? 0.95, front = new Map<number, [number, number]>();
      // per run tile the outermost row (+y for a run along x, +x along y): its face
      for (const [x, y] of ts) {
        const k = alongX ? x : y, o = front.get(k);
        if (!o || (alongX ? y > o[1] : x > o[0])) front.set(k, [x, y]);
      }
      return [...front.values()].map(([x, y]) => alongX
        ? this.face(x, y + f, x + 1, y + f, 1, this.iso.zAt(x + 0.5, y + 0.5), this.D(x + 0.5, y + 0.5) + 30 * IN)
        : this.face(x + f, y, x + f, y + 1, 1, this.iso.zAt(x + 0.5, y + 0.5), this.D(x + 0.5, y + 0.5) + 30 * IN));
    }
    const x0 = Math.min(...ts.map((t) => t[0])), y0 = Math.min(...ts.map((t) => t[1])), x1 = Math.max(...ts.map((t) => t[0])) + 1, y1 = Math.max(...ts.map((t) => t[1])) + 1;
    const z = this.iso.zAt(x0 + 0.5, y0 + 0.5), d = this.D(x1, y1) + 3 * IN;
    return [this.face(x0 + 0.1, y1, x1, y1, x1 - x0, z, d), this.face(x1, y1, x1, y0 + 0.1, y1 - y0, z, d)];
  }

  private face(ax: number, ay: number, bx: number, by: number, tiles: number, z: number, depth: number): Face {
    return { ax, ay, bx, by, tiles: Math.max(1, Math.round(tiles)), z, depth };
  }

  /** A burning piece: its emitters (fixed per piece and level), drawn where in view. */
  private burnPiece(b: BuildingSnap, now: number, v: V): void {
    const def = BUILDINGS[b.type], top = def.wall === 'tower' || def.wall === 'gate' ? (WOOD_M[b.type] ?? 3) : null;
    this.burn(b.id, b.burning!, this.faces(b), WOOD_M[b.type] ?? 3, top, now, v);
  }

  /**
   * Fire of piece `id` at intensity k over its faces, wood hM metres high; topM: the platform / roof edge (2-3 tongues
   * there at high). Emitters are laid out once per level (fireNote) and drawn as loops with their own phase.
   */
  private burn(id: number, k: number, faces: Face[], hM: number, topM: number | null, now: number, v: V): void {
    const level = levelOf(k);
    let f = this.fires.get(id);
    if (!f || f.level !== level) this.fires.set(id, (f = { level, list: this.emitters(id, level, faces, hM, topM) }));
    const art = this.art!;
    for (const e of f.list) {
      if (e.x < v.x - 80 || e.x > v.right + 80 || e.y < v.y - 40 || e.y > v.bottom + 160) continue;
      const fx = art.fx.get(e.id);
      if (!fx) continue;
      const frame = (Math.floor((now * fx.fps) / 1000) + e.ph * 5) % fx.frames;
      const im = this.img(fx.key, frame).setPosition(Math.round(e.x - fx.anchor.x), Math.round(e.y - fx.anchor.y)).setDepth(e.depth).setAlpha(e.alpha).setFlipX(!!e.flip);
      if (fx.blend === 'add') im.setBlendMode(Phaser.BlendModes.ADD);
    }
  }

  /** The emitters of a fire (fireNote): per face tile tongues, a foot sheet, a glow, embers, smoke. */
  private emitters(id: number, level: Level, faces: Face[], hM: number, topM: number | null): Emitter[] {
    const art = this.art!, hPx = hM * art.ppm, out: Emitter[] = [];
    let seed = Math.abs(id * 7919 + 13) % 2147483646 + 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const per = (q: string) => Math.max(0, ...['a', 'b', 'c'].map((c) => art.fx.get(`tongue-${q}-${c}`)?.density?.perTile[level] ?? 0));
    const at = (x: number, y: number, z: number, up: number) => { const p = this.pt(x, y, z); return { x: p.x, y: p.y - up }; };
    const alpha = (fx: string) => art.fx.get(fx)?.alpha?.[level] ?? 1;
    const em = art.fx.get('embers')?.density?.perTile[level] ?? 0;
    faces.forEach((fc, fi) => {
      const axis = fc.ay === fc.by ? 'x' : 'y', lerp = (u: number) => [fc.ax + (fc.bx - fc.ax) * u, fc.ay + (fc.by - fc.ay) * u];
      for (let t = 0; t < fc.tiles; t++) {
        for (const size of ['s', 'm', 'l']) for (let i = 0; i < per(size); i++) {
          const u = (t + rnd()) / fc.tiles, high = size === 'l' && level === 'high' && i === 0 && rnd() < 0.6;
          const z = high ? hPx * (0.85 + 0.1 * rnd()) : hPx * ZMAX[level] * rnd() ** 2;
          const [x, y] = lerp(u);
          out.push({ id: `tongue-${size}-${'abc'[Math.floor(rnd() * 3)]}`, ...at(x, y, fc.z, z), ph: Math.floor(rnd() * 60), alpha: 1, depth: fc.depth + 2 * IN });
        }
        // the foot sheet from the tile's face start (its lower x / y end), under the tongues
        if (level !== 'low') {
          const [ux, uy] = lerp(t / fc.tiles), [vx, vy] = lerp((t + 1) / fc.tiles);
          out.push({ id: `fire-sheet-${axis}-${level === 'high' ? 'l' : 'm'}`, ...at(Math.min(ux, vx), Math.min(uy, vy), fc.z, 0), ph: t * 3 + fi, alpha: 1, depth: fc.depth + IN });
        }
        const [mx, my] = lerp((t + 0.5) / fc.tiles), top = hPx * ZMAX[level] + 6;
        out.push({ id: 'heat-glow', ...at(mx, my + 0.2, fc.z, 0), ph: t * 5 + fi, alpha: alpha('heat-glow'), depth: 2.62 });
        if (em >= 1 || (em > 0 && t % Math.round(1 / em) === 0)) out.push({ id: 'embers', ...at(mx, my, fc.z, top), ph: t * 7 + fi, alpha: 1, depth: 10.87 });
        if (t % 2 === 0 && (level !== 'low' || t === 0)) {
          out.push({ id: `smoke-wisp-${'ab'[(t >> 1) % 2]}`, ...at(mx + rnd() * 0.4, my, fc.z, top + 4), ph: t * 9 + fi, alpha: alpha('smoke-wisp-a') * (0.8 + 0.2 * rnd()), depth: 10.88, flip: rnd() < 0.5 });
        }
      }
    });
    // at high, a few tongues on the platform / roof edge
    if (topM !== null && level === 'high' && faces[0]) {
      const fc = faces[0];
      for (let i = 0; i < 3; i++) {
        const u = 0.3 + 0.2 * i;
        out.push({ id: `tongue-m-${'abc'[i]}`, ...at(fc.ax + (fc.bx - fc.ax) * u, fc.ay + (fc.by - fc.ay) * u - 0.3, fc.z, topM * art.ppm + 2), ph: i * 13, alpha: 1, depth: fc.depth + 3 * IN });
      }
    }
    return out;
  }

  /** A fire gone out: smoulder fx (2 per face tile) and a faint wisp per 2 tiles, for SMOULDER_MS. */
  private smoulder(b: BuildingSnap, now: number): void {
    for (const fc of this.faces(b)) for (let t = 0; t < fc.tiles; t++) {
      const along = (u: number) => this.pt(fc.ax + (fc.bx - fc.ax) * u, fc.ay + (fc.by - fc.ay) * u, fc.z);
      for (let i = 0; i < 2; i++) {
        const p = along((t + 0.25 + 0.5 * i) / fc.tiles);
        this.fx('smoulder', p.x, p.y, fc.depth + 2 * IN, now, b.id * 31 + t * 5 + i * 3);
      }
      if (t % 2) {
        const p = along((t + 0.5) / fc.tiles);
        this.fx('smoke-wisp-b', p.x, p.y - 4, 10.88, now, b.id + t * 7, 1, 0.3);
      }
    }
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
