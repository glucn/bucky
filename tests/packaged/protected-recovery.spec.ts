import { test, expect } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup } from "../../src/services/protectedProfiles";

test("packaged encrypted recovery is available before unlock and backup is available after authentication", async () => {
  const app = await personalAppHarness();
  const passphrase = "Synthetic recovery navigation passphrase";
  try {
    const setup = new ProtectedProfileSetup(app.directory, path.resolve("prisma/migrations"));
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase });
    await setup.confirm(pending.setupId, pending.recoverySecret);
    const page = await app.launch();
    await page.getByRole("button", { name: "Encrypted backup recovery" }).click();
    await expect(page.getByTestId("protected-recovery-page")).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose encrypted backup and verify" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create encrypted backup" })).toHaveCount(0);
    expect(await page.evaluate(async () => {
      try { await (window as any).electron.ipcRenderer.invoke("get-accounts"); return "unexpected success"; }
      catch (error) { return String(error); }
    })).toMatch(/locked/i);
    await expect(page.getByText(/Current profile:/)).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("locked-recovery.png") });
    await page.getByRole("button", { name: "Back to unlock" }).click();
    await page.getByLabel("Authentication method").selectOption("passphrase");
    await page.getByLabel("Passphrase", { exact: true }).fill(passphrase);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await page.getByRole("link", { name: "Backup & recovery" }).click();
    await expect(page.getByRole("button", { name: "Create encrypted backup" })).toBeVisible();
    await expect(page.getByText(/Current profile:/)).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("unlocked-recovery.png") });
    await app.stop();
  } catch (error) {
    await test.info().attach("packaged-recovery.log", { body: app.output(), contentType: "text/plain" });
    throw error;
  } finally { await app.dispose(); }
});
