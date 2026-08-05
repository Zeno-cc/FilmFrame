# Browser And Physical-Device Release Checks

> Release line: FilmFrame v1.3. This runbook records compatibility and privacy evidence without storing user data or credentials.

## Evidence Boundary

Automated Chromium, Firefox, and desktop WebKit checks are repository gates. They do not replace physical iPhone Safari and Android Chrome evidence. Both physical records must pass before the `v1.3.0` tag is authorized.

Never store an invitation code, Cookie, Access JWT, administrator identity, photo, EXIF payload, rendered output, or raw network capture in Git. Record only the release candidate revision, device/browser versions, UTC time, pass/fail outcomes, and redacted failure notes.

## Automated Desktop Gate

```bash
npx playwright install chromium firefox webkit
npx playwright test --project=chromium
npx playwright test tests/e2e/browser-compatibility.spec.ts \
  --project=firefox --project=webkit
```

Chromium runs the complete regression suite. Firefox and WebKit run only the focused compatibility journey. Either the Worker path or the documented main-thread fallback is acceptable, but output currentness, local-only photo handling, rotation, navigation, and download readiness must remain intact.

## Physical Smoke Journey

Run the same journey once on an actual iPhone using Safari and once on an actual Android device using Chrome:

1. Open the production HTTPS URL in a fresh private tab and redeem a temporary invitation.
2. Select one local JPEG or PNG and confirm the contact sheet appears.
3. Process the photo with a registered real-135 stock.
4. Open preview, switch between original and processed output, rotate once, and apply the result.
5. Navigate away and back, then confirm the selected preview mode and current artifact remain correct.
6. Download the current single-image result and confirm the file opens locally.
7. Add at least one more local photo and complete either multi-image export or film-strip export.
8. Revoke the temporary invitation or its device session after evidence is recorded.

## Privacy Check

Use the browser network inspector when available, or route the device through a controlled local proxy owned by the operator. Filter requests during photo selection, processing, preview, rotation, and export.

Pass only when user photo bytes, EXIF data, Blob URLs, Canvas data, and rendered output never leave the device. Same-origin application assets, `/auth/refresh`, and `/api/runtime-config` are expected; the runtime-config response must contain only the effective Canvas budget.

Do not commit raw HAR files or screenshots. Summarize the observed request classes in the redacted evidence template.

## Bounded Memory Stress Protocol

Use non-sensitive fixtures that may be deleted after the run. Do not create a 700 MiB Canvas merely to prove the configured constant.

| Case | Representative input | Expected result |
| --- | --- | --- |
| Baseline single | About 12 MP | Process, preview, rotate, and download without stale output |
| High resolution | Largest practical local fixture below documented source limits | Warning or successful render without silent crash; record the first pressure signal |
| Multi-image | At least 8 mixed-orientation photos | Admission appears before work when needed; stop preserves completed artifacts |
| Film strip | At least 5 included photos | Exact strip estimate is checked before Canvas allocation; current result downloads |
| Configured block | Temporarily use a controlled lower budget such as 128 MiB | Above-budget single or strip work is blocked before renderer allocation |

For every case record the configured Canvas budget, fixture dimensions and count, whether Worker or main-thread fallback was observed, the first warning/block/failure point, and whether the existing completed artifact remained usable. File byte size, decoded source estimate, working set, strip Canvas, and ZIP input must be recorded as separate concepts.

## Release Decision

Copy [mobile-smoke-evidence-template.md](mobile-smoke-evidence-template.md) for each physical device. The release candidate is not tag-ready until both records are complete and passing. A failed step requires a linked issue or task and a rerun on the affected physical device.
