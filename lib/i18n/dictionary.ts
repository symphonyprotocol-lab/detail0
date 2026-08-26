import { en } from '@/lib/i18n/messages/en';
import { zh } from '@/lib/i18n/messages/zh';
import type { Locale } from '@/lib/i18n/locale';

/**
 * The dictionary's shape is whatever the Chinese file says it is.
 *
 * That makes `zh` the reference translation: every other language is declared
 * as `Dictionary` and fails to compile if it drops, renames or mistypes a key.
 */
export type Dictionary = typeof zh;

const MESSAGES: Record<Locale, Dictionary> = { zh, en };

export function messagesFor(locale: Locale): Dictionary {
  return MESSAGES[locale];
}
