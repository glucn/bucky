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
2. **Map Fields**
   - System fields: date, postingDate, amount, credit, debit, description, toAccountId.
   - Suggested mappings are shown but must be explicitly applied.
3. **Preview**
   - Full preview table is read-only with file-duplicate flags.
4. **Confirm & Import**
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
- Service returns `potential_duplicate` unless `forceDuplicate` is used.
- Preview flags duplicates within the CSV file using date + amount + description.
- Confirm step provides a batch choice to import or skip file duplicates.

## MVP Design Decisions

- **Description optional**: validation should not require description.
- **To Account mapping**: only honored when the user maps a column to `toAccountId`.
- **No original account name storage**: samples do not provide a reliable account name; skip metadata storage for MVP.
- **Import session persistence**: UI-only session, no database record.
- **Counter-account fallback**: use existing `Uncategorized Income/Expense` categories for MVP.
- **Category creation confirmation**: importing with new category names requires explicit confirmation.

## UX Notes

- Mapping step is mapping-only; preview is a separate read-only step.
- Preview step is read-only; edits happen after import.
- Duplicate candidates are flagged as file duplicates in preview.
- Confirm step requires explicit choice for how to handle file duplicates.
- Import summary includes skipped rows and reasons.
- Keep CSV size target to ~5k rows for MVP responsiveness.
- Amount parsing tolerates currency symbols and parentheses for negatives.

## Data Model

- No schema changes for MVP.
- Journal entries created with two lines:
  - Primary account line.
  - Counter-account line (mapped or uncategorized category).

## Test Strategy

### Service Tests

- Import date parsing (existing coverage in `src/services/database.import.test.ts`).
- Posting date must be >= transaction date (existing coverage).
- Duplicate detection flags strict duplicates and allows explicit overrides.
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
