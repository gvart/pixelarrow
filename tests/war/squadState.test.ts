/**
 * The squad card's state line (src/war/view/hud/squadState.ts) and the field notices (src/war/view/hud/fieldNotes.ts):
 * plain words kept up while true, knocked-down men counted, a man back up and a raid beaten told once.
 */
import { describe, expect, it } from 'vitest';
import { squadState, squadStateHtml } from '../../src/war/view/hud/squadState';
import { raidsBeaten, riseNote, type RaidMemo } from '../../src/war/view/hud/fieldNotes';
import type { Snapshot, UnitSnap, WarlordSnap } from '../../src/war/types';

const man = (id: number, o: Partial<UnitSnap> = {}): UnitSnap => ({ id, squad: 0, x: 0, y: 0, facing: 0, hp: 10, maxHp: 10, cls: 'hoplite', state: 'idle', sat: 90, ...o });
const words = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('squad state line', () => {
  it('all well: nothing shown', () => {
    expect(squadStateHtml(squadState([man(0), man(1)], new Set([0]), 40)).html).toBe('');
  });

  it('in combat, in plain words (no tag jargon, no seconds)', () => {
    const st = squadStateHtml(squadState([man(0, { tag: 180 }), man(1)], new Set([0]), 40));
    expect(words(st.html)).toBe('In combat');
    expect(st.html).not.toMatch(/tag/i);
    expect(st.tone).toBe('bad');
  });

  it('a knocked-down man shows as down, rising soon; the dead do not', () => {
    const st = squadState([man(0), man(1, { state: 'dead', wounded: true, down: true }), man(2, { state: 'dead', wounded: true })], new Set([0]), 40);
    expect(st.down).toBe(1);
    expect(words(squadStateHtml(st).html)).toBe('1 down · rises soon');
  });

  it('food stays up while true: empty packs, starving men first', () => {
    expect(words(squadStateHtml(squadState([man(0), man(1)], new Set([0]), 0)).html)).toBe('No food');
    expect(words(squadStateHtml(squadState([man(0), man(1)], new Set([0]), 2)).html)).toBe('Food low');
    expect(words(squadStateHtml(squadState([man(0, { sat: 10 }), man(1)], new Set([0]), 0)).html)).toBe('Starving');
    expect(squadStateHtml(squadState([man(0)], new Set([0]), 0)).tone).toBe('bad');
  });

  it('every part carries an icon, not colour alone', () => {
    const html = squadStateHtml(squadState([man(0, { tag: 5, sat: 10 }), man(1, { state: 'dead', down: true })], new Set([0]), 0)).html;
    expect(html.match(/class="gl"/g)).toHaveLength(3);
  });
});

const lord = (o: Partial<WarlordSnap> = {}): WarlordSnap => ({ id: 'harpalos', name: 'Harpalos', title: '', band: '', kind: 'bandit', tint: 0, scale: 1, seat: true, lord: -1, holds: [], ...o });
const snapOf = (warlords: WarlordSnap[]): Snapshot => ({ tick: 0, units: [], squads: [], shots: [], buildings: [], warlords } as unknown as Snapshot);

describe('field notes', () => {
  it('a raid on him that ends with nothing felled is beaten, told once', () => {
    const memo: RaidMemo = new Map();
    expect(raidsBeaten(snapOf([lord({ raid: { x: 1, y: 1, team: 0, in: 300 } })]), 0, memo)).toEqual([]);
    expect(raidsBeaten(snapOf([lord({ raiding: true })]), 0, memo)).toEqual([]);
    expect(raidsBeaten(snapOf([lord()]), 0, memo)).toEqual(['harpalos']);
    expect(raidsBeaten(snapOf([lord()]), 0, memo)).toEqual([]);
  });

  it('not when it felled his building, nor a raid on another team', () => {
    const memo: RaidMemo = new Map();
    raidsBeaten(snapOf([lord({ raid: { x: 1, y: 1, team: 0, in: 300 } })]), 0, memo);
    raidsBeaten(snapOf([lord({ raiding: true })]), 0, memo, [{ t: 1, kind: 'raid', building: 3, team: 0, fell: true }]);
    expect(raidsBeaten(snapOf([lord()]), 0, memo)).toEqual([]);
    const other: RaidMemo = new Map();
    raidsBeaten(snapOf([lord({ raid: { x: 1, y: 1, team: 2, in: 300 } })]), 0, other);
    raidsBeaten(snapOf([lord({ raiding: true })]), 0, other);
    expect(raidsBeaten(snapOf([lord()]), 0, other)).toEqual([]);
  });

  it('a man of his back up is named; another side\'s is not told', () => {
    const cur = { tick: 0, units: [man(4)], squads: [{ id: 0, owner: 'you', team: 0, units: [4], order: 'hold' }], shots: [], buildings: [] } as unknown as Snapshot;
    const rows = [{ p: { hero: { name: 'Nikias' } }, where: 'field', unit: man(4), region: '' }] as never;
    expect(riseNote({ t: 1, kind: 'rise', unit: 4 }, cur, 0, rows)?.text).toBe('Nikias is back on his feet');
    expect(riseNote({ t: 1, kind: 'rise', unit: 4 }, cur, 1, rows)).toBeNull();
  });
});
