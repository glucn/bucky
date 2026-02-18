import { describe, expect, it } from "vitest";
import {
  resolveSecuritySelection,
  type SecurityResolutionOutcome,
} from "./securityResolutionService";

describe("resolveSecuritySelection", () => {
  it("auto-selects when exactly one candidate exists", () => {
    const outcome = resolveSecuritySelection([
      {
        symbol: "AAPL",
        market: "NASDAQ",
        displayName: "Apple Inc.",
        quoteCurrency: "USD",
      },
    ]);

    expect(outcome).toEqual<SecurityResolutionOutcome>({
      status: "auto_selected",
      selectedCandidate: {
        symbol: "AAPL",
        market: "NASDAQ",
        displayName: "Apple Inc.",
        quoteCurrency: "USD",
      },
      candidates: [],
      warningMessage: null,
    });
  });

  it("returns provider-ordered list for manual selection when multiple candidates exist", () => {
    const outcome = resolveSecuritySelection([
      {
        symbol: "SHOP",
        market: "NASDAQ",
        displayName: "Shopify Inc",
        quoteCurrency: "USD",
      },
      {
        symbol: "SHOP",
        market: "TSX",
        displayName: "Shopify Inc",
        quoteCurrency: "CAD",
      },
    ]);

    expect(outcome).toEqual<SecurityResolutionOutcome>({
      status: "manual_selection_required",
      selectedCandidate: null,
      candidates: [
        {
          symbol: "SHOP",
          market: "NASDAQ",
          displayName: "Shopify Inc",
          quoteCurrency: "USD",
        },
        {
          symbol: "SHOP",
          market: "TSX",
          displayName: "Shopify Inc",
          quoteCurrency: "CAD",
        },
      ],
      warningMessage: null,
    });
  });

  it("allows save with warning when no candidates exist", () => {
    const outcome = resolveSecuritySelection([]);

    expect(outcome).toEqual<SecurityResolutionOutcome>({
      status: "unresolved_allowed",
      selectedCandidate: null,
      candidates: [],
      warningMessage: "Enrichment data may be unavailable for this security until it is resolved.",
    });
  });
});
