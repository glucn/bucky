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
});
