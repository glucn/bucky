// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

vi.mock("./components/Sidebar", () => ({
  default: () => <div data-testid="sidebar-mock" />,
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

describe("App settings route", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/settings/auto-categorization");
  });

  it("renders settings auto-categorization page and exposes navbar entry", () => {
    render(<App />);

    expect(screen.getByTestId("auto-categorization-settings-page")).toBeTruthy();
    const settingsLink = screen.getByRole("link", { name: "Settings" });
    expect(settingsLink.getAttribute("href")).toBe("/settings/auto-categorization");
  });
});
