# Research: Plain-Text Accounting and Lessons for Bucky

**Research date:** 2026-08-30
**Status:** Decision input and backlog proposal

## Executive Summary

Plain-text accounting (PTA) records double-entry books in human-readable files and derives reports
from those records. Ledger, hledger, and Beancount are the best-known examples. Their durable value
does not come from text alone; it comes from a set of reinforcing properties:

- the journal is inspectable and portable;
- financial quantities have explicit commodity and precision semantics;
- every posting is subject to mechanical accounting checks;
- reports are deterministic projections of the same journal;
- balance assertions make external facts testable;
- ordinary version-control tools can expose every edit;
- import, query, and export workflows are composable.

Bucky should adopt these properties without replacing SQLite with editable text files. SQLite and
Prisma are better suited to Bucky's desktop UI, stable entity IDs, atomic edits, enrichment data,
investment lots, and future security model. The recommended direction is therefore:

> Keep the database canonical, make the books independently verifiable, and provide a deterministic
> human-readable ledger projection that users can keep without Bucky.

The immediate high-priority proposals are:

1. migrate financial quantities away from binary floating point and define commodity precision;
2. add a whole-book integrity verifier with actionable diagnostics;
3. add deterministic hledger-compatible journal export plus a lossless Bucky manifest;
4. add transaction provenance and immutable revision history.

These are recorded as BL-031 through BL-034 in `doc/backlog.md`.

## 1. What Plain-Text Accounting Is

PTA is double-entry bookkeeping in which transactions, account declarations, prices, assertions,
and related directives are stored in a textual journal. A parser validates that journal and
constructs reports or interactive views from it.

A minimal journal entry looks like:

```text
2026-08-30 Grocery Store
    Expenses:Groceries       42.18 CAD
    Assets:Bank:Checking    -42.18 CAD
```

This representation is simultaneously:

- a double-entry transaction;
- a human-readable explanation of value movement;
- input for automated validation;
- input for balances, registers, and financial statements;
- a stable artifact that can be searched, diffed, backed up, or converted.

