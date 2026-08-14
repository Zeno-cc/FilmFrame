# Implementation plan

1. Add a small origin-normalization helper in the access service and update
   `POST /auth/redeem` to compare against `config.publicOrigin`.
2. Add route tests covering canonical/equivalent same-origin values,
   missing-origin behavior, and all rejected origin classes; assert rejected
   requests do not consume the nonce or mutate invitations.
3. Update the tracked public OpenResty redemption location with explicit
   `Origin` and HTTPS protocol forwarding. Keep all other vhosts unchanged.
4. Run the access test suite, access type-check/build, deployment contract
   checks, Compose validation, and `git diff --check`.
5. Build and publish a release through the existing updater, test the active
   OpenResty configuration, and run public GET/POST probes using a fake code
   (no real invitation consumption). Verify a real user retry can proceed to
   the normal redemption result.
6. If any production probe fails, restore the prior release/configuration and
   report the exact failing boundary before retrying.
