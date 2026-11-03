import React from "react";
import type { SecurityState } from "../../shared/security";
import type { PendingProtectedRestore, ProfileAuthentication, RecoveryState, RecoverySummary } from "../../shared/recovery";

const inputClass = "block w-full rounded border border-gray-300 px-3 py-2 mt-1";
const buttonClass = "rounded bg-blue-700 text-white px-4 py-2 disabled:opacity-50";

export function ProtectedRecovery({ security, onClose }: { security: SecurityState; onClose?: () => void }) {
  const api = window.electron.protectedRecovery;
  const [state, setState] = React.useState<RecoveryState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const running = React.useRef(false);
  const mounted = React.useRef(true);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [mode, setMode] = React.useState<ProfileAuthentication["mode"]>(security.methods.passphrase ? "passphrase" : security.osAuthenticationAvailable ? "keychain" : "passphrase");
  const [passphrase, setPassphrase] = React.useState("");
  const [credentialMode, setCredentialMode] = React.useState<"recovery" | "passphrase">("recovery");
  const [credential, setCredential] = React.useState("");
  const [newMode, setNewMode] = React.useState<ProfileAuthentication["mode"]>(security.osAuthenticationAvailable ? "keychain" : "passphrase");
  const [newPassphrase, setNewPassphrase] = React.useState("");
  const [repeated, setRepeated] = React.useState("");
  const [pending, setPending] = React.useState<PendingProtectedRestore | null>(null);
  const [reentered, setReentered] = React.useState("");
  const [selected, setSelected] = React.useState("");
  const [result, setResult] = React.useState<{ profileId?: string; path?: string; summary: RecoverySummary } | null>(null);

  React.useEffect(() => {
    mounted.current = true;
    api.getState().then((next) => {
      if (mounted.current) { setState(next); setSelected(next.nextProfile); }
    }).catch(() => { if (mounted.current) setError("Unable to list profiles. Refresh or cancel recovery before continuing."); });
    return () => { mounted.current = false; void api.cancel().catch(() => {}); };
  }, [api]);

  const authentication = (): ProfileAuthentication => ({ mode, ...(mode === "passphrase" ? { passphrase } : {}) });
  const refresh = async (preferred?: string) => {
    const next = await api.getState();
    if (mounted.current) { setState(next); setSelected(preferred ?? next.nextProfile); }
  };
  const run = async (operation: "backup" | "restore" | "confirm" | "select" | "cancel" | "close" | "refresh") => {
    if (running.current) return;
    running.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (operation === "backup") {
        const saved = await api.createBackup(authentication());
        if (!mounted.current) return;
        setResult(saved ?? null); setMessage(saved ? "Encrypted backup created and verified" : "Canceled");
      } else if (operation === "restore") {
        const prepared = await api.beginRestore({ credential: { mode: credentialMode, secret: credential },
          protection: { mode: newMode, ...(newMode === "passphrase" ? { passphrase: newPassphrase, passphraseConfirmation: repeated } : {}) } });
        if (mounted.current) { setPending(prepared ?? null); setResult(null); if (!prepared) setMessage("Canceled"); }
      } else if (operation === "confirm" && pending) {
        const restored = await api.confirmRestore({ restoreId: pending.restoreId, recoverySecret: reentered });
        if (!mounted.current) return;
        setPending(null); setResult(restored); setMessage("Restored and verified in a separate profile. Choose it below to use it on next launch.");
        await refresh(restored.profileId);
      } else if (operation === "select") {
        const changed = await api.selectProfile({ profileId: selected, authentication: authentication() });
        if (!mounted.current) return;
        setMessage(changed ? "Profile selected. Quit and reopen Bucky to use it." : "Canceled");
        await refresh();
      } else if (operation === "cancel" || operation === "close") {
        await api.cancel();
        if (!mounted.current) return;
        setPending(null); setResult(null);
        if (operation === "close") { onClose?.(); return; }
        setMessage("Pending recovery canceled. Published profiles are preserved.");
        await refresh();
      } else if (operation === "refresh") await refresh();
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : "Recovery failed. Check profiles before retrying.");
    } finally {
      if (mounted.current) { setPassphrase(""); setCredential(""); setNewPassphrase(""); setRepeated(""); setReentered(""); setBusy(false); }
      running.current = false;
    }
  };

  return <section className="max-w-4xl space-y-5 p-6" aria-busy={busy} data-testid="protected-recovery-page">
    <h1 className="text-2xl font-semibold">Encrypted backup and recovery</h1>
    <p>Restore verifies an encrypted backup and creates a separate profile with new credentials and a new recovery code.
      Your current book and backup are preserved. Use the same app database version. Keep another authoritative record while readiness checks remain open.</p>
    {state ? <p>Current profile: <code>{state.activeProfile}</code>. Next launch: <code>{state.nextProfile || "selection needs recovery"}</code>.</p> : null}
    {state && state.nextProfile !== state.activeProfile ? <p role="status">Selection applies after quitting and reopening. The current profile stays active until then.</p> : null}
    {error ? <p role="alert" className="text-red-700">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {busy ? <p role="status">Working… Keep Bucky open.</p> : null}
    {!pending ? <>
      <fieldset className="space-y-3 rounded border p-4" disabled={busy}>
        <legend>Authenticate a profile</legend>
        <p>Backup requires fresh authentication of the current book. Profile selection requires the target profile’s credentials and a native confirmation.</p>
        <label className="block">Profile authentication<select className={inputClass} value={mode} onChange={(event) => { setMode(event.target.value as typeof mode); setPassphrase(""); }}>
          <option value="keychain" disabled={!security.osAuthenticationAvailable}>Touch ID + OS keychain</option><option value="passphrase">Passphrase</option>
        </select></label>
        {mode === "passphrase" ? <label className="block">Profile passphrase<input type="password" autoComplete="off" className={inputClass} value={passphrase}
          maxLength={1024} onChange={(event) => setPassphrase(event.target.value)} /></label> : null}
        {security.status === "unlocked" ? <button className={buttonClass} onClick={() => void run("backup")} data-testid="create-protected-backup">Create encrypted backup</button> : null}
        <label className="block">Profile for next launch<select className={inputClass} value={selected} onChange={(event) => setSelected(event.target.value)}>
          <option value="">Select a profile</option>{state?.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.id}</option>)}
        </select></label>
        <button className={buttonClass} disabled={!selected || selected === state?.nextProfile} onClick={() => void run("select")} data-testid="select-protected-profile">Use on next launch</button>
      </fieldset>
      <form onSubmit={(event) => { event.preventDefault(); void run("restore"); }}>
        <fieldset className="space-y-3 rounded border p-4" disabled={busy}>
          <legend>Restore encrypted backup</legend>
          <label className="block">Backup credential type<select className={inputClass} value={credentialMode} onChange={(event) => { setCredentialMode(event.target.value as typeof credentialMode); setCredential(""); }}>
            <option value="recovery">Saved recovery code</option><option value="passphrase">Backup’s configured passphrase</option>
          </select></label>
          <label className="block">Backup credential<input type="password" autoComplete="off" className={inputClass} required value={credential} maxLength={1024}
            onChange={(event) => setCredential(event.target.value)} /></label>
          <label className="block">New profile protection<select className={inputClass} value={newMode} onChange={(event) => { setNewMode(event.target.value as typeof newMode); setNewPassphrase(""); setRepeated(""); }}>
            <option value="keychain" disabled={!security.osAuthenticationAvailable}>Touch ID + OS keychain</option><option value="passphrase">New passphrase</option>
          </select></label>
          {newMode === "passphrase" ? <>
            <label className="block">New passphrase<input type="password" className={inputClass} required minLength={12} maxLength={1024} autoComplete="off"
              value={newPassphrase} onChange={(event) => setNewPassphrase(event.target.value)} /></label>
            <label className="block">Repeat new passphrase<input type="password" className={inputClass} required maxLength={1024} autoComplete="off"
              value={repeated} onChange={(event) => setRepeated(event.target.value)} /></label>
          </> : null}
          <button className={buttonClass} data-testid="begin-protected-restore">Choose encrypted backup and verify</button>
        </fieldset>
      </form>
    </> : <div className="space-y-3 rounded border p-4">
      <h2 className="text-lg font-semibold">Save the NEW recovery code</h2>
      <p>Store this separately in a password manager or another safe place, then re-enter it. The backup’s old code will not confirm this profile.
        New credentials do not revoke old backup copies.</p>
      <code className="block break-all select-all bg-gray-100 p-3" data-testid="restore-recovery-code">{pending.recoverySecret}</code>
      <VerifiedSummary summary={pending.summary} />
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void run("confirm"); }}>
        <label className="block">Re-enter new recovery code<input className={inputClass} required maxLength={150} autoComplete="off"
          value={reentered} onChange={(event) => setReentered(event.target.value)} /></label>
        <button className={buttonClass} disabled={busy} data-testid="confirm-protected-restore">Confirm and publish restored profile</button>
      </form>
    </div>}
    {result ? <div className="space-y-2 rounded border p-4" data-testid="protected-recovery-result">
      {result.path ? <p className="break-all">File: {result.path}</p> : null}
      {result.profileId ? <p className="break-all">Restored profile: {result.profileId}</p> : null}
      <VerifiedSummary summary={result.summary} />
    </div> : null}
    <div className="flex gap-4">
      <button className="underline" disabled={busy} onClick={() => void run("cancel")}>Cancel pending recovery</button>
      <button className="underline" disabled={busy} onClick={() => void run("refresh")}>Refresh profiles</button>
      {onClose ? <button className="underline" disabled={busy} onClick={() => void run("close")}>Back to unlock</button> : null}
    </div>
  </section>;
}

function VerifiedSummary({ summary }: { summary: RecoverySummary }) {
  return <div className="space-y-2">
    <p>Accounts: {summary.tableCounts.Account ?? 0}; journal entries: {summary.tableCounts.JournalEntry ?? 0}. Schema: {summary.schemaVersion}.</p>
    <details><summary>Verified records and posting balances</summary>
      <p className="break-all">Record digest: <code>{summary.recordDigest}</code></p>
      <table className="w-full text-left"><thead><tr><th>Account ID</th><th>Currency</th><th>Raw posting amount</th></tr></thead>
        <tbody>{summary.balances.map((balance) => <tr key={`${balance.accountId}:${balance.currency}`}>
          <td className="break-all">{balance.accountId}</td><td>{balance.currency}</td><td>{balance.amount}</td></tr>)}</tbody></table>
    </details>
    <p>Recovery checks establish that records match the backup. Compare the reopened book with your statements.</p>
  </div>;
}
