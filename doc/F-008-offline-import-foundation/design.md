# Design: Offline Import Foundation (F-008)

## Architecture Overview

- **UI**: `src/renderer/components/ImportTransactionsWizard.tsx`
- **IPC**: `import-transactions` in `src/main/index.ts`
- **Service**: `databaseService.createJournalEntry` in `src/services/database.ts`
- **Parsing**: PapaParse in the renderer for CSV ingestion

## Current Workflow (Code-Based)

1. **Upload**
   - CSV parsing is deferred until the user clicks Next.
   - Supports header and no-header CSVs; auto-generates headers when missing.
2. **Map & Preview**
   - System fields: date, postingDate, amount, credit, debit, description, toAccountId.
   - Auto-map headers by substring matching.
   - Preview computed from mapped rows; amounts can be derived from credit/debit or a single amount column.
3. **Confirm & Import**
   - Renderer sends `importPreview` to IPC.
   - IPC processes each transaction and returns import summary plus details.

## Data Flow

- Renderer builds a normalized preview row with:
  - `date`, `postingDate`, `amount`, `description`, `toAccountId`.
  - `fromAccountId` is set to the primary account.
- IPC import handler:
  - Ensures default accounts exist.
  - Uses `Uncategorized Income/Expense` for missing counter-accounts.
  - Auto-creates a category if `toAccountId` is a category name instead of an ID.
  - Calls `databaseService.createJournalEntry` for persistence.
- Service layer:
  - Validates transaction/posting date formats.
  - Rejects posting date earlier than transaction date.
  - Performs duplicate detection for imports.

## Duplicate Detection

- Implemented in `createJournalEntry`.
- Strict match: transaction date + description + from/to accounts + amounts + currency.
- Skips duplicates unless `forceDuplicate` is used.

## MVP Design Decisions

- **Description optional**: validation should not require description.
- **To Account mapping**: only honored when the user maps a column to `toAccountId`.
- **No original account name storage**: samples do not provide a reliable account name; skip metadata storage for MVP.
- **Import session persistence**: UI-only session, no database record.
- **Counter-account fallback**: use existing `Uncategorized Income/Expense` categories for MVP.

## UX Notes

- Preview should allow inline edits for:
  - Date, Amount, Description, Category, Counter-account.
- Duplicate candidates should be flagged in preview (pre-import warning).
- Keep CSV size target to ~5k rows for MVP responsiveness.

## Data Model

- No schema changes for MVP.
- Journal entries created with two lines:
  - Primary account line.
  - Counter-account line (mapped or uncategorized category).

## Test Strategy

### Service Tests

- Import date parsing (existing coverage in `src/services/database.import.test.ts`).
- Posting date must be >= transaction date (existing coverage).
- Duplicate detection should skip strict duplicates and allow non-matches.
- Credit/debit mapping results in correct amount sign.
- Missing counter-account uses `Uncategorized Income/Expense` categories.

### Renderer Tests (Optional)

- Mapping validation allows missing description.
- Preview shows derived amount and mapped fields.
- Duplicate rows are flagged prior to import.

## Known Gaps (Follow-Up)

- Placeholder account as a dedicated system account (post-MVP).
- Original counter-account metadata storage (post-MVP).
- Persisted import session history/log.
- Saved mappings/templates.
