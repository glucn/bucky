// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Navbar from "./Navbar";

describe("Navbar enrichment panel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    (globalThis.window as any).electron = {
      ...((globalThis.window as any).electron || {}),
      getEnrichmentPanelState: vi.fn().mockResolvedValue({
        activeRun: null,
        latestSummary: null,
        freshness: {
          metadata: null,
          prices: null,
          fx: null,
        },
      }),
      getEnrichmentConfigState: vi.fn().mockResolvedValue({
        providerConfigured: false,
        baseCurrencyConfigured: false,
      }),
      startEnrichmentRun: vi.fn().mockResolvedValue({ createdNewRun: true, run: { id: "run-1" } }),
      getEnrichmentRunSummary: vi.fn().mockResolvedValue({
        id: "run-1",
        status: "completed",
      }),
      sendEnrichmentRunToBackground: vi.fn().mockResolvedValue({ success: true }),
      getBaseCurrencyImpactState: vi.fn().mockResolvedValue({
        baseCurrency: "CAD",
        reconciliation: {
          targetBaseCurrency: "CAD",
          status: "pending",
          changedAt: "2026-02-20T10:00:00.000Z",
        },
      }),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens panel and shows disabled message when config is incomplete", async () => {
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId("open-enrichment-panel"));

    await waitFor(() => {
      expect(screen.getByTestId("enrichment-panel")).toBeTruthy();
    });

    expect(screen.getByTestId("enrichment-disabled-message")).toBeTruthy();
    expect(screen.getByTestId("start-enrichment-run").hasAttribute("disabled")).toBe(true);
  });

  it("shows completion toast after continuing run in background", async () => {
    (globalThis.window as any).electron.getEnrichmentPanelState = vi.fn().mockResolvedValue({
      activeRun: {
        id: "run-1",
        status: "running",
        categoryProgress: {
          securityMetadata: { total: 1, processed: 0 },
          securityPrices: { total: 0, processed: 0 },
          fxRates: { total: 0, processed: 0 },
        },
        failedItems: [],
      },
      latestSummary: null,
      freshness: { metadata: null, prices: null, fx: null },
    });
    (globalThis.window as any).electron.getEnrichmentConfigState = vi.fn().mockResolvedValue({
      providerConfigured: true,
      baseCurrencyConfigured: true,
    });

    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId("open-enrichment-panel"));
    await waitFor(() => expect(screen.getByTestId("continue-in-background")).toBeTruthy());
    fireEvent.click(screen.getByTestId("continue-in-background"));

    await waitFor(() => {
      expect(screen.getByTestId("enrichment-background-toast")).toBeTruthy();
    }, { timeout: 3000 });
  });

  it("shows global base currency warning banner with session dismiss", async () => {
    const { unmount } = render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("base-currency-warning-banner")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("base-currency-dismiss"));
    expect(screen.queryByTestId("base-currency-warning-banner")).toBeNull();

    unmount();

    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("base-currency-warning-banner")).toBeTruthy();
    });
  });

  it("uses FX-only scope when opening refresh from warning banner", async () => {
    (globalThis.window as any).electron.getEnrichmentConfigState = vi.fn().mockResolvedValue({
      providerConfigured: true,
      baseCurrencyConfigured: true,
    });

    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("base-currency-refresh-fx")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("base-currency-refresh-fx"));
    await waitFor(() => expect(screen.getByTestId("enrichment-panel")).toBeTruthy());

    fireEvent.click(screen.getByTestId("start-enrichment-run"));

    await waitFor(() => {
      expect((globalThis.window as any).electron.startEnrichmentRun).toHaveBeenCalledWith({
        securityMetadata: false,
        securityPrices: false,
        fxRates: true,
      });
    });
  });

  it("keeps full scope for normal refresh entry path", async () => {
    (globalThis.window as any).electron.getEnrichmentConfigState = vi.fn().mockResolvedValue({
      providerConfigured: true,
      baseCurrencyConfigured: true,
    });

    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId("open-enrichment-panel"));
    await waitFor(() => expect(screen.getByTestId("enrichment-panel")).toBeTruthy());
    fireEvent.click(screen.getByTestId("start-enrichment-run"));

    await waitFor(() => {
      expect((globalThis.window as any).electron.startEnrichmentRun).toHaveBeenCalledWith({
        securityMetadata: true,
        securityPrices: true,
        fxRates: true,
      });
    });
  });
});
