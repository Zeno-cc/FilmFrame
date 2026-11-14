# Implementation plan

- [x] Export both Portra 800 push variants from the pinned spektrafilm revision in isolated Python; verify source/filter/array/reference identities and independent hole-density residuals.
- [x] Register only accepted push resources; add display, picker, physical capability, edge, persistence and production Worker/main tests.
- [x] Trace and implement the source-backed monochrome/Multigrade path; add Acros II and migrate HP5, Tri-X and T-Max 100 only with their own references and edge evidence.
- [x] Trace and implement the positive develop/scan path for Provia 100F, Velvia 100, Ektachrome 100 and Kodachrome 64; do not route through negative/paper printing.
- [x] Implement and validate CineStill no-rem-jet/back-reflection separately, or retain its explicit blocked status if the source model cannot be faithfully bounded.
- [x] Update the 34-entry map, provenance, credits and unresolved distribution inventory. Keep unavailable stocks and unsupported physical routes explicit. License texts ship as real production assets; generic compatibility edges do not borrow branded scans.
- [x] Run focused numerical/unit tests, `npm run check`, provenance checks, complete Playwright regression and real supported-stock/edge matrices; obtain independent `trellis-check` review. Final evidence: 288 unit tests, 77 production workflows, 11 development-only diagnostics, three browser engines and 7 provenance tests passed. Follow-up review closed Vision3 branded-edge reuse, license URLs, 1x1 CineStill, duplicate frame numbers and programmatic sprocket requests.
- [x] Close Pro 400H's upstream density, CPU/WebGL2, real Worker/forced-main and disposal acceptance without inventing a residual gate or claiming a measured X-Tra-derived 135 edge. Final 2026-11-14 evidence: 289 unit tests, 78 production workflows, 12 development-only diagnostics including two five-frame strip reruns, Firefox/WebKit workflows and 7 provenance checks passed. The five-frame diagnostic's 60-second test limit was corrected to the production 180-second limit and both angle variants then passed with unchanged pixel assertions.

## Validation

```bash
/tmp/filmframe-spectral-python-20261111/bin/python -I scripts/spectral/export_stock_pair_resources.py \
  --upstream /tmp/filmframe-spektrafilm-source/spektrafilm-3bb2c2d2801ff68b92019cf1dbcbb133d60832bc \
  --resources /tmp/filmframe-portra-push-export-20261111/resources \
  --report /tmp/filmframe-portra-push-export-20261111/report.json \
  --compatibility-setup "$PWD/services/spectral/resources/portra-setup.json"
npm run test:spectral-stocks
npm run check
npm run test:provenance && npm run verify:provenance
npm run test:e2e
git diff --check
```

Generated candidate artifacts remain in the owned temporary output until their identities, references and physical residuals pass. Existing working-tree changes are preserved. No destructive cleanup, commit, push or release is authorized by this checklist.

## Review gates

1. Exporter success alone is not runtime acceptance.
2. Registry addition alone is not physical or native-parity acceptance.
3. Geometry compatibility is not spectral development; a measured/approximate edge label must match evidence.
4. Technical tests do not resolve distribution rights.
5. A failed independent family implementation remains blocked rather than being approximated with a different family.
