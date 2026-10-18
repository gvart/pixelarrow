/**
 * V6-ACCT-04 (N-SE-4): deploy-config.mjs refuses a config that sets DEV_AUTH
 * or DEV_EMAIL as a var, at the top level or in a named environment.
 */
import { describe, expect, it } from 'vitest';
import { devVarsIn } from '../scripts/deploy-guard.mjs';

describe('devVarsIn', () => {
  it('passes the shipped shape (no dev switches)', () => {
    expect(devVarsIn({ vars: { GAME_URL: 'https://play.pixelarrow.app', MAIL_FROM: 'noreply@pixelarrow.app' } })).toEqual([]);
    expect(devVarsIn({})).toEqual([]);
  });

  it('finds DEV_AUTH and DEV_EMAIL in vars, whatever their value', () => {
    expect(devVarsIn({ vars: { DEV_AUTH: '1' } })).toEqual(['vars.DEV_AUTH']);
    expect(devVarsIn({ vars: { DEV_EMAIL: '0' } })).toEqual(['vars.DEV_EMAIL']);
    expect(devVarsIn({ vars: { DEV_AUTH: '1', DEV_EMAIL: '1' } })).toEqual(['vars.DEV_AUTH', 'vars.DEV_EMAIL']);
  });

  it('finds them in a named environment too', () => {
    expect(devVarsIn({ vars: {}, env: { staging: { vars: { DEV_EMAIL: '1' } } } })).toEqual(['env.staging.vars.DEV_EMAIL']);
  });
});
