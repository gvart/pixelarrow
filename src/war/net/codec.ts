/**
 * Binary snapshot frames for the live region (./protocol.ts). The server keeps one DeltaEncoder per client: it remembers
 * what that client was last sent (quantised) and writes only what changed since, the client's DeltaDecoder applies the
 * frame to its copy and hands out a plain Snapshot, so the sandbox renderer is unchanged. WebSockets are ordered and
 * reliable, so a delta never goes missing; a keyframe (every KEYFRAME_EVERY ticks, and the first) resends everything the
 * client sees and resets both sides.
 *
 * Frame (little-endian; v = LEB128 varint, z = zigzag varint, s = u8 length + ASCII):
 *   u8 kind (1 delta, 2 key) | u8 NET_VERSION | u32 tick
 *   v n, n x unit:     v id | u8 mask | fields in mask order (below)
 *   v n, n x removed:  v id (units the client no longer sees)
 *   v n, n x squad:    v id | u8 team | s order | u8 fire (bit0 has, bit1 on, bit2 available, bits 3.. reason) | s owner
 *                      | s active skill ('' none) [| v ready tick | v buff end tick + 1 (absolute; the decoder counts down)]
 *   v n, n x shot:     u16 x0 y0 x1 y1 | v tick - t0 | u8 t1 - t0 | u8 z0 | u8 z1 | u8 kind | fire<<2 | siege<<3 | z by [| v siege]
 *   v n, n bytes:      JSON { u: BuildingSnap[], r: id[] } of changed / gone buildings (n = 0: none)
 * Unit fields: POS u16 x*QUANT, u16 y*QUANT | FACE u8 (turns * 256) | HP u16 hp*10 | STATE u8 (state | 8 wounded set | 16 wounded)
 *   | Z u8 | ANIM u8 swing, u8 ready (255 none) | META v squad, u16 maxHp*10, s cls, s person id ('' none), u8 level
 *   | EXTRA v on+1, u8 task, u8 carry, u8 load, v combat tag end tick (absolute; 0 none, the decoder counts down)
 */
import type { BuildingSnap, ResourceKind, ShotSnap, Snapshot, SquadSnap, UnitSnap, WarSkillId } from '../types';
import { NET_VERSION, QUANT } from './protocol';

const POS = 1, FACE = 2, HP = 4, STATE = 8, Z = 16, ANIM = 32, META = 64, EXTRA = 128;
const STATES: UnitSnap['state'][] = ['idle', 'move', 'attack', 'dead', 'gather', 'build'];
const TASKS: (UnitSnap['task'] | undefined)[] = [undefined, 'ignite', 'extinguish', 'push', 'crew'];
const CARRY: (ResourceKind | undefined)[] = [undefined, 'food', 'wood', 'stone', 'marble', 'copper', 'tin', 'iron', 'bronze', 'silver', 'salt', 'pitch'];
const MISSILES: ShotSnap['kind'][] = ['arrow', 'stone', 'javelin'];
const REASONS = [undefined, 'noBrazier', 'noPitch'] as const;
const TAU = Math.PI * 2;

// quantised unit record: indices into Q
const QX = 0, QY = 1, QF = 2, QH = 3, QS = 4, QZ = 5, QSW = 6, QRD = 7, QON = 8, QTK = 9, QCA = 10, QLD = 11, QTG = 12;
type Q = number[];

const clampU16 = (v: number) => (v < 0 ? 0 : v > 65535 ? 65535 : v);
const u8 = (v: number | undefined) => (v === undefined ? 255 : v < 0 ? 0 : v > 254 ? 254 : Math.round(v));

function quantise(u: UnitSnap, tick: number): Q {
  const w = u.wounded === undefined ? 0 : u.wounded ? 24 : 8;
  return [
    clampU16(Math.round(u.x * QUANT)), clampU16(Math.round(u.y * QUANT)),
    Math.round(((((u.facing % TAU) + TAU) % TAU) / TAU) * 256) & 255,
    clampU16(Math.round(u.hp * 10)), Math.max(0, STATES.indexOf(u.state)) | w, u8(u.z ?? 0),
    u8(u.swing), u8(u.ready), u.on === undefined ? 0 : u.on + 1, Math.max(0, TASKS.indexOf(u.task)), Math.max(0, CARRY.indexOf(u.carry)), u8(u.load ?? 0),
    u.tag ? tick + u.tag : 0,
  ];
}

