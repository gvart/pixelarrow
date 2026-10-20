/**
 * The isometric layout of a camp (pure TS, no Phaser; drawn by
 * src/scenes/CampScene.ts with the art of src/art/campIso.ts): a window of
 * iso tiles with the ground kind of each, the camp clearing, and everything
 * standing in it, built from the offline field camp (src/world/camp.ts): a
 * map tile becomes 2 x 2 iso tiles, so the zone's noisy blob is the clearing,
 * the surrounding map terrain frames the scene (forest, rocks, a beach and the
 * sea), the heart tile holds the command pavilion and the structures sit where
 * the player placed them.
 *
 * The dressing: rows of soldiers' tents for the roster, the
 * market stall, the campfire, crates and amphorae, banners, dirt paths from
 * the pavilion to every building and out through the gate, trees on forest
 * tiles, rocks and the temple ruin, the beached ship on a coast.
 */
import { G, type GroundKind } from '../art/campIso';
import { hash2 } from '../art/pixels';
import { T, isWater, type WorldMap } from './map';
import { type CampState, type StructureId } from './camp';

/** What stands on the ground: the key names the sprite (see CampScene.spriteOf). */
export interface IsoThing {
  key: string;
  /** Tile origin and footprint. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Ground things (yards, stakes) sort under figures standing on them. */
  flat?: boolean;
  /** The player's structure this belongs to (tap target): its structure index. */
  sel?: string;
  /** Under construction: the site stage shown instead of the key (0 pegs, 1 frame, 2 half-built). */
  stage?: 0 | 1 | 2;
  /** Animated keys (banners, trees): frames and period in ms. */
  anim?: { frames: string[]; period: number };
}

export interface IsoSpots {
  fire?: { x: number; y: number };
  forge?: { x: number; y: number };
  yard?: { x: number; y: number };
  stall?: { x: number; y: number };
  gate?: { x: number; y: number };
  /** Soldier tents (doors). */
  tents: { x: number; y: number }[];
  /** Where the wounded rest (bell tents / barracks). */
  beds: { x: number; y: number }[];
  pavilion: { x: number; y: number };
  ship?: { x: number; y: number };
}

export interface IsoLayout {
  w: number;
  h: number;
  kinds: Uint8Array;
  clearing: Uint8Array;
  things: IsoThing[];
  spots: IsoSpots;
  /** Waypoints (tile centres) the men stroll between. */
  routes: [number, number][];
  coastal: boolean;
  /** Tiles the animals graze on. */
  pasture: [number, number][];
  /** Field: the iso tile of a map tile. */
  toIso: (mx: number, my: number) => { x: number; y: number };
  /** Field: the map tile under an iso tile. */
  toMap: (tx: number, ty: number) => { x: number; y: number };
}

/** The ground kinds of the field map's terrain. */
function kindOfTerrain(t: number): GroundKind {
  switch (t) {
    case T.deep:
      return G.deep;
    case T.sea:
      return G.sea;
    case T.beach:
      return G.sand;
    case T.forest:
      return G.forest;
    case T.hills:
    case T.mountain:
      return G.rock;
    default:
      return G.grass;
  }
}

/** Sprite keys of a field structure at its footprint (iso tiles). */
const FIELD_LOOK: Record<StructureId, { key: (i: number) => string; w: number; h: number }> = {
  tent: { key: (i) => `bell${i % 4}`, w: 2, h: 2 },
  fire: { key: () => 'firepit', w: 2, h: 2 },
  palisade: { key: () => 'gate0', w: 4, h: 2 },
  forge: { key: () => 'forge1', w: 4, h: 2 },
  training: { key: () => 'yard', w: 4, h: 4 },
};

class Builder {
  kinds: Uint8Array;
  clearing: Uint8Array;
  taken: Uint8Array;
  things: IsoThing[] = [];
  routes: [number, number][] = [];
  pasture: [number, number][] = [];
  spots: IsoSpots = { tents: [], beds: [], pavilion: { x: 0, y: 0 } };

