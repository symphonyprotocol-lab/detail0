import { Pill } from '@/components/admin/ui';
import type { BillingDocumentStatus } from '@/lib/domain/billing';

/**
 * Colour follows what the operator has to do about it, not what the provider
 * calls it: money owed is amber, money lost is red, money in is green, and a
 * document nobody has to act on is grey.
 *
 * One definition, used by the list and the detail screen. It was two, and they
 * disagreed -- a written-off invoice was red in the table and amber on its own
 * page, which is the difference between "this money is gone" and "this money is
 * coming".
 */
const STATUS_TONE: Record<BillingDocumentStatus, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  open: 'warn',
  paid: 'ok',
  failed: 'danger',
  refunded: 'neutral',
  void: 'neutral',
  uncollectible: 'danger',
};

export function BillingStatusPill({
  status,
  label,
}: {
  status: BillingDocumentStatus;
  label: string;
}) {
  return <Pill tone={STATUS_TONE[status]}>{label}</Pill>;
}
