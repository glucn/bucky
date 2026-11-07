// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { PortfolioDetailsPage } from "./PortfolioDetailsPage";
import { PerformanceReportsPage } from "./PerformanceReportsPage";
vi.mock("../context/AccountsContext", () => ({ useAccounts: () => ({ refreshAccounts: vi.fn() }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const position = { accountId: "holding", tickerSymbol: "ABC", market: "NASDAQ", currency: "USD", quantity: 1, costBasis: 20, costBasisBase: 30, marketValue: 30, marketValueBase: 45, unrealizedGain: 10, unrealizedGainPercent: 50 };
const gain = { entryId: "sale", date: "2026-01-03", accountId: "holding", tickerSymbol: "ABC", market: "NASDAQ", currency: "USD", baseCurrency: "CAD", quantity: 1, costBasis: 20, saleProceeds: 29, realizedGain: 9, realizedGainBase: 13.5, holdingPeriod: "short" };
function bridge(gains: unknown[] = [gain], fail = false) {
  Object.defineProperty(window, "electron", { configurable: true, value: {
    getBaseCurrencyImpactState: vi.fn().mockResolvedValue({ baseCurrency: "CAD" }),
    ipcRenderer: { invoke: vi.fn(async (channel) => {
      if (channel === "get-account-groups") return { success: true, groups: [{ id: "book", name: "Currency book" }, { id: "book2", name: "Second book" }] };
      if (channel === "get-portfolio-value") return { success: true, value: { totalMarketValue: 45, totalCostBasis: 30, cashBalance: 100, totalUnrealizedGain: 15, totalUnrealizedGainPercent: 50, cashBalancesByCurrency: { CAD: 100 }, securityMarketValueByCurrency: { USD: 30 } } };
      if (channel === "get-all-positions") return { success: true, positions: [position] };
      if (channel === "get-realized-gains") return fail ? { success: false, error: "Sale journal requires review" } : { success: true, baseCurrency: "CAD", gains };
      if (channel === "get-dividend-income") return { success: true, income: { total: 6, baseCurrency: "CAD", byCurrency: { USD: 4 } } };
      if (channel === "get-asset-allocation") return { success: true, allocation: [] };
      if (channel === "get-portfolio-performance") return { success: true, performance: { baseCurrency: "CAD", incomeByCurrency: { dividends: { USD: 4 }, interest: { USD: 3 }, fees: {} }, totalReturn: null, totalReturnPercent: null, realizedGains: null, unrealizedGains: 15, dividendIncome: null, interestIncome: 4.5, fees: 0, deposits: 100, withdrawals: 0, currentValue: 145 } };
      return { success: false };
    }) },
  } });
  return vi.mocked(window.electron.ipcRenderer.invoke);
}
function show(reports = false) {
  render(<MemoryRouter initialEntries={[reports ? "/investments/book/reports" : "/investments/book"]}><Routes>
    <Route path="/investments/:portfolioId" element={<PortfolioDetailsPage />} />
    <Route path="/investments/:portfolioId/reports" element={<PerformanceReportsPage />} />
  </Routes></MemoryRouter>);
}
it("sums converted gains in base while retaining the native currency on holding gains", async () => {
  bridge(); show();
  const card = (await screen.findByText("Realized Gain/Loss")).parentElement!;
  expect(card.textContent).toContain("13.50"); expect(card.textContent).not.toContain("9.00");
  const row = (await screen.findByText("ABC")).closest("tr")!;
  expect(row.textContent).toMatch(/USD\s*10\.00/); expect(row.textContent).not.toContain("CA$10.00");
});
it("shows an unavailable gain total when any conversion is missing", async () => {
  bridge([{ ...gain, realizedGainBase: null }]); show();
  expect((await screen.findByText("Realized Gain/Loss")).parentElement!.textContent).toContain("N/A");
});
it("shows a report failure without presenting it as a zero gain", async () => {
  bridge([], true); show();
  expect((await screen.findByText("Realized Gain/Loss")).parentElement!.textContent).toContain("N/A");
  expect((await screen.findByRole("alert")).textContent).toContain("Sale journal requires review");
});
it("retains legacy sale facts in their native currency without inventing quantity, and keeps partial income unavailable", async () => {
  bridge([{ ...gain, quantity: null, saleProceeds: 15, realizedGain: 10, otherCategoryAmount: 15, realizedGainBase: null, holdingPeriod: "unknown" }]); show(true);
  const income = (await screen.findByText("Income", { exact: true })).parentElement!;
  expect(within(income).getByText("N/A", { exact: true })).toBeTruthy();
  const row = (await screen.findByText("ABC")).closest("tr")!;
  expect(row.textContent).toContain("NASDAQ"); expect(row.textContent).toMatch(/USD\s*20\.00/); expect(row.textContent).toContain("N/A");
  expect(row.textContent).not.toContain("CA$20.00");
  expect(row.textContent).toContain("Other category postings:");
});
it("does not let a late response replace another portfolio's report", async () => {
  const invoke = bridge(), original = invoke.getMockImplementation()!;
  let release!: (value: unknown) => void;
  const pending = new Promise((resolve) => { release = resolve; });
  invoke.mockImplementation((channel: string, ...args: any[]) => channel === "get-realized-gains" && args[0].portfolioId === "book" ? pending : original(channel, ...args));
  function Switch() { const navigate = useNavigate(); return <button onClick={() => navigate("/investments/book2")}>Second portfolio</button>; }
  render(<MemoryRouter initialEntries={["/investments/book"]}><Switch /><Routes><Route path="/investments/:portfolioId" element={<PortfolioDetailsPage />} /></Routes></MemoryRouter>);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("get-realized-gains", expect.objectContaining({ portfolioId: "book" })));
  fireEvent.click(screen.getByRole("button", { name: "Second portfolio" }));
  await screen.findByText("Second book");
  await act(async () => { release({ success: true, gains: [{ ...gain, realizedGain: 99, realizedGainBase: 99 }] }); await pending; });
  expect((await screen.findByText("Realized Gain/Loss")).parentElement!.textContent).toContain("13.50");
  expect((await screen.findByText("Realized Gain/Loss")).parentElement!.textContent).not.toContain("99.00");
});
it("shows native and converted sale values side by side using the sale calendar date", async () => {
  bridge(); show(true);
  expect(await screen.findByRole("columnheader", { name: "Gain/Loss (Base)" })).toBeTruthy();
  const row = (await screen.findByText("ABC")).closest("tr")!;
  expect(row.textContent).toMatch(/USD\s*9\.00/); expect(row.textContent).toMatch(/CAD\s*13\.50/);
  expect(row.textContent).toContain("1/3/2026");
});
it("does not describe a failed realized-gain report as no activity", async () => {
  bridge([], true); show(true);
  expect((await screen.findByRole("alert")).textContent).toContain("Sale journal requires review");
  expect(screen.queryByText("No realized gains/losses in this period")).toBeNull();
});
it("retains visible native income amounts when a base total is incomplete", async () => {
  bridge(); show(true);
  const income = (await screen.findByText("Income", { exact: true })).parentElement!;
  expect(income.textContent).toMatch(/USD\s*4\.00/); expect(income.textContent).toMatch(/USD\s*3\.00/);
  expect(within(income).getByText("N/A", { exact: true })).toBeTruthy();
});
it("keeps allocation unavailable when holding currencies could not be loaded", async () => {
  const invoke = bridge(), original = invoke.getMockImplementation()!;
  invoke.mockImplementation((channel: string, ...args: any[]) => channel === "get-all-positions" ? Promise.resolve({ success: false, error: "Holdings unavailable" }) : channel === "get-asset-allocation" ? Promise.resolve({ success: true, allocation: [{ accountId: "holding", tickerSymbol: "ABC", marketValue: 30, percentOfPortfolio: 100 }] }) : original(channel, ...args));
  show(true);
  const section = (await screen.findByRole("heading", { name: "Asset Allocation" })).parentElement!;
  expect(section.textContent).toContain("Allocation data is unavailable"); expect(section.textContent).not.toContain("CAD 30.00");
});
it("uses the response currency even when the report has no rows", async () => {
  bridge([]); show();
  expect((await screen.findByText("Realized Gain/Loss")).parentElement!.textContent).toContain("CA$0.00");
});