  constructor(
    public w: number,
    public h: number,
    public seed: number,
  ) {
    this.kinds = new Uint8Array(w * h).fill(G.grass);
    this.clearing = new Uint8Array(w * h);
    this.taken = new Uint8Array(w * h);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  kind(x: number, y: number): number {
    return this.inside(x, y) ? this.kinds[y * this.w + x] : G.deep;
  }

  set(x: number, y: number, k: GroundKind): void {
    if (this.inside(x, y)) this.kinds[y * this.w + x] = k;
  }

  isClear(x: number, y: number): boolean {
    return this.inside(x, y) && !!this.clearing[y * this.w + x];
  }

  free(x: number, y: number, w = 1, h = 1, clear = true): boolean {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const tx = x + i;
        const ty = y + j;
        if (!this.inside(tx, ty) || this.taken[ty * this.w + tx]) return false;
        if (clear && !this.clearing[ty * this.w + tx]) return false;
      }
    return true;
  }

  take(x: number, y: number, w: number, h: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (this.inside(x + i, y + j)) this.taken[(y + j) * this.w + x + i] = 1;
  }

  add(t: IsoThing): IsoThing {
    this.things.push(t);
    this.take(t.x, t.y, t.w, t.h);
    return t;
  }

  /** A dirt path (L-shaped) between two tiles over clearing tiles that are free. */
  path(ax: number, ay: number, bx: number, by: number): void {
    const step = (x: number, y: number) => {
      if (this.isClear(x, y) && !this.taken[y * this.w + x]) this.set(x, y, G.dirt);
    };
    let x = ax;
    let y = ay;
    while (x !== bx) {
      step(x, y);
      x += Math.sign(bx - x);
    }
    while (y !== by) {
      step(x, y);
      y += Math.sign(by - y);
    }
    step(x, y);
  }

  /** The nearest free spot for a w x h footprint to (x, y) within the clearing. */
  spot(x: number, y: number, w: number, h: number, clear = true): { x: number; y: number } | null {
    let best: { x: number; y: number; d: number } | null = null;
    for (let ty = 0; ty < this.h; ty++)
      for (let tx = 0; tx < this.w; tx++) {
        if (!this.free(tx, ty, w, h, clear)) continue;
        const d = Math.hypot(tx - x, ty - y);
        if (!best || d < best.d) best = { x: tx, y: ty, d };
      }
    return best;
  }

