import React from "react";
import type { ResetRequest } from "../../shared/reset";

export function DevelopmentReset({ onReset = () => window.location.reload() }: { onReset?(): void }) {
  const [mode, setMode] = React.useState<ResetRequest["mode"]>("data");
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState("");
  const running = React.useRef(false);
  const reset = async () => {
    if (running.current) return;
    const detail = mode === "data" ? "Delete all development records and retain the selected base currency?"
      : "Delete all development records and clear the base currency and setup?";
    if (!window.confirm(`${detail} This cannot be undone.`)) return;
    running.current = true; setBusy(true); setError("");
    try {
      const result = await window.electron.ipcRenderer.invoke("reset-all-data", { mode });
      if (!result?.success) throw new Error(result?.error || "Unable to reset development data");
      onReset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to reset development data"); }
    finally { running.current = false; setBusy(false); }
  };
  return <div className="flex items-center gap-2">
    <select aria-label="Development reset mode" className="border rounded text-sm" disabled={busy} value={mode}
      onChange={(event) => setMode(event.target.value as ResetRequest["mode"])}>
      <option value="data">Data reset — retain base currency</option>
      <option value="factory">Factory reset — clear setup</option>
    </select>
    <button type="button" className="text-red-700 text-sm disabled:opacity-50" disabled={busy} onClick={() => { void reset(); }}>Reset development data</button>
    {error ? <span role="alert" className="text-red-700 text-sm">{error}</span> : null}
  </div>;
}
