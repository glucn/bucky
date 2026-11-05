import React from "react";
import type { SecurityState } from "../../shared/security";
import { SUPPORTED_CURRENCY_OPTIONS } from "../../shared/currencies";
import { ProtectedRecovery } from "./ProtectedRecovery";
import { CredentialChange } from "./CredentialChange";

const inputClass = "block w-full rounded border border-gray-300 px-3 py-2 mt-1";
const buttonClass = "rounded bg-blue-700 text-white px-4 py-2 disabled:opacity-50";

/** This sits outside AccountsProvider and App: locked renderers never mount data-fetching views. */
export function SecurityBoundary({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<SecurityState | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let disposed = false;
    const receive = (next: SecurityState) => {
      if (!disposed) setState((previous) => !previous || next.revision >= previous.revision ? next : previous);
    };
    const unsubscribe = window.electron.security.onStateChanged(receive);
    window.electron.security.getState().then(receive).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; unsubscribe(); };
  }, []);
  if (failed) return <main className="p-8" role="alert">Bucky could not read its security state. Quit and reopen the app. Your book remains closed.</main>;
  if (!state) return <main className="p-8" role="status">Checking profile protection…</main>;
  if (state.status !== "unlocked") return <SecurityScreen state={state} />;
  return <>
    {state.personal ? <div className="bg-amber-100 p-3 flex items-center justify-between gap-4" data-testid="personal-security-banner">
      <p className="text-sm">Personal-use readiness checks remain open. Keep another authoritative bookkeeping record and test your encrypted backups. Lock first to change profile protection.</p>
      <button type="button" className={buttonClass} onClick={() => { void window.electron.security.lock().catch(() => {}); }}>Lock Bucky</button>
    </div> : null}
    {children}
  </>;
}

