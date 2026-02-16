// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AutoCategorizationRules } from "./AutoCategorizationRules";

const mockGetAutoCategorizationRules = vi.fn();
const mockUpdateAutoCategorizationRule = vi.fn();
const mockDeleteAutoCategorizationRule = vi.fn();
const mockInvoke = vi.fn();

describe("AutoCategorizationRules", () => {
  beforeEach(() => {
    mockGetAutoCategorizationRules.mockReset();
    mockUpdateAutoCategorizationRule.mockReset();
    mockDeleteAutoCategorizationRule.mockReset();
    mockInvoke.mockReset();

    Object.defineProperty(window, "electron", {
      writable: true,
      value: {
        getAutoCategorizationRules: mockGetAutoCategorizationRules,
        updateAutoCategorizationRule: mockUpdateAutoCategorizationRule,
        deleteAutoCategorizationRule: mockDeleteAutoCategorizationRule,
        ipcRenderer: {
          invoke: mockInvoke,
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

  it("edits a rule with pattern, match type, and target category", async () => {
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
    ]);
    mockInvoke.mockResolvedValue({
      success: true,
      accounts: [
        { id: "cat-1", name: "Dining Out" },
        { id: "cat-2", name: "Groceries" },
      ],
    });
    mockUpdateAutoCategorizationRule.mockResolvedValue({
      id: "rule-1",
      pattern: "coffee run",
      matchType: "exact",
      targetCategoryAccountId: "cat-2",
      targetCategoryName: "Groceries",
      lastUpdatedAt: "2026-02-12T10:00:00.000Z",
      status: "Valid",
    });

    render(<AutoCategorizationRules />);

    await waitFor(() => {
      expect(screen.getByTestId("auto-categorization-edit-rule-1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("auto-categorization-edit-rule-1"));

    await waitFor(() => {
      expect(screen.getByTestId("auto-categorization-edit-modal")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("auto-categorization-edit-pattern"), {
      target: { value: "coffee run" },
    });
    fireEvent.change(screen.getByTestId("auto-categorization-edit-match-type"), {
      target: { value: "exact" },
    });
    fireEvent.change(screen.getByTestId("auto-categorization-edit-target"), {
      target: { value: "cat-2" },
    });

    fireEvent.click(screen.getByTestId("auto-categorization-save-button"));

    await waitFor(() => {
      expect(mockUpdateAutoCategorizationRule).toHaveBeenCalledWith("rule-1", {
        pattern: "coffee run",
        matchType: "exact",
        targetCategoryAccountId: "cat-2",
      });
    });
  });

  it("shows update validation errors and supports delete confirmation", async () => {
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
    ]);
    mockInvoke.mockResolvedValue({
      success: true,
      accounts: [{ id: "cat-1", name: "Dining Out" }],
    });
    mockUpdateAutoCategorizationRule.mockRejectedValue(
      new Error("Rule with same pattern and match type already exists")
    );
    mockDeleteAutoCategorizationRule.mockResolvedValue({ success: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<AutoCategorizationRules />);

    await waitFor(() => {
      expect(screen.getByTestId("auto-categorization-edit-rule-1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("auto-categorization-edit-rule-1"));
    await waitFor(() => {
      expect(screen.getByTestId("auto-categorization-save-button")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("auto-categorization-save-button"));

    await waitFor(() => {
      expect(screen.getByText("Rule with same pattern and match type already exists")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("auto-categorization-delete-rule-1"));

    await waitFor(() => {
      expect(mockDeleteAutoCategorizationRule).toHaveBeenCalledWith("rule-1");
    });
  });
});
