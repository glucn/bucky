import { beforeEach, describe, expect, it } from "vitest";
import { autoCategorizationService } from "./autoCategorizationService";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";

describe("auto-categorization rule management", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("rejects updates that would create duplicate pattern and match type", async () => {
    const accounts = await databaseService.getAccounts(true);
    const groceries = accounts.find((account) => account.name === "Groceries");
    const diningOut = accounts.find((account) => account.name === "Dining Out");

    expect(groceries).toBeDefined();
    expect(diningOut).toBeDefined();

    const existing = await databaseService.prismaClient.autoCategorizationRule.create({
      data: {
        normalizedPattern: "coffee bean dt vancouver",
        matchType: "exact",
        targetCategoryAccountId: groceries!.id,
      },
    });

    const toUpdate = await databaseService.prismaClient.autoCategorizationRule.create({
      data: {
        normalizedPattern: "other merchant",
        matchType: "exact",
        targetCategoryAccountId: diningOut!.id,
      },
    });

    await expect(
      autoCategorizationService.updateRule(
        toUpdate.id,
        {
          pattern: existing.normalizedPattern,
          matchType: "exact",
          targetCategoryAccountId: diningOut!.id,
        },
        databaseService.prismaClient
      )
    ).rejects.toThrow("Rule with same pattern and match type already exists");
  });

  it("rejects updates that target non-category or archived accounts", async () => {
    const accounts = await databaseService.getAccounts(true);
    const groceries = accounts.find((account) => account.name === "Groceries");
    const cash = accounts.find((account) => account.name === "Cash");

    expect(groceries).toBeDefined();
    expect(cash).toBeDefined();

    const rule = await databaseService.prismaClient.autoCategorizationRule.create({
      data: {
        normalizedPattern: "coffee bean dt vancouver",
        matchType: "exact",
        targetCategoryAccountId: groceries!.id,
      },
    });

    await expect(
      autoCategorizationService.updateRule(
        rule.id,
        {
          pattern: "coffee bean dt vancouver",
          matchType: "exact",
          targetCategoryAccountId: cash!.id,
        },
        databaseService.prismaClient
      )
    ).rejects.toThrow("Target category must be an active category account");
  });
});
