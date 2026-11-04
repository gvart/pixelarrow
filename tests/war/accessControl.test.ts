import { describe, expect, it } from 'vitest';
import { ACCESS, TERMS } from '../../src/war/sim/economy';
import type { Access, BuildingSnap } from '../../src/war/types';
import { accessHtml, accessStep, accessTap, ACCESS_WORDS, FEE_STEPS, ownsTerms, SHARE_STEPS } from '../../src/war/view/build/access';

const forge = (over: Partial<BuildingSnap> = {}) => ({ id: 'b1', type: 'forge', owner: 'p:me', state: 'done', access: 'alliance', share: 0, fee: 0, ...over }) as BuildingSnap;

describe('W-220 anyone asks first', () => {
  it('a tap towards anyone sends nothing until he says yes; every other step goes at once', () => {
    const before = ACCESS[ACCESS.indexOf('anyone') - 1];
    expect(accessTap(forge({ access: before }), 'access', 'p:me', false)).toEqual({ ask: true });
    expect(accessTap(forge({ access: before }), 'access', 'p:me', true)).toMatchObject({ order: { access: 'anyone' } });
    for (const a of ACCESS.filter((x) => x !== before)) expect(accessTap(forge({ access: a }), 'access', 'p:me', false)).toHaveProperty('order');
    expect(accessTap(forge({ access: before }), 'fee', 'p:me', false)).toHaveProperty('order');
    expect(accessHtml(forge({ access: before }), true)).toContain('Open to anyone');
  });
});

describe('the building card access control (W-89)', () => {
  it('one tap moves each setting to its next step and wraps round', () => {
    let access: Access = ACCESS[0];
    for (let i = 0; i < ACCESS.length; i++) {
      const o = accessStep(forge({ access }), 'access', 'p:me');
      expect(o.access).toBe(ACCESS[(i + 1) % ACCESS.length]);
      access = o.access!;
    }
    expect(accessStep(forge({ share: SHARE_STEPS[SHARE_STEPS.length - 1] }), 'share', 'p:me').share).toBe(SHARE_STEPS[0]);
    expect(accessStep(forge({ fee: FEE_STEPS[1] }), 'fee', 'p:me').fee).toBe(FEE_STEPS[2]);
  });

  it('never offers more than the sim allows', () => {
    expect(Math.max(...SHARE_STEPS)).toBeLessThanOrEqual(TERMS.share);
    expect(Math.max(...FEE_STEPS)).toBeLessThanOrEqual(TERMS.fee);
  });

  it('every level has plain words', () => {
    for (const a of ACCESS) expect(ACCESS_WORDS[a]).toMatch(/^[A-Z][a-z ]+[a-z]$/i);
  });

  it('only the owner of a standing building sets it', () => {
    expect(ownsTerms(forge(), 'p:me')).toBe(true);
    expect(ownsTerms(forge(), 'p:other')).toBe(false);
    expect(ownsTerms(forge({ state: 'scaffold' }), 'p:me')).toBe(false);
    expect(ownsTerms(forge({ state: 'destroyed' }), 'p:me')).toBe(false);
  });

  it('a closed building and a house ask no terms', () => {
    expect(accessHtml(forge())).toContain('data-acc="share"');
    expect(accessHtml(forge({ access: 'private' }))).not.toContain('data-acc="share"');
    expect(accessHtml(forge({ type: 'privateHouse', access: 'household' }))).not.toContain('data-acc="fee"');
  });
});
