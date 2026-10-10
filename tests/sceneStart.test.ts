/**
 * Playtest bugs B1/B2 (docs/v5/audit/PLAY.md): Phaser's `Systems.start` only
 * replaces a scene's `settings.data` when data is passed, so
 * `scene.start('Battle')` re-ran the last battle's data: the tutorial after
 * the tutorial, the duel ladder fight after a duel, instead of the band.
 * Every scene start in the game must pass its data explicitly (`{}` for none).
 */
import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob<string>('../src/**/*.ts', { eager: true, query: '?raw', import: 'default' });

/** `scene.start(...)` calls whose argument list has no top-level comma (no data). */
function startsWithoutData(src: string): string[] {
  const out: string[] = [];
  const re = /scene\.start\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let comma = false;
    let i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (c === '(' || c === '{' || c === '[') depth++;
      else if (c === ')' || c === '}' || c === ']') depth--;
      else if (c === ',' && depth === 1) comma = true;
    }
    const line = src.slice(0, m.index).split('\n').length;
    const text = src.slice(m.index, i);
    // a mention in a comment is not a call
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const prefix = src.slice(lineStart, m.index);
    if (prefix.includes('//') || prefix.trimStart().startsWith('*')) continue;
    if (!comma) out.push(`${line}: ${text}`);
  }
  return out;
}

describe('scene starts always pass their data (B1, B2)', () => {
  it('finds the sources', () => expect(Object.keys(SOURCES).length).toBeGreaterThan(50));

  it('no scene.start(key) without a data object', () => {
    const bad: string[] = [];
    for (const [file, src] of Object.entries(SOURCES)) for (const call of startsWithoutData(src)) bad.push(`${file}:${call}`);
    expect(bad).toEqual([]);
  });

  it('the checker sees a call without data', () => {
    expect(startsWithoutData("this.scene.start('Battle');")).toHaveLength(1);
    expect(startsWithoutData("this.scene.start('Battle', {});")).toHaveLength(0);
    expect(startsWithoutData("this.scene.start(b?.scene ?? 'Menu', b?.data ?? {});")).toHaveLength(0);
  });
});
