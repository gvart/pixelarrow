/**
 * WAR-02: the Clan screen speaks the player's language (G12, CLN-1). Every
 * clan string is in both tables with the same placeholders, the scene has no
 * English literal of its own, the server's clan errors are shown by code (its
 * own messages are English), and a new clan's name and tag are checked before
 * they are sent. Leave and Kick confirm as destructive actions (A11Y-08).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import clanSrc from '../src/scenes/online/ClanScene.ts?raw';
import { CLAN_EN } from '../src/i18n/clan.en';
import { CLAN_RU } from '../src/i18n/clan.ru';
import { EN } from '../src/i18n/en';
import { setLang } from '../src/i18n';
import { ApiError } from '../src/platform/api';

// the scene draws with Phaser; the rules tested here are pure. Phaser itself needs a browser.
vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C, Zone: C, BitmapText: C }, Scene: C, Loader: { Events: {} }, Geom: { Rectangle: C } } };
});
const { clanError, clanFormError, roleName } = await import('../src/scenes/online/ClanScene');

const placeholders = (e: unknown): string[] => [...JSON.stringify(e).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

afterEach(() => setLang('en'));

describe('clan strings', () => {
  it('ru has every key with the same placeholders', () => {
    for (const k of Object.keys(CLAN_EN) as (keyof typeof CLAN_EN)[]) {
      expect(CLAN_RU[k], k).toBeTruthy();
      expect([...new Set(placeholders(CLAN_RU[k]))], k).toEqual([...new Set(placeholders(CLAN_EN[k]))]);
    }
  });

  it('every key the scene asks for exists', () => {
    const keys = [...clanSrc.matchAll(/t\('((?:clan|common|econ)\.[\w.]+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(30);
    for (const k of keys) expect(EN, k).toHaveProperty([k]);
  });

  it('the scene has no English text of its own', () => {
    // the old literals, and any capitalised two-word string outside t()
    for (const s of ['Found a clan', 'No clan', 'Loading...', 'Invite link', 'Leave the clan?', 'Clan invite', 'Not now', 'Make officer', 'Hand over lead', ' regions', 'Join my clan']) expect(clanSrc).not.toContain(`'${s}`);
    const code = clanSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const literals = [...code.matchAll(/'([A-Z][a-z]+ [a-z][^']*)'/g)].map((m) => m[1]);
    expect(literals).toEqual([]);
  });

  it('roles are named in the player language', () => {
    expect(roleName('leader')).toBe('Leader');
    setLang('ru');
    expect(roleName('officer')).toBe('Командир');
  });
});

describe('clan errors', () => {
  it('maps the server codes and hides its English messages', () => {
    setLang('ru');
    expect(clanError(new ApiError(409, 'name_taken', 'That clan name or tag is taken'))).toBe(CLAN_RU['clan.err.name_taken']);
    expect(clanError(new ApiError(410, 'invite_expired', 'This invite link has expired'))).toBe(CLAN_RU['clan.err.invite_expired']);
    expect(clanError(new ApiError(418, 'something_new', 'Some English'))).toBe(CLAN_RU['clan.err.generic']);
    expect(clanError(new Error('boom'))).toBe(CLAN_RU['clan.err.generic']);
    expect(clanError(new ApiError(502, 'bad_gateway', 'Bad gateway'))).toBe('Нет связи с сервером');
  });
});

describe('found a clan form', () => {
  it('accepts what the server accepts (the shared validator, server/src/names/validate.ts)', () => {
    expect(clanFormError('Sons of Lambda', 'LMB')).toBeNull();
    expect(clanFormError('Hoplites of Argos-2', 'AB12')).toBeNull();
    expect(clanFormError('Сыны Лямбды', 'SL')).toBeNull();
  });

  it('refuses a bad name or tag before sending', () => {
    expect(clanFormError('Ab', 'LMB')).toBe(CLAN_EN['clan.form.badName']);
    expect(clanFormError('x'.repeat(21), 'LMB')).toBe(CLAN_EN['clan.form.badName']);
    expect(clanFormError('Sons!', 'LMB')).toBe(CLAN_EN['clan.form.badName']);
    expect(clanFormError("Hoplites d'Argos", 'LMB')).toBe(CLAN_EN['clan.form.badName']);
    expect(clanFormError('Sons of Лямбда', 'LMB')).toBe(CLAN_EN['clan.form.badName']); // mixed scripts
    expect(clanFormError('Admin Guild', 'LMB')).toBe(CLAN_EN['clan.form.notAllowed']);
    expect(clanFormError('Sons of Lambda', 'L')).toBe(CLAN_EN['clan.form.badTag']);
    expect(clanFormError('Sons of Lambda', 'ΛΜΒ')).toBe(CLAN_EN['clan.form.badTag']);
    expect(clanFormError('Sons of Lambda', 'TOOLONG')).toBe(CLAN_EN['clan.form.badTag']);
    expect(clanFormError('Sons of Lambda', 'FUCK')).toBe(CLAN_EN['clan.form.notAllowed']);
  });
});

describe('destructive actions confirm (A11Y-08)', () => {
  it('Leave and Kick open a destructive confirm', () => {
    const leave = clanSrc.slice(clanSrc.indexOf('confirmLeave(): void'));
    expect(leave.slice(0, 400)).toMatch(/confirmDialog\([\s\S]*destructive: true/);
    const kick = clanSrc.slice(clanSrc.indexOf("id: 'clan.kick'"));
    expect(kick.slice(0, 400)).toMatch(/confirmDialog\([\s\S]*destructive: true/);
  });
});
