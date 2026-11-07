import React, { useEffect, useRef, useState } from "react";
import { localCalendarDate } from "../../shared/dateUtils";
import { parseSecurityPriceCsv, type PriceRequest, type PricePreviewRow } from "../../shared/securityPrices";

type Context = { accountId: string; ticker: string; market: string | null; currency: string; hasTrackedHistory: boolean; priceCount: number; legacyCount: number;
  prices: Array<{ id: string; date: string; price: number; source: string; priceBasis: string; barStatus: string; basisAsOf: string | null; token: string | null }>;
  legacyPrices: Array<{ id: string; date: string; normalizedDate?: string | null; price: number; source: string | null }> };
const button = "rounded border px-3 py-2 disabled:opacity-50";
export function SecurityPriceModal({ isOpen, accountId, onClose, onChanged }: { isOpen: boolean; accountId: string; onClose: () => void; onChanged?: () => void }) {
  const [context, setContext] = useState<Context | null>(null), [market, setMarket] = useState("");
  const [phase, setPhase] = useState<"load" | "search" | "preview" | "write" | null>(null), [error, setError] = useState(""), [outcome, setOutcome] = useState("");
  const [candidates, setCandidates] = useState<Array<{ market: string; quoteCurrency: string | null }>>([]), [lookupError, setLookupError] = useState("");
  const [source, setSource] = useState<PriceRequest["source"]>("manual"), [mode, setMode] = useState<"" | "fill" | "correct">("");
  const [date, setDate] = useState(localCalendarDate), [price, setPrice] = useState(""), [csv, setCsv] = useState(""), [legacyIds, setLegacyIds] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false), [endDate, setEndDate] = useState(""), [page, setPage] = useState(0);
  const [preview, setPreview] = useState<{ request: PriceRequest; rows: PricePreviewRow[] } | null>(null);
  const generation = useRef(0), changed = useRef(false), busy = phase !== null;
  const invalidate = () => { setPreview(null); setConfirmed(false); setOutcome(""); setError(""); };
  const invoke = async (channel: string, input: unknown) => {
    const result = await window.electron.ipcRenderer.invoke(channel, input);
    if (!result.success) throw new Error(result.error || "Unable to complete this price action");
    return result;
  };
  const load = async (token: number, cutoff?: string) => {
    const result = await invoke("get-security-price-context", { accountId, endDate: cutoff || undefined });
    if (token === generation.current) { setContext(result.context); setMarket(result.context.market || ""); }
  };
  useEffect(() => {
    const token = ++generation.current; changed.current = false; setContext(null); setError(""); setOutcome(""); setPreview(null); setConfirmed(false); setCandidates([]); setLookupError(""); setSource("manual"); setMode(""); setLegacyIds([]); setCsv(""); setPrice(""); setDate(localCalendarDate()); setEndDate(""); setPage(0);
    if (isOpen) { setPhase("load"); void load(token).catch((failure) => { if (token === generation.current) setError(String(failure.message || failure)); }).finally(() => { if (token === generation.current) setPhase(null); }); }
    return () => { generation.current++; };
  }, [isOpen, accountId]);
  if (!isOpen) return null;
  const close = () => { generation.current++; onClose(); if (changed.current) onChanged?.(); };
  const action = async (kind: "search" | "preview" | "write" | "load", operation: (token: number) => Promise<void>) => {
    if (busy) return;
    const token = generation.current; setPhase(kind); setError("");
    try { await operation(token); } catch (failure) { if (token === generation.current) setError(failure instanceof Error ? failure.message : "Unable to complete price action"); }
    finally { if (token === generation.current) setPhase(null); }
  };
  const review = () => void action("preview", async (token) => {
    if (!context?.market || !mode) throw new Error("Assign the market and choose an existing-date policy first");
    if (source === "manual" && (!price.trim() || !date)) throw new Error("Supply a price date and value");
    const request: PriceRequest = { accountId, expectedMarket: context.market, source, mode, confirmRawClose: false,
      ...(source === "legacy" ? { legacyIds } : { points: source === "import" ? parseSecurityPriceCsv(csv) : [{ date, price: Number(price) }] }) };
    const result = await invoke("preview-security-prices", request);
    if (token === generation.current) { setPreview({ request, rows: result.preview.rows }); setConfirmed(false); setPage(0); setOutcome(""); }
  });
  const save = () => void action("write", async (token) => {
    if (!preview || !confirmed) throw new Error("Review and confirm the raw closing prices first");
    const result = await invoke("save-security-prices", { ...preview.request, confirmRawClose: true, expected: preview.rows.map(({ date, price, token }) => ({ date, price, token })) });
    changed.current = true;
    if (token === generation.current) { setOutcome(`${result.result.inserted} inserted · ${result.result.corrected} corrected · ${result.result.retained} retained`); setPreview(null); setConfirmed(false); await load(token, endDate); }
  });
  const upload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    invalidate(); if (file.size > 10_000_000) { setError("Choose a CSV smaller than 10 MB"); return; }
    const token = generation.current, reader = new FileReader(); setPhase("load");
    reader.onload = () => { if (token === generation.current) { setCsv(String(reader.result || "")); setPhase(null); } };
    reader.onerror = () => { if (token === generation.current) { setError("Unable to read this CSV"); setPhase(null); } }; reader.readAsText(file);
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500 bg-opacity-75">
    <div role="dialog" aria-modal="true" aria-labelledby="security-price-title" data-testid="security-price-dialog" className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6 mx-4 space-y-5">
      <div className="sticky top-0 z-20 bg-white pb-2 space-y-3">
        <div className="flex items-center justify-between"><h3 id="security-price-title" className="text-xl font-semibold">Market and closing prices</h3><button className={button} disabled={phase === "write"} onClick={close}>Close</button></div>
        {error ? <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p> : null}{outcome ? <p role="status" className="rounded bg-green-50 p-3 text-green-800">{outcome}</p> : null}
      </div>
      {!context ? <p>{busy ? "Loading price records…" : "Price records are unavailable. Close and reopen to retry."}</p> : <>
        <p className="font-medium">{context.ticker} · {context.market || "Market needs review"} · {context.currency}</p>
        <p className="text-sm text-gray-600">{context.hasTrackedHistory ? "This holding has tracked activity." : "This holding has unverified legacy activity."} Price changes do not verify quantities or cost basis.</p>
        <section className="space-y-3 rounded border p-4"><h4 className="font-semibold">Listing identity</h4>
          <p className="text-sm">Choose the exact market for this listing. The quote currency must be {context.currency}; assigning a market does not convert amounts. Established holdings cannot be moved to another market.</p>
          <div className="flex gap-3 items-end"><label className="flex-1">Market<input aria-label="Market" value={market} disabled={busy} className="block w-full rounded border p-2" onChange={(event) => { setMarket(event.target.value); invalidate(); }} /></label>
            <button className={button} disabled={busy} onClick={() => void action("search", async (token) => { setLookupError(""); try { const result = await invoke("search-security-markets", accountId); if (token === generation.current) { setCandidates(result.candidates); if (!result.candidates.length) setLookupError("No matching listing found. Enter the exact market from your price source."); } } catch (failure) { if (token === generation.current) setLookupError(`${failure instanceof Error ? failure.message : "Lookup unavailable"}. You can enter the exact market manually.`); } })}>Find markets</button>
            <button className={button} disabled={busy || !market.trim() || market === context.market} onClick={() => void action("write", async (token) => { await invoke("bind-security-market", { accountId, market, quoteCurrency: context.currency, expectedMarket: context.market }); changed.current = true; if (token === generation.current) { invalidate(); await load(token, endDate); setOutcome("Market assigned. Review its closing prices below."); } })}>Save market</button>
          </div>
          {lookupError ? <p role="status" className="text-sm text-amber-800">{lookupError}</p> : null}
          {candidates.length ? <label className="block">Provider listing<select aria-label="Provider listing" className="ml-3 rounded border p-2" value="" disabled={busy} onChange={(event) => { setMarket(event.target.value); invalidate(); }}><option value="">Choose a listing…</option>{candidates.map((candidate) => <option key={candidate.market} value={candidate.market}>{candidate.market} · {candidate.quoteCurrency || "Currency not supplied; verify the listing"}</option>)}</select></label> : null}
        </section>
        <section className="space-y-3 rounded border p-4"><h4 className="font-semibold">Review closing prices</h4>
          <p className="text-sm">Use unadjusted closing prices for the units held on each date. Split-adjusted charts cannot be used directly. Preview the effects before saving; provider refresh preserves existing dates.</p>
          {context.market ? <p className="text-sm">These prices are shared by every {context.ticker} holding on {context.market}, including other portfolios.</p> : null}
          <div className="flex flex-wrap gap-4"><label>Price source<select aria-label="Price source" className="ml-2 rounded border p-2" value={source} disabled={busy} onChange={(event) => { setSource(event.target.value as PriceRequest["source"]); invalidate(); }}><option value="manual">Manual close</option><option value="import">Price CSV</option><option value="legacy">Selected legacy prices</option></select></label>
            <label>Existing dates<select aria-label="Existing dates" className="ml-2 rounded border p-2" value={mode} disabled={busy} onChange={(event) => { setMode(event.target.value as "fill" | "correct"); invalidate(); }}><option value="">Choose a policy…</option><option value="fill">Fill missing dates; retain existing prices</option><option value="correct">Correct existing dates explicitly</option></select></label></div>
          {source === "manual" ? <div className="flex gap-4"><label>Price date<input aria-label="Price date" className="block rounded border p-2" type="date" max={localCalendarDate()} value={date} disabled={busy} onChange={(event) => { setDate(event.target.value); invalidate(); }} /></label><label>Price in {context.currency}<input aria-label={`Price in ${context.currency}`} className="block rounded border p-2" type="number" min="0" step="any" value={price} disabled={busy} onChange={(event) => { setPrice(event.target.value); invalidate(); }} /></label></div> : null}
          {source === "import" ? <><p className="text-sm">Use Date,Price headers and plain nonnegative numbers. Up to 10000 records; the whole batch must be valid.</p><label className="block">Price CSV file<input aria-label="Price CSV file" type="file" accept=".csv" disabled={busy} className="block" onChange={upload} /></label><label className="block">Price CSV<textarea aria-label="Price CSV" className="block w-full rounded border p-2 font-mono" rows={4} value={csv} disabled={busy} onChange={(event) => { setCsv(event.target.value); invalidate(); }} /></label></> : null}
          {source === "legacy" ? <p className="text-sm text-amber-800">Select legacy records below only after checking their market, currency and adjustment basis. Originals remain unchanged. Their ticker alone does not establish this listing.</p> : null}
          <button className={button} disabled={busy || !context.market || !mode} onClick={review}>Preview prices</button>
          {preview ? <div className="space-y-3"><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{["Date", "New close", "Existing close", "Existing basis", "Effect"].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{preview.rows.slice(page * 100, (page + 1) * 100).map((row) => <tr key={row.date} className="border-t"><td className="p-2 whitespace-nowrap">{row.date}</td><td>{row.price}</td><td>{row.existing?.price ?? "None"}</td><td>{row.existing ? `${row.existing.priceBasis} / ${row.existing.barStatus}` : "—"}</td><td>{row.action}</td></tr>)}</tbody></table></div>
            {preview.rows.length > 100 ? <div className="flex gap-3"><button className={button} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {Math.ceil(preview.rows.length / 100)}</span><button className={button} disabled={(page + 1) * 100 >= preview.rows.length} onClick={() => setPage(page + 1)}>Next</button></div> : null}
            <label className="block"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /> <span>I verified these are unadjusted completed closing prices for {context.ticker} on {context.market}, quoted in {context.currency}.</span></label>
            <button className={button} disabled={busy || !confirmed} onClick={save}>Save reviewed prices</button>
          </div> : null}
        </section>
        <section className="space-y-3"><h4 className="font-semibold">Stored records</h4><label>History through<input aria-label="History through" className="mx-3 rounded border p-2" type="date" value={endDate} disabled={busy} onChange={(event) => setEndDate(event.target.value)} /></label><button className={button} disabled={busy} onClick={() => void action("load", async (token) => { invalidate(); setLegacyIds([]); await load(token, endDate); })}>Load history</button>
          <p className="text-sm">Showing up to 200 records per source. Choose an earlier history date to inspect older records.</p>
          <div className="max-h-64 overflow-auto"><table className="w-full text-sm text-left"><thead><tr><th>Date</th><th>Close</th><th>Source</th><th>Basis / status</th><th>Review</th></tr></thead><tbody>{context.prices.map((row) => <tr key={row.id} className="border-t"><td className="p-2 whitespace-nowrap">{row.date}</td><td>{row.price}</td><td>{row.source}</td><td>{row.date > localCalendarDate() ? "Future date; excluded from current valuation" : `${row.priceBasis} / ${row.barStatus}`}{row.basisAsOf ? ` · adjusted as of ${row.basisAsOf}` : ""}</td><td>{row.priceBasis === "raw" && row.barStatus === "complete" ? <button className={button} disabled={busy} aria-label={`Exclude price ${row.date}`} onClick={() => void action("write", async (token) => { await invoke("exclude-security-price", { accountId, expectedMarket: context.market, priceId: row.id, token: row.token }); changed.current = true; if (token === generation.current) { invalidate(); await load(token, endDate); setOutcome("Price excluded from valuation; original value retained. A reviewed correction can restore it."); } })}>Exclude from valuation</button> : "Excluded until reviewed"}</td></tr>)}</tbody></table></div>
          <p className="text-sm">{context.priceCount} canonical prices in this history range. Only raw completed closes can value dated holdings.</p>
          <h4 className="font-semibold">Legacy prices without market identity ({context.legacyCount})</h4><div className="max-h-64 overflow-auto">{context.legacyPrices.map((row) => <label key={row.id} className="flex gap-3 border-t py-2 text-sm"><input type="checkbox" aria-label={`Select legacy price ${row.date}`} disabled={busy || source !== "legacy" || row.normalizedDate === null} checked={legacyIds.includes(row.id)} onChange={(event) => { setLegacyIds(event.target.checked ? [...legacyIds, row.id] : legacyIds.filter((id) => id !== row.id)); invalidate(); }} /><span>{row.date}{row.normalizedDate === null ? " · Invalid date; use a verified manual record" : row.normalizedDate && row.normalizedDate !== row.date ? ` → ${row.normalizedDate}` : ""} · {row.price} · {row.source || "Unknown source"}</span></label>)}</div>
        </section>
      </>}
    </div>
  </div>;
}
