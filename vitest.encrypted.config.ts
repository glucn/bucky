import { defineConfig } from "vitest/config";
import base from "./vitest.config";

export default defineConfig({
  ...base,
  test: { ...base.test, setupFiles: ["./src/services/database.encrypted.test.setup.ts"] },
});
