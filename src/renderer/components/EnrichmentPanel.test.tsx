// @vitest-environment jsdom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EnrichmentPanel } from "./EnrichmentPanel";

describe("EnrichmentPanel", () => {
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
});
