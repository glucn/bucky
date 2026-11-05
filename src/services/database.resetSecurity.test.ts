import { expect, it, vi } from "vitest";
import { databaseService } from "./database";

it.each(["data", "factory"] as const)("refuses %s reset at the service boundary for a personal database", async (mode) => {
  const prisma = databaseService.prismaClient;
  const transaction = vi.fn().mockResolvedValue(undefined);
  Reflect.set(databaseService, "prisma", { $transaction: transaction });
  const previous = Reflect.get(databaseService, "personalDatabase");
  Reflect.set(databaseService, "personalDatabase", true);
  try {
    await expect(databaseService.resetAllData({ mode })).rejects.toThrow(/personal/i);
    expect(transaction).not.toHaveBeenCalled();
  } finally {
    Reflect.set(databaseService, "personalDatabase", previous);
    Reflect.set(databaseService, "prisma", prisma);
  }
});
