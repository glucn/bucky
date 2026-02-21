# Learning Note: Source-of-Truth Guardrails

## Why this exists

A recurring failure mode in feature work is **design drift**: implementation and tests both pass, but both validate the wrong data source or contract.

The pattern is usually:

- design/spec defines a canonical source of truth,
- implementation reuses a legacy or convenient source,
- tests mirror implementation fixtures,
- regressions appear only with realistic data.

This note provides reusable guardrails for any feature, not just FX valuation.

## Reusable rules

1. **Pin the canonical source in code and docs**
   - For each critical output, document the single source of truth.
   - Treat alternate-source reads as regressions unless explicitly designed.

2. **Write contract tests against canonical data**
   - Seed test data in the canonical table/service, not convenience proxies.
   - Add at least one test proving behavior works when legacy proxy data is absent.

3. **Add anti-drift assertions**
   - Create one negative test per critical path that fails if deprecated/indirect sources are used.

4. **Map design statements to tests**
   - Convert each "must" requirement in the design doc into an explicit test name.
   - If a requirement has no test, treat it as uncovered scope.

## Implementation checklist (for future tasks)

1. Identify the output being computed (summary, report, status, etc.).
2. Identify canonical source-of-truth storage/service.
3. Verify implementation reads from that source.
4. Add tests for:
   - happy path with canonical source data,
   - fallback behavior (if defined),
   - canonical source present + legacy source absent.
5. Run focused suites and confirm no fixture accidentally depends on legacy data.

## Triage checklist for "data exists but output is unavailable"

1. Confirm configured context (environment, as-of date, base settings, filters).
2. Confirm canonical source has required rows for the scenario.
3. Confirm computation path reads canonical source (not proxy/derived source).
4. Confirm tests cover this exact shape of data.
5. Investigate rendering only after service-layer checks pass.

## Bucky example (FX valuation)

- Canonical source: `FxDailyRate`.
- Legacy/proxy source that should not drive valuation totals: `JournalEntry(type="currency_transfer")`.
- Relevant design reference: `doc/BL-019-base-currency-impact/design.md` section 5.3.

## Related files (example domain)

- `src/services/valuationConversionService.ts`
- `src/services/valuationConversionService.test.ts`
- `src/services/overviewService.ts`
- `src/services/investmentService.ts`
