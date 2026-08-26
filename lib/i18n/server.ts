/**
 * Locale for the current request, on the server.
 *
 * Reading the cookie and `Accept-Language` here rather than in middleware keeps
 * the rule in one place and leaves the response headers alone: nothing is
 * written until a visitor actually picks a language.
 */
import { cookies, headers } from 'next/headers';
import { messagesFor, type Dictionary } from '@/lib/i18n/dictionary';
import { LOCALE_COOKIE, resolveLocale, type Locale } from '@/lib/i18n/locale';

export async function currentLocale(): Promise<Locale> {
  const [jar, headerBag] = await Promise.all([cookies(), headers()]);
  return resolveLocale({
    cookie: jar.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerBag.get('accept-language'),
  });
}

/** The locale and its dictionary, the pair every server component wants. */
export async function translations(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await currentLocale();
  return { locale, t: messagesFor(locale) };
}

/** Shorthand for components that only need the words. */
export async function getMessages(): Promise<Dictionary> {
  return messagesFor(await currentLocale());
}
