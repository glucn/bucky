# Product Backlog

This file tracks deferred product improvements that are intentionally out of current MVP scope.

## How To Use

- Add one entry per idea using the template below.
- Keep context focused on user problem and why now/why later.
- Link to related feature docs so future implementation has enough history.

### Entry Template

- **ID**: BL-XXX
- **Title**:
- **Status**: planned | in-progress | done | dropped
- **Priority**: low | medium | high
- **Related Docs**:
- **Context (What / Why)**:
- **Proposed UX / Behavior**:
- **Scope Notes**:
- **Open Questions**:

---

## BL-001 - Apply Newly Learned Rule To Remaining Cleanup Rows

- **ID**: BL-001
- **Title**: Optional bulk-apply of newly learned rule in F-010 cleanup session
- **Status**: planned
- **Priority**: medium
- **Related Docs**: `doc/F-010-placeholder-cleanup/requirements.md`, `doc/F-011-auto-categorization/requirements.md`
- **Context (What / Why)**:
  - Current F-011 learning model creates/updates rules from confirmed F-010 cleanup reassignment actions.
  - Today, when a user reassigns one uncategorized transaction, that learned rule is saved for future imports only.
  - It does not automatically apply to other currently visible uncategorized rows in the same cleanup session.
  - This can feel repetitive when many rows share the same description pattern.
- **Proposed UX / Behavior**:
  - After a cleanup reassignment creates/updates a rule, offer an explicit one-time action such as:
    - "Apply this rule to matching uncategorized rows in current view"
  - Action should be opt-in and confirmable (no silent bulk reassignment).
- **Scope Notes**:
  - Keep this as a follow-up to avoid adding complexity to F-010/F-011 MVP.
  - Must preserve accounting safeguards and row-level auditability.
- **Open Questions**:
  - Should apply scope be current filtered view only, account-wide, or date-range-bound?
  - Should preview of affected row count be mandatory before apply?

## BL-002 - Post-Import Review For Exact Auto-Applied Matches

- **ID**: BL-002
- **Title**: Add quick review/reject path for exact auto-applied import categorizations
- **Status**: planned
- **Priority**: medium
- **Related Docs**: `doc/F-011-auto-categorization/requirements.md`, `doc/F-008-offline-import-foundation/requirements.md`
- **Context (What / Why)**:
  - F-011 MVP auto-applies exact matches during import and keeps import UI lightweight.
  - Current import summary is aggregate-count based and does not provide an immediate per-row reject path before commit.
  - If an exact rule is wrong, users currently correct it later via F-010 cleanup/edit and rule management.
  - A focused post-import review could improve trust and reduce correction effort.
- **Proposed UX / Behavior**:
  - Provide a quick filter/view after import for "exact auto-applied" transactions.
  - Let users rapidly inspect and correct mismatches without hunting through all transactions.
  - Corrections should optionally feed rule updates (subject to final scope decision).
- **Scope Notes**:
  - Keep import steps (especially Step 3/4) uncluttered; place this review outside crowded import confirmation UX.
  - Maintain transparent distinction between auto-applied vs manually categorized outcomes.
- **Open Questions**:
  - Should review happen immediately after import completion or as a persistent filter in transactions?
  - Should corrections in this review path update rules automatically or require explicit confirmation?

## BL-003 - Manual Rule Creation In Settings

- **ID**: BL-003
- **Title**: Allow manual creation of new auto-categorization rules in settings
- **Status**: planned
- **Priority**: medium
- **Related Docs**: `doc/F-011-auto-categorization/requirements.md`, `doc/F-011-auto-categorization/design.md`
- **Context (What / Why)**:
  - F-011 MVP only creates rules from confirmed F-010 cleanup reassignment actions.
  - Users who want to pre-seed rules before the next import cannot do so directly.
  - Manual creation can reduce first-import friction and speed up onboarding to rule-based categorization.
- **Proposed UX / Behavior**:
  - Add a "New Rule" action in `Settings > Auto-Categorization`.
  - Support entering pattern, match type, and target category.
  - Reuse existing validation rules (normalized duplicate check, keyword min length, active category target).
- **Scope Notes**:
  - Keep consistent with existing edit modal patterns where possible.
  - Consider auditability of manually-created vs learned rules.
- **Open Questions**:
  - Should manually-created rules require a separate status/label (e.g., source = manual/learned)?
  - Should manual create support bulk import from CSV later?

## BL-004 - Enable/Disable Rule State

- **ID**: BL-004
- **Title**: Add rule enable/disable state for temporary suppression
- **Status**: planned
- **Priority**: medium
- **Related Docs**: `doc/F-011-auto-categorization/requirements.md`, `doc/F-011-auto-categorization/design.md`
- **Context (What / Why)**:
  - F-011 MVP supports hard delete but no temporary off-switch.
  - Users may want to pause a rule during noisy periods without losing its configuration/history.
  - Enable/disable is safer than delete when diagnosis or temporary behavior changes are needed.
