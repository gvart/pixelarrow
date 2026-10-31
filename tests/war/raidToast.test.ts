/**
 * A raid's warning toast (src/war/view/secretNotice.ts, src/war/view/hud/roster/toast.ts) lives until its countdown
 * ends or the raid is over (src/war/view/hud/fieldNotes.ts `raidsOver`): beaten, lost or called off. A "Raid beaten"
 * never sits under a warning still counting down.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { raidsOver } from '../../src/war/view/hud/fieldNotes';
import { toaster } from '../../src/war/view/hud/roster/toast';
import { raidKey } from '../../src/war/view/secretNotice';
import type { Snapshot, WarlordSnap } from '../../src/war/types';

// the timer chip's card styles need a real page; its text is all this test reads
vi.mock('../../src/war/view/hud/qcard', () => ({ chip: { time: (text: string) => `<span class="rr-left">${text}</span>` } }));

const lord = (o: Partial<WarlordSnap> = {}): WarlordSnap => ({ id: 'harpalos', name: 'Harpalos', title: '', band: '', kind: 'bandit', tint: 0, scale: 1, seat: true, lord: -1, holds: [], ...o });
const snapOf = (warlords: WarlordSnap[]): Snapshot => ({ tick: 0, units: [], squads: [], shots: [], buildings: [], warlords } as unknown as Snapshot);
const warn = (team = 0) => lord({ raid: { x: 1, y: 1, team, in: 300 } });

describe('raid over', () => {
  it('beaten or lost: warned, out, then neither', () => {
    const warned = new Set<string>();
    expect(raidsOver(snapOf([warn()]), 0, warned)).toEqual([]);
    expect(raidsOver(snapOf([lord({ raiding: true })]), 0, warned)).toEqual([]);
    expect(raidsOver(snapOf([lord()]), 0, warned)).toEqual(['harpalos']);
    expect(raidsOver(snapOf([lord()]), 0, warned)).toEqual([]);
  });

  it('called off: the warning goes without a raid; his fall or leaving ends it too', () => {
    const warned = new Set<string>();
    raidsOver(snapOf([warn()]), 0, warned);
    expect(raidsOver(snapOf([lord()]), 0, warned)).toEqual(['harpalos']);
    raidsOver(snapOf([warn()]), 0, warned);
    expect(raidsOver(snapOf([lord({ raiding: true, fallen: true })]), 0, warned)).toEqual(['harpalos']);
    raidsOver(snapOf([warn()]), 0, warned);
    expect(raidsOver(snapOf([]), 0, warned)).toEqual(['harpalos']);
  });

  it('a raid on another team is not mine to end', () => {
    const warned = new Set<string>();
    raidsOver(snapOf([warn(2)]), 0, warned);
    expect(raidsOver(snapOf([lord()]), 0, warned)).toEqual([]);
  });
});

/** Just enough DOM for the toaster: elements that sit in a box and leave it. */
class El {
  className = ''; innerHTML = ''; style: Record<string, string> = {}; onclick: unknown = null; textContent = '';
  parent: El | null = null; children: El[] = [];
  get firstElementChild() { return this.children[0] ?? null; }
  appendChild(c: El) { c.parent = this; this.children.push(c); return c; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  querySelector() { return new El(); }
}

describe('raid warning toast lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { createElement: () => new El() });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const warning = () => ({ kind: 'info' as const, text: "Harpalos's men ride for your farm", for: 30_000, act: { label: 'Go there', run: () => {} }, key: raidKey('harpalos') });

  it('ends when its raid is over, well before the countdown', () => {
    const box = new El(), tell = toaster(box as unknown as HTMLElement, () => {});
    tell(warning());
    vi.advanceTimersByTime(5_000);
    expect(box.children).toHaveLength(1);
    tell.drop(raidKey('harpalos'));
    tell({ kind: 'info', text: 'Raid beaten' });
    vi.advanceTimersByTime(500);
    expect(box.children.map((c) => c.innerHTML.includes('Raid beaten'))).toEqual([true]);
  });

  it('a new warning for the same raid replaces the old; others are untouched', () => {
    const box = new El(), tell = toaster(box as unknown as HTMLElement, () => {});
    tell(warning());
    tell({ kind: 'info', text: 'Nikias is back on his feet' });
    tell(warning());
    vi.advanceTimersByTime(500);
    expect(box.children).toHaveLength(2);
    tell.drop('raid:someone-else');
    vi.advanceTimersByTime(500);
    expect(box.children).toHaveLength(2);
  });

  it('left alone it stays for its countdown, then goes', () => {
    const box = new El(), tell = toaster(box as unknown as HTMLElement, () => {});
    tell(warning());
    vi.advanceTimersByTime(29_000);
    expect(box.children).toHaveLength(1);
    vi.advanceTimersByTime(1_500);
    expect(box.children).toHaveLength(0);
    tell.drop(raidKey('harpalos')); // already gone: nothing to do
  });
});
