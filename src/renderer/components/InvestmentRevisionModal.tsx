import React, { useEffect, useState } from "react";
import type { RevisionDetail, RevisionEvent, RevisionSummary } from "../../shared/investmentRevision";
import { formatValuationAmount } from "../utils/valuationFormatting";

function RevisionSide({ title, event, empty }: { title: string; event: RevisionEvent | null; empty: string }) {
  if (!event) return <p>{empty}</p>;
  const money = (amount: number | null, currency = event.currency) => formatValuationAmount(amount, currency, { disambiguate: true });
  return <section className="space-y-1">
    <h4 className="font-semibold">{title}</h4>
    <p>{event.date} · {event.kind.replaceAll("_", " ")}</p>
    <p>Ending units {event.quantityAfter} · Ending basis {money(event.basisAfter)}</p>
    <p>Cash {money(event.cashAmount)}{event.realizedGain !== null && <> · Realized gain {money(event.realizedGain)}</>}</p>
    {event.journals.map((journal) => <div className="pt-2" key={journal.id}>
      <p>{journal.description || "Journal posting"}</p>
      <ul>{journal.lines.map((line) => <li key={line.id}>{line.account} · {money(line.amount, line.currency)}</li>)}</ul>
    </div>)}
  </section>;
}

type HistoryPage = { revisions: RevisionSummary[]; hasMore: boolean };

export default function InvestmentRevisionModal({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const [id, selectRevision] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryPage | null>(null);
  const [revision, setRevision] = useState<RevisionDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    const channel = id ? "read-investment-revision" : "list-investment-revisions";
    const input = id ? { accountId, revisionId: id } : { accountId, page };
    void window.electron.ipcRenderer.invoke(channel, input).then((result) => {
      if (!current) return;
      if (!result.success) throw new Error(result.error || "Unable to load investment history");
      if (id) setRevision(result.revision);
      else setHistory(result);
    }).catch((failure) => {
      if (current) setError(failure instanceof Error ? failure.message : "Unable to load investment history");
    });
    return () => { current = false; };
  }, [accountId, id, page]);

  function changePage(next: number) {
    setHistory(null);
    setError("");
    setPage(next);
  }

  function changeSelection(next: string | null) {
    setRevision(null);
    setError("");
    selectRevision(next);
  }

  return <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4">
    <div role="dialog" aria-modal="true" aria-label="Investment revision history" className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-auto space-y-4">
      <div className="flex justify-between gap-3">
        <h3 className="text-lg font-semibold">Investment revision history</h3>
        <button type="button" className="underline" onClick={onClose}>Close</button>
      </div>
      {id && <button type="button" className="underline" onClick={() => changeSelection(null)}>Back to revisions</button>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!error && !(id ? revision : history) && <p role="status">Loading investment history…</p>}
      {id && revision && <div className="space-y-3">
        <h4 className="font-semibold">{revision.action} · {revision.reason}</h4>
        {revision.changes.map(({ before, after }) => <div key={before?.id ?? after?.id} className="grid sm:grid-cols-2 gap-4 border-t pt-3">
          <RevisionSide title="Original" event={before} empty="No original — inserted" />
          <RevisionSide title="Replacement" event={after} empty="No replacement — voided" />
        </div>)}
      </div>}
      {!id && history && <>
        {history.revisions.length === 0 ? <p>No retained revisions for this holding.</p> :
          <ul className="space-y-2">{history.revisions.map((row) => <li key={row.id}>
            <button type="button" className="underline text-left" onClick={() => changeSelection(row.id)}>
              {new Date(row.createdAt).toLocaleString()} · {row.reason}
            </button>
          </li>)}</ul>}
        {(page > 0 || history.hasMore) && <nav aria-label="Revision pages" className="flex gap-4">
          <button type="button" disabled={page === 0} onClick={() => changePage(page - 1)}>Previous</button>
          <button type="button" disabled={!history.hasMore} onClick={() => changePage(page + 1)}>Next</button>
        </nav>}
      </>}
    </div>
  </div>;
}
