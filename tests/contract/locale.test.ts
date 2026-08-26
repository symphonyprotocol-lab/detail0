import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, negotiateLocale, resolveLocale, type Locale } from '@/lib/i18n/locale';
import { messagesFor } from '@/lib/i18n/dictionary';
import { en } from '@/lib/i18n/messages/en';
import { zh } from '@/lib/i18n/messages/zh';
import { fill } from '@/lib/i18n/format';

/**
 * The first render of every page depends on this: no URL carries the locale,
 * so the browser's own header is the only signal a first-time visitor gives.
 */
describe('negotiateLocale', () => {
  it('honours quality order rather than header order', () => {
    expect(negotiateLocale('en;q=0.5,zh;q=0.9')).toBe('zh');
    expect(negotiateLocale('zh;q=0.2,en;q=0.8')).toBe('en');
  });

  it('matches on the primary subtag, so every Chinese region resolves', () => {
    for (const header of ['zh-CN', 'zh-TW', 'zh-Hant-HK', 'ZH-hans']) {
      expect(negotiateLocale(header)).toBe('zh');
    }
    expect(negotiateLocale('en-GB,en;q=0.9')).toBe('en');
  });

  it('keeps header order when weights tie', () => {
    expect(negotiateLocale('zh,en')).toBe('zh');
    expect(negotiateLocale('en,zh')).toBe('en');
  });

  it('skips ranges we do not ship and falls back when none match', () => {
    expect(negotiateLocale('fr-FR,fr;q=0.9,en;q=0.4')).toBe('en');
    expect(negotiateLocale('fr,de,ja')).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale('*')).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale('')).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale(null)).toBe(DEFAULT_LOCALE);
  });

  it('ignores a range the client explicitly refused', () => {
    expect(negotiateLocale('zh;q=0,en')).toBe('en');
  });

  it('does not throw on a malformed header', () => {
    expect(negotiateLocale(';;;,q=,  ,zh;q=abc')).toBe(DEFAULT_LOCALE);
  });
});

describe('resolveLocale', () => {
  it('lets an explicit choice win over the browser', () => {
    expect(resolveLocale({ cookie: 'en', acceptLanguage: 'zh-CN' })).toBe('en');
    expect(resolveLocale({ cookie: 'zh', acceptLanguage: 'en-US' })).toBe('zh');
  });

  it('falls back to the browser when the cookie is absent or junk', () => {
    expect(resolveLocale({ cookie: undefined, acceptLanguage: 'zh-CN' })).toBe('zh');
    expect(resolveLocale({ cookie: 'klingon', acceptLanguage: 'zh-CN' })).toBe('zh');
  });
});

/**
 * `Dictionary` is derived from the Chinese file, so a missing key is already a
 * type error. This catches the two things the type cannot see: an entry copied
 * over untranslated, and a placeholder that lost its `{name}` in translation.
 */
describe('dictionaries', () => {
  function paths(node: unknown, trail: string[] = []): [string, string][] {
    if (typeof node === 'string') return [[trail.join('.'), node]];
    if (Array.isArray(node)) return node.flatMap((v, i) => paths(v, [...trail, String(i)]));
    if (node && typeof node === 'object') {
      return Object.entries(node).flatMap(([k, v]) => paths(v, [...trail, k]));
    }
    return [];
  }

  const zhStrings = new Map(paths(zh));
  const enStrings = new Map(paths(en));

  it('resolves each locale to its own dictionary', () => {
    const cases: [Locale, unknown][] = [
      ['zh', zh],
      ['en', en],
    ];
    for (const [locale, expected] of cases) expect(messagesFor(locale)).toBe(expected);
  });

  it('leaves no Han characters in the English copy', () => {
    const untranslated = [...enStrings]
      // The catalog's own language field is content: "Chinese · English".
      .filter(([key]) => !key.endsWith('.language'))
      .filter(([, value]) => /\p{Script=Han}/u.test(value))
      .map(([key]) => key);
    expect(untranslated).toEqual([]);
  });

  it('keeps the same placeholders on both sides', () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();

    for (const [key, value] of zhStrings) {
      expect([key, placeholders(enStrings.get(key) ?? '')]).toEqual([key, placeholders(value)]);
    }
  });
});

describe('fill', () => {
  it('substitutes named values and leaves unknown ones alone', () => {
    expect(fill('{shown} of {total}', { shown: 6, total: '12,426' })).toBe('6 of 12,426');
    expect(fill('{missing} stays', {})).toBe('{missing} stays');
  });
});
