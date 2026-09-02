'use client';

import { useRouter } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider';
import type { Translations } from 'fumadocs-ui/i18n';
import { rememberLocale } from '@/lib/i18n/remember';
import { isLocale, LOCALE_LABEL, LOCALES, type Locale } from '@/lib/i18n/locale';

/**
 * Fumadocs' provider, taught this product's way of changing language.
 *
 * The docs site gets the switcher Fumadocs already draws in its sidebar, but
 * the handler is ours: write the same `r0_locale` cookie the marketing header
 * writes, then ask the server for this same URL again. No route changes,
 * because no docs URL carries a locale (lib/i18n/docs.ts).
 *
 * Passing `onLocaleChange` is also why this wrapper is a client component --
 * a function prop cannot cross the server boundary.
 *
 * RootProvider is mounted here, not at the app root -- see app/layout.tsx.
 *
 * The docs site follows the reader's operating system: `system` is both the
 * default and a selectable option in the switcher, so a reader who never
 * touches the switcher tracks their OS appearance, and one who tried light or
 * dark once can hand control back to it.
 */
const LOCALE_ITEMS = LOCALES.map((locale) => ({ locale, name: LOCALE_LABEL[locale] }));

export function DocsRootProvider({
  locale,
  translations,
  children,
}: {
  locale: Locale;
  translations: Translations;
  children: ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function change(next: string) {
    if (!isLocale(next) || next === locale) return;
    rememberLocale(next);
    startTransition(() => router.refresh());
  }

  return (
    <RootProvider
      theme={{ defaultTheme: 'system', enableSystem: true }}
      i18n={{
        locale,
        locales: LOCALE_ITEMS,
        translations,
        onLocaleChange: change,
      }}
    >
      {children}
    </RootProvider>
  );
}
