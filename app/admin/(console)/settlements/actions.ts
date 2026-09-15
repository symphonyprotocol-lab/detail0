'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { generateSettlements } from '@/lib/application/administration';
import { AdminChangeRefused, type AdminChangeError } from '@/lib/domain/admin';
import { requireAdminCapability } from '@/lib/http/admin';
import { clientAddress } from '@/lib/http/client-address';

/**
 * The one mutation behind the settlements screen.
 *
 * Re-resolves the session and re-checks the capability like every console
 * action: a server action is a public endpoint with a generated name, and the
 * page rendering the button only for entitled operators says nothing about
 * who can post to it.
 */
export interface SettlementActionResult {
  ok: boolean;
  error?: Extract<AdminChangeError, 'period_invalid' | 'reason_required' | 'invalid_input'>;
  /** What the run did, so the dialog can report it in numbers. */
  outcome?: {
    periodId: string;
    poolMinor: number;
    totalAttributableCalls: number;
    created: number;
    createdMinor: number;
    withoutAccount: number;
    alreadyPresent: number;
  };
}

export async function generateSettlementsAction(
  _previous: SettlementActionResult | null,
  form: FormData,
): Promise<SettlementActionResult> {
  const session = await requireAdminCapability('billing');
  const bag = await headers();

  try {
    const result = await generateSettlements({
      actor: {
        administratorId: session.administratorId,
        email: session.email,
        clientAddress: clientAddress(bag),
      },
      periodId: String(form.get('period') ?? ''),
      reason: String(form.get('reason') ?? ''),
    });
    revalidatePath('/admin/settlements');
    return {
      ok: true,
      outcome: {
        periodId: result.periodId,
        poolMinor: result.poolMinor,
        totalAttributableCalls: result.totalAttributableCalls,
        created: result.created,
        createdMinor: result.createdMinor,
        withoutAccount: result.withoutAccount,
        alreadyPresent: result.alreadyPresent,
      },
    };
  } catch (error) {
    if (error instanceof AdminChangeRefused) {
      return {
        ok: false,
        error:
          error.code === 'period_invalid' || error.code === 'reason_required'
            ? error.code
            : 'invalid_input',
      };
    }
    console.error(
      `settlement generation failed: ${error instanceof Error ? error.message : 'unknown'}`,
    );
    return { ok: false, error: 'invalid_input' };
  }
}