/** A growable byte writer. */
class Writer {
  buf = new Uint8Array(1024);
  view = new DataView(this.buf.buffer);
  n = 0;
  private room(k: number): void {
    if (this.n + k <= this.buf.length) return;
    let len = this.buf.length * 2;
    while (len < this.n + k) len *= 2;
    const b = new Uint8Array(len);
    b.set(this.buf.subarray(0, this.n));
    this.buf = b;
    this.view = new DataView(b.buffer);
  }
  u8(v: number): void { this.room(1); this.buf[this.n++] = v; }
  u16(v: number): void { this.room(2); this.view.setUint16(this.n, v, true); this.n += 2; }
  u32(v: number): void { this.room(4); this.view.setUint32(this.n, v >>> 0, true); this.n += 4; }
  v(v: number): void {
    this.room(5);
    let x = v >>> 0;
    while (x >= 0x80) { this.buf[this.n++] = (x & 0x7f) | 0x80; x >>>= 7; }
    this.buf[this.n++] = x;
  }
  z(v: number): void { this.v(v >= 0 ? v * 2 : -v * 2 - 1); }
  s(t: string): void {
    const len = Math.min(255, t.length);
    this.room(len + 1);
    this.buf[this.n++] = len;
    for (let i = 0; i < len; i++) this.buf[this.n++] = t.charCodeAt(i) & 0x7f;
  }
  bytes(b: Uint8Array): void { this.v(b.length); this.room(b.length); this.buf.set(b, this.n); this.n += b.length; }
  done(): Uint8Array { return this.buf.slice(0, this.n); }
}

class Reader {
  view: DataView;
  n = 0;
  constructor(private buf: Uint8Array) { this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); }
  u8(): number { return this.buf[this.n++]; }
  u16(): number { const v = this.view.getUint16(this.n, true); this.n += 2; return v; }
  u32(): number { const v = this.view.getUint32(this.n, true); this.n += 4; return v; }
  v(): number {
    let x = 0, sh = 0, b: number;
    do { b = this.buf[this.n++]; x += (b & 0x7f) * 2 ** sh; sh += 7; } while (b & 0x80);
    return x;
  }
  z(): number { const v = this.v(); return v % 2 ? -(v + 1) / 2 : v / 2; }
  s(): string {
    const len = this.buf[this.n++];
    let t = '';
    for (let i = 0; i < len; i++) t += String.fromCharCode(this.buf[this.n++]);
    return t;
  }
  bytes(): Uint8Array { const len = this.v(); const b = this.buf.subarray(this.n, this.n + len); this.n += len; return b; }
}

/** What one client sees this tick (already filtered, ./interest.ts). `shots`: the ones to send (new ones; all on a keyframe). */
export interface FrameInput { tick: number; units: UnitSnap[]; squads: SquadSnap[]; shots: ShotSnap[]; buildings: BuildingSnap[] }

/** Squad active as absolute ticks (ready at, buff over at): changes only when it fires. */
const activeAbs = (s: SquadSnap, tick: number) => (s.active ? [s.active.skill, s.active.ready ? tick + s.active.ready : 0, s.active.on ? tick + s.active.on : 0] as const : null);
const squadKey = (s: SquadSnap, tick: number) => `${s.team}|${s.order}|${s.owner}|${s.fireArrows ? `${s.fireArrows.on}${s.fireArrows.available}${s.fireArrows.reason}` : ''}|${activeAbs(s, tick)}`;
const enc = new TextEncoder();
const dec = new TextDecoder();

/** Server side, one per client: frames against what that client was last sent. */
export class DeltaEncoder {
  private units = new Map<number, { q: Q; meta: string }>();
  private squads = new Map<number, string>();
  private buildings = new Map<number, string>();
  private seen = new Set<number>();

