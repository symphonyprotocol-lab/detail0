/**
 * Aptos anchor signer.
 *
 * The private key is held directly in APTOS_ANCHOR_SIGNER_KEY -- proposal 1.1
 * reversed the cloud KMS decision, with the accepted risk recorded in its 0.1.
 * This module is the only place allowed to read that variable, and the key must
 * never reach a log, a trace, an alert, or an error message. Rotating it is not
 * a credential swap: the signer address is bound at compile time in the Move
 * package, so a new account means a contract upgrade with the offline Upgrade
 * Authority and a re-anchor. See aptos-anchoring-proposal.md 4.6.
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
  throw new Error('not implemented: anchorSigner');
}
