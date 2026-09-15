#!/usr/bin/env bash
#
# Publish or upgrade move/re0_anchor as an Aptos Code Object.
#
# Development and CI only -- localnet and testnet. Mainnet is refused on
# purpose: aptos-anchoring-proposal.md 4.11 gates the first production publish
# behind eight checks, and 4.6 keeps the Upgrade Authority offline, so a mainnet
# publish is a deliberate manual act with a key that never touches this repo,
# never a script anyone can run.
#
#   scripts/deploy-anchor.sh --profile re0-anchor-testnet
#   scripts/deploy-anchor.sh --profile re0-anchor-testnet --object-address 0x...
#
# With --object-address it upgrades that Code Object in place. That only works
# on objects published before the policy became `immutable` (Move.toml, and
# proposal 0.2); anything published since refuses every upgrade, and the way to
# change the module -- or the signer address compiled into it -- is to publish a
# new object and anchor afresh.
set -euo pipefail

cd "$(dirname "$0")/.."

PROFILE=""
OBJECT_ADDRESS=""
ANCHOR_SIGNER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --object-address) OBJECT_ADDRESS="$2"; shift 2 ;;
    --anchor-signer) ANCHOR_SIGNER="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$PROFILE" ]]; then
  echo "usage: scripts/deploy-anchor.sh --profile <aptos-cli-profile> [--object-address 0x...] [--anchor-signer 0x...]" >&2
  exit 2
fi

network="$(aptos config show-profiles --profile "$PROFILE" 2>/dev/null \
  | python3 -c 'import json,sys; p=json.load(sys.stdin)["Result"]; print(next(iter(p.values()))["network"])')"

if [[ "$(printf '%s' "$network" | tr '[:upper:]' '[:lower:]')" == "mainnet" ]]; then
  echo "refusing to publish to mainnet from a script." >&2
  echo "see aptos-anchoring-proposal.md 4.11 (gates) and 4.6 (Upgrade Authority)." >&2
  exit 1
fi

# The Anchor Signer is bound at compile time (Move.toml), not stored on chain.
# On localnet and testnet the profile account is also the submitter; on mainnet
# it is the address derived from the cloud KMS public key, and the two are
# never the same account.
if [[ -z "$ANCHOR_SIGNER" ]]; then
  ANCHOR_SIGNER="$(aptos config show-profiles --profile "$PROFILE" \
    | python3 -c 'import json,sys; p=json.load(sys.stdin)["Result"]; print("0x"+next(iter(p.values()))["account"])')"
fi

echo "network:       $network"
echo "anchor_signer: $ANCHOR_SIGNER"

aptos move test --package-dir move/re0_anchor

if [[ -n "$OBJECT_ADDRESS" ]]; then
  echo "upgrading code object $OBJECT_ADDRESS"
  aptos move upgrade-object \
    --package-dir move/re0_anchor \
    --address-name re0_anchor \
    --object-address "$OBJECT_ADDRESS" \
    --named-addresses "anchor_signer=$ANCHOR_SIGNER" \
    --profile "$PROFILE" \
    --assume-yes
else
  echo "publishing a new code object"
  aptos move deploy-object \
    --package-dir move/re0_anchor \
    --address-name re0_anchor \
    --named-addresses "anchor_signer=$ANCHOR_SIGNER" \
    --profile "$PROFILE" \
    --assume-yes
fi
