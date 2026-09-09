/// re0 anchoring, on-chain half.
///
/// The whole contract is one entry function that emits one event. It holds no
/// funds, no user assets, and no state at all -- not even the Roots it has
/// seen. aptos-anchoring-proposal.md 4.5 fixes that shape: a Root goes out as
/// an Event rather than into storage, the surface stays small enough for an
/// internal review to actually cover it, and there is nothing here for a stolen
/// key to drain.
///
/// What reaches the chain is a Merkle Root over salted leaf digests and the
/// batch metadata needed to interpret it. No content, no query, no email, no
/// source URL, no amount, no publisher identity -- proposal 6, and the same
/// line architecture.md 17.1 draws for logs.
///
/// Because the package is published with `upgrade_policy = "compatible"`, the
/// layout of `BatchAnchored` is frozen from the first mainnet publish: the
/// chain rejects an upgrade that changes it. Every field the public Verifier
/// will ever read from the chain has to be here on day one, which is why
/// proposal 4.11 gate 1 wants the leaf construction frozen and reviewed before
/// the first production submission.
module re0_anchor::anchor {
    use std::signer;
    use std::string::{Self, String};
    use std::vector;
    use aptos_framework::event;

    /// The three kinds of batch, spelled exactly as `anchor_batch.subject_type`
    /// in Postgres (architecture.md 6). They travel as text rather than as a
    /// number so that a stranger reading the event on an explorer, with no
    /// access to our code, can tell what was anchored.
    const SUBJECT_VERSION: vector<u8> = b"version";
    const SUBJECT_AUDIT_HEAD: vector<u8> = b"audit_head";
    const SUBJECT_EARNING_STATEMENT: vector<u8> = b"earning_statement";

    /// SHA-256, as everywhere else in re0 (lib/domain/ingestion.ts).
    const MERKLE_ROOT_BYTES: u64 = 32;

    /// The caller is not the Anchor Signer.
    const E_UNAUTHORIZED: u64 = 1;
    /// `merkle_root` is not 32 bytes.
    const E_ROOT_LENGTH: u64 = 2;
    /// `subject_type` is not one of the three known kinds.
    const E_UNKNOWN_SUBJECT: u64 = 3;
    /// `leaf_schema_version` is zero; schema versions start at 1.
    const E_SCHEMA_VERSION: u64 = 4;
    /// `window_end_unix_secs` is zero.
    const E_WINDOW_END: u64 = 5;

    #[event]
    /// One anchored batch. This is the entire on-chain record: everything a
    /// third party needs to check a Merkle proof it already holds, and nothing
    /// that would let it learn what was anchored.
    struct BatchAnchored has drop, store {
        /// Which leaf construction produced the leaves under this Root. A
        /// defective construction is never rewritten or revoked; the subjects
        /// are re-anchored under a new version and the old batch is marked
        /// `superseded` off chain (proposal 4.5.1). A Verifier therefore has to
        /// keep supporting every version it has ever seen.
        leaf_schema_version: u64,
        /// `version` | `audit_head` | `earning_statement`.
        subject_type: String,
        /// Merkle Root over the batch's leaves, 32 bytes, SHA-256.
        merkle_root: vector<u8>,
        /// End of the aggregation window, unix seconds. Not a proof of time --
        /// the transaction's own timestamp is that. This is which window the
        /// batch closed, so a Verifier can line the event up with the batch it
        /// was given.
        window_end_unix_secs: u64,
    }

    /// Submit one batch Root.
    ///
    /// Only the Anchor Signer may call this. The check matters even though only
    /// we hold that key: without it, anyone could emit a `BatchAnchored` event
    /// from this very module and a Verifier that trusts the module -- rather
    /// than the module *and* the sender -- would accept it.
    public entry fun submit_batch(
        caller: &signer,
        leaf_schema_version: u64,
        subject_type: String,
        merkle_root: vector<u8>,
        window_end_unix_secs: u64,
    ) {
        assert!(signer::address_of(caller) == @anchor_signer, E_UNAUTHORIZED);
        assert!(leaf_schema_version > 0, E_SCHEMA_VERSION);
        assert!(is_known_subject(&subject_type), E_UNKNOWN_SUBJECT);
        assert!(vector::length(&merkle_root) == MERKLE_ROOT_BYTES, E_ROOT_LENGTH);
        assert!(window_end_unix_secs > 0, E_WINDOW_END);

        event::emit(BatchAnchored {
            leaf_schema_version,
            subject_type,
            merkle_root,
            window_end_unix_secs,
        });
    }

    fun is_known_subject(subject_type: &String): bool {
        let bytes = string::bytes(subject_type);
        *bytes == SUBJECT_VERSION
            || *bytes == SUBJECT_AUDIT_HEAD
            || *bytes == SUBJECT_EARNING_STATEMENT
    }
}
