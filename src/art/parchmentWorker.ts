/**
 * Bakes parchment map chunks off the main thread (src/art/parchmentMap.ts),
 * so panning into new country never stalls a frame. Messages:
 * - { type: 'map', id }               the season map to paint
 * - { type: 'state', fog, owner }     fog cells and owner colours ([id, rgb][])
 * - { type: 'bake', key, sig, s, gx, gy, w, h }  -> { key, sig, w, h, data }
 */
import { getMap } from '../online/world';
import { MapFields, bakeChunk, type MapState } from './parchmentMap';

let fields: MapFields | null = null;
let state: MapState | null = null;

const port = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage(m: unknown, transfer: Transferable[]): void };

port.onmessage = (e: MessageEvent) => {
  const m = e.data as
    | { type: 'map'; id: string }
    | { type: 'state'; fog: Uint8Array; owner: [number, number][] }
    | { type: 'bake'; key: string; sig: number; s: number; gx: number; gy: number; w: number; h: number };
  if (m.type === 'map') fields = new MapFields(getMap(m.id));
  else if (m.type === 'state') state = { fog: m.fog, owner: new Map(m.owner) };
  else if (m.type === 'bake' && fields && state) {
    const p = bakeChunk(fields, state, m.s, m.gx, m.gy, m.w, m.h);
    port.postMessage({ key: m.key, sig: m.sig, w: p.w, h: p.h, data: p.data.buffer }, [p.data.buffer]);
  }
};