  /** Trees on forest tiles, rocks on rock tiles, the ruin on the biggest rock cluster. */
  dress(): void {
    const r = (x: number, y: number, k: number) => hash2(x, y, this.seed + k);
    // the ruin: a 3 x 2 run of rock tiles with the most rock around
    let ruin: { x: number; y: number; n: number } | null = null;
    for (let y = 0; y < this.h - 1; y++)
      for (let x = 0; x < this.w - 2; x++) {
        let ok = true;
        let n = 0;
        for (let j = -1; j <= 2 && ok; j++)
          for (let i = -1; i <= 3; i++) {
            const k = this.kind(x + i, y + j);
            if (i >= 0 && i < 3 && j >= 0 && j < 2 && (k !== G.rock || this.taken[(y + j) * this.w + x + i])) ok = false;
            if (k === G.rock) n++;
          }
        if (ok && (!ruin || n > ruin.n)) ruin = { x, y, n };
      }
    if (ruin) this.add({ key: 'ruin', x: ruin.x, y: ruin.y, w: 3, h: 2 });
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.taken[y * this.w + x]) continue;
        const k = this.kinds[y * this.w + x];
        if (k === G.forest && r(x, y, 1) < 0.62) {
          const kind = r(x, y, 2) < 0.15 ? 2 : r(x, y, 2) < 0.4 ? 1 : 0;
          const seed = Math.floor(r(x, y, 3) * 6);
          this.add({ key: `tree${kind}_${seed}`, x, y, w: 1, h: 1, anim: { frames: [`tree${kind}_${seed}`, `tree${kind}_${seed}b`], period: 1400 + seed * 230 } });
        } else if (k === G.rock && r(x, y, 4) < 0.55) {
          const big = r(x, y, 5) < 0.35 && this.free(x, y, 2, 1, false) && this.kind(x + 1, y) === G.rock;
          this.add({ key: `rocks${big ? 0 : 1 + (Math.floor(r(x, y, 6) * 2) % 2)}_${Math.floor(r(x, y, 7) * 5)}`, x, y, w: big ? 2 : 1, h: 1 });
        } else if (k === G.grass && r(x, y, 8) < 0.07) {
          this.add({ key: `tree${r(x, y, 9) < 0.5 ? 1 : 0}_${Math.floor(r(x, y, 3) * 6)}`, x, y, w: 1, h: 1, anim: { frames: [`tree0_1`, `tree0_1b`], period: 1600 } });
          this.things[this.things.length - 1].anim = { frames: [this.things[this.things.length - 1].key, `${this.things[this.things.length - 1].key}b`], period: 1500 + x * 37 };
        } else if (k === G.grass && !this.clearing[y * this.w + x] && r(x, y, 10) < 0.3) this.pasture.push([x, y]);
      }
  }

  /** The beached ship on a sand run beside the sea (7 tiles along Y or X), the run nearest the clearing. */
  ship(): void {
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.clearing[y * this.w + x]) {
          cx += x;
          cy += y;
          n++;
        }
    cx = n ? cx / n : this.w / 2;
    cy = n ? cy / n : this.h / 2;
    let best: { x: number; y: number; alongY: boolean; d: number } | null = null;
    const consider = (x: number, y: number, alongY: boolean) => {
      const d = Math.hypot(x + (alongY ? 1 : 3.5) - cx, y + (alongY ? 3.5 : 1) - cy);
      if (!best || d < best.d) best = { x, y, alongY, d };
    };
    for (let x = 0; x < this.w; x++)
      for (let y = 0; y + 7 <= this.h; y++) {
        let ok = this.free(x, y, 2, 7, false);
        for (let j = 0; j < 7 && ok; j++) if (this.kind(x, y + j) !== G.sand || this.kind(x + 1, y + j) !== G.sand) ok = false;
        if (!ok) continue;
        let sea = false;
        for (let j = 0; j < 7; j++) if (this.kind(x + 2, y + j) === G.sea || this.kind(x - 1, y + j) === G.sea) sea = true;
        if (sea) consider(x, y, true);
      }
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x + 7 <= this.w; x++) {
        let ok = this.free(x, y, 7, 2, false);
        for (let i = 0; i < 7 && ok; i++) if (this.kind(x + i, y) !== G.sand || this.kind(x + i, y + 1) !== G.sand) ok = false;
        if (!ok) continue;
        let sea = false;
        for (let i = 0; i < 7; i++) if (this.kind(x + i, y + 2) === G.sea || this.kind(x + i, y - 1) === G.sea) sea = true;
        if (sea) consider(x, y, false);
      }
    if (!best) return;
    const b: { x: number; y: number; alongY: boolean } = best;
    if (b.alongY) {
      this.add({ key: 'shipY', x: b.x, y: b.y, w: 2, h: 7 });
      this.spots.ship = { x: b.x + 1, y: b.y + 3 };
    } else {
      this.add({ key: 'shipX', x: b.x, y: b.y, w: 7, h: 2 });
      this.spots.ship = { x: b.x + 3, y: b.y + 1 };
    }
  }

  /** The stakes around the clearing's edge, the gate where the main path leaves. */
  palisade(): void {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (!this.clearing[y * this.w + x]) continue;
        const g = this.spots.gate;
        // an edge faces out when the tile beyond is no clearing, no gate and no open shore
        const out = (ox: number, oy: number) => !this.isClear(ox, oy) && !(g && g.x === ox && g.y === oy) && this.kind(ox, oy) !== G.sand && this.kind(ox, oy) !== G.sea;
        // top-right (y - 1 outside) runs along X, top-left (x - 1) along Y, and the two front ones
        if (out(x, y - 1)) this.things.push({ key: 'stakesX', x, y: y, w: 1, h: 1, flat: true });
        if (out(x - 1, y)) this.things.push({ key: 'stakesY', x: x, y, w: 1, h: 1, flat: true });
        if (out(x, y + 1)) this.things.push({ key: 'stakesX', x, y: y + 1, w: 1, h: 1, flat: true });
        if (out(x + 1, y)) this.things.push({ key: 'stakesY', x: x + 1, y, w: 1, h: 1, flat: true });
      }
  }

  /** The dressing common to both camps: tents for the men, the fire, the stall, props, banners, paths. */
  camp(rosterTents: number, extras: { stall: boolean; fire: boolean; props: number; banners: number }): void {
    const p = this.spots.pavilion;
    // the main path: from the pavilion door out towards the front (+X +Y) to the clearing's edge
    let gx = p.x + 2;
    let gy = p.y + 2;
    while (this.isClear(gx + 1, gy + 1)) {
      gx++;
      gy++;
    }
    this.spots.gate = { x: gx + 1, y: gy };
    if (!this.spots.gate || !this.inside(gx + 1, gy)) this.spots.gate = undefined;
    this.path(p.x + 2, p.y + 2, gx, gy);
    if (extras.fire && !this.spots.fire) {
      const s = this.spot(p.x + 3, p.y - 1, 2, 2);
      if (s) {
        this.add({ key: 'firepit', x: s.x, y: s.y, w: 2, h: 2, flat: true });
        this.spots.fire = { x: s.x + 1, y: s.y + 1 };
      }
    }
    if (extras.stall) {
      const s = this.spot(p.x - 1, p.y + 3, 2, 1);
      if (s) {
        this.add({ key: 'stall', x: s.x, y: s.y, w: 2, h: 1 });
        this.spots.stall = { x: s.x + 1, y: s.y + 1.5 };
      }
    }
    // soldiers' tents in rows (ridge along X, side by side along Y), beside the pavilion
    let placed = 0;
    const anchors = [
      { x: p.x + 3, y: p.y + 3 },
      { x: p.x - 3, y: p.y + 3 },
      { x: p.x + 4, y: p.y - 3 },
      { x: p.x - 3, y: p.y - 3 },
    ];
    for (const a of anchors) {
      if (placed >= rosterTents) break;
      for (let col = 0; col < 2 && placed < rosterTents; col++) {
        const x = a.x + col * 2;
        for (let k = 0; k < 4 && placed < rosterTents; k++) {
          const y = a.y + k;
          if (!this.free(x, y)) continue;
          this.add({ key: `ridge${(x + y + placed) % 3}`, x, y, w: 1, h: 1 });
          this.spots.tents.push({ x: x + 1.3, y: y + 0.5 });
          placed++;
        }
      }
    }
    for (let i = 0; i < extras.props; i++) {
      const s = this.spot(p.x + (i % 2 ? 3 : -1), p.y + (i < 2 ? -1 : 3), 1, 1);
      if (s) this.add({ key: `props${(i * 2 + this.seed) % 5}`, x: s.x, y: s.y, w: 1, h: 1 });
    }
    for (let i = 0; i < extras.banners; i++) {
      const s = this.spot(p.x + (i ? -1 : 2), p.y + (i ? 2 : -1), 1, 1);
      if (s) this.add({ key: 'banner', x: s.x, y: s.y, w: 1, h: 1, anim: { frames: ['banner', 'banner1', 'banner2', 'banner1'], period: 230 } });
    }
    // paths from the pavilion door to every building, and the stroll routes
    for (const t of this.things) {
      if (t.flat || t.key.startsWith('ridge') || t.key.startsWith('props') || t.key === 'banner' || t.key.startsWith('tree') || t.key.startsWith('rocks') || t.key === 'ruin' || t.key.startsWith('ship')) continue;
      if (t.key === 'pavilion') continue;
      this.path(p.x + 2, p.y + 2, t.x + t.w, t.y + Math.floor(t.h / 2));
    }
    this.routes.push([p.x + 2.5, p.y + 2.5]);
    if (this.spots.fire) this.routes.push([this.spots.fire.x + 1.2, this.spots.fire.y + 1.2]);
    if (this.spots.stall) this.routes.push([this.spots.stall.x + 0.5, this.spots.stall.y + 0.6]);
    if (this.spots.gate) this.routes.push([this.spots.gate.x - 0.5, this.spots.gate.y + 0.5]);
    for (const t of this.spots.tents.slice(0, 4)) this.routes.push([t.x + 0.6, t.y]);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.routes.length > 14) break;
        if (this.kinds[y * this.w + x] === G.dirt && (x * 7 + y * 5) % 4 === 0) this.routes.push([x + 0.5, y + 0.5]);
      }
  }
}

