import { beforeEach, describe, expect, it } from "vitest";
import { AccountSubtype, AccountType } from "../shared/accountTypes";
import { databaseService } from "./database";

describe("database base-currency defaults", () => {
  beforeEach(async () => {
    await databaseService.resetAllData();
  });

  it("uses configured base currency when creating account without explicit currency", async () => {
    await databaseService.prismaClient.appSetting.upsert({
      where: { key: "baseCurrency" },
      create: { key: "baseCurrency", jsonValue: JSON.stringify("CAD") },
      update: { jsonValue: JSON.stringify("CAD") },
    });

    const account = await databaseService.createAccount({
      name: "Test account",
      type: AccountType.User,
      subtype: AccountSubtype.Asset,
    });

    expect(account.currency).toBe("CAD");
  });

  it("uses configured base currency for seed/default account creation", async () => {
    await databaseService.prismaClient.account.deleteMany();
    await databaseService.prismaClient.accountGroup.deleteMany();
    await databaseService.prismaClient.appSetting.upsert({
      where: { key: "baseCurrency" },
      create: { key: "baseCurrency", jsonValue: JSON.stringify("CAD") },
      update: { jsonValue: JSON.stringify("CAD") },
    });

    await databaseService.ensureDefaultAccounts();

    const cash = await databaseService.prismaClient.account.findFirst({
      where: { name: "Cash", type: AccountType.User },
    });
    const openingBalances = await databaseService.prismaClient.account.findFirst({
      where: { name: "Opening Balances", type: AccountType.System },
    });

    expect(cash?.currency).toBe("CAD");
    expect(openingBalances?.currency).toBe("CAD");
  });

  it("falls back to USD when base currency is not configured", async () => {
    await databaseService.prismaClient.appSetting.deleteMany({ where: { key: "baseCurrency" } });

    const account = await databaseService.createAccount({
      name: "Fallback currency account",
      type: AccountType.User,
      subtype: AccountSubtype.Asset,
    });

    expect(account.currency).toBe("USD");
  });

  it("preserves base currency on reset when requested", async () => {
    await databaseService.prismaClient.appSetting.upsert({
      where: { key: "baseCurrency" },
      create: { key: "baseCurrency", jsonValue: JSON.stringify("CAD") },
      update: { jsonValue: JSON.stringify("CAD") },
    });

    await databaseService.resetAllData({ preserveBaseCurrency: true });

    const cash = await databaseService.prismaClient.account.findFirst({
      where: { name: "Cash", type: AccountType.User },
    });

    expect(cash?.currency).toBe("CAD");
  });
});
