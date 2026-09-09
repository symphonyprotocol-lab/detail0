/**
 * Aptos anchor signer: the only thing in re0 that writes to a chain.
 *
 * The private key is held directly in APTOS_ANCHOR_SIGNER_KEY -- proposal 1.1
 * reversed the cloud KMS decision, with the accepted risk recorded in its 0.1.
 * This module is the only place allowed to read that variable, and the key must
 * never reach a log, a trace, an alert, or an error message. Rotating it is not
 * a credential swap: the signer address is bound at compile time in the Move
 * package, so a new account means a contract upgrade with the offline Upgrade
 * Authority and a re-anchor. See aptos-anchoring-proposal.md 4.6.
 *
 * Submission and confirmation are separate calls on purpose (proposal 4.3): a
 * batch is `submitted` the moment it has a hash and only `confirmed` once the
 * chain says so, and the gap between them survives a worker dying. Nothing here
 * retries -- the caller owns the backoff, because it owns the batch row.
 */
import {
  Account,
  Aptos,
  AptosConfig,
  Ed25519PrivateKey,
  Network,
  type UserTransactionResponse,
} from '@aptos-labs/ts-sdk';
import type { AnchorSubject } from '@/lib/domain/anchor-leaf';

export interface AnchorSubmission {
  leafSchemaVersion: number;
  subjectType: AnchorSubject;
  /** 64 lowercase hex characters, no `0x`. */
  merkleRoot: string;
  windowEnd: Date;
}

export interface AnchorConfirmation {
  status: 'pending' | 'confirmed' | 'failed';
  confirmedAt: Date | null;
  /** The VM's own words when it aborted. Never key material. */
  vmStatus: string | null;
}

export interface AnchorSigner {
  network: string;
  accountAddress: string;
  objectAddress: string;
  submitBatch(payload: AnchorSubmission): Promise<{ txHash: string }>;
  confirmBatch(txHash: string): Promise<AnchorConfirmation>;
}

const NETWORKS: Record<string, Network> = {
  mainnet: Network.MAINNET,
  testnet: Network.TESTNET,
  devnet: Network.DEVNET,
  local: Network.LOCAL,
};

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/** Whether a deployment can anchor at all. Reads no key material. */
export function isAnchorSignerConfigured(): boolean {
  return Boolean(env('APTOS_ANCHOR_SIGNER_KEY') && env('APTOS_ANCHOR_OBJECT_ADDRESS'));
}

/** `9f86…` -> bytes. The contract wants 32 of them and rejects anything else. */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-f]+$/i.test(clean) || clean.length % 2 !== 0) {
    throw new Error('anchor signer: merkle root is not hex');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function anchorSigner(): AnchorSigner {
  const keyMaterial = env('APTOS_ANCHOR_SIGNER_KEY');
  const objectAddress = env('APTOS_ANCHOR_OBJECT_ADDRESS');
  if (!keyMaterial || !objectAddress) {
    throw new Error('anchor signer: APTOS_ANCHOR_SIGNER_KEY and _OBJECT_ADDRESS are required');
  }

  const networkName = (env('APTOS_NETWORK') ?? 'testnet').toLowerCase();
  const network = NETWORKS[networkName];
  if (!network) throw new Error(`anchor signer: unknown APTOS_NETWORK ${networkName}`);

  const account = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(keyMaterial),
  });
  const accountAddress = account.accountAddress.toString();

  /*
   * A key and an address that disagree is a misconfiguration worth catching
   * before it costs gas: the contract binds the signer at compile time, so a
   * mismatched pair does not fail quietly -- it fails on every batch, from an
   * account nobody is watching the balance of.
   */
  const declared = env('APTOS_ANCHOR_ACCOUNT_ADDRESS');
  if (declared && declared.toLowerCase() !== accountAddress.toLowerCase()) {
    throw new Error('anchor signer: the key does not derive APTOS_ANCHOR_ACCOUNT_ADDRESS');
  }

  const aptos = new Aptos(
    new AptosConfig({
      network,
      ...(env('APTOS_NODE_URL') ? { fullnode: env('APTOS_NODE_URL') as string } : {}),
      ...(env('APTOS_API_KEY') ? { clientConfig: { API_KEY: env('APTOS_API_KEY') as string } } : {}),
    }),
  );

  return {
    network: networkName,
    accountAddress,
    objectAddress,

    async submitBatch(payload) {
      const transaction = await aptos.transaction.build.simple({
        sender: account.accountAddress,
        data: {
          function: `${objectAddress}::anchor::submit_batch`,
          functionArguments: [
            payload.leafSchemaVersion,
            payload.subjectType,
            hexToBytes(payload.merkleRoot),
            /* The contract takes unix seconds; the window is a business time. */
            Math.floor(payload.windowEnd.getTime() / 1000),
          ],
        },
      });
      const pending = await aptos.signAndSubmitTransaction({ signer: account, transaction });
      return { txHash: pending.hash };
    },

    async confirmBatch(txHash) {
      let response;
      try {
        response = await aptos.getTransactionByHash({ transactionHash: txHash });
      } catch {
        /*
         * Not found is not failure. A submitted transaction the node has not
         * caught up with yet must stay `submitted` and be asked again, or a
         * retry would anchor the same window twice.
         */
        return { status: 'pending', confirmedAt: null, vmStatus: null };
      }
      if (response.type !== 'user_transaction') {
        return { status: 'pending', confirmedAt: null, vmStatus: null };
      }
      const committed = response as UserTransactionResponse;
      return {
        status: committed.success ? 'confirmed' : 'failed',
        /* Ledger timestamps are microseconds since the epoch. */
        confirmedAt: committed.success
          ? new Date(Math.floor(Number(committed.timestamp) / 1000))
          : null,
        vmStatus: committed.vm_status ?? null,
      };
    },
  };
}
