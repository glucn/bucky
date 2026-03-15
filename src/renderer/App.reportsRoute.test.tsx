// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

vi.mock("./components/Sidebar", () => ({
  default: () => <div data-testid="sidebar-mock" />,
}));

vi.mock("./components/Navbar", () => ({
  default: () => <div data-testid="navbar-mock" />,
}));

vi.mock("./pages/Accounts", () => ({
  Accounts: () => <div data-testid="accounts-page" />,
}));

vi.mock("./pages/Dashboard", () => ({
  Dashboard: () => <div data-testid="dashboard-page" />,
}));

vi.mock("./pages/AccountTransactionsPage", () => ({
  AccountTransactionsPage: () => <div data-testid="transactions-page" />,
}));

vi.mock("./pages/Checkpoints", () => ({
  Checkpoints: () => <div data-testid="checkpoints-page" />,
}));

vi.mock("./pages/Categories", () => ({
  Categories: () => <div data-testid="categories-page" />,
}));

vi.mock("./pages/InvestmentPortfolios", () => ({
  InvestmentPortfolios: () => <div data-testid="investment-portfolios-page" />,
}));

vi.mock("./pages/PortfolioDetailsPage", () => ({
  PortfolioDetailsPage: () => <div data-testid="portfolio-details-page" />,
}));

vi.mock("./pages/PositionDetailsPage", () => ({
  PositionDetailsPage: () => <div data-testid="position-details-page" />,
}));

vi.mock("./pages/PerformanceReportsPage", () => ({
  PerformanceReportsPage: () => <div data-testid="performance-reports-page" />,
}));

vi.mock("./pages/ReportsPage", () => ({
  ReportsPage: () => <div data-testid="reports-page" />,
}));

vi.mock("./pages/AutoCategorizationRules", () => ({
  AutoCategorizationRules: () => <div data-testid="auto-categorization-settings-page" />,
}));

describe("App reports route", () => {
  beforeEach(() => {
    Object.defineProperty(window, "electron", {
      writable: true,
      value: {
        getBaseCurrencyImpactState: vi.fn().mockResolvedValue({ baseCurrency: "USD", reconciliation: null }),
        ipcRenderer: {
          invoke: vi.fn(),
          on: vi.fn(),
        },
      },
    });
  });

  it("renders /reports route separately from investment portfolio reports", () => {
    window.history.pushState({}, "", "/reports");
    render(<App />);

    expect(screen.getByTestId("reports-page")).toBeTruthy();
    expect(screen.queryByTestId("performance-reports-page")).toBeNull();
  });
});
