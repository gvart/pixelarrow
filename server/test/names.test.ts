import { describe, expect, it } from 'vitest';
import { nameKey, validateClanName, validateDisplayName } from '../src/names/validate';
import { generateDisplayName } from '../src/names/generate';

const reason = (raw: string) => {
  const r = validateDisplayName(raw);
  return r.ok ? 'ok' : r.reason;
};

describe('validateDisplayName (ADR-0009 §6)', () => {
  it('accepts a plain Latin or Cyrillic name and returns it normalised with its key', () => {
    expect(validateDisplayName('  Swift   Archer ')).toEqual({ ok: true, name: 'Swift Archer', key: 'swlftarcher' });
    expect(validateDisplayName('Лучник_7')).toMatchObject({ ok: true, name: 'Лучник_7' });
    expect(validateDisplayName('ＷｉｄｅＮａｍｅ')).toMatchObject({ ok: true, name: 'WideName' }); // NFKC
  });

  it('length: 3 to 16 characters after normalising', () => {
    expect(reason('ab')).toBe('length');
    expect(reason('abc')).toBe('ok');
    expect(reason('a'.repeat(16))).toBe('ok');
    expect(reason('a'.repeat(17))).toBe('length');
    expect(reason('  ab  ')).toBe('length');
  });

  it('character set: letters, digits, single separators inside, at least one letter', () => {
    for (const bad of ['john@mail', 'site.com', 'a/b/c', 'Ölaf', 'name!', '_name', 'name-', 'a__b', 'a -b', '12345', 'a​bc'])
      expect(reason(bad), bad).toBe('chars');
    for (const good of ['a_b-c d', 'Hero 42', 'Ёжик'])
      expect(reason(good), good).toBe('ok');
  });

  it('refuses mixed Latin and Cyrillic letters (a Cyrillic а inside a Latin name)', () => {
    expect(reason('Bаdger')).toBe('mixed_script');
    expect(reason('Bob Боб')).toBe('mixed_script');
  });

  it('reserved words, on the folded key and in Russian', () => {
    for (const r of ['admin', 'Adm1n', 'ADMIN_42', 'Moderator', 'mod', 'Support Team', 'Pixelarrow', 'telegram', 'Deleted Player', 'null', 'Админ', 'Модератор', 'Поддержка'])
      expect(reason(r), r).toBe('reserved');
    expect(reason('Modest')).toBe('ok'); // short reserved words match whole keys only
  });

  it('homoglyph folding: look-alike digits and Cyrillic letters share a key', () => {
    expect(nameKey('Adm1n')).toBe(nameKey('admin'));
    expect(nameKey('B0ld-Hero')).toBe(nameKey('bold hero'));
    expect(nameKey('СОКОЛ')).toBe(nameKey('cokoл')); // Cyrillic С, О, К fold to Latin c, o, k
    expect(nameKey('Сосо')).toBe(nameKey('Coco'));
  });

  it('blocklist substrings of the key, with one generic reason', () => {
    expect(reason('xxFuckxx')).toBe('blocked');
    expect(reason('Sh1tHead')).toBe('blocked'); // 1, i and l fold together
    expect(reason('BigPizdec')).toBe('ok'); // Latin transliteration is not listed
    expect(reason('пиздец')).toBe('blocked');
  });
});

describe('validateClanName', () => {
  it('uses the same rules with 3 to 20 characters', () => {
    expect(validateClanName('Spartans of the Sea')).toMatchObject({ ok: true });
    expect(validateClanName('Sons of Sparta Forever')).toEqual({ ok: false, reason: 'length' });
    expect(validateClanName("Leonidas' Men")).toEqual({ ok: false, reason: 'chars' });
    expect(validateClanName('Admins')).toEqual({ ok: false, reason: 'reserved' });
  });
});

describe('generateDisplayName', () => {
  it('only ever produces names the validator accepts', () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 2000; i++) expect(validateDisplayName(generateDisplayName(rng)).ok).toBe(true);
  });
});
