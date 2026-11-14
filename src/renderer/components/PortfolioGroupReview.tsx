import React, { useEffect, useRef, useState } from "react";

export type PortfolioReviewCandidate = { id: string; name: string; accounts: Array<{ id: string; name: string; currency: string; isArchived: boolean }> };
export default function PortfolioGroupReview({ candidates, onConfirmed }: { candidates: PortfolioReviewCandidate[]; onConfirmed: () => Promise<void> }) {
  const [selected, setSelected] = useState(""), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const group = candidates.find((candidate) => candidate.id === selected);
  const save = async () => {
    if (!group || !confirmed || busy) return;
    const token = generation.current; setBusy(true); setError("");
    try {
      const result = await window.electron.ipcRenderer.invoke("confirm-investment-portfolio", { groupId: group.id, expectedAccountIds: group.accounts.map((account) => account.id) });
      if (token !== generation.current) return;
      if (!result.success) throw new Error(result.error || "Unable to confirm portfolio");
      await onConfirmed();
    } catch (failure) { if (token === generation.current) setError(failure instanceof Error ? failure.message : "Unable to confirm portfolio"); }
    finally { if (token === generation.current) setBusy(false); }
  };
  return <details className="bg-white rounded-lg shadow p-6" data-testid="portfolio-group-review">
    <summary className="cursor-pointer font-medium">Use an existing account group as a portfolio</summary>
    <p className="text-sm text-gray-600 my-3">Choose this for an existing broker group. Its listed asset accounts, including archived accounts, will be treated as portfolio cash. Balances and transactions stay unchanged.</p>
    <label htmlFor="portfolio-review-group" className="block text-sm mb-1">Existing account group</label>
    <select id="portfolio-review-group" value={selected} disabled={busy} className="border rounded p-2" onChange={(event) => { setSelected(event.target.value); setConfirmed(false); setError(""); }}>
      <option value="">Select group...</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
    </select>
    {group ? <div className="mt-3 space-y-3">
      <ul>{group.accounts.map((account) => <li key={account.id}>{account.name} · {account.currency}{account.isArchived ? " (archived)" : ""}</li>)}</ul>
      <label className="block text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /> <span>Use these accounts as portfolio cash</span></label>
      <button className="border rounded px-4 py-2 disabled:opacity-50" disabled={!confirmed || busy} onClick={() => void save()}>{busy ? "Confirming…" : "Use as investment portfolio"}</button>
    </div> : null}
    {error ? <p role="alert" className="text-red-700 mt-3">{error}</p> : null}
  </details>;
}