  /** key: a keyframe (full resend, the client starts over). */
  encode(f: FrameInput, key: boolean): Uint8Array {
    if (key) { this.units.clear(); this.squads.clear(); this.buildings.clear(); }
    const w = new Writer();
    w.u8(key ? 2 : 1);
    w.u8(NET_VERSION);
    w.u32(f.tick);
    // units
    const countAt = w.n;
    w.u32(0); // placeholder, patched to a fixed 4-byte varint below
    let count = 0;
    const seen = this.seen;
    seen.clear();
    for (const u of f.units) {
      seen.add(u.id);
      const q = quantise(u, f.tick), meta = `${u.squad}|${u.maxHp}|${u.cls}|${u.pid ?? ''}|${u.level ?? 0}`;
      const was = this.units.get(u.id);
      let m = 0;
      if (!was || was.meta !== meta) m |= META | POS | FACE | HP | STATE | Z | ANIM | EXTRA;
      else {
        const p = was.q;
        if (p[QX] !== q[QX] || p[QY] !== q[QY]) m |= POS;
        if (p[QF] !== q[QF]) m |= FACE;
        if (p[QH] !== q[QH]) m |= HP;
        if (p[QS] !== q[QS]) m |= STATE;
        if (p[QZ] !== q[QZ]) m |= Z;
        if (p[QSW] !== q[QSW] || p[QRD] !== q[QRD]) m |= ANIM;
        if (p[QON] !== q[QON] || p[QTK] !== q[QTK] || p[QCA] !== q[QCA] || p[QLD] !== q[QLD] || p[QTG] !== q[QTG]) m |= EXTRA;
      }
      if (!m) continue;
      this.units.set(u.id, { q, meta });
      count++;
      w.v(u.id);
      w.u8(m);
      if (m & POS) { w.u16(q[QX]); w.u16(q[QY]); }
      if (m & FACE) w.u8(q[QF]);
      if (m & HP) w.u16(q[QH]);
      if (m & STATE) w.u8(q[QS]);
      if (m & Z) w.u8(q[QZ]);
      if (m & ANIM) { w.u8(q[QSW]); w.u8(q[QRD]); }
      if (m & META) { w.v(u.squad); w.u16(clampU16(Math.round(u.maxHp * 10))); w.s(u.cls); w.s(u.pid ?? ''); w.u8(u.level ?? 0); }
      if (m & EXTRA) { w.v(q[QON]); w.u8(q[QTK]); w.u8(q[QCA]); w.u8(q[QLD]); w.v(q[QTG]); }
    }
    // a 4-byte varint (padded with continuation bits) so the count can be patched in place
    w.buf[countAt] = (count & 0x7f) | 0x80;
    w.buf[countAt + 1] = ((count >>> 7) & 0x7f) | 0x80;
    w.buf[countAt + 2] = ((count >>> 14) & 0x7f) | 0x80;
    w.buf[countAt + 3] = (count >>> 21) & 0x7f;
    // removed
    const gone: number[] = [];
    if (!key) for (const id of this.units.keys()) if (!seen.has(id)) gone.push(id);
    w.v(gone.length);
    for (const id of gone) { this.units.delete(id); w.v(id); }
    // squads
    const sq = f.squads.filter((s) => this.squads.get(s.id) !== squadKey(s, f.tick));
    w.v(sq.length);
    for (const s of sq) {
      this.squads.set(s.id, squadKey(s, f.tick));
      w.v(s.id);
      w.u8(s.team & 255);
      w.s(s.order);
      const fa = s.fireArrows;
      w.u8(fa ? 1 | (fa.on ? 2 : 0) | (fa.available ? 4 : 0) | (Math.max(0, REASONS.indexOf(fa.reason)) << 3) : 0);
      w.s(s.owner);
      const a = activeAbs(s, f.tick);
      w.s(a?.[0] ?? '');
      if (a) { w.v(a[1]); w.v(a[2]); }
    }
    // shots
    w.v(f.shots.length);
    for (const s of f.shots) {
      w.u16(clampU16(Math.round(s.x0 * QUANT))); w.u16(clampU16(Math.round(s.y0 * QUANT)));
      w.u16(clampU16(Math.round(s.x1 * QUANT))); w.u16(clampU16(Math.round(s.y1 * QUANT)));
      w.v(Math.max(0, f.tick - s.t0));
      w.u8(u8(s.t1 - s.t0));
      w.u8(u8(s.z0)); w.u8(u8(s.z1));
      w.u8(Math.max(0, MISSILES.indexOf(s.kind)) | (s.fire ? 4 : 0) | (s.siege !== undefined ? 8 : 0));
      w.z(s.by);
      if (s.siege !== undefined) w.v(s.siege);
    }
    // buildings: whole records, changed ones only (few, and they change rarely)
    const bu: BuildingSnap[] = [], br: number[] = [], bseen = new Set<number>();
    for (const b of f.buildings) {
      bseen.add(b.id);
      const k = JSON.stringify(b);
      if (this.buildings.get(b.id) !== k) { this.buildings.set(b.id, k); bu.push(b); }
    }
    if (!key) for (const id of this.buildings.keys()) if (!bseen.has(id)) br.push(id);
    for (const id of br) this.buildings.delete(id);
    if (bu.length || br.length) w.bytes(enc.encode(JSON.stringify({ u: bu, r: br })));
    else w.v(0);
    return w.done();
  }
}

/** Client side: applies frames, keeps the visible world, hands out Snapshots. */
export class DeltaDecoder {
  units = new Map<number, UnitSnap>();
  squads = new Map<number, Omit<SquadSnap, 'units'>>();
  /** Squad actives as absolute ticks [skill, ready at, buff over at]. */
  actives = new Map<number, [WarSkillId, number, number]>();
  shots: ShotSnap[] = [];
  buildings = new Map<number, BuildingSnap>();
  /** Combat tag end ticks by unit (absolute; snapshot() counts down). */
  tags = new Map<number, number>();
  tick = 0;

