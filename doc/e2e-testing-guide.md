# E2E Testing Guide

## Overview

Bucky uses Playwright for end-to-end testing of the Electron application. E2E tests verify complete user workflows from UI interaction to database persistence.

## Configuration

- **Config file**: `playwright.config.ts`
- **Test directory**: `tests/e2e/`
- **Test files**: `*.spec.ts`
- **Database**: E2E currently uses root `test.db` (via `schema.e2e.prisma`)
- **Webpack dev server**: Automatically started on port 3000
- **Electron prep**: `e2e:electron:prepare` runs before tests to stabilize preload artifacts

## Running Tests

```bash
# Run all E2E tests (headless)
npx playwright test

# Run with browser UI visible
npx playwright test --headed

# Run specific test file
npx playwright test tests/e2e/import-transactions.spec.ts

# Debug mode with browser dev tools
npx playwright test --debug
```

## Writing E2E Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';

test('feature description', async ({ page }) => {
  // Test implementation
});
```

### Key Patterns

1. **Window Detection**: Tests automatically find the main app window (not DevTools)
2. **Element Targeting**: Use `data-testid` attributes for reliable selection
3. **File Uploads**: Use `page.setInputFiles()` for CSV imports
4. **Navigation**: Wait for page elements before interaction
5. **Database State**: Tests start with clean test database

### Example: Import Wizard Test

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';

test('CSV import wizard completes successfully', async ({ page }) => {
  // Navigate to transactions page
  await page.getByTestId('transactions-page').waitFor();
  
  // Open import wizard
  await page.getByTestId('import-transactions-button').click();
  
  // Verify wizard opened
  await expect(page.getByTestId('import-wizard-title')).toBeVisible();
  
  // Upload CSV file
  const csvPath = path.join(__dirname, '../fixtures/test-data.csv');
  await page.setInputFiles('input[type="file"]', csvPath);
  
  // Wait for file processing
  await page.getByText('Next').click();
  
  // Verify mapping step
  await expect(page.getByText('Map & Preview')).toBeVisible();
  
  // Complete import
  await page.getByText('Import').click();
  
  // Verify success
  await expect(page.getByText('Import completed')).toBeVisible();
});
```

### Test Data Management

- **Fixtures**: Store test CSV files in `tests/fixtures/`
- **Database**: Each test starts with a clean test database
- **Seeding**: Add test accounts/data as needed in test setup

### Best Practices

1. **Use descriptive test names** that explain the user scenario
2. **Add data-testid attributes** to UI elements that need targeting
3. **Wait for elements** before interacting (`waitFor()`, `toBeVisible()`)
4. **Test complete workflows** rather than individual UI components
5. **Verify end state** (database changes, UI updates, navigation)

### Common Selectors

```typescript
// By test ID (preferred)
page.getByTestId('import-wizard-title')

// By text content
page.getByText('Import Transactions')

// By role and name
page.getByRole('button', { name: 'Next' })

// File input
page.locator('input[type="file"]')
```

### Debugging Tips

1. **Use --headed flag** to see browser during test execution
2. **Add screenshots** at key points: `await page.screenshot({ path: 'debug.png' })`
3. **Use --debug flag** to pause execution and inspect elements
4. **Check console logs** for JavaScript errors during test runs

### Common failure modes and quick fixes

1. **Run hangs before tests start**
   - Check port usage: `lsof -i :3000`
   - If a stale `webpack` process is holding the port, stop it and rerun.
2. **Import tests loop or stall intermittently**
   - Look for repeated 404s on `main_window.<hash>.hot-update.json` in debug logs.
   - Confirm prep runs: `npm run e2e:electron:prepare`.
3. **macOS "Electron quit unexpectedly" after run**
   - This was tied to unstable prep/shutdown behavior.
   - Pull latest `main` and rerun with `npx playwright test`.
4. **Need deeper context**
   - Read `doc/e2e-stabilization-learnings.md` before changing product code.

## Test Organization

### File Structure
```
tests/
├── e2e/
│   ├── import-transactions.spec.ts
│   ├── account-management.spec.ts
│   └── investment-tracking.spec.ts
├── fixtures/
│   ├── sample-transactions.csv
│   └── investment-data.csv
└── README.md
```

### Naming Conventions

- **Test files**: `feature-name.spec.ts`
- **Test descriptions**: User-focused scenarios
- **Test IDs**: Descriptive kebab-case (`import-wizard-title`)

## Integration with CI/CD

E2E tests can be integrated into CI pipelines:

```bash
# Install Playwright browsers in CI
npx playwright install

# Run tests in CI mode
npx playwright test --reporter=github
```
