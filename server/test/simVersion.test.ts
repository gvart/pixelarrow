/**
 * The one sim version check (ADR-0001, V5-074): the server takes only
 * SIM_VERSION on sockets (`?sim=`; error frame, close 4426).
 */
import { describe, expect, it } from 'vitest';
import { SIM_VERSION } from '../../src/sim/version';
import { checkSimVersion, checkSocketSimVersion, SIM_VERSION_REJECTED } from '../src/simVersion';
import { ApiError } from '../src/errors';

function rejection(check: () => void): ApiError {
  try {
    check();
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('the version was accepted');
}

describe('sim version check', () => {
  it('accepts SIM_VERSION', () => {
    expect(() => checkSimVersion(SIM_VERSION)).not.toThrow();
    expect(() => checkSocketSimVersion(String(SIM_VERSION))).not.toThrow();
  });

  it.each([SIM_VERSION - 1, SIM_VERSION + 1, undefined])('refuses %s with 426 (reload)', (v) => {
    for (const e of [rejection(() => checkSimVersion(v)), rejection(() => checkSocketSimVersion(v === undefined ? undefined : String(v)))]) {
      expect(e).toBeInstanceOf(ApiError);
      expect(e.status).toBe(426);
      expect(e.code).toBe(SIM_VERSION_REJECTED);
      expect(e.extra).toMatchObject({ simVersion: v ?? null, expected: SIM_VERSION });
    }
  });

  it('a malformed socket version is a 400', () => {
    expect(rejection(() => checkSocketSimVersion('abc')).status).toBe(400);
  });
});
