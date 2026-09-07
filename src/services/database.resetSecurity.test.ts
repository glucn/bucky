import { expect, it, vi } from "vitest";
import { databaseService } from "./database";

it("refuses destructive reset at the service boundary for a personal database", async () => {
  const prisma = databaseService.prismaClient;
  const transaction = vi.fn().mockResolvedValue(undefined);
  Reflect.set(databaseService, "prisma", { $transaction: transaction });
  const previous = Reflect.get(databaseService, "personalDatabase");
  Reflect.set(databaseService, "personalDatabase", true);
  try {
    await expect(databaseService.resetAllData()).rejects.toThrow(/personal/i);
    expect(transaction).not.toHaveBeenCalled();
  } finally {
    Reflect.set(databaseService, "personalDatabase", previous);
    Reflect.set(databaseService, "prisma", prisma);
  }
});
