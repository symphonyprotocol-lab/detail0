import { HTML_LANG, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from '@/lib/i18n/locale';

/**
 * Write the language preference, from the browser.
 *
 * Shared by every switcher on the site -- the marketing/dashboard one and the
 * docs sidebar's -- so a choice made in one place is the same choice
 * everywhere, and there is one definition of how the cookie is spelled.
 *
 * The cookie is deliberately script-readable: it holds a display preference,
 * never a credential. Callers follow this with `router.refresh()`, because the
 * page that has to change is rendered on the server.
 */
export function rememberLocale(locale: Locale): void {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  document.documentElement.lang = HTML_LANG[locale];
}
