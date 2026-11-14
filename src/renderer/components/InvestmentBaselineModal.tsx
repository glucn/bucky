import React, { useEffect, useRef, useState } from "react";

type Lot = { date: string; quantity: number; pricePerShare: number; amount: number };
type Review = { accountId: string; ticker: string; currency: string; quantity: number; costBasis: number; earliestDate: string; method: string; lots: Lot[] | null };
type DraftLot = Record<keyof Lot, string>;
const blankLot = (): DraftLot => ({ date: "", quantity: "", pricePerShare: "", amount: "" });
const fields: Array<[keyof Lot, string]> = [["date", "Acquired"], ["quantity", "Units"], ["pricePerShare", "Unit price"], ["amount", "Remaining basis"]];

export default function InvestmentBaselineModal({ accountId, onClose, onSaved }: { accountId: string; onClose: () => void; onSaved: () => void }) {
  const [review, setReview] = useState<Review | null>(null), [date, setDate] = useState(""), [lots, setLots] = useState<DraftLot[]>([]);
  const [confirmed, setConfirmed] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current;
    setReview(null); setConfirmed(false); setError(""); setSaving(false);
    void window.electron.ipcRenderer.invoke("get-investment-baseline-review", accountId).then((result) => {
      if (token !== generation.current) return;
      if (!result.success) throw new Error(result.error || "Unable to load baseline");
      const next: Review = result.review;
      setReview(next); setDate(next.earliestDate);
      setLots((next.lots || []).map((lot) => ({ date: lot.date, quantity: String(lot.quantity), pricePerShare: String(lot.pricePerShare), amount: String(lot.amount) })));
    }).catch((failure) => { if (token === generation.current) setError(String(failure)); });
    return () => { generation.current++; };
  }, [accountId]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!review || review.accountId !== accountId || !confirmed || saving) return;
    const token = generation.current;
    setSaving(true); setError("");
    try {
      const result = await window.electron.ipcRenderer.invoke("confirm-investment-baseline", {
        accountId, date, currency: review.currency, quantity: review.quantity, costBasis: review.costBasis,
        lots: review.method === "FIFO" ? lots.map((lot) => ({ date: lot.date, quantity: Number(lot.quantity), pricePerShare: Number(lot.pricePerShare), amount: Number(lot.amount) })) : null,
      });
      if (token !== generation.current) return;
      if (!result.success) throw new Error(result.error || "Unable to confirm baseline");
      onSaved();
    } catch (failure) { if (token === generation.current) setError(failure instanceof Error ? failure.message : "Unable to confirm baseline"); }
    finally { if (token === generation.current) setSaving(false); }
  };
  return <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
    <form role="dialog" aria-modal="true" aria-label="Review investment baseline" onSubmit={save} className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-auto space-y-4">
      <h3 className="text-lg font-semibold">Review investment baseline</h3>
      <p>Match the retained units, basis and any lots to your statement. Dates before the cutover remain unavailable. Confirming does not post a transaction.</p>
      {review ? <fieldset disabled={saving} className="space-y-3">
        <p>{review.ticker} · {review.quantity} units · {review.currency} {review.costBasis.toFixed(2)} basis · {review.method}</p>
        <label className="block">Cutover date <input className="border rounded p-1" type="date" required min={review.earliestDate || undefined} value={date} onChange={(event) => { setDate(event.target.value); setConfirmed(false); }} /></label>
        {review.method === "FIFO" ? <>
          <p className="text-sm">Keep lots in acquisition order. Remaining basis includes fees and any prior basis adjustments.</p>
          {lots.map((lot, index) => <fieldset key={index} className="border rounded p-2 grid grid-cols-2 gap-2">
            <legend>Lot {index + 1}</legend>
            {fields.map(([key, label]) => <label key={key}>{label} <input className="w-full border rounded p-1" type={key === "date" ? "date" : "number"} step={key === "amount" ? "0.01" : "any"} min={key === "date" ? undefined : "0"} required value={lot[key]} onChange={(event) => {
              setLots(lots.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item)); setConfirmed(false);
            }} /></label>)}
            <button type="button" className="underline text-left" onClick={() => { setLots(lots.filter((_, i) => i !== index)); setConfirmed(false); }}>Remove lot {index + 1}</button>
          </fieldset>)}
          <button type="button" className="underline" onClick={() => { setLots([...lots, blankLot()]); setConfirmed(false); }}>Add lot</button>
        </> : null}
        <label className="block"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I verified this position against my records</label>
      </fieldset> : !error ? <p role="status">Loading retained holding…</p> : null}
      {error ? <p role="alert" className="text-red-700">{error}</p> : null}
      <div className="flex justify-end gap-3">
        <button type="button" disabled={saving} onClick={onClose} className="border rounded px-3 py-2">Cancel</button>
        <button type="submit" disabled={!review || !confirmed || saving} className="border rounded px-3 py-2 disabled:opacity-50">Confirm baseline</button>
      </div>
    </form>
  </div>;
}
