/**
 * Aptos anchor signer.
 *
 * The private key lives in cloud KMS and is non-exportable; the platform holds
 * only a Sign permission. No environment variable ever carries key material.
 * See aptos-anchoring-proposal.md 4.6.
 */
export interface AnchorSigner {
  accountAddress(): Promise<string>;
  signAndSubmit(payload: {
    leafSchemaVersion: number;
    subjectType: 'version' | 'audit_head' | 'earning_statement';
    merkleRoot: string;
    windowEnd: Date;
  }): Promise<{ txHash: string }>;
}

export function anchorSigner(): AnchorSigner {
  throw new Error('not implemented: anchorSigner (cloud KMS)');
}
