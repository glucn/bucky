// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
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
    };
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
});
