// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AutoCategorizationRules } from "./AutoCategorizationRules";

const mockGetAutoCategorizationRules = vi.fn();

describe("AutoCategorizationRules", () => {
  beforeEach(() => {
    mockGetAutoCategorizationRules.mockReset();

    Object.defineProperty(window, "electron", {
      writable: true,
      value: {
        getAutoCategorizationRules: mockGetAutoCategorizationRules,
        ipcRenderer: {
          invoke: vi.fn(),
          on: vi.fn(),
        },
      },
    });
  });

  it("renders rules in a single table sorted by last updated desc with required columns", async () => {
    mockGetAutoCategorizationRules.mockResolvedValue([
      {
        id: "rule-older",
        pattern: "coffee bean",
        matchType: "keyword",
        targetCategoryAccountId: "cat-1",
        targetCategoryName: "Dining Out",
        lastUpdatedAt: "2026-02-01T10:00:00.000Z",
        status: "Valid",
      },
      {
        id: "rule-newer",
        pattern: "uber trip",
        matchType: "exact",
        targetCategoryAccountId: null,
        targetCategoryName: null,
        lastUpdatedAt: "2026-02-10T10:00:00.000Z",
        status: "Invalid target",
      },
    ]);

    render(<AutoCategorizationRules />);

    await waitFor(() => {
      expect(screen.getByText("Pattern")).toBeTruthy();
    });

    expect(screen.getByText("Match Type")).toBeTruthy();
    expect(screen.getByText("Target Category")).toBeTruthy();
    expect(screen.getByText("Last Updated")).toBeTruthy();
    expect(screen.getByText("Status")).toBeTruthy();

    const rows = screen.getAllByTestId(/auto-categorization-row-/);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("uber trip");
    expect(rows[1].textContent).toContain("coffee bean");
  });

  it("filters rules by pattern search", async () => {
    mockGetAutoCategorizationRules.mockResolvedValue([
      {
        id: "rule-1",
        pattern: "coffee bean",
        matchType: "keyword",
        targetCategoryAccountId: "cat-1",
        targetCategoryName: "Dining Out",
        lastUpdatedAt: "2026-02-01T10:00:00.000Z",
        status: "Valid",
      },
      {
        id: "rule-2",
        pattern: "uber trip",
        matchType: "exact",
        targetCategoryAccountId: "cat-2",
        targetCategoryName: "Transportation",
        lastUpdatedAt: "2026-02-10T10:00:00.000Z",
        status: "Valid",
      },
    ]);

    render(<AutoCategorizationRules />);

    await waitFor(() => {
      expect(screen.getByTestId("auto-categorization-search-input")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("auto-categorization-search-input"), {
      target: { value: "coffee" },
    });

    expect(screen.getByText("coffee bean")).toBeTruthy();
    expect(screen.queryByText("uber trip")).toBeNull();
  });
});
