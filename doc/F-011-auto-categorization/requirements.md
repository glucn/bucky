# Requirements: Auto-Categorization (F-011)

## Summary

Add transparent, rule-based auto-categorization for CSV import sessions.
F-011 should improve import speed and consistency while keeping user control, by auto-applying high-confidence exact matches during import and learning new rules from confirmed F-010 cleanup actions.

## Goals

- Reduce manual categorization work during imports.
- Keep categorization decisions transparent and reviewable.
- Learn from confirmed cleanup outcomes to improve future suggestions.
- Keep F-011 scoped to import workflow MVP (not full app-wide smart categorization).

## User Stories

- As a user, I can import transactions and have obvious category matches applied automatically.
- As a user, less-certain matches remain safe and can be confirmed in cleanup workflow.
- As a user, I can see import outcomes by match type (exact vs keyword) in summary counts.
- As a user, my confirmed cleanup reassignments improve future import suggestions.
- As a user, I can review and maintain learned auto-categorization rules from a lightweight settings page.

## Functional Requirements

- **Scope**
  - F-011 applies to import workflow only (F-008 import path).
  - F-011 does not apply to manual Add/Edit transaction flow in MVP.
  - F-011 complements F-010 cleanup but does not replace cleanup flow.

- **Rule matching strategy**
  - Support hybrid matching:
    - Exact normalized description match.
    - Keyword/contains match.
  - Matching input is description only.
  - Normalization in MVP is limited to case-insensitive and whitespace-normalized matching.
  - Do not handle punctuation normalization in MVP.
  - Do not handle diacritics normalization in MVP.
  - Store normalized pattern for matching in MVP.
  - Keyword matching uses plain substring contains on normalized text.
  - Keyword rule pattern must be at least 3 characters.

- **Apply behavior**
  - Exact matches are auto-applied during import.
  - Exact auto-apply is always enabled in MVP (no per-import opt-out toggle).
  - Keyword matches are suggestions only in MVP and are not auto-applied during import.
  - No silent auto-apply for keyword-based suggestions.

- **Suggestion transparency**
  - Import summary should provide aggregate counts by match outcome.
  - MVP does not require per-row/per-rule transparency in import summary.

- **Rule target constraints**
  - Auto-categorization targets category accounts only.
  - User-account transfer targets are out of scope for F-011 MVP.

- **Rule creation and updates**
  - Create/update rules from confirmed F-010 cleanup reassignment actions.
  - "Confirmed" means user explicitly applies reassignment in cleanup mode.
  - Do not learn from import-step manual confirmation in MVP.
  - Do not learn from unrelated manual Add/Edit transaction actions in MVP.

- **Conflict resolution**
  - If multiple rules match, priority is:
    1. Most specific match type/strength (exact before keyword).
    2. More specific pattern (longer normalized pattern wins for keyword rules).
    3. Most recently confirmed rule.

- **Import flow integration**
  - Integrate into existing F-008 mapping/preview/confirm pipeline.
  - Preserve current import step ergonomics (no major expansion of crowded Step 3/4 UI in MVP).
  - Keyword suggestions do not require new interactive confirmation controls in import steps for MVP.
  - Import summary should reflect how many rows were:
    - Auto-applied by exact rule.
    - Matched by keyword suggestion (not auto-applied).
    - Left uncategorized.

- **Rule management UI (lightweight MVP)**
  - Provide a lightweight rules page at `Settings > Auto-Categorization`.
  - Show a single list with pattern search and default sort by `Last Updated` descending.
  - Do not add pagination, custom sort controls, or additional filters in MVP.
  - Show learned rules with at least these columns:
    - pattern
    - match type
    - target category
    - last updated timestamp
    - status (`Valid` or `Invalid target`)
  - Support editing existing learned rules with these editable fields:
    - pattern
    - match type (`Exact` or `Keyword`)
    - target category
  - Rule edit uses a simple modal.
  - Edit save is immediate when valid (no preview/test step).
  - Pattern normalization happens silently on save.
  - Duplicate validation must block save when `(normalized pattern + match type)` duplicates an existing rule.
  - Rule changes from edit apply immediately to future imports.
  - Target category selection in edit must include active categories only.
  - Support deleting existing rules with explicit confirmation.
  - Rule deletion is hard delete in MVP.
  - Delete confirmation uses a standard confirm dialog.
  - There is no enabled/disabled rule state in MVP.
  - Rules with unavailable target categories remain in the list with `Invalid target` status.
  - Invalid-target rules are silently ignored during import in MVP.
  - Do not provide manual new-rule creation in MVP; rules are still bootstrapped from F-010 confirmed cleanup actions.

## Non-Functional Requirements

- **Transparency and trust**
  - Every automated decision must be explainable in UI.
  - Users must have a clear override path before final commit.

- **Safety**
  - No destructive action and no hidden reassignment.
  - Fallback to `Uncategorized Income/Expense` remains available when no rule is confirmed.

- **Performance**
  - Matching should remain responsive for typical import batches (up to about 5k rows from F-008 context).

- **Determinism**
  - Given same rule set and same import rows, suggestions should be reproducible.

- **Testability**
  - Add stable test hooks for import summary outcome counts.
  - Add stable test hooks for rules list rows, edit action, save action, and delete confirmation action.

## Dependencies and Relationships

- Depends on F-008 import workflow and preview/confirm steps.
- Depends on F-010 cleanup workflow as the MVP learning/confirmation source for new rules.
- Enables future enhancements in Phase 2 ("smarter categorization and confidence controls") without requiring schema redesign.

## Out of Scope (F-011 MVP)

- App-wide categorization for manual Add/Edit transaction flows.
- Auto-categorization to user account transfer destinations.
- Confidence scoring models beyond exact/keyword tiers.
- ML/AI classification, embeddings, or external categorization services.
- Manual priority ordering UI for rules.
- Manual creation of brand-new rules from the rules page.
- Enabled/disabled rule state.
- Learning from non-import transaction edits.

## Bootstrap Behavior (No Existing Rules)

- When no rules exist, import falls back to existing F-008 behavior (including uncategorized fallback).
- User reassigns uncategorized transactions in F-010 cleanup mode.
- Those confirmed cleanup actions create the initial rules used by future F-011 import runs.

## Examples

- **Example 1: first rule bootstrap from cleanup**
  - Import row: description `COFFEE BEAN VANCOUVER BC`, no matching rule.
  - Import result: row lands in `Uncategorized Expense`.
  - User action in F-010: reassigns to category `Dining`.
  - Learning result: create rule from confirmed cleanup action (for example, exact description -> `Dining`).

- **Example 2: exact match auto-apply on next import**
  - Existing rule: exact normalized `coffee bean vancouver bc` -> `Dining`.
  - New import row: description `COFFEE BEAN VANCOUVER BC`.
  - Import behavior: category auto-applied to `Dining`.
  - Import summary increments the exact auto-applied count.

- **Example 3: keyword suggestion only (not auto-applied)**
  - Existing rule: keyword `coffee bean` -> `Dining`.
  - New import row: description `COFFEE BEAN DT VANCOUVER`.
  - Import behavior: do not auto-apply; count as keyword match in import summary.
  - If user does not confirm via cleanup later, row remains uncategorized.

- **Example 4: multiple matches with priority**
  - Existing rules:
    - exact `uber trip` -> `Transport`
    - keyword `uber` -> `Travel`
  - New import row: description `UBER TRIP`.
  - Import behavior: choose exact rule (`Transport`) because exact outranks keyword.
  - Tie-breaker behavior: if two exact rules are equally specific, use the most recently confirmed rule.
