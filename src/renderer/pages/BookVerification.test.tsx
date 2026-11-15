// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BookVerification } from "./BookVerification";

it("runs on demand and shows the records and amounts behind findings", async () => {
  const invoke = vi.fn().mockResolvedValue({ findings: [
    { severity: "error", code: "checkpoint-balance", accountId: "cash", checkpointId: "cp-1",
      date: "2026-11-01", currency: "CAD", expected: 200, actual: 188, message: "The journal balance differs" },
    { severity: "warning", code: "investment-legacy", accountId: "holding-1", message: "A reviewed baseline is needed" },
    { severity: "warning", code: "checkpoint-adjustment", accountId: "cash", checkpointId: "cp-2",
      date: "2026-11-02", currency: "CAD", amount: 12, unadjustedBalance: 188, journalEntryId: "adjustment-1",
      message: "An adjustment was posted to match the checkpoint balance" },
  ] });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  render(<BookVerification />);
  expect(invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Run verification" }));
  expect(await screen.findByRole("heading", { name: "Issues (1)" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Warnings (2)" })).toBeTruthy();
  expect(screen.getByText(/CAD 200\.00/)).toBeTruthy();
  expect(screen.getByText("Journal balance CAD 188.00")).toBeTruthy();
  expect(screen.getByText("Journal excluding this adjustment CAD 188.00")).toBeTruthy();
  expect(screen.getByText("Adjustment CAD 12.00")).toBeTruthy();
  expect(screen.getByText(/cp-1/)).toBeTruthy();
  expect(screen.getByText(/holding-1/)).toBeTruthy();
  expect(invoke).toHaveBeenCalledWith("verify-books");
});

it("clears failed checks on retry and reports a clean result only after completion", async () => {
  const invoke = vi.fn().mockRejectedValueOnce(new Error("Verification interrupted")).mockResolvedValueOnce({ findings: [] });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  render(<BookVerification />);
  const run = screen.getByRole("button", { name: "Run verification" });
  fireEvent.click(run);
  expect((await screen.findByRole("alert")).textContent).toContain("Verification interrupted");
  expect(screen.queryByText("No issues found in the checks run.")).toBeNull();
  fireEvent.click(run);
  expect(await screen.findByText("No issues found in the checks run.")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});
