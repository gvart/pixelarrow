import { afterEach, describe, expect, it } from 'vitest';
import { tutorialLine } from '../src/ui/tutorial/keyLines';
import { TUT_STEPS } from '../src/game/tutorial';
import { setLang, t } from '../src/i18n';

const touch = { keyboard: false, fine: false };
const desk = { keyboard: true, fine: true };
// a rebound map: every action reads as its id in brackets, so the test sees which binding was named
const keyOf = (a: string) => `[${a}]`;

afterEach(() => setLang('en'));

describe('tutorial lines by device (input-v6.md §10)', () => {
  it('touch devices keep the v5 lines word for word', () => {
    for (const { id } of TUT_STEPS) {
      const key = `tut.step.${id}` as const;
      expect(tutorialLine(id, key, { play: 'Play' }, touch, keyOf)).toBe(t(key, { play: 'Play' }));
    }
  });

  it('a fine pointer says click, not tap', () => {
    expect(tutorialLine('select', 'tut.step.select', {}, { keyboard: false, fine: true }, keyOf)).toMatch(/^First, pick your men\. Click/);
    expect(tutorialLine('zoom', 'tut.step.zoom', {}, { keyboard: false, fine: true }, keyOf)).toMatch(/mouse wheel/);
    expect(tutorialLine('select', 'tut.step.select', {}, { keyboard: false, fine: true }, keyOf)).not.toMatch(/\[/);
  });

  it('a keyboard adds the current binding of the step’s hotkey', () => {
    expect(tutorialLine('select', 'tut.step.select', {}, desk, keyOf)).toMatch(/\[group\.1\]/);
    expect(tutorialLine('undo', 'tut.step.undo', { undo: 'Undo' }, desk, keyOf)).toMatch(/\[order\.undo\]/);
    expect(tutorialLine('fight', 'tut.step.fight', { fight: 'Fight' }, desk, keyOf)).toMatch(/\[deploy\.fight\]/);
    expect(tutorialLine('loose', 'tut.step.loose', { play: 'Play', shoot: 'Shoot' }, desk, keyOf)).toMatch(/\[order\.shoot\]/);
    expect(tutorialLine('play', 'tut.step.play', { play: 'Play' }, desk, keyOf)).toMatch(/\[time\.pause\]/);
    const then = tutorialLine('then', 'tut.step.then', { then: 'Then', charge: 'Charge' }, desk, keyOf);
    expect(then.indexOf('[order.then]')).toBeGreaterThan(-1);
    expect(then.indexOf('[order.charge]')).toBeGreaterThan(then.indexOf('[order.then]'));
    expect(tutorialLine('ability', 'tut.step.ability', { ability: 'Bash' }, desk, keyOf)).toMatch(/\[ability\.1\]/);
    expect(tutorialLine('pan', 'tut.step.pan', {}, desk, keyOf)).toMatch(/arrow keys/);
    expect(tutorialLine('zoom', 'tut.step.zoom', {}, desk, keyOf)).toMatch(/\[cam\.zoom\.in\].*\[cam\.zoom\.out\]/);
  });

  it('steps without a hotkey get no keyboard line', () => {
    for (const id of ['intro', 'sling', 'focus', 'move', 'morale', 'flank', 'win', 'victory'] as const)
      expect(tutorialLine(id, `tut.step.${id}`, {}, desk, keyOf)).not.toMatch(/\[/);
  });

  it('Russian has every variant, with the binding', () => {
    setLang('ru');
    expect(tutorialLine('select', 'tut.step.select', {}, desk, keyOf)).toMatch(/Щёлкните.*\[group\.1\]/);
    expect(tutorialLine('then', 'tut.step.then', { then: 'Затем', charge: 'Натиск' }, desk, keyOf)).toMatch(/\[order\.then\].*\[order\.charge\]/);
  });
});
