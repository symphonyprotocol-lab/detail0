import { AppError, type ClaimFailureReason } from '@/contracts/errors';
import type { ClaimMethod, SourceType } from '@/lib/domain';
import { claimMethodsFor, requiresClaim } from '@/lib/domain';

/**
 * Ownership claim. requirement.md 7.3, architecture.md 5.4.
 *
 * The question is not "who are you" but "do you control this source".
 * A key placed in recall0.json grants nothing: a config file can be written by
 * forks, pull requests and mirrors, so write access is not control.
 *
 * library.ownerWorkspaceId has exactly two write paths: a verified claim, or an
 * admin ruling on a dispute. Ingestion, review and refresh never touch it.
 */

export interface StartClaimInput {
  workspaceId: string;
  libraryPublicId: string;
  method: ClaimMethod;
}

export interface ClaimCheck {
  key: string;
  label: string;
  state: 'ok' | 'pending' | 'failed';
}

export const CHALLENGE_TTL_DAYS = 7;

export function assertMethodSupported(sourceType: SourceType, method: ClaimMethod): void {
  if (!requiresClaim(sourceType)) {
    throw new AppError(
      'claim_verification_failed',
      'this source type does not use claims; the creator is the owner',
      'source_mismatch',
    );
  }
  if (!claimMethodsFor(sourceType).includes(method)) {
    throw new AppError(
      'claim_verification_failed',
      'verification method is not available for this source type',
      'source_mismatch',
    );
  }
}

export async function startClaim(_input: StartClaimInput): Promise<never> {
  throw new AppError('not_implemented', 'startClaim is not implemented yet');
}

export async function verifyClaim(_claimId: string): Promise<never> {
  throw new AppError('not_implemented', 'verifyClaim is not implemented yet');
}

/**
 * Failure output must stay minimal: no source permission detail, no DNS payload,
 * no fetched content. For a library the caller cannot see, the response must be
 * indistinguishable from "not found" so claims cannot probe private libraries.
 * requirement.md 7.3.7.
 */
export function publicFailureMessage(reason: ClaimFailureReason): string {
  switch (reason) {
    case 'insufficient_permission':
      return 'Your account needs admin or maintain permission on this repository.';
    case 'account_not_linked':
      return 'Link a GitHub account that can access this repository, then retry.';
    case 'source_mismatch':
      return 'The verified source does not match this library. Check the target and retry.';
    case 'challenge_not_found':
      return 'The challenge was not found at the expected location.';
    case 'challenge_expired':
      return 'The challenge expired. Start a new claim to get a fresh one.';
    case 'already_claimed':
      return 'This library already has an owner. Open a dispute for admin review.';
    case 'claim_in_progress':
      return 'Another claim is in progress for this library. Try again after it ends.';
    case 'retry_limit_exceeded':
      return 'Too many attempts. Wait for the cooldown to end.';
  }
}