  apply(data: ArrayBuffer | Uint8Array): Snapshot {
    const r = new Reader(data instanceof Uint8Array ? data : new Uint8Array(data));
    const kind = r.u8(), v = r.u8();
    if (v !== NET_VERSION) throw new Error(`net version ${v}, expected ${NET_VERSION}`);
    const tick = r.u32();
    if (kind === 2) { this.units.clear(); this.squads.clear(); this.actives.clear(); this.shots = []; this.buildings.clear(); this.tags.clear(); }
    this.tick = tick;
    for (let n = r.v(); n > 0; n--) {
      const id = r.v(), m = r.u8();
      const u: UnitSnap = this.units.get(id) ?? { id, squad: 0, x: 0, y: 0, facing: 0, hp: 0, maxHp: 0, cls: '', state: 'idle' };
      if (m & POS) { u.x = r.u16() / QUANT; u.y = r.u16() / QUANT; }
      if (m & FACE) { const f = r.u8() / 256 * TAU; u.facing = f > Math.PI ? f - TAU : f; }
      if (m & HP) u.hp = r.u16() / 10;
      if (m & STATE) {
        const s = r.u8();
        u.state = STATES[s & 7] ?? 'idle';
        if (s & 8) u.wounded = !!(s & 16); else delete u.wounded;
      }
      if (m & Z) u.z = r.u8();
      if (m & ANIM) {
        const sw = r.u8(), rd = r.u8();
        if (sw === 255) delete u.swing; else u.swing = sw;
        if (rd === 255) delete u.ready; else u.ready = rd;
      }
      if (m & META) {
        u.squad = r.v(); u.maxHp = r.u16() / 10; u.cls = r.s();
        const pid = r.s(), level = r.u8();
        if (pid) { u.pid = pid; u.level = level; } else { delete u.pid; delete u.level; }
      }
      if (m & EXTRA) {
        const on = r.v(), task = TASKS[r.u8()], carry = CARRY[r.u8()], load = r.u8();
        if (on) u.on = on - 1; else delete u.on;
        if (task) u.task = task; else delete u.task;
        if (carry) { u.carry = carry; u.load = load; } else { delete u.carry; delete u.load; }
        const tag = r.v();
        if (tag) this.tags.set(id, tag); else this.tags.delete(id);
      }
      this.units.set(id, u);
    }
    for (let n = r.v(); n > 0; n--) { const id = r.v(); this.units.delete(id); this.tags.delete(id); }
    for (let n = r.v(); n > 0; n--) {
      const id = r.v(), team = r.u8(), order = r.s() as SquadSnap['order'], fa = r.u8(), owner = r.s();
      const s: Omit<SquadSnap, 'units'> = { id, owner, team, order };
      if (fa & 1) s.fireArrows = { on: !!(fa & 2), available: !!(fa & 4), ...(REASONS[fa >> 3] ? { reason: REASONS[fa >> 3] } : {}) };
      const skill = r.s() as WarSkillId | '';
      if (skill) this.actives.set(id, [skill, r.v(), r.v()]);
      else this.actives.delete(id);
      this.squads.set(id, s);
    }
    this.shots = this.shots.filter((s) => s.t1 >= tick);
    for (let n = r.v(); n > 0; n--) {
      const x0 = r.u16() / QUANT, y0 = r.u16() / QUANT, x1 = r.u16() / QUANT, y1 = r.u16() / QUANT;
      const t0 = tick - r.v(), t1 = t0 + r.u8(), z0 = r.u8(), z1 = r.u8(), k = r.u8(), by = r.z();
      const s: ShotSnap = { x0, y0, x1, y1, t0, t1, z0, z1, by, kind: MISSILES[k & 3] ?? 'arrow' };
      if (k & 4) s.fire = true;
      if (k & 8) s.siege = r.v();
      this.shots.push(s);
    }
    const b = r.bytes();
    if (b.length) {
      const j = JSON.parse(dec.decode(b)) as { u: BuildingSnap[]; r: number[] };
      for (const x of j.u) this.buildings.set(x.id, x);
      for (const id of j.r) this.buildings.delete(id);
    }
    return this.snapshot();
  }

  snapshot(): Snapshot {
    const units = [...this.units.values()].sort((a, b) => a.id - b.id).map((u) => {
      const end = this.tags.get(u.id), c = { ...u };
      if (end !== undefined && end > this.tick) c.tag = end - this.tick; else delete c.tag;
      return c;
    });
    const lists = new Map<number, number[]>();
    for (const u of units) {
      let l = lists.get(u.squad);
      if (!l) lists.set(u.squad, (l = []));
      l.push(u.id);
    }
    const squads = [...this.squads.values()].sort((a, b) => a.id - b.id).map((s) => {
      const a = this.actives.get(s.id);
      const active = a ? { active: { skill: a[0], ready: Math.max(0, a[1] - this.tick), on: Math.max(0, a[2] - this.tick) } } : {};
      return { ...s, ...active, units: lists.get(s.id) ?? [] };
    });
    return { tick: this.tick, units, squads, shots: this.shots.map((s) => ({ ...s })), buildings: [...this.buildings.values()] };
  }
}
