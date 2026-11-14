// @vitest-environment jsdom
import React from "react";
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InvestmentCorrectionModal from "./InvestmentCorrectionModal";

it("invalidates reviewed changes when edited and preserves the correction draft on save refusal", async () => {
  const invoke = vi.fn(async (channel: string, _params: unknown) => channel === "get-investment-trade-correction"
    ? { success: true, trade: { activityId: "trade", date: "2026-01-01", quantity: 10, pricePerShare: 10, fee: 0, currency: "CAD", ticker: "ABC", kind: "buy" } }
    : channel === "preview-investment-trade-correction"
      ? { success: true, preview: { reviewToken: "review", before: { quantity: 5, costBasis: 50 }, after: { quantity: 5, costBasis: 60 }, affected: [] } }
      : { success: false, error: "Ledger changed. Preview again." });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  const onSaved = vi.fn();
  render(<InvestmentCorrectionModal accountId="holding" entryId="entry" onCancel={vi.fn()} onSaved={onSaved} />);
  const price = await screen.findByLabelText("Price per share (CAD)");
  const save = screen.getByRole("button", { name: "Save correction" }) as HTMLButtonElement;
  const preview = screen.getByRole("button", { name: "Preview correction" });
  fireEvent.change(price, { target: { value: "12" } });
  fireEvent.change(screen.getByLabelText("Correction reason"), { target: { value: "Broker confirmation" } });
  expect(save.disabled).toBe(true);
  fireEvent.click(preview);
  await screen.findByText("CAD 50.00 → CAD 60.00");
  expect(save.disabled).toBe(false);
  fireEvent.change(price, { target: { value: "13" } });
  expect(save.disabled).toBe(true);
  fireEvent.click(preview);
  await screen.findByText("CAD 50.00 → CAD 60.00");
  fireEvent.click(save);
  expect((await screen.findByRole("alert")).textContent).toContain("Ledger changed");
  expect(invoke).toHaveBeenLastCalledWith("save-investment-trade-correction", {
    correction: { activityId: "trade", date: "2026-01-01", quantity: 10, pricePerShare: 13, fee: 0 },
    reviewToken: "review", reason: "Broker confirmation",
  });
  expect(save.disabled).toBe(true);
  expect((price as HTMLInputElement).value).toBe("13");
  expect(onSaved).not.toHaveBeenCalled();
});
