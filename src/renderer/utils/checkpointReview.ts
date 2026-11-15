import type { CheckpointReview } from "../../shared/checkpointReview";
import { formatValuationAmount } from "./valuationFormatting";

export async function saveCheckpointAfterReview(input: { accountId: string; date: string; balance: number; description?: string }) {
  const result = await window.electron.ipcRenderer.invoke("review-checkpoint", input);
  if (!result.success) return result;
  const preview: CheckpointReview = result.preview;
  if (preview.adjustmentAmount !== 0) {
    const money = (amount: number) => formatValuationAmount(amount, preview.currency, { disambiguate: true });
    const confirmed = window.confirm([
      `Journal balance ${money(preview.journalBalance)}`,
      `Statement balance ${money(preview.statementBalance)}`,
      `Adjustment ${money(preview.adjustmentAmount)}`,
      "",
      "Post this adjustment and save the checkpoint?",
    ].join("\n"));
    if (!confirmed) return null;
  }
  return window.electron.ipcRenderer.invoke("create-checkpoint", { ...input, reviewToken: preview.token });
}
