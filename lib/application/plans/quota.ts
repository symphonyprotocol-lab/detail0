import { AppError } from '@/contracts/errors';
import { nextDebitSource, type DebitSource } from '@/lib/domain';

/**
 * Quota. architecture.md 11.1.
 *
 * Reservation and usage event are billing facts: they live in one Postgres
 * transaction with the business data. Never move this counting into Redis.
 *
 * Deduction order is fixed: plan allowance first, then the addon balance.
 * The addon balance has no expiry and rolls across periods, so eligibility must
 * be decided by reading the balance, never by a validity window.
 */

export interface QuotaState {
  planAllowanceRemaining: number;
  addonBalanceRemaining: number;
}

export function chooseDebitSource(state: QuotaState): DebitSource {
  const source = nextDebitSource(state);
  if (source === null) {
    throw new AppError('quota_exceeded', 'monthly allowance and call pack balance are both empty');
  }
  return source;
}

export async function reserveCall(_input: {
  workspaceId: string;
  requestId: string;
}): Promise<never> {
  throw new AppError('not_implemented', 'reserveCall is not implemented yet');
}
