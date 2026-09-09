import { beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { randomBytes } from "crypto";
import { databaseService } from "./database";

let directory: string | undefined;
beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-encrypted-suite-"));
  const key = randomBytes(32);
  try {
    await databaseService.openEncryptedDatabase(path.join(directory, "book.sqlite"), path.resolve("prisma/migrations"), key);
    await databaseService.resetAllData();
  } finally { key.fill(0); }
});

afterAll(async () => {
  await databaseService.disconnect();
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});
