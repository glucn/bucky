import { test, expect } from "@playwright/test";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

test("shipped encrypted dependencies work in Electron without checkout dependency fallback", async () => {
  const { stdout } = await promisify(execFile)(
    path.resolve("node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"),
    [path.resolve("scripts/security/packaged-encrypted-runtime.cjs")],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, timeout: 30_000 },
  );
  expect(stdout).toContain("no host dependency fallback passed");
});
