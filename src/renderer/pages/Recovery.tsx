import React from "react";
import type { RecoveryResponse, RecoveryResult, RecoveryState } from "../../shared/recovery";

export const Recovery: React.FC = () => {
  const [state, setState] = React.useState<RecoveryState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RecoveryResult | null>(null);
  const [selected, setSelected] = React.useState("");

  React.useEffect(() => {
    let disposed = false;
    window.electron.getRecoveryState().then((response) => {
      if (disposed) return;
      if (response.success) { setState(response.data); setSelected(response.data.nextProfile); }
      else if ("error" in response) setError(response.error);
    }).catch((reason) => { if (!disposed) setError(String(reason)); });
    return () => { disposed = true; };
  }, []);

  const run = async (operation: "backup" | "restore" | "select") => {
    setBusy(true); setError(null); setMessage(null); setResult(null);
    try {
      const response: RecoveryResponse<RecoveryResult | { nextProfile: string }> = operation === "backup"
        ? await window.electron.createPersonalBackup()
        : operation === "restore" ? await window.electron.restorePersonalBackup()
          : await window.electron.selectPersonalProfile(selected);
      if (!response.success) {
        if ("canceled" in response) setMessage("Canceled. No changes made.");
        else setError(response.error);
        return;
      }
      if ("summary" in response.data) setResult(response.data);
      setMessage(operation === "backup" ? "Backup created" : operation === "restore"
        ? "Restored and verified in a separate profile" : "Profile selected. Quit and reopen Bucky to use it.");
      const updated = await window.electron.getRecoveryState();
      if (updated.success) {
        setState(updated.data);
        setSelected("profileId" in response.data && response.data.profileId ? response.data.profileId : updated.data.nextProfile);
      } else if ("error" in updated) setError(`Operation succeeded, but profile refresh failed: ${updated.error}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Recovery operation failed"); }
    finally { setBusy(false); }
  };
  const disabled = busy || !state?.available;
  return (
    <section className="max-w-4xl space-y-5" data-testid="recovery-page" aria-busy={busy}>
      <h1 className="text-2xl font-semibold">Backup and recovery</h1>
      <p>This screen currently supports legacy backups, which are <strong>not encrypted</strong>.
        It is disabled for encrypted profiles until protected backup and recovery is implemented.
        Keep another authoritative bookkeeping record in the meantime.</p>
      <p>Restore creates a new profile and compares every table’s records and posting balances with the backup.
        Your current book is not overwritten. Backups must match this app’s database version.</p>
      {state && !state.available ? <p>Personal backup and recovery are available in the packaged app. Development and test databases are not personal profiles.</p> : null}
      {state?.available ? <p>Current profile: <code>{state.activeProfile}</code></p> : null}
      {state?.available && state.nextProfile !== state.activeProfile ?
        <p className="rounded border border-amber-400 bg-amber-50 p-3" role="status">Next launch: {state.nextProfile}.
          Quit Bucky completely and reopen it. Edits still apply to {state.activeProfile} until then.</p> : null}
      <div className="flex flex-wrap gap-3">
        <button className="rounded bg-primary-600 px-4 py-2 text-white disabled:opacity-50" disabled={disabled}
          data-testid="create-personal-backup" onClick={() => void run("backup")}>Create backup</button>
        <button className="rounded border border-gray-400 px-4 py-2 disabled:opacity-50" disabled={disabled}
          data-testid="restore-personal-backup" onClick={() => void run("restore")}>Restore backup into new profile</button>
      </div>
      {busy ? <p role="status">Working… Please keep Bucky open.</p> : null}
      {error ? <p role="alert" className="text-red-700">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {result ? <div className="space-y-2 rounded border bg-white p-4" data-testid="recovery-result">
        <p className="break-all">File: {result.path}</p>
        {result.profileId ? <p>Restored profile: {result.profileId}</p> : null}
        <p>Schema version: {result.summary.schemaVersion}</p>
        <p>Accounts: {result.summary.tableCounts.Account ?? 0}; journal entries: {result.summary.tableCounts.JournalEntry ?? 0};
          journal lines: {result.summary.tableCounts.JournalLine ?? 0}</p>
        <p className="break-all">Record digest: <code>{result.summary.recordDigest}</code></p>
        <details><summary>Verified posting balances (raw journal signs, no FX conversion)</summary>
          <table className="mt-2 w-full text-left"><thead><tr><th>Account ID</th><th>Currency</th><th>Amount</th></tr></thead>
            <tbody>{result.summary.balances.map((balance) => <tr key={`${balance.accountId}:${balance.currency}`}>
              <td className="break-all">{balance.accountId}</td><td>{balance.currency}</td><td>{balance.amount}</td>
            </tr>)}</tbody></table>
        </details>
        <p>These checks verify recovery fidelity, not accounting correctness. Compare the reopened book with your statements.</p>
      </div> : null}
      {state?.available ? <div className="space-y-2 border-t pt-4">
        <h2 className="text-lg font-medium">Open a profile on next launch</h2>
        <p>Finish any unsaved work first. You can return to the original profile here; no profiles are deleted.</p>
        <label htmlFor="recovery-profile">Profile</label>
        <select id="recovery-profile" className="mx-3 max-w-full rounded border" disabled={busy}
          value={selected} onChange={(event) => setSelected(event.target.value)}>
          {state.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.id}</option>)}
        </select>
        <button className="rounded border border-gray-400 px-3 py-2 disabled:opacity-50" disabled={busy || !selected || selected === state.nextProfile}
          onClick={() => void run("select")}>Use on next launch</button>
      </div> : null}
    </section>
  );
};
