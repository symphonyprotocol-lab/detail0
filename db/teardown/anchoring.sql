-- Removes anchoring's schema. Deliberately NOT in db/migrations/meta/_journal.json.
--
-- Anchoring is a side system (aptos-anchoring-proposal.md 4.1) and this is the
-- database half of taking it out. It is written and reviewed in advance so that
-- removing the feature is a decision rather than a piece of work; nothing runs
-- it until someone asks for it.
--
-- **This destroys every Merkle proof.** The BatchAnchored events stay on chain
-- and stay true, but the paths that connect a version to a root live only here.
-- After this, nobody -- including us -- can produce a proof for anything that
-- was anchored, and the roots on chain become numbers with nothing to check
-- against. If the intent is to stop anchoring rather than to erase what was
-- anchored, unset the APTOS_* variables instead: the workflow then finds itself
-- unconfigured and skips, and the proofs keep working.
--
-- The tables were created in 0000_init.sql, which cannot be edited after the
-- fact, so a fresh `npm run db:migrate` recreates them. To make the removal
-- permanent, copy this file into db/migrations as the next number and add its
-- entry to the journal -- then it applies everywhere, once, like any other.
DROP TABLE IF EXISTS "anchor_leaf";
DROP TABLE IF EXISTS "anchor_batch";
DROP TYPE IF EXISTS "anchor_batch_status";
DROP TYPE IF EXISTS "anchor_subject_type";
