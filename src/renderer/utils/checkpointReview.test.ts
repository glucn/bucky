// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { saveCheckpointAfterReview } from "./checkpointReview";

const draft = { accountId: "cash", date: "2026-11-01", balance: 20 };

it("shows the statement discrepancy and leaves a cancelled review unwritten", async () => {
  const invoke = vi.fn().mockResolvedValue({ success: true, preview: {
    currency: "CAD", statementBalance: 20, journalBalance: 12, adjustmentAmount: 8, token: "review-1",
  } });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  try {
    expect(await saveCheckpointAfterReview(draft)).toBeNull();
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/Journal balance CAD 12\.00[\s\S]*Statement balance CAD 20\.00[\s\S]*Adjustment CAD 8\.00/));
    expect(invoke).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    await saveCheckpointAfterReview(draft);
    expect(invoke).toHaveBeenLastCalledWith("create-checkpoint", { ...draft, reviewToken: "review-1" });
  } finally {
    confirm.mockRestore();
  }
});