- **Proposed UX / Behavior**:
  - Add enabled status per rule.
  - Disabled rules remain visible in settings but are skipped in matching.
  - Support quick toggle in list and/or edit modal.
- **Scope Notes**:
  - Requires schema + matching logic updates and list filters/status handling.
  - Should keep existing deterministic priority behavior among enabled rules.
- **Open Questions**:
  - Should disabled rules affect summary counts (e.g., "rules skipped")?
  - Should disable reason/notes be tracked?

## BL-005 - Rule Priority Management UI

- **ID**: BL-005
- **Title**: Add manual priority controls for overlapping rules
- **Status**: planned
- **Priority**: low
- **Related Docs**: `doc/F-011-auto-categorization/requirements.md`, `doc/F-011-auto-categorization/design.md`
- **Context (What / Why)**:
  - F-011 MVP tie-breakers are automatic (exact > longer pattern > newest).
  - Advanced users may need explicit control when domain heuristics do not match expected outcomes.
  - Manual priority can reduce surprises for complex keyword sets.
- **Proposed UX / Behavior**:
  - Add explicit priority field/order for rules.
  - Allow reordering in settings and use manual priority before existing tie-breakers.
- **Scope Notes**:
  - Increases operational complexity and needs clear conflict resolution docs.
  - Should include guardrails to avoid contradictory priority setups.
- **Open Questions**:
  - Should priority be global or scoped by match type?
  - Should learned-rule updates preserve manual priority or reset it?

## BL-006 - App-Wide Rule Application Beyond Import

- **ID**: BL-006
- **Title**: Apply categorization rules in non-import transaction flows
- **Status**: planned
- **Priority**: medium
- **Related Docs**: `doc/F-011-auto-categorization/requirements.md`, `doc/F-010-placeholder-cleanup/requirements.md`
- **Context (What / Why)**:
  - F-011 MVP scope is import-only.
  - Manual Add/Edit flows currently do not benefit from rule suggestions, creating behavior inconsistency.
  - Extending rule use can improve categorization consistency across the app.
- **Proposed UX / Behavior**:
  - Add optional rule suggestions in manual Add/Edit transaction paths.
  - Preserve user control and avoid silent overrides.
  - Keep import-specific auto-apply policy isolated unless explicitly expanded.
- **Scope Notes**:
  - Requires careful UX alignment with existing modals and validation logic.
  - Must avoid surprising edits to existing transaction workflows.
- **Open Questions**:
  - Should non-import flows be suggest-only or support auto-apply in limited cases?
  - Should confirmation in these flows also feed rule learning?

## BL-007 - Transfer Target Rule Support

- **ID**: BL-007
- **Title**: Support rules that target user accounts for transfer-like transactions
- **Status**: planned
- **Priority**: low
- **Related Docs**: `doc/F-011-auto-categorization/requirements.md`, `doc/F-010-placeholder-cleanup/requirements.md`
- **Context (What / Why)**:
  - F-011 MVP targets category accounts only.
  - Some recurring descriptions represent transfers and could benefit from user-account targets.
  - Without this support, transfer-heavy users may do repetitive manual cleanup.
- **Proposed UX / Behavior**:
  - Allow rule targets to include user accounts with safety checks.
  - Clearly distinguish category vs transfer destination outcomes.
- **Scope Notes**:
  - Must preserve double-entry correctness and prevent invalid self-pairing cases.
  - Requires clarity in UI labels and rule-management filters.
- **Open Questions**:
  - Should transfer-target rules be separate match type/policy from category rules?
  - How should priority resolve when both category and transfer rules match?

## BL-008 - Advanced Text Normalization For Matching

- **ID**: BL-008
- **Title**: Improve rule matching with punctuation/diacritics normalization
- **Status**: planned
- **Priority**: low
- **Related Docs**: `doc/F-011-auto-categorization/requirements.md`, `doc/F-011-auto-categorization/design.md`
- **Context (What / Why)**:
  - F-011 MVP normalization is intentionally limited (case + whitespace only).
  - Real bank descriptions often vary by punctuation, separators, and diacritics.
  - Better normalization can improve match rates without adding many duplicate rules.
- **Proposed UX / Behavior**:
  - Normalize punctuation and optionally diacritics before matching.
  - Keep behavior deterministic and testable.
- **Scope Notes**:
  - Requires migration strategy if normalized keys become materially different.
  - Must avoid unexpected over-matching from aggressive normalization.
- **Open Questions**:
  - Should punctuation/diacritics normalization be global defaults or configurable?
  - How should existing stored normalized patterns be backfilled safely?
