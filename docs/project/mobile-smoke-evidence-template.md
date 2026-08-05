# Physical Mobile Smoke Evidence

> Copy this template once for iPhone Safari and once for Android Chrome. Keep every field redacted and free of credentials or user content.

## Context

| Field | Value |
| --- | --- |
| Release candidate revision | `<40-character commit>` |
| Device model | `<model only>` |
| OS version | `<major.minor>` |
| Browser and version | `<name major.minor>` |
| Test time | `<UTC ISO-8601>` |
| Operator | `<non-identifying role or initials>` |
| Configured Canvas budget | `<128-2048 MiB>` |

## Smoke Results

| Step | Result | Redacted notes |
| --- | --- | --- |
| Invitation/session entry | PASS / FAIL | |
| Local photo selection | PASS / FAIL | |
| Registered real-135 processing | PASS / FAIL | |
| Original/processed preview | PASS / FAIL | |
| Rotation and apply | PASS / FAIL | |
| Cross-image navigation/currentness | PASS / FAIL | |
| Single-image download | PASS / FAIL | |
| Multi-image or strip export | PASS / FAIL | |
| Photo bytes remain local | PASS / FAIL | `<request classes only>` |

## Bounded Stress Results

| Case | Fixture dimensions/count | Worker or fallback | First warning/block/failure | Artifact preserved | Result |
| --- | --- | --- | --- | --- | --- |
| About 12 MP single | | | | YES / NO | PASS / FAIL |
| High-resolution single | | | | YES / NO | PASS / FAIL |
| Multi-image batch | | | | YES / NO | PASS / FAIL |
| Film strip | | | | YES / NO | PASS / FAIL |
| Controlled configured block | | | | YES / NO | PASS / FAIL |

## Decision

- Overall result: `PASS` / `FAIL`
- Follow-up issue or task: `<redacted reference or none>`
- Notes: `<no invitation, Cookie, JWT, identity, photo, EXIF, output, screenshot, or raw network data>`
