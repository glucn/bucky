import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  removeHandler,
  handle,
  getRulesForSettings,
  updateRule,
  deleteRule,
  prismaClient,
} = vi.hoisted(() => ({
  removeHandler: vi.fn(),
  handle: vi.fn(),
  getRulesForSettings: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
  prismaClient: {},
}));

vi.mock("electron", () => ({
  ipcMain: {
    removeHandler,
    handle,
  },
}));

vi.mock("../services/autoCategorizationService", () => ({
  autoCategorizationService: {
    getRulesForSettings,
    updateRule,
    deleteRule,
  },
}));

vi.mock("../services/database", () => ({
  databaseService: {
    prismaClient,
  },
}));

import { setupAutoCategorizationIpcHandlers } from "./ipcHandlers.autoCategorization";

describe("setupAutoCategorizationIpcHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers list, update, and delete handlers", async () => {
    const listResult = [{ id: "rule-1" }];
    const updatedRule = { id: "rule-1", pattern: "coffee bean", matchType: "exact" };

    getRulesForSettings.mockResolvedValue(listResult);
    updateRule.mockResolvedValue(updatedRule);
    deleteRule.mockResolvedValue(undefined);

    setupAutoCategorizationIpcHandlers();

    expect(removeHandler).toHaveBeenCalledWith("get-auto-categorization-rules");
    expect(removeHandler).toHaveBeenCalledWith("update-auto-categorization-rule");
    expect(removeHandler).toHaveBeenCalledWith("delete-auto-categorization-rule");

    const listHandler = handle.mock.calls.find(
      ([channel]) => channel === "get-auto-categorization-rules"
    )?.[1];
    const updateHandler = handle.mock.calls.find(
      ([channel]) => channel === "update-auto-categorization-rule"
    )?.[1];
    const deleteHandler = handle.mock.calls.find(
      ([channel]) => channel === "delete-auto-categorization-rule"
    )?.[1];

    const listResponse = await listHandler({});
    const updateResponse = await updateHandler({}, {
      ruleId: "rule-1",
      update: {
        pattern: "coffee bean",
        matchType: "exact",
        targetCategoryAccountId: "cat-1",
      },
    });
    const deleteResponse = await deleteHandler({}, "rule-1");

    expect(getRulesForSettings).toHaveBeenCalledWith(prismaClient);
    expect(listResponse).toEqual(listResult);

    expect(updateRule).toHaveBeenCalledWith(
      "rule-1",
      {
        pattern: "coffee bean",
        matchType: "exact",
        targetCategoryAccountId: "cat-1",
      },
      prismaClient
    );
    expect(updateResponse).toEqual(updatedRule);

    expect(deleteRule).toHaveBeenCalledWith("rule-1", prismaClient);
    expect(deleteResponse).toEqual({ success: true });
  });

  it("propagates server-side validation failures for updates", async () => {
    setupAutoCategorizationIpcHandlers();

    const updateHandler = handle.mock.calls.find(
      ([channel]) => channel === "update-auto-categorization-rule"
    )?.[1];

    const duplicateError = new Error("Rule with same pattern and match type already exists");
    updateRule.mockRejectedValue(duplicateError);

    await expect(
      updateHandler({}, {
        ruleId: "rule-1",
        update: {
          pattern: "coffee bean",
          matchType: "exact",
          targetCategoryAccountId: "cat-1",
        },
      })
    ).rejects.toThrow("Rule with same pattern and match type already exists");
  });
});