/** The iso layout of the party's field camp (the map tile under the camp's heart is the pavilion). */
export function fieldLayout(m: WorldMap, c: CampState, rosterSize: number, placing?: { id: StructureId; x: number; y: number } | null): IsoLayout {
  let x0 = m.w;
  let y0 = m.h;
  let x1 = 0;
  let y1 = 0;
  for (const i of c.zone) {
    const x = i % m.w;
    const y = (i - x) / m.w;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const margin = 3;
  const mx0 = x0 - margin;
  const my0 = y0 - margin;
  const w = (x1 - x0 + 1 + margin * 2) * 2;
  const h = (y1 - y0 + 1 + margin * 2) * 2;
  const b = new Builder(w, h, (c.x * 31 + c.y * 17 + m.seed) & 0xffff);
  const toIso = (mx: number, my: number) => ({ x: (mx - mx0) * 2, y: (my - my0) * 2 });
  const toMap = (tx: number, ty: number) => ({ x: mx0 + Math.floor(tx / 2), y: my0 + Math.floor(ty / 2) });
  const zone = new Set(c.zone);
  for (let ty = 0; ty < h; ty++)
    for (let tx = 0; tx < w; tx++) {
      const mm = toMap(tx, ty);
      const inMap = mm.x >= 0 && mm.y >= 0 && mm.x < m.w && mm.y < m.h;
      const t = inMap ? m.terrain[mm.y * m.w + mm.x] : T.deep;
      const i = mm.y * m.w + mm.x;
      let k = kindOfTerrain(t);
      if (inMap && m.river[i] && !isWater(t)) k = G.sea;
      if (inMap && zone.has(i)) {
        k = G.mown;
        b.clearing[ty * w + tx] = 1;
      }
      b.set(tx, ty, k);
    }
  // the pavilion on the heart tile
  const hp = toIso(c.x, c.y);
  b.spots.pavilion = { x: hp.x, y: hp.y };
  b.add({ key: 'pavilion', x: hp.x, y: hp.y, w: 2, h: 2 });
  // the structures
  let tents = 0;
  c.built.forEach((s, i) => {
    const look = FIELD_LOOK[s.id];
    const at = toIso(s.x, s.y);
    const key = look.key(s.id === 'tent' ? tents++ : i);
    const thing = b.add({ key, x: at.x, y: at.y, w: look.w, h: look.h, sel: `${i}`, flat: s.id === 'training' || s.id === 'fire' });
    if (s.id === 'fire') b.spots.fire = { x: at.x + 1, y: at.y + 1 };
    if (s.id === 'forge') {
      b.spots.forge = { x: at.x, y: at.y };
      // the forge is 2 x 2: the rest of its plot holds the woodpile and barrels
      b.add({ key: 'props4', x: at.x + 2, y: at.y, w: 1, h: 1 });
      b.add({ key: 'props3', x: at.x + 3, y: at.y + 1, w: 1, h: 1 });
      thing.w = 2;
      thing.h = 2;
    }
    if (s.id === 'tent') b.spots.beds.push({ x: at.x + 1.4, y: at.y + 1.6 });
    if (s.id === 'training') {
      b.spots.yard = { x: at.x, y: at.y };
      for (let j = 0; j < look.h; j++) for (let k = 0; k < look.w; k++) b.set(at.x + k, at.y + j, G.dirt);
      b.add({ key: 'dummy0', x: at.x + 3, y: at.y, w: 1, h: 1 });
      b.add({ key: 'dummy1', x: at.x + 3, y: at.y + 2, w: 1, h: 1 });
      b.add({ key: 'target', x: at.x, y: at.y + 3, w: 1, h: 1 });
      b.add({ key: 'rack', x: at.x, y: at.y, w: 1, h: 1 });
      b.add({ key: 'banner', x: at.x + 3, y: at.y + 3, w: 1, h: 1, anim: { frames: ['banner', 'banner1', 'banner2', 'banner1'], period: 230 } });
    }
    if (s.id === 'palisade') {
      // the gate sits on the plot; the stakes ring the clearing (drawn after the paths)
      thing.key = 'gate0';
      thing.w = 2;
      thing.h = 1;
      b.add({ key: 'stakesX', x: at.x + 2, y: at.y, w: 2, h: 1, flat: true });
      b.add({ key: 'props0', x: at.x + 1, y: at.y + 1, w: 1, h: 1 });
    }
  });
  if (placing) {
    const look = FIELD_LOOK[placing.id];
    const at = toIso(placing.x, placing.y);
    b.things.push({ key: `ghost:${look.key(0)}`, x: at.x, y: at.y, w: look.w, h: look.h });
  }
  b.camp(Math.min(8, Math.ceil(rosterSize / 2)), { stall: c.built.length >= 2, fire: false, props: 2 + Math.min(2, c.built.length), banners: 1 });
  b.dress();
  b.ship();
  if (c.built.some((s) => s.id === 'palisade')) b.palisade();
  const coastal = !!b.spots.ship;
  return { w, h, kinds: b.kinds, clearing: b.clearing, things: b.things, spots: b.spots, routes: b.routes, coastal, pasture: b.pasture, toIso, toMap };
}
