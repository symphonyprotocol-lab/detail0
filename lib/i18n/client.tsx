'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Dictionary } from '@/lib/i18n/dictionary';
import type { Locale } from '@/lib/i18n/locale';

/**
 * The dictionary, handed down to client components.
 *
 * Each product surface seeds this from its own server layout, so the words a
 * client component renders come from the same request that rendered the page
 * around it -- no second resolution, no flash of the wrong language.
 */
interface LocaleContext {
  locale: Locale;
  t: Dictionary;
}

const Context = createContext<LocaleContext | null>(null);

export function LocaleProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Dictionary;
  children: ReactNode;
}) {
  return <Context.Provider value={{ locale, t: messages }}>{children}</Context.Provider>;
}

export function useI18n(): LocaleContext {
  const value = useContext(Context);
  if (!value) throw new Error('useI18n must be used inside a LocaleProvider');
  return value;
}
