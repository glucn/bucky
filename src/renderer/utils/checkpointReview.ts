import type { CheckpointReconciliationReview, CheckpointReview } from "../../shared/checkpointReview";
import { formatValuationAmount } from "./valuationFormatting";

const money = (preview: CheckpointReview, amount: number) =>
  formatValuationAmount(amount, preview.currency, { disambiguate: true });

export async function saveCheckpointAfterReview(input: { accountId: string; date: string; balance: number; description?: string }) {
  const result = await window.electron.ipcRenderer.invoke("review-checkpoint", input);
  if (!result.success) return result;
  const preview: CheckpointReview = result.preview;
  if (preview.adjustmentAmount !== 0) {
    const confirmed = window.confirm([
      `Journal balance ${money(preview, preview.journalBalance)}`,
      `Statement balance ${money(preview, preview.statementBalance)}`,
      `Adjustment ${money(preview, preview.adjustmentAmount)}`,
      "",
      "Post this adjustment and save the checkpoint?",
    ].join("\n"));
    if (!confirmed) return null;
  }
  return window.electron.ipcRenderer.invoke("create-checkpoint", { ...input, reviewToken: preview.token });
}

export async function reconcileCheckpointAfterReview(checkpointId: string) {
  const result = await window.electron.ipcRenderer.invoke("review-checkpoint-reconciliation", checkpointId);
  if (!result.success) return result;
  const preview: CheckpointReconciliationReview = result.preview;
  const confirmed = window.confirm([
    `Journal excluding this adjustment ${money(preview, preview.journalBalance)}`,
    `Statement balance ${money(preview, preview.statementBalance)}`,
    ...(preview.previousAdjustmentAmount === null ? [] : [`Existing adjustment ${money(preview, preview.previousAdjustmentAmount)}`]),
    `Replacement adjustment ${money(preview, preview.adjustmentAmount)}`,
    "",
    "Reconcile this checkpoint with the replacement adjustment?",
  ].join("\n"));
  if (!confirmed) return null;
  return window.electron.ipcRenderer.invoke("reconcile-checkpoint", { checkpointId, reviewToken: preview.token });
}
