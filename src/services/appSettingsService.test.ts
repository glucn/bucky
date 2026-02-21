import { beforeEach, describe, expect, it } from "vitest";
import { ALLOWED_BASE_CURRENCIES, appSettingsService } from "./appSettingsService";
import { databaseService } from "./database";

describe("AppSettingsService", () => {
  beforeEach(async () => {
    await databaseService.resetAllData();
  });

  it("stores and reads generic JSON settings by key", async () => {
    await appSettingsService.setAppSetting("enrichment.ui", {
      panelOpen: true,
      selectedScopes: ["metadata", "prices"],
    });

    const value = await appSettingsService.getAppSetting("enrichment.ui");

    expect(value).toEqual({
      panelOpen: true,
      selectedScopes: ["metadata", "prices"],
    });
  });

  it("updates an existing key with the latest JSON value", async () => {
    await appSettingsService.setAppSetting("baseCurrency", "USD");
    await appSettingsService.setAppSetting("baseCurrency", "CAD");

    const value = await appSettingsService.getAppSetting("baseCurrency");

    expect(value).toBe("CAD");
  });

  it("validates base currency only when consumed", async () => {
    await appSettingsService.setAppSetting("baseCurrency", "cad");
    await appSettingsService.setAppSetting("rawInvalidPayload", { foo: "bar" });

    expect(await appSettingsService.getBaseCurrency()).toBeNull();
    expect(await appSettingsService.getAppSetting("rawInvalidPayload")).toEqual({ foo: "bar" });

    await appSettingsService.setAppSetting("baseCurrency", "CAD");

    expect(await appSettingsService.getBaseCurrency()).toBe("CAD");
  });

  it("only accepts curated base currencies", async () => {
    await appSettingsService.setAppSetting("baseCurrency", "CHF");
    expect(await appSettingsService.getBaseCurrency()).toBeNull();

    await appSettingsService.setAppSetting("baseCurrency", "USD");
    expect(await appSettingsService.getBaseCurrency()).toBe("USD");
    expect(ALLOWED_BASE_CURRENCIES.includes("USD")).toBe(true);
  });

  it("reads valid base currency reconciliation state", async () => {
    await appSettingsService.setBaseCurrencyReconciliationState({
      targetBaseCurrency: "CAD",
      status: "pending",
      changedAt: "2026-02-20T10:00:00.000Z",
    });

    expect(await appSettingsService.getBaseCurrencyReconciliationState()).toEqual({
      targetBaseCurrency: "CAD",
      status: "pending",
      changedAt: "2026-02-20T10:00:00.000Z",
    });
  });

  it("falls back to null for invalid base currency reconciliation payload", async () => {
    await appSettingsService.setAppSetting("baseCurrencyReconciliationState", {
      targetBaseCurrency: "cad",
      status: "pending",
      changedAt: "not-a-date",
    });

    expect(await appSettingsService.getBaseCurrencyReconciliationState()).toBeNull();
  });

  it("skips writes when reconciliation state is unchanged", async () => {
    const state = {
      targetBaseCurrency: "CAD",
      status: "pending" as const,
      changedAt: "2026-02-20T10:00:00.000Z",
    };

    await appSettingsService.setBaseCurrencyReconciliationState(state);
    const initialRow = await databaseService.prismaClient.appSetting.findUnique({
      where: { key: "baseCurrencyReconciliationState" },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    await appSettingsService.setBaseCurrencyReconciliationState(state);

    const afterRow = await databaseService.prismaClient.appSetting.findUnique({
      where: { key: "baseCurrencyReconciliationState" },
    });

    expect(initialRow?.updatedAt).toEqual(afterRow?.updatedAt);
  });

  it("marks reconciliation pending when base currency changes", async () => {
    await appSettingsService.setBaseCurrency("USD");

    expect(await appSettingsService.getBaseCurrency()).toBe("USD");
    expect(await appSettingsService.getBaseCurrencyReconciliationState()).toEqual(
      expect.objectContaining({
        targetBaseCurrency: "USD",
        status: "pending",
      })
    );
  });

  it("does not re-open pending state or reset timestamps when base currency is unchanged", async () => {
    const existingState = {
      targetBaseCurrency: "CAD",
      status: "resolved" as const,
      changedAt: "2026-02-20T10:00:00.000Z",
      resolvedAt: "2026-02-20T10:05:00.000Z",
    };

    await appSettingsService.setAppSetting("baseCurrency", "CAD");
    await appSettingsService.setBaseCurrencyReconciliationState(existingState);

    await appSettingsService.setBaseCurrency("CAD");

    expect(await appSettingsService.getBaseCurrencyReconciliationState()).toEqual(existingState);
  });

  it("does not mutate account or journal data when changing base currency", async () => {
    const [accountsBefore, linesBefore] = await Promise.all([
      databaseService.prismaClient.account.count(),
      databaseService.prismaClient.journalLine.count(),
    ]);

    await appSettingsService.setBaseCurrency("CAD");

    const [accountsAfter, linesAfter] = await Promise.all([
      databaseService.prismaClient.account.count(),
      databaseService.prismaClient.journalLine.count(),
    ]);

    expect(accountsAfter).toBe(accountsBefore);
    expect(linesAfter).toBe(linesBefore);
  });
});
