import React from "react";
import type { InterruptedArtifact } from "../../shared/recovery";

export function InterruptedArtifactsPanel({ artifacts, canPreserve, busy, onPreserve }: {
  artifacts: InterruptedArtifact[]; canPreserve: boolean; busy: boolean; onPreserve(): void;
}) {
  if (!artifacts.length && !canPreserve) return null;
  return <section className="space-y-3 rounded border p-4" data-testid="interrupted-artifacts">
    <h2 className="text-lg font-semibold">Interrupted and preserved files</h2>
    <p>These files may be incomplete. An available snapshot still needs its saved credentials and structural checks.
      Keep original backups and compare the recovered book with your statements.</p>
    <table className="w-full text-left"><thead><tr><th>Artifact</th><th>Kind</th><th>Recovery</th></tr></thead>
      <tbody>{artifacts.map((artifact) => <tr key={artifact.id}>
        <td className="break-all"><code>{artifact.id}</code>{artifact.preserved ? " (preserved)" : ""}</td>
        <td>{artifact.kind}</td><td>{artifact.canAttemptRecovery ? "Snapshot candidate" : "Keep files; use a backup or original source"}</td>
      </tr>)}</tbody></table>
    {canPreserve ? <>
      <p>Preserve unfinished setup files under new names so you can choose a fresh setup. Their contents stay available.
        A native confirmation appears before anything moves.</p>
      <button className="rounded border px-4 py-2 disabled:opacity-50" disabled={busy} onClick={onPreserve}
        data-testid="preserve-interrupted-setup">Preserve unfinished setup files</button>
    </> : null}
  </section>;
}
