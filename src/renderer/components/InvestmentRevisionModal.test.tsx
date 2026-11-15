// @vitest-environment jsdom
import React from "react";
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InvestmentRevisionModal from "./InvestmentRevisionModal";

it("opens retained originals on demand and labels voided activity", async () => {
  const revision = { id: "r1", reason: "Broker reversed the sale", createdAt: "2026-01-05T12:00:00Z" };
  const invoke = vi.fn(async (channel: string, _input: unknown) => channel === "list-investment-revisions"
    ? { success: true, revisions: [revision], hasMore: false }
    : { success: true, revision: { ...revision, action: "Void", changes: [{
      before: { id: "old", kind: "sell", date: "2026-01-03", currency: "CAD", quantityAfter: 5, basisAfter: 50,
        cashAmount: 75, realizedGain: 25, journals: [{ id: "journal", description: "Original sale", lines: [{ id: "line", account: "Broker cash", amount: 75, currency: "CAD" }] }] }, after: null,
    }] } });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  render(<InvestmentRevisionModal accountId="abc" onClose={vi.fn()} />);
  const row = await screen.findByRole("button", { name: /broker reversed the sale/i });
  expect(invoke).toHaveBeenCalledTimes(1);
  fireEvent.click(row);
  expect(await screen.findByText("No replacement — voided")).toBeTruthy();
  expect(screen.getByText("Original sale")).toBeTruthy();
  expect(screen.getByText(/Broker cash.*CAD 75.00/)).toBeTruthy();
  expect(invoke).toHaveBeenLastCalledWith("read-investment-revision", { accountId: "abc", revisionId: "r1" });
});
