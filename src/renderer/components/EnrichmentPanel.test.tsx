// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EnrichmentPanel } from "./EnrichmentPanel";

describe("EnrichmentPanel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    (globalThis.window as any).electron = {
      getEnrichmentPanelState: vi.fn().mockResolvedValue({
        activeRun: {
          id: "run-1",
          status: "completed_with_issues",
          categoryProgress: {
            securityMetadata: { processed: 1, total: 1 },
            securityPrices: { processed: 1, total: 1 },
            fxRates: { processed: 0, total: 1 },
          },
          failedItems: [
            {
              category: "fxRates",
              identifier: "CAD/USD",
              reason: "Timeout",
            },
          ],
        },
        latestSummary: null,
        freshness: {
          metadata: null,
          prices: null,
          fx: null,
        },
      }),
      getEnrichmentConfigState: vi.fn().mockResolvedValue({
        providerConfigured: true,
        baseCurrencyConfigured: true,
      }),
      startEnrichmentRun: vi.fn(),
    };

    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders failed items and copies details", async () => {
    render(<EnrichmentPanel isOpen onClose={() => undefined} />);

    await waitFor(() => expect(screen.getByTestId("enrichment-failed-items-list")).toBeTruthy());

    fireEvent.click(screen.getByTestId("copy-failure-details"));

    await waitFor(() => {
      expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalled();
    });
  });

  it("polls panel state and refreshes progress", async () => {
    (globalThis.window as any).electron.getEnrichmentPanelState = vi
      .fn()
      .mockResolvedValueOnce({
        activeRun: {
          id: "run-1",
          status: "running",
          categoryProgress: {
            securityMetadata: { processed: 0, total: 0 },
            securityPrices: { processed: 0, total: 0 },
            fxRates: { processed: 0, total: 0 },
          },
          failedItems: [],
        },
        latestSummary: null,
        freshness: { metadata: null, prices: null, fx: null },
      })
      .mockResolvedValue({
        activeRun: null,
        latestSummary: {
          id: "run-1",
          status: "completed",
          categoryProgress: {
            securityMetadata: { processed: 0, total: 0 },
            securityPrices: { processed: 0, total: 0 },
            fxRates: { processed: 1, total: 1 },
          },
          failedItems: [],
        },
        freshness: { metadata: null, prices: null, fx: null },
      });

    render(<EnrichmentPanel isOpen onClose={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByText("FX: 0/0 (Done)")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText("FX: 1/1 (Done)")).toBeTruthy();
    }, { timeout: 2500 });

  });

  it("shows starting spinner until next poll after refresh click", async () => {
    (globalThis.window as any).electron.getEnrichmentPanelState = vi
      .fn()
      .mockResolvedValueOnce({
        activeRun: {
          id: "run-2",
          status: "running",
          categoryProgress: {
            securityMetadata: { processed: 0, total: 0 },
            securityPrices: { processed: 0, total: 0 },
            fxRates: { processed: 0, total: 0 },
          },
          failedItems: [],
        },
        latestSummary: null,
        freshness: { metadata: null, prices: null, fx: null },
      })
      .mockResolvedValue({
        activeRun: {
          id: "run-2",
          status: "running",
          categoryProgress: {
            securityMetadata: { processed: 0, total: 0 },
            securityPrices: { processed: 0, total: 0 },
            fxRates: { processed: 1, total: 1 },
          },
          failedItems: [],
        },
        latestSummary: null,
        freshness: { metadata: null, prices: null, fx: null },
      });
    (globalThis.window as any).electron.startEnrichmentRun = vi.fn().mockResolvedValue({
      createdNewRun: true,
      run: { id: "run-2" },
    });

    render(<EnrichmentPanel isOpen onClose={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByText("FX: 0/0 (Done)")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("start-enrichment-run"));

    expect(screen.getByTestId("enrichment-run-loading")).toBeTruthy();
    expect(screen.queryByText("FX: 0/0 (Done)")).toBeNull();

    await waitFor(() => {
      expect(screen.getByText("FX: 1/1 (Done)")).toBeTruthy();
    }, { timeout: 2500 });
  });
});
