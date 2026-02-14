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

## Test helper hardening patterns

- Navigation helpers should retry short transient failures around `page.goto`/`waitForURL`.
- UI open actions in unstable environments should use retry loops with short waits.
- Keep screenshot capture best-effort (do not fail if page is already closed).

## Validation standard for flaky tests

- Do not trust a single green run.
- Use repeat runs before closing the task, e.g.:
  - `npx playwright test tests/e2e/import-headered.spec.ts --repeat-each=3`

## Operational hygiene

- Before Playwright runs, check port `3000` usage to avoid stale servers causing false failures.
- Keep local DB artifacts (`dev.db`, `test.db`) untracked.
