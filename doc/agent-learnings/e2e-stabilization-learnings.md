# E2E stabilization learnings (Electron + Playwright)

This note captures practical findings from stabilizing flaky E2E runs, especially `tests/e2e/import-headered.spec.ts`.

## What failed in practice

- Flaky runs were not always caused by business logic or selectors.
- A key failure signature was repeated reload behavior plus repeated 404s for preload hot-update assets like `main_window.<hash>.hot-update.json`.
- When that happened, button clicks timed out or tests stalled even though the UI looked mostly correct.

## High-signal diagnostics

- Add temporary Playwright debug listeners for:
  - `page.on("framenavigated")` to detect reload loops.
  - `page.on("response")` to log 404 URLs.
  - `page.on("pageerror")` and `page.on("console")` for runtime clues.
- If you see repeated 404s for `main_window.<hash>.hot-update.json`, treat this as test harness instability first.

## Stabilization approach that worked

- Keep Playwright `webServer` startup deterministic:
  - run DB sync (`e2e:db:push`),
  - run Electron-prep script (`e2e:electron:prepare`),
  - then start renderer server.
- Use `scripts/e2e-prepare-electron.js` to ensure required Electron bundles are present before tests begin.
- In that prepare step, derive the preload hot-update hash from `.webpack/renderer/main_window/preload.js` and create matching hot-update artifact files under `.webpack/renderer` when missing.

## Current implementation notes

- The original file-existence preparation check could accept an older packaged build. Preparation
  now waits for the `BUCKY_E2E_PREPARED` launch marker as well as complete bundle files.
- `BUCKY_DEV_PORT` is shared across runtime origin validation, Forge, Webpack and scenarios.
  Prep uses base port + 2/+3; the real server uses the base port. Sharing the port allowed
  Playwright to detect the temporary Forge server, start tests early and lose the renderer.
- `reuseExistingServer` is disabled. Keep unrelated listeners (including port 3000) untouched;
  select free ports instead. Owned preparation processes are stopped as a process group.
- Legacy tests that directly called `_invokeHandlers` with `{}` fail sender validation. Use
  the real renderer/preload bridge; never weaken production checks to accommodate the fixture.

- `scripts/e2e-prepare-electron.js`
  - launches prep with `PLAYWRIGHT_PREPARE_ONLY=1`,
  - waits for `.webpack/main/index.js` and `.webpack/renderer/main_window/preload.js`,
  - writes missing `main_window.<hash>.hot-update.{json,js}` files,
  - exits so Playwright can start renderer dev server.
- `src/main/index.ts`
  - short-circuits startup when `PLAYWRIGHT_PREPARE_ONLY=1`.
  - centralizes app shutdown via `before-quit` and disconnects DB before final exit.
- `tests/e2e/helpers/importFlow.ts`
  - forces `PLAYWRIGHT_PREPARE_ONLY=0` for real app launches during tests.

## Test helper hardening patterns

- Navigation helpers should retry short transient failures around `page.goto`/`waitForURL`.
- UI open actions in unstable environments should use retry loops with short waits.
- Keep screenshot capture best-effort (do not fail if page is already closed).
- Always close sqlite handles with awaited callbacks in helpers; un-awaited `db.close()` can leak resources and create cross-test flakiness.
- Keep helper cleanup scoped to the scenario that needs it; broad cleanup in shared helpers can silently break other specs.

## State isolation and assertions

- For import/idempotent workflows, prefer assertions that accept multiple valid outcomes (for example, imported rows vs. all rows skipped as duplicates) unless the test explicitly controls initial DB state.
- If a spec must verify a single path, reset or seed DB state inside that spec so prior tests cannot change expected behavior.
- When a full suite fails but single-spec reruns pass, suspect cross-spec state leakage before changing product logic.
- For async workflows, assert state transitions (for example, idle -> starting -> running/completed) instead of only final static UI text.
- When validating progress UIs, avoid asserting the first immediate snapshot after a click; poll/wait for the first refreshed snapshot to reduce false failures from transient placeholder values.

## Harness and contract alignment

- Keep test harness contracts in sync with runtime IPC/preload contracts; adding a new required bridge method can surface as unrelated E2E or integration failures.

## Coverage strategy for E2E

- Keep seed/test-hook scenarios, but pair them with at least one true user-flow E2E that triggers the real runtime path; hook-only coverage can miss integration wiring bugs.
- For features that call external providers/services, include at least one test that validates internal planning/selection logic independently from external response success.

## Validation standard for flaky tests

- Do not trust a single green run.
- Use repeat runs before closing the task, e.g.:
  - `npx playwright test tests/e2e/import-headered.spec.ts --repeat-each=3`

## Base-currency banner failure evidence

- A full-suite banner timeout recurred while waiting after saving a currency, before dismissal.
  The inspected Electron trace contained test API steps and source files but no DOM snapshots.
  A trace file alone therefore did not establish whether the setting was saved or the banner
  state was stale. The cause remains unproven.
- The banner scenarios now capture selected currency, save-button state, page text, backend
  impact/reconciliation state and a screenshot on failure, before closing the app. Assertions and
  timeouts remain unchanged. Inspect these artifacts before changing product behavior; an expected
  websocket connection attempt to the stopped preparation port is not evidence of a hot-update 404.

## Operational hygiene

- Before Playwright runs, check port `3000` usage to avoid stale servers causing false failures.

## Packaged quit while report reads are active

- Closing a completed investment import starts a portfolio refresh. Parallel report reads exposed
  a real driver shutdown race: disconnecting while interactive transactions were starting or
  rolling back could keep the packaged app from quitting within its existing five-second bound.
- `PrismaSession` now revokes access immediately, checks revocation before entering queued
  callbacks and drains owned interactive transaction promises before driver disconnect. Lazy
  requests and late results remain revoked; reopening stays blocked until closing settles.
- Keep the original quit assertion. Do not hide this failure by delaying the test's quit action,
  waiting for the page to finish every report, or increasing the shutdown timeout. Both original
  import/restart cases passed three repetitions after the lifecycle fix.
- Keep local DB artifacts (`dev.db`, `test.db`) untracked.
- If a run stalls, inspect its owned process/session first. Preserve unrelated listeners; select
  another free development port rather than killing an occupying process without confirmation.
