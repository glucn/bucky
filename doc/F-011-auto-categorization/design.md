# Design: Auto-Categorization (F-011)

## Summary

F-011 adds deterministic, rule-based categorization for import workflow, while keeping the current import UI lightweight. Exact rules auto-apply during import; keyword rules are matched for summary reporting only and remain uncategorized unless handled later in F-010 cleanup. New rules are learned from confirmed F-010 cleanup reassignments, and users can manage learned rules in a lightweight settings page.

This design intentionally avoids model-driven confidence, advanced parsing, and heavy import-step UI changes. It focuses on predictable behavior, simple explainability, and low operational risk.

## Architecture Overview

- **Persistence**: New Prisma model for auto-categorization rules.
- **Domain service**: New `autoCategorizationService` for normalization, matching, learning, and CRUD validation.
- **Import integration**: Import handler consults rules before fallback uncategorized logic.
- **Learning hook**: F-010 cleanup reassignment path updates/creates rules.
- **Management UI**: New route `Settings > Auto-Categorization` with list/search/edit/delete.

### Proposed file touchpoints

- `prisma/schema.prisma` (new rule model)
- `src/services/autoCategorizationService.ts` (new)
- `src/services/database.ts` (cleanup learning hook + import integration wiring where needed)
- `src/main/index.ts` (new IPC handlers for rule list/update/delete)
- `src/preload.ts`, `src/renderer/types/electron.d.ts` (IPC surface)
- `src/renderer/pages/AutoCategorizationSettings.tsx` (new)
- `src/renderer/App.tsx` (new route)
- `src/renderer/components/Navbar.tsx` (Settings navigation entry)
- `src/renderer/components/ImportTransactionsWizard.tsx` (import summary count display)

## Data Model

Add a dedicated rule table.

### Prisma model (conceptual)

- `AutoCategorizationRule`
  - `id: String @id @default(uuid())`
  - `normalizedPattern: String`
  - `matchType: String` (`exact` | `keyword`)
  - `targetCategoryAccountId: String`
  - `lastConfirmedAt: DateTime?`
  - `createdAt: DateTime @default(now())`
  - `updatedAt: DateTime @updatedAt`

### Constraints and indexes

- Unique on `(normalizedPattern, matchType)` to enforce duplicate-rule blocking.
- Index on `(matchType, normalizedPattern)` for fast matching.
- FK to `Account.id` for target category relation.

### Invalid target semantics

- A rule is `Invalid target` if target category is missing or archived.
- Rule remains persisted; import silently ignores it.

## Matching Engine

Implement in `autoCategorizationService` as pure, deterministic logic.

### Normalization (MVP)

- Lowercase
- Trim + collapse whitespace
- No punctuation normalization
- No diacritics normalization

Matching input is **description only**.

### Match logic

1. Compute `normalizedDescription`.
2. Find exact candidates where `matchType=exact` and `normalizedPattern === normalizedDescription`.
3. Find keyword candidates where `matchType=keyword` and `normalizedDescription.includes(normalizedPattern)`.
4. Exclude rules with invalid targets.
5. Resolve winner with priority:
   1) exact over keyword,
   2) longer normalized pattern,
   3) most recent `lastConfirmedAt` (fallback `updatedAt`).

### Apply behavior

- Exact winner: auto-apply target category.
- Keyword winner: do not auto-apply; count as keyword match in import summary.

## Import Flow Integration

Integrate in existing F-008 import pipeline without adding new row-level controls in Step 3/4.

### Per-row precedence

1. If import row already has explicit mapped `toAccountId`, keep existing F-008 behavior.
2. Else run F-011 matching.
   - exact winner -> assign `toAccountId` to matched category
   - keyword winner -> keep uncategorized fallback path
3. If still unresolved -> fallback to `Uncategorized Income/Expense`.

### Summary counters

Add aggregate counters to import result payload:

- `exactAutoAppliedCount`
- `keywordMatchedCount`
- `uncategorizedCount`

No per-rule/per-row transparency is required in import summary for MVP.

## Learning From F-010 Cleanup

Learning occurs only from explicit F-010 cleanup reassignment actions.

### Trigger conditions

- Action originates from cleanup flow (placeholder row reassignment).
- Transaction description exists after normalization.
- New target is an active category account.

### Learning behavior

- Build `normalizedPattern` from transaction description.
- Upsert an **exact** rule by `(normalizedPattern, matchType=exact)`.
  - create if missing,
  - update target category and `lastConfirmedAt` if existing.
- Update `updatedAt`/`lastConfirmedAt` so `Last Updated` and priority are deterministic.

Keyword rules are edited/maintained via settings page, not auto-learned in MVP.

## Rule Management UI (Settings)

Create `Settings > Auto-Categorization` page at `/settings/auto-categorization`.

### List behavior

- Single list (no pagination)
- Default sort: `Last Updated` descending
- Pattern-only search
- Columns:
  - Pattern
  - Match Type
  - Target Category
  - Last Updated
  - Status (`Valid` / `Invalid target`)

### Edit behavior

- Edit opens a simple modal.
- Editable fields:
  - pattern
  - match type
  - target category (active categories only)
- Save immediately when valid.
- Normalize pattern silently on save.
- Block duplicates for `(normalizedPattern, matchType)`.
- Changes apply to future imports immediately.

### Delete behavior

- Hard delete only.
- Standard confirm dialog.

No manual create-rule action in MVP.

## IPC/API Contract

Add renderer-facing methods:

- `getAutoCategorizationRules(): { success, data[] }`
- `updateAutoCategorizationRule(input): { success, data | error }`
- `deleteAutoCategorizationRule(ruleId): { success | error }`

Import handler response extends with summary counters above.

All validation enforced server-side (renderer mirrors for fast feedback only).

## Validation and Error Handling

- Pattern must be non-empty after normalization.
- Keyword pattern minimum length: 3.
- Match type must be `exact` or `keyword`.
- Target category must exist and be active.
- Duplicate `(normalizedPattern, matchType)` blocks save with clear error.
- Import path swallows invalid-target rule usage (silent ignore by requirement).

## Performance Considerations

- For typical import sizes (~5k rows), avoid repeated DB calls per row:
  - load valid rules once per import batch,
  - match in-memory.
- Prefer pre-split exact and keyword collections for O(1)/linear matching.
- Keep UI list filtering client-side (pattern-only) for lightweight page performance.

## Testing Strategy

### Unit tests

- Normalization behavior (case + whitespace only)
- Exact/keyword matching
- Conflict resolution priority (exact > longer pattern > newest)
- Keyword min-length validation

### Service/integration tests

- Import integration:
  - exact auto-apply when no explicit `toAccountId`
  - keyword counted but not auto-applied
  - explicit mapped `toAccountId` precedence
  - invalid-target rules ignored silently
- Learning integration:
  - cleanup reassignment creates exact rule
  - repeated confirmations update existing rule

### Renderer tests

- Settings page list rendering, default sort, pattern search
- Edit modal validations and duplicate error handling
- Delete confirmation flow
- Import summary renders new aggregate counters

### E2E tests

- Bootstrap via cleanup reassignment, then verify exact auto-apply on next import
- Rules page edit/delete modifies subsequent import behavior
- Invalid target rule shown with status and ignored by import behavior

## Rollout Notes

- Requires Prisma migration and test DB schema sync.
- Backward compatible with existing imports (rules optional).
- If no rules exist, behavior remains F-008 + F-010 baseline.

## Explicit MVP Boundaries

- No manual rule creation.
- No enable/disable flag.
- No manual priority ordering.
- No punctuation/diacritics normalization.
- No app-wide rule application outside import flow.
