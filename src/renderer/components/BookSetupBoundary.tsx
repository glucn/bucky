import React from "react";
import { SUPPORTED_CURRENCY_OPTIONS } from "../../shared/currencies";

export function BookSetupBoundary({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = React.useState<"checking" | "required" | "saving" | "ready" | "failed">("checking");
  const [currency, setCurrency] = React.useState(""), [error, setError] = React.useState("");
  const generation = React.useRef(0), running = React.useRef(false);
  const check = React.useCallback(async () => {
    const ticket = ++generation.current; setPhase("checking"); setError("");
    try {
      const state = await window.electron.bookSetup.getState();
      if (ticket === generation.current) setPhase(state.required ? "required" : "ready");
    } catch { if (ticket === generation.current) { setPhase("failed"); setError("Unable to check currency setup. Your book has not been changed."); } }
  }, []);
  React.useEffect(() => { void check(); return () => { generation.current++; }; }, [check]);
  const save = async () => {
    if (running.current || !currency || phase !== "required") return;
    const ticket = generation.current; running.current = true; setPhase("saving"); setError("");
    try {
      await window.electron.bookSetup.complete({ baseCurrency: currency });
      if (ticket === generation.current) setPhase("ready");
    } catch (reason) {
      if (ticket === generation.current) { setPhase("required"); setError(reason instanceof Error ? reason.message : "Unable to save base currency"); }
    } finally { running.current = false; }
  };
  if (phase === "ready") return <>{children}</>;
  return <main className="min-h-screen bg-gray-100 flex items-center justify-center p-6" data-testid="book-setup-page">
    <section className="w-full max-w-xl rounded bg-white p-8 shadow space-y-4" aria-busy={phase === "checking" || phase === "saving"}>
      <h1 className="text-2xl font-semibold">Choose your book's base currency</h1>
      <p>Select the currency for totals and reports before opening your book. Existing account currencies and
        transaction amounts will be kept. Existing records may need FX rates and valuation review afterward.</p>
      {error ? <p role="alert" className="text-red-700">{error}</p> : null}
      {phase === "checking" ? <p role="status">Checking currency setup…</p> : phase === "failed"
        ? <button className="underline" onClick={() => { void check(); }}>Check setup again</button>
        : <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <label className="block">Base currency<select className="block w-full rounded border border-gray-300 px-3 py-2 mt-1"
            required disabled={phase === "saving"} value={currency} onChange={(event) => setCurrency(event.target.value)}>
            <option value="" disabled>Select a currency</option>
            {SUPPORTED_CURRENCY_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.code} — {option.label}</option>)}
          </select></label>
          <button className="rounded bg-blue-700 text-white px-4 py-2 disabled:opacity-50" disabled={!currency || phase === "saving"}>Save base currency</button>
        </form>}
    </section>
  </main>;
}
