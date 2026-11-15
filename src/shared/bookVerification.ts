export type JournalVerificationCode = "journal-unbalanced" | "journal-account-currency" | "journal-fx" | "journal-postings" | "journal-amount";

export type BookFinding =
  | { severity: "error"; code: JournalVerificationCode; entryId: string; date: string; description: string | null; message: string; lineId?: string }
  | { severity: "error"; code: "checkpoint-balance"; checkpointId: string; accountId: string; date: string;
      expected: number; actual: number; currency: string; message: string }
  | { severity: "error"; code: "investment-inconsistent"; accountId: string; message: string }
  | { severity: "warning"; code: "investment-legacy"; accountId: string; message: string };

export type BookVerificationReport = { findings: BookFinding[] };
