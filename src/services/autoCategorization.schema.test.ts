import { beforeEach, describe, expect, it } from "vitest";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";

describe("auto-categorization schema", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("creates AutoCategorizationRule table", async () => {
    const rows = await databaseService.prismaClient.$queryRaw<Array<{ name: string }>>`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'AutoCategorizationRule'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("AutoCategorizationRule");
  });
});
