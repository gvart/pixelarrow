/**
 * V6-INP-02: what each battle hotkey presses (input-v6.md §1.1, §3), the arrow
 * pan (§3.5) and the speed keys. Pure.
 */
import { describe, expect, it } from 'vitest';
import { KEY_PAN, KeyPan, battleKeyTarget, turned } from '../src/ui/input/battleKeys';
import { stepSpeed } from '../src/ui/input/pace';

const hud = (ids: string[], medallions: string[] = []) => ({ has: (id: string) => ids.includes(id), medallions, numerals: ['I', 'II', 'III', 'IV'] });

describe('battleKeyTarget', () => {
  it('order keys press the order bar keys, left to right', () => {
    const h = hud(['battle.cmd.advance', 'battle.cmd.charge', 'battle.cmd.hold', 'battle.cmd.loose', 'battle.cmd.fallback']);
    expect(battleKeyTarget('order.advance', h)).toEqual({ press: 'battle.cmd.advance' });
    expect(battleKeyTarget('order.charge', h)).toEqual({ press: 'battle.cmd.charge' });
    expect(battleKeyTarget('order.hold', h)).toEqual({ press: 'battle.cmd.hold' });
    expect(battleKeyTarget('order.shoot', h)).toEqual({ press: 'battle.cmd.loose' });
    expect(battleKeyTarget('order.fifth', h)).toEqual({ press: 'battle.cmd.fallback' });
    expect(battleKeyTarget('order.fifth', hud(['battle.cmd.feint']))).toEqual({ press: 'battle.cmd.feint' });
  });

  it('a control that is not shown says why', () => {
    expect(battleKeyTarget('order.charge', hud([]))).toEqual({ why: 'battle.why.noGroup' });
    expect(battleKeyTarget('order.then', hud([]))).toEqual({ why: 'input.why.then' });
    expect(battleKeyTarget('order.undo', hud([]))).toEqual({ why: 'undo.why.none' });
    expect(battleKeyTarget('time.pause', hud([]))).toEqual({ why: 'pace.locked' });
    expect(battleKeyTarget('group.4', hud(['battle.group.I']))).toEqual({ why: 'input.why.noGroup', n: 4 });
    expect(battleKeyTarget('group.9', hud(['battle.group.I']))).toEqual({ why: 'input.why.noGroup', n: 9 });
  });

  it('groups, abilities, the top bar and the deployment keys', () => {
    expect(battleKeyTarget('group.2', hud(['battle.group.II']))).toEqual({ press: 'battle.group.II' });
    const med = hud(['battle.more'], ['battle.cmd.horn', 'battle.cmd.rally']);
    expect(battleKeyTarget('ability.1', med)).toEqual({ press: 'battle.cmd.horn' });
    expect(battleKeyTarget('ability.2', med)).toEqual({ press: 'battle.cmd.rally' });
    expect(battleKeyTarget('ability.3', med)).toBeNull();
    expect(battleKeyTarget('ability.more', med)).toEqual({ press: 'battle.more' });
    expect(battleKeyTarget('time.pause', hud(['battle.play']))).toEqual({ press: 'battle.play' });
    expect(battleKeyTarget('menu.battle', hud(['battle.menu']))).toEqual({ press: 'battle.menu' });
    expect(battleKeyTarget('cam.follow', hud(['battle.follow']))).toEqual({ press: 'battle.follow' });
    expect(battleKeyTarget('deploy.fight', hud(['battle.ready']))).toEqual({ press: 'battle.ready' });
    expect(battleKeyTarget('deploy.shape', hud(['battle.cat.formation']))).toEqual({ press: 'battle.cat.formation' });
    expect(battleKeyTarget('deploy.groups', hud(['battle.groups']))).toEqual({ press: 'battle.groups' });
    expect(battleKeyTarget('deploy.works', hud(['battle.works']))).toEqual({ press: 'battle.works' });
  });
});

describe('turned: the 45° turn keys', () => {
  it('steps to the next of the eight knob directions either way, from the one nearest', () => {
    const r = turned({ x: 0, y: -1 }, 1);
    expect(r.x).toBeCloseTo(Math.SQRT1_2);
    expect(r.y).toBeCloseTo(-Math.SQRT1_2);
    const l = turned({ x: 0, y: -1 }, -1);
    expect(l.x).toBeCloseTo(-Math.SQRT1_2);
    expect(l.y).toBeCloseTo(-Math.SQRT1_2);
    // a free facing (20° off north, a drag that did not snap) turns from north
    expect(turned({ x: Math.sin(0.35), y: -Math.cos(0.35) }, 1)).toEqual(r);
    // eight turns come round
    let f = { x: 1, y: 0 };
    for (let i = 0; i < 8; i++) f = turned(f, -1);
    expect(f).toEqual({ x: 1, y: 0 });
  });
});

describe('KeyPan: the arrow pan', () => {
  it('a short tap pans one step, with no drift after', () => {
    const p = new KeyPan();
    p.press({ x: 1, y: 0 });
    const a = p.frame({ x: 1, y: 0 }, 16);
    const b = p.frame({ x: 0, y: 0 }, 16);
    expect(a.dx + b.dx).toBeCloseTo(KEY_PAN.tapPx);
    expect(p.frame({ x: 0, y: 0 }, 16)).toEqual({ dx: 0, dy: 0 });
  });

  it('a held key eases in, then runs at full speed whatever the frame rate', () => {
    const run = (dt: number) => {
      const p = new KeyPan();
      p.press({ x: 0, y: -1 });
      let y = 0;
      for (let t = 0; t < 1000; t += dt) y += p.frame({ x: 0, y: -1 }, dt).dy;
      return y;
    };
    const full = KEY_PAN.speed * (1 - KEY_PAN.easeMs / 2000);
    expect(run(10)).toBeCloseTo(-full, 0);
    expect(run(25)).toBeCloseTo(-full, 0);
  });

  it('a diagonal is as fast as a straight pan', () => {
    const p = new KeyPan();
    p.press({ x: 1, y: 0 });
    p.frame({ x: 1, y: 1 }, 500);
    const d = p.frame({ x: 1, y: 1 }, 100);
    expect(Math.hypot(d.dx, d.dy)).toBeCloseTo(KEY_PAN.speed / 10);
  });
});

describe('stepSpeed: [ and ]', () => {
  it('steps through this battle’s speeds and stops at either end', () => {
    expect(stepSpeed('offline', 1, 1)).toBe(2);
    expect(stepSpeed('offline', 1, -1)).toBe(0.5);
    expect(stepSpeed('offline', 3, 1)).toBeNull();
    expect(stepSpeed('offline', 0.5, -1)).toBeNull();
    expect(stepSpeed('ladder', 2, 1)).toBeNull();
    expect(stepSpeed('locked', 1, 1)).toBeNull();
  });
});
