import React, { useEffect, useState } from "react";
import type { NewHoldingInput } from "../../shared/securityHolding";

type CashAccount = { id: string; name: string; currency: string; isArchived?: boolean };
const field = "w-full rounded border border-gray-300 px-3 py-2";

export function NewHoldingModal({ portfolioId, onClose, onCreated }: {
  portfolioId: string; onClose: () => void; onCreated: (accountId: string) => void;
}) {
  const [cash, setCash] = useState<CashAccount[]>([]), [cashId, setCashId] = useState("");
  const [ticker, setTicker] = useState(""), [market, setMarket] = useState("");
  const [method, setMethod] = useState<NewHoldingInput["costBasisMethod"] | "">("");
  const [securityType, setSecurityType] = useState("stock");
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const selected = cash.find((a) => a.id === cashId);
  useEffect(() => {
    let active = true;
    setLoading(true); setCash([]); setCashId(""); setError("");
    void (async () => {
      try {
        const result = await window.electron.ipcRenderer.invoke("get-portfolio-accounts", portfolioId);
        if (!active) return;
        if (!result.success) throw new Error(result.error || "Unable to load cash accounts");
        const accounts: CashAccount[] = (result.accounts.tradeCashAccounts || []).filter((a: CashAccount) => !a.isArchived);
        setCash(accounts); setCashId(accounts.length === 1 ? accounts[0].id : "");
      } catch (error) { if (active) setError(error instanceof Error ? error.message : "Unable to load cash accounts"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [portfolioId]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (loading || saving || !selected || !method || !ticker.trim() || !market.trim()) return;
    setSaving(true); setError("");
    try {
      const result = await window.electron.ipcRenderer.invoke("create-market-holding", {
        portfolioId, tickerSymbol: ticker.trim(), market: market.trim(), quoteCurrency: selected.currency,
        tradeCashAccountId: selected.id, costBasisMethod: method, securityType,
      } satisfies NewHoldingInput);
      if (!result.success) throw new Error(result.error || "Unable to create holding");
      onCreated(result.account.id);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to create holding"); }
    finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500 bg-opacity-75">
    <div role="dialog" aria-modal="true" aria-labelledby="new-holding-title" data-testid="new-holding-dialog" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 mx-4 space-y-4">
      <div className="sticky top-0 z-10 bg-white pb-2 space-y-3">
        <h3 id="new-holding-title" className="text-xl font-semibold">Add holding</h3>
        {error ? <p role="alert" className="text-red-700">{error}</p> : null}
      </div>
      <p className="text-sm text-gray-600">Create an empty holding, then record its purchases. Use the exact ticker and market identifier from your price source. Each listing keeps its own currency and cost basis.</p>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={loading || saving} className="space-y-4">
          <label className="block">Ticker<input className={field} value={ticker} onChange={(e) => setTicker(e.target.value)} maxLength={64} required /></label>
          <label className="block">Market<input className={field} value={market} onChange={(e) => setMarket(e.target.value)} maxLength={128} required /></label>
          <div><label htmlFor="new-holding-cash" className="block">Cash account</label><select id="new-holding-cash" className={field} value={cashId} onChange={(e) => setCashId(e.target.value)} required>
            <option value="">Select cash account</option>{cash.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
          </select></div>
          <p className="text-sm text-gray-600">Quote currency: {selected?.currency || "Select a cash account"}. The market's quote currency must match. Add another currency from the portfolio if needed.</p>
          <div><label htmlFor="new-holding-method" className="block">Cost basis method</label><select id="new-holding-method" className={field} value={method} onChange={(e) => setMethod(e.target.value as typeof method)} required>
            <option value="">Select cost basis method</option><option value="FIFO">FIFO</option><option value="AVERAGE_COST">Average cost</option>
          </select></div>
          <div><label htmlFor="new-holding-type" className="block">Security type</label><select id="new-holding-type" className={field} value={securityType} onChange={(e) => setSecurityType(e.target.value)}>
            <option value="stock">Stock</option><option value="etf">ETF</option><option value="mutual_fund">Mutual fund</option><option value="bond">Bond</option><option value="other">Other</option>
          </select></div>
        </fieldset>
        {loading ? <p role="status">Loading cash accounts…</p> : cash.length === 0 ? <p>Add an active trade cash account before creating a holding.</p> : null}
        <div className="flex justify-end gap-3">
          <button type="button" className="rounded border px-4 py-2" disabled={saving} onClick={onClose}>Cancel</button>
          <button className="rounded bg-primary-600 text-white px-4 py-2 disabled:opacity-50" disabled={loading || saving || !selected || !method || !ticker.trim() || !market.trim()}>{saving ? "Creating…" : "Create holding"}</button>
        </div>
      </form>
    </div>
  </div>;
}
