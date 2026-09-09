// The gate the module has to hold: only the Anchor Signer writes, and a batch
// that cannot be interpreted never reaches the chain at all. Mainnet writes are
// irreversible (aptos-anchoring-proposal.md 0), so every rejection is tested
// with its own abort code rather than "it failed somehow".
#[test_only]
module re0_anchor::anchor_tests {
    use std::string;
    use std::vector;
    use aptos_framework::event;
    use re0_anchor::anchor::{Self, BatchAnchored};

    // 32 bytes, the shape of a SHA-256 root. Its value is arbitrary here; the
    // leaf construction that produces a real one is off chain (proposal 4.2).
    const ROOT: vector<u8> = x"9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

    #[test(signer = @anchor_signer)]
    fun emits_one_event_per_version_batch(signer: &signer) {
        anchor::submit_batch(signer, 1, string::utf8(b"version"), ROOT, 1_767_225_600);

        let emitted = event::emitted_events<BatchAnchored>();
        assert!(vector::length(&emitted) == 1, 0);
    }

    #[test(signer = @anchor_signer)]
    fun accepts_the_other_two_subject_types(signer: &signer) {
        anchor::submit_batch(signer, 1, string::utf8(b"audit_head"), ROOT, 1_767_225_600);
        anchor::submit_batch(
            signer,
            1,
            string::utf8(b"earning_statement"),
            ROOT,
            1_767_225_600,
        );

        let emitted = event::emitted_events<BatchAnchored>();
        assert!(vector::length(&emitted) == 2, 0);
    }

    // No dedup and no state: the same Root submitted twice is two events. Which
    // batch a Root belongs to is settled off chain by `anchor_batch.tx_hash`
    // (architecture.md 6), not by the contract.
    #[test(signer = @anchor_signer)]
    fun does_not_reject_a_repeated_root(signer: &signer) {
        anchor::submit_batch(signer, 1, string::utf8(b"version"), ROOT, 1_767_225_600);
        anchor::submit_batch(signer, 1, string::utf8(b"version"), ROOT, 1_767_225_600);

        let emitted = event::emitted_events<BatchAnchored>();
        assert!(vector::length(&emitted) == 2, 0);
    }

    // A later leaf schema is not a code change: re-anchoring under version 2
    // goes through the same entry function (proposal 4.5.1).
    #[test(signer = @anchor_signer)]
    fun accepts_a_later_leaf_schema(signer: &signer) {
        anchor::submit_batch(signer, 2, string::utf8(b"version"), ROOT, 1_767_225_600);

        let emitted = event::emitted_events<BatchAnchored>();
        assert!(vector::length(&emitted) == 1, 0);
    }

    #[test(stranger = @0xbad)]
    #[expected_failure(abort_code = 1, location = re0_anchor::anchor)]
    fun rejects_anyone_but_the_anchor_signer(stranger: &signer) {
        anchor::submit_batch(stranger, 1, string::utf8(b"version"), ROOT, 1_767_225_600);
    }

    #[test(signer = @anchor_signer)]
    #[expected_failure(abort_code = 2, location = re0_anchor::anchor)]
    fun rejects_a_short_root(signer: &signer) {
        let short = x"9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a";
        anchor::submit_batch(signer, 1, string::utf8(b"version"), short, 1_767_225_600);
    }

    #[test(signer = @anchor_signer)]
    #[expected_failure(abort_code = 2, location = re0_anchor::anchor)]
    fun rejects_a_long_root(signer: &signer) {
        let long = x"9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a0800";
        anchor::submit_batch(signer, 1, string::utf8(b"version"), long, 1_767_225_600);
    }

    #[test(signer = @anchor_signer)]
    #[expected_failure(abort_code = 2, location = re0_anchor::anchor)]
    fun rejects_an_empty_root(signer: &signer) {
        anchor::submit_batch(signer, 1, string::utf8(b"version"), vector::empty(), 1_767_225_600);
    }

    // Including the near-misses: `anchor_batch.subject_type` is an enum in
    // Postgres, and a value that is not in it would anchor a batch nothing can
    // be matched back to.
    #[test(signer = @anchor_signer)]
    #[expected_failure(abort_code = 3, location = re0_anchor::anchor)]
    fun rejects_an_unknown_subject_type(signer: &signer) {
        anchor::submit_batch(signer, 1, string::utf8(b"chunk"), ROOT, 1_767_225_600);
    }

    #[test(signer = @anchor_signer)]
    #[expected_failure(abort_code = 3, location = re0_anchor::anchor)]
    fun rejects_a_subject_type_that_only_looks_right(signer: &signer) {
        anchor::submit_batch(signer, 1, string::utf8(b"Version"), ROOT, 1_767_225_600);
    }

    #[test(signer = @anchor_signer)]
    #[expected_failure(abort_code = 4, location = re0_anchor::anchor)]
    fun rejects_leaf_schema_version_zero(signer: &signer) {
        anchor::submit_batch(signer, 0, string::utf8(b"version"), ROOT, 1_767_225_600);
    }

    #[test(signer = @anchor_signer)]
    #[expected_failure(abort_code = 5, location = re0_anchor::anchor)]
    fun rejects_a_missing_window_end(signer: &signer) {
        anchor::submit_batch(signer, 1, string::utf8(b"version"), ROOT, 0);
    }
}