The [Plain Text Accounting portal](https://plaintextaccounting.org/) identifies Ledger, hledger,
and Beancount as the major PTA families and catalogs the surrounding import, editor, reporting, and
automation ecosystem.

## 2. Representative Systems

| System | Core approach | Particularly relevant ideas for Bucky |
| --- | --- | --- |
| [Ledger](https://ledger-cli.org/) | A read-only command-line reporting engine over Ledger journal files. | Clear separation between source data and report/query operations; flexible posting queries; readable full-journal output. |
| [hledger](https://hledger.org/) | A Ledger-inspired journal with CLI, terminal, web, import, and reporting tools. | Strong validation, balance assertions, idempotent CSV import, deterministic reports, multiple export formats, and explicit emphasis on auditability and portability. |
| [Beancount](https://beancount.github.io/docs/) | A more structured accounting language with dated directives, declared accounts/commodities, inventories, plugins, and query tooling. | Explicit lifecycle directives, balance assertions, investment inventory semantics, configurable precision/tolerance, and structured extensibility. |

### 2.1 Ledger

Ledger pioneered the widely used journal syntax. Its command-line tool treats files as inputs and
does not modify them while reporting. Queries can select postings by account and other criteria,
and the `print` command can reproduce full matching transactions. This is a useful architectural
lesson: report and export paths should be pure projections rather than hidden mutation paths.

Sources:

- [Ledger project](https://ledger-cli.org/)
- [Ledger command reference](https://ledger-cli.org/doc/ledger.1.html)

### 2.2 hledger

hledger extends the Ledger model with multiple interfaces, CSV rules, import state, assertions,
multi-period reports, and outputs including text, HTML, CSV, JSON, SQL, and Beancount. Its import
workflow supports a dry run and tracks prior input so repeated imports can avoid duplicates.

The most applicable hledger concepts are:

- **Validation before reporting:** generated or handwritten entries pass through the same balancing
  and normalization pipeline.
- **Balance assertions:** an independently observed account balance can be checked against the
  journal at a particular date.
- **Deterministic output:** accounting results should not depend on incidental input ordering.
- **Portable projections:** full journal entries and report data can be exported in several forms.
- **Read-mostly safety:** operations that alter the journal are distinct from ordinary reporting.

Sources:

- [Why hledger](https://hledger.org/why.html)
- [hledger journal format](https://hledger.org/SPEC-journal.html)
- [hledger CSV import tutorial](https://hledger.org/import-csv.html)
- [Exporting from hledger](https://hledger.org/export.html)

### 2.3 Beancount

Beancount models accounting as a language of dated directives. In addition to transactions, its
files can declare when accounts open or close, define commodities and prices, attach documents, and
assert balances. Its documentation treats precision, tolerances, inventories, and query semantics
as first-class design subjects.

Beancount is especially instructive for investments: a monetary amount, a security quantity, a
price, a cost basis, and a tolerance are different concepts and should not share an accidental
one-size-fits-all precision rule.

Sources:

- [Beancount project](https://github.com/beancount/beancount)
- [Beancount user documentation](https://beancount.github.io/docs/)
- [Getting started and balance assertions](https://beancount.github.io/docs/getting_started_with_beancount/)

## 3. What PTA Gets Right

### 3.1 Exact, explicit quantities

PTA tools treat values as quantities of named commodities. They distinguish units, prices, costs,
and display precision, and they define when a small imbalance is acceptable. This prevents binary
floating-point artifacts from silently becoming accounting facts.

### 3.2 The journal is explainable

A transaction can be understood without reconstructing UI state. Both sides of the movement are
visible together, and generated reports can be traced back to individual postings.

### 3.3 Validation is a product capability

Balancing is not merely a write-time implementation detail. Users can run checks over the entire
book and receive precise locations and explanations for failures.

### 3.4 External facts become assertions

A bank statement balance is modeled as a claim to verify, not automatically as a transaction.
When the calculated ledger differs from the statement, the discrepancy remains visible until the
user explicitly explains or adjusts it.

### 3.5 Reports are reproducible

The same journal, query, valuation rules, and as-of context should always produce the same result.
This encourages pure report pipelines, stable sorting, explicit fallback policy, and source-of-truth
discipline.

### 3.6 Data ownership is concrete

The user can retain a compact, documented representation of the books independently of the
application. Version control adds reviewable history, but portability does not require Git; a
readable journal is already a durable escape hatch.

### 3.7 Automation composes with normal workflows

CSV conversion, validation, queries, and exports use the same journal model. Automated imports do
not create a second, weaker kind of accounting record.

## 4. Where a Text-Canonical Model Would Hurt Bucky

Text should not become Bucky's operational source of truth at this stage.

- **Stable identity:** account, transaction, line, lot, rule, and provider records need durable IDs
  that survive renames and reordering.
- **Atomic editing:** a GUI action may update several related records and must either fully succeed
  or fully fail.
- **Concurrent and partial writes:** external editors introduce parsing failures, merge conflicts,
  and ambiguous recovery.
- **Rich application state:** import mappings, duplicate fingerprints, liability terms, enrichment
  runs, prices, FX observations, and attachments are not naturally one journal.
- **Query responsiveness:** interactive pages benefit from indexed database queries.
- **Security:** a future encryption model is easier to reason about for a controlled database than
  an arbitrary directory of journal fragments and attachments.
- **Schema evolution:** structured migrations are safer than heuristically rewriting user-edited
  source files.

Supporting direct, bidirectional journal editing would also create a difficult promise: every Bucky
feature would need a lossless textual representation, and every valid external edit would need a
safe mapping back into Bucky's identity and lifecycle model.

## 5. Bucky's Current Fit and Gaps

### Existing strengths

- `JournalEntry` and `JournalLine` already provide a double-entry-oriented core.
- SQLite gives Bucky stable IDs, relations, transactions, and indexed reads.
- CSV import already has mapping, preview, duplicate handling, and Unassigned fallback.
- Checkpoints provide the beginnings of statement reconciliation.
- Reporting and valuation work increasingly documents canonical sources such as `FxDailyRate`.
- Liability profiles demonstrate immutable, effective-dated snapshot history.

### Material gaps

#### Binary floating-point storage

`Float` is used for journal amounts, checkpoint balances, investment quantities, prices, FX
rates, and other financial values. Rounding at UI or service boundaries cannot guarantee exact
book invariants. This should be addressed before promising authoritative external exports.

#### No whole-book verification command

Write paths contain local checks, but users and support tooling cannot run one comprehensive audit
covering entries, transfers, lots, checkpoints, prices, and FX requirements.

#### No durable portable ledger

CSV is useful for tables but is not a faithful double-entry archive. Bucky does not currently
produce a deterministic journal that another accounting engine can validate.

#### Limited transaction provenance and history

Journal entries have creation and update timestamps, but not a complete revision trail. Import
origin, cleanup actions, categorization decisions, and old posting states cannot be reconstructed
reliably after edits.

#### Checkpoints mix assertion and correction concerns

A statement balance, a detected variance, and a balancing adjustment should be separate concepts.
Keeping them distinct would make reconciliation more transparent and auditable.

## 6. Recommended Product Direction

### Canonical model

- SQLite remains the canonical operational store.
- Domain services remain the only mutation path.
- Text formats are deterministic projections and import candidates, not a second live source of
  truth.

### Portable representation

Provide two complementary exports:

1. **hledger-compatible journal:** readable and usable by existing PTA tooling for common accounts,
   transactions, currencies, prices, costs, and assertions.
2. **Lossless Bucky archive/manifest:** versioned JSON metadata containing stable IDs, import
   provenance, liability data, investment details, source mappings, and any fields that cannot be
   represented faithfully in the journal.

The journal should include Bucky IDs as metadata or comments so exported entries remain traceable.
Output order should be stable, for example:

1. declarations and commodity settings;
2. accounts ordered by stable normalized name and ID;
3. prices and FX observations ordered by date and pair;
4. entries ordered by accounting date, display order, and ID;
5. postings ordered by a documented deterministic rule.

Export must report unsupported or lossy mappings. It must never silently omit a posting, lot, or
valuation input.

### Readable UI projection

After export foundations are reliable, add a read-only Journal view for a transaction or filtered
set. It should use the same serializer as export so the explanation users see is the artifact they
can retain.

### Import posture

Do not initially promise round-trip synchronization. A later hledger/Beancount import should use
Bucky's existing preview-and-commit pattern, validate all entries, resolve accounts and currencies,
and present conflicts before changing the database.

## 7. Prioritized Backlog Proposal

### P0: Exact Decimal Quantities and Commodity Precision — BL-031

Define storage, arithmetic, rounding, comparison, and display precision separately. Cover money,
security units, prices, costs, rates, ratios, and tolerances. This is a prerequisite for dependable
book verification and external journal compatibility.

### P0: Whole-Book Integrity Verification — BL-032

Add a read-only verifier that checks every accounting and valuation invariant and returns
actionable, record-linked diagnostics. It should be callable from tests, support tooling, and an
eventual user-facing “Verify books” action.

### P1: Deterministic Portable Ledger Export — BL-033

Export an hledger-compatible journal plus a versioned Bucky manifest. Prove that the export is
stable and that supported balances reproduce Bucky's native-currency results.

### P1: Transaction Provenance and Immutable Revisions — BL-034

Track where transactions came from and preserve before/after posting snapshots for edits,
reclassifications, reversals, and reconciliation adjustments. This brings database-backed books
the auditability that PTA users obtain from version control.

### Follow-up candidates

- Assertion-based reconciliation and immutable reconciliation history.
- Read-only Journal view using the export serializer.
- Saved composable transaction/report queries.
- Previewed hledger or Beancount import.
- Optional integrity report bundled with backups.

## 8. Suggested Sequencing

1. Specify decimal and commodity precision policy.
2. Migrate storage and arithmetic with reconciliation tests.
3. Build the pure integrity-verification service.
4. Define the portable ledger contract and lossiness policy.
5. Implement deterministic journal and manifest export.
6. Add transaction provenance and revision records.
7. Build Journal UI and assertion-based reconciliation on those foundations.

This sequence intentionally makes correctness testable before adding a portability promise.

## 9. Decision

Bucky should learn from PTA, but should not become a text-file editor.

The strategic target is:

> A friendly database-backed application whose books are exact, independently checkable,
> explainable as journal postings, and exportable into a durable open representation.

That positioning preserves Bucky's approachable desktop experience while adopting the strongest
trust and ownership properties demonstrated by Ledger, hledger, and Beancount.
