export type JournalVerificationCode = "journal-unbalanced" | "journal-account-currency" | "journal-fx" | "journal-postings" | "journal-amount" | "journal-opening-balance";

export type BookFinding =
  | { severity: "error"; code: JournalVerificationCode; entryId: string; date: string; description: string | null; message: string; lineId?: string }
  | { severity: "warning"; code: "journal-legacy-precision"; entryId: string; date: string; description: string | null; message: string; lineId: string }
  | { severity: "error"; code: "checkpoint-balance"; checkpointId: string; accountId: string; date: string;
      expected: number; actual: number; currency: string; message: string }
  | { severity: "error"; code: "checkpoint-precision"; checkpointId: string; accountId: string; date: string; message: string }
  | { severity: "warning"; code: "checkpoint-legacy-precision"; checkpointId: string; accountId: string; date: string; message: string }
  | { severity: "warning"; code: "checkpoint-adjustment-ambiguous"; checkpointId: string; accountId: string; date: string; message: string }
  | { severity: "warning"; code: "checkpoint-adjustment"; checkpointId: string; accountId: string; date: string;
      journalEntryId: string; amount: number; unadjustedBalance: number; currency: string; message: string }
  | { severity: "error"; code: "checkpoint-adjustment-link"; checkpointId: string; accountId: string;
      date: string; journalEntryId: string; message: string }
  | { severity: "error"; code: "investment-inconsistent"; accountId: string; message: string }
  | { severity: "warning"; code: "investment-legacy"; accountId: string; message: string }
  | { severity: "warning"; code: "valuation-price"; accountId: string; date: string; message: string }
  | { severity: "warning"; code: "valuation-fx"; accountId: string; date: string; message: string };

export type BookVerificationReport = { findings: BookFinding[] };
