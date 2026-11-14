import React, { useEffect, useRef, useState } from "react";
import { formatValuationAmount } from "../utils/valuationFormatting";
import type { TradeInsertion } from "../../shared/investmentReplay";

type Draft = { date: string; quantity: string; pricePerShare: string; fee: string };
type Trade = { activityId: string; kind: string; ticker: string; currency: string; date: string };
type Position = { quantity: number; costBasis: number };
type Change = { date: string; quantityAfter: number; basisAfter: number; cashAmount: number; realizedGain: number | null };
type Preview = { reviewToken: string; before: Position; after: Position; affected: Array<{ activityId: string | null; kind: string; before: Change | null; after: Change | null }> };
type Source = { accountId: string; entryId: string; insertion?: never } |
  { insertion: TradeInsertion & { ticker: string; currency: string; settlementName: string }; accountId?: never; entryId?: never };

export default function InvestmentCorrectionModal({ accountId, entryId, insertion, onCancel, onSaved }: Source & { onCancel: () => void; onSaved: () => void }) {
  const [trade, setTrade] = useState<Trade | null>(null), [draft, setDraft] = useState<Draft | null>(null);
  const [reason, setReason] = useState(""), [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [action, setAction] = useState<"correct" | "void">("correct");
  const voiding = action === "void";
  const generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current;
    setDraft(null); setTrade(null); setReason(""); setError(""); setPreview(null); setBusy(false); setAction("correct");
    if (insertion) return () => { generation.current++; };
    void window.electron.ipcRenderer.invoke("get-investment-trade-correction", { accountId, entryId }).then((result) => {
      if (token !== generation.current) return;
      if (!result.success) throw new Error(result.error || "Unable to load trade");
      const selected = result.trade;
      setTrade(selected);
      setDraft({ date: selected.date, quantity: String(selected.quantity), pricePerShare: String(selected.pricePerShare), fee: String(selected.fee) });
    }).catch((failure) => { if (token === generation.current) setError(failure instanceof Error ? failure.message : "Unable to load trade"); });
    return () => { generation.current++; };
  }, [accountId, entryId, insertion]);

  const run = async (save: boolean) => {
    if (busy || (!insertion && (!trade || !draft)) || (save && (!preview || !reason.trim()))) return;
    if (!insertion && !voiding && (!draft!.date || !draft!.quantity || !draft!.pricePerShare || !draft!.fee)) { setError("Enter the trade date, quantity, price and fee"); return; }
    const token = generation.current, reviewed = preview;
    const correction = insertion ?? (voiding ? { activityId: trade!.activityId, operation: "void" } :
      { activityId: trade!.activityId, date: draft!.date, quantity: Number(draft!.quantity), pricePerShare: Number(draft!.pricePerShare), fee: Number(draft!.fee) });
    setBusy(true); setError(""); setPreview(null);
    try {
      const result = save
        ? await window.electron.ipcRenderer.invoke("save-investment-trade-correction", { correction, reviewToken: reviewed!.reviewToken, reason })
        : await window.electron.ipcRenderer.invoke("preview-investment-trade-correction", correction);
      if (token !== generation.current) return;
      if (!result.success) throw new Error(result.error || "Unable to process correction");
      if (save) onSaved(); else setPreview(result.preview);
    } catch (failure) { if (token === generation.current) setError(failure instanceof Error ? failure.message : "Unable to process correction"); }
    finally { if (token === generation.current) setBusy(false); }
  };

  const money = (value: number | null) => formatValuationAmount(value, insertion?.currency || trade?.currency || "", { disambiguate: true });
  const change = (old: string | number, next: string | number) => `${old} → ${next}`;
  const title = insertion ? "Review backdated trade" : "Correct investment trade";
  return <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4">
    <form role="dialog" aria-modal="true" aria-label={title} className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-auto space-y-4"
      onSubmit={(event) => { event.preventDefault(); void run(false); }}>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p>Review the effect on later trades before saving. The original records and your reason will be retained.</p>
      {insertion ? <fieldset disabled={busy} className="space-y-3">
        <p>{insertion.ticker} · {insertion.kind === "buy" ? "Buy" : "Sell"} · {insertion.date} · {insertion.quantity} units at {money(insertion.pricePerShare)} · Fee {money(insertion.fee ?? 0)}</p>
        <p>Settlement: {insertion.settlementName}. The trade is inserted after other activity on the same date.</p>
        <label className="block">Insertion reason<textarea className="block w-full border rounded p-2" value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} /></label>
      </fieldset> : trade && draft ? <fieldset disabled={busy} className="space-y-3">
        <p>{trade.ticker} · {trade.kind === "buy" ? "Buy" : "Sell"} · {trade.currency}</p>
        <label htmlFor="investment-correction-action">Action</label> <select id="investment-correction-action" className="border rounded p-1" value={action} onChange={(event) => { setAction(event.target.value === "void" ? "void" : "correct"); setPreview(null); setReason(""); setError(""); }}>
          <option value="correct">Correct trade</option><option value="void">Void trade</option>
        </select>
        {voiding ? <p>Void the {trade.kind === "buy" ? "buy" : "sale"} of {trade.ticker} on {trade.date}. The original will remain in the audit trail.</p> : <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([["date", "Trade date"], ["quantity", "Quantity"], ["pricePerShare", `Price per share (${trade.currency})`], ["fee", `Fee (${trade.currency})`]] as const).map(([key, label]) =>
            <label key={key}>{label}<input className="w-full border rounded p-2" required type={key === "date" ? "date" : "number"} step={key === "fee" ? "0.01" : "any"} min={key === "date" ? undefined : "0"}
              value={draft[key]} onChange={(event) => { setDraft({ ...draft, [key]: event.target.value }); setPreview(null); setError(""); }} /></label>)}
        </div>}
        <label className="block">Correction reason<textarea className="block w-full border rounded p-2" value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} /></label>
      </fieldset> : !error ? <p role="status">Loading recorded trade…</p> : null}
      {preview ? <section aria-label="Correction impact" className="space-y-2">
        <p>Ending units: {change(preview.before.quantity, preview.after.quantity)}</p>
        <p>Ending basis: <span>{change(money(preview.before.costBasis), money(preview.after.costBasis))}</span></p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr>{["Activity", "Date", "Units after", "Basis after", "Cash", "Realized gain"].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead>
          <tbody>{preview.affected.map(({ activityId, kind, before, after }) => <tr className="border-t" key={activityId ?? "inserted"}>
            {(after && !before ? [`${kind} (will be inserted)`, after.date, after.quantityAfter, money(after.basisAfter), money(after.cashAmount), money(after.realizedGain)]
              : after && before ? [kind.replaceAll("_", " "), change(before.date, after.date), change(before.quantityAfter, after.quantityAfter), change(money(before.basisAfter), money(after.basisAfter)),
              change(money(before.cashAmount), money(after.cashAmount)), before.realizedGain === null && after.realizedGain === null ? "—" : change(money(before.realizedGain), money(after.realizedGain))]
              : before ? [`${kind} (will be voided)`, before.date, before.quantityAfter, money(before.basisAfter), money(before.cashAmount), money(before.realizedGain)] : []).map((value, index) => <td className="p-2" key={index}>{value}</td>)}
          </tr>)}</tbody>
        </table></div>
      </section> : null}
      {error ? <p role="alert" className="text-red-700">{error}</p> : null}
      {busy ? <p role="status">Checking investment history…</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" disabled={busy} className="border rounded px-3 py-2" onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={busy || (!draft && !insertion)} className="border rounded px-3 py-2 disabled:opacity-50">{insertion ? "Preview insertion" : voiding ? "Preview void" : "Preview correction"}</button>
        <button type="button" disabled={busy || !preview || !reason.trim()} className="border rounded px-3 py-2 disabled:opacity-50" onClick={() => void run(true)}>{insertion ? "Insert trade" : voiding ? "Void trade" : "Save correction"}</button>
      </div>
    </form>
  </div>;
}
