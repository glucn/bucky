import React from "react";
import type { CredentialChangeRequest, SecurityState } from "../../shared/security";

const inputClass = "block w-full rounded border border-gray-300 px-3 py-2 mt-1";

export function CredentialChange({ state, onClose }: { state: SecurityState; onClose(): void }) {
  const [mode, setMode] = React.useState<CredentialChangeRequest["authentication"]["mode"]>(state.methods.passphrase ? "passphrase"
    : state.osAuthenticationAvailable && state.methods.keychain ? "keychain" : "recovery");
  const [target, setTarget] = React.useState<"passphrase" | "keychain">("passphrase");
  const [current, setCurrent] = React.useState("");
  const [recovery, setRecovery] = React.useState("");
  const [replacement, setReplacement] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const running = React.useRef(false), mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = async () => {
    if (running.current || state.status !== "locked") return;
    running.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const authentication: CredentialChangeRequest["authentication"] = mode === "recovery" ? { mode, recoverySecret: recovery }
        : mode === "passphrase" ? { mode, passphrase: current } : { mode };
      const change: CredentialChangeRequest["change"] = target === "passphrase"
        ? { mode: target, passphrase: replacement, passphraseConfirmation: confirmation } : { mode: target };
      const result = await window.electron.security.changeCredentials({ authentication, change });
      if (mounted.current) setMessage(result.updated
        ? "Profile protection updated. Return to unlock and use your new credential. Your saved recovery code stays the same."
        : "Canceled. Existing protection retained.");
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "Unable to update profile protection"); }
    finally {
      if (mounted.current) { setCurrent(""); setRecovery(""); setReplacement(""); setConfirmation(""); setBusy(false); }
      running.current = false;
    }
  };
  const working = busy || state.status === "changing-credentials";
  return <section className="w-full max-w-xl rounded bg-white p-8 shadow space-y-4" aria-busy={working} data-testid="credential-change-page">
    <h1 className="text-2xl font-semibold">Change profile protection</h1>
    <p>Your book stays closed. Verify an existing credential or your saved recovery code, then set new ordinary protection.
      A separate unlock is required afterward.</p>
    <p>Old backups and retained copies keep their old credentials; this change does not revoke them. Keep your saved recovery code.</p>
    {error ? <p role="alert" className="text-red-700">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {working ? <p role="status">Verifying and saving protection…</p> : null}
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void run(); }}>
      <fieldset className="space-y-4" disabled={working}>
        <label className="block">Verify current protection<select aria-label="Verify current protection" className={inputClass} value={mode}
          onChange={(event) => { setMode(event.target.value as typeof mode); setCurrent(""); setRecovery(""); }}>
          <option value="keychain" disabled={!state.methods.keychain || !state.osAuthenticationAvailable}>Touch ID + OS keychain</option>
          <option value="passphrase" disabled={!state.methods.passphrase}>Current passphrase</option><option value="recovery">Saved recovery code</option>
        </select></label>
        {mode === "passphrase" ? <label className="block">Current passphrase<input type="password" className={inputClass} value={current} required
          maxLength={1024} autoComplete="off" onChange={(event) => setCurrent(event.target.value)} /></label> : null}
        {mode === "recovery" ? <label className="block">Saved recovery code<input type="password" className={inputClass} value={recovery} required
          maxLength={150} autoComplete="off" onChange={(event) => setRecovery(event.target.value)} /></label> : null}
        <label className="block">New protection<select aria-label="New protection" className={inputClass} value={target}
          onChange={(event) => { setTarget(event.target.value as typeof target); setReplacement(""); setConfirmation(""); }}>
          <option value="passphrase">Set or replace passphrase</option><option value="keychain" disabled={!state.osAuthenticationAvailable}>Use or refresh OS keychain</option>
        </select></label>
        {target === "passphrase" ? <>
          <label className="block">New passphrase<input type="password" className={inputClass} value={replacement} required minLength={12} maxLength={1024}
            autoComplete="off" onChange={(event) => setReplacement(event.target.value)} /></label>
          <label className="block">Repeat new passphrase<input type="password" className={inputClass} value={confirmation} required maxLength={1024}
            autoComplete="off" onChange={(event) => setConfirmation(event.target.value)} /></label>
        </> : <p>Fresh OS authentication is required for keychain protection. Any configured passphrase remains available.</p>}
        <button className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">Update profile protection</button>
      </fieldset>
    </form>
    <button className="underline" disabled={working} onClick={onClose}>Back to unlock</button>
  </section>;
}
