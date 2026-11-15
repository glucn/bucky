import React, { useState } from "react";
import type { BookFinding, BookVerificationReport } from "../../shared/bookVerification";
import { formatValuationAmount } from "../utils/valuationFormatting";

function FindingDetails({ finding }: { finding: BookFinding }) {
  if ("entryId" in finding) return <>
    <p>{finding.date}{finding.description && ` · ${finding.description}`}</p>
    <p>Journal entry {finding.entryId}{finding.lineId && ` · Posting ${finding.lineId}`}</p>
  </>;
  if (finding.code === "checkpoint-balance") return <>
    <p>{finding.date} · Checkpoint {finding.checkpointId}</p>
    <p>Recorded balance {formatValuationAmount(finding.expected, finding.currency, { disambiguate: true })}</p>
    <p>Journal balance {formatValuationAmount(finding.actual, finding.currency, { disambiguate: true })}</p>
    <p>Account {finding.accountId}</p>
  </>;
  if (finding.code === "checkpoint-adjustment") return <>
    <p>{finding.date} · Checkpoint {finding.checkpointId}</p>
    <p>Journal excluding this adjustment {formatValuationAmount(finding.unadjustedBalance, finding.currency, { disambiguate: true })}</p>
    <p>Adjustment {formatValuationAmount(finding.amount, finding.currency, { disambiguate: true })}</p>
    <p>Journal entry {finding.journalEntryId} · Account {finding.accountId}</p>
  </>;
  if (finding.code === "checkpoint-adjustment-link") {
    return <p>{finding.date} · Checkpoint {finding.checkpointId} · Journal entry {finding.journalEntryId}</p>;
  }
  if ("checkpointId" in finding) {
    return <p>{finding.date} · Checkpoint {finding.checkpointId} · Account {finding.accountId}</p>;
  }
  if (finding.code === "valuation-fx" || finding.code === "valuation-price") {
    return <p>{finding.date} · Account {finding.accountId}</p>;
  }
  return <p>Holding {finding.accountId}</p>;
}

function FindingList({ title, findings }: { title: string; findings: BookFinding[] }) {
  if (!findings.length) return null;
  return <section className="space-y-2">
    <h2 className="font-semibold">{title} ({findings.length})</h2>
    <ul className="space-y-2">
      {findings.map((finding) => {
        const record = "entryId" in finding ? finding.lineId ?? finding.entryId
          : "checkpointId" in finding ? finding.checkpointId : finding.accountId;
        return <li key={`${finding.code}-${record}`} className="rounded border border-gray-200 bg-white p-3 break-words">
          <p className="font-medium">{finding.message}</p>
          <div className="text-sm text-gray-600"><FindingDetails finding={finding} /></div>
        </li>;
      })}
    </ul>
  </section>;
}

export function BookVerification() {
  const [report, setReport] = useState<BookVerificationReport | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setReport(null);
    setError("");
    setRunning(true);
    try {
      setReport(await window.electron.ipcRenderer.invoke("verify-books"));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Book verification failed");
    } finally {
      setRunning(false);
    }
  }

  const issues = report?.findings.filter((finding) => finding.severity === "error") ?? [];
  const warnings = report?.findings.filter((finding) => finding.severity === "warning") ?? [];
  return <div className="max-w-3xl space-y-4">
    <h1 className="text-2xl font-bold text-gray-900">Verify books</h1>
    <p className="text-sm text-gray-600">Check journal postings, transfers, checkpoints, investment activity, and today’s valuation coverage. This check leaves your records intact.</p>
    <button type="button" disabled={running} onClick={() => void run()}
      className="rounded bg-primary-600 px-3 py-2 text-white hover:bg-primary-700 disabled:opacity-50">Run verification</button>
    {running && <p role="status">Checking your books…</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {report && <p role="status">{report.findings.length === 0
      ? "No issues found in the checks run."
      : `Verification complete. ${issues.length} ${issues.length === 1 ? "issue" : "issues"} and ${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}.`}</p>}
    <FindingList title="Issues" findings={issues} />
    <FindingList title="Warnings" findings={warnings} />
  </div>;
}
