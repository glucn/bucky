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

## Harness and contract alignment

- Keep test harness contracts in sync with runtime IPC/preload contracts; adding a new required bridge method can surface as unrelated E2E or integration failures.

## Validation standard for flaky tests

- Do not trust a single green run.
- Use repeat runs before closing the task, e.g.:
  - `npx playwright test tests/e2e/import-headered.spec.ts --repeat-each=3`

## Operational hygiene

- Before Playwright runs, check port `3000` usage to avoid stale servers causing false failures.
- Keep local DB artifacts (`dev.db`, `test.db`) untracked.
- If a run stalls, clear stale `webpack` on port `3000` and rerun.
