// @vitest-environment jsdom
import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InvestmentImportWizard } from "./InvestmentImportWizard";

const invoke = vi.fn();
beforeEach(() => {
  invoke.mockReset();
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
});
async function upload() {
  render(<InvestmentImportWizard isOpen onClose={vi.fn()} portfolioId="portfolio" />);
  fireEvent.change(screen.getByLabelText("Choose CSV File"), { target: { files: [new File(["Date,Type,Ticker,Quantity,Price,Amount,Fee,Description,Id\n2026-01-02,buy,ABC,1,10,10,1,Trade,id-1"], "statement.csv", { type: "text/csv" })] } });
  await screen.findByText("Validate & Preview");
}
it("maps source IDs and commissions and makes additional matching transactions an explicit stable review choice", async () => {
  invoke.mockResolvedValue({ success: true, validation: { valid: true, errors: [], rowCount: 1, preview: [{ row: 2, date: "2026-01-02", type: "buy", ticker: "ABC", amount: 10, fee: 1, sourceId: "id-1", status: "review" }] } });
  await upload();
  fireEvent.change(screen.getByLabelText("Broker transaction ID"), { target: { value: "Id" } });
  fireEvent.change(screen.getByLabelText("Fee Column"), { target: { value: "Fee" } });
  fireEvent.click(screen.getByText("Validate & Preview"));
  await screen.findByLabelText("Import row 2 as an additional transaction");
  fireEvent.click(screen.getByLabelText("Import row 2 as an additional transaction"));
  invoke.mockResolvedValue({ success: true, imported: 1, skipped: 0, errors: [] });
  fireEvent.click(screen.getByText("Import Transactions"));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("import-investment-transactions", expect.objectContaining({
    mapping: expect.objectContaining({ sourceId: "Id", fee: "Fee" }), options: expect.objectContaining({ additionalRows: [2], reviewId: expect.any(String) }),
  })));
});
it("shows row failures after a partial import and preserves the review identifier for retry", async () => {
  invoke.mockResolvedValue({ success: true, validation: { valid: true, errors: [], rowCount: 1, preview: [{ row: 2, date: "2026-01-02", type: "buy", ticker: "ABC", amount: 10, fee: 1, status: "new" }] } });
  await upload();
  fireEvent.click(screen.getByText("Validate & Preview")); await screen.findByText("Import Transactions");
  invoke.mockResolvedValue({ success: true, imported: 0, skipped: 1, errors: [{ row: 2, error: "Synthetic position failure" }] });
  fireEvent.click(screen.getByText("Import Transactions"));
  await screen.findByText(/Synthetic position failure/);
  expect(screen.getByText("Review again")).toBeTruthy();
});
it("sends an explicitly selected cash account instead of guessing currency in a multi-currency portfolio", async () => {
  invoke.mockImplementation(async (channel) => channel === "get-portfolio-accounts" ? { success: true, accounts: { tradeCashAccounts: [
    { id: "usd", name: "Trade Cash USD", currency: "USD" }, { id: "cad", name: "Trade Cash CAD", currency: "CAD" },
  ] } } : channel === "validate-import-data" ? { success: true, validation: { valid: true, rowCount: 1, errors: [], preview: [] } }
    : { success: true, imported: 1, skipped: 0, errors: [] });
  await upload();
  await screen.findByRole("option", { name: "Trade Cash CAD (CAD)" });
  fireEvent.change(screen.getByLabelText("Trade cash account"), { target: { value: "cad" } });
  fireEvent.click(screen.getByText("Validate & Preview")); await screen.findByText("Import Transactions");
  fireEvent.click(screen.getByText("Import Transactions"));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("import-investment-transactions", expect.objectContaining({ options: expect.objectContaining({ tradeCashAccountId: "cad" }) })));
});