function SecurityScreen({ state }: { state: SecurityState }) {
  const [mode, setMode] = React.useState<"keychain" | "passphrase">(state.osAuthenticationAvailable && (state.status === "setup-required" || state.methods.keychain) ? "keychain" : "passphrase");
  const [baseCurrency, setBaseCurrency] = React.useState("");
  const [passphrase, setPassphrase] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [pending, setPending] = React.useState<{ setupId: string; recoverySecret: string } | null>(null);
  const [reentered, setReentered] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [showRecovery, setShowRecovery] = React.useState(false);
  const [showCredentials, setShowCredentials] = React.useState(false);
  const setup = state.status === "setup-required";
  const locked = state.status === "locked";
  const active = busy || ["initializing", "setting-up", "unlocking", "locking", "recovering", "changing-credentials"].includes(state.status);

  const run = async (operation: "begin" | "confirm" | "unlock" | "cancel") => {
    setBusy(true); setError("");
    try {
      if (operation === "begin") setPending(await window.electron.security.beginSetup({ baseCurrency, mode,
        ...(mode === "passphrase" || passphrase ? { passphrase, passphraseConfirmation: confirmation } : {}) }));
      if (operation === "confirm" && pending) {
        await window.electron.security.confirmSetup({ setupId: pending.setupId, recoverySecret: reentered });
        setPending(null); setReentered("");
      }
      if (operation === "unlock") await window.electron.security.unlock({ mode, ...(mode === "passphrase" ? { passphrase } : {}) });
      if (operation === "cancel") { setPending(null); setReentered(""); await window.electron.security.lock(); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Security operation failed"); }
    finally { setPassphrase(""); setConfirmation(""); setBusy(false); }
  };

  const selectedMethodAvailable = setup ? mode === "passphrase" || state.osAuthenticationAvailable
    : mode === "keychain" ? state.methods.keychain && state.osAuthenticationAvailable : state.methods.passphrase;
  const recoveryAvailable = setup || locked || state.status === "recovery-required" || state.status === "recovering";
  if (showCredentials && (locked || state.status === "changing-credentials")) return <main className="min-h-screen bg-gray-100 flex justify-center items-center p-6">
    <CredentialChange state={state} onClose={() => setShowCredentials(false)} />
  </main>;
  if (showRecovery && recoveryAvailable) return <main className="min-h-screen bg-gray-100 flex justify-center p-6">
    <ProtectedRecovery security={state} onClose={() => setShowRecovery(false)} />
  </main>;
  return <main className="min-h-screen bg-gray-100 flex justify-center items-center p-6" data-testid="security-screen">
    <section className="bg-white rounded-lg shadow p-8 w-full max-w-xl space-y-5" aria-busy={active}>
      <p className="font-semibold text-blue-800">Bucky</p>
      <h1 className="text-2xl font-semibold">{setup ? "Protect your new book" : locked ? "Unlock Bucky"
        : state.status === "confirm-recovery" ? "Save your recovery code"
          : state.status === "recovery-required" ? "Recovery required" : "Protecting your book…"}</h1>
      {state.reason ? <p role="alert">{state.reason}</p> : null}
      {active ? <p role="status">{state.status === "locking" ? "Closing storage and clearing private data…" : "Please wait…"}</p> : null}
      {error ? <p role="alert" className="text-red-700">{error}</p> : null}
      {setup || locked ? <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void run(setup ? "begin" : "unlock"); }}>
        {setup ? <>
          <p>Choose your reporting currency before accounts are created. The new book will be encrypted on this device.</p>
          <label className="block">Base currency<select required aria-label="Base currency" className={inputClass} value={baseCurrency}
            onChange={(event) => setBaseCurrency(event.target.value)}><option value="">Select a currency</option>
            {SUPPORTED_CURRENCY_OPTIONS.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} — {currency.label}</option>)}
          </select></label>
        </> : <p>Your financial records stay closed until authentication succeeds.</p>}
        <label className="block">Authentication method<select className={inputClass} aria-label="Authentication method" value={mode}
          onChange={(event) => { setMode(event.target.value as typeof mode); setPassphrase(""); setConfirmation(""); }}>
          <option value="keychain" disabled={!state.osAuthenticationAvailable || (!setup && !state.methods.keychain)}>Touch ID + OS keychain</option>
          <option value="passphrase" disabled={!setup && !state.methods.passphrase}>Passphrase</option>
        </select></label>
        {!state.osAuthenticationAvailable ? <p className="text-sm text-gray-600">OS authentication is unavailable on this device. New books require explicit passphrase setup.</p> : null}
        {mode === "passphrase" || setup ? <>
          <label className="block">{mode === "keychain" ? "Optional passphrase" : "Passphrase"}<input type="password" aria-label="Passphrase"
            className={inputClass} value={passphrase} required={mode === "passphrase"} minLength={12} maxLength={1024} autoComplete="off"
            onChange={(event) => setPassphrase(event.target.value)} /></label>
          {setup ? <><p className="text-sm text-gray-600">Use at least 12 characters. Spaces and Unicode are preserved exactly.</p>
            <label className="block">Repeat passphrase<input type="password" className={inputClass} value={confirmation}
              required={mode === "passphrase" || Boolean(passphrase)} autoComplete="off" maxLength={1024}
              onChange={(event) => setConfirmation(event.target.value)} /></label></> : null}
        </> : null}
        {!selectedMethodAvailable ? <p role="alert">No usable credential is selected. Use a configured passphrase or preserve this profile for recovery.</p> : null}
        <button className={buttonClass} disabled={active || !selectedMethodAvailable}>{setup ? "Create recovery code" : "Unlock"}</button>
      </form> : null}
      {state.status === "confirm-recovery" ? <>
        <p>Save this code separately in a password manager or another safe place. It can recover your book without this device’s keychain. Do not share it.</p>
        {pending ? <code className="block bg-gray-100 p-3 break-all select-all" data-testid="recovery-code">{pending.recoverySecret}</code>
          : <p>The one-time code is no longer available in this view. Cancel setup and generate a new code.</p>}
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void run("confirm"); }}>
          <label className="block">Re-enter saved recovery code<input className={inputClass} value={reentered} required maxLength={150} autoComplete="off"
            onChange={(event) => setReentered(event.target.value)} /></label>
          <button className={buttonClass} disabled={active || !pending}>Confirm and create encrypted book</button>
        </form>
      </> : null}
      {!locked && state.status !== "setup-required" ? <button type="button" className="underline" onClick={() => { void run("cancel"); }}>
        {state.status === "recovery-required" ? "Check profile again" : "Cancel and close"}</button> : null}
      {recoveryAvailable ? <button type="button" className="underline block" onClick={() => {
        setPassphrase(""); setConfirmation(""); setReentered(""); setError(""); setShowCredentials(false); setShowRecovery(true);
      }} data-testid="open-protected-recovery">Encrypted backup recovery</button> : null}
      {locked ? <button type="button" className="underline block" onClick={() => {
        setPassphrase(""); setConfirmation(""); setReentered(""); setError(""); setShowRecovery(false); setShowCredentials(true);
      }} data-testid="change-profile-protection">Change profile protection</button> : null}
    </section>
  </main>;
}
